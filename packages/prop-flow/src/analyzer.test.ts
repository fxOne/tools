import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAnalyzer, verdictOf } from './analyzer.js';
import type { Analyzer } from './analyzer.js';
import { readTsConfig } from './tsconfig.js';
import type { ConstantValue, PropAnalysis, Site, Verdict } from './types.js';

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

/**
 * How often each site description occurs. Several distinct code shapes collapse
 * to the same verdict on purpose, so the multiset — not a sorted list — is what
 * says which of them were seen.
 */
function tally(sites: readonly Site[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const site of sites) {
    const key = describeSite(site);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

describe('createAnalyzer', () => {
  it.each<[string, string, string, Verdict]>([
    ['badge.tsx', 'Badge', 'tone', 'justified'],
    ['button.tsx', 'Button', 'disabled', 'justified'],
    ['button.tsx', 'Button', 'icon', 'caller-dead'],
    ['button.tsx', 'Button', 'size', 'unnecessary-optional'],
    ['button.tsx', 'Button', 'title', 'justified'],
    ['card.tsx', 'Card', 'action', 'justified'],
    ['children.tsx', 'Relayed', 'children', 'justified'],
    ['children.tsx', 'Shell', 'children', 'unnecessary-optional'],
    ['children.tsx', 'Slot', 'children', 'justified'],
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
    ['wrapped.tsx', 'Chrome', 'highlight', 'justified'],
    ['wrapped.tsx', 'Remote', 'tint', 'unnecessary-optional'],
    ['wrapped.tsx', 'Stripe', 'loud', 'justified'],
    ['wrapped-impl.tsx', 'Tinted', 'shade', 'unnecessary-optional'],
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

  it('resolves a spread of an object literal down to the key it sets', () => {
    // sources.tsx feeds <Literal/> one object-literal shape per call site.
    const result = analyse('sources.tsx', 'Literal', 'note');

    expect(tally(result.sites)).toEqual({
      // A nested spread and a computed key can both still be setting `note`.
      'manual a nested spread or computed key in the spread object': 2,
      // A getter is a value the classifier cannot follow to its source.
      'manual unrecognised object literal member': 1,
      'omit not set in the spread object': 1,
      // The shorthand `{ id, note }`, where `note` is a module-level const.
      'real local value': 1,
      // Written inline at the call site, and behind a quoted key.
      'real string literal': 2,
    });
  });

  it('refuses to resolve a spread whose value it cannot pin down', () => {
    const result = analyse('sources.tsx', 'Blocked', 'note');

    expect(tally(result.sites)).toEqual({
      'manual spread of CallExpression cannot be resolved': 1,
      // A reassignable `let`, a const holding a call's result, a destructured
      // local, a second parameter, a class method's parameter and an anonymous
      // function's — six ways to name an object the classifier cannot read.
      'manual spread of Identifier cannot be resolved': 6,
      // `any`, and a union carrying `note` in only some of its constituents.
      'manual spread of a type that cannot be read': 2,
      // A union no constituent of which has `note`: provably nothing to carry.
      'omit': 1,
    });
    expect(result.verdict).toBe('manual');
  });

  it('classifies attribute values that resolve to nothing', () => {
    const result = analyse('sources.tsx', 'Direct', 'note');

    expect(tally(result.sites)).toEqual({
      // `note={/* nothing */}` — an expression container with no expression.
      'manual unrecognised attribute form': 1,
      // An identifier resolving to no declaration, and one destructured in a
      // class method — neither names a prop of an enclosing component.
      'real local value': 2,
      // `config.note`, where `config` is a destructured prop, not the props.
      'real member value': 1,
    });
  });

  it('skips exports and tags that name no component', () => {
    // A missing name, a type, a plain const and a destructured declaration all
    // sit in sources.tsx and must be walked past rather than reported.
    expect(analyzer.findComponents(sourceFile('sources.tsx')).map(({ name }) => name)).toEqual([
      'Literal',
      'Blocked',
      'Direct',
      'Member',
      'Mapped',
    ]);
  });

  it('lists optional props a mapped type synthesised', () => {
    // `{ [K in keyof P]?: P[K] }` — the props are the checker's, not written
    // out anywhere, and `id` becomes optional only through the mapping.
    const mapped = analyzer.findComponents(sourceFile('sources.tsx')).find(({ name }) => name === 'Mapped');

    expect(mapped && analyzer.listProps(mapped)).toEqual([
      { hasDefault: false, name: 'id', optional: true },
      { hasDefault: false, name: 'note', optional: true },
    ]);
  });

  it('reads `children` off the nesting, which no attribute carries', () => {
    // The prop whose value is written between the tags rather than in the
    // attributes. Read attributes alone and every nesting looks like an
    // omission — on `children`, of all props, that ends in "nobody passes it".
    const result = analyse('children.tsx', 'Slot', 'children');

    expect(result).toMatchObject({ ambiguous: 0, omit: 6, real: 8 });
    expect(tally(result.sites)).toEqual({
      // Self-closing, `<C></C>`, whitespace between the tags, and a lone
      // comment — four ways to nest nothing at all.
      'omit': 4,
      'omit explicit undefined': 1,
      // Forwarded by nesting: a pass-through like any other.
      'passthrough Relayed.children': 1,
      // An attribute is still read wherever nothing is nested.
      'real JsxSelfClosingElement': 1,
      // An element, text, several children at once, `children={…}` beaten by a
      // nesting, and the spread that the nesting beats too.
      'real nested children': 5,
      // A lone `{expr}` is the one nesting whose value can be read.
      'real string literal': 1,
    });
  });

  it('lets a nesting beat a spread that would otherwise carry children', () => {
    // <Slot {...props}><b/></Slot>. The spread's type has `children`, so
    // without the nesting this resolves to a pass-through of Shell's own — the
    // nesting is what actually arrives, and it originates right here.
    const result = analyse('children.tsx', 'Shell', 'children');

    expect(result).toMatchObject({ ambiguous: 0, omit: 0, real: 1 });
    expect(result.sites.map(describeSite)).toEqual(['real nested children']);
  });

  it('climbs out of a function its export wraps by name', () => {
    // `export const Chrome = memo(ChromeComponent)`. The climb out of
    // <Stripe loud={highlight}/> lands on ChromeComponent, whose call sites are
    // written as <Chrome/> — a different symbol. Filed apart, the pass-through
    // contributes nothing, the lone <Stripe/> in app.tsx is all that is left,
    // and a prop that IS passed comes back caller-dead: "delete it" on live code.
    const result = analyse('wrapped.tsx', 'Stripe', 'loud');

    expect(result).toMatchObject({ ambiguous: 0, omit: 2, real: 1, verdict: 'justified' });
    // The <Chrome/> pass and the <Chrome/> omission are both counted through
    // the one pass-through line, as every expanded subtree is; the second omit
    // is the direct <Stripe/>. Reported under the name that declares the prop,
    // not under the binding the wrapper call was assigned to.
    expect(result.sites.map(describeSite).sort()).toEqual(['omit', 'passthrough ChromeComponent.highlight']);
  });

  it('climbs out of a wrapped function that lives in another file', () => {
    // `export const Remote = memo(RemoteImpl)` in wrapped.tsx, RemoteImpl in
    // wrapped-impl.tsx. The climb out of <Tinted shade={tint}/> lands on
    // RemoteImpl; every call site is a <Remote/> written elsewhere against the
    // binding. Both halves of the fix have to hold at once — peel the wrapper
    // AND follow the import alias — or this is a caller-dead again.
    const result = analyse('wrapped-impl.tsx', 'Tinted', 'shade');

    expect(result).toMatchObject({ ambiguous: 0, omit: 0, real: 1 });
    expect(result.sites.map(describeSite)).toEqual(['passthrough RemoteImpl.tint']);
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
    // The same wrapper over a function the call only NAMES: stopping at the
    // identifier leaves the file looking like it exports no component at all.
    // `Missing` and `Typed` wrap a name that resolves to nothing and one that
    // resolves to a type — following a name must not invent a component either.
    expect(analyzer.findComponents(sourceFile('wrapped.tsx')).map(({ name }) => name)).toEqual([
      'Stripe',
      'Chrome',
      // Wrapped by a name that is an import: the alias resolves before the peel.
      'Remote',
    ]);
    // Exported at the bottom of the file — reported under their declared name.
    expect(analyzer.findComponents(sourceFile('late.tsx')).map(({ name }) => name)).toEqual(['Aliased', 'Late']);
    // App takes no props, so there is nothing to analyse in it.
    expect(analyzer.findComponents(sourceFile('app.tsx'))).toEqual([]);
    // A `useX` taking an options object is indistinguishable from a component
    // to the AST, and has no JSX call sites — its options would come back
    // `unused-component`, which says nothing about the hook. `used` is the
    // near miss the pattern has to survive: `use` alone is not the signal, and
    // a lower-cased component is legal.
    expect(analyzer.findComponents(sourceFile('hooks.tsx')).map(({ name }) => name)).toEqual(['FilterChip', 'used']);

    const [button] = analyzer.findComponents(sourceFile('button.tsx'));
    expect(button && analyzer.listProps(button)).toEqual([
      { hasDefault: false, name: 'disabled', optional: true },
      { hasDefault: false, name: 'icon', optional: true },
      { hasDefault: true, name: 'size', optional: true },
      { hasDefault: false, name: 'title', optional: true },
    ]);
  });

  it('adds the props declared without a `?` only when asked to', () => {
    const [button] = analyzer.findComponents(sourceFile('button.tsx'));

    expect(button && analyzer.listProps(button, { includeRequired: true })[0]).toEqual({
      hasDefault: false,
      name: 'label',
      optional: false,
    });
  });

  it('skips optional props that are inherited from a dependency', () => {
    // VendoredProps extends an interface from node_modules: `hidden` and
    // `lang` are not the author's to drop, and they drown the ones that are.
    const [vendored] = analyzer.findComponents(sourceFile('vendored.tsx'));

    expect(vendored && analyzer.listProps(vendored)).toEqual([{ hasDefault: false, name: 'caption', optional: true }]);
  });
});

describe('constant values', () => {
  it.each<[string, string, ConstantValue | null]>([
    // Two passes agree, one call site omits it: the `?` is justified and the
    // value is still redundant.
    ['Chip', 'variant', { coverage: 'passes', value: '"danger"' }],
    // Same shape, but the binding default equals the value, so the omissions
    // land on it too — nothing anywhere sees anything else.
    ['Tile', 'size', { coverage: 'all', value: '"md"' }],
    ['Flag', 'dense', { coverage: 'all', value: 'true' }],
    // Written out, through a `const` alias and off an `as const` object: the
    // checker normalises all three to the one enum member.
    ['Tag', 'tone', { coverage: 'all', value: 'Tone.Danger' }],
    ['Blur', 'label', null],
    ['Solo', 'hint', null],
    ['Hop', 'size', { coverage: 'all', value: '"lg"' }],
    ['Dim', 'size', null],
    // A default the omissions land on, but not on what the passes send — so
    // the claim stops at the passes. `Drift` splits the same way for the other
    // reason: its default is a call, which cannot be shown to agree with
    // anything.
    ['Keep', 'weight', { coverage: 'passes', value: '"light"' }],
    ['Drift', 'label', { coverage: 'passes', value: '"fixed"' }],
    // Read off the type rather than the syntax: a number, and a boolean, which
    // is a union of two literal types and so not an `isLiteral()` literal.
    ['Gauge', 'span', { coverage: 'all', value: '42' }],
    ['Toggle', 'on', { coverage: 'all', value: 'true' }],
  ])('constant.tsx: %s.%s → %j', (component, prop, constant) => {
    expect(analyse('constant.tsx', component, prop).constant).toEqual(constant);
  });

  it('leaves a claim unmade where a single site cannot be read', () => {
    // Every MANUAL site could be feeding any value at all, so one of them is
    // enough to sink the claim even where every readable site agrees.
    expect(analyse('spread.tsx', 'Murky', 'note').constant).toBeNull();
  });

  it('absorbs an intermediate default instead of counting it as an omission', () => {
    // <Relay/> is rendered twice without `size`, but Relay defaults it to 'lg'
    // and forwards that on — so what reaches Hop is 'lg', not `undefined`.
    const result = analyse('constant.tsx', 'Hop', 'size');

    expect(result).toMatchObject({ ambiguous: 0, omit: 0, real: 2, verdict: 'unnecessary-optional' });
    // The two absorbed omissions get a line each, at the <Relay/> that omits
    // them — `passes=2` under a single pass-through line would read as a
    // miscount, and those locations are where the default actually fires.
    expect(result.sites.map(({ kind, note }) => `${kind} ${note ?? ''}`.trim())).toEqual([
      'passthrough omissions fall back to its default',
      'real the default fires here',
      'real the default fires here',
    ]);
    expect(result.sites.every(({ via }) => via === 'Relay.size')).toBe(true);
  });

  it('absorbs a default it cannot read without inventing a value for it', () => {
    // Vague defaults `size` to a call. The omissions are still passes — the
    // counts move — but what they pass is unknown, so no constant survives.
    const result = analyse('constant.tsx', 'Dim', 'size');

    expect(result).toMatchObject({ ambiguous: 0, constant: null, omit: 0, real: 2 });
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
