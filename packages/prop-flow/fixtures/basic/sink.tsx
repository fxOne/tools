import type { RestProps } from './rest';

export interface SinkProps {
  data?: RestProps;
}

export function Sink({ data }: SinkProps) {
  return <pre>{JSON.stringify(data)}</pre>;
}
