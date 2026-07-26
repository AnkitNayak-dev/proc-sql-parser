import {
  Statement,
  ProcSqlBlock,
  SelectStatement,
  CreateTableStatement,
  CreateViewStatement,
  CreateIndexStatement,
  InsertStatement,
  UpdateStatement,
  DeleteStatement,
  DropStatement,
  AlterTableStatement,
  Expression,
  SelectItem,
  TableRef,
  JoinClause,
  IntoClause,
  OrderByItem,
} from '../ast/types.js';

export class ASTPrinter {
  private indentLevel = 0;

  private indent(): string {
    return '  '.repeat(this.indentLevel);
  }

  public print(node: Statement | Statement[] | Expression): string {
    if (Array.isArray(node)) {
      return node.map((s) => this.printStatement(s)).join('\n\n');
    }
    if ('type' in node) {
      if (this.isStatement(node)) {
        return this.printStatement(node as Statement);
      }
      return this.printExpression(node as Expression);
    }
    return '';
  }

  private isStatement(node: any): boolean {
    return [
      'ProcSqlBlock',
      'SelectStatement',
      'CreateTableStatement',
      'CreateViewStatement',
      'InsertStatement',
      'UpdateStatement',
      'DeleteStatement',
      'DropStatement',
      'AlterTableStatement',
    ].includes(node.type);
  }

  public printStatement(stmt: Statement): string {
    switch (stmt.type) {
      case 'ProcSqlBlock':
        return this.printProcSqlBlock(stmt);
      case 'SelectStatement':
        return this.printSelectStatement(stmt);
      case 'CreateTableStatement':
        return this.printCreateTableStatement(stmt);
      case 'CreateViewStatement':
        return this.printCreateViewStatement(stmt);
      case 'InsertStatement':
        return this.printInsertStatement(stmt);
      case 'UpdateStatement':
        return this.printUpdateStatement(stmt);
      case 'DeleteStatement':
        return this.printDeleteStatement(stmt);
      case 'DropStatement':
        return this.printDropStatement(stmt);
      case 'AlterTableStatement':
        return this.printAlterTableStatement(stmt);
      case 'CreateIndexStatement':
        return this.printCreateIndexStatement(stmt);
      default:
        return '';
    }
  }

  private printProcSqlBlock(block: ProcSqlBlock): string {
    let optsStr = block.options
      .map((o) => (o.value ? `${o.name}=${o.value}` : o.name))
      .join(' ');
    optsStr = optsStr ? ` ${optsStr}` : '';

    const lines = [`PROC SQL${optsStr};`];
    this.indentLevel++;
    for (const inner of block.statements) {
      lines.push(this.indent() + this.printStatement(inner));
    }
    this.indentLevel--;
    lines.push('QUIT;');
    return lines.join('\n');
  }

  private printSelectStatement(stmt: SelectStatement): string {
    const parts: string[] = [];

    let selectLine = 'SELECT';
    if (stmt.isDistinct) selectLine += ' DISTINCT';

    const colsStr = stmt.columns.map((c) => this.printSelectItem(c)).join(', ');
    parts.push(`${selectLine} ${colsStr}`);

    if (stmt.into) {
      parts.push(`INTO ${this.printIntoClause(stmt.into)}`);
    }

    if (stmt.from) {
      parts.push(`FROM ${this.printTableRef(stmt.from)}`);
    }

    if (stmt.joins) {
      for (const j of stmt.joins) {
        parts.push(this.printJoinClause(j));
      }
    }

    if (stmt.where) {
      parts.push(`WHERE ${this.printExpression(stmt.where)}`);
    }

    if (stmt.groupBy) {
      const gStr = stmt.groupBy.map((g) => this.printExpression(g)).join(', ');
      parts.push(`GROUP BY ${gStr}`);
    }

    if (stmt.having) {
      parts.push(`HAVING ${this.printExpression(stmt.having)}`);
    }

    if (stmt.orderBy) {
      const oStr = stmt.orderBy
        .map((o) => `${this.printExpression(o.expr)}${o.direction ? ' ' + o.direction : ''}`)
        .join(', ');
      parts.push(`ORDER BY ${oStr}`);
    }

    return parts.join(' ') + ';';
  }

  private printSelectItem(item: SelectItem): string {
    let res = this.printExpression(item.expr);
    if (item.alias) res += ` AS ${item.alias}`;
    if (item.label) res += ` LABEL='${item.label}'`;
    if (item.format) res += ` FORMAT=${item.format}`;
    return res;
  }

  private printIntoClause(into: IntoClause): string {
    const targetsStr = into.targets
      .map((t) => {
        if (t.type === 'SingleIntoTarget') return t.variableName;
        return `${t.startVariable} - ${t.endVariable}`;
      })
      .join(', ');

    if (into.separatedClause) {
      return `${targetsStr} SEPARATED BY '${into.separatedClause.by}'`;
    }
    return targetsStr;
  }

  private printTableRef(ref: TableRef): string {
    if (ref.type === 'SubqueryTableRef') {
      return `(${this.printSelectStatement(ref.subquery).replace(/;$/, '')}) AS ${ref.alias}`;
    }
    const name = ref.library ? `${ref.library}.${ref.table}` : ref.table;
    return ref.alias ? `${name} AS ${ref.alias}` : name;
  }

  private printJoinClause(j: JoinClause): string {
    const tableStr = this.printTableRef(j.table);
    const onStr = j.on ? ` ON ${this.printExpression(j.on)}` : '';
    return `${j.joinType} JOIN ${tableStr}${onStr}`;
  }

