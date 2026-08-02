export interface LateProps {
  note?: string;
}

// Declared first, exported at the bottom — with and without a rename.
function Late({ note }: LateProps) {
  return <p>{note}</p>;
}

const Aliased = ({ note }: LateProps) => <p>{note}</p>;

export { Aliased as Public, Late };
