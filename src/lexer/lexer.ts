import { Token, TokenType, CompilerError, ErrorType, ErrorSeverity, LexerResult, ErrorCodes } from '../types';

/**
 * Pine Script Lexer
 * Tokenizes Pine Script source code into a stream of tokens
 */
export class Lexer {
  private source: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private errors: CompilerError[] = [];
  private indentStack: number[] = [0];
  private atLineStart: boolean = true;

  private static readonly KEYWORDS: Map<string, TokenType> = new Map([
    ['var', TokenType.VAR],
    ['varip', TokenType.VARIP],
    ['if', TokenType.IF],
    ['else', TokenType.ELSE],
    ['for', TokenType.FOR],
    ['while', TokenType.WHILE],
    // Fix boolean literals to match parser expectations
    ['true', TokenType.TRUE],
    ['false', TokenType.FALSE],
    ['and', TokenType.AND],
    ['or', TokenType.OR],
    ['not', TokenType.NOT],
    ['plot', TokenType.PLOT],
    ['strategy', TokenType.STRATEGY],
    ['indicator', TokenType.INDICATOR],
    ['study', TokenType.STUDY],
    ['library', TokenType.LIBRARY],
    ['import', TokenType.IMPORT],
    ['export', TokenType.EXPORT],
    ['method', TokenType.METHOD],
    ['type', TokenType.TYPE],
    ['switch', TokenType.SWITCH],
    ['break', TokenType.BREAK],
    ['continue', TokenType.CONTINUE],
    ['return', TokenType.RETURN],
    ['na', TokenType.NA],
    ['array', TokenType.ARRAY],
    ['matrix', TokenType.MATRIX],
    ['map', TokenType.MAP],
    ['set', TokenType.SET],
    ['table', TokenType.TABLE],
    ['box', TokenType.BOX],
    ['line', TokenType.LINE],
    ['label', TokenType.LABEL],
    ['polyline', TokenType.POLYLINE],
    // Type keywords remain IDENTIFIER; parser's isTypeKeyword handles them by value
    ['int', TokenType.IDENTIFIER],
    ['float', TokenType.IDENTIFIER],
    ['bool', TokenType.IDENTIFIER],
    ['string', TokenType.IDENTIFIER],
    ['color', TokenType.IDENTIFIER],
  ]);

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the source code
   */
  public tokenize(source?: string): LexerResult {
    if (source !== undefined) {
      this.source = source;
      this.position = 0;
      this.line = 1;
      this.column = 1;
      this.indentStack = [0];
    }
    this.reset();
    
    // Note: no pre-scan needed
    
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    // Handle final dedents
    this.handleFinalDedents();
    
    // If the last token is not NEWLINE and we actually produced any tokens before EOF, add a trailing NEWLINE
    const hasRealTokens = this.tokens.some(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    if (hasRealTokens) {
      const last = this.tokens[this.tokens.length - 1];
      if (last && last.type !== TokenType.NEWLINE) {
        this.addToken(TokenType.NEWLINE, '\n');
      }
    }
    
    // Add EOF token
    this.addToken(TokenType.EOF, '');
    
    return { tokens: this.tokens, errors: this.errors };
  }

  private reset(): void {
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.indentStack = [0];
    this.tokens = [];
    this.errors = [];
    this.atLineStart = true;
  }

  
  private scanToken(): void {
    const char = this.advance();

    // Handle indentation at line start
    if (this.atLineStart && (char === ' ' || char === '\t')) {
      // We consumed one space/tab already; step back so handleIndentation sees the full indentation
      this.position--;
      this.column--;
      this.handleIndentation();
      return;
    } else if (this.atLineStart && char !== '\n' && char !== '\r') {
      // Line starts with a non-whitespace character: treat indentLevel as 0 and emit necessary DEDENTs
      const indentLevel = 0;
      const currentIndent = this.indentStack[this.indentStack.length - 1] ?? 0;
      if (indentLevel < currentIndent) {
        while (this.indentStack.length > 1 && (this.indentStack[this.indentStack.length - 1] ?? 0) > indentLevel) {
          this.indentStack.pop();
          this.addToken(TokenType.DEDENT, '');
        }
        if (this.indentStack[this.indentStack.length - 1] !== indentLevel) {
          this.addError(ErrorCodes.INVALID_CHARACTER, 'Indentation does not match any outer indentation level');
        }
      }
    }
    
    this.atLineStart = false;

    switch (char) {
      // Whitespace (except newlines and indentation)
      case ' ':
      case '\t':
        break;
        
      // Handle CRLF properly
      case '\r':
        // Check if next char is \n (CRLF sequence)
        if (this.peek() === '\n') {
          this.advance(); // consume the \n
          this.addToken(TokenType.NEWLINE, '\r\n');
        } else {
          this.addToken(TokenType.NEWLINE, '\r');
        }
        this.line++;
        this.column = 1;
        this.atLineStart = true;
        break;
        
      // Newlines
      case '\n':
        this.addToken(TokenType.NEWLINE, char);
        this.line++;
        this.column = 1;
        this.atLineStart = true;
        break;
        
      // Single character tokens
      case '(': 
        this.addToken(TokenType.LEFT_PAREN, char);
        break;
      case ')':
        this.addToken(TokenType.RIGHT_PAREN, char);
        break;
      case '[':
        this.addToken(TokenType.LBRACKET, char);
        break;
      case ']':
        this.addToken(TokenType.RBRACKET, char);
        break;
      case ',':
        this.addToken(TokenType.COMMA, char);
        break;
      case '.':
        // Leading dot number: if next is digit and previous is NOT digit, parse as number starting with '.'
        {
          const prevChar = this.position >= 2 ? this.source.charAt(this.position - 2) : '';
          const prevIsDigit = this.isDigit(prevChar);
          if (!prevIsDigit && this.isDigit(this.peek())) {
            this.scanNumber();
          } else {
            this.addToken(TokenType.DOT, '.');
          }
        }
        break;

      case '?':
        this.addToken(TokenType.QUESTION, char);
        break;
      case '+':
        this.addToken(TokenType.PLUS, char);
        break;
      case '-':
        this.addToken(TokenType.MINUS, char);
        break;
      case '*':
        this.addToken(TokenType.MULTIPLY, char);
        break;
      case '%':
        this.addToken(TokenType.MODULO, char);
        break;
      case '^':
        this.addToken(TokenType.POWER, char);
        break;
        
      // Two character tokens
      case ':':
        if (this.match('=')) {
          this.addToken(TokenType.ASSIGN, ':=');
        } else {
          this.addToken(TokenType.COLON, char);
        }
        break;
        
      case '=':
        if (this.match('=')) {
          this.addToken(TokenType.EQ, '==');
        } else if (this.match('>')) {
          this.addToken(TokenType.ARROW, '=>');
        } else {
          this.addToken(TokenType.EQUAL, char);
        }
        break;
        
      case '!':
        if (this.match('=')) {
          this.addToken(TokenType.NE, '!=');
        } else {
          this.addError(ErrorCodes.INVALID_CHARACTER, `Unexpected character '${char}'`, 'Use "not" for logical negation');
        }
        break;
        
      case '<':
        if (this.match('=')) {
          this.addToken(TokenType.LE, '<=');
        } else {
          this.addToken(TokenType.LT, char);
        }
        break;
        
      case '>':
        if (this.match('=')) {
          this.addToken(TokenType.GE, '>=');
        } else {
          this.addToken(TokenType.GT, char);
        }
        break;
        
      case '/':
        if (this.match('/')) {
          this.scanComment();
        } else if (this.match('*')) {
          this.scanMultiLineComment();
        } else {
          this.addToken(TokenType.DIVIDE, char);
        }
        break;
        
      // String literals
      case '"':
      case "'":
        this.scanString(char);
        break;
        
      default:
        if (this.isDigit(char)) {
          this.scanNumber();
        } else if (this.isAlpha(char)) {
          this.scanIdentifier();
        } else {
          this.addError(ErrorCodes.INVALID_CHARACTER, `Unexpected character '${char}'`);
          this.addToken(TokenType.ERROR, char);
        }
        break;
    }
  }

  private handleIndentation(): void {
    let indentLevel = 0;
    
    // Count indentation
    while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t')) {
      if (this.peek() === ' ') {
        indentLevel++;
      } else {
        indentLevel += 4; // Tab = 4 spaces
      }
      this.advance();
    }
    
    // Skip empty lines
    if (this.peek() === '\n' || this.peek() === '\r' || this.isAtEnd()) {
      return;
    }
    
    const currentIndent = this.indentStack[this.indentStack.length - 1];
    
    if (indentLevel > (currentIndent ?? 0)) {
      // Increase indentation
      this.indentStack.push(indentLevel);
      this.addToken(TokenType.INDENT, ' '.repeat(indentLevel));
    } else if (indentLevel < (currentIndent ?? 0)) {
      // Decrease indentation
      while (this.indentStack.length > 1 && (this.indentStack[this.indentStack.length - 1] ?? 0) > indentLevel) {
        this.indentStack.pop();
        this.addToken(TokenType.DEDENT, '');
      }
      
      if (this.indentStack[this.indentStack.length - 1] !== indentLevel) {
        this.addError(ErrorCodes.INVALID_CHARACTER, 'Indentation does not match any outer indentation level');
      }
    }
    
    this.atLineStart = false;
  }