  private printCreateTableStatement(stmt: CreateTableStatement): string {
    let res = `CREATE TABLE ${this.printTableRef(stmt.table)}`;
    if (stmt.columns) {
      const cStr = stmt.columns.map((c) => `${c.name} ${c.dataType}${c.length ? `(${c.length})` : ''}`).join(', ');
      res += ` (${cStr})`;
    }
    if (stmt.asSelect) {
      res += ` AS ${this.printSelectStatement(stmt.asSelect).replace(/;$/, '')}`;
    }
    return res + ';';
  }

  private printCreateViewStatement(stmt: CreateViewStatement): string {
    return `CREATE VIEW ${this.printTableRef(stmt.view)} AS ${this.printSelectStatement(stmt.asSelect).replace(/;$/, '')};`;
  }

  private printInsertStatement(stmt: InsertStatement): string {
    let res = `INSERT INTO ${this.printTableRef(stmt.table)}`;
    if (stmt.columns) {
      res += ` (${stmt.columns.join(', ')})`;
    }
    if (stmt.values) {
      const tuples = stmt.values
        .map((t) => `(${t.map((e) => this.printExpression(e)).join(', ')})`)
        .join(', ');
      res += ` VALUES ${tuples}`;
    } else if (stmt.selectQuery) {
      res += ` ${this.printSelectStatement(stmt.selectQuery).replace(/;$/, '')}`;
    }
    return res + ';';
  }

  private printUpdateStatement(stmt: UpdateStatement): string {
    const sets = stmt.setClauses.map((s) => `${s.column} = ${this.printExpression(s.value)}`).join(', ');
    let res = `UPDATE ${this.printTableRef(stmt.table)} SET ${sets}`;
    if (stmt.where) res += ` WHERE ${this.printExpression(stmt.where)}`;
    return res + ';';
  }

  private printDeleteStatement(stmt: DeleteStatement): string {
    let res = `DELETE FROM ${this.printTableRef(stmt.table)}`;
    if (stmt.where) res += ` WHERE ${this.printExpression(stmt.where)}`;
    return res + ';';
  }

  private printDropStatement(stmt: DropStatement): string {
    return `DROP ${stmt.objectType} ${this.printTableRef(stmt.name)};`;
  }

  private printAlterTableStatement(stmt: AlterTableStatement): string {
    if (stmt.dropColumns) {
      return `ALTER TABLE ${this.printTableRef(stmt.table)} DROP ${stmt.dropColumns.join(', ')};`;
    }
    const cols = (stmt.columns || []).map((c) => `${c.name} ${c.dataType}${c.length ? `(${c.length})` : ''}`).join(', ');
    return `ALTER TABLE ${this.printTableRef(stmt.table)} ${stmt.action} ${cols};`;
  }

  private printCreateIndexStatement(stmt: CreateIndexStatement): string {
    const unq = stmt.isUnique ? 'UNIQUE ' : '';
    return `CREATE ${unq}INDEX ${stmt.name} ON ${this.printTableRef(stmt.table)}(${stmt.columns.join(', ')});`;
  }

  public printExpression(expr: Expression): string {
    switch (expr.type) {
      case 'LiteralExpr':
        return expr.raw;
      case 'ColumnRefExpr':
        return expr.table ? `${expr.table}.${expr.column}` : expr.column;
      case 'CalculatedExpr':
        return `CALCULATED ${expr.column}`;
      case 'MacroVarExpr':
        return expr.name;
      case 'StarExpr':
        return expr.table ? `${expr.table}.*` : '*';
      case 'UnaryExpr':
        return `${expr.operator} ${this.printExpression(expr.operand)}`;
      case 'BinaryExpr':
        return `(${this.printExpression(expr.left)} ${expr.operator} ${this.printExpression(expr.right)})`;
      case 'FunctionCallExpr': {
        const dist = expr.isDistinct ? 'DISTINCT ' : '';
        const argsStr = expr.args.map((a) => this.printExpression(a)).join(', ');
        return `${expr.name}(${dist}${argsStr})`;
      }
      case 'SubqueryExpr':
        return `(${this.printSelectStatement(expr.query).replace(/;$/, '')})`;
      case 'InListExpr': {
        const notStr = expr.isNot ? 'NOT ' : '';
        const listStr = expr.list.map((l) => this.printExpression(l)).join(', ');
        return `${this.printExpression(expr.expr)} ${notStr}IN (${listStr})`;
      }
      case 'InSubqueryExpr': {
        const notStr = expr.isNot ? 'NOT ' : '';
        return `${this.printExpression(expr.expr)} ${notStr}IN (${this.printSelectStatement(expr.subquery).replace(/;$/, '')})`;
      }
      case 'BetweenExpr': {
        const notStr = expr.isNot ? 'NOT ' : '';
        return `${this.printExpression(expr.expr)} ${notStr}BETWEEN ${this.printExpression(expr.low)} AND ${this.printExpression(expr.high)}`;
      }
      case 'IsNullExpr': {
        const notStr = expr.isNot ? 'NOT ' : '';
        return `${this.printExpression(expr.expr)} IS ${notStr}NULL`;
      }
      case 'CaseExpr': {
        let res = 'CASE';
        if (expr.expr) res += ` ${this.printExpression(expr.expr)}`;
        for (const b of expr.branches) {
          res += ` WHEN ${this.printExpression(b.when)} THEN ${this.printExpression(b.then)}`;
        }
        if (expr.elseExpr) res += ` ELSE ${this.printExpression(expr.elseExpr)}`;
        return `${res} END`;
      }
      case 'CastExpr':
        return `CAST(${this.printExpression(expr.expr)} AS ${expr.targetType})`;
      case 'ExistsExpr': {
        const notStr = expr.isNot ? 'NOT ' : '';
        return `${notStr}EXISTS (${this.printSelectStatement(expr.subquery).replace(/;$/, '')})`;
      }
      default:
        return '';
    }
  }
}
