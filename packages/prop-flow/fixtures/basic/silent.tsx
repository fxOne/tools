// A `caller-dead` that a silent pass-through pulls back to MANUAL. `Base.note`
// is omitted at every call site the walk can read, and the one remaining site
// climbs into `Relayed`, which is rendered nowhere — so the subtree comes back
// empty and the counts say "nobody passes it" on the strength of a hole.

export interface BaseProps {
  id: string;
  /** manual: every readable caller omits it, one pass-through said nothing */
  note?: string;
}

export function Base({ id, note }: BaseProps) {
  return <b data-id={id}>{note}</b>;
}

export interface RelayedProps {
  id: string;
  note?: string;
}

/** Exported and forwards `note`, but rendered nowhere in the Program. */
export function Relayed(props: RelayedProps) {
  return <Base {...props} />;
}

export interface LoudProps {
  id: string;
  /** caller-dead: nothing but direct omissions — the guard is a no-op here */
  note?: string;
}

export function Loud({ id, note }: LoudProps) {
  return <i data-id={id}>{note}</i>;
}

export function SilentApp() {
  return (
    <div>
      <Base id="a" />
      <Base id="b" />
      <Loud id="c" />
      <Loud id="d" />
    </div>
  );
}
