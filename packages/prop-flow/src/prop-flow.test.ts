import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PropFlowError } from './errors.js';
import { analyseProps } from './prop-flow.js';
import type { Report } from './types.js';

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/basic');

function analyse(file: string, prop?: string): Report {
  return analyseProps({ cwd: FIXTURE_DIR, file, prop, ts });
}

function verdicts(report: Report): Record<string, string> {
  return Object.fromEntries(report.props.map((row) => [`${row.component}.${row.prop}`, row.verdict]));
}

describe('analyseProps', () => {
  it('reports every optional prop of every exported component', () => {
    const report = analyse('button.tsx');

    expect(verdicts(report)).toEqual({
      'Button.disabled': 'justified',
      'Button.icon': 'caller-dead',
      'Button.size': 'unnecessary-optional',
      'Button.title': 'justified',
    });
    expect(report).toMatchObject({ configPath: 'tsconfig.json', file: 'button.tsx' });
    expect(report.fileCount).toBeGreaterThan(1);
  });

  it('narrows to a single prop when one is named', () => {
    const report = analyse('button.tsx', 'size');

    expect(report.props).toHaveLength(1);
    expect(report.props[0]).toMatchObject({ hasDefault: true, prop: 'size', verdict: 'unnecessary-optional' });
  });

  it('reports required props only under allProps, and only where constant', () => {
    const plain = analyse('constant.tsx');
    const all = analyseProps({ allProps: true, cwd: FIXTURE_DIR, file: 'constant.tsx', ts });

    expect(verdicts(plain)).not.toHaveProperty('Req.kind');
    expect(verdicts(all)['Req.kind']).toBe('required');
    // Every other required prop is an `id`, and no two call sites send the same
    // one — so widening discovery adds exactly the one finding, not a listing.
    expect(Object.keys(verdicts(all))).toEqual([...Object.keys(verdicts(plain)), 'Req.kind']);
  });

  it('widens the wording of the not-found error under allProps', () => {
    // Without the flag the message can promise the prop is not an *optional*
    // one; with it, required props were searched too and that promise is gone.
    expect(() => analyseProps({ allProps: true, cwd: FIXTURE_DIR, file: 'button.tsx', prop: 'nope', ts })).toThrow(
      /'nope' is not a prop of any component exported from button\.tsx/,
    );
  });

  it('falls back to process.cwd() and to the project TypeScript when given neither', () => {
    // What `bin.ts` actually does — it passes no `cwd` and no `ts` — so these
    // two defaults are the production path, and every other test steps over
    // them by injecting both.
    const file = relative(process.cwd(), resolve(FIXTURE_DIR, 'card.tsx'));

    const report = analyseProps({ file });

    expect(report.file).toContain('fixtures/basic/card.tsx');
    expect(verdicts(report)).toEqual({ 'Card.action': 'justified' });
  });

  it('accepts an explicit tsconfig and an absolute file path', () => {
    const report = analyseProps({
      ts,
      cwd: FIXTURE_DIR,
      file: resolve(FIXTURE_DIR, 'card.tsx'),
      tsconfig: 'tsconfig.json',
    });

    expect(verdicts(report)).toEqual({ 'Card.action': 'justified' });
  });

  it.each([
    ['nope.tsx', undefined, /File not found/],
    ['button.tsx', 'nope', /'nope' is not an optional prop/],
    ['app.tsx', undefined, /No exported component/],
  ])('rejects %s %s', (file, prop, message) => {
    expect(() => analyse(file, prop)).toThrow(PropFlowError);
    expect(() => analyse(file, prop)).toThrow(message);
  });

  it('rejects a tsconfig that does not span the inspected file', () => {
    expect(() =>
      analyseProps({
        ts,
        cwd: FIXTURE_DIR,
        file: 'button.tsx',
        tsconfig: '../nested/tsconfig.json',
      }),
    ).toThrow(/does not include button\.tsx/);
  });

  it('rejects a tsconfig path that does not exist', () => {
    expect(() => analyseProps({ cwd: FIXTURE_DIR, file: 'button.tsx', ts, tsconfig: 'nope.json' })).toThrow(
      /No tsconfig found/,
    );
  });
});
