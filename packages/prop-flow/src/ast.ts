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

/**
 * How an identifier is resolved to what it declares. Optional wherever it is
 * taken: the AST alone cannot follow a name, so a plain parse hands none.
 */
export type DeclarationResolver = (id: TS.Identifier) => TS.Declaration | null;

/**
 * Peel memo()/forwardRef()/React.memo() wrappers down to the inner function.
 * Given a resolver, a wrapper argument that merely NAMES the function is
 * followed too: `export const Card = memo(CardComponent)` is the shape a
 * wrapped component takes as soon as it outgrows being written inline, and
 * stopping at the identifier leaves the component undiscoverable.
 */
export function unwrapToFn(ts: TypeScriptApi, expr: TS.Expression, resolve?: DeclarationResolver): ComponentFn | null {
  return peel(ts, expr, resolve, new Set());
}

/** The component function a declaration IS, or that its initializer peels to. */
export function fnOfDeclaration(
  ts: TypeScriptApi,
  declaration: TS.Declaration | null | undefined,
  resolve?: DeclarationResolver,
): ComponentFn | null {
  return declaration ? fnOfDecl(ts, declaration, resolve, new Set()) : null;
}

function peel(
  ts: TypeScriptApi,
  expr: TS.Expression,
  resolve: DeclarationResolver | undefined,
  seen: Set<TS.Declaration>,
): ComponentFn | null {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    return expr;
  }
  if (ts.isCallExpression(expr)) {
    const first = expr.arguments[0];
    return first ? peel(ts, first, resolve, seen) : null;
  }
  if (!resolve || !ts.isIdentifier(expr)) {
    return null;
  }
  const declaration = resolve(expr);
  // `const A = B, B = A` never runs, but it parses — and half-written code is
  // exactly what this tool gets pointed at.
  if (!declaration || seen.has(declaration)) {
    return null;
  }
  seen.add(declaration);
  return fnOfDecl(ts, declaration, resolve, seen);
}

function fnOfDecl(
  ts: TypeScriptApi,
  declaration: TS.Declaration,
  resolve: DeclarationResolver | undefined,
  seen: Set<TS.Declaration>,
): ComponentFn | null {
  if (ts.isFunctionDeclaration(declaration)) {
    return declaration;
  }
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return peel(ts, declaration.initializer, resolve, seen);
  }
  return null;
}

/**
 * Props keys in `function C({ foo = 1 }: P)` that carry a default, mapped to
 * the default itself. The expression, not just the fact of it: a default is a
 * value the component feeds itself whenever a caller omits the prop.
 */
export function defaultedBindings(ts: TypeScriptApi, paramNode: TS.ParameterDeclaration): Map<string, TS.Expression> {
  const out = new Map<string, TS.Expression>();
  if (!ts.isObjectBindingPattern(paramNode.name)) {
    return out;
  }
  for (const element of paramNode.name.elements) {
    const key = bindingKey(ts, element);
    if (element.initializer !== undefined && key !== null) {
      out.set(key, element.initializer);
    }
  }
  return out;
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
