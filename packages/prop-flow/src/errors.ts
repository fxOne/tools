/**
 * A failure the user can act on: bad arguments, a missing file, a tsconfig
 * that does not span the file. The CLI turns these into a one-line message
 * on stderr; anything else escapes as a real crash with a stack.
 */
export class PropFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PropFlowError';
  }
}
