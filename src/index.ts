// Main entry point for Pine Script Compiler
export { PineScriptCompiler } from './compiler';
export { CLI } from './cli';
export { Lexer } from './lexer';
export { Parser } from './parser';
export { SemanticAnalyzer } from './semantic';
export { ErrorReporter } from './reporter';
export * from './types';

// Version information
export const VERSION = '1.0.0';
