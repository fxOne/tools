import eslint from '@eslint/js';
import eslintConfigPrettier from "eslint-config-prettier";
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRecommended from 'eslint-plugin-react/configs/recommended.js';
import sortKeysShorthand from 'eslint-plugin-sort-keys-shorthand';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    ...reactRecommended,
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: {
      'sort-keys-shorthand': sortKeysShorthand,
      react,
      reactHooks,
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
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/explicit-member-accessibility': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
        },
      ],
      indent: 'off',
      'react/react-in-jsx-scope': 'off',
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
    }
  },
  eslintConfigPrettier,
);