/**
 * Core types for Pine Script compiler
 */

// Token types for lexical analysis
export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  
  // Identifiers
  IDENTIFIER = 'IDENTIFIER',
  
  // Keywords
  STRATEGY = 'STRATEGY',
  INDICATOR = 'INDICATOR',
  PLOT = 'PLOT',
  IF = 'IF',
  ELSE = 'ELSE',
  FOR = 'FOR',
  WHILE = 'WHILE',
  VAR = 'VAR',
  VARIP = 'VARIP',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NA = 'NA',
  TO = 'TO',
  BY = 'BY',
  RETURN = 'RETURN',
  ARRAY = 'ARRAY',
  MATRIX = 'MATRIX',
  MAP = 'MAP',
  SET = 'SET',
  TABLE = 'TABLE',
  BOX = 'BOX',
  LINE = 'LINE',
  LABEL = 'LABEL',
  POLYLINE = 'POLYLINE',
  STUDY = 'STUDY',
  LIBRARY = 'LIBRARY',
  IMPORT = 'IMPORT',
  EXPORT = 'EXPORT',
  METHOD = 'METHOD',
  TYPE = 'TYPE',
  SWITCH = 'SWITCH',
  BREAK = 'BREAK',
  CONTINUE = 'CONTINUE',
  
  // Operators
  ASSIGN = 'ASSIGN',           // :=
  EQUAL = 'EQUAL',             // =
  PLUS = 'PLUS',               // +
  MINUS = 'MINUS',             // -
  MULTIPLY = 'MULTIPLY',       // *
  DIVIDE = 'DIVIDE',           // /
  MODULO = 'MODULO',           // %
  POWER = 'POWER',             // ^
  
  // Comparison
  EQ = 'EQ',                   // ==
  NE = 'NE',                   // !=
  NOT_EQUAL = 'NOT_EQUAL',     // !=
  LT = 'LT',                   // <
  LESS = 'LESS',               // <
  LE = 'LE',                   // <=
  LESS_EQUAL = 'LESS_EQUAL',   // <=
  GT = 'GT',                   // >
  GREATER = 'GREATER',         // >
  GE = 'GE',                   // >=
  GREATER_EQUAL = 'GREATER_EQUAL', // >=
  
  // Logical
  AND = 'AND',                 // and
  OR = 'OR',                   // or
  NOT = 'NOT',                 // not
  
  // Punctuation
  LPAREN = 'LPAREN',           // (
  LEFT_PAREN = 'LEFT_PAREN',   // (
  RPAREN = 'RPAREN',           // )
  RIGHT_PAREN = 'RIGHT_PAREN', // )
  LBRACKET = 'LBRACKET',       // [
  RBRACKET = 'RBRACKET',       // ]
  COMMA = 'COMMA',             // ,
  DOT = 'DOT',                 // .
  QUESTION = 'QUESTION',       // ?
  COLON = 'COLON',             // :
  ARROW = 'ARROW',             // =>
  
  // Special
  NEWLINE = 'NEWLINE',
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',
  EOF = 'EOF',
  COMMENT = 'COMMENT',
  ERROR = 'ERROR',
  VERSION_DIRECTIVE = 'VERSION_DIRECTIVE',
}

// Token interface
export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  position: number;
  location: SourceLocation;
}

// Source location for error reporting
export interface SourceLocation {
  line: number;
  column: number;
  length: number;
  source: string;
}

// AST Node types
export enum NodeType {
  PROGRAM = 'PROGRAM',
  STRATEGY_DECLARATION = 'STRATEGY_DECLARATION',
  INDICATOR_DECLARATION = 'INDICATOR_DECLARATION',
  VARIABLE_DECLARATION = 'VARIABLE_DECLARATION',
  FUNCTION_DECLARATION = 'FUNCTION_DECLARATION',
  FUNCTION_CALL = 'FUNCTION_CALL',
  CALL_EXPRESSION = 'CALL_EXPRESSION',
  MEMBER_EXPRESSION = 'MEMBER_EXPRESSION',
  PLOT_STATEMENT = 'PLOT_STATEMENT',
  IF_STATEMENT = 'IF_STATEMENT',
  FOR_STATEMENT = 'FOR_STATEMENT',
  WHILE_STATEMENT = 'WHILE_STATEMENT',
  ASSIGNMENT = 'ASSIGNMENT',
  ASSIGNMENT_STATEMENT = 'ASSIGNMENT_STATEMENT',
  BINARY_EXPRESSION = 'BINARY_EXPRESSION',
  UNARY_EXPRESSION = 'UNARY_EXPRESSION',
  CONDITIONAL_EXPRESSION = 'CONDITIONAL_EXPRESSION',
  IDENTIFIER = 'IDENTIFIER',
  LITERAL = 'LITERAL',
  ARRAY_ACCESS = 'ARRAY_ACCESS',
  ARRAY_LITERAL = 'ARRAY_LITERAL',
  MEMBER_ACCESS = 'MEMBER_ACCESS',
  BLOCK = 'BLOCK',
  BLOCK_STATEMENT = 'BLOCK_STATEMENT',

}

