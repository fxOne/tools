import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type * as TS from 'typescript';
import { PropFlowError } from './errors.js';
import { relativeTo } from './paths.js';
import type { TypeScriptApi } from './typescript-api.js';

/**
 * Find the tsconfig to build the Program from.
 *
 * Prefers the broadest "solution" config — the git-root tsconfig when it
 * actually includes the file, so call sites in sibling packages are in scope —
 * and otherwise walks up from the file. Of all candidates the first one whose
 * parsed file set really contains the file wins.
 */
export function discoverTsconfig(ts: TypeScriptApi, file: string): string | null {
  const gitRoot = findUp(dirname(file), '.git');
  const candidates: string[] = [];
  if (gitRoot) {
    const rootConfig = join(gitRoot, 'tsconfig.json');
    if (existsSync(rootConfig)) {
      candidates.push(rootConfig);
    }
  }

  let dir = dirname(file);
  const stop = gitRoot ?? dir;
  for (;;) {
    const config = join(dir, 'tsconfig.json');
    if (existsSync(config) && !candidates.includes(config)) {
      candidates.push(config);
    }
    if (dir === stop || dir === dirname(dir)) {
      break;
    }
    dir = dirname(dir);
  }

  for (const candidate of candidates) {
    try {
      const parsed = readTsConfig(ts, candidate);
      if (parsed.fileNames.some((name) => resolve(name) === resolve(file))) {
        return candidate;
      }
    } catch {
      // Unreadable config — try the next candidate.
    }
  }
  return candidates[0] ?? null;
}

export function readTsConfig(ts: TypeScriptApi, configPath: string, cwd = process.cwd()): TS.ParsedCommandLine {
  const read = ts.readConfigFile(configPath, (fileName) => ts.sys.readFile(fileName));
  if (read.error) {
    throw new PropFlowError(
      `Failed to read ${relativeTo(cwd, configPath)}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`,
    );
  }
  return ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
}

/** Nearest ancestor directory (inclusive) that contains `marker`. */
export function findUp(startDir: string, marker: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, marker))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}
