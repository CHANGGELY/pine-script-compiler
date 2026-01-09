import { CompilerError, ErrorSeverity, CompilerOptions, ErrorCodes } from '../types';
import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Error Reporter
 * Formats and displays compilation errors with helpful suggestions
 */
export class ErrorReporter {
  private options: CompilerOptions;
  private errorSuggestions: Map<string, string>;

  constructor(options: CompilerOptions) {
    this.options = {
      strictMode: options.strictMode ?? false,
      outputFormat: options.outputFormat ?? 'json',
      includeWarnings: options.includeWarnings ?? true,
      maxErrors: options.maxErrors ?? 0,
      pineVersion: options.pineVersion ?? 'v6'
    };
    this.errorSuggestions = this.initializeErrorSuggestions();
  }

  /**
   * Update output format at runtime
   */
  public setOutputFormat(format: CompilerOptions['outputFormat']): void {
    this.options.outputFormat = format;
  }

  /**
   * Format and display errors
   */
  public reportErrors(errors: CompilerError[], filePath: string): string {
    if (errors.length === 0) {
      return this.formatSuccess(filePath);
    }

    const filteredErrors = this.filterErrors(errors);
    
    switch (this.options.outputFormat) {
      case 'json':
        return this.formatAsJson(filteredErrors, filePath);
      case 'table':
        return this.formatAsTable(filteredErrors, filePath);
      case 'minimal':
        return this.formatAsMinimal(filteredErrors, filePath);
      case 'detailed':
        return this.formatAsDetailed(filteredErrors, filePath);
      default:
        return this.formatAsDetailed(filteredErrors, filePath);
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats(errors: CompilerError[]): { total: number; errors: number; warnings: number; info: number } {
    const stats = { total: errors.length, errors: 0, warnings: 0, info: 0 };
    
    for (const error of errors) {
      switch (error.severity) {
        case ErrorSeverity.ERROR:
          stats.errors++;
          break;
        case ErrorSeverity.WARNING:
          stats.warnings++;
          break;
        case ErrorSeverity.INFO:
          stats.info++;
          break;
      }
    }
    
    return stats;
  }

  /**
   * Filter errors based on options
   */
  private filterErrors(errors: CompilerError[]): CompilerError[] {
    let filtered = errors;
    
    // Filter by severity
    if (!this.options.includeWarnings) {
      filtered = filtered.filter(error => error.severity === ErrorSeverity.ERROR);
    }
    
    // Limit number of errors
    if (this.options.maxErrors > 0) {
      filtered = filtered.slice(0, this.options.maxErrors);
    }
    
    return filtered;
  }

  /**
   * Format success message
   */
  private formatSuccess(filePath: string): string {
    return chalk.green(`✓ ${filePath} compiled successfully with no errors.\n`);
  }

  /**
   * Format errors as detailed output
   */
  private formatAsDetailed(errors: CompilerError[], filePath: string): string {
    const lines: string[] = [];
    
    lines.push(chalk.bold('\nError Report'));
    lines.push(chalk.bold(`Compilation results for ${filePath}:`));
    lines.push(chalk.gray('─'.repeat(60)));
    
    for (let i = 0; i < errors.length; i++) {
      const error = errors[i];
      if (error) {
        lines.push(this.formatDetailedError(error, i + 1));
        
        if (i < errors.length - 1) {
          lines.push(''); // Empty line between errors
        }
      }
    }
    
    lines.push(chalk.gray('─'.repeat(60)));
    lines.push(this.formatSummary(errors));
    
    return lines.join('\n') + '\n';
  }

  /**
   * Format single error in detailed format
   */
  private formatDetailedError(error: CompilerError, index: number): string {
    const lines: string[] = [];
    
    // Error header
    const severityColor = this.getSeverityColor(error.severity);
    const severityIcon = this.getSeverityIcon(error.severity);
    const errorType = error.type.toUpperCase();
    
    lines.push(
      `${severityColor(`${severityIcon} ${error.severity.toUpperCase()} ${index}`)} ` +
      `${chalk.gray(`[${errorType}:${error.code}]`)} ` +
      `${chalk.bold(error.message)}`
    );
    
    // Location
    lines.push(
      chalk.gray(`   at Line ${error.location.line}, Column ${error.location.column}`)
    );
    
    // Source code context
    if (error.location.source) {
      const context = this.getSourceContext(error);
      if (context) {
        lines.push('');
        lines.push(context);
      }
    }
    
    // Suggestion
    if (error.suggestion || this.errorSuggestions.has(error.code)) {
      const suggestion = (error.suggestion || this.errorSuggestions.get(error.code) || '').trim();
      if (suggestion.length > 0) {
        lines.push('');
        lines.push(chalk.blue('💡 Suggestions:'));
        suggestion.split('\n').forEach(item => {
          const trimmed = item.trim();
          if (trimmed.length > 0) {
            lines.push(chalk.blue(`   • ${trimmed}`));
          }
        });
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Format errors as JSON
   */
  private formatAsJson(errors: CompilerError[], filePath: string): string {
    const stats = this.getErrorStats(errors);
    const result = {
      file: filePath,
      timestamp: new Date().toISOString(),
      summary: {
        total: stats.total,
        errors: stats.errors,
        warnings: stats.warnings,
        info: stats.info
      },
      errors: errors.map(error => ({
        type: error.type,
        severity: error.severity,
        code: error.code,
        message: error.message,
        location: {
          line: error.location.line,
          column: error.location.column,
          length: error.location.length
        },
        suggestion: error.suggestion || this.errorSuggestions.get(error.code)
      }))
    };
    
    return JSON.stringify(result, null, 2);
  }

  /**
   * Format errors as table
   */
  private formatAsTable(errors: CompilerError[], filePath: string): string {
    const lines: string[] = [];
    
    lines.push(chalk.bold(`\nCompilation results for ${filePath}:`));
    
    if (errors.length === 0) {
      lines.push(chalk.green('✓ No errors found'));
      return lines.join('\n') + '\n';
    }
    
    const table = new Table({
      head: ['#', 'Type', 'Severity', 'Line', 'Column', 'Message'],
      colWidths: [4, 10, 10, 6, 8, 50],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    });
    
    errors.forEach((error, index) => {
      const severityColor = this.getSeverityColor(error.severity);
      table.push([
        (index + 1).toString(),
        error.type.toUpperCase(),
        severityColor(error.severity.toUpperCase()),
        error.location.line.toString(),
        error.location.column.toString(),
        this.truncateMessage(error.message, 45)
      ]);
    });
    
    lines.push(table.toString());
    lines.push(this.formatSummary(errors));
    
    return lines.join('\n') + '\n';
  }

  /**
   * Format errors as minimal output
   */
  private formatAsMinimal(errors: CompilerError[], filePath: string): string {
    if (errors.length === 0) {
      return chalk.green(`✓ ${filePath}\n`);
    }
    
    const lines: string[] = [];
    
    for (const error of errors) {
      const severityIcon = this.getSeverityIcon(error.severity);
      const location = `${error.location.line}:${error.location.column}`;
      
      lines.push(
        `${filePath}:${location} ${severityIcon} ${error.message}`
      );
    }
    
    return lines.join('\n') + '\n';
  }

  /**
   * Get source code context around error
   */
  private getSourceContext(error: CompilerError): string | null {
    if (!error.location.source) return null;
    
    const lines = error.location.source.split('\n');
    const errorLine = error.location.line - 1;
    
    if (errorLine < 0 || errorLine >= lines.length) return null;
    
    const contextLines: string[] = [];
    const start = Math.max(0, errorLine - 1);
    const end = Math.min(lines.length, errorLine + 2);
    
    for (let i = start; i < end; i++) {
      const lineNum = i + 1;
      const isErrorLine = i === errorLine;
      const linePrefix = `${lineNum.toString().padStart(4)} | `;
      
      if (isErrorLine) {
        contextLines.push(linePrefix + lines[i]);

        const pointer = ' '.repeat(linePrefix.length + error.location.column - 1) +
                        '^'.repeat(Math.max(1, error.location.length));
        contextLines.push(pointer);
      } else {
        contextLines.push(linePrefix + lines[i]);
      }
    }
    
    return contextLines.join('\n');
  }

  /**
   * Format summary
   */
  private formatSummary(errors: CompilerError[]): string {
    const stats = this.getErrorStats(errors);
    const parts: string[] = [];
    
    if (stats.errors > 0) {
      parts.push(chalk.red(`${stats.errors} error${stats.errors > 1 ? 's' : ''}`));
    }
    
    if (stats.warnings > 0) {
      parts.push(chalk.yellow(`${stats.warnings} warning${stats.warnings > 1 ? 's' : ''}`));
    }
    
    if (stats.info > 0) {
      parts.push(chalk.blue(`${stats.info} info`));
    }
    
    if (parts.length === 0) {
      return chalk.green('✓ No issues found');
    }
    
    return `Found ${parts.join(', ')}`;
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: ErrorSeverity): typeof chalk.red {
    switch (severity) {
      case ErrorSeverity.ERROR:
        return chalk.red;
      case ErrorSeverity.WARNING:
        return chalk.yellow;
      case ErrorSeverity.INFO:
        return chalk.blue;
      default:
        return chalk.gray;
    }
  }

  /**
   * Get icon for severity level
   */
  private getSeverityIcon(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.ERROR:
        return '✖';
      case ErrorSeverity.WARNING:
        return '⚠';
      case ErrorSeverity.INFO:
        return 'ℹ';
      default:
        return '•';
    }
  }

  /**
   * Truncate message for table display
   */
  private truncateMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength - 3) + '...';
  }

  /**
   * Initialize error suggestions
   */
  private initializeErrorSuggestions(): Map<string, string> {
    const suggestions = new Map<string, string>();
    
    // Lexical errors
    suggestions.set(ErrorCodes.INVALID_CHARACTER.toString(), 'Check for unsupported characters or encoding issues');
    suggestions.set(ErrorCodes.UNTERMINATED_STRING.toString(), 'Add closing quote to string literal');
    suggestions.set(ErrorCodes.INVALID_NUMBER_FORMAT.toString(), 'Check number format (e.g., 1.23, 1e5)');
    
    // Syntax errors
    suggestions.set(ErrorCodes.UNEXPECTED_TOKEN.toString(), 'Add a value after the + operator');
    suggestions.set(ErrorCodes.MISSING_SEMICOLON.toString(), 'Add semicolon at end of statement');
    suggestions.set(ErrorCodes.UNMATCHED_PARENTHESES.toString(), 'Check for matching opening and closing parentheses');
    suggestions.set(ErrorCodes.INVALID_FUNCTION_DECLARATION.toString(), 'Check function declaration syntax');
    suggestions.set(ErrorCodes.MISSING_STRATEGY_DECLARATION.toString(), 'Add strategy() or indicator() declaration at the beginning');
    
    // Semantic errors
    suggestions.set(ErrorCodes.UNDEFINED_VARIABLE.toString(), 'Declare the variable before using it');
    suggestions.set(ErrorCodes.TYPE_MISMATCH.toString(), 'Convert string to number\nUse string concatenation');
    suggestions.set(ErrorCodes.INVALID_FUNCTION_CALL.toString(), 'Check function name and parameters');
    suggestions.set(ErrorCodes.PLOT_IN_LOOP.toString(), 'Move plot() call outside of loop structures');
    suggestions.set(ErrorCodes.TUPLE_ASSIGNMENT_ERROR.toString(), 'Use "=" instead of ":=" for tuple assignments');
    suggestions.set(ErrorCodes.VARIABLE_REDECLARATION.toString(), 'Use a different variable name or remove duplicate declaration');
    suggestions.set(ErrorCodes.INVALID_SCOPE_ACCESS.toString(), 'Check variable scope and accessibility');
    suggestions.set(ErrorCodes.MISSING_RETURN_TYPE.toString(), 'Specify return type for function');
    // Reserved for future typed suggestions strictly aligned with ErrorCodes
    
    return suggestions;
  }

  /**
   * Generate fix suggestions for common errors
   */
  public generateFixSuggestion(error: CompilerError): string | null {
    const directSuggestion = this.errorSuggestions.get(error.code);
    if (directSuggestion) {
      return directSuggestion;
    }

    const code = parseInt(error.code, 10);
    
    switch (code) {
      case ErrorCodes.TUPLE_ASSIGNMENT_ERROR:
        return 'Replace ":=" with "=" for tuple assignments';
        
      case ErrorCodes.MISSING_STRATEGY_DECLARATION:
        return 'Add "strategy(\"My Strategy\", overlay=true)" at the beginning of your script';
        
      case ErrorCodes.PLOT_IN_LOOP:
        return 'Move the plot() call outside the loop and use a variable to store the value';
        
      case ErrorCodes.UNDEFINED_VARIABLE:
        if (error.message.includes("'")) {
          const varName = error.message.match(/'([^']+)'/)?.[1];
          if (varName) {
            return `Add "var ${varName} = <initial_value>" before using it`;
          }
        }
        break;
        
      case ErrorCodes.TYPE_MISMATCH:
        if (error.message.includes('boolean')) {
          return 'Use comparison operators (==, !=, <, >, etc.) to create boolean expressions';
        }
        break;
    }
    
    return null;
  }
}
