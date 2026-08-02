// Every value shape a prop can be fed from, and what the classifier concludes
// about each. Three leaves keep the families apart: `Literal` collects the
// spreads that resolve down to a value, `Blocked` the ones that must not
// resolve, and `Direct` the values written on the element itself.
//
// A few shapes here deliberately do not type-check. prop-flow analyses whatever
// the compiler was handed — mid-refactor code included — so surviving them is
// part of the contract, and each one is called out where it appears.

interface NotedProps {
  id: string;
  /** manual: fed one of every shape the classifier knows */
  note?: string;
}

/** Collects the object-literal spreads that resolve down to a value. */
export function Literal({ id, note }: NotedProps) {
  return <b data-id={id}>{note}</b>;
}

/** Collects the spreads the classifier must refuse to resolve. */
export function Blocked({ id, note }: NotedProps) {
  return <i data-id={id}>{note}</i>;
}

/** Collects the values written as attributes on the element itself. */
export function Direct({ id, note }: NotedProps) {
  return <u data-id={id}>{note}</u>;
}

// ── object literals a spread resolves through ────────────────────────────────

const note = 'a local const';
const spreadIn = { note: 'from a nested spread' };
const key = 'note';

const shorthand: NotedProps = { id: 'shorthand', note };
const quoted: NotedProps = { id: 'quoted', 'note': 'a quoted key' };
const unset: NotedProps = { id: 'unset' };
const nested: NotedProps = { id: 'nested', ...spreadIn };
const computed = { id: 'computed', [key]: 'a computed key' };
const getter = {
  id: 'getter',
  get note() {
    return 'from a getter';
  },
};

export function LiteralSites() {
  return (
    <div>
      <Literal {...{ id: 'inline', note: 'an inline object literal' }} />
      <Literal {...shorthand} />
      <Literal {...quoted} />
      <Literal {...unset} />
      <Literal {...nested} />
      <Literal {...computed} />
      <Literal {...getter} />
    </div>
  );
}

// ── spreads that must stay unresolved ────────────────────────────────────────

interface WithNote {
  id: string;
  note?: string;
}

interface WithoutNote {
  id: string;
}

interface OtherOptional {
  id: string;
  other?: string;
}

/** No declared properties to read at all. */
declare const anything: any;
/** Only one constituent carries `note`, so the union cannot answer for it. */
declare const partlyNoted: WithNote | WithoutNote;
/** No constituent carries `note`, so the spread is provably irrelevant. */
declare const neverNoted: OtherOptional | WithoutNote;

// A `let` could be reassigned between its declaration and the call site below.
let reassignable: NotedProps = { id: 'reassignable', note: 'for now' };

const wrapper = { inner: { id: 'inner', note: 'from a destructured local' } };
const { inner } = wrapper;

function makeProps(): NotedProps {
  return { id: 'made', note: 'from a call' };
}

// A const, but initialised to something other than an object literal.
const fromCall = makeProps();

/** An anonymous function is bound to no name, so it names no component. */
export const renderers = [(props: NotedProps) => <Blocked {...props} />];

/** `options` is not the first parameter, so it names no component's props. */
function renderSecond(id: string, options: NotedProps) {
  return <Blocked id={id} {...options} />;
}

/** A class method is no component function, so its parameter is not props. */
class LegacyRenderer {
  render(props: NotedProps) {
    return <Blocked {...props} />;
  }
}

export function BlockedSites() {
  return (
    <div>
      <Blocked {...reassignable} />
      <Blocked {...fromCall} />
      <Blocked {...makeProps()} />
      <Blocked {...inner} />
      <Blocked id="any" {...anything} />
      <Blocked id="union" {...partlyNoted} />
      <Blocked id="disjoint" {...neverNoted} />
    </div>
  );
}

// ── values written on the element itself ─────────────────────────────────────

/** `config` is a destructured prop that is itself an object, not the props. */
export function Member({ config, id }: { config: { note?: string }; id: string }) {
  return <Direct id={id} note={config.note} />;
}

/** The destructure is a class method's, so it binds no component's props. */
class LegacyDestructured {
  render({ id, note }: NotedProps) {
    return <Direct id={id} note={note} />;
  }
}

export function DirectSites() {
  return (
    <div>
      {/* `absent` is undeclared on purpose: an identifier that resolves to
          nothing must not stop the walk. */}
      <Direct id="absent" note={absent} />
      {/* The value was commented out, leaving an attribute form with nothing
          to read. */}
      <Direct id="empty" note={/* nothing */} />
      {/* A tag that resolves to no symbol at all is not a call site. */}
      <Unknown.Tag note="ignored" />
    </div>
  );
}

// ── props the checker synthesises ────────────────────────────────────────────

type AllOptional = { [K in keyof NotedProps]?: NotedProps[K] };

/** A mapped type: the prop symbols belong to no declaration of their own, and
 *  must not be taken for a dependency's. */
export function Mapped({ id, note }: AllOptional) {
  return <em data-id={id}>{note}</em>;
}

// ── export shapes that name no component ─────────────────────────────────────

const catalogueName = 'sources';

// A call whose callee resolves to no symbol.
export const rendered = (() => 'nothing')();
// A name that does not exist: the specifier has no declaration to resolve to.
export { Absent };
// A type in an export list names no function.
export { NotedProps };
// A const in an export list, but not one that holds a function.
export { catalogueName };
// A destructured export: the declaration binds no identifier to look up.
export const { id: catalogueId } = shorthand;
