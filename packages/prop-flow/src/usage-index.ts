import type * as TS from 'typescript';
import type { ComponentFactory } from './component.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface UsageIndexOptions {
  readonly checker: TS.TypeChecker;
  readonly components: ComponentFactory;
  readonly program: TS.Program;
  readonly ts: TypeScriptApi;
}

export interface UsageIndex {
  /**
   * Whether `sym` is ever called as a plain function. Such a symbol has live
   * callers this index cannot see, so an empty `usagesOf` does not mean dead.
   */
  isCalled(sym: TS.Symbol): boolean;
  /**
   * A stable number for `sym`. Symbols are objects, so a Map would key on them
   * directly — the id exists because it is printable, which the caches and the
   * cycle guard built on top of it both want.
   */
  symbolId(sym: TS.Symbol): number;
  /** Every JSX element rendering `sym`, in Program order. */
  usagesOf(sym: TS.Symbol): readonly TS.JsxOpeningLikeElement[];
}

/**
 * Every JSX usage in the Program, indexed in one walk: component symbol → call
 * sites, plus the symbols that are CALLED rather than rendered. Building this
 * eagerly costs one traversal and saves one per prop analysed.
 *
 * Import aliases are resolved on the way in, so `<Public/>` and the `Aliased`
 * it was exported as land on the same entry.
 */
export function createUsageIndex({ checker, components, program, ts }: UsageIndexOptions): UsageIndex {
  // Symbols are not primitives, so a WeakMap keyed by symbol is the identity
  // map; the id it hands out is what everything downstream keys on.
  const symbolIds = new WeakMap<TS.Symbol, number>();
  let nextSymbolId = 1;

  const calledIds = new Set<number>();
  const usagesById = new Map<number, TS.JsxOpeningLikeElement[]>();

  for (const sourceFile of program.getSourceFiles()) {
    // Declarations and dependencies hold no call site this analysis owns.
    if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('/node_modules/')) {
      visit(sourceFile);
    }
  }

  return { isCalled, symbolId, usagesOf };

  function isCalled(sym: TS.Symbol): boolean {
    return calledIds.has(symbolId(sym));
  }

  function usagesOf(sym: TS.Symbol): readonly TS.JsxOpeningLikeElement[] {
    return usagesById.get(symbolId(sym)) ?? [];
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

  function visit(node: TS.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      recordUsage(node);
    } else if (ts.isCallExpression(node)) {
      recordCall(node);
    }
    ts.forEachChild(node, visit);
  }

  function recordUsage(node: TS.JsxOpeningLikeElement): void {
    // Intrinsics (<div/>) have no symbol; <Ns.Foo/> resolves on the property.
    const sym = checker.getSymbolAtLocation(node.tagName);
    if (!sym) {
      return;
    }
    const id = symbolId(components.resolveAlias(sym));
    const list = usagesById.get(id) ?? [];
    list.push(node);
    usagesById.set(id, list);
  }

  function recordCall(node: TS.CallExpression): void {
    const sym = checker.getSymbolAtLocation(node.expression);
    if (sym) {
      calledIds.add(symbolId(components.resolveAlias(sym)));
    }
  }
}
