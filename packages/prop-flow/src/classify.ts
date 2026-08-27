import type * as TS from 'typescript';
import { bindingKey, findAttr, isComponentFn } from './ast.js';
import type { Component, ComponentFactory } from './component.js';
import type { TypeScriptApi } from './typescript-api.js';
import { BOOLEAN_SHORTHAND_VALUE, literalValueOf } from './values.js';

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

/** Nothing reaches the prop: no attribute, or `prop={undefined}`. */
interface Omission {
  readonly kind: 'omit';
  readonly note?: string;
}

/** A value originates right here. */
interface Real {
  readonly kind: 'real';
  readonly note: string;
  /** What the value is, printably — null when it is not a single literal. */
  readonly value: string | null;
}

/** Where the value a JSX element feeds to one prop comes from. */
export type Classification = Manual | Omission | Passthrough | Real;

/**
 * What a `{...x}` can contribute to one prop:
 *
 *   definite  the spread type has the prop, and it is required → always wins
 *   maybe     the spread type has the prop, but it is optional → may win
 *   no        the spread type provably lacks the prop → irrelevant
 *   opaque    the type cannot answer the question → nothing may be concluded
 */
type Carry = 'definite' | 'maybe' | 'no' | 'opaque';

/** A binding that names the props of the component it is declared in. */
interface PropsBinding {
  readonly component: Component;
  /** The destructured element, or null when the whole object is the binding. */
  readonly element: TS.BindingElement | null;
}

export interface ClassifierOptions {
  readonly checker: TS.TypeChecker;
  readonly components: ComponentFactory;
  readonly ts: TypeScriptApi;
}

export interface Classifier {
  /** Where the value `el` feeds to `propName` comes from, spreads included. */
  classifyElement(el: TS.JsxOpeningLikeElement, propName: string): Classification;
}

