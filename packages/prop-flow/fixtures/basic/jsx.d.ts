// Minimal JSX typing so the fixture project needs no React types.
declare namespace JSX {
  type Element = unknown;

  interface IntrinsicElements {
    [name: string]: Record<string, unknown>;
  }
}
