#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser/parser.js';
import { ASTPrinter } from './formatter/printer.js';
import { ParseError } from './parser/error.js';
import { Linter } from './linter/linter.js';

function printHelp() {
  console.log(`
SAS PROC SQL Parser CLI

Usage:
  npx proc-sql-parser <command> [file] [options]

Commands:
  parse <file.sas>       Parse SAS/PROC SQL code and print AST as JSON
  format <file.sas>      Parse and pretty-print formatted PROC SQL code
  validate <file.sas>    Validate PROC SQL syntax and report syntax errors

Options:
  --help, -h             Show this help message
  --json                 (For format) Print AST alongside output
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const filePath = args[1];

  if (!filePath && ['parse', 'format', 'validate'].includes(command)) {
    console.error(`Error: Missing file path for command '${command}'.`);
    printHelp();
    process.exit(1);
  }

  let code = '';
  try {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    code = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err: any) {
    console.error(`Error reading file '${filePath}': ${err.message}`);
    process.exit(1);
  }

  try {
    const parser = new Parser(code);
    const ast = parser.parse();

    switch (command) {
      case 'parse':
        console.log(JSON.stringify(ast, null, 2));
        break;

      case 'format': {
        const printer = new ASTPrinter();
        console.log(printer.print(ast));
        break;
      }

      case 'validate':
        console.log(`✓ Syntax valid! Parsed ${ast.length} statement(s) successfully.`);
        break;

      case 'lint': {
        const linter = new Linter();
        const diagnostics = linter.lint(code);
        if (diagnostics.length === 0) {
          console.log(`✓ No lint issues found!`);
        } else {
          console.log(`Found ${diagnostics.length} diagnostic issue(s):`);
          for (const d of diagnostics) {
            const pos = d.position ? ` line ${d.position.line}, col ${d.position.column}` : '';
            console.log(`  [${d.severity}] ${d.code}${pos}: ${d.message}`);
          }
        }
        break;
      }

      default:
        console.error(`Unknown command: '${command}'`);
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    if (err instanceof ParseError) {
      console.error(`❌ Syntax Error: ${err.message}`);
    } else {
      console.error(`❌ Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
