# prop-flow

_Does an optional prop's `?` actually earn its keep?_

For one component prop, prop-flow walks every JSX call site across the whole
TypeScript Program and follows pass-through chains **up** the component tree,
across package boundaries, until each path bottoms out in a real source or an
omission. Then it says whether the `?` is justified, needless, or the prop is
fed `undefined` everywhere — the caller-side dead case that both `tsc` and
`knip` miss, because the prop _is_ used inside the component, just never
passed in.

Why this exists: when a prop is optional all the way up a chain, you can't tell
from one file whether the value ever originates anywhere. Removing one `?` just
chases the type error one level higher; tracing four or five props by hand is an
afternoon. This does the climb in one pass.

## Installation

```bash
$ pnpm add @fxone/prop-flow -D
```

Or without installing anything:

```bash
$ pnpm dlx @fxone/prop-flow <file>
```

TypeScript is an **optional** peer dependency — prop-flow deliberately ships
none of its own and loads the **target project's** compiler, resolved from the
current working directory, so it always analyses your code with the compiler
your code uses. Without a resolvable `typescript` it exits with a handled
error; it will not fall back to a compiler of its own.

## Usage

```bash
$ pnpm prop-flow <file> [propName] [--tsconfig <path>] [--all-props] [--json]
```

Run it **from the project root**. Both the compiler lookup and every relative
`<file>` resolve against the working directory of the process — and `pnpm -C
<dir>` does not set that, it only moves pnpm's own resolution. Invoked from
elsewhere you get a `File not found` naming a path under the wrong root, which
reads like a typo in the argument and is not one.

| argument       | meaning                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `<file>`       | a `.ts`/`.tsx` file containing the component(s) to inspect                                                          |
| `[propName]`   | one prop; omitted → every optional prop of every component exported from the file                                   |
| `--tsconfig`   | override the auto-discovered tsconfig — use the broadest "solution" config so call sites in other packages are seen |
| `--all-props`  | inspect required props too — reported only where they carry a constant value                                        |
| `--json`       | machine-readable output                                                                                             |

```
$ pnpm prop-flow src/Button.tsx title

tsconfig: tsconfig.json  (412 files in Program)
file:     src/Button.tsx

justified         Button.title
   passes=2  omits=2  ambiguous=0
     real        src/App.tsx:12:7 (string literal)
     omit        src/App.tsx:13:7
     passthrough src/Card.tsx:9:5 → Card.action
   → genuinely sometimes-absent. The `?` is correct.
```

## Batching over files

Under `--json` an invocation **that names a file** always emits exactly one
object on **stdout** — a report, or `{"error": "…"}` for a handled failure. So
a loop over the files you changed stays parsable even where one of them fails,
and the whole batch goes through a single `jq`:

```bash
$ for f in $CHANGED_TSX; do prop-flow "$f" --json; done | jq -s '
    [ .[] | select(.error | not) | .props[]
      | select(.verdict == "caller-dead" or .verdict == "unnecessary-optional"
               or .verdict == "manual" or .constant != null) ]'
```

An empty array means nothing was found — not that a filter missed it. Do not
filter the *text* output instead: the verdict labels are deliberately mixed
case (`justified` reads quietly, `CALLER-DEAD` does not), so a grep anchored on
one case silently drops the other, and an empty result then means either
"nothing found" or "wrong pattern".

Each invocation builds its own Program, which is the bulk of the runtime (~6 s
on a 4 000-file monorepo). So batch by *file* — passing a `propName` saves
nothing, and re-running a file to reformat its output costs a second Program.
Capture once.

The one thing `--json` does not wrap is the usage text: `--help`, and exit `1`
for an invocation with no file at all, print it plain. Both are answers to a
person rather than to a pipeline — and a loop that passes a file every time
cannot reach either.

## Verdicts

| verdict                | meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `justified`            | some call sites pass it, some omit it → the `?` earns its keep           |
| `unnecessary-optional` | every call site passes it → could be required                            |
| `caller-dead`          | no call site passes it → optional and always `undefined`                 |
| `unused-component`     | the component itself has no call sites in the Program                    |
| `manual`               | an unreadable spread or a contested override blocks a static conclusion  |
| `required`             | the prop has no `?` to judge — listed only for its constant value        |

Exit codes: `0` success, `1` nothing to do (usage printed), `2` a handled
failure (message on stderr, or `{"error": …}` on stdout under `--json`).

Nothing to analyse is a **success**, not a failure: a file with no exported
component — a route module, a props-less page — and a component whose props are
all required both come back with an empty report and exit `0`. They are
distinguishable: `components` is `0` in the first case. Exit `2` is reserved for
what genuinely blocked the analysis (a missing file, no resolvable compiler, a
tsconfig that does not span the file), so a loop over changed files can stop on
a real failure without stopping on a page component.

## Constant values

A prop that is passed the same value at every call site carries no information:
the value can be inlined and the prop dropped. That question is **orthogonal**
to the `?` — a prop can be `justified` (some call sites omit it) and still be
constant everywhere it is passed, which is the most interesting combination of
all. So it is reported as its own field rather than as a verdict:

