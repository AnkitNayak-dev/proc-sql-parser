import { Token, TokenType } from '../lexer/token.js';
import { ParseError } from './error.js';
import {
  Expression,
  LiteralExpr,
  ColumnRefExpr,
  CalculatedExpr,
  MacroVarExpr,
  UnaryExpr,
  BinaryExpr,
  FunctionCallExpr,
  SubqueryExpr,
  InListExpr,
  InSubqueryExpr,
  BetweenExpr,
  IsNullExpr,
  CaseExpr,
  CaseWhenBranch,
  CastExpr,
  StarExpr,
  ExistsExpr,
} from '../ast/types.js';
import { Parser } from './parser.js';

export function parseExpression(parser: Parser, minPrecedence = 0): Expression {
  let left = parsePrimaryExpression(parser);

  while (!parser.isAtEnd()) {
    const token = parser.peek();

    // Check infix operators
    const prec = getOperatorPrecedence(token);
    if (prec < minPrecedence) break;

    // Special infix syntax: IS [NOT] NULL
    if (parser.matchKeyword('IS')) {
      const isNot = parser.matchKeyword('NOT');
      parser.consumeKeyword('NULL');
      left = {
        type: 'IsNullExpr',
        expr: left,
        isNot,
        position: token.position,
      } as IsNullExpr;
      continue;
    }

    // Special infix syntax: [NOT] BETWEEN ... AND ...
    let isNotBetween = false;
    if (parser.matchKeyword('NOT') && parser.checkKeyword('BETWEEN')) {
      isNotBetween = true;
    }
    if (parser.matchKeyword('BETWEEN')) {
      const low = parseExpression(parser, 5); // higher precedence than AND
      parser.consumeKeyword('AND');
      const high = parseExpression(parser, 5);
      left = {
        type: 'BetweenExpr',
        expr: left,
        low,
        high,
        isNot: isNotBetween,
        position: token.position,
      } as BetweenExpr;
      continue;
    }

    // Special infix syntax: [NOT] IN (...)
    let isNotIn = false;
    if (parser.matchKeyword('NOT') && parser.checkKeyword('IN')) {
      isNotIn = true;
    }
    if (parser.matchKeyword('IN')) {
      parser.consume(TokenType.LParen, "Expected '(' after IN");
      if (parser.checkKeyword('SELECT')) {
        const subquery = parser.parseSelectStatement();
        parser.consume(TokenType.RParen, "Expected ')' after subquery in IN clause");
        left = {
          type: 'InSubqueryExpr',
          expr: left,
          subquery,
          isNot: isNotIn,
          position: token.position,
        } as InSubqueryExpr;
      } else {
        const list: Expression[] = [];
        if (!parser.check(TokenType.RParen)) {
          do {
            list.push(parseExpression(parser));
          } while (parser.match(TokenType.Comma));
        }
        parser.consume(TokenType.RParen, "Expected ')' after IN list");
        left = {
          type: 'InListExpr',
          expr: left,
          list,
          isNot: isNotIn,
          position: token.position,
        } as InListExpr;
      }
      continue;
    }

    // Standard binary operators
    if (isBinaryOperatorToken(token)) {
      parser.advance();
      const opValue = token.value.toUpperCase();
      if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
        throw new ParseError(`Expected expression after operator '${opValue}'`, token.position);
      }
      const right = parseExpression(parser, prec + 1);
      left = {
        type: 'BinaryExpr',
        operator: opValue,
        left,
        right,
        position: token.position,
      } as BinaryExpr;
      continue;
    }

    break;
  }

  return left;
}

