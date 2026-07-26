import { Position } from '../lexer/token.js';

export type DiagnosticSeverity = 'Error' | 'Warning' | 'Information' | 'Hint';

export interface Diagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  position?: Position;
}
