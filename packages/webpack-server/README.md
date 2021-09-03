# Webpack Server

_This is a configuration for webpack which supports reload on changes_

## Usage

Installation with yarn:

```bash
$ yarn add @fxone/webpack-server -D
```

Add some scripts to your `package.json`:

```json
{
  // ...
  "scripts": {
    "dev": "webpack --watch --progress --config webpack.config.js"
  }
}
```

Create a `webpack.config.js` in your project directory, and set it up like so:

```js
var configure = require('@fxone/webpack-server');

module.exports = configure({
  entry: {
    // Add your bundles here, so in this case
    // ./src/app.js ==> ./dist/app-[hash].js
    app: './src/app.js',
  },

  // Override any other Webpack settings here!
  // see: https://webpack.js.org/configuration/
});
```

For monorepo add `webpack-node-externals`:

```js
const WebpackNodeExternals = require('webpack-node-externals');
{
  externals: [
    WebpackNodeExternals({
      allowlist: [/@fxone/],
      modulesDir: path.resolve(__dirname, '../../node_modules'),
    }),
  ],
}
```
