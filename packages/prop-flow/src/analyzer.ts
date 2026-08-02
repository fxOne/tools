import type * as TS from 'typescript';
import {
  bindingKey,
  bindingNameOfFn,
  defaultedBindingNames,
  enclosingComponentFn,
  findAttr,
  isExported,
  unwrapToFn,
} from './ast.js';
import type { ComponentFn } from './ast.js';
import { locOf } from './paths.js';
import type { OptionalProp, PropAnalysis, Site, Verdict } from './types.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface Component {
  readonly fn: ComponentFn;
  readonly name: string;
  readonly paramNode: TS.ParameterDeclaration;
  readonly symbol: TS.Symbol;
}

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

/** The value is the enclosing component's own prop — climb one level up. */
interface Passthrough {
  readonly component: Component;
  readonly kind: 'passthrough';
  readonly prop: string;
}

/** Static analysis cannot decide this one; a human has to look. */
interface Manual {
  readonly kind: 'manual';
  readonly note: string;
}

/** The attribute is written out but carries nothing: `prop={undefined}`. */
interface Omission {
  readonly kind: 'omit';
  readonly note: string;
}

/** A value originates right here. */
interface Real {
  readonly kind: 'real';
  readonly note: string;
}

/** Where a JSX attribute's value comes from. */
type Classification = Manual | Omission | Passthrough | Real;