function parsePrimaryExpression(parser: Parser): Expression {
  const token = parser.peek();

  // Comments skipping
  if (token.type === TokenType.Comment) {
    parser.advance();
    return parsePrimaryExpression(parser);
  }

  // Star / Table Star e.g. * or t.*
  if (token.type === TokenType.Operator && token.value === '*') {
    parser.advance();
    return {
      type: 'StarExpr',
      position: token.position,
    } as StarExpr;
  }

  // Literals
  if (token.type === TokenType.NumberLiteral) {
    parser.advance();
    const val = parseFloat(token.value);
    return {
      type: 'LiteralExpr',
      value: isNaN(val) ? token.value : val,
      raw: token.value,
      position: token.position,
    } as LiteralExpr;
  }

  if (token.type === TokenType.StringLiteral) {
    parser.advance();
    return {
      type: 'LiteralExpr',
      value: token.value,
      raw: `'${token.value}'`,
      position: token.position,
    } as LiteralExpr;
  }

  // SAS date/time/datetime literals: '01JAN2024'd, '10:30:00't, '01JAN2024:10:30:00'dt
  if (
    token.type === TokenType.DateLiteral ||
    token.type === TokenType.TimeLiteral ||
    token.type === TokenType.DateTimeLiteral
  ) {
    parser.advance();
    const suffix = token.type === TokenType.DateTimeLiteral ? 'dt' : token.type === TokenType.TimeLiteral ? 't' : 'd';

    if (token.type === TokenType.DateLiteral) {
      // Check if it looks like a datetime value with wrong suffix
      if (token.value.includes(':')) {
        throw new ParseError(
          `Value '${token.value}' looks like a datetime. Use the 'dt' suffix instead of 'd': '${token.value}'dt`,
          token.position,
        );
      }

      const dateRegex = /^\d{1,2}[A-Za-z]{3}\d{2,4}$/;
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthStr = token.value.replace(/^\d{1,2}/, '').replace(/\d{2,4}$/, '').toUpperCase();
      
      if (!token.value || !dateRegex.test(token.value) || !months.includes(monthStr)) {
        throw new ParseError(
          `Invalid SAS date literal value '${token.value}'d. Month '${monthStr}' is invalid.`,
          token.position,
        );
      }
    }

    if (token.type === TokenType.TimeLiteral) {
      const timeRegex = /^(\d{1,2}):(\d{2}):(\d{2})$/;
      const match = token.value.match(timeRegex);
      if (!match) {
        throw new ParseError(
          `Invalid SAS time literal '${token.value}'t. Expected format 'HH:MM:SS't.`,
          token.position,
        );
      }
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      if (hours > 23 || minutes > 59 || seconds > 59) {
        throw new ParseError(
          `Invalid SAS time literal '${token.value}'t. Hours must be 0-23, minutes and seconds 0-59.`,
          token.position,
        );
      }
    }

    return {
      type: 'LiteralExpr',
      value: token.value,
      raw: `'${token.value}'${suffix}`,
      position: token.position,
    } as LiteralExpr;
  }

  if (token.type === TokenType.MacroVariable || token.type === TokenType.MacroCall) {
    parser.advance();
    return {
      type: 'MacroVarExpr',
      name: token.value,
      position: token.position,
    } as MacroVarExpr;
  }

  // Colon host macro variable e.g. :var
  if (token.type === TokenType.Colon) {
    parser.advance();
    const idToken = parser.consume(TokenType.Identifier, "Expected identifier after ':' for macro variable binding");
    return {
      type: 'MacroVarExpr',
      name: `:${idToken.value}`,
      position: token.position,
    } as MacroVarExpr;
  }

  // SAS CALCULATED keyword
  if (parser.matchKeyword('CALCULATED')) {
    const colToken = parser.consume(TokenType.Identifier, "Expected column identifier after CALCULATED");
    return {
      type: 'CalculatedExpr',
      column: colToken.value,
      position: token.position,
    } as CalculatedExpr;
  }

  // Unary operators: -, +, NOT
  if (token.type === TokenType.Operator && (token.value === '-' || token.value === '+')) {
    parser.advance();
    const operand = parseExpression(parser, 8);
    return {
      type: 'UnaryExpr',
      operator: token.value,
      operand,
      position: token.position,
    } as UnaryExpr;
  }

  if (parser.matchKeyword('NOT')) {
    // Special case: NOT EXISTS (SELECT ...) => ExistsExpr with isNot: true
    if (parser.checkKeyword('EXISTS')) {
      parser.advance(); // consume EXISTS
      parser.consume(TokenType.LParen, "Expected '(' after EXISTS");
      const subquery = parser.parseSelectStatement();
      parser.consume(TokenType.RParen, "Expected ')' after EXISTS subquery");
      return {
        type: 'ExistsExpr',
        subquery,
        isNot: true,
        position: token.position,
      } as ExistsExpr;
    }
    const operand = parseExpression(parser, 3);
    return {
      type: 'UnaryExpr',
      operator: 'NOT',
      operand,
      position: token.position,
    } as UnaryExpr;
  }

  // EXISTS (SELECT ...) — standalone (without NOT)
  if (parser.matchKeyword('EXISTS')) {
    parser.consume(TokenType.LParen, "Expected '(' after EXISTS");
    const subquery = parser.parseSelectStatement();
    parser.consume(TokenType.RParen, "Expected ')' after EXISTS subquery");
    return {
      type: 'ExistsExpr',
      subquery,
      isNot: false,
      position: token.position,
    } as ExistsExpr;
  }

  // Parenthesized expression or Subquery (SELECT ...)
  if (token.type === TokenType.LParen) {
    parser.advance();
    if (parser.checkKeyword('SELECT')) {
      const query = parser.parseSelectStatement();
      parser.consume(TokenType.RParen, "Expected ')' after subquery");
      return {
        type: 'SubqueryExpr',
        query,
        position: token.position,
      } as SubqueryExpr;
    }
    const expr = parseExpression(parser);
    parser.consume(TokenType.RParen, "Expected ')' after parenthesized expression");
    return expr;
  }

  // CASE WHEN ... THEN ... ELSE ... END
  if (parser.matchKeyword('CASE')) {
    let caseBaseExpr: Expression | undefined;
    if (!parser.checkKeyword('WHEN')) {
      caseBaseExpr = parseExpression(parser);
    }

    const branches: CaseWhenBranch[] = [];
    while (parser.matchKeyword('WHEN')) {
      const whenExpr = parseExpression(parser);
      parser.consumeKeyword('THEN');
      const thenExpr = parseExpression(parser);
      branches.push({ when: whenExpr, then: thenExpr });
    }

    let elseExpr: Expression | undefined;
    if (parser.matchKeyword('ELSE')) {
      elseExpr = parseExpression(parser);
    }

    parser.consumeKeyword('END');

    return {
      type: 'CaseExpr',
      expr: caseBaseExpr,
      branches,
      elseExpr,
      position: token.position,
    } as CaseExpr;
  }

  // Identifiers / ColumnRefs / Function calls
  if (token.type === TokenType.Identifier || token.type === TokenType.Keyword) {
    const nameToken = parser.advance();
    const name = nameToken.value;

    // Check table.column or table.* syntax
    if (parser.match(TokenType.Dot)) {
      if (parser.match(TokenType.Operator) && parser.previous().value === '*') {
        return {
          type: 'StarExpr',
          table: name,
          position: token.position,
        } as StarExpr;
      }
      const colToken = parser.advance();
      return {
        type: 'ColumnRefExpr',
        table: name,
        column: colToken.value,
        position: token.position,
      } as ColumnRefExpr;
    }

    // Function call: name(...)
    if (parser.check(TokenType.LParen)) {
      parser.advance(); // consume (
      let isDistinct = false;
      if (parser.matchKeyword('DISTINCT')) {
        isDistinct = true;
      }
      const args: Expression[] = [];
      if (!parser.check(TokenType.RParen)) {
        do {
          if (parser.check(TokenType.Operator) && parser.peek().value === '*') {
            args.push({
              type: 'StarExpr',
              position: parser.peek().position,
            } as StarExpr);
            parser.advance();
          } else {
            args.push(parseExpression(parser));
          }
        } while (parser.match(TokenType.Comma));
      }
      parser.consume(TokenType.RParen, `Expected ')' after function arguments for ${name}`);
      return {
        type: 'FunctionCallExpr',
        name,
        args,
        isDistinct,
        position: token.position,
      } as FunctionCallExpr;
    }

    // Standard column reference
    return {
      type: 'ColumnRefExpr',
      column: name,
      position: token.position,
    } as ColumnRefExpr;
  }

  throw new ParseError(`Unexpected token '${token.value}'`, token.position);
}

