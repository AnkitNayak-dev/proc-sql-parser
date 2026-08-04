import { TokenType } from '../lexer/token.js';
import { Parser } from './parser.js';
import { ParseError } from './error.js';
import { parseExpression } from './parseExpressions.js';
import {
  Statement,
  ProcSqlBlock,
  ProcSqlOption,
  SelectStatement,
  CreateTableStatement,
  CreateViewStatement,
  CreateIndexStatement,
  InsertStatement,
  UpdateStatement,
  DeleteStatement,
  DropStatement,
  AlterTableStatement,
  SelectItem,
  TableRef,
  JoinClause,
  JoinType,
  IntoClause,
  IntoTarget,
  OrderByItem,
  ColumnDefinition,
  UpdateSetClause,
} from '../ast/types.js';

export function parseProcSqlBlock(parser: Parser): ProcSqlBlock {
  const startToken = parser.consumeKeyword('PROC');
  parser.consumeKeyword('SQL');

  // Options up to the terminating semicolon ;
  const options: ProcSqlOption[] = [];
  const sqlStatementKeywords = ['SELECT', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER'];
  while (!parser.check(TokenType.Semicolon) && !parser.isAtEnd()) {
    // If we hit a SQL statement keyword before finding ';', the PROC SQL semicolon is missing
    const nextVal = parser.peek().value.toUpperCase();
    if (sqlStatementKeywords.includes(nextVal)) {
      throw new ParseError(
        "Expected ';' after PROC SQL. Did you forget the semicolon?",
        parser.peek().position,
      );
    }

    const optToken = parser.advance();
    let optValue: string | undefined;

    if (parser.match(TokenType.Operator) && parser.previous().value === '=') {
      const valToken = parser.advance();
      optValue = valToken.value;
    }

    options.push({
      name: optToken.value.toUpperCase(),
      value: optValue,
      position: optToken.position,
    });
  }
  parser.consume(TokenType.Semicolon, "Expected ';' after PROC SQL options");

  // Inner statements until QUIT or EOF
  const statements: Statement[] = [];
  while (!parser.checkKeyword('QUIT') && !parser.checkKeyword('EXIT') && !parser.isAtEnd()) {
    if (parser.match(TokenType.Comment) || parser.match(TokenType.Semicolon)) {
      continue;
    }
    try {
      const stmt = parseSingleStatement(parser);
      if (stmt) {
        statements.push(stmt);
      }
    } catch (err: any) {
      if (err instanceof ParseError) {
        parser.errors.push(err);
        parser.synchronize();
      } else {
        throw err;
      }
    }
  }

  if (parser.checkKeyword('QUIT') || parser.checkKeyword('EXIT')) {
    parser.advance();
    parser.consume(TokenType.Semicolon, "Expected ';' after QUIT");
  } else {
    parser.errors.push(
      new ParseError(
        "PROC SQL block is missing a terminating 'QUIT;' statement.",
        parser.peek().position,
      ),
    );
  }

  return {
    type: 'ProcSqlBlock',
    options,
    statements,
    position: startToken.position,
  };
}

export function parseSingleStatement(parser: Parser): Statement {
  // Skip extra comments or semicolons if any
  while (parser.match(TokenType.Semicolon) || parser.match(TokenType.Comment)) {}

  if (parser.checkKeyword('SELECT')) {
    const stmt = parseSelectStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }
  if (parser.checkKeyword('CREATE')) {
    const stmt = parseCreateStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }
  if (parser.checkKeyword('INSERT')) {
    const stmt = parseInsertStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }
  if (parser.checkKeyword('UPDATE')) {
    const stmt = parseUpdateStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }
  if (parser.checkKeyword('DELETE')) {
    const stmt = parseDeleteStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }
  if (parser.checkKeyword('DROP')) {
    const stmt = parseDropStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }
  if (parser.checkKeyword('ALTER')) {
    const stmt = parseAlterTableStatement(parser);
    parser.match(TokenType.Semicolon);
    return stmt;
  }

  const token = parser.peek();
  throw new ParseError(`Unexpected statement starting with '${token.value}'`, token.position);
}

export function parseSelectStatement(parser: Parser): SelectStatement {
  const startToken = parser.consumeKeyword('SELECT');

  let isDistinct = false;
  if (parser.matchKeyword('DISTINCT')) {
    isDistinct = true;
  }

  const columns: SelectItem[] = [];
  do {
    const nextKw = parser.peek().value.toUpperCase();
    if (['FROM', 'INTO', 'WHERE', 'GROUP', 'HAVING', 'ORDER'].includes(nextKw) || parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
      if (columns.length === 0) {
        throw new ParseError("Expected column expression after SELECT", parser.peek().position);
      } else {
        throw new ParseError("Unexpected trailing comma or missing expression in SELECT column list", parser.peek().position);
      }
    }

    const expr = parseExpression(parser);
    let alias: string | undefined;
    let label: string | undefined;
    let format: string | undefined;

    // Optional AS alias or direct alias
    if (parser.matchKeyword('AS')) {
      const aliasToken = parser.advance();
      alias = aliasToken.value;
    }

    // Optional SAS column properties: LABEL='...' FORMAT=...
    if (parser.matchKeyword('LABEL')) {
      if (parser.match(TokenType.Operator) && parser.previous().value === '=') {
        const lblToken = parser.consume(TokenType.StringLiteral, "Expected string for LABEL");
        label = lblToken.value;
      }
    }
    if (parser.matchKeyword('FORMAT')) {
      if (parser.match(TokenType.Operator) && parser.previous().value === '=') {
        format = parser.advance().value;
      }
    }

    columns.push({
      type: 'SelectItem',
      expr,
      alias,
      label,
      format,
      position: expr.position,
    });
  } while (parser.match(TokenType.Comma));

  // INTO clause (SAS macro host variable binding)
  let into: IntoClause | undefined;
  if (parser.matchKeyword('INTO')) {
    into = parseIntoClause(parser);
  }

  // FROM clause
  let from: TableRef | undefined;
  let joins: JoinClause[] | undefined;
  if (parser.matchKeyword('FROM')) {
    from = parseTableRef(parser);

    // Parse JOINs
    joins = [];
    while (isJoinStart(parser)) {
      joins.push(parseJoinClause(parser));
    }
  }

  // WHERE clause
  let where;
  if (parser.matchKeyword('WHERE')) {
    if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
      throw new ParseError("Expected expression after WHERE", parser.peek().position);
    }
    where = parseExpression(parser);
  }

  // GROUP BY clause
  let groupBy;
  if (parser.matchKeyword('GROUP')) {
    parser.consumeKeyword('BY');
    if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
      throw new ParseError("Expected column or expression after GROUP BY", parser.peek().position);
    }
    groupBy = [];
    do {
      groupBy.push(parseExpression(parser));
    } while (parser.match(TokenType.Comma));
  }

  // HAVING clause
  let having;
  if (parser.matchKeyword('HAVING')) {
    if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
      throw new ParseError("Expected expression after HAVING", parser.peek().position);
    }
    having = parseExpression(parser);
  }

  // ORDER BY clause
  let orderBy: OrderByItem[] | undefined;
  if (parser.matchKeyword('ORDER')) {
    parser.consumeKeyword('BY');
    if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
      throw new ParseError("Expected column or expression after ORDER BY", parser.peek().position);
    }
    orderBy = [];
    do {
      const expr = parseExpression(parser);
      let direction: 'ASC' | 'DESC' | undefined;
      if (parser.matchKeyword('ASC')) direction = 'ASC';
      else if (parser.matchKeyword('DESC')) direction = 'DESC';

      orderBy.push({
        type: 'OrderByItem',
        expr,
        direction,
        position: expr.position,
      });
    } while (parser.match(TokenType.Comma));
  }

  return {
    type: 'SelectStatement',
    isDistinct,
    columns,
    into,
    from,
    joins,
    where,
    groupBy,
    having,
    orderBy,
    position: startToken.position,
  };
}

