export interface TintedProps {
  /** unnecessary-optional, and only reachable across the wrapper AND the file
   *  boundary: the climb lands on RemoteImpl here, while every call site is a
   *  <Remote/> written against the binding wrapped.tsx exports. */
  shade?: string;
}

export function Tinted({ shade }: TintedProps) {
  return <q data-shade={shade} />;
}

export interface RemoteProps {
  /** unnecessary-optional: the one call site passes it, through the wrapper */
  tint?: string;
}

// The implementation half of a wrapper split across two files — wrapped.tsx
// imports this name and hands it to memo(). Resolving the wrapper argument has
// to follow the import alias, not just the local name.
export function RemoteImpl({ tint }: RemoteProps) {
  return <Tinted shade={tint} />;
}
