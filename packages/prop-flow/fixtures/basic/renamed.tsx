import { Frame } from './frame';

export interface RenamedProps {
  caption?: string;
}

// Renamed destructure: the local is `text`, the props key is `caption`.
export const Renamed = ({ caption: text }: RenamedProps) => <Frame caption={text} />;
