export interface BadgeProps {
  text: string;
  /** manual: reached through a spread and through an explicit undefined */
  tone?: string;
}

export function Badge({ text, tone }: BadgeProps) {
  return <span data-tone={tone}>{text}</span>;
}
