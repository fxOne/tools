import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';
import { PropFlowError } from './errors.js';

describe('parseArgs', () => {
  it('reads the file, the prop and the flags in any order', () => {
    expect(parseArgs(['src/Button.tsx'])).toEqual({
      allProps: false,
      file: 'src/Button.tsx',
      help: false,
      json: false,
      prop: null,
      tsconfig: null,
    });
    expect(
      parseArgs(['--json', 'src/Button.tsx', '--all-props', '--tsconfig', 'tsconfig.base.json', 'title']),
    ).toEqual({
      allProps: true,
      file: 'src/Button.tsx',
      help: false,
      json: true,
      prop: 'title',
      tsconfig: 'tsconfig.base.json',
    });
  });

  it.each([['-h'], ['--help']])('treats %s as a help request', (flag) => {
    expect(parseArgs([flag])).toMatchObject({ help: true, file: null });
  });

  it('reports nothing to do for an empty argv', () => {
    expect(parseArgs([])).toMatchObject({ help: false, file: null });
  });

  it('skips a hole in argv rather than reading it as a positional', () => {
    // `parseArgs` is exported, so the argv is not always `process.argv.slice(2)`
    // — a gap must be stepped over, not shifted into the [propName] slot.
    const argv = ['src/Button.tsx', undefined, 'title'] as unknown as string[];

    expect(parseArgs(argv)).toMatchObject({ file: 'src/Button.tsx', prop: 'title' });
  });

  it.each([
    [['--tsconfig'], /--tsconfig needs a path/],
    [['--tsconfig', '--json'], /--tsconfig needs a path/],
    [['--nope'], /Unknown option: --nope/],
    [['a.tsx', 'prop', 'extra'], /Unexpected argument: extra/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(PropFlowError);
    expect(() => parseArgs(argv)).toThrow(message);
  });
});
