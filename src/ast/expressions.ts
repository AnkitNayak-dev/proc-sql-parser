import { Position } from '../lexer/token.js';
import { SelectStatement } from './statements.js';

export type Expression =
  | LiteralExpr
  | ColumnRefExpr
  | CalculatedExpr
  | MacroVarExpr
  | UnaryExpr
  | BinaryExpr
  | FunctionCallExpr
  | SubqueryExpr
  | InListExpr
  | InSubqueryExpr
  | BetweenExpr
  | IsNullExpr
  | CaseExpr
  | CastExpr
  | StarExpr
  | ExistsExpr;


export interface BaseASTNode {
  position?: Position;
}

export interface LiteralExpr extends BaseASTNode {
  type: 'LiteralExpr';
  value: string | number | boolean | null;
  raw: string;
}

export interface ColumnRefExpr extends BaseASTNode {
  type: 'ColumnRefExpr';
  table?: string;
  column: string;
}

export interface CalculatedExpr extends BaseASTNode {
  type: 'CalculatedExpr';
  column: string;
}

export interface MacroVarExpr extends BaseASTNode {
  type: 'MacroVarExpr';
  name: string; // e.g. "&name" or ":name"
}

export interface UnaryExpr extends BaseASTNode {
  type: 'UnaryExpr';
  operator: string; // '-', '+', 'NOT'
  operand: Expression;
}

export interface BinaryExpr extends BaseASTNode {
  type: 'BinaryExpr';
  operator: string; // '+', '-', '*', '/', '=', '<>', '!=', '<', '>', '<=', '>=', 'AND', 'OR', '||', etc.
  left: Expression;
  right: Expression;
}

export interface FunctionCallExpr extends BaseASTNode {
  type: 'FunctionCallExpr';
  name: string;
  args: Expression[];
  isDistinct?: boolean;
}

export interface SubqueryExpr extends BaseASTNode {
  type: 'SubqueryExpr';
  query: SelectStatement;
}

export interface InListExpr extends BaseASTNode {
  type: 'InListExpr';
  expr: Expression;
  list: Expression[];
  isNot?: boolean;
}

export interface InSubqueryExpr extends BaseASTNode {
  type: 'InSubqueryExpr';
  expr: Expression;
  subquery: SelectStatement;
  isNot?: boolean;
}

export interface BetweenExpr extends BaseASTNode {
  type: 'BetweenExpr';
  expr: Expression;
  low: Expression;
  high: Expression;
  isNot?: boolean;
}

export interface IsNullExpr extends BaseASTNode {
  type: 'IsNullExpr';
  expr: Expression;
  isNot?: boolean;
}

export interface CaseWhenBranch {
  when: Expression;
  then: Expression;
}

export interface CaseExpr extends BaseASTNode {
  type: 'CaseExpr';
  expr?: Expression;
  branches: CaseWhenBranch[];
  elseExpr?: Expression;
}

export interface CastExpr extends BaseASTNode {
  type: 'CastExpr';
  expr: Expression;
  targetType: string;
}

export interface StarExpr extends BaseASTNode {
  type: 'StarExpr';
  table?: string;
}

export interface ExistsExpr extends BaseASTNode {
  type: 'ExistsExpr';
  subquery: SelectStatement;
  isNot?: boolean; // true for NOT EXISTS
}
