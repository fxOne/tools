import { Badge } from './badge';
import type { BadgeProps } from './badge';
import { Button } from './button';
import { Card } from './card';
import { Dialog } from './dialog';
import { Ghost } from './ghost';
import { Late, Public } from './late';
import { Panel } from './panel';
import { Renamed } from './renamed';
import { Rest } from './rest';
import { Tree } from './tree';
import { Chrome, Remote, Stripe } from './wrapped';

const badgeProps: BadgeProps = { text: 'spread', tone: 'info' };

export function App() {
  return (
    <main>
      <Button disabled label="save" size="lg" title="Save the document" />
      <Button label="cancel" size="sm" />
      <Card action="go" heading="one" />
      <Card heading="two" />
      <Dialog caption="hello" />
      <Dialog />
      <Renamed caption="renamed" />
      <Late note="late" />
      <Late />
      <Public note="public" />
      <Panel note="visible" />
      <Panel />
      <Tree depth={0} />
      <Rest id="r1" />
      <Badge text="warn" tone="warning" />
      <Badge text="none" tone={undefined} />
      <Ghost label={undefined} />
      <Ghost label={undefined} />
      <Badge {...badgeProps} />
      <Chrome highlight />
      <Chrome />
      {/* The omission that makes Stripe.loud caller-dead as long as the walk
          cannot see through <Chrome/> to the function it wraps. */}
      <Stripe />
      <Remote tint="cross-file" />
    </main>
  );
}
