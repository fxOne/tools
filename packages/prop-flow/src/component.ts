import type * as TS from 'typescript';
import { bindingNameOfFn, unwrapToFn } from './ast.js';
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
  /** Resolve an `export { X }` specifier back to the function it names. */
  fromExport(element: TS.ExportSpecifier): Component | null;
  /** Rebuild a component descriptor from the function alone. */
  fromFn(fn: ComponentFn): Component | null;
  /** Describe the component `fn`, named by `nameNode`. */
  fromNode(fn: ComponentFn, nameNode: TS.Identifier): Component | null;
  /** Follow an import alias to the symbol it ultimately names. */
  resolveAlias(sym: TS.Symbol): TS.Symbol;
}

/**
 * Turns functions and export specifiers into `Component` descriptors. The
 * checker is needed for symbol identity, which is what the usage index and the
 * cycle guard key on.
 */
export function createComponentFactory({ checker, ts }: ComponentFactoryOptions): ComponentFactory {
  return { fromExport, fromFn, fromNode, resolveAlias };

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
      const fn = unwrapToFn(ts, declaration.initializer);
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
}
