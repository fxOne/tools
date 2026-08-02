export interface LegacyProps {
  hint?: string;
}

// Never rendered anywhere in the Program.
export function Legacy({ hint }: LegacyProps) {
  return <span>{hint}</span>;
}
