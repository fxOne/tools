import { describe, expect, it } from 'vitest';
import { relativeTo } from './paths.js';

describe('relativeTo', () => {
  it.each([
    ['/repo', '/repo/src/Button.tsx', 'src/Button.tsx'],
    ['/repo', '/elsewhere/src/Button.tsx', '/elsewhere/src/Button.tsx'],
    // A sibling directory that merely shares the prefix stays untouched.
    ['/repo', '/repository/Button.tsx', '/repository/Button.tsx'],
    // The cwd itself has no relative form — fall back to the full path.
    ['/repo', '/repo', '/repo'],
  ])('relativeTo(%s, %s) → %s', (cwd, filePath, expected) => {
    expect(relativeTo(cwd, filePath)).toBe(expected);
  });
});
