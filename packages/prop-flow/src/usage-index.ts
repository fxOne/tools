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
   * A stable number for the component `sym` names. Symbols are objects, so a
   * Map would key on them directly — the id exists because it is printable,
   * which the caches and the cycle guard built on top of it both want.
   *
   * Two names for ONE component share an id: `export const Card =
   * memo(CardComponent)` is rendered as `Card` and climbed into as
   * `CardComponent`, and a walk that filed those apart would find no call site
   * on the way up — a live prop reported `caller-dead`.
   */
  symbolId(sym: TS.Symbol): number;
  /** Every JSX element rendering `sym`, in Program order. */
  usagesOf(sym: TS.Symbol): readonly TS.JsxOpeningLikeElement[];
}

/**
 * Every JSX usage in the Program, indexed in one walk: component → call sites,
 * plus the components that are CALLED rather than rendered. Building this
 * eagerly costs one traversal and saves one per prop analysed.
 *
 * Both ways a component can wear a second name are resolved on the way in:
 * `<Public/>` and the `Aliased` it was exported as land on the same entry, and
 * so do `<Card/>` and the function its `memo()` wraps.
 */
export function createUsageIndex({ checker, components, program, ts }: UsageIndexOptions): UsageIndex {
  // Neither symbols nor functions are primitives, so a WeakMap keyed by the
  // thing itself is the identity map; the id it hands out is what everything
  // downstream keys on. One map for both kinds of key, so that one counter
  // cannot hand the same number to a symbol and to a function.
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  // What each symbol resolved to, memoised: `symbolId` runs on every JSX tag
  // and every callee in the Program, and peeling a wrapper is not free.
  const keys = new WeakMap<TS.Symbol, object>();

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
    return idOf(keyOf(sym));
  }

  /**
   * What a symbol's usages are filed under: the component function it names,
   * so a wrapper binding and the function inside it meet on one entry. A symbol
   * naming no function — an intrinsic-like tag, a namespace member — keys on
   * itself, which is the identity it had before.
   */
  function keyOf(sym: TS.Symbol): object {
    const known = keys.get(sym);
    if (known) {
      return known;
    }
    const resolved = components.resolveAlias(sym);
    const key: object = components.fnOfSymbol(resolved) ?? resolved;
    keys.set(sym, key);
    return key;
  }

  function idOf(key: object): number {
    let id = ids.get(key);
    if (id === undefined) {
      id = nextId;
      nextId += 1;
      ids.set(key, id);
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
    const id = symbolId(sym);
    const list = usagesById.get(id) ?? [];
    list.push(node);
    usagesById.set(id, list);
  }

  function recordCall(node: TS.CallExpression): void {
    const sym = checker.getSymbolAtLocation(node.expression);
    if (sym) {
      calledIds.add(symbolId(sym));
    }
  }
}
