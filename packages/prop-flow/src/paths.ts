import type * as TS from 'typescript';

/** Shorten a path for display: relative to `cwd` when it lives underneath it. */
export function relativeTo(cwd: string, filePath: string): string {
  const relative = filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath;
  return relative || filePath;
}

/** `file:line:column` of a node, ready to paste into an editor. */
export function locOf(node: TS.Node, cwd: string): string {
  const sourceFile = node.getSourceFile();
  const { character, line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${relativeTo(cwd, sourceFile.fileName)}:${line + 1}:${character + 1}`;
}
