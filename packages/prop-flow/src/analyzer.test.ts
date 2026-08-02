import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAnalyzer, verdictOf } from './analyzer.js';
import type { Analyzer } from './analyzer.js';
import { readTsConfig } from './tsconfig.js';
import type { PropAnalysis, Site, Verdict } from './types.js';

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/basic');

let program: ts.Program;
let analyzer: Analyzer;

beforeAll(() => {
  // One Program for the whole file — building it is by far the slowest part.
  const parsed = readTsConfig(ts, resolve(FIXTURE_DIR, 'tsconfig.json'));
  program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
  analyzer = createAnalyzer({ cwd: FIXTURE_DIR, program, ts });
});

function sourceFile(file: string): ts.SourceFile {
  const found = program.getSourceFile(resolve(FIXTURE_DIR, file));
  if (!found) {
    throw new Error(`fixture ${file} is not part of the Program`);
  }
  return found;
}

function analyse(file: string, componentName: string, propName: string): PropAnalysis {
  const component = analyzer.findComponents(sourceFile(file)).find(({ name }) => name === componentName);
  if (!component) {
    throw new Error(`no exported component ${componentName} in ${file}`);
  }
  return analyzer.analyse(component, propName);
}

/** `kind` plus whatever the site carries as evidence — compact to assert on. */
function describeSite(site: Site): string {
  return `${site.kind} ${site.via ?? site.note ?? ''}`.trim();
}