  private handleFinalDedents(): void {
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.addToken(TokenType.DEDENT, '');
    }
  }

  private scanComment(): void {
    const start = this.position - 2; // Include the //
    
    // Check if this is a version directive
    if (this.source.substring(start, start + 10) === '//@version') {
      // Scan the entire version directive up to but NOT including the newline
       while (this.peek() !== '\n' && !this.isAtEnd()) {
         this.advance();
       }
       
       const value = this.source.substring(start, this.position);
       this.addToken(TokenType.VERSION_DIRECTIVE, value);
      // Consume a single newline if present, but DO NOT emit NEWLINE token
      if (!this.isAtEnd() && this.peek() === '\n') {
        this.advance();
        this.line++;
        this.column = 1;
        this.atLineStart = true;
      }
       return;
    }
    
    // Regular comment - just consume it, don't add token
    while (this.peek() !== '\n' && !this.isAtEnd()) {
      this.advance();
    }
    
    // Comments are not added to tokens - they are filtered out
  }

  private scanMultiLineComment(): void {
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance(); // consume '*'
        this.advance(); // consume '/'
        break;
      }
      
      if (this.peek() === '\n') {
        this.line++;
        this.column = 1;
      }
      
      this.advance();
    }
    
    if (this.isAtEnd() && !(this.source.charAt(this.position - 2) === '*' && this.source.charAt(this.position - 1) === '/')) {
      this.addError(ErrorCodes.UNTERMINATED_STRING, 'Unterminated multi-line comment');
      return;
    }
    
    // Multi-line comments are not added to tokens - they are filtered out
  }

  private scanString(quote: string): void {
    const start = this.position - 1;
    
    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === '\\') {
        // Handle escape sequences
        this.advance(); // consume backslash
        if (!this.isAtEnd()) {
          this.advance(); // consume escaped character
        }
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.column = 1;
        }
        this.advance();
      }
    }
    
    if (this.isAtEnd()) {
      this.addError(ErrorCodes.UNTERMINATED_STRING, 'Unterminated string literal', `Add closing ${quote}`);
      // Add ERROR token for unterminated string
      const value = this.source.substring(start, this.position);
      this.addToken(TokenType.ERROR, value);
      return;
    }
    
    // Consume closing quote
    this.advance();
    
    const value = this.source.substring(start, this.position);
    this.addToken(TokenType.STRING, value);
  }

  private scanNumber(): void {
    const start = this.position - 1;
    let hasDot = this.source.charAt(start) === '.';

    // If not started with dot, consume leading digits
    if (!hasDot) {
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Optionally one decimal part
    if (!hasDot && this.peek() === '.' && this.isDigit(this.peekNext())) {
      // If the previous emitted token is a DOT, do not consume decimal here (case: 123 . 456.789)
      const lastToken = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : undefined;
      const prevWasDot = lastToken?.type === TokenType.DOT;

      // Lookahead: if after fractional digits there's another '.' followed by a digit,
      // we should NOT consume the first decimal point here (case: 123.456.789)
      let shouldSkipDecimal = false;
      if (!prevWasDot) {
        let i = this.position + 1; // position of first digit after '.'
        while (i < this.source.length && this.isDigit(this.source.charAt(i))) {
          i++;
        }
        if (i < this.source.length && this.source.charAt(i) === '.' && (i + 1) < this.source.length && this.isDigit(this.source.charAt(i + 1))) {
          shouldSkipDecimal = true;
        }
      }

      if (prevWasDot || shouldSkipDecimal) {
        // Do not consume decimal; leave '.' to be tokenized separately
      } else {
        hasDot = true;
        this.advance(); // consume '.'
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }
    } else if (hasDot) {
      // Started with dot - consume following digits only once
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      const next = this.peekNext();
      if (this.isDigit(next) || next === '+' || next === '-') {
        this.advance(); // consume 'e'/'E'
        if (this.peek() === '+' || this.peek() === '-') {
          this.advance();
        }
        if (!this.isDigit(this.peek())) {
          this.addError(ErrorCodes.INVALID_NUMBER_FORMAT, 'Invalid number format in scientific notation');
          return;
        }
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }
    }

    const value = this.source.substring(start, this.position);
    this.addToken(TokenType.NUMBER, value);
  }

  private scanIdentifier(): void {
    const start = this.position - 1;
    
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
    
    const value = this.source.substring(start, this.position);
    const tokenType = Lexer.KEYWORDS.get(value) || TokenType.IDENTIFIER;
    
    this.addToken(tokenType, value);
  }

  private addToken(type: TokenType, value: string): void {
    const startColumn = this.column - value.length;
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: startColumn,
      position: this.position - value.length,
      location: {
        line: this.line,
        column: startColumn,
        length: value.length,
        source: this.source
      }
    });
  }

  private addError(code: ErrorCodes, message: string, suggestion?: string): void {
    const error: CompilerError = {
      type: ErrorType.LEXICAL,
      severity: ErrorSeverity.ERROR,
      message,
      location: {
        line: this.line,
        column: this.column,
        length: 1,
        source: this.source
      },
      code: code.toString()
    };
    
    if (suggestion !== undefined) {
      error.suggestion = suggestion;
    }
    
    this.errors.push(error);
  }

  private advance(): string {
    if (this.isAtEnd()) return '\0';
    
    const char = this.source.charAt(this.position);
    this.position++;
    this.column++;
    return char;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.position) !== expected) return false;
    
    this.position++;
    this.column++;
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source.charAt(this.position);
  }

  private peekNext(): string {
    if (this.position + 1 >= this.source.length) return '\0';
    return this.source.charAt(this.position + 1);
  }

  private isAtEnd(): boolean {
    return this.position >= this.source.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '_';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