// AST Node interface
export interface ASTNode {
  type: NodeType;
  children: ASTNode[];
  body?: ASTNode[];
  value?: unknown;
  location: SourceLocation;
  parent?: ASTNode;
}

// Error types
export enum ErrorType {
  LEXICAL = 'lexical',
  SYNTAX = 'syntax',
  SEMANTIC = 'semantic',
}

export enum ErrorSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

// Compiler error interface
export interface CompilerError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  location: SourceLocation;
  suggestion?: string;
  code: string;
}

// Lexer result
export interface LexerResult {
  tokens: Token[];
  errors: CompilerError[];
}

// Parser result
export interface ParseResult {
  ast: ASTNode | null;
  errors: CompilerError[];
  success?: boolean;
}

// Semantic analysis result
export interface SemanticResult {
  symbolTable: SymbolTable;
  errors: CompilerError[];
}

// Symbol table for semantic analysis
export interface Symbol {
  name: string;
  type: string;
  location: SourceLocation;
  scope: string;
  isFunction: boolean;
  parameters?: Parameter[];
}

export interface Parameter {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: unknown;
}

export interface SymbolTable {
  symbols: Map<string, Symbol>;
  scopes: Map<string, Set<string>>;
  currentScope: string;
}

// Compiler options
export interface CompilerOptions {
  strictMode: boolean;
  outputFormat: 'json' | 'table' | 'minimal' | 'detailed';
  includeWarnings: boolean;
  maxErrors: number;
  pineVersion: 'v4' | 'v5' | 'v6';
}

// Compilation result
export interface CompileResult {
  success: boolean;
  errors: CompilerError[];
  warnings: CompilerError[];
  ast?: ASTNode;
  executionTime: number;
  filePath: string;
}

// Error codes for specific Pine Script errors
export enum ErrorCodes {
  // Lexical Errors (1000-1999)
  INVALID_CHARACTER = 1001,
  UNTERMINATED_STRING = 1002,
  INVALID_NUMBER_FORMAT = 1003,
  
  // Syntax Errors (2000-2999)
  UNEXPECTED_TOKEN = 2001,
  MISSING_SEMICOLON = 2002,
  UNMATCHED_PARENTHESES = 2003,
  INVALID_FUNCTION_DECLARATION = 2004,
  MISSING_STRATEGY_DECLARATION = 2005,
  
  // Semantic Errors (3000-3999)
  UNDEFINED_VARIABLE = 3001,
  TYPE_MISMATCH = 3002,
  INVALID_FUNCTION_CALL = 3003,
  PLOT_IN_LOOP = 3004,
  TUPLE_ASSIGNMENT_ERROR = 3005,
  VARIABLE_REDECLARATION = 3006,
  INVALID_SCOPE_ACCESS = 3007,
  MISSING_RETURN_TYPE = 3008,
}

// Pine Script specific types
export enum PineType {
  INT = 'int',
  FLOAT = 'float',
  BOOL = 'bool',
  STRING = 'string',
  COLOR = 'color',
  SERIES_INT = 'series<int>',
  SERIES_FLOAT = 'series<float>',
  SERIES_BOOL = 'series<bool>',
  SERIES_STRING = 'series<string>',
  SERIES_COLOR = 'series<color>',
  ARRAY = 'array',
  MATRIX = 'matrix',
  MAP = 'map',
  VOID = 'void',
  NA = 'na',
}

// Built-in Pine Script functions
export interface BuiltinFunction {
  name: string;
  returnType: PineType;
  parameters: Parameter[];
  description: string;
  deprecated?: boolean;
  version?: string;
}
