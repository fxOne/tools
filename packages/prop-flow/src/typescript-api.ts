import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PropFlowError } from './errors.js';

/** The TypeScript compiler API, as loaded from the target project. */
export type TypeScriptApi = typeof import('typescript');

/**
 * Load the TARGET project's own TypeScript, resolved from `cwd`.
 *
 * prop-flow ships no `typescript` dependency of its own so that it always
 * analyses a project with the exact compiler that project uses.
 */
export function loadTypeScript(cwd: string): TypeScriptApi {
  const require = createRequire(join(cwd, 'noop.js'));
  try {
    return require('typescript') as TypeScriptApi;
  } catch {
    throw new PropFlowError(
      'Could not load `typescript` from the current project. Run this from the root of a TS project that has typescript installed.',
    );
  }
}
