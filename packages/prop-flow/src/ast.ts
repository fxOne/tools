import type * as TS from 'typescript';
import type { TypeScriptApi } from './typescript-api.js';

/** Every function shape that can back a component. */
export type ComponentFn = TS.ArrowFunction | TS.FunctionDeclaration | TS.FunctionExpression;

/** What `findAttr` found on a JSX element for one prop name. */
export interface AttrLookup {
  /** The winning attribute of that name, or `null` when none is written out. */
  readonly attr: TS.JsxAttribute | null;
  /** Spreads written AFTER `attr` — the only ones that can still override it. */
  readonly spreadsAfter: readonly TS.JsxSpreadAttribute[];
}

export function isExported(ts: TypeScriptApi, node: TS.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

export function isComponentFn(ts: TypeScriptApi, node: TS.Node): node is ComponentFn {
  return ts.isArrowFunction(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node);
}

/** Peel memo()/forwardRef()/React.memo() wrappers down to the inner function. */
export function unwrapToFn(ts: TypeScriptApi, expr: TS.Expression): ComponentFn | null {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    return expr;
  }
  if (ts.isCallExpression(expr)) {
    const first = expr.arguments[0];
    return first ? unwrapToFn(ts, first) : null;
  }
  return null;
}

/** Names in `function C({ foo = 1 }: P)` that carry a default initializer. */
export function defaultedBindingNames(ts: TypeScriptApi, paramNode: TS.ParameterDeclaration): Set<string> {
  if (!ts.isObjectBindingPattern(paramNode.name)) {
    return new Set();
  }
  const keys = paramNode.name.elements
    .filter((element) => element.initializer !== undefined)
    .map((element) => bindingKey(ts, element));
  return new Set(keys.filter((key) => key !== null));
}

/** The props key a binding element reads: `{ label: text }` → `label`. */
export function bindingKey(ts: TypeScriptApi, element: TS.BindingElement): string | null {
  if (element.propertyName && ts.isIdentifier(element.propertyName)) {
    return element.propertyName.text;
  }
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

/**
 * On a JSX element, find what feeds `propName`. JSX resolves attributes
 * last-wins, so anything before the winning attribute — including spreads —
 * cannot influence the value and is dropped here.
 */
export function findAttr(ts: TypeScriptApi, el: TS.JsxOpeningLikeElement, propName: string): AttrLookup {
  let attr: TS.JsxAttribute | null = null;
  let spreadsAfter: TS.JsxSpreadAttribute[] = [];
  for (const property of el.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      spreadsAfter.push(property);
    } else if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === propName) {
      attr = property;
      spreadsAfter = [];
    }
  }
  return { attr, spreadsAfter };
}

/**
 * The identifier a component function is bound to: a declaration's own name,
 * or the variable a const-arrow is assigned to (peeling memo()/forwardRef()).
 */
export function bindingNameOfFn(ts: TypeScriptApi, fn: ComponentFn): TS.Identifier | null {
  if (ts.isFunctionDeclaration(fn) && fn.name) {
    return fn.name;
  }
  // Wrapper calls are the only thing worth climbing past; whatever sits above
  // them either binds the function to a name or ends the search.
  let current: TS.Node | undefined = fn.parent;
  while (current && ts.isCallExpression(current)) {
    current = current.parent;
  }
  if (current && ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
    return current.name;
  }
  return null;
}
