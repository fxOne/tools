# prettier config

_This is a configuration for prettier_

## Installation

First, install the package:

```bash
$ npm install @fxone/prettier-config -D
# or
$ pnpm add @fxone/prettier-config -D
# or
$ yarn add @fxone/prettier-config -D
```

**Important:** You must also install prettier as a peer dependency:

```bash
$ npm install prettier -D
# or
$ pnpm add prettier -D
# or
$ yarn add prettier -D
```

Alternatively, use `npx install-peerdeps` to automatically install peer dependencies:

```bash
$ npx install-peerdeps @fxone/prettier-config --dev
```

## Usage

Create a `.prettierrc.js` file with the following content:

```js
module.exports = {
  ...require('@fxone/prettier-config'),
  //add overwrites here
};
```
