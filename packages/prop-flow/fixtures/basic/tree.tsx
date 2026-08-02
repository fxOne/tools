export interface TreeProps {
  depth?: number;
}

// Self-recursive: the pass-through graph loops back on itself.
export function Tree({ depth }: TreeProps) {
  return <Tree depth={depth} />;
}
