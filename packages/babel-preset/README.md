# Bebel preset

_This is a preset for babel with TypeScript support_

## Usage

Installation with yarn:

```bash
$ yarn add @fxone/babel-preset -D
```

Add some scripts to your `package.json`:

```json
{
  // ...
  "scripts": {
    "build": "babel src --extensions \".es6,.js,.es,.jsx,.mjs,.ts,.tsx\" --ignore *.spec.js --out-dir dist --copy-files --source-maps --verbose"
  }
}
```

Create a `babel.config.js` in your project directory, and set it up like so:

```js
module.exports = {
  presets: ['@fxone/babel-preset'],
};
```
