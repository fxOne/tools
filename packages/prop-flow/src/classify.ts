import type * as TS from 'typescript';
import { bindingKey, findAttr, isComponentFn } from './ast.js';
import type { Component, ComponentFactory } from './component.js';
import type { TypeScriptApi } from './typescript-api.js';

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
      return { kind: 'real', note: 'boolean shorthand' };
    }
    if (ts.isStringLiteral(init)) {
      return { kind: 'real', note: 'string literal' };
    }
    if (!ts.isJsxExpression(init) || init.expression === undefined) {
      return { kind: 'manual', note: 'unrecognised attribute form' };
    }
    return classifyExpression(init.expression);
  }

  /** Where the value an expression evaluates to originates. */
  function classifyExpression(expr: TS.Expression): Classification {
    if (ts.isStringLiteral(expr)) {
      return { kind: 'real', note: 'string literal' };
    }
    // `prop={undefined}` is an omission dressed up as a pass.
    if (ts.isIdentifier(expr) && expr.text === 'undefined') {
      return { kind: 'omit', note: 'explicit undefined' };
    }
    // Identifier — a destructured prop of the enclosing component (climb) or a
    // local value (a real source).
    if (ts.isIdentifier(expr)) {
      return asDestructuredProp(expr) ?? { kind: 'real', note: 'local value' };
    }
    // `props.foo` — climb when `props` is the enclosing props parameter.
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      return asMemberProp(expr.expression, expr.name.text) ?? { kind: 'real', note: 'member value' };
    }
    // Any other expression (call, object, conditional, JSX, template…) — the
    // value is produced right here. Treat as a real source; a conditional that
    // can yield undefined is the one false positive we accept (conservative:
    // counts as "present").
    return { kind: 'real', note: ts.SyntaxKind[expr.kind] };
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
