# proc-sql-parser

A zero-dependency, type-safe TypeScript parser and toolkit for **SAS PROC SQL**.

Supports standard ANSI SQL syntax + SAS PROC SQL extensions (including `PROC SQL ... QUIT;` blocks, PROC SQL options like `NOPRINT`, `OUTOBS=`, `FEEDBACK`, `CALCULATED` columns, macro variables `&var`, host variable bindings `INTO :var1 - :varN`, and SAS macro expressions).

---

## Quick Start

```bash
npm install proc-sql-parser
```

```ts
import { parse } from 'proc-sql-parser';

const ast = parse(`
  PROC SQL;
    SELECT name, salary
    FROM employees
    WHERE salary > 50000;
  QUIT;
`);

console.log(ast);
```

`parse()` returns the AST and throws a syntax error for invalid input.

## Library API

The common API is intentionally small:

```ts
import { parse, lint, format, complete, visit } from 'proc-sql-parser';
```

| Function | Purpose |
| --- | --- |
| `parse(procSql)` | Parse SAS PROC SQL into an AST. |
| `lint(procSql)` | Return PROC SQL syntax and lint diagnostics. |
| `format(procSql)` | Return consistently formatted PROC SQL. |
| `complete(procSql, offset, schema?)` | Return editor completion suggestions. |
| `visit(ast, visitor)` | Traverse statements and expressions. |

### Parse

```typescript
import { parse } from 'proc-sql-parser';

const sasCode = `
  PROC SQL NOPRINT OUTOBS=100;
    SELECT e.name, e.salary * 1.1 AS new_salary
    INTO :names SEPARATED BY ', '
    FROM work.employees AS e
    WHERE e.salary > 50000;
  QUIT;
`;

const ast = parse(sasCode);

console.log(JSON.stringify(ast, null, 2));
```

### Format

```typescript
import { format } from 'proc-sql-parser';

const rawCode = `PROC SQL NOPRINT; SELECT a, b FROM mylib.data WHERE a > 10; QUIT;`;
const formattedCode = format(rawCode);

console.log(formattedCode);
/* Output:
PROC SQL NOPRINT;
  SELECT a, b FROM mylib.data WHERE (a > 10);
QUIT;
*/
```

### Lint

```ts
import { lint } from 'proc-sql-parser';

const diagnostics = lint('PROC SQL; SELECT FROM employees; QUIT;');
for (const diagnostic of diagnostics) {
  console.log(`${diagnostic.severity}: ${diagnostic.message}`);
}
```

### Complete

```ts
import { complete } from 'proc-sql-parser';

const suggestions = complete('PROC SQL; SELECT  FROM employees;', 17);
```

Pass optional schema metadata to suggest known columns:

```ts
complete('SELECT e. FROM employees e;', 9, {
  tables: { employees: ['id', 'name', 'salary'] },
});
```

### Visit the AST

```typescript
import { parse, visit } from 'proc-sql-parser';

const code = `SELECT name FROM class WHERE CALCULATED total > 100;`;
const ast = parse(code);

visit(ast, {
  visitSelectStatement(node) {
    console.log(`Found SELECT query with ${node.columns.length} column(s)`);
  },
  visitExpression(expr) {
    if (expr.type === 'CalculatedExpr') {
      console.log(`Found CALCULATED column reference: ${expr.column}`);
    }
  }
});
```

### Advanced API

`Parser`, `Lexer`, `ASTPrinter`, `ASTWalker`, AST types, and other lower-level exports remain available when you need custom parsing or editor integration.

---

## Monaco Editor Integration

Add PROC SQL highlighting, completions, formatting, and diagnostics to a Monaco Editor in three steps.

### 1. Install the packages

```bash
npm install monaco-editor proc-sql-parser
```

### 2. Add an editor container

```html
<div id="editor" style="height: 500px"></div>
```

### 3. Create and attach the editor

```ts
import * as monaco from 'monaco-editor';
import { procsql } from 'proc-sql-parser';

// Call once when the application starts. This registers the `procsql` language.
procsql.monaco.setup(monaco);

const editor = monaco.editor.create(document.getElementById('editor')!, {
  value: `PROC SQL;
  SELECT name, salary
  FROM employees;
QUIT;`,
  language: 'procsql',
  theme: 'vs-dark',
  automaticLayout: true,
});

// Call once for each editor instance.
procsql.monaco.attach(editor, monaco);
```

The integration provides keyword highlighting, completion suggestions, document formatting, and syntax/lint markers. Call `setup()` once per application and `attach()` for every PROC SQL editor you create.

### React

With `@monaco-editor/react`, pass the provided helpers directly to the editor. No Monaco instance management is needed in your component.

```tsx
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { attachProcSql, enableProcSql } from 'proc-sql-parser';

export default function ProcSqlEditor() {
  const [procSql, setProcSql] = useState('PROC SQL;\n  SELECT * FROM work.class;\nQUIT;');

  return (
    <Editor
      height="500px"
      language="procsql"
      theme="vs-dark"
      value={procSql}
      beforeMount={enableProcSql}
      onMount={(editor, monaco) => attachProcSql(editor, monaco, { warnings: false })}
      onChange={(value) => setProcSql(value ?? '')}
    />
  );
}
```

To add PROC SQL to a language selector, use:

```html
<option value="procsql">PROC SQL (SAS)</option>
```

## Command-Line Interface

You can run the CLI without installing any code directly using `npx`:

### Validate PROC SQL Syntax
Check if a SAS file has valid PROC SQL syntax:
```bash
npx proc-sql-parser validate script.sas
```

### Format PROC SQL Files
Format raw or messy PROC SQL code:
```bash
npx proc-sql-parser format input.sas > output.sas
```

### Inspect AST as JSON
Export AST to JSON for data analysis or downstream tools:
```bash
npx proc-sql-parser parse query.sas
```

---

## Supported Syntax

| Feature | Syntax Example |
|---|---|
| **Block Lifecycle** | `PROC SQL NOPRINT OUTOBS=50; ... QUIT;` |
| **Calculated Columns** | `SELECT x+1 AS y WHERE CALCULATED y > 10` |
| **Macro Host Variables** | `INTO :var1 - :var5` or `INTO :list SEPARATED BY ', '` |
| **Macro Variables** | `WHERE date = "&sysdate."` |
| **Joins** | `INNER`, `LEFT OUTER`, `RIGHT`, `FULL`, `CROSS` |
| **DDL & DML** | `CREATE TABLE ... AS SELECT`, `CREATE VIEW`, `INSERT INTO`, `UPDATE`, `DELETE`, `ALTER TABLE`, `DROP` |
| **Complex Expressions** | `CASE WHEN ... THEN ... ELSE ... END`, `BETWEEN`, `IN (...)`, `IS NULL`, subqueries |
