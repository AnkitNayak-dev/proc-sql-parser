import { Token, TokenType } from '../lexer/token.js';

export type CompletionContextType =
  | 'PROC_OPTIONS'
  | 'SELECT_LIST'
  | 'ALIAS_DOT'
  | 'FROM_CLAUSE'
  | 'WHERE_CLAUSE'
  | 'INTO_CLAUSE'
  | 'GENERAL_SQL';

export interface CompletionContext {
  type: CompletionContextType;
  aliasPrefix?: string; // e.g. 'e' if user typed 'e.'
  filterPrefix?: string; // partial word typed by user
}

export function detectCompletionContext(tokens: Token[], cursorOffset: number): CompletionContext {
  // Find tokens up to the cursor
  const relevantTokens = tokens.filter((t) => t.position.offset <= cursorOffset && t.type !== TokenType.EOF);

  if (relevantTokens.length === 0) {
    return { type: 'GENERAL_SQL' };
  }

  const lastToken = relevantTokens[relevantTokens.length - 1];

  // Check alias dot context: e.g. `e.`
  if (lastToken.type === TokenType.Dot && relevantTokens.length >= 2) {
    const prev = relevantTokens[relevantTokens.length - 2];
    if (prev.type === TokenType.Identifier || prev.type === TokenType.Keyword) {
      return {
        type: 'ALIAS_DOT',
        aliasPrefix: prev.value,
      };
    }
  }

  // Look backwards for keywords to determine context clause
  for (let i = relevantTokens.length - 1; i >= 0; i--) {
    const t = relevantTokens[i];
    if (t.type === TokenType.Keyword) {
      const val = t.value.toUpperCase();
      if (val === 'SQL' || val === 'PROC') {
        return { type: 'PROC_OPTIONS' };
      }
      if (val === 'SELECT') {
        return { type: 'SELECT_LIST' };
      }
      if (val === 'INTO') {
        return { type: 'INTO_CLAUSE' };
      }
      if (val === 'FROM' || val === 'JOIN') {
        return { type: 'FROM_CLAUSE' };
      }
      if (val === 'WHERE' || val === 'HAVING') {
        return { type: 'WHERE_CLAUSE' };
      }
    }
  }

  return { type: 'GENERAL_SQL' };
}
