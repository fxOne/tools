import type { VendorProps } from 'vendor';

export interface VendoredProps extends VendorProps {
  id: string;
  /** the only optional prop declared in this project rather than inherited */
  caption?: string;
}

export function Vendored({ caption, id }: VendoredProps) {
  return <em data-id={id}>{caption}</em>;
}
