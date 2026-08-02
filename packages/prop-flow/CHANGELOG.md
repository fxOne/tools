# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## To Be Released

## 1.0.0

- Initial release
- `prop-flow <file> [propName]` traces an optional prop up every JSX call site
  in the whole TypeScript Program and reports whether its `?` is `justified`,
  an `unnecessary-optional`, or the prop is `caller-dead` — used inside the
  component but never passed in
- Follows pass-through chains across package boundaries, through destructured
  props, whole-object `props.x` access and renamed bindings
- Components are found via `export function`, `export const` (including
  `memo()` / `forwardRef()` wrappers), `export default function` and
  `export { C }`
- `--tsconfig` to pin the solution config, `--json` for machine-readable output
- Loads the target project's own `typescript`, so it runs against any TS
  project without installing a second compiler
- Also usable as a library: `analyseProps()`, `formatText()`, `formatJson()`