function StarExprType(parser: Parser, token: Token): StarExpr {
  return {
    type: 'StarExpr',
    position: token.position,
  };
}

function isBinaryOperatorToken(token: Token): boolean {
  if (token.type === TokenType.Operator) {
    return ['+', '-', '*', '/', '=', '<>', '!=', '^=', '<', '>', '<=', '>=', '||'].includes(token.value);
  }
  if (token.type === TokenType.Keyword) {
    const val = token.value.toUpperCase();
    return ['AND', 'OR', 'LIKE', 'EQ', 'NE', 'GT', 'LT', 'GE', 'LE'].includes(val);
  }
  return false;
}

function getOperatorPrecedence(token: Token): number {
  if (token.type === TokenType.Keyword) {
    const val = token.value.toUpperCase();
    if (val === 'OR') return 1;
    if (val === 'AND') return 2;
    if (['LIKE', 'EQ', 'NE', 'GT', 'LT', 'GE', 'LE'].includes(val)) return 4;
  }
  if (token.type === TokenType.Operator) {
    const val = token.value;
    if (['=', '<>', '!=', '^=', '<', '>', '<=', '>='].includes(val)) return 4;
    if (val === '||') return 5;
    if (val === '+' || val === '-') return 6;
    if (val === '*' || val === '/') return 7;
  }
  return 0;
}
