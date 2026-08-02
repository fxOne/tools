import type { PropReport, Report, Site, Verdict } from './types.js';

// Keyed by the full Verdict union, so a new verdict is a compile error here
// rather than a raw slug leaking into the output.
const LABELS: Record<Verdict, string> = {
  'caller-dead': 'CALLER-DEAD',
  'cycle': 'CYCLE',
  'justified': 'justified',
  'manual': 'MANUAL',
  'required': 'required',
  'unnecessary-optional': 'NEEDLESS ?',
  'unused-component': 'UNUSED COMPONENT',
};

const LABEL_WIDTH = 16;
/** Widest `SiteKind`, so the locations of one row line up under each other. */
const SITE_KIND_WIDTH = 11;

export function formatJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatText(report: Report): string {
  const head =
    `tsconfig: ${report.configPath}  (${report.fileCount} files in Program)\n` + `file:     ${report.file}\n\n`;
  if (report.props.length === 0) {
    return `${head}No props to report.\n`;
  }
  return head + report.props.map(formatRow).join('');
}

function formatRow(row: PropReport): string {
  const suffix = row.hasDefault ? ' [has default]' : '';
  return [
    `${LABELS[row.verdict].padEnd(LABEL_WIDTH)}  ${row.component}.${row.prop}${suffix}\n`,
    `   passes=${row.real}  omits=${row.omit}  ambiguous=${row.ambiguous}\n`,
    row.constant ? `   constant=${row.constant.value}  coverage=${row.constant.coverage}\n` : '',
    ...row.sites.map(formatSite),
    hint(row),
    constantHint(row),
    '\n',
  ].join('');
}

function formatSite(site: Site): string {
  const trace = site.via ? ` → ${site.via}` : '';
  const evidence = site.note ? `${trace} (${site.note})` : trace;
  return `     ${site.kind.padEnd(SITE_KIND_WIDTH)} ${site.loc}${evidence}\n`;
}

export function hint(row: PropReport): string {
  switch (row.verdict) {
    case 'unnecessary-optional':
      if (row.hasDefault) {
        return '   → every caller passes it; the default is never used. Drop `?` (and the default).\n';
      }
      return '   → every caller passes it. Drop the `?` — make it required.\n';
    case 'caller-dead':
      if (row.hasDefault) {
        return '   → no caller ever passes it; the component always falls back to the default. Inline the default, remove the prop.\n';
      }
      return '   → no caller ever passes it; it is always `undefined` inside. Remove the prop and the code that reads it.\n';
    case 'justified':
      return '   → genuinely sometimes-absent. The `?` is correct.\n';
    case 'manual':
      return '   → an unreadable spread or a contested override blocks a static verdict. Check the MANUAL sites by hand.\n';
    case 'unused-component':
      return '   → the component has no call sites in this Program. Verify the tsconfig spans its callers.\n';
    // `required` and `cycle` have no advice of their own: what puts a required
    // row on screen at all is its constant value, and that hint is below.
    default:
      return '';
  }
}

/**
 * Constant does not mean wrong — `variant="danger"` on the two delete buttons
 * is constant and correct. So the wording stops at "could be inlined".
 */
export function constantHint(row: PropReport): string {
  if (!row.constant) {
    return '';
  }
  const { coverage, value } = row.constant;
  // `sees` rather than `sends`: under `all` even a call site that omits the
  // prop ends up on the value, because the component's own default is it.
  if (coverage === 'all') {
    return `   → every call site sees ${value}; the value could be inlined and the prop dropped.\n`;
  }
  return `   → every passing call site sends ${value}; the value could be inlined.\n`;
}
