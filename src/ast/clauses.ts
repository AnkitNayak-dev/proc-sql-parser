import { BaseASTNode, Expression } from './expressions.js';
import { SelectStatement } from './statements.js';

export interface SelectItem extends BaseASTNode {
  type: 'SelectItem';
  expr: Expression;
  alias?: string;
  label?: string;   // SAS PROC SQL LABEL='...'
  format?: string;  // SAS PROC SQL FORMAT=...
}

export type TableRef = TableNameRef | SubqueryTableRef;

export interface TableNameRef extends BaseASTNode {
  type: 'TableNameRef';
  library?: string; // SAS Library prefix e.g. work.mydata
  table: string;
  alias?: string;
}

export interface SubqueryTableRef extends BaseASTNode {
  type: 'SubqueryTableRef';
  subquery: SelectStatement;
  alias: string;
}

export type JoinType =
  | 'INNER'
  | 'LEFT'
  | 'RIGHT'
  | 'FULL'
  | 'CROSS'
  | 'OUTER UNION';

export interface JoinClause extends BaseASTNode {
  type: 'JoinClause';
  joinType: JoinType;
  table: TableRef;
  on?: Expression;
}

export interface IntoClause extends BaseASTNode {
  type: 'IntoClause';
  targets: IntoTarget[];
  separatedClause?: {
    by: string; // e.g. ', '
  };
}

export type IntoTarget =
  | SingleIntoTarget
  | RangeIntoTarget;

export interface SingleIntoTarget {
  type: 'SingleIntoTarget';
  variableName: string; // e.g. ":var1" or "&var1"
}

export interface RangeIntoTarget {
  type: 'RangeIntoTarget';
  startVariable: string; // e.g. ":var1"
  endVariable: string;   // e.g. ":varN"
}

export interface OrderByItem extends BaseASTNode {
  type: 'OrderByItem';
  expr: Expression;
  direction?: 'ASC' | 'DESC';
}
