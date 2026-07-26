export * from './lexer/token.js';
export * from './lexer/lexer.js';
export * from './lexer/keywords.js';

export * from './ast/types.js';

export * from './parser/parser.js';
export * from './parser/error.js';

export * from './formatter/printer.js';
export * from './visitor/visitor.js';

export * from './linter/diagnostics.js';
export * from './linter/rules.js';
export * from './linter/linter.js';

export * from './completion/context.js';
export * from './completion/completion.js';

import { Parser } from './parser/parser.js';
import { Linter } from './linter/linter.js';
import { ASTPrinter } from './formatter/printer.js';
import { CompletionEngine } from './completion/completion.js';
import { CompletionItem, SchemaMetadata } from './completion/completion.js';
import { KEYWORDS } from './lexer/keywords.js';
import { Diagnostic } from './linter/diagnostics.js';
import { Statement } from './ast/types.js';
import { ASTVisitor, ASTWalker } from './visitor/visitor.js';

/** Parse SAS PROC SQL into an AST. Throws the first syntax error, if any. */
export function parse(procSql: string): Statement[] {
  return new Parser(procSql).parse(true);
}

/** Return syntax and static-analysis diagnostics without throwing. */
export function lint(procSql: string): Diagnostic[] {
  const parser = new Parser(procSql);
  parser.parse();

  const syntaxErrors: Diagnostic[] = parser.errors.map(err => ({
    code: 'SYNTAX_ERROR',
    message: err.message,
    severity: 'Error' as const,
    position: err.position,
  }));

  return [...syntaxErrors, ...new Linter().lint(procSql)];
}

/** Format SAS PROC SQL using the package's standard printer. */
export function format(procSql: string): string {
  return new ASTPrinter().print(parse(procSql));
}

/** Get completion suggestions at a zero-based character offset. */
export function complete(
  procSql: string,
  cursorOffset: number,
  schema?: SchemaMetadata,
): CompletionItem[] {
  return new CompletionEngine(schema).getCompletions(procSql, cursorOffset);
}

/** Visit every statement and expression in an AST. */
export function visit(ast: Statement | Statement[], visitor: ASTVisitor): void {
  const walker = new ASTWalker(visitor);
  const statements = Array.isArray(ast) ? ast : [ast];
  statements.forEach((statement) => walker.walkStatement(statement));
}

/**
 * High-level sql.js-like interface for SAS PROC SQL parsing, linting, formatting, and editor integration.
 */
export const procsql = {
  /**
   * Parse SAS PROC SQL code into an AST.
   */
  parse(procSql: string) {
    const parser = new Parser(procSql);
    const ast = parser.parse();
    return {
      ast,
      errors: parser.errors,
    };
  },

  /**
   * Check whether PROC SQL is syntactically valid (returns boolean).
   */
  validate(procSql: string): boolean {
    const parser = new Parser(procSql);
    parser.parse();
    return parser.errors.length === 0;
  },

  /**
   * Run syntax error checking and static code linting rules.
   */
  lint(procSql: string): Diagnostic[] {
    return lint(procSql);
  },

  /**
   * Format SAS PROC SQL code into clean, standardized SQL.
   */
  format(procSql: string): string {
    return format(procSql);
  },

  /**
   * Monaco Editor 1-line integration helper.
   */
  monaco: {
    setup(monacoInstance: any) {
      monacoInstance.languages.register({ id: 'procsql' });
      monacoInstance.languages.setMonarchTokensProvider('procsql', {
        keywords: Array.from(KEYWORDS),
        tokenizer: {
          root: [
            [/PROC\s+SQL/i, 'keyword'],
            [/QUIT;/i, 'keyword'],
            [/&[a-zA-Z0-9_.]+/ , 'variable.macro'],
            [/:[a-zA-Z0-9_]+/ , 'variable.host'],
            [/\/\*/, 'comment', '@comment'],
            [/'[^']*'|"[^"]*"/, 'string'],
            [/\d+(\.\d+)?/, 'number'],
            [/[a-zA-Z_]\w*/, {
              cases: {
                '@keywords': 'keyword',
                '@default': 'identifier',
              },
            }],
          ],
          comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment'],
          ],
        },
      });

      const completionEngine = new CompletionEngine();
      monacoInstance.languages.registerCompletionItemProvider('procsql', {
        provideCompletionItems: (model: any, position: any) => {
          const code = model.getValue();
          const offset = model.getOffsetAt(position);
          const suggestions = completionEngine.getCompletions(code, offset);

          return {
            suggestions: suggestions.map((item) => ({
              label: item.label,
              kind: item.kind === 'Keyword' 
                ? monacoInstance.languages.CompletionItemKind.Keyword 
                : monacoInstance.languages.CompletionItemKind.Field,
              insertText: item.label,
              detail: item.detail,
              range: new monacoInstance.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              ),
            })),
          };
        },
      });

      monacoInstance.languages.registerDocumentFormattingEditProvider('procsql', {
        provideDocumentFormattingEdits: (model: any) => {
          const formatted = procsql.format(model.getValue());
          return [
            {
              range: model.getFullModelRange(),
              text: formatted,
            },
          ];
        },
      });
    },

    attach(editorInstance: any, monacoInstance: any) {
      const updateMarkers = () => {
        const model = editorInstance.getModel();
        if (!model) return;
        const code = model.getValue();
        const diagnostics = procsql.lint(code);

        const markers = diagnostics.map((d) => ({
          severity: d.severity === 'Error' 
            ? monacoInstance.MarkerSeverity.Error 
            : monacoInstance.MarkerSeverity.Warning,
          message: `[${d.code}] ${d.message}`,
          startLineNumber: d.position?.line || 1,
          startColumn: d.position?.column || 1,
          endLineNumber: d.position?.line || 1,
          endColumn: (d.position?.column || 1) + 4,
        }));

        monacoInstance.editor.setModelMarkers(model, 'procsql-validator', markers);
      };

      editorInstance.onDidChangeModelContent(updateMarkers);
      updateMarkers();
    }
  }
};
