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

  it('exits 0 on a file with nothing to analyse, in both output modes', () => {
    // The whole point of the exit code: a loop over changed files must be able
    // to stop on a real failure without stopping on a page component.
    const text = run(['app.tsx']);
    const json = run(['--json', 'app.tsx']);

    expect(text.code).toBe(0);
    expect(text.stderr).toBe('');
    expect(text.stdout).toContain('No exported component with a typed props object.');
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ components: 0, file: 'app.tsx', props: [] });
  });

  it('puts a handled failure into the JSON stream instead of onto stderr', () => {
    // One object per invocation, whatever happens — a bare error line in the
    // middle of a `for f in …; do prop-flow "$f" --json; done` would break the
    // parse for every other file in the stream, not just the failing one.
    const { code, stderr, stdout } = run(['--json', 'missing.tsx']);

    expect(code).toBe(2);
    expect(stderr).toBe('');
    expect((JSON.parse(stdout) as { error: string }).error).toContain('File not found');
  });

  it('reaches the JSON envelope even when it is the arguments that are bad', () => {
    // `--json` is read off the raw argv, so a parse failure lands in the
    // envelope too — which is when a caller is least able to guess the shape.
    const { code, stderr, stdout } = run(['--json', '--nope', 'button.tsx']);

    expect(code).toBe(2);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ error: 'Unknown option: --nope' });
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
