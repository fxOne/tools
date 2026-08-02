import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PropFlowError } from './errors.js';
import { discoverTsconfig, findUp, readTsConfig } from './tsconfig.js';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('discoverTsconfig', () => {
  it('picks the nearest config that actually contains the file', () => {
    expect(discoverTsconfig(ts, resolve(FIXTURES, 'basic/button.tsx'))).toBe(resolve(FIXTURES, 'basic/tsconfig.json'));
    expect(discoverTsconfig(ts, resolve(FIXTURES, 'nested/inner/only.ts'))).toBe(
      resolve(FIXTURES, 'nested/inner/tsconfig.json'),
    );
  });

  it('climbs past a config whose file set excludes the file', () => {
    // inner/tsconfig.json only includes only.ts, so other.ts belongs to the
    // outer project — exactly the cross-package case the climb exists for.
    expect(discoverTsconfig(ts, resolve(FIXTURES, 'nested/inner/other.ts'))).toBe(
      resolve(FIXTURES, 'nested/tsconfig.json'),
    );
  });
});

describe('readTsConfig', () => {
  it('parses a config into compiler options and file names', () => {
    const parsed = readTsConfig(ts, resolve(FIXTURES, 'basic/tsconfig.json'));

    expect(parsed.options.jsx).toBe(ts.JsxEmit.Preserve);
    expect(parsed.fileNames).toContain(resolve(FIXTURES, 'basic/button.tsx'));
  });

  it('turns a malformed config into an actionable error', () => {
    const configPath = resolve(FIXTURES, 'broken/tsconfig.json');

    expect(() => readTsConfig(ts, configPath, FIXTURES)).toThrow(PropFlowError);
    expect(() => readTsConfig(ts, configPath, FIXTURES)).toThrow(/Failed to read broken\/tsconfig\.json/);
  });
});

describe('findUp', () => {
  it('finds the marker in an ancestor directory', () => {
    expect(findUp(resolve(FIXTURES, 'nested/inner'), 'tsconfig.json')).toBe(resolve(FIXTURES, 'nested/inner'));
    expect(findUp(resolve(FIXTURES, 'nested/inner'), 'pnpm-workspace.yaml')).toBe(
      resolve(import.meta.dirname, '../../..'),
    );
  });

  it('returns null when the marker is nowhere above', () => {
    expect(findUp(FIXTURES, 'no-such-marker-anywhere')).toBeNull();
  });
});
