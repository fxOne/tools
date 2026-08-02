import { PropFlowError } from './errors.js';

export interface CliArgs {
  readonly help: boolean;
  readonly json: boolean;
  readonly tsconfig: string | null;
  readonly file: string | null;
  readonly prop: string | null;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  let help = false;
  let json = false;
  let tsconfig: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--json') {
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

  if (positional.length > 2) {
    throw new PropFlowError(`Unexpected argument: ${positional[2] ?? ''}`);
  }

  return { help, json, tsconfig, file: positional[0] ?? null, prop: positional[1] ?? null };
}
