import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type * as TS from 'typescript';
import { createAnalyzer } from './analyzer.js';
import { PropFlowError } from './errors.js';
import { relativeTo } from './paths.js';
import { discoverTsconfig, readTsConfig } from './tsconfig.js';
import type { PropReport, Report } from './types.js';
import { loadTypeScript } from './typescript-api.js';
import type { TypeScriptApi } from './typescript-api.js';

export interface AnalyseOptions {
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

/**
 * Trace every optional prop of every component exported from `file` up the
 * JSX call sites across the whole Program.
 */
export function analyseProps(options: AnalyseOptions): Report {
  const cwd = options.cwd ?? process.cwd();
  const ts = options.ts ?? loadTypeScript(cwd);

  const file = isAbsolute(options.file) ? options.file : resolve(cwd, options.file);
  if (!existsSync(file)) {
    throw new PropFlowError(`File not found: ${file}`);
  }

  const configPath = options.tsconfig ? resolve(cwd, options.tsconfig) : discoverTsconfig(ts, file);
  if (!configPath || !existsSync(configPath)) {
    throw new PropFlowError('No tsconfig found. Pass one explicitly with --tsconfig <path>.');
  }

  const parsed = readTsConfig(ts, configPath, cwd);
  const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
  const sourceFile = findSourceFile(program, file);
  if (!sourceFile) {
    throw new PropFlowError(
      `The chosen tsconfig (${relativeTo(cwd, configPath)}) does not include ${relativeTo(cwd, file)}.\nPass the solution/root tsconfig with --tsconfig so the file and its call sites are both in scope.`,
    );
  }

  const analyzer = createAnalyzer({ cwd, program, ts });
  const components = analyzer.findComponents(sourceFile);
  if (components.length === 0) {
    throw new PropFlowError(`No exported component with a typed props object found in ${relativeTo(cwd, file)}.`);
  }

  const propName = options.prop ?? null;
  const props: PropReport[] = [];
  for (const component of components) {
    const optional = analyzer.listOptionalProps(component);
    const selected = propName === null ? optional : optional.filter((prop) => prop.name === propName);
    for (const prop of selected) {
      props.push({
        ...analyzer.analyse(component, prop.name),
        component: component.name,
        hasDefault: prop.hasDefault,
        prop: prop.name,
      });
    }
  }

  if (propName !== null && props.length === 0) {
    throw new PropFlowError(
      `'${propName}' is not an optional prop of any component exported from ${relativeTo(cwd, file)}.`,
    );
  }

  return {
    props,
    configPath: relativeTo(cwd, configPath),
    file: relativeTo(cwd, file),
    fileCount: program.getSourceFiles().length,
  };
}

/** `getSourceFile` is exact-match; fall back to comparing resolved paths. */
function findSourceFile(program: TS.Program, file: string): TS.SourceFile | undefined {
  return program.getSourceFile(file) ?? program.getSourceFiles().find((sf) => resolve(sf.fileName) === resolve(file));
}
