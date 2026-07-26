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
import { KEYWORDS } from './lexer/keywords.js';
import { Diagnostic } from './linter/diagnostics.js';

/**
 * High-level sql.js-like interface for SAS PROC SQL parsing, linting, formatting, and editor integration.
 */
export const procsql = {
  /**
   * Parse SAS PROC SQL code into an AST.
   */
  parse(code: string) {
    const parser = new Parser(code);
    const ast = parser.parse();
    return {
      ast,
      errors: parser.errors,
    };
  },

  /**
   * Check if code is syntactically valid (returns boolean).
   */
  validate(code: string): boolean {
    const parser = new Parser(code);
    parser.parse();
    return parser.errors.length === 0;
  },

  /**
   * Run syntax error checking and static code linting rules.
   */
  lint(code: string): Diagnostic[] {
    const parser = new Parser(code);
    parser.parse();
    
    const syntaxErrors: Diagnostic[] = parser.errors.map(err => ({
      code: 'SYNTAX_ERROR',
      message: err.message,
      severity: 'Error' as const,
      position: err.position,
    }));

    const linter = new Linter();
    const linterRules = linter.lint(code);

    return [...syntaxErrors, ...linterRules];
  },

  /**
   * Format SAS PROC SQL code into clean, standardized SQL.
   */
  format(code: string): string {
    const parser = new Parser(code);
    const ast = parser.parse();
    const printer = new ASTPrinter();
    return printer.print(ast);
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

