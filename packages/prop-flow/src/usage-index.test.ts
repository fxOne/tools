import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { createComponentFactory } from './component.js';
import type { ComponentFactory } from './component.js';
import { readTsConfig } from './tsconfig.js';
import { createUsageIndex } from './usage-index.js';
import type { UsageIndex } from './usage-index.js';

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/basic');

let program: ts.Program;
let checker: ts.TypeChecker;
let components: ComponentFactory;
let index: UsageIndex;

beforeAll(() => {
  // One Program for the whole file — building it is by far the slowest part.
  const parsed = readTsConfig(ts, resolve(FIXTURE_DIR, 'tsconfig.json'));
  program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
  checker = program.getTypeChecker();
  components = createComponentFactory({ checker, ts });
  index = createUsageIndex({ checker, components, program, ts });
});

function sourceFile(file: string): ts.SourceFile {
  const found = program.getSourceFile(resolve(FIXTURE_DIR, file));
  if (!found) {
    throw new Error(`fixture ${file} is not part of the Program`);
  }
  return found;
}

/** The identifiers one top-level statement binds a value to. */
function declaredNames(stmt: ts.Statement): ts.Identifier[] {
  if (ts.isFunctionDeclaration(stmt)) {
    return stmt.name ? [stmt.name] : [];
  }
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.map(({ name }) => name).filter(ts.isIdentifier);
  }
  return [];
}

/**
 * The symbol behind a top-level declaration — exported or not, which is what
 * the analyzer's own `findComponents` cannot reach and `renderMurky` needs.
 */
function symbolOf(file: string, name: string): ts.Symbol {
  const id = sourceFile(file)
    .statements.flatMap(declaredNames)
    .find((node) => node.text === name);
  const symbol = id && checker.getSymbolAtLocation(id);
  if (!symbol) {
    throw new Error(`no top-level ${name} declared in ${file}`);
  }
  return components.resolveAlias(symbol);
}

/** `tag@line`, the compact form of a call site this index hands back. */
function describeUsage(el: ts.JsxOpeningLikeElement): string {
  const { line } = el.getSourceFile().getLineAndCharacterOfPosition(el.getStart());
  return `${el.tagName.getText()}@${line + 1}`;
}

describe('createUsageIndex', () => {
  it('collects every JSX call site of a component and nothing else', () => {
    // Nine <Leaf/> in spread.tsx: one per forwarding component, one inside each
    // render callback, one dead one in Unrendered, and the spread in SpreadApp.
    // Intrinsics carry no symbol, so the <ul>/<b>/<div> around them are absent.
    expect(index.usagesOf(symbolOf('spread.tsx', 'Leaf')).map(describeUsage)).toEqual([
      'Leaf@44',
      'Leaf@49',
      'Leaf@54',
      'Leaf@59',
      'Leaf@64',
      'Leaf@70',
      'Leaf@80',
      'Leaf@85',
      'Leaf@121',
    ]);
  });

  it('files a usage under the declaration, not under the name it was rendered as', () => {
    // `export { Aliased as Public }`, rendered as <Public/> in app.tsx. Without
    // alias resolution this would be a second entry nothing ever asks about,
    // and Aliased would look like it had no call sites at all.
    expect(index.usagesOf(symbolOf('late.tsx', 'Aliased')).map(describeUsage)).toEqual(['Public@27']);
  });

  it('reports no usages for a component the Program never renders', () => {
    expect(index.usagesOf(symbolOf('legacy.tsx', 'Legacy'))).toEqual([]);
  });

  it('separates being called from being rendered', () => {
    // The distinction the walk needs: `renderMurky` has live callers no JSX
    // site can show, so its empty usage list must not read as dead code —
    // whereas Leaf, rendered nine times and called never, genuinely is not.
    expect(index.isCalled(symbolOf('spread.tsx', 'renderMurky'))).toBe(true);
    expect(index.usagesOf(symbolOf('spread.tsx', 'renderMurky'))).toEqual([]);
    expect(index.isCalled(symbolOf('spread.tsx', 'Leaf'))).toBe(false);
  });

  it('hands out one stable id per symbol', () => {
    const leaf = symbolOf('spread.tsx', 'Leaf');

    expect(index.symbolId(leaf)).toBe(index.symbolId(leaf));
    expect(index.symbolId(leaf)).not.toBe(index.symbolId(symbolOf('spread.tsx', 'Murky')));
    // Never rendered and never called, so the walk meets it only through the
    // caches keyed on this id — which still has to be an id.
    expect(index.symbolId(symbolOf('legacy.tsx', 'Legacy'))).toEqual(expect.any(Number));
  });
});
