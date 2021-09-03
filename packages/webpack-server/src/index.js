const merge = require('webpack-merge');
const path = require('path');
const webpack = require('webpack');
const WebpackNodeExternals = require('webpack-node-externals');

const ReloadServerPlugin = require('./webpack/ReloadServerPlugin');
const cwd = process.cwd();
const baseConfig = {
  devtool: 'eval-cheap-source-map',
  entry: {
    server: ['./src/index.ts'],
  },
  externals: [
    WebpackNodeExternals({
      allowlist: ['webpack/hot/poll?1000'],
    }),
  ],
  mode: 'development',
  module: {
    rules: [
      {
        include: /node_modules/,
        test: /\.mjs$/,
        type: 'javascript/auto',
      },
      {
        exclude: [/node_modules/],
        include: [path.join(cwd, 'src'), path.join(cwd, '../')],
        test: /\.(js|jsx|ts|tsx)?$/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  node: {
    __dirname: false,
  },
  output: {
    filename: 'server.js',
    path: path.resolve('build'),
  },
  plugins: [
    new ReloadServerPlugin({
      script: path.resolve('build', 'server.js'),
    }),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json', '.mjs'],
  },
  target: 'node',
};

module.exports = (overwrites) => merge(baseConfig, overwrites);
