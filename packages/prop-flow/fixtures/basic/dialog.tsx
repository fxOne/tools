import { Frame } from './frame';

export interface DialogProps {
  caption?: string;
}

// Whole-object props parameter: the pass-through is `props.caption`.
export function Dialog(props: DialogProps) {
  return <Frame caption={props.caption} />;
}
