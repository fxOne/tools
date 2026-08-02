import { describe, expect, it } from 'vitest';
import { formatJson, formatText, hint } from './report.js';
import type { PropReport, Report, Verdict } from './types.js';

function makeRow(overrides: Partial<PropReport> = {}): PropReport {
  return {
    ambiguous: 0,
    component: 'Button',
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

  it('says so when a component has no optional props at all', () => {
    expect(formatText(makeReport({ props: [] }))).toContain('No optional props found.');
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
  ])('%s (hasDefault=%s) advises %s', (verdict, hasDefault, expected) => {
    expect(hint(makeRow({ hasDefault, verdict }))).toContain(expected);
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
