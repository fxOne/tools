import { Badge } from './badge';
import { Button } from './button';

export interface CardProps {
  heading: string;
  /** feeds Button.title one level down */
  action?: string;
}

export function Card({ action, heading }: CardProps) {
  const tone = 'muted';
  return (
    <section>
      <Badge text={heading} tone={tone} />
      <Button label={heading} size="md" title={action} />
    </section>
  );
}
