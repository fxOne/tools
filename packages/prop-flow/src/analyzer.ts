import type * as TS from 'typescript';
import { defaultedBindings, isExported, unwrapToFn } from './ast.js';
import { createClassifier } from './classify.js';
import { createComponentFactory } from './component.js';
import type { Component } from './component.js';
import { locOf } from './paths.js';
import type { ConstantValue, DeclaredProp, PropAnalysis, Site, Verdict } from './types.js';
import type { TypeScriptApi } from './typescript-api.js';
import { createUsageIndex } from './usage-index.js';
import { literalValueOf } from './values.js';

/**
 * Below this, "always the same value" is trivially true: one passing call site
 * agrees with itself, and reporting that would fire on every single-use
 * component.
 */
const MIN_CONSTANT_SITES = 2;

export interface AnalyzerOptions {
  /** Paths in the output are printed relative to this directory. */
  readonly cwd: string;
  readonly program: TS.Program;
  readonly ts: TypeScriptApi;
}

/** What one JSX call site adds to the analysis of a prop. */
interface Contribution {
  readonly ambiguous: number;
  readonly omit: number;
  /** A value that could not be read as a literal — no constancy is claimable. */
  readonly poisoned: boolean;
  readonly real: number;
  /** One line per call site, except where absorbing a default splits it up. */
  readonly sites: readonly Site[];
  readonly values: readonly string[];
}

/** The counters a single call site can move — it always moves exactly one. */
type Counts = Partial<Pick<Contribution, 'ambiguous' | 'omit' | 'real'>>;

/** The raw accumulation of a walk, before `constant` is derived from it. */
interface Walk {
  readonly ambiguous: number;
  readonly omit: number;
  readonly poisoned: boolean;
  readonly real: number;
  readonly sites: readonly Site[];
  readonly values: ReadonlySet<string>;
  readonly verdict: Verdict;
}

export interface ListPropsOptions {
  /** Also list props declared without a `?` — the `--all-props` mode. */
  readonly includeRequired?: boolean;
}

export interface Analyzer {
  /** Walk every call site of `component` and classify how `propName` is fed. */
  analyse(component: Component, propName: string): PropAnalysis;
  /** Components exported from `sourceFile` that take a props parameter. */
  findComponents(sourceFile: TS.SourceFile): Component[];
  listProps(component: Component, options?: ListPropsOptions): DeclaredProp[];
}

