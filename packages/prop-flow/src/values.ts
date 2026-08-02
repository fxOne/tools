import type * as TS from 'typescript';
import type { TypeScriptApi } from './typescript-api.js';

/** `<C flag />` carries no expression to read; the value is always `true`. */
export const BOOLEAN_SHORTHAND_VALUE = 'true';

/**
 * The value `expr` resolves to, printed as the checker prints it (`"sm"`,
 * `true`, `42`, `Tone.Danger`), or null when it is not a single literal.
 *
 * Going through the type rather than the syntax is what makes `const SIZE =
 * 'sm'`, an enum member and a property of an `as const` object all normalise to
 * the same string as a written-out `size="sm"` — and what keeps everything
 * else (a call, a parameter, a widened `let`) honestly unknown.
 */
export function literalValueOf(checker: TS.TypeChecker, ts: TypeScriptApi, expr: TS.Expression): string | null {
  // A written-out string literal is read from the node instead: as a JSX
  // attribute initializer (`size="md"`) it sits outside an expression position,
  // where the checker has no type to hand back.
  if (ts.isStringLiteral(expr)) {
    return JSON.stringify(expr.text);
  }
  const type = checker.getTypeAtLocation(expr);
  // `isLiteral` covers string, number and enum literals; booleans are a union
  // of two literal types of their own and need the flag.
  if (type.isLiteral() || (type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
    return checker.typeToString(type);
  }
  return null;
}