function parseIntoClause(parser: Parser): IntoClause {
  const targets: IntoTarget[] = [];
  let separatedBy: string | undefined;

  do {
    let varToken = parser.peek();
    let name = '';

    if (varToken.type === TokenType.Colon) {
      parser.advance();
      const id = parser.consume(TokenType.Identifier, "Expected variable name after ':'");
      name = `:${id.value}`;
    } else if (varToken.type === TokenType.MacroVariable || varToken.type === TokenType.Identifier) {
      parser.advance();
      name = varToken.value.startsWith(':') || varToken.value.startsWith('&') ? varToken.value : `:${varToken.value}`;
    } else {
      throw new ParseError(`Expected variable binding in INTO clause, got '${varToken.value}'`, varToken.position);
    }

    // Check range INTO :var1 - :var3 or THROUGH / THRU
    if (
      (parser.check(TokenType.Operator) && parser.peek().value === '-') ||
      parser.checkKeyword('THROUGH') ||
      parser.checkKeyword('THRU')
    ) {
      parser.advance(); // consume - or THROUGH
      let endToken = parser.peek();
      let endName = '';
      if (endToken.type === TokenType.Colon) {
        parser.advance();
        const endId = parser.consume(TokenType.Identifier, "Expected variable name after ':'");
        endName = `:${endId.value}`;
      } else {
        parser.advance();
        endName = endToken.value.startsWith(':') ? endToken.value : `:${endToken.value}`;
      }

      targets.push({
        type: 'RangeIntoTarget',
        startVariable: name,
        endVariable: endName,
      });
    } else {
      targets.push({
        type: 'SingleIntoTarget',
        variableName: name,
      });
    }

    // Check SEPARATED BY ', '
    if (parser.matchKeyword('SEPARATED')) {
      parser.consumeKeyword('BY');
      const strToken = parser.consume(TokenType.StringLiteral, "Expected string after SEPARATED BY");
      separatedBy = strToken.value;
      break;
    }
  } while (parser.match(TokenType.Comma));

  return {
    type: 'IntoClause',
    targets,
    separatedClause: separatedBy ? { by: separatedBy } : undefined,
  };
}

