export interface PanelProps {
  note?: string;
}

// Stand-in for React.memo — the component sits inside a call expression.
const memo = <T,>(component: T): T => component;

export const Panel = memo(({ note }: PanelProps) => <div>{note}</div>);
