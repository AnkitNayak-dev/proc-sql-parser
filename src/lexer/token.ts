export enum TokenType {
  // Keywords
  Keyword = 'Keyword',
  
  // Identifiers & Literals
  Identifier = 'Identifier',
  NumberLiteral = 'NumberLiteral',
  StringLiteral = 'StringLiteral',
  DateLiteral = 'DateLiteral',   // SAS date literal e.g. '01JAN2024'd
  TimeLiteral = 'TimeLiteral',   // SAS time literal e.g. '10:30:00't
  DateTimeLiteral = 'DateTimeLiteral', // SAS datetime literal e.g. '01JAN2024:10:30:00'dt
  MacroVariable = 'MacroVariable', // e.g. &name, &var.
  MacroCall = 'MacroCall',         // e.g. %sysfunc(...)

  // Operators & Punctuation
  Operator = 'Operator',
  Comma = 'Comma',               // ,
  Semicolon = 'Semicolon',       // ;
  Colon = 'Colon',               // : (used for macro var host binding e.g., INTO :var)
  LParen = 'LParen',             // (
  RParen = 'RParen',             // )
  Dot = 'Dot',                   // .

  // Special / Control
  Comment = 'Comment',
  EOF = 'EOF',
}

export interface Position {
  line: number;      // 1-indexed
  column: number;    // 1-indexed
  offset: number;    // 0-indexed char position in original text
}

export interface Token {
  type: TokenType;
  value: string;
  position: Position;
}