function parseTableRef(parser: Parser): TableRef {
  if (parser.match(TokenType.LParen)) {
    const subquery = parseSelectStatement(parser);
    parser.consume(TokenType.RParen, "Expected ')' after table subquery");
    parser.matchKeyword('AS');
    const aliasToken = parser.consume(TokenType.Identifier, "Expected alias for table subquery");
    return {
      type: 'SubqueryTableRef',
      subquery,
      alias: aliasToken.value,
      position: aliasToken.position,
    };
  }

  if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
    throw new ParseError("Expected table name", parser.peek().position);
  }

  const firstToken = parser.advance();
  let library: string | undefined;
  let tableName = firstToken.value;

  if (parser.match(TokenType.Dot)) {
    library = tableName;
    const tableToken = parser.advance();
    tableName = tableToken.value;
  }

  let alias: string | undefined;
  if (parser.checkKeyword('AS')) {
    if (parser.peekNext().value.toUpperCase() !== 'SELECT') {
      parser.advance(); // consume AS keyword
      alias = parser.advance().value; // consume alias name
    }
  } else if (
    (parser.check(TokenType.Identifier) || parser.check(TokenType.Keyword)) &&
    !parser.checkKeyword('AS') &&
    !isJoinKeyword(parser.peek().value) &&
    !parser.checkKeyword('WHERE') &&
    !parser.checkKeyword('GROUP') &&
    !parser.checkKeyword('HAVING') &&
    !parser.checkKeyword('ORDER') &&
    !parser.checkKeyword('VALUES') &&
    !parser.checkKeyword('SET') &&
    !parser.checkKeyword('SELECT') &&
    !parser.checkKeyword('ADD') &&
    !parser.checkKeyword('DROP') &&
    !parser.checkKeyword('MODIFY') &&
    !parser.check(TokenType.Semicolon)
  ) {
    alias = parser.advance().value;
  }

  return {
    type: 'TableNameRef',
    library,
    table: tableName,
    alias,
    position: firstToken.position,
  };
}

