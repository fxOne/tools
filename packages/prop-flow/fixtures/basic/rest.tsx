import { Sink } from './sink';

export interface RestProps {
  id: string;
  extra?: string;
}

// The rest object is passed as a VALUE, not spread: it always exists, so
// Sink.data counts as a real pass at this site.
export function Rest({ ...rest }: RestProps) {
  return <Sink data={rest} />;
}
