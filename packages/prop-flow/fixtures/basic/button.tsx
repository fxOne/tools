export interface ButtonProps {
  label: string;
  /** justified: one caller passes it, one omits it */
  disabled?: boolean;
  /** caller-dead: nobody ever passes it */
  icon?: string;
  /** unnecessary-optional, with a default that is therefore never used */
  size?: string;
  /** justified, reached both directly and through a pass-through */
  title?: string;
}

export function Button({ disabled, icon, label, size = 'md', title }: ButtonProps) {
  return (
    <button data-icon={icon} data-size={size} disabled={disabled} title={title}>
      {label}
    </button>
  );
}
