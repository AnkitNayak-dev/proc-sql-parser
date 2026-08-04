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
              severity: 'Error',
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

export const defaultRules: LintRule[] = [
  noSelectStarRule,
  explicitJoinConditionRule,
  unusedTableAliasRule,
  keywordCasingRule,
  dateSuffixRule,
];
