# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## To Be Released

## 2.0.0

- **BREAKING CHANGE**: `OptionalProp` is now `DeclaredProp`, with an added
  `optional` field, and `Analyzer.listOptionalProps` is now
  `listProps(component, { includeRequired })`
- **BREAKING CHANGE**: `PropAnalysis` carries a required `constant` field, so
  every `--json` row has one — `null` where there is no finding
- **BREAKING CHANGE**: `SiteKind` no longer has a `spread` member — former
  spread sites are now reported as `passthrough` / `real` / `omit` / `manual`
  with a note
- All three land in the library API and the `--json` shape; the CLI arguments
  and the text output only gained things
- Props that are passed the same value at every call site are reported as such.
  Values are read off the type, so `size="sm"`, a `const`, an enum member and a
  property of an `as const` object all resolve to one value; anything the
  checker cannot pin to a literal, and any `manual` site, leaves the claim
  unmade. `coverage: 'all'` says the omissions land on the value too, via the
  component's own default — that is the case where the prop can go away
- `--all-props` widens discovery to required props. They are reported only
  where they carry a constant value, under a new `required` verdict; without
  the flag the output is unchanged
- JSX spreads are resolved instead of being blanket-reported as `manual`: a
  spread whose type provably lacks the prop is skipped, `{...props}` and
  `{...rest}` are followed one level up, and a spread of an object literal (or
  of a `const` bound to one) is read key by key. Only a spread whose type cannot
  answer the question, or an optional prop in a spread contesting an earlier
  value, still requires a human
- Optional props declared only in a dependency are no longer reported. A
  component spreading `React.ComponentProps<'button'>` inherits some 250
  optional DOM and ARIA props; a verdict on those is true but not actionable,
  and it buried the props the author actually owns
- Fixed attribute precedence: `<C title="x" {...props} />` reported `"x"`, but
  JSX resolves last-wins, so the spread overrides the attribute
- Fixed pass-throughs inside render callbacks: `items.map(() => <C x={props.x}/>)`
  was classified as a local value, which could turn into a wrong `justified` or
  `unnecessary-optional`
- Fixed a pass-through into a prop that binds its own default: the omissions at
  that level were counted as omissions at the leaf, reporting a prop that is in
  fact always set as `caller-dead`. `Relay({ size = 'lg' })` forwarding `size`
  feeds `'lg'` down, and that is now what the counts and the value say. Each
  absorbed omission is listed at the call site where the default fires, so the
  pass count still lines up with the sites below it
- A pass-through that climbs into a function which is called rather than
  rendered (a `renderX({ … })` test helper) now reports `manual` instead of
  counting its invisible callers as zero, which would report a live prop as
  `caller-dead`

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