function isJoinStart(parser: Parser): boolean {
  const val = parser.peek().value.toUpperCase();
  return ['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'NATURAL'].includes(val);
}

function isJoinKeyword(val: string): boolean {
  return ['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'NATURAL', 'ON'].includes(val.toUpperCase());
}

function parseJoinClause(parser: Parser): JoinClause {
  const startPos = parser.peek().position;
  let joinType: JoinType = 'INNER';

  if (parser.matchKeyword('INNER')) {
    parser.consumeKeyword('JOIN');
    joinType = 'INNER';
  } else if (parser.matchKeyword('LEFT')) {
    parser.matchKeyword('OUTER');
    parser.consumeKeyword('JOIN');
    joinType = 'LEFT';
  } else if (parser.matchKeyword('RIGHT')) {
    parser.matchKeyword('OUTER');
    parser.consumeKeyword('JOIN');
    joinType = 'RIGHT';
  } else if (parser.matchKeyword('FULL')) {
    parser.matchKeyword('OUTER');
    parser.consumeKeyword('JOIN');
    joinType = 'FULL';
  } else if (parser.matchKeyword('CROSS')) {
    parser.consumeKeyword('JOIN');
    joinType = 'CROSS';
  } else if (parser.matchKeyword('JOIN')) {
    joinType = 'INNER';
  }

  const table = parseTableRef(parser);

  let onCondition;
  if (parser.matchKeyword('ON')) {
    onCondition = parseExpression(parser);
  }

  return {
    type: 'JoinClause',
    joinType,
    table,
    on: onCondition,
    position: startPos,
  };
}

function parseCreateStatement(parser: Parser): CreateTableStatement | CreateViewStatement | CreateIndexStatement {
  const startPos = parser.consumeKeyword('CREATE').position;

  let isUnique = false;
  if (parser.matchKeyword('UNIQUE')) {
    isUnique = true;
  }

  if (parser.matchKeyword('INDEX')) {
    const idxToken = parser.consume(TokenType.Identifier, "Expected index name after CREATE INDEX");
    parser.consumeKeyword('ON');
    const table = parseTableRef(parser);

    parser.consume(TokenType.LParen, "Expected '(' after table name in CREATE INDEX");
    const columns: string[] = [];
    do {
      const colToken = parser.consume(TokenType.Identifier, "Expected column name in index definition");
      columns.push(colToken.value);
    } while (parser.match(TokenType.Comma));
    parser.consume(TokenType.RParen, "Expected ')' after index column list");

    return {
      type: 'CreateIndexStatement',
      name: idxToken.value,
      isUnique,
      table,
      columns,
      position: startPos,
    };
  }

  if (parser.matchKeyword('TABLE')) {
    const table = parseTableRef(parser);

    let columns: ColumnDefinition[] | undefined;
    if (parser.match(TokenType.LParen)) {
      columns = parseColumnDefinitions(parser);
      parser.consume(TokenType.RParen, "Expected ')' after column definitions");
    }

    let asSelect: SelectStatement | undefined;
    if (parser.matchKeyword('AS')) {
      asSelect = parseSelectStatement(parser);
    }

    return {
      type: 'CreateTableStatement',
      table,
      columns,
      asSelect,
      position: startPos,
    };
  }

  if (parser.matchKeyword('VIEW')) {
    const view = parseTableRef(parser);
    parser.consumeKeyword('AS');
    const asSelect = parseSelectStatement(parser);

    return {
      type: 'CreateViewStatement',
      view,
      asSelect,
      position: startPos,
    };
  }

  throw new ParseError("Expected TABLE, VIEW, or INDEX after CREATE", startPos);
}

/**
 * Parse one or more column definitions.
 * @param parenContext  true = inside CREATE TABLE (...) — valid terminators are ',' and ')'
 *                      false = inside ALTER TABLE ADD/MODIFY — valid terminators are ',' and ';' (no wrapping parens)
 */
function parseColumnDefinitions(parser: Parser, parenContext = true): ColumnDefinition[] {
  const cols: ColumnDefinition[] = [];
  do {
    // In ALTER TABLE context, stop if we've hit a terminator with nothing left to parse
    if (!parenContext && (parser.check(TokenType.Semicolon) || parser.isAtEnd())) break;

    const nameToken = parser.advance();
    const name = nameToken.value;
    const dataTypeToken = parser.advance();
    const dataType = dataTypeToken.value;
    let length: number | undefined;

    if (parser.match(TokenType.LParen)) {
      const lenToken = parser.consume(TokenType.NumberLiteral, "Expected length integer");
      length = parseInt(lenToken.value, 10);
      parser.consume(TokenType.RParen, "Expected ')' after column length");
    }

    // Detect invalid column attributes like FORMAT=... or LABEL=...
    const nextVal = parser.peek().value.toUpperCase();
    if (nextVal === 'FORMAT' || nextVal === 'LABEL') {
      const attrToken = parser.peek();
      const context = parenContext ? "CREATE TABLE" : "ALTER TABLE";
      throw new ParseError(
        `Unexpected attribute '${attrToken.value}' after column data type '${dataType}'. FORMAT= and LABEL= attributes are not allowed in PROC SQL ${context} column definitions.`,
        attrToken.position
      );
    }

    // Validate the token that follows the column definition
    const validTerminators = parenContext
      ? !parser.check(TokenType.Comma) && !parser.check(TokenType.RParen) && !parser.isAtEnd()
      : !parser.check(TokenType.Comma) && !parser.check(TokenType.Semicolon) && !parser.isAtEnd();

    if (validTerminators) {
      const nextToken = parser.peek();
      const expected = parenContext ? "',' or ')' after column definition" : "',' or ';' after column definition";
      throw new ParseError(
        `Unexpected token '${nextToken.value}' after column data type '${dataType}'. Expected ${expected}.`,
        nextToken.position
      );
    }

    cols.push({
      name,
      dataType,
      length,
    });
  } while (parser.match(TokenType.Comma));
  return cols;
}

function parseInsertStatement(parser: Parser): InsertStatement {
  const startPos = parser.consumeKeyword('INSERT').position;
  parser.consumeKeyword('INTO');
  const table = parseTableRef(parser);

  // Optional column list: INSERT INTO t (col1, col2, ...)
  // Use lookahead: if the token inside '(' is a literal (number/string/date), it's a VALUES tuple, not a column list.
  // Column lists only contain identifiers or keywords.
  let columns: string[] | undefined;
  if (parser.check(TokenType.LParen)) {
    const tokenInsideParen = parser.peekAt(1); // look past '('
    const isLiteralStart =
      tokenInsideParen.type === TokenType.NumberLiteral ||
      tokenInsideParen.type === TokenType.StringLiteral ||
      tokenInsideParen.type === TokenType.DateLiteral ||
      tokenInsideParen.type === TokenType.TimeLiteral ||
      tokenInsideParen.type === TokenType.DateTimeLiteral;

    if (!isLiteralStart) {
      // It's a column list — consume it
      columns = [];
      parser.advance(); // consume '('
      do {
        columns.push(parser.advance().value);
      } while (parser.match(TokenType.Comma));
      parser.consume(TokenType.RParen, "Expected ')' after column list");
    }
  }

  // SAS PROC SQL supports multiple consecutive VALUES(...) clauses (no comma between them)
  // e.g.:
  //   INSERT INTO t VALUES(1,'a') VALUES(2,'b') VALUES(3,'c');
  if (parser.checkKeyword('VALUES')) {
    const values: any[] = [];

    // Keep consuming VALUES(...) clauses as long as the next keyword is VALUES
    while (parser.matchKeyword('VALUES')) {
      parser.consume(TokenType.LParen, "Expected '(' after VALUES keyword");
      const tuple: any[] = [];
      if (!parser.check(TokenType.RParen)) {
        do {
          tuple.push(parseExpression(parser));
        } while (parser.match(TokenType.Comma));
      }
      parser.consume(TokenType.RParen, "Expected ')' after VALUES list");
      values.push(tuple);
    }

    return {
      type: 'InsertStatement',
      table,
      columns,
      values,
      position: startPos,
    };
  }

  if (parser.checkKeyword('SELECT')) {
    const selectQuery = parseSelectStatement(parser);
    return {
      type: 'InsertStatement',
      table,
      columns,
      selectQuery,
      position: startPos,
    };
  }

  throw new ParseError("Expected VALUES or SELECT in INSERT statement", startPos);
}

function parseUpdateStatement(parser: Parser): UpdateStatement {
  const startPos = parser.consumeKeyword('UPDATE').position;
  const table = parseTableRef(parser);
  parser.consumeKeyword('SET');

  const setClauses: UpdateSetClause[] = [];
  do {
    const colName = parser.advance().value;
    parser.consume(TokenType.Operator, "Expected '=' in SET clause");
    const value = parseExpression(parser);
    setClauses.push({
      column: colName,
      value,
    });
  } while (parser.match(TokenType.Comma));

  let where;
  if (parser.matchKeyword('WHERE')) {
    where = parseExpression(parser);
  }

  return {
    type: 'UpdateStatement',
    table,
    setClauses,
    where,
    position: startPos,
  };
}

function parseDeleteStatement(parser: Parser): DeleteStatement {
  const startPos = parser.consumeKeyword('DELETE').position;
  if (parser.matchKeyword('FROM')) {}
  const table = parseTableRef(parser);

  let where;
  if (parser.matchKeyword('WHERE')) {
    where = parseExpression(parser);
  }

  return {
    type: 'DeleteStatement',
    table,
    where,
    position: startPos,
  };
}

function parseDropStatement(parser: Parser): DropStatement {
  const startPos = parser.consumeKeyword('DROP').position;
  let objectType: 'TABLE' | 'VIEW' = 'TABLE';

  if (parser.matchKeyword('TABLE')) {
    objectType = 'TABLE';
  } else if (parser.matchKeyword('VIEW')) {
    objectType = 'VIEW';
  }

  const name = parseTableRef(parser);
  return {
    type: 'DropStatement',
    objectType,
    name,
    position: startPos,
  };
}

function parseAlterTableStatement(parser: Parser): AlterTableStatement {
  const startPos = parser.consumeKeyword('ALTER').position;
  parser.consumeKeyword('TABLE');
  const table = parseTableRef(parser);

  let action: 'ADD' | 'DROP' | 'MODIFY' = 'ADD';
  if (parser.matchKeyword('ADD')) action = 'ADD';
  else if (parser.matchKeyword('DROP')) action = 'DROP';
  else if (parser.matchKeyword('MODIFY')) action = 'MODIFY';

  if (action === 'DROP') {
    // DROP grammar: just a comma-separated list of column names, no data types
    // e.g.  ALTER TABLE t DROP email;
    //       ALTER TABLE t DROP email, phone;
    const dropColumns: string[] = [];
    do {
      if (parser.check(TokenType.Semicolon) || parser.isAtEnd()) {
        if (dropColumns.length === 0) {
          throw new ParseError("Expected column name after DROP", parser.peek().position);
        }
        break;
      }
      dropColumns.push(parser.advance().value);
    } while (parser.match(TokenType.Comma));

    return {
      type: 'AlterTableStatement',
      table,
      action,
      dropColumns,
      position: startPos,
    };
  }

  // ADD / MODIFY — parse full column definitions (no enclosing parens), terminated by ';'
  const columns = parseColumnDefinitions(parser, false);

  return {
    type: 'AlterTableStatement',
    table,
    action,
    columns,
    position: startPos,
  };
}
