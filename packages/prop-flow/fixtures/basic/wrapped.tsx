import { RemoteImpl } from './wrapped-impl';

// The wrapper shape panel.tsx does not cover: the wrapped function is
// DECLARED, and the wrapper call only names it. That gives one component two
// symbols — JSX renders `Chrome`, while a pass-through climbs into
// `ChromeComponent` — and a walk that keeps them apart finds no call site on
// the way up, which reads as "nobody passes this prop".

export interface StripeProps {
  /** justified: passed through Chrome, and omitted at a direct call site */
  loud?: boolean;
}

export function Stripe({ loud }: StripeProps) {
  return <hr data-loud={loud} />;
}

export interface ChromeProps {
  /** the prop the pass-through climbs to — declared on the inner function */
  highlight?: boolean;
}

function ChromeComponent({ highlight }: ChromeProps) {
  return <Stripe loud={highlight} />;
}

// Stand-in for React.memo, as in panel.tsx — here wrapping a name, not a
// function written out inside the call.
const memo = <T,>(component: T): T => component;

export const Chrome = memo(ChromeComponent);

// The same wrapper, but the name it hands to memo() is an IMPORT. Following it
// means resolving the alias first — the local name resolves to nothing.
export const Remote = memo(RemoteImpl);

// Wrapper arguments that name no function: one that does not exist at all, and
// one that names a type. Following a name must not turn either into a
// component — nor stop the walk on the way past.
export const Missing = memo(Absent);
export const Typed = memo(ChromeProps);
