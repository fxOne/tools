import betterTailwind from 'eslint-plugin-better-tailwindcss';

// One rule per point of the shared look: every fxOne app looks the same and
// differs only in its brand colours (ui-guidelines skill, @fxone/ui). Each
// pattern matches a whole class, so `(?:.*:)?` lets any variant prefix through.
const VARIANT = '^(?:.*:)?';

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES = 'bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|divide|decoration|placeholder|caret|accent|shadow|from|via|to';
// Spacing only — a position like `top-[50%]` has no scale step to replace it.
const SPACING_UTILITIES = 'p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]';

const restrict = [
  {
    message: '"$0" is a palette colour. Use a token (bg-card, text-muted-foreground, text-success, …); a domain colour becomes a named token in the app\'s CSS.',
    pattern: `${VARIANT}-?(?:${COLOR_UTILITIES})-(?:${PALETTE})-\\d{2,3}(?:\\/\\S+)?$`,
  },
  {
    message: '"$0" overrides a colour for dark mode. Tokens switch by themselves.',
    pattern: `^dark:(?:.*:)?(?:${COLOR_UTILITIES})-\\S+$`,
  },
  {
    message: '"$0" fades readable text. Secondary text is text-muted-foreground.',
    pattern: `${VARIANT}text-(?:foreground|card-foreground|popover-foreground|muted-foreground)\\/\\d+$`,
  },
  {
    message: '"$0" is an arbitrary size. Use the type scale (text-xs, text-sm, …).',
    pattern: `${VARIANT}text-\\[\\d[^\\]]*\\]$`,
  },
  {
    message: '"$0" is an arbitrary spacing value. Use the scale: 0.5 1 1.5 2 3 4 6 8.',
    pattern: `${VARIANT}-?(?:${SPACING_UTILITIES})-\\[[^\\]]+\\]$`,
  },
  // No fix: no-deprecated-classes rewrites bare `rounded` to `rounded-sm` on the
  // same range, and which side is right depends on the element.
  {
    message: '"$0" is outside the shared radii: rounded-md for controls, rows, badges; rounded-lg for panels, tables, dialogs.',
    pattern: `${VARIANT}rounded(?:-[trblse]{1,2})?(?:-(?:xs|sm|xl|2xl|3xl|4xl))?$`,
  },
  {
    fix: '$1font-semibold',
    message: '"$0" is heavier than the shared look allows: font-medium or font-semibold.',
    pattern: '^((?:.*:)?)font-(?:bold|extrabold|black)$',
  },
  {
    message: '"$0" spaces out letters; the shared look has no wide tracking or uppercase eyebrow labels.',
    pattern: `${VARIANT}tracking-(?:wide|wider|widest)$`,
  },
  {
    message: '"$0" stacks with margins. Use flex flex-col gap-*.',
    pattern: `${VARIANT}space-[xy]-\\S+$`,
  },
  {
    message: '"$0" is a gradient; the shared look has none.',
    pattern: `${VARIANT}bg-(?:gradient-to|linear|radial|conic)(?:-\\S+)?$`,
  },
];

/**
 * The Tailwind rules for an app on @fxone/ui. `entryPoint` is the app's CSS
 * entry (the file that imports @fxone/ui-tailwind), so class checks see its
 * tokens; `files` narrows where they apply.
 */
export default function tailwind({ entryPoint, files = ['**/*.tsx'] }) {
  return [
    {
      files,
      plugins: {
        'better-tailwindcss': betterTailwind,
      },
      rules: {
        // Also folds `h-4 w-4` into `size-4`, so enforce-shorthand-classes would
        // only report the same pair twice.
        'better-tailwindcss/enforce-canonical-classes': 'error',
        'better-tailwindcss/no-conflicting-classes': 'error',
        'better-tailwindcss/no-deprecated-classes': 'error',
        'better-tailwindcss/no-duplicate-classes': 'error',
        'better-tailwindcss/no-restricted-classes': ['error', { restrict }],
      },
      settings: {
        'better-tailwindcss': { entryPoint },
      },
    },
  ];
}
