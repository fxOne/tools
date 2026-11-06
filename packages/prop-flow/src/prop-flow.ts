import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type * as TS from 'typescript';
import { createAnalyzer } from './analyzer.js';
import type { Analyzer } from './analyzer.js';
import { PropFlowError } from './errors.js';
import { relativeTo } from './paths.js';
import { discoverTsconfig, readTsConfig } from './tsconfig.js';
import type { PropReport, Report } from './types.js';
import { loadTypeScript } from './typescript-api.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface AnalyseOptions {
  /**
   * Also inspect required props. They are reported only when they carry a
   * constant value — there is no `?` on them to pass a verdict on.
   */
  readonly allProps?: boolean;
  /** Root for path resolution and for shortening printed paths. */
  readonly cwd?: string;
  /** A .ts/.tsx file containing the component(s) to inspect. */
  readonly file: string;
  /** One prop; omitted → every optional prop of every exported component. */
  readonly prop?: string | null;
  /** The compiler API to analyse with. Defaults to the target project's own. */
  readonly ts?: TypeScriptApi;
  /**
   * Override the auto-discovered tsconfig. Use the broadest "solution" config
   * so call sites in other packages are in scope.
   */
  readonly tsconfig?: string | null;
}

export interface AnalyseFilesOptions extends Omit<AnalyseOptions, 'file'> {
  readonly files: readonly string[];
}

/** One file's outcome in a batch: its report, or why it has none. */
export type FileOutcome = { readonly error: string; readonly file: string } | { readonly report: Report };

/**
 * `analyseProps` over several files in one process. Files under the same
 * tsconfig share one Program, checker and usage index — building those is most
 * of a single run, so a loop of single-file calls pays it once per file. A
 * handled failure on one file is that file's outcome and does not stop the rest.
 */
export function analyseFiles(options: AnalyseFilesOptions): FileOutcome[] {
  const cwd = options.cwd ?? process.cwd();
  const session = createSession(options.ts ?? loadTypeScript(cwd), cwd);
  return options.files.map((file) => {
    try {
      return { report: analyseIn(session, { ...options, file }) };
    } catch (error) {
      if (error instanceof PropFlowError) {
        return { error: error.message, file };
      }
      throw error;
    }
  });
}

/**
 * Trace every optional prop of every component exported from `file` up the
 * JSX call sites across the whole Program. With `allProps`, required props
 * join in — but only where they turn out to carry a constant value.
 */
export function analyseProps(options: AnalyseOptions): Report {
  const cwd = options.cwd ?? process.cwd();
  return analyseIn(createSession(options.ts ?? loadTypeScript(cwd), cwd), options);
}

/** What one process keeps between files: parsed configs and one Program per config. */
interface Session {
  readonly analyzers: Map<string, { readonly analyzer: Analyzer; readonly program: TS.Program }>;
  readonly configs: Map<string, TS.ParsedCommandLine>;
  readonly cwd: string;
  readonly ts: TypeScriptApi;
}

function createSession(ts: TypeScriptApi, cwd: string): Session {
  return { analyzers: new Map(), configs: new Map(), cwd, ts };
}

function analyseIn(session: Session, options: AnalyseOptions): Report {
  const { cwd } = session;
  const { analyzer, configPath, file, program, sourceFile } = resolveTarget(options, session);
  // No component is not a failure — it is the answer for a route module or a
  // props-less page, and it belongs on the same path as a component whose props
  // are all required. Both come back as an empty `props`; `components` says
  // which one it was. Failing here instead would mean a caller looping over
  // changed files has to tell "nothing to analyse" apart from "could not
  // analyse" by reading a message.
  const components = analyzer.findComponents(sourceFile);

  const allProps = options.allProps ?? false;
  const propName = options.prop ?? null;
  const props: PropReport[] = [];
  let matched = 0;
  for (const component of components) {
    const declared = analyzer.listProps(component, { includeRequired: allProps });
    const selected = propName === null ? declared : declared.filter((prop) => prop.name === propName);
    for (const prop of selected) {
      matched += 1;
      const analysis = analyzer.analyse(component, prop.name);
      // A prop with no `?` has nothing for the verdicts to say: `justified` and
      // `caller-dead` are impossible on it and `unnecessary-optional` is a lie.
      // Its constant value is the whole reason it is here — no value, no row.
      if (prop.optional || analysis.constant !== null) {
        props.push({
          ...analysis,
          component: component.name,
          hasDefault: prop.hasDefault,
          prop: prop.name,
          verdict: prop.optional ? analysis.verdict : 'required',
        });
      }
    }
  }

  if (propName !== null && matched === 0) {
    const scope = allProps ? 'a prop' : 'an optional prop';
    throw new PropFlowError(`'${propName}' is not ${scope} of any component exported from ${relativeTo(cwd, file)}.`);
  }

  return {
    props,
    components: components.length,
    configPath: relativeTo(cwd, configPath),
    file: relativeTo(cwd, file),
    fileCount: program.getSourceFiles().length,
  };
}

/** The file to analyse, the config it was found under, and the Program both live in. */
interface Target {
  readonly analyzer: Analyzer;
  readonly configPath: string;
  /** Absolute; the report shortens it against `cwd` on the way out. */
  readonly file: string;
  readonly program: TS.Program;
  readonly sourceFile: TS.SourceFile;
}

/**
 * Resolve what the analysis runs against. Every way this can fail is a
 * `PropFlowError`, and deliberately so: exit 2 is reserved for what actually
 * blocked the analysis, and a missing file, an unfindable compiler config and a
 * tsconfig that does not span the file are the three things that do.
 */
function resolveTarget(options: AnalyseOptions, session: Session): Target {
  const { configs, cwd, ts } = session;
  const file = isAbsolute(options.file) ? options.file : resolve(cwd, options.file);
  if (!existsSync(file)) {
    throw new PropFlowError(`File not found: ${file}`);
  }

  // Parsing a config globs its whole file set; a batch asks for the same few
  // configs once per file.
  const read = (path: string): TS.ParsedCommandLine => {
    const cached = configs.get(path);
    if (cached) {
      return cached;
    }
    const parsed = readTsConfig(ts, path, cwd);
    configs.set(path, parsed);
    return parsed;
  };
  const configPath = options.tsconfig ? resolve(cwd, options.tsconfig) : discoverTsconfig(ts, file, read);
  if (!configPath || !existsSync(configPath)) {
    throw new PropFlowError('No tsconfig found. Pass one explicitly with --tsconfig <path>.');
  }

  let built = session.analyzers.get(configPath);
  if (!built) {
    const parsed = read(configPath);
    const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
    built = { analyzer: createAnalyzer({ cwd, program, ts }), program };
    session.analyzers.set(configPath, built);
  }
  const { analyzer, program } = built;
  const sourceFile = findSourceFile(program, file);
  if (!sourceFile) {
    throw new PropFlowError(
      `The chosen tsconfig (${relativeTo(cwd, configPath)}) does not include ${relativeTo(cwd, file)}.\nPass the solution/root tsconfig with --tsconfig so the file and its call sites are both in scope.`,
    );
  }

  return { analyzer, configPath, file, program, sourceFile };
}

/** `getSourceFile` is exact-match; fall back to comparing resolved paths. */
function findSourceFile(program: TS.Program, file: string): TS.SourceFile | undefined {
  return program.getSourceFile(file) ?? program.getSourceFiles().find((sf) => resolve(sf.fileName) === resolve(file));
}
