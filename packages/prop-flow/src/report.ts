import type { PropReport, Report, Verdict } from './types.js';

// Keyed by the full Verdict union, so a new verdict is a compile error here
// rather than a raw slug leaking into the output.
const LABELS: Record<Verdict, string> = {
  'caller-dead': 'CALLER-DEAD',
  'cycle': 'CYCLE',
  'justified': 'justified',
  'manual': 'MANUAL',
  'unnecessary-optional': 'NEEDLESS ?',
  'unused-component': 'UNUSED COMPONENT',
};

const LABEL_WIDTH = 16;

export function formatJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatText(report: Report): string {
  const head =
    `tsconfig: ${report.configPath}  (${report.fileCount} files in Program)\n` + `file:     ${report.file}\n\n`;
  if (report.props.length === 0) {
    return `${head}No optional props found.\n`;
  }
  return head + report.props.map(formatRow).join('');
}

function formatRow(row: PropReport): string {
  const suffix = row.hasDefault ? ' [has default]' : '';
  const lines = [
    `${LABELS[row.verdict].padEnd(LABEL_WIDTH)}  ${row.component}.${row.prop}${suffix}\n`,
    `   passes=${row.real}  omits=${row.omit}  ambiguous=${row.ambiguous}\n`,
  ];
  for (const site of row.sites) {
    lines.push(`     ${site.kind.padEnd(11)} ${site.loc}${siteSuffix(site.note, site.via)}\n`);
  }
  lines.push(hint(row), '\n');
  return lines.join('');
}

function siteSuffix(note: string | undefined, via: string | undefined): string {
  if (via) {
    return ` → ${via}`;
  }
  return note ? ` (${note})` : '';
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
      return '   → a spread / rename / dynamic value blocks a static verdict. Check the MANUAL sites by hand.\n';
    case 'unused-component':
      return '   → the component has no call sites in this Program. Verify the tsconfig spans its callers.\n';
    default:
      return '';
  }
}
