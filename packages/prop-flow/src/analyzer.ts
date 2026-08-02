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

/** What one JSX call site adds to the analysis of a prop. */
interface Contribution {
  readonly ambiguous: number;
  readonly omit: number;
  readonly real: number;
  readonly site: Site;
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
      const contribution = contributionOf(el, propName, visited);
      real += contribution.real;
      omit += contribution.omit;
      ambiguous += contribution.ambiguous;
      sites.push(contribution.site);
    }

    return { ambiguous, omit, real, sites, verdict: verdictOf(usages.length, real, omit, ambiguous) };
  }

  /** Classify one call site, expanding a pass-through into what it bottoms out in. */
  function contributionOf(el: TS.JsxOpeningLikeElement, propName: string, visited: Set<string>): Contribution {
    const classified = classifier.classifyElement(el, propName);
    if (classified.kind === 'real') {
      return { ambiguous: 0, omit: 0, real: 1, site: { kind: 'real', loc: locOf(el, cwd), note: classified.note } };
    }
    if (classified.kind === 'omit') {
      return { ambiguous: 0, omit: 1, real: 0, site: { kind: 'omit', loc: locOf(el, cwd), note: classified.note } };
    }
    if (classified.kind === 'manual') {
      return { ambiguous: 1, omit: 0, real: 0, site: { kind: 'manual', loc: locOf(el, cwd), note: classified.note } };
    }

    // The value is the enclosing component's own prop — climb.
    const sub = analyse(classified.component, classified.prop, visited);
    if (sub.verdict === 'unused-component' && calledIds.has(symbolId(classified.component.symbol))) {
      // The climb landed on a plain function taking an options object — a test
      // helper, say. It has callers, they just are not JSX, so the walk cannot
      // see them. Counting the empty subtree would turn an invisible pass into
      // a caller-dead: "delete the prop" on live code.
      return {
        ambiguous: 1,
        omit: 0,
        real: 0,
        site: {
          kind: 'manual',
          loc: locOf(el, cwd),
          note: `${classified.component.name}.${classified.prop}: called, never rendered as JSX`,
        },
      };
    }
    return {
      ambiguous: sub.ambiguous,
      omit: sub.omit,
      real: sub.real,
      site: {
        kind: 'passthrough',
        loc: locOf(el, cwd),
        via: `${classified.component.name}.${classified.prop}`,
      },
    };
  }

  // ── component + prop discovery ────────────────────────────────────────────

  function findComponents(sourceFile: TS.SourceFile): Component[] {
    return sourceFile.statements.flatMap((stmt) => componentsOfStatement(stmt));
  }

  /** The components one top-level statement declares or exports. */
  function componentsOfStatement(stmt: TS.Statement): Component[] {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(ts, stmt)) {
      return compact([components.fromNode(stmt, stmt.name)]);
    }
    if (ts.isVariableStatement(stmt) && isExported(ts, stmt)) {
      return compact(stmt.declarationList.declarations.map((decl) => componentOfDeclaration(decl)));
    }
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier) {
      const clause = stmt.exportClause;
      // Declared first, exported later: `export { Card, Inner as Public }`.
      if (clause && ts.isNamedExports(clause)) {
        return compact(clause.elements.map((element) => components.fromExport(element)));
      }
    }
    return [];
  }

  /** The component `export const C = memo(() => …)` binds, if it binds one. */
  function componentOfDeclaration(decl: TS.VariableDeclaration): Component | null {
    if (!ts.isIdentifier(decl.name) || !decl.initializer) {
      return null;
    }
    const fn = unwrapToFn(ts, decl.initializer);
    return fn ? components.fromNode(fn, decl.name) : null;
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
    const visit = (node: TS.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const sym = jsxTagSymbol(node.tagName);
        if (sym) {
          const id = symbolId(sym);
          const list = usageIndex.get(id) ?? [];
          list.push(node);
          usageIndex.set(id, list);
        }
      } else if (ts.isCallExpression(node)) {
        const sym = checker.getSymbolAtLocation(node.expression);
        if (sym) {
          calledIds.add(symbolId(components.resolveAlias(sym)));
        }
      }
      ts.forEachChild(node, visit);
    };

    for (const sourceFile of program.getSourceFiles()) {
      // Declarations and dependencies hold no call site this analysis owns.
      if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('/node_modules/')) {
        visit(sourceFile);
      }
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

function compact<T>(values: readonly (T | null)[]): T[] {
  return values.filter((value) => value !== null);
}
