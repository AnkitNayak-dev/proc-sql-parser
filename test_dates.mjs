import { lint } from './dist/index.js';

const tests = [
  { name: "Invalid 1: Missing d suffix", sql: `PROC SQL;
    SELECT *
    FROM SASHELP.CLASS
    WHERE BIRTHDAY = '01JAN2024';
QUIT;` },
  { name: "Invalid 2: Invalid month", sql: `PROC SQL;
    SELECT *
    FROM SASHELP.CLASS
    WHERE BIRTHDAY = '01ABC2024'd;
QUIT;` },
  { name: "Invalid 3: Unterminated date literal", sql: `PROC SQL;
    SELECT *
    FROM SASHELP.CLASS
    WHERE BIRTHDAY = '01JAN2024d;
QUIT;` },
  { name: "Invalid 4: Missing value after BETWEEN", sql: `PROC SQL;
    SELECT *
    FROM SASHELP.CLASS
    WHERE BIRTHDAY BETWEEN '01JAN2024'd AND;
QUIT;` },
  { name: "Invalid 5: Missing function argument", sql: `PROC SQL;
    SELECT TODAY(;
QUIT;` },
  { name: "Invalid 6: Missing closing parenthesis", sql: `PROC SQL;
    SELECT YEAR(BIRTHDAY
    FROM SASHELP.CLASS;
QUIT;` },
  { name: "Invalid 7: Missing date after operator", sql: `PROC SQL;
    SELECT *
    FROM SASHELP.CLASS
    WHERE BIRTHDAY >;
QUIT;` },
  { name: "Invalid 8: Invalid datetime suffix", sql: `PROC SQL;
    SELECT '01JAN2024'x AS D;
QUIT;` }
];

tests.forEach(t => {
  const diagnostics = lint(t.sql);
  const errors = diagnostics.filter(d => d.severity === 'Error');
  const status = errors.length > 0 ? '🔴 ERROR CAUGHT' : '⚠️ MISSED';
  
  console.log(`[${t.name}] ${status}`);
  errors.forEach(e => console.log(`    - [${e.severity}] ${e.code}: ${e.message}`));
  console.log('');
});
