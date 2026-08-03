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
