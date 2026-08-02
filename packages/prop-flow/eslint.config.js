import config from '@fxone/eslint-config';

export default [
  { ignores: ['coverage/**', 'dist/**', 'fixtures/**', 'eslint.config.js'] },
  ...config,
  {
    // No React in this package; a pinned version keeps eslint-plugin-react
    // from warning about a version it could never detect.
    settings: {
      react: {
        version: '19.0',
      },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
