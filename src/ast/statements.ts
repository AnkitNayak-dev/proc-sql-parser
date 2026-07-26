import { BaseASTNode, Expression } from './expressions.js';
import {
  SelectItem,
  TableRef,
  JoinClause,
  IntoClause,
  OrderByItem,
} from './clauses.js';

export type Statement =
  | ProcSqlBlock
  | SelectStatement
  | CreateTableStatement
  | CreateViewStatement
  | CreateIndexStatement
  | InsertStatement
  | UpdateStatement
  | DeleteStatement
  | DropStatement
  | AlterTableStatement;

export interface ProcSqlOption extends BaseASTNode {
  name: string;      // e.g. 'NOPRINT', 'OUTOBS', 'FEEDBACK'
  value?: string;    // e.g. '100' for OUTOBS=100
}

export interface ProcSqlBlock extends BaseASTNode {
  type: 'ProcSqlBlock';
  options: ProcSqlOption[];
  statements: Statement[];
}

export interface SelectStatement extends BaseASTNode {
  type: 'SelectStatement';
  isDistinct?: boolean;
  columns: SelectItem[];
  into?: IntoClause;
  from?: TableRef;
  joins?: JoinClause[];
  where?: Expression;
  groupBy?: Expression[];
  having?: Expression;
  orderBy?: OrderByItem[];
}

export interface ColumnDefinition extends BaseASTNode {
  name: string;
  dataType: string;
  length?: number;
  format?: string;
  label?: string;
}

export interface CreateTableStatement extends BaseASTNode {
  type: 'CreateTableStatement';
  table: TableRef;
  columns?: ColumnDefinition[];
  asSelect?: SelectStatement;
}

export interface CreateViewStatement extends BaseASTNode {
  type: 'CreateViewStatement';
  view: TableRef;
  asSelect: SelectStatement;
}

export interface CreateIndexStatement extends BaseASTNode {
  type: 'CreateIndexStatement';
  name: string;
  isUnique?: boolean;
  table: TableRef;
  columns: string[];
}

export interface InsertStatement extends BaseASTNode {
  type: 'InsertStatement';
  table: TableRef;
  columns?: string[];
  values?: Expression[][];
  selectQuery?: SelectStatement;
}

export interface UpdateSetClause extends BaseASTNode {
  column: string;
  value: Expression;
}

export interface UpdateStatement extends BaseASTNode {
  type: 'UpdateStatement';
  table: TableRef;
  setClauses: UpdateSetClause[];
  where?: Expression;
}

export interface DeleteStatement extends BaseASTNode {
  type: 'DeleteStatement';
  table: TableRef;
  where?: Expression;
}

export interface DropStatement extends BaseASTNode {
  type: 'DropStatement';
  objectType: 'TABLE' | 'VIEW';
  name: TableRef;
}

export interface AlterTableStatement extends BaseASTNode {
  type: 'AlterTableStatement';
  table: TableRef;
  action: 'ADD' | 'DROP' | 'MODIFY';
  columns?: ColumnDefinition[]; // for ADD and MODIFY actions
  dropColumns?: string[];       // for DROP action — just column names, no data types
}
