export interface FrameProps {
  /** fed only through pass-throughs */
  caption?: string;
  /** caller-dead */
  tone?: string;
}

export function Frame(props: FrameProps) {
  return <div data-tone={props.tone}>{props.caption}</div>;
}
