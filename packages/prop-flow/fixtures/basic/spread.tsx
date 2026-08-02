// Every JSX spread shape the analyzer resolves, plus the two it must refuse to.
// `Leaf` collects the resolvable cases, `Murky` the ones that stay MANUAL.

export interface LeafProps {
  id: string;
  /** justified: fed through spreads that resolve to passes and to omissions */
  note?: string;
}

export function Leaf({ id, note }: LeafProps) {
  return <b data-id={id}>{note}</b>;
}

export interface MurkyProps {
  id: string;
  /** manual: an unreadable spread type, and a contested optional override */
  note?: string;
}

export function Murky({ id, note }: MurkyProps) {
  return <i data-id={id}>{note}</i>;
}

export interface ForwardProps {
  id: string;
  note?: string;
}

export interface RequiredNoteProps {
  id: string;
  note: string;
}

interface DecorProps {
  className?: string;
}

const decor: DecorProps = { className: 'decor' };
const leafProps: LeafProps = { id: 'lit', note: 'from a literal' };
const record: Record<string, unknown> = { note: 'unreadable' };

/** Whole-object parameter spread. */
export function Forward(props: ForwardProps) {
  return <Leaf {...props} />;
}

/** Rest binding that still carries `note` — it was not destructured out. */
export function ForwardRest({ id, ...rest }: ForwardProps) {
  return <Leaf id={id} {...rest} />;
}

/** `note` is destructured away, so the rest type provably lacks it. */
export function DropNote({ note, ...rest }: ForwardProps) {
  return <Leaf {...rest} />;
}

/** The first spread cannot carry `note` and must not make the site ambiguous. */
export function Multi(props: ForwardProps) {
  return <Leaf {...decor} {...props} />;
}

/** The spread carries `note` as REQUIRED, so it overrides the attribute. */
export function Override(props: RequiredNoteProps) {
  return <Leaf note="overridden" {...props} />;
}

/** Never rendered and never called: the <Leaf/> inside it is dead code, and
 *  contributing nothing is the honest answer — unlike renderMurky below. */
export function Unrendered(props: ForwardProps) {
  return <Leaf {...props} />;
}

export interface ListProps {
  items: readonly string[];
  note?: string;
}

/** Render callback: the nearest enclosing function is not the component. */
export function List(props: ListProps) {
  return <ul>{props.items.map((item) => <Leaf id={item} note={props.note} />)}</ul>;
}

/** Same, but the mapped array is bound to a const first. */
export function ListConst(props: ListProps) {
  const rows = props.items.map((item) => <Leaf id={item} note={props.note} />);
  return <ul>{rows}</ul>;
}

/** The spread type has no readable properties at all. */
export function Opaque({ id }: MurkyProps) {
  return <Murky id={id} {...record} />;
}

/** An optional `note` in the spread may or may not override the attribute. */
export function Contested(props: ForwardProps) {
  return <Murky note="fallback" {...props} />;
}

interface MurkyOptions {
  note?: string;
}

// Not a component: it is CALLED, never rendered as JSX. Climbing into it would
// find no call sites, and counting that as "nobody passes note" is a lie.
function renderMurky(options: MurkyOptions) {
  return <Murky id="helper" {...options} />;
}

export const murkySnapshots = [renderMurky({ note: 'from a helper' }), renderMurky({})];

export function SpreadApp() {
  return (
    <div>
      <Forward id="f" note="forwarded" />
      <ForwardRest id="fr" />
      <DropNote id="dn" note="dropped" />
      <Multi id="m" note="multi" />
      <Override id="o" note="required" />
      <List items={[]} note="list" />
      <ListConst items={[]} />
      <Leaf {...leafProps} />
      <Opaque id="op" />
      <Contested id="c" />
    </div>
  );
}
