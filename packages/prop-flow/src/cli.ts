import { parseArgs } from './args.js';
import { PropFlowError } from './errors.js';
import { analyseProps } from './prop-flow.js';
import { formatJson, formatText } from './report.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface OutputStream {
  write(chunk: string): void;
}

export interface CliContext {
  readonly cwd: string;
  readonly stderr: OutputStream;
  readonly stdout: OutputStream;
  /** Injected in tests; otherwise the target project's own TypeScript. */
  readonly ts?: TypeScriptApi;
}

export const USAGE =
  'Usage: prop-flow <file> [propName] [--tsconfig <path>] [--json]\n\n' +
  '  <file>      a .ts/.tsx file containing the component(s) to inspect\n' +
  '  [propName]  one prop; omitted → every optional prop of every component\n' +
  '              exported from the file\n' +
  '  --tsconfig  override the auto-discovered tsconfig (use the broadest\n' +
  '              "solution" config so call sites in other packages are seen)\n' +
  '  --json      machine-readable output\n\n' +
  'Trace an optional prop up every JSX call site and report whether its\n' +
  '`?` is justified, needless, or the prop is never passed (caller-dead).\n';

/** Exit codes: 0 ok, 1 nothing to do (usage printed), 2 a handled failure. */
export function runCli(argv: readonly string[], context: CliContext): number {
  try {
    const args = parseArgs(argv);
    if (args.help || args.file === null) {
      context.stdout.write(USAGE);
      return args.help ? 0 : 1;
    }
    const report = analyseProps({
      cwd: context.cwd,
      file: args.file,
      prop: args.prop,
      ts: context.ts,
      tsconfig: args.tsconfig,
    });
    context.stdout.write(args.json ? formatJson(report) : formatText(report));
    return 0;
  } catch (error) {
    if (error instanceof PropFlowError) {
      context.stderr.write(`prop-flow: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}