export function createAnalyzer({ cwd, program, ts }: AnalyzerOptions): Analyzer {
  const checker = program.getTypeChecker();
  const components = createComponentFactory({ checker, ts });
  const classifier = createClassifier({ checker, components, ts });
  const index = createUsageIndex({ checker, components, program, ts });

  // Binding defaults per component, read once: the walk asks for them at every
  // pass-through, and again when it decides a constant's coverage.
  const defaultsById = new Map<number, Map<string, TS.Expression>>();

  return { analyse, findComponents, listProps };

  // ── core analysis ─────────────────────────────────────────────────────────

  function analyse(component: Component, propName: string): PropAnalysis {
    const result = walk(component, propName, new Set<string>());
    return {
      ambiguous: result.ambiguous,
      constant: constantOf(component, propName, result),
      omit: result.omit,
      real: result.real,
      sites: result.sites,
      verdict: result.verdict,
    };
  }

  /** Every call site of `component`, merged into counts, sites and values. */
  function walk(component: Component, propName: string, visited: Set<string>): Walk {
    const key = `${index.symbolId(component.symbol)}#${propName}`;
    if (visited.has(key)) {
      // A cycle in the pass-through graph. The first visit already counted
      // this subtree, so the repeat contributes nothing.
      return { ambiguous: 0, omit: 0, poisoned: false, real: 0, sites: [], values: new Set(), verdict: 'cycle' };
    }
    visited.add(key);

    const usages = index.usagesOf(component.symbol);
    const merged = merge(usages.map((el) => contributionOf(el, propName, visited)));

    return { ...merged, verdict: verdictOf(usages.length, merged.real, merged.omit, merged.ambiguous) };
  }

  /** Classify one call site, expanding a pass-through into what it bottoms out in. */
  function contributionOf(el: TS.JsxOpeningLikeElement, propName: string, visited: Set<string>): Contribution {
    const classified = classifier.classifyElement(el, propName);
    const loc = locOf(el, cwd);
    if (classified.kind === 'real') {
      return leaf({ real: 1 }, { kind: 'real', loc, note: classified.note }, classified.value);
    }
    if (classified.kind === 'omit') {
      return leaf({ omit: 1 }, { kind: 'omit', loc, note: classified.note });
    }
    if (classified.kind === 'manual') {
      return leaf({ ambiguous: 1 }, { kind: 'manual', loc, note: classified.note });
    }

    // The value is the enclosing component's own prop — climb.
    const sub = walk(classified.component, classified.prop, visited);
    if (sub.verdict === 'unused-component' && index.isCalled(classified.component.symbol)) {
      // The climb landed on a plain function taking an options object — a test
      // helper, say. It has callers, they just are not JSX, so the walk cannot
      // see them. Counting the empty subtree would turn an invisible pass into
      // a caller-dead: "delete the prop" on live code.
      const note = `${classified.component.name}.${classified.prop}: called, never rendered as JSX`;
      return leaf({ ambiguous: 1 }, { kind: 'manual', loc, note });
    }
    return absorbDefault(el, classified.component, classified.prop, sub);
  }

  /**
   * An omission one level up does not reach this call site as `undefined` when
   * the level above binds a default: `Relay({ size = 'lg' })` forwarding
   * `size` passes `'lg'`. So those omissions are converted into passes of the
   * default here — anything else reports a prop that is in fact always set as
   * `caller-dead`, and hands constancy the wrong value.
   */
  function absorbDefault(el: TS.JsxOpeningLikeElement, via: Component, viaProp: string, sub: Walk): Contribution {
    const loc = locOf(el, cwd);
    const trace = `${via.name}.${viaProp}`;
    const fallback = defaultsOf(via).get(viaProp);
    if (sub.omit === 0 || fallback === undefined) {
      // No omission for the default to catch, or no default to catch it.
      return {
        ambiguous: sub.ambiguous,
        omit: sub.omit,
        poisoned: sub.poisoned,
        real: sub.real,
        sites: [{ kind: 'passthrough', loc, via: trace }],
        values: [...sub.values],
      };
    }

    const value = literalValueOf(checker, ts, fallback);
    // Point at the omissions that just turned into passes: a lone pass-through
    // line above `passes=2` reads like a miscount. Only the omissions written
    // at this level are visible — ones arriving through a deeper pass-through
    // stay behind their own line, as every expanded count already does.
    const absorbed = sub.sites
      .filter((site) => site.kind === 'omit')
      .map((site): Site => ({ kind: 'real', loc: site.loc, note: 'the default fires here', via: trace }));
    return {
      ambiguous: sub.ambiguous,
      omit: 0,
      poisoned: sub.poisoned || value === null,
      real: sub.real + sub.omit,
      sites: [{ kind: 'passthrough', loc, note: 'omissions fall back to its default', via: trace }, ...absorbed],
      values: value === null ? [...sub.values] : [...sub.values, value],
    };
  }

  /** The one value every readable call site agreed on, if there is one. */
  function constantOf(component: Component, propName: string, result: Walk): ConstantValue | null {
    if (result.ambiguous > 0 || result.poisoned || result.real < MIN_CONSTANT_SITES) {
      return null;
    }
    const [value] = result.values;
    if (value === undefined || result.values.size > 1) {
      return null;
    }
    return { coverage: coverageOf(component, propName, result.omit, value), value };
  }

  /** Whether the omissions land on the value too — via the binding default. */
  function coverageOf(component: Component, propName: string, omit: number, value: string): ConstantValue['coverage'] {
    if (omit === 0) {
      return 'all';
    }
    const fallback = defaultsOf(component).get(propName);
    return fallback && literalValueOf(checker, ts, fallback) === value ? 'all' : 'passes';
  }

  // ── component + prop discovery ────────────────────────────────────────────

  function findComponents(sourceFile: TS.SourceFile): Component[] {
    return sourceFile.statements.flatMap((stmt) => componentsOfStatement(stmt)).filter(({ name }) => !isHook(name));
  }

  /** The components one top-level statement declares or exports. */
  function componentsOfStatement(stmt: TS.Statement): Component[] {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(ts, stmt)) {
      return compact([components.fromNode(stmt, stmt.name)]);
    }
    if (ts.isVariableStatement(stmt) && isExported(ts, stmt)) {
      return compact(stmt.declarationList.declarations.map((decl) => componentOfDeclaration(decl)));
    }
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier) {
      const clause = stmt.exportClause;
      // Declared first, exported later: `export { Card, Inner as Public }`.
      if (clause && ts.isNamedExports(clause)) {
        return compact(clause.elements.map((element) => components.fromExport(element)));
      }
    }
    return [];
  }

  /** The component `export const C = memo(() => …)` binds, if it binds one. */
  function componentOfDeclaration(decl: TS.VariableDeclaration): Component | null {
    if (!ts.isIdentifier(decl.name) || !decl.initializer) {
      return null;
    }
    const fn = unwrapToFn(ts, decl.initializer);
    return fn ? components.fromNode(fn, decl.name) : null;
  }

  function listProps(component: Component, { includeRequired = false }: ListPropsOptions = {}): DeclaredProp[] {
    const type = checker.getTypeAtLocation(component.paramNode);
    const defaults = defaultsOf(component);
    const out: DeclaredProp[] = [];
    for (const sym of type.getProperties()) {
      const optional = (sym.getFlags() & ts.SymbolFlags.Optional) !== 0;
      if ((optional || includeRequired) && !isVendored(sym)) {
        out.push({ optional, hasDefault: defaults.has(sym.getName()), name: sym.getName() });
      }
    }
    return out;
  }

  function defaultsOf(component: Component): Map<string, TS.Expression> {
    const id = index.symbolId(component.symbol);
    const known = defaultsById.get(id);
    if (known) {
      return known;
    }
    const defaults = defaultedBindings(ts, component.paramNode);
    defaultsById.set(id, defaults);
    return defaults;
  }

  /**
   * Whether the prop is declared only in a dependency. A component spreading
   * `React.ComponentProps<'button'>` inherits some 250 optional DOM and ARIA
   * props; a verdict on those is true but useless — the `?` is not the
   * author's to drop, and it drowns the props that are.
   */
  function isVendored(sym: TS.Symbol): boolean {
    const declarations = sym.getDeclarations() ?? [];
    return (
      declarations.length > 0 &&
      declarations.every((declaration) => program.isSourceFileFromExternalLibrary(declaration.getSourceFile()))
    );
  }
}

