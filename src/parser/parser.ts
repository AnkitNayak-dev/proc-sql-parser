import { Token, TokenType, Position } from '../lexer/token.js';
import { Lexer } from '../lexer/lexer.js';
import { ParseError } from './error.js';
import { Statement, ProcSqlBlock, SelectStatement, Expression } from '../ast/types.js';
import { parseProcSqlBlock, parseSingleStatement, parseSelectStatement } from './parseStatements.js';
import { parseExpression } from './parseExpressions.js';

export class Parser {
  private tokens: Token[];
  private current = 0;
  public errors: ParseError[] = [];

  constructor(input: string | Token[]) {
    if (typeof input === 'string') {
      const lexer = new Lexer(input);
      this.tokens = lexer.tokenize();
    } else {
      this.tokens = input;
    }
  }

  public parse(throwOnError = false): Statement[] {
    const statements: Statement[] = [];
    this.errors = [];
    while (!this.isAtEnd()) {
      if (this.check(TokenType.Semicolon)) {
        this.advance();
        continue;
      }
      if (this.check(TokenType.Comment)) {
        this.advance();
        continue;
      }
      try {
        if (this.checkKeyword('PROC')) {
          statements.push(parseProcSqlBlock(this));
        } else {
          statements.push(parseSingleStatement(this));
        }
      } catch (err: any) {
        if (err instanceof ParseError) {
          this.errors.push(err);
          this.synchronize();
        } else {
          throw err;
        }
      }
    }

    if (throwOnError && this.errors.length > 0) {
      throw this.errors[0];
    }

    return statements;
  }

  public synchronize(): void {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.Semicolon) return;

      const token = this.peek();
      if (token.type === TokenType.Keyword) {
        const kw = token.value.toUpperCase();
        if ([
          'SELECT', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER',
          'PROC', 'QUIT', 'EXIT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER'
        ].includes(kw)) {
          return;
        }
      }
      this.advance();
    }
  }

  public parseSelect(): SelectStatement {
    return parseSelectStatement(this);
  }

  public parseExpr(): Expression {
    return parseExpression(this);
  }

  // Token navigation helpers
  public isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  public peek(): Token {
    return this.tokens[this.current] || { type: TokenType.EOF, value: '', position: { line: 0, column: 0, offset: 0 } };
  }

  public peekNext(): Token {
    return this.tokens[this.current + 1] || { type: TokenType.EOF, value: '', position: { line: 0, column: 0, offset: 0 } };
  }

  public peekAt(offset: number): Token {
    return this.tokens[this.current + offset] || { type: TokenType.EOF, value: '', position: { line: 0, column: 0, offset: 0 } };
  }

  public previous(): Token {
    return this.tokens[this.current - 1];
  }

  public advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  public check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  public checkKeyword(keyword: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    return token.type === TokenType.Keyword && token.value.toUpperCase() === keyword.toUpperCase();
  }

  public match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  public matchKeyword(keyword: string): boolean {
    if (this.checkKeyword(keyword)) {
      this.advance();
      return true;
    }
    return false;
  }

  public consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParseError(message, this.peek().position);
  }

  public consumeKeyword(keyword: string): Token {
    if (this.checkKeyword(keyword)) return this.advance();
    throw new ParseError(`Expected keyword '${keyword}', got '${this.peek().value}'`, this.peek().position);
  }

  // Helper delegates for sub-parsers
  public parseSelectStatement(): SelectStatement {
    return parseSelectStatement(this);
  }
}