```
justified         Chip.variant
   passes=2  omits=1  ambiguous=0
   constant="danger"  coverage=passes
     real        src/App.tsx:4:7 (string literal)
     real        src/App.tsx:5:7 (string literal)
     omit        src/App.tsx:6:7
   → genuinely sometimes-absent. The `?` is correct.
   → every passing call site sends "danger"; the value could be inlined.
```

Values are read off the **type**, not off the syntax, so `size="sm"`,
`size={'sm'}`, a `const SIZE = 'sm'`, an enum member and a property of an
`as const` object all resolve to the same value — and anything the checker
cannot pin to a single literal (a call, a parameter, a widened `let`) leaves
the claim unmade. `<C dense />` counts as `true`.

Two coverages: `passes` means every call site that passes the prop agrees; `all`
means nothing anywhere sees another value — either there are no omissions, or
the component's own binding default is that same value, so the omissions land
on it too. `all` is the case where the prop can go away entirely.

Nothing is reported below two passing sites — with one, "always the same value"
is trivially true. And constant does not mean wrong: `variant="danger"` on the
two delete buttons is constant and correct, which is why the hint stops at
"could be inlined".

`--all-props` widens *discovery* to required props, not the report: a required
prop shows up only when it actually carries a constant value, under the
`required` verdict. Without the flag the output is exactly as it was.

## API

The same analysis is available programmatically:

```ts
import { analyseProps, formatText } from '@fxone/prop-flow';

const report = analyseProps({ file: 'src/Button.tsx', prop: 'title' });
process.stdout.write(formatText(report));
```

`analyseProps` accepts `{ allProps, cwd, file, prop, ts, tsconfig }` and returns
a `Report`; passing `ts` injects a specific compiler instead of resolving one
from `cwd`.

## Limitations

Pass-throughs are followed through plain identifiers and `props.x` member
access, including inside render callbacks — a `props.x` in `items.map(…)` is
still traced to the surrounding component. When a level of the chain binds its
own default, an omission at *its* call sites is counted as a pass of that
default rather than as an omission at the leaf: `Relay({ size = 'lg' })`
forwarding `size` feeds `'lg'` down, not `undefined`. Those absorbed omissions
are listed individually, at the call site where the default fires:

```
NEEDLESS ?        Hop.size
   passes=2  omits=0  ambiguous=0
   constant="lg"  coverage=all
     passthrough src/Relay.tsx:9:10 → Relay.size (omissions fall back to its default)
     real        src/App.tsx:14:7 → Relay.size (the default fires here)
     real        src/App.tsx:15:7 → Relay.size (the default fires here)
```

Otherwise the counts are of *leaves*, not of lines: one pass-through site can
stand for a whole subtree of passes and omissions below it.

A constancy claim needs every call site to be readable. One `manual` site sinks
it — an unreadable spread could be carrying any value at all — as does a single
value the checker cannot pin to a literal.

A spread is only ambiguous when it can actually reach the prop. `{...x}` whose
type provably lacks the prop is skipped; `{...props}` and `{...rest}` are
followed one level up, and a spread of an object literal (or of a `const` bound
to one) is read key by key. What stays `manual`: a spread whose type cannot
answer the question (`any`, `Record<string, unknown>`, a union that carries the
prop in only some constituents), and an *optional* prop in a spread that
contests an earlier value — both outcomes are possible at runtime, so neither is
concluded. JSX ordering is respected throughout: in `<C title="x" {...props} />`
the spread wins.

Optional props a component only *inherits* from a dependency — the ~250 DOM and
ARIA props behind `React.ComponentProps<'button'>`, say — are not reported. A
verdict on them is true but useless: the `?` is not yours to drop, and they bury
the props that are. A prop redeclared in your own type is still reported.

A pass-through that climbs into a function which is *called* rather than
rendered — a `renderX({ … })` test helper, typically — also stays `manual`: its
callers exist but are invisible to a JSX walk, and counting them as zero would
report a live prop as `caller-dead`.

`prop={undefined}` counts as an omission — it is an omission dressed up as a
pass, so a prop that is only ever fed `undefined` still comes out as
`caller-dead`. A conditional expression that can evaluate to `undefined` counts
as a real source — the one false positive the tool accepts on purpose.

Components are picked up from `export function C`, `export const C = …`
(including `memo()` / `forwardRef()` wrappers), `export default function C` and
`export { C }` at the bottom of the file. A component re-exported through a
barrel is still found at its call sites, but must be inspected in the file that
declares it.

An exported `useX` taking an options object is skipped. It is indistinguishable
from a component to the AST and has no JSX call sites, so every one of its
options would come back `unused-component` — a statement about the walk, not
about the hook. Only discovery is narrowed: a prop that passes *through* a hook
on its way down is still traced, and still reported at the component that
declares it. The `use` prefix is the one naming convention safe to key on;
lower-cased components are rare but legal, so PascalCase is not.
