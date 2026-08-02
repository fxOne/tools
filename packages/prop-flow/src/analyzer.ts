import type * as TS from 'typescript';
import { defaultedBindingNames, isExported, unwrapToFn } from './ast.js';
import { createClassifier } from './classify.js';
import { createComponentFactory } from './component.js';
import type { Component } from './component.js';
import { locOf } from './paths.js';
import type { OptionalProp, PropAnalysis, Site, Verdict } from './types.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface AnalyzerOptions {
  /** Paths in the output are printed relative to this directory. */
  readonly cwd: string;
  readonly program: TS.Program;
  readonly ts: TypeScriptApi;
}

export interface Analyzer {
  /** Walk every call site of `component` and classify how `propName` is fed. */
  analyse(component: Component, propName: string): PropAnalysis;
  /** Components exported from `sourceFile` that take a props parameter. */
  findComponents(sourceFile: TS.SourceFile): Component[];
  listOptionalProps(component: Component): OptionalProp[];
}

export function createAnalyzer({ cwd, program, ts }: AnalyzerOptions): Analyzer {
  const checker = program.getTypeChecker();
  const components = createComponentFactory({ checker, ts });
  const classifier = createClassifier({ checker, components, ts });

  // Symbol identity. Symbols are not primitives, so a Map keyed by symbol
  // works — but the index is keyed by a plain id to keep it printable.
  const symbolIds = new WeakMap<TS.Symbol, number>();
  let nextSymbolId = 1;

  // Every JSX usage in the Program, indexed once: component symbol → call
  // sites, plus the symbols that are CALLED rather than rendered. Building
  // this eagerly costs one walk and saves one per prop.
  const { calledIds, usageIndex } = indexProgram();

  return { analyse, findComponents, listOptionalProps };

  // ── core analysis ─────────────────────────────────────────────────────────

  function analyse(component: Component, propName: string, visited = new Set<string>()): PropAnalysis {
    const key = `${symbolId(component.symbol)}#${propName}`;
    if (visited.has(key)) {
      // A cycle in the pass-through graph. The first visit already counted
      // this subtree, so the repeat contributes nothing.
      return { ambiguous: 0, omit: 0, real: 0, sites: [], verdict: 'cycle' };
    }
    visited.add(key);

    const usages = usageIndex.get(symbolId(component.symbol)) ?? [];
    const sites: Site[] = [];
    let real = 0;
    let omit = 0;
    let ambiguous = 0;

    for (const el of usages) {
      const classified = classifier.classifyElement(el, propName);
      if (classified.kind === 'passthrough') {
        // The value is the enclosing component's own prop — climb.
        const sub = analyse(classified.component, classified.prop, visited);
        if (sub.verdict === 'unused-component' && calledIds.has(symbolId(classified.component.symbol))) {
          // The climb landed on a plain function taking an options object —
          // a test helper, say. It has callers, they just are not JSX, so the
          // walk cannot see them. Counting the empty subtree would turn an
          // invisible pass into a caller-dead: "delete the prop" on live code.
          ambiguous += 1;
          const via = `${classified.component.name}.${classified.prop}`;
          sites.push({ kind: 'manual', loc: locOf(el, cwd), note: `${via}: called, never rendered as JSX` });
          continue;
        }
        real += sub.real;
        omit += sub.omit;
        ambiguous += sub.ambiguous;
        sites.push({
          kind: 'passthrough',
          loc: locOf(el, cwd),
          via: `${classified.component.name}.${classified.prop}`,
        });
      } else if (classified.kind === 'real') {
        real += 1;
        sites.push({ kind: 'real', loc: locOf(el, cwd), note: classified.note });
      } else if (classified.kind === 'omit') {
        omit += 1;
        sites.push({ kind: 'omit', loc: locOf(el, cwd), note: classified.note });
      } else {
        ambiguous += 1;
        sites.push({ kind: 'manual', loc: locOf(el, cwd), note: classified.note });
      }
    }

    return { ambiguous, omit, real, sites, verdict: verdictOf(usages.length, real, omit, ambiguous) };
  }

  // ── component + prop discovery ────────────────────────────────────────────

  function findComponents(sourceFile: TS.SourceFile): Component[] {
    const out: Component[] = [];
    for (const stmt of sourceFile.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(ts, stmt)) {
        push(out, components.fromNode(stmt, stmt.name));
      } else if (ts.isVariableStatement(stmt) && isExported(ts, stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) {
            continue;
          }
          const fn = unwrapToFn(ts, decl.initializer);
          if (fn) {
            push(out, components.fromNode(fn, decl.name));
          }
        }
      } else if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause) {
        // Declared first, exported later: `export { Card, Inner as Public }`.
        if (ts.isNamedExports(stmt.exportClause)) {
          for (const element of stmt.exportClause.elements) {
            push(out, components.fromExport(element));
          }
        }
      }
    }
    return out;
  }

  function listOptionalProps(component: Component): OptionalProp[] {
    const type = checker.getTypeAtLocation(component.paramNode);
    const defaults = defaultedBindingNames(ts, component.paramNode);
    const out: OptionalProp[] = [];
    for (const sym of type.getProperties()) {
      if ((sym.getFlags() & ts.SymbolFlags.Optional) !== 0 && !isVendored(sym)) {
        out.push({ hasDefault: defaults.has(sym.getName()), name: sym.getName() });
      }
    }
    return out;
  }

  /**
   * Whether the prop is declared only in a dependency. A component spreading
   * `React.ComponentProps<'button'>` inherits some 250 optional DOM and ARIA
   * props; a verdict on those is true but useless — the `?` is not the
   * author's to drop, and it drowns the props that are.
   */
  function isVendored(sym: TS.Symbol): boolean {
    const declarations = sym.getDeclarations() ?? [];
    return (
      declarations.length > 0 &&
      declarations.every((declaration) => program.isSourceFileFromExternalLibrary(declaration.getSourceFile()))
    );
  }

  // ── JSX usage index ───────────────────────────────────────────────────────

  function indexProgram(): { calledIds: Set<number>; usageIndex: Map<number, TS.JsxOpeningLikeElement[]> } {
    const calledIds = new Set<number>();
    const usageIndex = new Map<number, TS.JsxOpeningLikeElement[]>();
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('/node_modules/')) {
        continue;
      }
      const visit = (node: TS.Node): void => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const sym = jsxTagSymbol(node.tagName);
          if (sym) {
            const id = symbolId(sym);
            const list = usageIndex.get(id);
            if (list) {
              list.push(node);
            } else {
              usageIndex.set(id, [node]);
            }
          }
        } else if (ts.isCallExpression(node)) {
          const sym = checker.getSymbolAtLocation(node.expression);
          if (sym) {
            calledIds.add(symbolId(components.resolveAlias(sym)));
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    return { calledIds, usageIndex };
  }

  function jsxTagSymbol(tagName: TS.JsxTagNameExpression): TS.Symbol | null {
    // Intrinsics (<div/>) have no symbol; <Ns.Foo/> resolves on the property.
    const sym = checker.getSymbolAtLocation(tagName);
    return sym ? components.resolveAlias(sym) : null;
  }

  function symbolId(sym: TS.Symbol): number {
    let id = symbolIds.get(sym);
    if (id === undefined) {
      id = nextSymbolId;
      nextSymbolId += 1;
      symbolIds.set(sym, id);
    }
    return id;
  }
}

export function verdictOf(usageCount: number, real: number, omit: number, ambiguous: number): Verdict {
  if (usageCount === 0) {
    return 'unused-component';
  }
  if (ambiguous > 0) {
    return 'manual';
  }
  if (real > 0 && omit > 0) {
    return 'justified';
  }
  if (real > 0) {
    return 'unnecessary-optional';
  }
  if (omit > 0) {
    return 'caller-dead';
  }
  return 'manual';
}

function push<T>(out: T[], value: T | null): void {
  if (value) {
    out.push(value);
  }
}
