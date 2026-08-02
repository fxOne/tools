import { resolve } from 'node:path';
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
