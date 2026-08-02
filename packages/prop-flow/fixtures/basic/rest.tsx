import { Sink } from './sink';

export interface RestProps {
  id: string;
  extra?: string;
}

// Rest element in the props destructure: what `rest` holds is not decidable.
export function Rest({ ...rest }: RestProps) {
  return <Sink data={rest} />;
}
