# eslint config

_This is a configuration for eslint_

## Installation

First, install the package:

```bash
$ npm install @fxone/eslint-config -D
# or
$ pnpm add @fxone/eslint-config -D
# or
$ yarn add @fxone/eslint-config -D
```

**Important:** You must also install ESLint and its rule package as peer
dependencies:

```bash
$ npm install eslint @eslint/js -D
# or
$ pnpm add eslint @eslint/js -D
# or
$ yarn add eslint @eslint/js -D
```

Alternatively, use `npx install-peerdeps` to automatically install peer dependencies:

```bash
$ npx install-peerdeps @fxone/eslint-config --dev
```

## Usage

Create a `eslint.config.js` file with the following content:

```js
import config from '@fxone/eslint-config';

export default [
    ...config
];
```

## Tailwind

Apps built on `@fxone/ui` add the Tailwind rules. They keep every app on the
one shared look — tokens instead of palette colours, the shared radii,
weights and spacing scale — so a screen cannot quietly drift from the others.
Pass the app's CSS entry, the file that imports `@fxone/ui-tailwind`:

```js
import config from '@fxone/eslint-config';
import tailwind from '@fxone/eslint-config/tailwind';

export default [
    ...config,
    ...tailwind({ entryPoint: 'apps/web/src/app.css' }),
];
```

`files` (default `['**/*.tsx']`) narrows where the rules apply. Leave the
shadcn primitives under `@fxone/ui`'s `components/ui/` out; they are tuned
per mode on purpose.

## Formatting

This config formats through `@stylistic/eslint-plugin` — `eslint --fix` is the
formatter. Do not run Prettier alongside it: the two disagree on operator
line breaks, binary operand indentation and quoted properties, and each will
undo the other's output.
