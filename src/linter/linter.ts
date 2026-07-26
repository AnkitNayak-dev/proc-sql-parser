import { Parser } from '../parser/parser.js';
import { Lexer } from '../lexer/lexer.js';
import { Token } from '../lexer/token.js';
import { Statement } from '../ast/types.js';
import { Diagnostic } from './diagnostics.js';
import { LintRule, defaultRules } from './rules.js';

export class Linter {
  private rules: LintRule[];

  constructor(rules: LintRule[] = defaultRules) {
    this.rules = rules;
  }

  public lint(input: string | { ast: Statement[]; tokens: Token[] }): Diagnostic[] {
    let ast: Statement[] = [];
    let tokens: Token[] = [];

    if (typeof input === 'string') {
      const lexer = new Lexer(input);
      tokens = lexer.tokenize();
      try {
        const parser = new Parser(tokens);
        ast = parser.parse();
      } catch (err) {
        // If parser throws, we can still run syntax/token rules
      }
    } else {
      ast = input.ast;
      tokens = input.tokens;
    }

    const diagnostics: Diagnostic[] = [];
    for (const rule of this.rules) {
      const ruleDiags = rule.check(ast, tokens);
      diagnostics.push(...ruleDiags);
    }

    return diagnostics;
  }
}
