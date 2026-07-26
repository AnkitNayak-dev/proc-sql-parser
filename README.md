# proc-sql-parser

A zero-dependency, type-safe TypeScript **SAS PROC SQL Lexer, Parser, AST Generator, and Formatter**.

Supports standard ANSI SQL syntax + SAS PROC SQL extensions (including `PROC SQL ... QUIT;` blocks, PROC SQL options like `NOPRINT`, `OUTOBS=`, `FEEDBACK`, `CALCULATED` columns, macro variables `&var`, host variable bindings `INTO :var1 - :varN`, and SAS macro expressions).

---

## 🚀 Usage for Developers (Library API)

### 1. Installation

```bash
npm install proc-sql-parser
```

### 2. Parse PROC SQL Code into AST

```typescript
import { Parser } from 'proc-sql-parser';

const sasCode = `
  PROC SQL NOPRINT OUTOBS=100;
    SELECT e.name, e.salary * 1.1 AS new_salary
    INTO :names SEPARATED BY ', '
    FROM work.employees AS e
    WHERE e.salary > 50000;
  QUIT;
`;

// Parse into Abstract Syntax Tree (AST)
const parser = new Parser(sasCode);
const ast = parser.parse();

console.log(JSON.stringify(ast, null, 2));
```

### 3. Pretty-Print / Format PROC SQL Code

```typescript
import { Parser, ASTPrinter } from 'proc-sql-parser';

const rawCode = `PROC SQL NOPRINT; SELECT a, b FROM mylib.data WHERE a > 10; QUIT;`;
const ast = new Parser(rawCode).parse();

const printer = new ASTPrinter();
const formattedCode = printer.print(ast);

console.log(formattedCode);
/* Output:
PROC SQL NOPRINT;
  SELECT a, b FROM mylib.data WHERE (a > 10);
QUIT;
*/
```

### 4. Traverse AST with ASTWalker / Visitor

```typescript
import { Parser, ASTWalker } from 'proc-sql-parser';

const code = `SELECT name FROM class WHERE CALCULATED total > 100;`;
const ast = new Parser(code).parse();

const walker = new ASTWalker({
  visitSelectStatement(node) {
    console.log(`Found SELECT query with ${node.columns.length} column(s)`);
  },
  visitExpression(expr) {
    if (expr.type === 'CalculatedExpr') {
      console.log(`Found CALCULATED column reference: ${expr.column}`);
    }
  }
});

ast.forEach(stmt => walker.walkStatement(stmt));
```

---

## 🛠️ Usage for End Users (CLI Tool)

You can run the CLI without installing any code directly using `npx`:

### 1. Validate PROC SQL Syntax
Check if a SAS file has valid PROC SQL syntax:
```bash
npx proc-sql-parser validate script.sas
```

### 2. Pretty Format PROC SQL Files
Format raw or messy PROC SQL code:
```bash
npx proc-sql-parser format input.sas > output.sas
```

### 3. Inspect AST as JSON
Export AST to JSON for data analysis or downstream tools:
```bash
npx proc-sql-parser parse query.sas
```

---

## 💡 Key Features & Supported Syntax

| Feature | Syntax Example |
|---|---|
| **Block Lifecycle** | `PROC SQL NOPRINT OUTOBS=50; ... QUIT;` |
| **Calculated Columns** | `SELECT x+1 AS y WHERE CALCULATED y > 10` |
| **Macro Host Variables** | `INTO :var1 - :var5` or `INTO :list SEPARATED BY ', '` |
| **Macro Variables** | `WHERE date = "&sysdate."` |
| **Joins** | `INNER`, `LEFT OUTER`, `RIGHT`, `FULL`, `CROSS` |
| **DDL & DML** | `CREATE TABLE ... AS SELECT`, `CREATE VIEW`, `INSERT INTO`, `UPDATE`, `DELETE`, `ALTER TABLE`, `DROP` |
| **Complex Expressions** | `CASE WHEN ... THEN ... ELSE ... END`, `BETWEEN`, `IN (...)`, `IS NULL`, subqueries |