describe('createAnalyzer', () => {
  it.each<[string, string, string, Verdict]>([
    ['badge.tsx', 'Badge', 'tone', 'justified'],
    ['button.tsx', 'Button', 'disabled', 'justified'],
    ['button.tsx', 'Button', 'icon', 'caller-dead'],
    ['button.tsx', 'Button', 'size', 'unnecessary-optional'],
    ['button.tsx', 'Button', 'title', 'justified'],
    ['card.tsx', 'Card', 'action', 'justified'],
    ['dialog.tsx', 'Dialog', 'caption', 'justified'],
    ['frame.tsx', 'Frame', 'caption', 'justified'],
    ['frame.tsx', 'Frame', 'tone', 'caller-dead'],
    ['ghost.tsx', 'Ghost', 'label', 'caller-dead'],
    ['late.tsx', 'Aliased', 'note', 'unnecessary-optional'],
    ['late.tsx', 'Late', 'note', 'justified'],
    ['legacy.tsx', 'Legacy', 'hint', 'unused-component'],
    ['panel.tsx', 'Panel', 'note', 'justified'],
    ['renamed.tsx', 'Renamed', 'caption', 'unnecessary-optional'],
    ['rest.tsx', 'Rest', 'extra', 'caller-dead'],
    ['sink.tsx', 'Sink', 'data', 'unnecessary-optional'],
    ['spread.tsx', 'Leaf', 'note', 'justified'],
    ['spread.tsx', 'Murky', 'note', 'manual'],
    ['tree.tsx', 'Tree', 'depth', 'unnecessary-optional'],
  ])('%s: %s.%s → %s', (file, component, prop, verdict) => {
    expect(analyse(file, component, prop).verdict).toBe(verdict);
  });

  it('expands a pass-through into the leaves it bottoms out in', () => {
    // Two direct call sites (one passes a literal, one omits) plus <Card/>,
    // which forwards its own `action` — itself passed once and omitted once.
    const result = analyse('button.tsx', 'Button', 'title');

    expect(result).toMatchObject({ ambiguous: 0, omit: 2, real: 2 });
    // Sites come out in Program order, which is not worth pinning — sort.
    expect(result.sites.map(describeSite).sort()).toEqual(['omit', 'passthrough Card.action', 'real string literal']);
    expect(result.sites.map(({ loc }) => loc).sort()).toEqual([
      expect.stringMatching(/^app\.tsx:\d+:\d+$/),
      expect.stringMatching(/^app\.tsx:\d+:\d+$/),
      expect.stringMatching(/^card\.tsx:\d+:\d+$/),
    ]);
  });

  it('follows a whole-object props parameter and a renamed destructure', () => {
    // <Frame caption={props.caption}/> in Dialog, <Frame caption={text}/> in
    // Renamed, where `text` is bound from the `caption` key.
    const result = analyse('frame.tsx', 'Frame', 'caption');

    expect(result).toMatchObject({ ambiguous: 0, omit: 1, real: 2 });
    expect(result.sites.map(describeSite).sort()).toEqual([
      'passthrough Dialog.caption',
      'passthrough Renamed.caption',
    ]);
  });

  it('counts an explicit undefined as an omission, not as a pass', () => {
    // Nothing but `label={undefined}` at every call site — the prop is fed
    // nothing anywhere, which is exactly the caller-side dead case.
    const ghost = analyse('ghost.tsx', 'Ghost', 'label');

    expect(ghost).toMatchObject({ ambiguous: 0, omit: 2, real: 0 });
    expect(ghost.sites.map(describeSite)).toEqual(['omit explicit undefined', 'omit explicit undefined']);
  });

  it('resolves every spread shape it can see through', () => {
    const result = analyse('spread.tsx', 'Leaf', 'note');

    expect(result).toMatchObject({ ambiguous: 0, omit: 3, real: 5 });
    expect(result.sites.map(describeSite).sort()).toEqual([
      'omit',
      'passthrough Forward.note',
      'passthrough ForwardRest.note',
      'passthrough List.note',
      'passthrough ListConst.note',
      'passthrough Multi.note',
      'passthrough Override.note',
      // Never rendered and never called — the site below it is dead code.
      'passthrough Unrendered.note',
      'real string literal',
    ]);
  });

  it('keeps the three spread shapes it must not resolve MANUAL', () => {
    // An unreadable spread type, a contested optional override, and a climb
    // into a plain helper whose callers this analysis cannot see.
    const result = analyse('spread.tsx', 'Murky', 'note');

    expect(result).toMatchObject({ ambiguous: 3, omit: 0, real: 0 });
    expect(result.sites.map(describeSite).sort()).toEqual([
      'manual an optional prop in a spread contests an earlier value',
      'manual renderMurky.note: called, never rendered as JSX',
      'manual spread of a type that cannot be read',
    ]);
  });

  it('reads a prop through a render callback instead of stopping at it', () => {
    // `items.map((item) => <Leaf note={props.note}/>)` — the nearest enclosing
    // function is the callback, so a lexical match would call this a local.
    const { sites } = analyse('spread.tsx', 'Leaf', 'note');

    expect(sites.filter(({ via }) => via === 'List.note')).toHaveLength(1);
    expect(sites.filter(({ via }) => via === 'ListConst.note')).toHaveLength(1);
  });

  it('resolves a spread of a typed const through its object literal', () => {
    // <Badge {...badgeProps}/> in app.tsx, where badgeProps sets `tone`.
    const badge = analyse('badge.tsx', 'Badge', 'tone');

    expect(badge).toMatchObject({ ambiguous: 0, omit: 1, real: 3 });
    expect(badge.sites.map(describeSite).sort()).toEqual([
      'omit explicit undefined',
      'real local value',
      'real string literal',
      'real string literal',
    ]);

    // The rest object is passed as a VALUE — it always exists, so it is real.
    const sink = analyse('sink.tsx', 'Sink', 'data');
    expect(sink.sites.map(describeSite)).toEqual(['real local value']);
  });

  it('terminates on a self-recursive component instead of looping', () => {
    const result = analyse('tree.tsx', 'Tree', 'depth');

    // The self-recursive call site is a pass-through back into Tree.depth: it
    // is reported, but the repeat visit contributes no counts.
    expect(result).toMatchObject({ ambiguous: 0, omit: 0, real: 1 });
    expect(result.sites.map(({ kind }) => kind).sort()).toEqual(['passthrough', 'real']);
    expect(result.sites.find(({ kind }) => kind === 'passthrough')?.via).toBe('Tree.depth');
  });

  it('finds exported components and their optional props', () => {
    expect(analyzer.findComponents(sourceFile('button.tsx')).map(({ name }) => name)).toEqual(['Button']);
    // memo()-wrapped arrow, assigned to an exported const.
    expect(analyzer.findComponents(sourceFile('panel.tsx')).map(({ name }) => name)).toEqual(['Panel']);
    // Exported at the bottom of the file — reported under their declared name.
    expect(analyzer.findComponents(sourceFile('late.tsx')).map(({ name }) => name)).toEqual(['Aliased', 'Late']);
    // App takes no props, so there is nothing to analyse in it.
    expect(analyzer.findComponents(sourceFile('app.tsx'))).toEqual([]);

    const [button] = analyzer.findComponents(sourceFile('button.tsx'));
    expect(button && analyzer.listOptionalProps(button)).toEqual([
      { hasDefault: false, name: 'disabled' },
      { hasDefault: false, name: 'icon' },
      { hasDefault: true, name: 'size' },
      { hasDefault: false, name: 'title' },
    ]);
  });

  it('skips optional props that are inherited from a dependency', () => {
    // VendoredProps extends an interface from node_modules: `hidden` and
    // `lang` are not the author's to drop, and they drown the ones that are.
    const [vendored] = analyzer.findComponents(sourceFile('vendored.tsx'));

    expect(vendored && analyzer.listOptionalProps(vendored)).toEqual([{ hasDefault: false, name: 'caption' }]);
  });
});

describe('verdictOf', () => {
  it.each<[number, number, number, number, Verdict]>([
    [0, 0, 0, 0, 'unused-component'],
    [3, 1, 1, 1, 'manual'],
    [2, 1, 1, 0, 'justified'],
    [2, 2, 0, 0, 'unnecessary-optional'],
    [2, 0, 2, 0, 'caller-dead'],
    [1, 0, 0, 0, 'manual'],
  ])('usages=%i real=%i omit=%i ambiguous=%i → %s', (usages, real, omit, ambiguous, verdict) => {
    expect(verdictOf(usages, real, omit, ambiguous)).toBe(verdict);
  });
});
