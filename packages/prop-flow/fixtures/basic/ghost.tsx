export interface GhostProps {
  /** Written out at every call site, but never with a value. */
  label?: string;
}

export function Ghost({ label }: GhostProps) {
  return <span>{label}</span>;
}
