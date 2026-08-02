export interface BadgeProps {
  text: string;
  /** justified: passed directly, through a resolved spread, and left undefined once */
  tone?: string;
}

export function Badge({ text, tone }: BadgeProps) {
  return <span data-tone={tone}>{text}</span>;
}