/**
 * A call site that bottoms out here: it moves one counter and contributes one
 * report line. Only a `real` site carries a value, and only a `real` one can
 * poison the constancy claim — a `manual` site already suppresses it through
 * `ambiguous`, and an omission has no value to be unreadable in the first place.
 */
function leaf(counts: Counts, site: Site, value: string | null = null): Contribution {
  return {
    ambiguous: counts.ambiguous ?? 0,
    omit: counts.omit ?? 0,
    poisoned: site.kind === 'real' && value === null,
    real: counts.real ?? 0,
    sites: [site],
    values: value === null ? [] : [value],
  };
}

/** Fold every call site's contribution into the walk's totals. */
function merge(contributions: readonly Contribution[]): Omit<Walk, 'verdict'> {
  return {
    ambiguous: total(contributions, 'ambiguous'),
    omit: total(contributions, 'omit'),
    poisoned: contributions.some((contribution) => contribution.poisoned),
    real: total(contributions, 'real'),
    sites: contributions.flatMap((contribution) => contribution.sites),
    values: new Set(contributions.flatMap((contribution) => contribution.values)),
  };
}

function total(contributions: readonly Contribution[], counter: keyof Counts): number {
  return contributions.reduce((sum, contribution) => sum + contribution[counter], 0);
}

export function verdictOf(usageCount: number, real: number, omit: number, ambiguous: number): Verdict {
  if (usageCount === 0) {
    return 'unused-component';
  }
  if (ambiguous > 0) {
    return 'manual';
  }
  if (real > 0 && omit > 0) {
    return 'justified';
  }
  if (real > 0) {
    return 'unnecessary-optional';
  }
  if (omit > 0) {
    return 'caller-dead';
  }
  return 'manual';
}

function compact<T>(values: readonly (T | null)[]): T[] {
  return values.filter((value) => value !== null);
}

/**
 * A `useX` taking an options object looks exactly like a component to the AST,
 * and it is not one: a hook has no JSX call sites, so every one of its options
 * comes back `unused-component`. That is not a finding, it is the walk pointed
 * at the wrong kind of function — the callers exist, they are just invisible to
 * a JSX walk. The `use` prefix is the one naming convention safe to key on;
 * lower-cased components are rare but legal, so PascalCase is not.
 *
 * Only *discovery* is narrowed. A prop that passes through a hook on its way
 * down is still traced, and still reported at the component that declares it.
 */
function isHook(name: string): boolean {
  return /^use[A-Z]/.test(name);
}