export function createAnalyzer({ cwd, program, ts }: AnalyzerOptions): Analyzer {
  const checker = program.getTypeChecker();

  // Symbol identity. Symbols are not primitives, so a Map keyed by symbol
  // works — but the index is keyed by a plain id to keep it printable.
  const symbolIds = new WeakMap<TS.Symbol, number>();
  let nextSymbolId = 1;

  // Every JSX usage in the Program, indexed once: component symbol → call
  // sites. Building this eagerly costs one walk and saves one per prop.
  const usageIndex = buildUsageIndex();

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
      const attr = findAttr(ts, el, propName);
      if (attr === 'spread') {
        ambiguous += 1;
        sites.push({ kind: 'spread', loc: locOf(el, cwd) });
        continue;
      }
      if (attr === null) {
        omit += 1;
        sites.push({ kind: 'omit', loc: locOf(el, cwd) });
        continue;
      }

      const classified = classifyAttrValue(attr);
      if (classified.kind === 'passthrough') {
        // The value is the enclosing component's own prop — climb.
        const sub = analyse(classified.component, classified.prop, visited);
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

  function classifyAttrValue(attr: TS.JsxAttribute): Classification {
    const init = attr.initializer;
    // Shorthand boolean: <C flag /> → always a concrete `true`.
    if (init === undefined) {
      return { kind: 'real', note: 'boolean shorthand' };
    }
    if (ts.isStringLiteral(init)) {
      return { kind: 'real', note: 'string literal' };
    }
    if (!ts.isJsxExpression(init) || init.expression === undefined) {
      return { kind: 'manual', note: 'unrecognised attribute form' };
    }
    const expr = init.expression;

    // `prop={undefined}` is an omission dressed up as a pass.
    if (ts.isIdentifier(expr) && expr.text === 'undefined') {
      return { kind: 'omit', note: 'explicit undefined' };
    }

    // Identifier — the enclosing component's own prop (climb) or a local
    // value (a real source).
    if (ts.isIdentifier(expr)) {
      return asEnclosingProp(expr, expr.text) ?? { kind: 'real', note: 'local value' };
    }
    // `props.foo` — climb when `props` is the enclosing props parameter.
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      return asEnclosingProp(expr, expr.name.text, expr.expression.text) ?? { kind: 'real', note: 'member value' };
    }
    // Any other expression (call, object, conditional, JSX, template…) — the
    // value is produced right here. Treat as a real source; a conditional that
    // can yield undefined is the one false positive we accept (conservative:
    // counts as "present").
    return { kind: 'real', note: ts.SyntaxKind[expr.kind] };
  }

  /**
   * If `name` (optionally accessed as `objName.name`) refers to a prop of the
   * component that lexically encloses `node`, describe the pass-through.
   * Returns null when it is a local — i.e. a real source.
   */
  function asEnclosingProp(node: TS.Node, name: string, objName?: string): Classification | null {
    const fn = enclosingComponentFn(ts, node);
    const param = fn?.parameters[0];
    if (!fn || !param) {
      return null;
    }
    const component = componentOfFn(fn);
    if (!component) {
      return null;
    }

    // Destructured props: function C({ foo, bar: baz }: Props)
    if (ts.isObjectBindingPattern(param.name)) {
      if (objName) {
        // `props.x` while props are destructured → not the parameter. Local.
        return null;
      }
      for (const element of param.name.elements) {
        if (!ts.isIdentifier(element.name) || element.name.text !== name) {
          continue;
        }
        if (element.dotDotDotToken) {
          return { kind: 'manual', note: 'rest element in props destructure' };
        }
        return { component, kind: 'passthrough', prop: bindingKey(ts, element) ?? name };
      }
      return null;
    }

    // Whole-object parameter: function C(props: Props) … used as props.x
    if (ts.isIdentifier(param.name) && objName === param.name.text) {
      return { component, kind: 'passthrough', prop: name };
    }
    return null;
  }

  // ── component + prop discovery ────────────────────────────────────────────

  function findComponents(sourceFile: TS.SourceFile): Component[] {
    const out: Component[] = [];
    for (const stmt of sourceFile.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(ts, stmt)) {
        push(out, componentFrom(stmt, stmt.name));
      } else if (ts.isVariableStatement(stmt) && isExported(ts, stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) {
            continue;
          }
          const fn = unwrapToFn(ts, decl.initializer);
          if (fn) {
            push(out, componentFrom(fn, decl.name));
          }
        }
      } else if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause) {
        // Declared first, exported later: `export { Card, Inner as Public }`.
        if (ts.isNamedExports(stmt.exportClause)) {
          for (const element of stmt.exportClause.elements) {
            push(out, componentFromExport(element));
          }
        }
      }
    }
    return out;
  }

  /** Resolve an `export { X }` specifier back to the function it names. */
  function componentFromExport(element: TS.ExportSpecifier): Component | null {
    const exported = checker.getSymbolAtLocation(element.propertyName ?? element.name);
    const declaration = exported && resolveAlias(exported).declarations?.[0];
    if (!declaration) {
      return null;
    }
    if (ts.isFunctionDeclaration(declaration) && declaration.name) {
      return componentFrom(declaration, declaration.name);
    }
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer) {
      const fn = unwrapToFn(ts, declaration.initializer);
      return fn ? componentFrom(fn, declaration.name) : null;
    }
    return null;
  }

  function listOptionalProps(component: Component): OptionalProp[] {
    const type = checker.getTypeAtLocation(component.paramNode);
    const defaults = defaultedBindingNames(ts, component.paramNode);
    const out: OptionalProp[] = [];
    for (const sym of type.getProperties()) {
      if ((sym.getFlags() & ts.SymbolFlags.Optional) !== 0) {
        out.push({ hasDefault: defaults.has(sym.getName()), name: sym.getName() });
      }
    }
    return out;
  }

  function componentFrom(fn: ComponentFn, nameNode: TS.Identifier): Component | null {
    const paramNode = fn.parameters[0];
    const symbol = checker.getSymbolAtLocation(nameNode);
    if (!paramNode || !symbol) {
      return null;
    }
    return { fn, name: nameNode.text, paramNode, symbol: resolveAlias(symbol) };
  }

  /** Rebuild a component descriptor from the function alone. */
  function componentOfFn(fn: ComponentFn): Component | null {
    const nameNode = bindingNameOfFn(ts, fn);
    return nameNode ? componentFrom(fn, nameNode) : null;
  }

  // ── JSX usage index ───────────────────────────────────────────────────────

  function buildUsageIndex(): Map<number, TS.JsxOpeningLikeElement[]> {
    const index = new Map<number, TS.JsxOpeningLikeElement[]>();
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('/node_modules/')) {
        continue;
      }
      const visit = (node: TS.Node): void => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const sym = jsxTagSymbol(node.tagName);
          if (sym) {
            const id = symbolId(sym);
            const list = index.get(id);
            if (list) {
              list.push(node);
            } else {
              index.set(id, [node]);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    return index;
  }

  function jsxTagSymbol(tagName: TS.JsxTagNameExpression): TS.Symbol | null {
    // Intrinsics (<div/>) have no symbol; <Ns.Foo/> resolves on the property.
    const sym = checker.getSymbolAtLocation(tagName);
    return sym ? resolveAlias(sym) : null;
  }

  function resolveAlias(sym: TS.Symbol): TS.Symbol {
    return (sym.getFlags() & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(sym) : sym;
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
