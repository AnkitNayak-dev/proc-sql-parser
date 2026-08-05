import { Statement, SelectStatement, Expression } from '../ast/types.js';
import { Token, TokenType } from '../lexer/token.js';
import { ASTWalker } from '../visitor/visitor.js';
import { Diagnostic } from './diagnostics.js';

export interface LintRule {
  id: string;
  name: string;
  check(ast: Statement[], tokens: Token[]): Diagnostic[];
}


export const noSelectStarRule: LintRule = {
  id: 'PROC002',
  name: 'NoSelectStar',
  check(ast: Statement[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const walker = new ASTWalker({
      visitSelectStatement(node: SelectStatement) {
        for (const item of node.columns) {
          if (item.expr.type === 'StarExpr') {
            diagnostics.push({
              code: 'PROC002',
              message: "Avoid 'SELECT *' or table star wildcard. Specify explicit column names for better query performance and maintainability.",
              severity: 'Warning',
              position: item.position || item.expr.position,
            });
          }
        }
      },
    });

    ast.forEach((stmt) => walker.walkStatement(stmt));
    return diagnostics;
  },
};

export const explicitJoinConditionRule: LintRule = {
  id: 'PROC003',
  name: 'ExplicitJoinCondition',
  check(ast: Statement[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const walker = new ASTWalker({
      visitSelectStatement(node: SelectStatement) {
        if (node.joins) {
          for (const join of node.joins) {
            if (join.joinType !== 'CROSS' && !join.on) {
              diagnostics.push({
                code: 'PROC003',
                message: `${join.joinType} JOIN is missing an explicit ON condition. This will produce a Cartesian product.`,
                severity: 'Error',
                position: join.position,
              });
            }
          }
        }
      },
    });

    ast.forEach((stmt) => walker.walkStatement(stmt));
    return diagnostics;
  },
};

export const unusedTableAliasRule: LintRule = {
  id: 'PROC004',
  name: 'UnusedTableAlias',
  check(ast: Statement[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const walker = new ASTWalker({
      visitSelectStatement(node: SelectStatement) {
        const aliases = new Map<string, any>();

        if (node.from?.alias) {
          aliases.set(node.from.alias.toLowerCase(), node.from);
        }

        if (node.joins) {
          for (const j of node.joins) {
            if (j.table.alias) {
              aliases.set(j.table.alias.toLowerCase(), j.table);
            }
          }
        }

        if (aliases.size === 0) return;

        const referencedAliases = new Set<string>();

        const exprWalker = new ASTWalker({
          visitExpression(expr: Expression) {
            if (expr.type === 'ColumnRefExpr' && expr.table) {
              referencedAliases.add(expr.table.toLowerCase());
            }
            if (expr.type === 'StarExpr' && expr.table) {
              referencedAliases.add(expr.table.toLowerCase());
            }
          },
        });

        // Walk expressions in columns, where, group by, having, order by
        for (const col of node.columns) exprWalker.walkExpression(col.expr);
        if (node.where) exprWalker.walkExpression(node.where);
        if (node.groupBy) node.groupBy.forEach((g) => exprWalker.walkExpression(g));
        if (node.having) exprWalker.walkExpression(node.having);
        if (node.orderBy) node.orderBy.forEach((o) => exprWalker.walkExpression(o.expr));

        for (const [aliasName, tableNode] of aliases.entries()) {
          if (!referencedAliases.has(aliasName)) {
            diagnostics.push({
              code: 'PROC004',
              message: `Table alias '${tableNode.alias}' is defined but never referenced in query columns or filters.`,
              severity: 'Information',
              position: tableNode.position,
            });
          }
        }
      },
    });

    ast.forEach((stmt) => walker.walkStatement(stmt));
    return diagnostics;
  },
};

export const keywordCasingRule: LintRule = {
  id: 'PROC005',
  name: 'KeywordCasing',
  check(ast: Statement[], tokens: Token[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const token of tokens) {
      if (token.type === TokenType.Keyword) {
        if (token.value !== token.value.toUpperCase()) {
          diagnostics.push({
            code: 'PROC005',
            message: `Keyword '${token.value}' should be uppercase ('${token.value.toUpperCase()}').`,
            severity: 'Hint',
            position: token.position,
          });
        }
      }
    }

    return diagnostics;
  },
};

export const dateSuffixRule: LintRule = {
  id: 'PROC006',
  name: 'SuspectedMissingDateSuffix',
  check(ast: Statement[], tokens: Token[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const dateRegex = /^\d{1,2}[A-Za-z]{3}\d{2,4}$/;

    for (const token of tokens) {
      if (token.type === TokenType.StringLiteral) {
        const monthStr = token.value.replace(/^\d{1,2}/, '').replace(/\d{2,4}$/, '').toUpperCase();
        if (dateRegex.test(token.value) && months.includes(monthStr)) {
          diagnostics.push({
            code: 'PROC006',
            message: `String literal '${token.value}' looks like a SAS date. Did you mean '${token.value}'d with the 'd' suffix?`,
            severity: 'Error',
            position: token.position,
          });
        }
      }
    }

    return diagnostics;
  },
};

/**
 * PROC007: Function argument count validation.
 * A registry of known SAS/SQL functions with min/max argument counts.
 */
const FUNCTION_SIGNATURES: Record<string, { min: number; max: number }> = {
  // Date/Time functions
  TODAY: { min: 0, max: 0 },
  DATE: { min: 0, max: 0 },
  TIME: { min: 0, max: 0 },
  DATETIME: { min: 0, max: 0 },
  YEAR: { min: 1, max: 1 },
  MONTH: { min: 1, max: 1 },
  DAY: { min: 1, max: 1 },
  HOUR: { min: 1, max: 1 },
  MINUTE: { min: 1, max: 1 },
  SECOND: { min: 1, max: 1 },
  QTR: { min: 1, max: 1 },
  WEEK: { min: 1, max: 1 },
  WEEKDAY: { min: 1, max: 1 },
  DATEPART: { min: 1, max: 1 },
  TIMEPART: { min: 1, max: 1 },
  INTCK: { min: 3, max: 4 },
  INTNX: { min: 3, max: 4 },
  MDY: { min: 3, max: 3 },
  HMS: { min: 3, max: 3 },
  DHMS: { min: 4, max: 4 },
  YRDIF: { min: 2, max: 3 },

  // String functions
  SUBSTR: { min: 2, max: 3 },
  SUBSTRING: { min: 2, max: 3 },
  LENGTH: { min: 1, max: 1 },
  TRIM: { min: 1, max: 1 },
  LEFT: { min: 1, max: 1 },
  RIGHT: { min: 1, max: 1 },
  UPCASE: { min: 1, max: 1 },
  LOWCASE: { min: 1, max: 1 },
  PROPCASE: { min: 1, max: 2 },
  COMPRESS: { min: 1, max: 3 },
  STRIP: { min: 1, max: 1 },
  SCAN: { min: 2, max: 4 },
  INDEX: { min: 2, max: 2 },
  FIND: { min: 2, max: 4 },
  TRANWRD: { min: 3, max: 3 },
  TRANSLATE: { min: 2, max: 3 },
  REPEAT: { min: 2, max: 2 },
  REVERSE: { min: 1, max: 1 },
  CAT: { min: 1, max: Infinity },
  CATS: { min: 1, max: Infinity },
  CATT: { min: 1, max: Infinity },
  CATX: { min: 2, max: Infinity },
  CATQ: { min: 2, max: Infinity },

  // Numeric / Math functions
  ABS: { min: 1, max: 1 },
  CEIL: { min: 1, max: 1 },
  FLOOR: { min: 1, max: 1 },
  ROUND: { min: 1, max: 2 },
  INT: { min: 1, max: 1 },
  MOD: { min: 2, max: 2 },
  SQRT: { min: 1, max: 1 },
  LOG: { min: 1, max: 1 },
  LOG2: { min: 1, max: 1 },
  LOG10: { min: 1, max: 1 },
  EXP: { min: 1, max: 1 },
  SIGN: { min: 1, max: 1 },
  MAX: { min: 1, max: Infinity },
  MIN: { min: 1, max: Infinity },
  SUM: { min: 1, max: Infinity },
  MEAN: { min: 1, max: Infinity },
  N: { min: 1, max: Infinity },
  NMISS: { min: 1, max: Infinity },

  // Aggregate functions
  AVG: { min: 1, max: 1 },
  COUNT: { min: 1, max: 1 },

  // Type conversion
  PUT: { min: 2, max: 2 },
  INPUT: { min: 2, max: 2 },
  INPUTN: { min: 2, max: 2 },
  INPUTC: { min: 2, max: 2 },

  // Misc
  COALESCE: { min: 1, max: Infinity },
  COALESCEC: { min: 1, max: Infinity },
  IFN: { min: 3, max: 4 },
  IFC: { min: 3, max: 4 },
  MISSING: { min: 1, max: 1 },
  MONOTONIC: { min: 0, max: 0 },
};

export const functionArgCountRule: LintRule = {
  id: 'PROC007',
  name: 'FunctionArgCount',
  check(ast: Statement[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const walker = new ASTWalker({
      visitExpression(expr: Expression) {
        if (expr.type === 'FunctionCallExpr') {
          const funcName = expr.name.toUpperCase();
          const sig = FUNCTION_SIGNATURES[funcName];
          if (!sig) {
            // Warn about completely unrecognized functions
            diagnostics.push({
              code: 'PROC007',
              message: `Function '${funcName}' is unrecognized. Ensure it exists in SAS/SQL or check for typos.`,
              severity: 'Error',
              position: expr.position,
            });
            return;
          }

          const argCount = expr.args.length;

          if (argCount < sig.min) {
            const expected = sig.min === sig.max
              ? `exactly ${sig.min}`
              : `at least ${sig.min}`;
            diagnostics.push({
              code: 'PROC007',
              message: `Function ${funcName}() requires ${expected} argument(s), but got ${argCount}.`,
              severity: 'Error',
              position: expr.position,
            });
          } else if (argCount > sig.max && sig.max !== Infinity) {
            const expected = sig.min === sig.max
              ? `exactly ${sig.max}`
              : `at most ${sig.max}`;
            diagnostics.push({
              code: 'PROC007',
              message: `Function ${funcName}() accepts ${expected} argument(s), but got ${argCount}.`,
              severity: 'Error',
              position: expr.position,
            });
          }
        }
      },
    });

    ast.forEach((stmt) => walker.walkStatement(stmt));
    return diagnostics;
  },
};

export const bareSuffixIdentifierRule: LintRule = {
  id: 'PROC008',
  name: 'BareSuffixIdentifier',
  check(ast: Statement[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const walker = new ASTWalker({
      visitExpression(expr: Expression) {
        if (expr.type === 'ColumnRefExpr' && !expr.table) {
          const colName = expr.column.toLowerCase();
          if (colName === 'd' || colName === 'dt' || colName === 't') {
            diagnostics.push({
              code: 'PROC008',
              message: `Bare identifier '${expr.column}' looks like a date/time/datetime suffix. Did you mean to use a quoted literal, e.g. '01JAN2024'${colName}?`,
              severity: 'Error',
              position: expr.position,
            });
          }
        }
      },
    });

    ast.forEach((stmt) => walker.walkStatement(stmt));
    return diagnostics;
  },
};

export const defaultRules: LintRule[] = [
  noSelectStarRule,
  explicitJoinConditionRule,
  unusedTableAliasRule,
  keywordCasingRule,
  dateSuffixRule,
  functionArgCountRule,
  bareSuffixIdentifierRule,
];
