import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semantic';
import { ErrorReporter } from './reporter';
import { CompilerOptions, CompileResult, CompilerError, ErrorSeverity, ASTNode } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Pine Script Compiler
 * Main compiler class that orchestrates lexical analysis, parsing, and semantic analysis
 */
export class PineScriptCompiler {
  private options: CompilerOptions;
  private errorReporter: ErrorReporter;

  constructor(options: Partial<CompilerOptions> = {}) {
    this.options = {
      strictMode: true,
      outputFormat: 'table',
      includeWarnings: true,
      maxErrors: 50,
      pineVersion: 'v6',
      ...options
    };
    
    this.errorReporter = new ErrorReporter(this.options);
  }

  /**
   * Compile Pine Script file
   */
  public async compileFile(filePath: string): Promise<CompileResult> {
    const startTime = Date.now();
    
    try {
      // Read file (use synchronous read to avoid hanging with mocked async fs in tests)
      const source = fs.readFileSync(filePath, 'utf8');
      
      // Compile source
      const result = this.compileSource(source, filePath);
      
      return {
        ...result,
        executionTime: Date.now() - startTime,
        filePath
      };
    } catch (error) {
      return {
        success: false,
        errors: [{
          type: 'lexical' as any,
          severity: ErrorSeverity.ERROR,
          message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          location: { line: 1, column: 1, length: 1, source: '' },
          code: '1000'
        }],
        warnings: [],
        executionTime: Date.now() - startTime,
        filePath
      };
    }
  }

  /**
   * Compile Pine Script source code
   */
  public compileSource(source: string, filePath: string = '<input>'): CompileResult {
    const startTime = Date.now();
    const allErrors: CompilerError[] = [];
    
    try {
      // Lexical Analysis
      const lexer = new Lexer(source);
      const lexerResult = lexer.tokenize();
      allErrors.push(...lexerResult.errors);
      
      // Stop if lexical errors are too severe
      if (this.hasCriticalErrors(lexerResult.errors)) {
        return this.createFailureResult(allErrors, startTime, filePath);
      }
      
      // Syntax Analysis
      const parser = new Parser(lexerResult.tokens);
      const parseResult = parser.parse();
      allErrors.push(...parseResult.errors);
      
      // Stop if syntax errors are too severe
      if (!parseResult.ast || this.hasCriticalErrors(parseResult.errors)) {
        return this.createFailureResult(allErrors, startTime, filePath);
      }
      
      // Semantic Analysis
      const semanticAnalyzer = new SemanticAnalyzer();
      const semanticResult = semanticAnalyzer.analyze(parseResult.ast);
      allErrors.push(...semanticResult.errors);
      
      // Separate errors and warnings
      const errors = allErrors.filter(error => error.severity === ErrorSeverity.ERROR);
      const warnings = allErrors.filter(error => error.severity === ErrorSeverity.WARNING);
      
      return {
        success: errors.length === 0,
        errors,
        warnings,
        ast: parseResult.ast,
        executionTime: Date.now() - startTime,
        filePath
      };
      
    } catch (error) {
      allErrors.push({
        type: 'lexical' as any,
        severity: ErrorSeverity.ERROR,
        message: `Compilation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        location: { line: 1, column: 1, length: 1, source },
        code: '9999'
      });
      
      return this.createFailureResult(allErrors, startTime, filePath);
    }
  }

  /**
   * Format compilation results
   */
  public formatResults(result: CompileResult): string {
    const allErrors = [...result.errors, ...result.warnings];
    return this.errorReporter.reportErrors(allErrors, result.filePath);
  }

  /**
   * Get compiler version
   */
  public getVersion(): string {
    try {
      const packagePath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  /**
   * Get supported Pine Script versions
   */
  public getSupportedVersions(): string[] {
    return ['v4', 'v5', 'v6'];
  }

  /**
   * Validate Pine Script syntax only (fast check)
   */
  public validateSyntax(source: string): { valid: boolean; errors: CompilerError[] } {
    try {
      const lexer = new Lexer(source);
      const lexerResult = lexer.tokenize();
      
      if (lexerResult.errors.length > 0) {
        return { valid: false, errors: lexerResult.errors };
      }
      
      const parser = new Parser(lexerResult.tokens);
      const parseResult = parser.parse();
      
      return {
        valid: parseResult.errors.length === 0,
        errors: parseResult.errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          type: 'syntax' as any,
          severity: ErrorSeverity.ERROR,
          message: `Syntax validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          location: { line: 1, column: 1, length: 1, source },
          code: '2000'
        }]
      };
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats(result: CompileResult): { errors: number; warnings: number; info: number } {
    return this.errorReporter.getErrorStats([...result.errors, ...result.warnings]);
  }

  /**
   * Update compiler options
   */
  public updateOptions(options: Partial<CompilerOptions>): void {
    this.options = { ...this.options, ...options };
    this.errorReporter = new ErrorReporter(this.options);
  }

  /**
   * Get current compiler options
   */
  public getOptions(): CompilerOptions {
    return { ...this.options };
  }

  // Private helper methods
  // Note: legacy async readFile helper removed as compileFile uses sync read for stability in tests

  private hasCriticalErrors(errors: CompilerError[]): boolean {
    // Only consider truly critical errors that prevent any meaningful parsing
    return errors.some(error => 
      error.severity === ErrorSeverity.ERROR && 
      this.isCriticalErrorCode(error.code)
    );
  }

  private isCriticalErrorCode(code: string): boolean {
    // Only truly blocking errors - remove syntax parsing errors to allow recovery
    const criticalCodes = ['1001', '1002']; // Only lexical errors: Invalid character, unterminated string
    return criticalCodes.includes(code);
  }

  private createFailureResult(
    errors: CompilerError[],
    startTime: number,
    filePath: string,
    ast?: ASTNode
  ): CompileResult {
    const errorList = errors.filter(error => error.severity === ErrorSeverity.ERROR);
    const warningList = errors.filter(error => error.severity === ErrorSeverity.WARNING);
    
    const result: CompileResult = {
      success: false,
      errors: errorList,
      warnings: warningList,
      executionTime: Date.now() - startTime,
      filePath
    };
    
    if (ast) {
      result.ast = ast;
    }
    
    return result;
  }
}
