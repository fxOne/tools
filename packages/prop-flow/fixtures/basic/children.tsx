// What reaches `children`, and what only looks like it does. Nesting is the one
// prop value written outside the attributes, so every shape below is invisible
// to a walk that reads attributes alone — and `children` is the prop where
// concluding "nobody passes it" does the most damage.
//
// `ChildrenApp` at the bottom is the only render root in this file, so nothing
// here moves the counts the other fixtures assert.

export interface SlotProps {
  /** justified: nested at most call sites, genuinely absent at others */
  children?: JSX.Element;
  id: string;
}

export function Slot({ children, id }: SlotProps) {
  return <div data-id={id}>{children}</div>;
}

export interface RelayedProps {
  /** justified: forwarded by nesting, which is a pass-through like any other */
  children?: JSX.Element;
  id: string;
}

export function Relayed({ children, id }: RelayedProps) {
  return <Slot id={id}>{children}</Slot>;
}

export interface ShellProps {
  /** unnecessary-optional: nested once, and never omitted */
  children?: JSX.Element;
  id: string;
}

/** Spreads its whole props object AND nests: the nesting is what arrives. */
export function Shell(props: ShellProps) {
  return <Slot {...props}>
    <b />
  </Slot>;
}

export function ChildrenApp() {
  return (
    <div>
      {/* Values that reach `children` */}
      <Slot id="element">
        <b />
      </Slot>
      <Slot id="text">plain text</Slot>
      <Slot id="expression">{'from an expression'}</Slot>
      <Slot id="several">
        <b />
        <i />
      </Slot>
      {/* An attribute is still read where nothing is nested… */}
      <Slot id="attribute" children={<i />} />
      {/* …and loses to the nesting where there is some. */}
      <Slot id="both" children={<i />}>
        <u />
      </Slot>

      {/* Nestings that reach nothing */}
      <Slot id="selfclosing" />
      <Slot id="empty"></Slot>
      <Slot id="blank">
      </Slot>
      <Slot id="comment">{/* nothing to render */}</Slot>
      <Slot id="explicit">{undefined}</Slot>

      {/* Forwarded rather than originated */}
      <Relayed id="relayed">
        <em />
      </Relayed>
      <Relayed id="relayed-bare" />
      <Shell id="shell">
        <s />
      </Shell>
    </div>
  );
}
