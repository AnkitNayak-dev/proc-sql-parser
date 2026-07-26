import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { SelectStatement } from '../ast/types.js';
import { detectCompletionContext, CompletionContext } from './context.js';

export type CompletionItemKind =
  | 'Keyword'
  | 'Option'
  | 'Column'
  | 'Table'
  | 'Function'
  | 'Variable';

export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  insertText?: string;
}

export interface SchemaMetadata {
  tables?: Record<string, string[]>; // table_name -> column_names
}

export class CompletionEngine {
  constructor(private schema?: SchemaMetadata) {}

  public getCompletions(input: string, cursorOffset: number): CompletionItem[] {
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    const context = detectCompletionContext(tokens, cursorOffset);

    // Try parsing AST to extract table aliases
    let astSelect: SelectStatement | undefined;
    try {
      const parser = new Parser(tokens);
      const statements = parser.parse();
      if (statements.length > 0 && statements[0].type === 'SelectStatement') {
        astSelect = statements[0] as SelectStatement;
      } else if (statements.length > 0 && statements[0].type === 'ProcSqlBlock') {
        const block = statements[0];
        const sel = block.statements.find((s) => s.type === 'SelectStatement');
        if (sel) astSelect = sel as SelectStatement;
      }
    } catch {
      // Ignore syntax error during partial typing
    }

    switch (context.type) {
      case 'PROC_OPTIONS':
        return [
          { label: 'NOPRINT', kind: 'Option', detail: 'Suppress printed output' },
          { label: 'OUTOBS=', kind: 'Option', detail: 'Limit rows written to output', insertText: 'OUTOBS=' },
          { label: 'INOBS=', kind: 'Option', detail: 'Limit rows read from input', insertText: 'INOBS=' },
          { label: 'FEEDBACK', kind: 'Option', detail: 'Expand SELECT * and macro expressions' },
          { label: 'STIMER', kind: 'Option', detail: 'Print execution timing' },
          { label: 'NOEXEC', kind: 'Option', detail: 'Check syntax without executing query' },
          { label: 'NUMBER', kind: 'Option', detail: 'Print row numbers in output' },
        ];

      case 'ALIAS_DOT': {
        const alias = context.aliasPrefix?.toLowerCase();
        let targetTable: string | undefined;

        if (astSelect) {
          if (astSelect.from && astSelect.from.type === 'TableNameRef' && astSelect.from.alias?.toLowerCase() === alias) {
            targetTable = astSelect.from.table;
          } else if (astSelect.joins) {
            for (const j of astSelect.joins) {
              if (j.table.type === 'TableNameRef' && j.table.alias?.toLowerCase() === alias) {
                targetTable = j.table.table;
                break;
              }
            }
          }
        }

        if (!targetTable) {
          for (let i = 0; i < tokens.length - 1; i++) {
            const t = tokens[i];
            if (t.type === 'Keyword' && (t.value.toUpperCase() === 'FROM' || t.value.toUpperCase() === 'JOIN')) {
              const tblToken = tokens[i + 1];
              if (tblToken) {
                let tblName = tblToken.value;
                let aliasCandidate: string | undefined;
                let nextIdx = i + 2;
                if (tokens[nextIdx] && tokens[nextIdx].value === '.' && tokens[nextIdx + 1]) {
                  tblName = tokens[nextIdx + 1].value;
                  nextIdx += 2;
                }
                if (tokens[nextIdx] && tokens[nextIdx].value.toUpperCase() === 'AS') {
                  nextIdx++;
                }
                if (tokens[nextIdx] && (tokens[nextIdx].type === 'Identifier' || tokens[nextIdx].type === 'Keyword')) {
                  aliasCandidate = tokens[nextIdx].value;
                }
                if (aliasCandidate?.toLowerCase() === alias || tblName.toLowerCase() === alias) {
                  targetTable = tblName;
                  break;
                }
              }
            }
          }
        }

        if (targetTable && this.schema?.tables?.[targetTable]) {
          return this.schema.tables[targetTable].map((col) => ({
            label: col,
            kind: 'Column',
            detail: `Column of ${targetTable}`,
          }));
        }

        return [
          { label: 'id', kind: 'Column' },
          { label: 'name', kind: 'Column' },
          { label: 'date', kind: 'Column' },
          { label: 'salary', kind: 'Column' },
        ];
      }

      case 'SELECT_LIST': {
        const items: CompletionItem[] = [
          { label: 'DISTINCT', kind: 'Keyword', detail: 'Filter unique rows' },
          { label: 'CALCULATED', kind: 'Keyword', detail: 'Reference previously calculated SELECT column' },
          { label: 'COUNT(*)', kind: 'Function', detail: 'Count total rows' },
          { label: 'SUM()', kind: 'Function', detail: 'Sum expression', insertText: 'SUM($1)' },
          { label: 'AVG()', kind: 'Function', detail: 'Average expression', insertText: 'AVG($1)' },
          { label: 'MIN()', kind: 'Function', detail: 'Minimum value', insertText: 'MIN($1)' },
          { label: 'MAX()', kind: 'Function', detail: 'Maximum value', insertText: 'MAX($1)' },
          { label: 'COALESCE()', kind: 'Function', detail: 'First non-null value' },
          { label: 'SUBSTR()', kind: 'Function', detail: 'Substring function' },
        ];

        if (this.schema?.tables) {
          for (const tableName of Object.keys(this.schema.tables)) {
            for (const col of this.schema.tables[tableName]) {
              items.push({ label: col, kind: 'Column', detail: `Column in ${tableName}` });
            }
          }
        }

        return items;
      }

      case 'INTO_CLAUSE':
        return [
          { label: ':macro_var', kind: 'Variable', detail: 'Bind single output value' },
          { label: ':var1 - :varN', kind: 'Variable', detail: 'Bind range of host variables' },
          { label: "SEPARATED BY ', '", kind: 'Option', detail: 'Concatenate multiple values into macro variable' },
        ];

      case 'FROM_CLAUSE':
        return [
          { label: 'JOIN', kind: 'Keyword' },
          { label: 'INNER JOIN', kind: 'Keyword' },
          { label: 'LEFT JOIN', kind: 'Keyword' },
          { label: 'RIGHT JOIN', kind: 'Keyword' },
          { label: 'FULL JOIN', kind: 'Keyword' },
          { label: 'CROSS JOIN', kind: 'Keyword' },
          { label: 'ON', kind: 'Keyword' },
        ];

      case 'WHERE_CLAUSE':
        return [
          { label: 'CALCULATED', kind: 'Keyword', detail: 'Reference computed column' },
          { label: 'AND', kind: 'Keyword' },
          { label: 'OR', kind: 'Keyword' },
          { label: 'BETWEEN', kind: 'Keyword' },
          { label: 'IN', kind: 'Keyword' },
          { label: 'IS NULL', kind: 'Keyword' },
          { label: 'LIKE', kind: 'Keyword' },
        ];

      default:
        return [
          { label: 'PROC SQL', kind: 'Keyword' },
          { label: 'SELECT', kind: 'Keyword' },
          { label: 'CREATE TABLE', kind: 'Keyword' },
          { label: 'CREATE VIEW', kind: 'Keyword' },
          { label: 'INSERT INTO', kind: 'Keyword' },
          { label: 'UPDATE', kind: 'Keyword' },
          { label: 'DELETE FROM', kind: 'Keyword' },
          { label: 'QUIT;', kind: 'Keyword' },
        ];
    }
  }
}
