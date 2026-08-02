import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PropFlowError } from './errors.js';
import { loadTypeScript } from './typescript-api.js';

// A project without typescript cannot be simulated with a temp directory:
// resolution keeps climbing and finds the compiler somewhere above. Fail the
// require at the boundary instead, for this one marker path only.
const UNRESOLVABLE = '/no-typescript-here';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (filename: string) => {
      if (filename.startsWith(UNRESOLVABLE)) {
        return (() => {
          throw new Error('Cannot find module: typescript');
        }) as unknown as NodeRequire;
      }
      return actual.createRequire(filename);
    },
  };
});

describe('loadTypeScript', () => {
  it('loads the compiler from the node_modules of the target project', () => {
    const api = loadTypeScript(resolve(import.meta.dirname, '..'));

    expect(typeof api.createProgram).toBe('function');
    expect(api.version).toMatch(/^\d+\./);
  });

  it('fails with a pointer to the fix when the project has no typescript', () => {
    expect(() => loadTypeScript(UNRESOLVABLE)).toThrow(PropFlowError);
    expect(() => loadTypeScript(UNRESOLVABLE)).toThrow(/Could not load `typescript`/);
  });
});
