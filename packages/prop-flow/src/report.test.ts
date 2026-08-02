import { describe, expect, it } from 'vitest';
import { constantHint, formatJson, formatText, hint } from './report.js';
import type { PropReport, Report, Verdict } from './types.js';

function makeRow(overrides: Partial<PropReport> = {}): PropReport {
  return {
    ambiguous: 0,
    component: 'Button',
    constant: null,
    hasDefault: false,
    omit: 1,
    prop: 'title',
    real: 1,
    sites: [
      { kind: 'real', loc: 'src/app.tsx:3:5', note: 'string literal' },
      { kind: 'omit', loc: 'src/app.tsx:4:5' },
    ],
    verdict: 'justified',
    ...overrides,
  };
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    configPath: 'tsconfig.json',
    file: 'src/button.tsx',
    fileCount: 42,
    props: [makeRow()],
    ...overrides,
  };
}

describe('formatText', () => {
  it('renders the header, the counts, every site and the hint', () => {
    const report = makeReport({
      props: [
        makeRow(),
        makeRow({
          ambiguous: 0,
          hasDefault: true,
          omit: 0,
          prop: 'size',
          real: 2,
          sites: [
            { kind: 'real', loc: 'src/app.tsx:3:5', note: 'string literal' },
            { kind: 'passthrough', loc: 'src/card.tsx:9:7', via: 'Card.action' },
          ],
          verdict: 'unnecessary-optional',
        }),
      ],
    });

    expect(formatText(report)).toMatchInlineSnapshot(`
      "tsconfig: tsconfig.json  (42 files in Program)
      file:     src/button.tsx

      justified         Button.title
         passes=1  omits=1  ambiguous=0
           real        src/app.tsx:3:5 (string literal)
           omit        src/app.tsx:4:5
         → genuinely sometimes-absent. The \`?\` is correct.

      NEEDLESS ?        Button.size [has default]
         passes=2  omits=0  ambiguous=0
           real        src/app.tsx:3:5 (string literal)
           passthrough src/card.tsx:9:7 → Card.action
         → every caller passes it; the default is never used. Drop \`?\` (and the default).

      "
    `);
  });

  it('prints the constant value and names the absorbed pass-through', () => {
    const report = makeReport({
      props: [
        makeRow({
          constant: { coverage: 'all', value: '"lg"' },
          omit: 0,
          prop: 'size',
          real: 2,
          sites: [
            {
              kind: 'passthrough',
              loc: 'src/relay.tsx:4:5',
              note: 'omissions fall back to its default',
              via: 'Relay.size',
            },
          ],
          verdict: 'unnecessary-optional',
        }),
        makeRow({
          component: 'Req',
          constant: { coverage: 'passes', value: '"primary"' },
          prop: 'kind',
          verdict: 'required',
        }),
      ],
    });

    expect(formatText(report)).toContain('   constant="lg"  coverage=all\n');
    expect(formatText(report)).toContain(' → Relay.size (omissions fall back to its default)\n');
    expect(formatText(report)).toContain('every call site sees "lg"');
    expect(formatText(report)).toMatch(/^required\s+Req\.kind$/m);
    expect(formatText(report)).toContain('every passing call site sends "primary"');
  });

  it('says so when a component has nothing to report', () => {
    expect(formatText(makeReport({ props: [] }))).toContain('No props to report.');
  });
});

describe('hint', () => {
  it.each<[Verdict, boolean, string]>([
    ['unnecessary-optional', false, 'Drop the `?`'],
    ['unnecessary-optional', true, 'the default is never used'],
    ['caller-dead', false, 'Remove the prop'],
    ['caller-dead', true, 'Inline the default'],
    ['justified', false, 'The `?` is correct'],
    ['manual', false, 'Check the MANUAL sites'],
    ['unused-component', false, 'no call sites in this Program'],
    ['cycle', false, ''],
    // A required row's advice is the constancy hint; the verdict adds nothing.
    ['required', false, ''],
  ])('%s (hasDefault=%s) advises %s', (verdict, hasDefault, expected) => {
    expect(hint(makeRow({ hasDefault, verdict }))).toContain(expected);
  });
});

describe('constantHint', () => {
  it('stays at "could be inlined" — a constant value is not a defect', () => {
    expect(constantHint(makeRow({ constant: { coverage: 'passes', value: '"sm"' } }))).toContain('could be inlined');
    expect(constantHint(makeRow({ constant: { coverage: 'all', value: '"sm"' } }))).toContain('the prop dropped');
  });

  it('has nothing to say without a constant', () => {
    expect(constantHint(makeRow())).toBe('');
  });
});

describe('formatJson', () => {
  it('round-trips the report and ends with a newline', () => {
    const report = makeReport();
    const json = formatJson(report);

    expect(JSON.parse(json)).toEqual(report);
    expect(json.endsWith('\n')).toBe(true);
  });
});
