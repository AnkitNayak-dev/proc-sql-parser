import { Position } from '../lexer/token.js';

export class ParseError extends Error {
  public position?: Position;

  constructor(message: string, position?: Position) {
    const posStr = position ? ` at line ${position.line}, column ${position.column}` : '';
    super(`${message}${posStr}`);
    this.name = 'ParseError';
    this.position = position;
  }
}
