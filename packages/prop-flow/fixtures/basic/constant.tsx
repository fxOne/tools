// What makes a prop constant across its call sites, and what breaks the claim.
// Each component below is one case; `ConstantApp` at the bottom is the only
// render root in this file, so nothing here moves the counts the other fixtures
// assert.

export interface ChipProps {
  id: string;
  /** justified AND constant: two passes of one value, plus an omission */
  variant?: string;
}

export function Chip({ id, variant }: ChipProps) {
  return <b data-id={id} data-variant={variant} />;
}

export interface TileProps {
  id: string;
  /** constant with coverage=all: the omission lands on the same value */
  size?: string;
}

export function Tile({ id, size = 'md' }: TileProps) {
  return <i data-id={id} data-size={size} />;
}

export interface FlagProps {
  /** constant `true`: boolean shorthand carries a value without an expression */
  dense?: boolean;
  id: string;
}

export function Flag({ dense, id }: FlagProps) {
  return <u data-dense={dense} data-id={id} />;
}

export enum Tone {
  Danger = 'danger',
  Muted = 'muted',
}

const dangerTone = Tone.Danger;
const preset = { tone: Tone.Danger } as const;

export interface TagProps {
  id: string;
  /** constant: the same enum member written three different ways */
  tone?: Tone;
}

export function Tag({ id, tone }: TagProps) {
  return <em data-id={id} data-tone={tone} />;
}

export interface BlurProps {
  id: string;
  /** not constant: one call site computes its value, which could be anything */
  label?: string;
}

export function Blur({ id, label }: BlurProps) {
  return <s data-id={id}>{label}</s>;
}

function compute(): string {
  return 'computed';
}

export interface SoloProps {
  /** not constant: a single passing call site agrees only with itself */
  hint?: string;
  id: string;
}

export function Solo({ hint, id }: SoloProps) {
  return <q data-id={id}>{hint}</q>;
}

export interface HopProps {
  id: string;
  /** constant `'lg'`: what reaches it is Relay's default, not `undefined` */
  size?: string;
}

export function Hop({ id, size }: HopProps) {
  return <mark data-id={id} data-size={size} />;
}

export interface RelayProps {
  id: string;
  size?: string;
}

/** Carries a default, so an omission at ITS call sites forwards `'lg'` on. */
export function Relay({ id, size = 'lg' }: RelayProps) {
  return <Hop id={id} size={size} />;
}

export interface DimProps {
  id: string;
  /** not constant: the default the omissions fall back to is computed */
  size?: string;
}

export function Dim({ id, size }: DimProps) {
  return <small data-id={id} data-size={size} />;
}

/** The same absorption as Relay, but a computed default has no value to give. */
export function Vague({ id, size = compute() }: DimProps) {
  return <Dim id={id} size={size} />;
}

export interface KeepProps {
  id: string;
  /** constant, but only over the passes: the default is a different value */
  weight?: string;
}

export function Keep({ id, weight = 'bold' }: KeepProps) {
  return <strong data-id={id} data-weight={weight} />;
}

export interface DriftProps {
  id: string;
  /** the same split for the other reason: the default cannot be read at all */
  label?: string;
}

export function Drift({ id, label = compute() }: DriftProps) {
  return <cite data-id={id}>{label}</cite>;
}

export interface GaugeProps {
  id: string;
  /** constant `42`: a number is read off the type, exactly as a string is */
  span?: number;
}

export function Gauge({ id, span }: GaugeProps) {
  return <output data-id={id} data-span={span} />;
}

export interface ToggleProps {
  id: string;
  /** constant `true` written out: booleans are not `isLiteral()` literals */
  on?: boolean;
}

export function Toggle({ id, on }: ToggleProps) {
  return <label data-id={id} data-on={on} />;
}

export interface ReqProps {
  id: string;
  /** required, yet fed one and the same value everywhere — the --all-props case */
  kind: string;
}

export function Req({ id, kind }: ReqProps) {
  return <span data-id={id} data-kind={kind} />;
}

export function ConstantApp() {
  return (
    <div>
      <Chip id="c1" variant="danger" />
      <Chip id="c2" variant="danger" />
      <Chip id="c3" />
      <Tile id="t1" size="md" />
      <Tile id="t2" size="md" />
      <Tile id="t3" />
      <Flag dense id="f1" />
      <Flag dense id="f2" />
      <Tag id="enum" tone={Tone.Danger} />
      <Tag id="alias" tone={dangerTone} />
      <Tag id="member" tone={preset.tone} />
      <Blur id="b1" label="fixed" />
      <Blur id="b2" label={compute()} />
      <Solo hint="once" id="s1" />
      <Relay id="r1" />
      <Relay id="r2" />
      <Vague id="v1" />
      <Vague id="v2" />
      <Keep id="k1" weight="light" />
      <Keep id="k2" weight="light" />
      <Keep id="k3" />
      <Drift id="d1" label="fixed" />
      <Drift id="d2" label="fixed" />
      <Drift id="d3" />
      <Gauge id="g1" span={42} />
      <Gauge id="g2" span={42} />
      <Toggle id="tg1" on={true} />
      <Toggle id="tg2" on={true} />
      <Req id="q1" kind="primary" />
      <Req id="q2" kind="primary" />
    </div>
  );
}
