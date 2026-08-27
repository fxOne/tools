/**
 * Verdict for one (component, prop) pair.
 *
 *   justified            some call sites pass it, some omit it → `?` earns it
 *   unnecessary-optional every call site passes it → could be required
 *   caller-dead          NO call site passes it → optional + always undefined
 *   unused-component     the component itself has no call sites in the Program
 *   manual               an unreadable spread, a dynamic value or a contested
 *                        override blocks a static conclusion → listed for a
 *                        human to check. Also where a `caller-dead` lands when
 *                        a pass-through below it came back empty: the counts
 *                        say "nobody passes it", but one of the sites they rest
 *                        on said nothing at all
 *   cycle                the pass-through graph looped back on itself; the
 *                        repeat visit contributes no new information
 *   required             the prop has no `?` to judge — listed only because it
 *                        carries a constant value (`--all-props`)
 */
export type Verdict =
  'caller-dead' | 'cycle' | 'justified' | 'manual' | 'required' | 'unnecessary-optional' | 'unused-component';

/**
 * `silent` is a `passthrough` whose subtree moved no counter at all. It is kept
 * apart because it is the one site that says nothing while looking like it
 * said something: the row below it is empty, and an empty subtree is
 * indistinguishable from a subtree that legitimately had nothing to add.
 */
export type SiteKind = 'manual' | 'omit' | 'passthrough' | 'real' | 'silent';

/** One JSX call site, classified. */
export interface Site {
  readonly kind: SiteKind;
  readonly loc: string;
  /** Why it was classified this way; a `passthrough` carries one only rarely. */
  readonly note?: string;
  /**
   * `Component.prop` the value was traced through. A `passthrough` and a
   * `silent` always carry one; so does a `real` site whose value is a default
   * that fired one level up, which is where the trace says *whose* default it
   * was.
   */
  readonly via?: string;
}

/**
 * The same value at every call site the walk could read. Orthogonal to
 * `Verdict`: a `justified` prop can be constant too, and that combination —
 * the `?` is correct, yet the prop carries no information — is the most
 * interesting finding of all.
 */
export interface ConstantValue {
  /** `all` — omissions land on the value too; `passes` — passing sites only. */
  readonly coverage: 'all' | 'passes';
  /** Printed as the checker prints it: `"sm"`, `true`, `42`, `Tone.Danger`. */
  readonly value: string;
}

/** Counts are of ULTIMATE leaves: pass-throughs are expanded, not counted. */
export interface PropAnalysis {
  readonly ambiguous: number;
  /** null unless at least two passing sites agree and none is unreadable. */
  readonly constant: ConstantValue | null;
  readonly omit: number;
  readonly real: number;
  readonly sites: readonly Site[];
  readonly verdict: Verdict;
}

export interface PropReport extends PropAnalysis {
  readonly component: string;
  readonly hasDefault: boolean;
  readonly prop: string;
}

export interface Report {
  /**
   * Exported components with a typed props object found in `file`. Zero is a
   * result, not a failure — a route module or a props-less page has none, and
   * that is the answer. It is what tells an empty `props` apart: no component
   * to look at, versus a component whose props are all required.
   */
  readonly components: number;
  /** tsconfig the Program was built from, relative to cwd. */
  readonly configPath: string;
  /** Inspected file, relative to cwd. */
  readonly file: string;
  /** Files in the Program — a sanity check that call sites are in scope. */
  readonly fileCount: number;
  readonly props: readonly PropReport[];
}

/** One prop a component declares, as the analysis sees it before walking. */
export interface DeclaredProp {
  /** The binding carries a default: `function C({ size = 'md' }: Props)`. */
  readonly hasDefault: boolean;
  readonly name: string;
  /** Declared with a `?`. Required props are listed only under `--all-props`. */
  readonly optional: boolean;
}
