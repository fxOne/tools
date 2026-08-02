/**
 * Verdict for one (component, prop) pair.
 *
 *   justified            some call sites pass it, some omit it → `?` earns it
 *   unnecessary-optional every call site passes it → could be required
 *   caller-dead          NO call site passes it → optional + always undefined
 *   unused-component     the component itself has no call sites in the Program
 *   manual               a spread / rename / render-prop on the path blocks a
 *                        static conclusion → listed for a human to check
 *   cycle                the pass-through graph looped back on itself; the
 *                        repeat visit contributes no new information
 */
export type Verdict = 'caller-dead' | 'cycle' | 'justified' | 'manual' | 'unnecessary-optional' | 'unused-component';

export type SiteKind = 'manual' | 'omit' | 'passthrough' | 'real' | 'spread';

/** One JSX call site, classified. */
export interface Site {
  readonly kind: SiteKind;
  readonly loc: string;
  /** Why it was classified this way — `real`, `omit` and `manual` sites only. */
  readonly note?: string;
  /** `Component.prop` the value was traced to — `passthrough` sites only. */
  readonly via?: string;
}

/** Counts are of ULTIMATE leaves: pass-throughs are expanded, not counted. */
export interface PropAnalysis {
  readonly ambiguous: number;
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
  /** tsconfig the Program was built from, relative to cwd. */
  readonly configPath: string;
  /** Inspected file, relative to cwd. */
  readonly file: string;
  /** Files in the Program — a sanity check that call sites are in scope. */
  readonly fileCount: number;
  readonly props: readonly PropReport[];
}

export interface OptionalProp {
  /** The binding carries a default: `function C({ size = 'md' }: Props)`. */
  readonly hasDefault: boolean;
  readonly name: string;
}
