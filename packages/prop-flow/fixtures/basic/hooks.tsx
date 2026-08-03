export interface UseFilterOptions {
  /** A hook option is shaped like a prop and is not one: no JSX site passes it. */
  initial?: string;
}

export function useFilter({ initial }: UseFilterOptions) {
  return initial ?? '';
}

export function FilterChip({ label }: { label?: string }) {
  return <span>{label}</span>;
}

/**
 * One character off the hook pattern, and a component. It is what the `[A-Z]`
 * in the pattern is for — and being lower-cased, it is also the case that rules
 * PascalCase out as the thing to key on.
 */
export function used({ tone }: { tone?: string }) {
  return <b>{tone}</b>;
}
