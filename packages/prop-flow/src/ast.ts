import type * as TS from 'typescript';
import type { TypeScriptApi } from './typescript-api.js';

/** Every function shape that can back a component. */
export type ComponentFn = TS.ArrowFunction | TS.FunctionDeclaration | TS.FunctionExpression;

/** What `findAttr` found: the attribute, `null` (absent), or an unresolvable spread. */
export type AttrLookup = TS.JsxAttribute | 'spread' | null;

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
  const names = new Set<string>();
  if (!ts.isObjectBindingPattern(paramNode.name)) {
    return names;
  }
  for (const element of paramNode.name.elements) {
    if (!element.initializer) {
      continue;
    }
    const key = bindingKey(ts, element);
    if (key) {
      names.add(key);
    }
  }
  return names;
}

/** The props key a binding element reads: `{ label: text }` → `label`. */
export function bindingKey(ts: TypeScriptApi, element: TS.BindingElement): string | null {
  if (element.propertyName && ts.isIdentifier(element.propertyName)) {
    return element.propertyName.text;
  }
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

/**
 * On a JSX element, find the attribute named `propName`: the JsxAttribute, or
 * `null` when absent, or `'spread'` when a `{...x}` could be supplying it.
 */
export function findAttr(ts: TypeScriptApi, el: TS.JsxOpeningLikeElement, propName: string): AttrLookup {
  let sawSpread = false;
  for (const attr of el.attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === propName) {
      return attr;
    }
    if (ts.isJsxSpreadAttribute(attr)) {
      sawSpread = true;
    }
  }
  return sawSpread ? 'spread' : null;
}

/** Nearest enclosing function that takes a parameter — i.e. could be a component. */
export function enclosingComponentFn(ts: TypeScriptApi, node: TS.Node): ComponentFn | null {
  let current: TS.Node | undefined = node.parent;
  while (current) {
    if (isComponentFn(ts, current) && current.parameters.length > 0) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * The identifier a component function is bound to: a declaration's own name,
 * or the variable a const-arrow is assigned to (peeling memo()/forwardRef()).
 */
export function bindingNameOfFn(ts: TypeScriptApi, fn: ComponentFn): TS.Identifier | null {
  if (ts.isFunctionDeclaration(fn) && fn.name) {
    return fn.name;
  }
  let current: TS.Node | undefined = fn.parent;
  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name;
    }
    if (ts.isCallExpression(current)) {
      current = current.parent;
      continue;
    }
    return null;
  }
  return null;
}
