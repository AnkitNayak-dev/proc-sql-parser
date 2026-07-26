import {
  Statement,
  Expression,
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
  SelectItem,
  TableRef,
  JoinClause,
  IntoClause,
  OrderByItem,
} from '../ast/types.js';

export interface ASTVisitor {
  visitProcSqlBlock?(node: ProcSqlBlock): void;
  visitSelectStatement?(node: SelectStatement): void;
  visitCreateTableStatement?(node: CreateTableStatement): void;
  visitCreateViewStatement?(node: CreateViewStatement): void;
  visitCreateIndexStatement?(node: CreateIndexStatement): void;
  visitInsertStatement?(node: InsertStatement): void;
  visitUpdateStatement?(node: UpdateStatement): void;
  visitDeleteStatement?(node: DeleteStatement): void;
  visitDropStatement?(node: DropStatement): void;
  visitAlterTableStatement?(node: AlterTableStatement): void;
  visitExpression?(node: Expression): void;
}

export class ASTWalker {
  constructor(private visitor: ASTVisitor) {}

  public walkStatement(node: Statement): void {
    switch (node.type) {
      case 'ProcSqlBlock':
        this.visitor.visitProcSqlBlock?.(node);
        node.statements.forEach((s) => this.walkStatement(s));
        break;
      case 'SelectStatement':
        this.visitor.visitSelectStatement?.(node);
        node.columns.forEach((col) => this.walkExpression(col.expr));
        if (node.where) this.walkExpression(node.where);
        if (node.groupBy) node.groupBy.forEach((g) => this.walkExpression(g));
        if (node.having) this.walkExpression(node.having);
        if (node.orderBy) node.orderBy.forEach((o) => this.walkExpression(o.expr));
        break;
      case 'CreateTableStatement':
        this.visitor.visitCreateTableStatement?.(node);
        if (node.asSelect) this.walkStatement(node.asSelect);
        break;
      case 'CreateViewStatement':
        this.visitor.visitCreateViewStatement?.(node);
        if (node.asSelect) this.walkStatement(node.asSelect);
        break;
      case 'InsertStatement':
        this.visitor.visitInsertStatement?.(node);
        if (node.selectQuery) this.walkStatement(node.selectQuery);
        break;
      case 'UpdateStatement':
        this.visitor.visitUpdateStatement?.(node);
        if (node.where) this.walkExpression(node.where);
        break;
      case 'DeleteStatement':
        this.visitor.visitDeleteStatement?.(node);
        if (node.where) this.walkExpression(node.where);
        break;
      case 'DropStatement':
        this.visitor.visitDropStatement?.(node);
        break;
      case 'AlterTableStatement':
        this.visitor.visitAlterTableStatement?.(node);
        break;
      case 'CreateIndexStatement':
        this.visitor.visitCreateIndexStatement?.(node);
        break;
    }
  }

  public walkExpression(node: Expression): void {
    this.visitor.visitExpression?.(node);

    switch (node.type) {
      case 'UnaryExpr':
        this.walkExpression(node.operand);
        break;
      case 'BinaryExpr':
        this.walkExpression(node.left);
        this.walkExpression(node.right);
        break;
      case 'FunctionCallExpr':
        node.args.forEach((a) => this.walkExpression(a));
        break;
      case 'SubqueryExpr':
        this.walkStatement(node.query);
        break;
      case 'InListExpr':
        this.walkExpression(node.expr);
        node.list.forEach((i) => this.walkExpression(i));
        break;
      case 'InSubqueryExpr':
        this.walkExpression(node.expr);
        this.walkStatement(node.subquery);
        break;
      case 'BetweenExpr':
        this.walkExpression(node.expr);
        this.walkExpression(node.low);
        this.walkExpression(node.high);
        break;
      case 'IsNullExpr':
        this.walkExpression(node.expr);
        break;
      case 'CaseExpr':
        if (node.expr) this.walkExpression(node.expr);
        node.branches.forEach((b) => {
          this.walkExpression(b.when);
          this.walkExpression(b.then);
        });
        if (node.elseExpr) this.walkExpression(node.elseExpr);
        break;
      case 'ExistsExpr':
        this.walkStatement(node.subquery);
        break;
    }
  }
}
