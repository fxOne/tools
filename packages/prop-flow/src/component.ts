import type * as TS from 'typescript';
import { bindingNameOfFn, fnOfDeclaration, unwrapToFn } from './ast.js';
import type { ComponentFn } from './ast.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface Component {
  readonly fn: ComponentFn;
  readonly name: string;
  readonly paramNode: TS.ParameterDeclaration;
  readonly symbol: TS.Symbol;
}

export interface ComponentFactoryOptions {
  readonly checker: TS.TypeChecker;
  readonly ts: TypeScriptApi;
}

export interface ComponentFactory {
  /**
   * The component function a symbol ultimately names, wrappers peeled. The one
   * thing two names for one component — `Card` and the `CardComponent` its
   * `memo()` wraps — have in common, and so the identity to key on.
   */
  fnOfSymbol(sym: TS.Symbol): ComponentFn | null;
  /** Resolve an `export { X }` specifier back to the function it names. */
  fromExport(element: TS.ExportSpecifier): Component | null;
  /** Rebuild a component descriptor from the function alone. */
  fromFn(fn: ComponentFn): Component | null;
  /** Describe the component `fn`, named by `nameNode`. */
  fromNode(fn: ComponentFn, nameNode: TS.Identifier): Component | null;
  /** Follow an import alias to the symbol it ultimately names. */
  resolveAlias(sym: TS.Symbol): TS.Symbol;
  /** Peel `memo(Inner)` and friends, following a name to what it declares. */
  unwrap(expr: TS.Expression): ComponentFn | null;
}

/**
 * Turns functions and export specifiers into `Component` descriptors. The
 * checker is needed for symbol identity, which is what the usage index and the
 * cycle guard key on.
 */
export function createComponentFactory({ checker, ts }: ComponentFactoryOptions): ComponentFactory {
  return { fnOfSymbol, fromExport, fromFn, fromNode, resolveAlias, unwrap };

  function fnOfSymbol(sym: TS.Symbol): ComponentFn | null {
    return fnOfDeclaration(ts, declarationOf(resolveAlias(sym)), resolveIdentifier);
  }

  function unwrap(expr: TS.Expression): ComponentFn | null {
    return unwrapToFn(ts, expr, resolveIdentifier);
  }

  function fromExport(element: TS.ExportSpecifier): Component | null {
    const exported = checker.getSymbolAtLocation(element.propertyName ?? element.name);
    const declaration = exported && resolveAlias(exported).declarations?.[0];
    if (!declaration) {
      return null;
    }
    if (ts.isFunctionDeclaration(declaration) && declaration.name) {
      return fromNode(declaration, declaration.name);
    }
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer) {
      const fn = unwrap(declaration.initializer);
      return fn ? fromNode(fn, declaration.name) : null;
    }
    return null;
  }

  function fromFn(fn: ComponentFn): Component | null {
    const nameNode = bindingNameOfFn(ts, fn);
    return nameNode ? fromNode(fn, nameNode) : null;
  }

  function fromNode(fn: ComponentFn, nameNode: TS.Identifier): Component | null {
    const paramNode = fn.parameters[0];
    const symbol = checker.getSymbolAtLocation(nameNode);
    if (!paramNode || !symbol) {
      return null;
    }
    return { fn, name: nameNode.text, paramNode, symbol: resolveAlias(symbol) };
  }

  function resolveAlias(sym: TS.Symbol): TS.Symbol {
    return (sym.getFlags() & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(sym) : sym;
  }

  /** What a symbol declares — aliases are the caller's to resolve first. */
  function declarationOf(sym: TS.Symbol): TS.Declaration | null {
    return sym.valueDeclaration ?? sym.declarations?.[0] ?? null;
  }

  function resolveIdentifier(id: TS.Identifier): TS.Declaration | null {
    const sym = checker.getSymbolAtLocation(id);
    return sym ? declarationOf(resolveAlias(sym)) : null;
  }
}