export function createClassifier({ checker, components, ts }: ClassifierOptions): Classifier {
  return { classifyElement };

  // ── call site ─────────────────────────────────────────────────────────────

  function classifyElement(el: TS.JsxOpeningLikeElement, propName: string): Classification {
    // Nesting is the one value that is not written in the attributes at all, so
    // no amount of reading them can find it. It also wins over everything that
    // IS written there — `<C children={x}>{y}</C>` passes `y`, and so does
    // `<C {...props}>{y}</C>` — which is why it comes first and short-circuits.
    const nested = propName === 'children' ? nestedChildren(el) : null;
    if (nested) {
      return nested;
    }

    const { attr, spreadsAfter } = findAttr(ts, el, propName);
    const candidates = spreadsAfter
      .map((spread) => ({ carry: carryOf(spread, propName), spread }))
      .filter(({ carry }) => carry !== 'no');
    const winner = candidates.at(-1);

    if (!winner) {
      // Either no spread at all, or every one of them provably lacks the prop.
      return attr ? classifyAttribute(attr) : { kind: 'omit' };
    }
    if (winner.carry === 'opaque') {
      return { kind: 'manual', note: 'spread of a type that cannot be read' };
    }
    // An optional prop in the last spread may or may not override what comes
    // before it — two possible runtime outcomes, so no static verdict. A
    // `definite` winner overrides everything before it and needs no such check.
    if (winner.carry === 'maybe' && (candidates.length > 1 || attr !== null)) {
      return { kind: 'manual', note: 'an optional prop in a spread contests an earlier value' };
    }
    return classifySpread(winner.spread, propName);
  }

  /**
   * What the element nests, as a value for `children` — or null when it nests
   * nothing, which is when the attributes get their turn. A self-closing tag
   * nests nothing by construction, and so does `<C></C>`.
   */
  function nestedChildren(el: TS.JsxOpeningLikeElement): Classification | null {
    if (!ts.isJsxOpeningElement(el) || !ts.isJsxElement(el.parent)) {
      return null;
    }
    const children = el.parent.children.filter((child) => reachesChildren(child));
    const [only] = children;
    if (only === undefined) {
      return null;
    }
    // A lone `{expr}` is the one nesting whose value can be read — and the only
    // one that can be a pass-through: `<Slot>{children}</Slot>` forwards a prop
    // rather than originating anything. Everything else — text, an element, or
    // several children at once — is a value made right here, and an array of
    // them is not a value any constancy claim can be made about.
    if (children.length === 1 && ts.isJsxExpression(only) && only.expression) {
      return classifyExpression(only.expression);
    }
    return { kind: 'real', note: 'nested children', value: null };
  }

  /**
   * Whether a JSX child reaches `children` at all. Whitespace between tags and
   * a lone `{/* comment *\/}` are both dropped before the element is built, so
   * neither is a value — treating them as one would report `<C>\n</C>` as
   * passing something.
   */
  function reachesChildren(child: TS.JsxChild): boolean {
    if (ts.isJsxText(child)) {
      return !child.containsOnlyTriviaWhiteSpaces;
    }
    if (ts.isJsxExpression(child)) {
      return child.expression !== undefined;
    }
    return true;
  }

  /** What `{...x}` can contribute to `propName`, judged by its type alone. */
  function carryOf(spread: TS.JsxSpreadAttribute, propName: string): Carry {
    const type = checker.getTypeAtLocation(spread.expression);
    if (isOpaque(type, propName)) {
      return 'opaque';
    }
    const sym = type.getProperty(propName);
    if (!sym) {
      return 'no';
    }
    return (sym.getFlags() & ts.SymbolFlags.Optional) !== 0 ? 'maybe' : 'definite';
  }

  /**
   * Whether `getProperty` returning nothing would be uninformative rather than
   * a real absence. Every one of these makes the prop possibly-present without
   * a symbol to prove it, so treating them as "absent" would under-report.
   */
  function isOpaque(type: TS.Type, propName: string): boolean {
    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
      return true;
    }
    // Record<string, unknown> and friends: no declared properties at all.
    if (checker.getIndexInfoOfType(type, ts.IndexKind.String)) {
      return true;
    }
    // A union carries the prop in only some constituents: `getProperty` on the
    // union returns undefined, indistinguishable from an all-round absence.
    if (type.isUnion() && !type.getProperty(propName)) {
      return type.types.some((member) => isOpaque(member, propName) || member.getProperty(propName) !== undefined);
    }
    return false;
  }

  // ── spread resolution ─────────────────────────────────────────────────────

  function classifySpread(spread: TS.JsxSpreadAttribute, propName: string): Classification {
    const expr = spread.expression;
    // `{...props}` / `{...rest}` — the enclosing component forwards its own.
    if (ts.isIdentifier(expr)) {
      const binding = propsBindingOf(expr);
      if (binding && (binding.element === null || binding.element.dotDotDotToken !== undefined)) {
        return { component: binding.component, kind: 'passthrough', prop: propName };
      }
    }
    const literal = objectLiteralOf(expr);
    if (literal) {
      return classifyLiteralKey(literal, propName);
    }
    return { kind: 'manual', note: `spread of ${ts.SyntaxKind[expr.kind]} cannot be resolved` };
  }

  /** The object literal `expr` is, or that a `const` it names is initialised to. */
  function objectLiteralOf(expr: TS.Expression): TS.ObjectLiteralExpression | null {
    if (ts.isObjectLiteralExpression(expr)) {
      return expr;
    }
    if (!ts.isIdentifier(expr)) {
      return null;
    }
    const declaration = declarationOf(expr);
    if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      return null;
    }
    // A `let` could be reassigned between declaration and use.
    if ((declaration.parent.flags & ts.NodeFlags.Const) === 0) {
      return null;
    }
    return ts.isObjectLiteralExpression(declaration.initializer) ? declaration.initializer : null;
  }

  /** What the object literal sets `propName` to, under last-wins ordering. */
  function classifyLiteralKey(literal: TS.ObjectLiteralExpression, propName: string): Classification {
    let member: TS.ObjectLiteralElementLike | null = null;
    let contested = false;
    for (const property of literal.properties) {
      const key = memberKey(property);
      if (key === null) {
        // A nested spread or a computed key could still be setting propName.
        contested = true;
      } else if (key === propName) {
        member = property;
        contested = false;
      }
    }

    if (contested) {
      return { kind: 'manual', note: 'a nested spread or computed key in the spread object' };
    }
    if (!member) {
      return { kind: 'omit', note: 'not set in the spread object' };
    }
    if (ts.isPropertyAssignment(member)) {
      return classifyExpression(member.initializer);
    }
    if (ts.isShorthandPropertyAssignment(member)) {
      return classifyExpression(member.name);
    }
    return { kind: 'manual', note: 'unrecognised object literal member' };
  }

  /** The static key a literal member writes, or null when it is not readable. */
  function memberKey(property: TS.ObjectLiteralElementLike): string | null {
    const name = property.name;
    if (!name) {
      return null;
    }
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
      return name.text;
    }
    return null;
  }

  // ── attribute values ──────────────────────────────────────────────────────

  function classifyAttribute(attr: TS.JsxAttribute): Classification {
    const init = attr.initializer;
    // Shorthand boolean: <C flag /> → always a concrete `true`.
    if (init === undefined) {
      return { kind: 'real', note: 'boolean shorthand', value: BOOLEAN_SHORTHAND_VALUE };
    }
    if (ts.isStringLiteral(init)) {
      return realValue(init, 'string literal');
    }
    if (!ts.isJsxExpression(init) || init.expression === undefined) {
      return { kind: 'manual', note: 'unrecognised attribute form' };
    }
    return classifyExpression(init.expression);
  }

  /** Where the value an expression evaluates to originates. */
  function classifyExpression(expr: TS.Expression): Classification {
    if (ts.isStringLiteral(expr)) {
      return realValue(expr, 'string literal');
    }
    if (ts.isIdentifier(expr)) {
      // `prop={undefined}` is an omission dressed up as a pass.
      if (expr.text === 'undefined') {
        return { kind: 'omit', note: 'explicit undefined' };
      }
      // Otherwise a destructured prop of the enclosing component (climb), or a
      // local value (a real source).
      return asDestructuredProp(expr) ?? realValue(expr, 'local value');
    }
    // `props.foo` — climb when `props` is the enclosing props parameter.
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      return asMemberProp(expr.expression, expr.name.text) ?? realValue(expr, 'member value');
    }
    // Any other expression (call, object, conditional, JSX, template…) — the
    // value is produced right here. Treat as a real source; a conditional that
    // can yield undefined is the one false positive we accept (conservative:
    // counts as "present").
    return realValue(expr, ts.SyntaxKind[expr.kind]);
  }

  /** A value written at this call site; `note` says which shape it took. */
  function realValue(expr: TS.Expression, note: string): Real {
    return { kind: 'real', note, value: literalValueOf(checker, ts, expr) };
  }

  /** `<C prop={text}/>` where `text` is destructured from the props parameter. */
  function asDestructuredProp(id: TS.Identifier): Classification | null {
    const binding = propsBindingOf(id);
    // A rest binding used as a value passes the rest OBJECT, not one prop — and
    // that object always exists, so it is a real source rather than a climb.
    if (!binding?.element || binding.element.dotDotDotToken) {
      return null;
    }
    return { component: binding.component, kind: 'passthrough', prop: bindingKey(ts, binding.element) ?? id.text };
  }

  /** `<C prop={props.foo}/>` where `props` is the whole props parameter. */
  function asMemberProp(objId: TS.Identifier, name: string): Classification | null {
    const binding = propsBindingOf(objId);
    if (binding?.element !== null) {
      return null;
    }
    return { component: binding.component, kind: 'passthrough', prop: name };
  }

  // ── props bindings ────────────────────────────────────────────────────────

  /**
   * Resolve `id` to the props binding it names, if any. Symbol resolution, not
   * a lexical name match: inside a render callback the nearest enclosing
   * function is the callback, whose parameter is an item — not props.
   */
  function propsBindingOf(id: TS.Identifier): PropsBinding | null {
    const declaration = declarationOf(id);
    if (!declaration) {
      return null;
    }
    if (ts.isParameter(declaration)) {
      const component = componentOfParam(declaration);
      return component ? { component, element: null } : null;
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      // Only a top-level destructure of the props parameter counts; a nested
      // one has a BindingElement, not a ParameterDeclaration, as its parent.
      if (!ts.isObjectBindingPattern(pattern) || !ts.isParameter(pattern.parent)) {
        return null;
      }
      const component = componentOfParam(pattern.parent);
      return component ? { component, element: declaration } : null;
    }
    return null;
  }

  /** The component whose FIRST parameter `param` is — props sit in no other. */
  function componentOfParam(param: TS.ParameterDeclaration): Component | null {
    const fn = param.parent;
    if (!isComponentFn(ts, fn) || fn.parameters[0] !== param) {
      return null;
    }
    return components.fromFn(fn);
  }

  function declarationOf(id: TS.Identifier): TS.Declaration | null {
    const symbol = checker.getSymbolAtLocation(id);
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? null;
  }
}
