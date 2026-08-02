import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { runCli } from './cli.js';
import type { CliContext, OutputStream } from './cli.js';
import type { Report } from './types.js';
import type { TypeScriptApi } from './typescript-api.js';

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/basic');

class Capture implements OutputStream {
  public text = '';

  public write(chunk: string): void {
    this.text += chunk;
  }
}

function run(argv: string[]): { code: number; stderr: string; stdout: string } {
  const stdout = new Capture();
  const stderr = new Capture();
  const context: CliContext = { cwd: FIXTURE_DIR, stderr, stdout, ts };
  const code = runCli(argv, context);
  return { code, stderr: stderr.text, stdout: stdout.text };
}

describe('runCli', () => {
  it('prints the verdicts for one prop', () => {
    const { code, stderr, stdout } = run(['button.tsx', 'icon']);

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('tsconfig: tsconfig.json');
    expect(stdout).toContain('CALLER-DEAD       Button.icon');
    expect(stdout).toContain('passes=0  omits=3  ambiguous=0');
    expect(stdout).toContain('Remove the prop and the code that reads it.');
  });

  it('emits machine-readable output with --json', () => {
    const { code, stdout } = run(['--json', 'button.tsx', 'size']);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      configPath: 'tsconfig.json',
      file: 'button.tsx',
      props: [{ component: 'Button', hasDefault: true, prop: 'size', verdict: 'unnecessary-optional' }],
    });
  });

  it('reaches required props with --all-props', () => {
    const { code, stdout } = run(['--all-props', 'constant.tsx', 'kind']);

    expect(code).toBe(0);
    expect(stdout).toMatch(/required\s+Req\.kind/);
    expect(stdout).toContain('constant="primary"  coverage=all');
  });

  it('carries the constant value into --json, null where there is none', () => {
    const { code, stdout } = run(['--json', 'constant.tsx', 'size']);
    const report = JSON.parse(stdout) as Report;

    expect(code).toBe(0);
    expect(report.props.map((row) => [`${row.component}.${row.prop}`, row.constant])).toEqual([
      ['Tile.size', { coverage: 'all', value: '"md"' }],
      ['Hop.size', { coverage: 'all', value: '"lg"' }],
      ['Relay.size', null],
      ['Dim.size', null],
      ['Vague.size', null],
    ]);
  });

  it('prints usage on --help and exits 0', () => {
    const { code, stdout } = run(['--help']);

    expect(code).toBe(0);
    expect(stdout).toContain('Usage: prop-flow <file>');
  });

  it('prints usage and exits 1 when no file is given', () => {
    const { code, stdout } = run([]);

    expect(code).toBe(1);
    expect(stdout).toContain('Usage: prop-flow <file>');
  });

  it.each([
    [['--nope', 'button.tsx'], 'prop-flow: Unknown option: --nope\n'],
    [['missing.tsx'], 'prop-flow: File not found: '],
  ])('turns %j into a one-line error on stderr', (argv, message) => {
    const { code, stderr, stdout } = run(argv);

    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain(message);
  });

  it('lets an unexpected failure through instead of dressing it as exit 2', () => {
    // Only PropFlowError means "handled". Anything else is a bug in prop-flow
    // or in the compiler, and swallowing it into a one-line message would hide
    // the stack that says so.
    const stdout = new Capture();
    const stderr = new Capture();
    const broken = {
      ...ts,
      createProgram: () => {
        throw new TypeError('the compiler exploded');
      },
    } as unknown as TypeScriptApi;

    expect(() => runCli(['button.tsx'], { cwd: FIXTURE_DIR, stderr, stdout, ts: broken })).toThrow(
      'the compiler exploded',
    );
    expect(stderr.text).toBe('');
  });
});
