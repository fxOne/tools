module.exports = {
  // Specifies the ESLint parser
  extends: [
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2020,
    // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  plugins: ['sort-keys-shorthand', 'react', 'prettier', 'react-hooks'],
  rules: {
    '@typescript-eslint/ban-ts-comment': 0,
    '@typescript-eslint/explicit-member-accessibility': 0,
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/no-non-null-assertion': 0,
    '@typescript-eslint/no-use-before-define': [
      'error',
      {
        functions: false,
      },
    ],
    indent: 'off',
    'prettier/prettier': ['error', {}, { usePrettierrc: true }], // Use our .prettierrc file as source
    'react/react-in-jsx-scope': 'off',
    'sort-imports': [
      'error',
      {
        ignoreCase: false,
        ignoreDeclarationSort: false,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
      },
    ],
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
  },
  settings: {
    linkComponents: [
      // Components used as alternatives to <a> for linking, eg. <Link to={ url } />
      'Hyperlink',
      { linkAttribute: 'to', name: 'Link' },
    ],
    propWrapperFunctions: [
      // The names of any function used to wrap propTypes, e.g. `forbidExtraProps`. If this isn't set, any propTypes wrapped in a function will be skipped.
      'forbidExtraProps',
      { object: 'Object', property: 'freeze' },
      { property: 'myFavoriteWrapper' },
    ],
    react: {
      createClass: 'createReactClass', // Regex for Component Factory to use,
      fragment: 'Fragment', // Fragment to use (may be a property of <pragma>), default to "Fragment"
      // default to "createReactClass"
      pragma: 'React', // Pragma to use, default to "React"
      version: 'detect', // React version. "detect" automatically picks the version you have installed.
      // You can also use `16.0`, `16.3`, etc, if you want to override the detected value.
      // default to latest and warns if missing
      // It will default to "detect" in the future
    },
  },
};