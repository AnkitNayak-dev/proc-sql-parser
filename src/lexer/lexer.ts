import { Token, TokenType, Position } from './token.js';
import { isKeyword } from './keywords.js';

export class Lexer {
  private input: string;
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor(input: string) {
    this.input = input;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.isAtEnd()) break;

      const pos = this.getPosition();
      const ch = this.peek();

      // Comments: /* ... */ or * ... ; (SAS comment at start of statement)
      if (ch === '/' && this.peekNext() === '*') {
        tokens.push(this.readBlockComment(pos));
        continue;
      }

      // Macro Variable: &var
      if (ch === '&') {
        tokens.push(this.readMacroVariable(pos));
        continue;
      }

      // Macro Call: %macro
      if (ch === '%') {
        tokens.push(this.readMacroCall(pos));
        continue;
      }

      // Strings: '...' or "..."
      if (ch === "'" || ch === '"') {
        tokens.push(this.readString(pos, ch));
        continue;
      }

      // Numbers
      if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peekNext()))) {
        tokens.push(this.readNumber(pos));
        continue;
      }

      // Delimiters & Single Operators
      if (ch === ';') {
        this.advance();
        tokens.push({ type: TokenType.Semicolon, value: ';', position: pos });
        continue;
      }
      if (ch === ',') {
        this.advance();
        tokens.push({ type: TokenType.Comma, value: ',', position: pos });
        continue;
      }
      if (ch === ':') {
        this.advance();
        tokens.push({ type: TokenType.Colon, value: ':', position: pos });
        continue;
      }
      if (ch === '(') {
        this.advance();
        tokens.push({ type: TokenType.LParen, value: '(', position: pos });
        continue;
      }
      if (ch === ')') {
        this.advance();
        tokens.push({ type: TokenType.RParen, value: ')', position: pos });
        continue;
      }

      // Two-character operators or Dot
      if (ch === '.') {
        this.advance();
        tokens.push({ type: TokenType.Dot, value: '.', position: pos });
        continue;
      }

      // Operators: ||, <>, !=, <=, >=, =, +, -, *, /
      if (ch === '|' && this.peekNext() === '|') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.Operator, value: '||', position: pos });
        continue;
      }
      if (ch === '<') {
        this.advance();
        if (this.peek() === '>') {
          this.advance();
          tokens.push({ type: TokenType.Operator, value: '<>', position: pos });
        } else if (this.peek() === '=') {
          this.advance();
          tokens.push({ type: TokenType.Operator, value: '<=', position: pos });
        } else {
          tokens.push({ type: TokenType.Operator, value: '<', position: pos });
        }
        continue;
      }
      if (ch === '>') {
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          tokens.push({ type: TokenType.Operator, value: '>=', position: pos });
        } else {
          tokens.push({ type: TokenType.Operator, value: '>', position: pos });
        }
        continue;
      }
      if (ch === '!') {
        if (this.peekNext() === '=') {
          this.advance(); this.advance();
          tokens.push({ type: TokenType.Operator, value: '!=', position: pos });
          continue;
        }
      }
      if (ch === '^') {
        if (this.peekNext() === '=') {
          this.advance(); this.advance();
          tokens.push({ type: TokenType.Operator, value: '^=', position: pos });
          continue;
        }
      }
      if (['=', '+', '-', '*', '/'].includes(ch)) {
        this.advance();
        tokens.push({ type: TokenType.Operator, value: ch, position: pos });
        continue;
      }

      // Identifiers or Keywords
      if (this.isAlpha(ch) || ch === '_') {
        tokens.push(this.readIdentifierOrKeyword(pos));
        continue;
      }

      // Unknown character fallback
      this.advance();
      tokens.push({
        type: TokenType.Operator,
        value: ch,
        position: pos,
      });
    }

    tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.getPosition(),
    });

    return tokens;
  }

  private advance(): string {
    const ch = this.input[this.offset];
    this.offset++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private peek(): string {
    return this.input[this.offset] || '';
  }

  private peekNext(): string {
    return this.input[this.offset + 1] || '';
  }

  private isAtEnd(): boolean {
    return this.offset >= this.input.length;
  }

  private getPosition(): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.offset,
    };
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch) || ch === '_';
  }

  private readBlockComment(pos: Position): Token {
    this.advance(); // consume /
    this.advance(); // consume *
    let value = '';
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        break;
      }
      value += this.advance();
    }
    return { type: TokenType.Comment, value: value.trim(), position: pos };
  }

  private readMacroVariable(pos: Position): Token {
    this.advance(); // consume &
    let value = '&';
    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '.')) {
      const ch = this.advance();
      value += ch;
      if (ch === '.') break; // SAS macro variables often terminate with a dot
    }
    return { type: TokenType.MacroVariable, value, position: pos };
  }

  private readMacroCall(pos: Position): Token {
    this.advance(); // consume %
    let value = '%';
    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }
    return { type: TokenType.MacroCall, value, position: pos };
  }

  private readString(pos: Position, quote: string): Token {
    this.advance(); // consume opening quote
    let value = '';
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === quote) {
        // Double quote escaping e.g. 'don''t'
        if (this.peekNext() === quote) {
          value += quote;
          this.advance();
          this.advance();
        } else {
          this.advance(); // consume closing quote
          break;
        }
      } else {
        value += this.advance();
      }
    }

    // Check for SAS date/time/datetime literal suffix immediately after closing quote
    // 'dt' must be checked before 'd' and 't' individually
    const nextTwo = this.input.substring(this.offset, this.offset + 2).toLowerCase();
    const nextOne = this.input[this.offset]?.toLowerCase();

    if (nextTwo === 'dt' && !this.isAlphaNumeric(this.input[this.offset + 2] || '')) {
      this.advance(); this.advance(); // consume 'd' and 't'
      return { type: TokenType.DateTimeLiteral, value, position: pos };
    } else if (nextOne === 'd' && !this.isAlphaNumeric(this.input[this.offset + 1] || '')) {
      this.advance(); // consume 'd'
      return { type: TokenType.DateLiteral, value, position: pos };
    } else if (nextOne === 't' && !this.isAlphaNumeric(this.input[this.offset + 1] || '')) {
      this.advance(); // consume 't'
      return { type: TokenType.TimeLiteral, value, position: pos };
    }

    return { type: TokenType.StringLiteral, value, position: pos };
  }

  private readNumber(pos: Position): Token {
    let value = '';
    let hasDot = false;

    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (this.isDigit(ch)) {
        value += this.advance();
      } else if (ch === '.' && !hasDot && this.isDigit(this.peekNext())) {
        hasDot = true;
        value += this.advance();
      } else if ((ch === 'e' || ch === 'E') && value.length > 0) {
        value += this.advance();
        if (this.peek() === '+' || this.peek() === '-') {
          value += this.advance();
        }
      } else {
        break;
      }
    }
    return { type: TokenType.NumberLiteral, value, position: pos };
  }

  private readIdentifierOrKeyword(pos: Position): Token {
    let value = '';
    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    const type = isKeyword(value) ? TokenType.Keyword : TokenType.Identifier;
    return { type, value, position: pos };
  }
}
