import { PropFlowError } from './errors.js';

export interface CliArgs {
  readonly allProps: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly tsconfig: string | null;
  /** The first of `files`, for callers that only ever pass one. */
  readonly file: string | null;
  readonly files: readonly string[];
  readonly prop: string | null;
}

/** A prop name is a bare identifier; anything with a dot or a slash is a path. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  let allProps = false;
  let help = false;
  let json = false;
  let tsconfig: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--all-props') {
      allProps = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--tsconfig') {
      i += 1;
      const value = argv[i];
      if (value === undefined || value.startsWith('-')) {
        throw new PropFlowError('--tsconfig needs a path.');
      }
      tsconfig = value;
    } else if (arg.startsWith('-')) {
      throw new PropFlowError(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  // The first positional is always a file, so `prop-flow Button` still reports
  // a missing file rather than a prop without one.
  const last = positional.at(-1);
  const prop = positional.length > 1 && last !== undefined && IDENTIFIER.test(last) ? last : null;
  const files = prop === null ? positional : positional.slice(0, -1);
  if (prop !== null && files.length > 1) {
    throw new PropFlowError(`A prop name needs a single file; got ${files.length} files and '${prop}'.`);
  }

  return { allProps, files, help, json, prop, tsconfig, file: files[0] ?? null };
}
