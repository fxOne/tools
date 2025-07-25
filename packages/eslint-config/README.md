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

**Important:** You must also install ESLint as a peer dependency:

```bash
$ npm install eslint -D
# or
$ pnpm add eslint -D
# or
$ yarn add eslint -D
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
