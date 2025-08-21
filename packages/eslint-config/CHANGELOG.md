# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## To Be Released

## 2.1.1

**Bug Fix**: Corrected the order of ESLint configurations to ensure the `curly` rule is properly enforced. The `eslint-config-prettier` preset is now correctly placed at the end of the configuration array to prevent it from overriding other rules.

## 2.1.0

-   **New Rules Added**:
    -   Enforced consistent curly brace usage for all control statements by adding the `curly: "error"` rule.
    -   Standardized operator placement by including the `@stylistic/operator-linebreak: ["error", "after"]` rule, which requires the operator to appear at the end of the line.

## 2.0.0

- **BREAKING CHANGE**: Move ESLint to peer dependencies
- Users must now install ESLint manually
- This prevents ESLint version conflicts between projects
- Updated installation instructions in README

## 1.5.1

- disable promise rules

## 1.5.0

- update dependencies

## 1.4.4

- adjust rules

## 1.4.3

- set `braceStyle: '1tbs'`

## 1.4.2

- set `arrowParens: 'always'`

## 1.4.1

- adjust rules

## 1.4.0

- add `@stylistic/eslint-plugin`

## 1.3.2

- Fixing issues with eslint 9

## 1.3.1

- Fixing issues with eslint 9

## 1.3.0

- Update to eslint 9

## 1.2.0

- Remove `@typescript-eslint/indent` as the project is using prettier

## 1.1.1

- Upgrade dependencies

## 1.0.0

- Initial release
