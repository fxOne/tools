import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import eslintConfigPrettier from "eslint-config-prettier";
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import sortKeysShorthand from 'eslint-plugin-sort-keys-shorthand';
import tseslint from 'typescript-eslint';

const stylisticConfig = stylistic.configs.customize({
  arrowParens: 'always',
  braceStyle: '1tbs',
  semi: true,
});

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat['jsx-runtime'],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: {
      'sort-keys-shorthand': sortKeysShorthand,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: true,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-check': 'allow-with-description',
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': 'allow-with-description',
        'ts-nocheck': 'allow-with-description',
      }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-floating-promises': 0,
      '@typescript-eslint/no-misused-promises': 0,
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
        },
      ],
      'sort-imports': 0,
      'sort-keys': 0,
      'sort-keys-shorthand/sort-keys-shorthand': [
        'error',
        'asc',
        {
          caseSensitive: true,
          ignoreSingleline: true,
          minKeys: 2,
          natural: false,
          shorthand: 'first',
        },
      ],
      curly: 'error',
      ...reactHooks.configs.recommended.rules,
    }
  },
  {
    ...stylisticConfig,
    rules: {
      ...stylisticConfig.rules,
      '@stylistic/jsx-one-expression-per-line': 0,
      '@stylistic/multiline-ternary': 0,
      '@stylistic/operator-linebreak': ['error', 'after'],
    },
  },
);