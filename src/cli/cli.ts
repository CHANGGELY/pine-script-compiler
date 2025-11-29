import { Command } from 'commander';
import { PineScriptCompiler } from '../compiler';
import { CompilerOptions } from '../types';
import chalk from 'chalk';
import * as fs from 'fs';
import * as glob from 'glob';

/**
 * Pine Script Compiler CLI
 * Command-line interface for the Pine Script compiler
 */
export class CLI {
  private program: Command;
  private compiler: PineScriptCompiler;

  constructor() {
    this.program = new Command();
    this.compiler = new PineScriptCompiler();
    this.setupCommands();
  }

  /**
   * Run the CLI with provided arguments
   */
  public async run(argv: string[]): Promise<void> {
    const userArgs = argv.slice(2);

    if (userArgs.length === 0 || userArgs.includes('--help') || userArgs.includes('-h')) {
      console.log(this.program.helpInformation());
      return;
    }

    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      console.error(chalk.red('CLI Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  /**
   * Setup CLI commands and options
   */
  private setupCommands(): void {
    this.program
      .name('pine-compiler')
      .description('Pine Script Compiler - Validate and analyze Pine Script code')
      .version(this.compiler.getVersion());

    // Main compile command
    this.program
      .argument('<files...>', 'Pine Script files to compile (supports glob patterns)')
      .option('-f, --format <format>', 'Output format (json|table|minimal)', 'table')
      .option('-s, --strict', 'Enable strict mode', false)
      .option('-w, --no-warnings', 'Hide warnings', false)
      .option('-m, --max-errors <number>', 'Maximum number of errors to display', '50')
      .option('-v, --pine-version <version>', 'Pine Script version (v4|v5|v6)', 'v6')
      .option('-o, --output <file>', 'Output file for results')
      .option('--config <file>', 'Load compiler options from config file')
      .option('--watch', 'Watch files for changes', false)
      .option('--syntax-only', 'Only check syntax (faster)', false)
      .action(async (files: string[], options: any) => {
        await this.handleCompileCommand(files, options);
      });

    // Check command (syntax only)
    this.program
      .command('check')
      .description('Quick syntax check (no semantic analysis)')
      .argument('<files...>', 'Pine Script files to check')
      .option('-f, --format <format>', 'Output format (json|table|minimal)', 'minimal')
      .option('--config <file>', 'Load compiler options from config file')
      .action(async (files: string[], options: any) => {
        await this.handleCheckCommand(files, options);
      });

    // Info command
    this.program
      .command('info')
      .description('Show compiler information')
      .action(() => {
        this.handleInfoCommand();
      });

    // Version command
    this.program
      .command('version')
      .description('Show version information')
      .action(() => {
        console.log(this.compiler.getVersion());
      });

    // Init command
    this.program
      .command('init')
      .description('Initialize default pine-compiler.config.json')
      .option('-o, --output <file>', 'Output path', 'pine-compiler.config.json')
      .action((opts: any) => {
        const config = {
          version: '1.0.0',
          rules: {
            strictSyntax: true,
            requireDocstrings: false,
            maxLineLength: 120,
            allowDeprecatedFunctions: false
          },
          output: {
            format: 'table',
            includeWarnings: true,
            colorOutput: true,
            maxErrors: 50
          },
          parser: {
            version: 'v6',
            strictMode: true,
            allowExperimentalFeatures: false
          }
        };
        fs.writeFileSync(opts.output, JSON.stringify(config, null, 2));
        console.log(chalk.blue(`Config written to ${opts.output}`));
      });
  }

  /**
   * Handle compile command
   */
  private async handleCompileCommand(filePatterns: string[], options: any): Promise<void> {
    const files = this.expandFilePatterns(filePatterns);
    
    if (files.length === 0) {
      console.error(chalk.red('No files found matching the specified patterns.'));
      process.exit(1);
    }

    // Update compiler options
    let compilerOptions: Partial<CompilerOptions> = {};
    if (options.config) {
      try {
        const raw = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        const { parseCompilerConfig } = require('./config');
        compilerOptions = { ...parseCompilerConfig(raw) };
      } catch (e) {
        console.warn(chalk.yellow(`Warning: Could not read config '${options.config}': ${e instanceof Error ? e.message : 'Unknown error'}`));
      }
    }
    compilerOptions = {
      ...compilerOptions,
      outputFormat: options.format ?? compilerOptions.outputFormat,
      strictMode: typeof options.strict === 'boolean' ? options.strict : (compilerOptions.strictMode ?? false),
      includeWarnings: typeof options.warnings === 'boolean' ? options.warnings : (compilerOptions.includeWarnings ?? true),
      maxErrors: options.maxErrors ? parseInt(options.maxErrors) : (compilerOptions.maxErrors ?? 50),
      pineVersion: options.pineVersion ?? compilerOptions.pineVersion
    };
    
    this.compiler.updateOptions(compilerOptions);

    let totalErrors = 0;
    let totalWarnings = 0;
    const results: string[] = [];

    // Process files
    for (const file of files) {
      try {
        if (options.syntaxOnly) {
          const source = fs.readFileSync(file, 'utf8');
          const syntaxResult = this.compiler.validateSyntax(source);
          
          if (!syntaxResult.valid) {
            totalErrors += syntaxResult.errors.length;
            const mockResult = {
              success: false,
              errors: syntaxResult.errors,
              warnings: [],
              executionTime: 0,
              filePath: file
            };
            results.push(this.compiler.formatResults(mockResult));
          } else {
            results.push(chalk.green(`✓ ${file} - Syntax OK`));
          }
        } else {
          const result = await this.compiler.compileFile(file);
          const stats = this.compiler.getErrorStats(result);
          
          totalErrors += stats.errors;
          totalWarnings += stats.warnings;

          const readError = result.errors.find(err => err.message.startsWith('Failed to read file'));
          if (!result.success && readError) {
            const detail = readError.message.replace(/^Failed to read file:\s*/, '');
            results.push(chalk.red(`Error reading ${file}: ${detail}`));
            continue;
          }
          
          results.push(this.compiler.formatResults(result));
        }
      } catch (error) {
        console.error(chalk.red(`Error processing ${file}:`), error instanceof Error ? error.message : 'Unknown error');
        totalErrors++;
      }
    }

    // Output results
    const output = results.join('\n');
    
    if (options.output) {
      fs.writeFileSync(options.output, output);
      console.log(chalk.blue(`Results written to ${options.output}`));
    } else {
      console.log(output);
    }

    // Summary
    this.printSummary(files.length, totalErrors, totalWarnings);

    // Watch mode
    if (options.watch) {
      console.log(chalk.blue('\nWatching for file changes... (Press Ctrl+C to exit)'));
      this.watchFiles(files, options);
    } else {
      // Exit with error code if there are errors
      if (totalErrors > 0) {
        process.exit(1);
      }
    }
  }

  /**
   * Handle check command (syntax only)
   */
  private async handleCheckCommand(filePatterns: string[], options: any): Promise<void> {
    const files = this.expandFilePatterns(filePatterns);
    
    if (files.length === 0) {
      console.error(chalk.red('No files found matching the specified patterns.'));
      process.exit(1);
    }

    let totalErrors = 0;
    let loadedFormat: string | undefined;
    if (options.config) {
      try {
        const raw = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        const { parseCompilerConfig } = require('./config');
        const cfg = parseCompilerConfig(raw);
        if (cfg.outputFormat) loadedFormat = cfg.outputFormat;
      } catch (e) {
        console.warn(chalk.yellow(`Warning: Could not read config '${options.config}': ${e instanceof Error ? e.message : 'Unknown error'}`));
      }
    }
    
    for (const file of files) {
      try {
        const source = fs.readFileSync(file, 'utf8');
        const result = this.compiler.validateSyntax(source);
        
        if (result.valid) {
          const fmt = options.format ?? loadedFormat ?? 'minimal';
          if (fmt !== 'minimal') {
            console.log(chalk.green(`✓ ${file}`));
          }
        } else {
          totalErrors += result.errors.length;
          const fmt = options.format ?? loadedFormat ?? 'minimal';
          if (fmt === 'json') {
            console.log(JSON.stringify({
              file,
              valid: false,
              errors: result.errors
            }, null, 2));
          } else {
            console.log(chalk.red(`✖ ${file}`));
            result.errors.forEach(error => {
              console.log(chalk.gray(`  Line ${error.location.line}: ${error.message}`));
            });
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error reading ${file}:`), error instanceof Error ? error.message : 'Unknown error');
        totalErrors++;
      }
    }

    if (options.format === 'minimal' && totalErrors === 0) {
      console.log(chalk.green(`✓ All ${files.length} files passed syntax check`));
    }

    if (totalErrors > 0) {
      console.log(chalk.red(`\nFound ${totalErrors} syntax error${totalErrors > 1 ? 's' : ''} in ${files.length} file${files.length > 1 ? 's' : ''}`));
      process.exit(1);
    }
  }

  /**
   * Handle info command
   */
  private handleInfoCommand(): void {
    console.log(chalk.bold('Pine Script Compiler Information'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Version: ${chalk.green(this.compiler.getVersion())}`);
    console.log(`Supported Pine versions: ${chalk.blue(this.compiler.getSupportedVersions().join(', '))}`);
    console.log(`Current options:`);
    
    const options = this.compiler.getOptions();
    Object.entries(options).forEach(([key, value]) => {
      console.log(`  ${key}: ${chalk.yellow(String(value))}`);
    });
    
    console.log('\nFeatures:');
    console.log('  • Lexical analysis with detailed error reporting');
    console.log('  • Syntax parsing with AST generation');
    console.log('  • Semantic analysis with type checking');
    console.log('  • Pine Script specific validations');
    console.log('  • Multiple output formats (JSON, table, minimal)');
    console.log('  • File watching for development');
    console.log('  • Glob pattern support for batch processing');
  }

  /**
   * Expand file patterns using glob
   */
  private expandFilePatterns(patterns: string[]): string[] {
    const files: string[] = [];
    
    for (const pattern of patterns) {
      try {
        if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
          // Direct file path
          files.push(pattern);
        } else {
          // Glob pattern
          const matches = glob.sync(pattern, { 
            ignore: ['node_modules/**', '.git/**'],
            absolute: true
          });
          files.push(...matches.filter(file => 
            file.endsWith('.pine') || 
            file.endsWith('.pinescript') ||
            file.endsWith('.psc')
          ));
        }
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Could not process pattern '${pattern}': ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
    
    // Remove duplicates and sort
    return [...new Set(files)].sort();
  }

  /**
   * Watch files for changes
   */
  private watchFiles(files: string[], options: any): void {
    const chokidar = require('chokidar');
    
    const watcher = chokidar.watch(files, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });
    
    watcher.on('change', async (filePath: string) => {
      console.log(chalk.blue(`\n📁 File changed: ${filePath}`));
      
      try {
        if (options.syntaxOnly) {
          const source = fs.readFileSync(filePath, 'utf8');
          const result = this.compiler.validateSyntax(source);
          
          if (result.valid) {
            console.log(chalk.green(`✓ ${filePath} - Syntax OK`));
          } else {
            console.log(chalk.red(`✖ ${filePath} - ${result.errors.length} syntax error${result.errors.length > 1 ? 's' : ''}:`));
            result.errors.forEach(error => {
              console.log(chalk.gray(`  Line ${error.location.line}: ${error.message}`));
            });
          }
        } else {
          const result = await this.compiler.compileFile(filePath);
          console.log(this.compiler.formatResults(result));
        }
      } catch (error) {
        console.error(chalk.red(`Error processing ${filePath}:`), error instanceof Error ? error.message : 'Unknown error');
      }
    });
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log(chalk.blue('\n👋 Stopping file watcher...'));
      watcher.close();
      process.exit(0);
    });
  }

  /**
   * Print compilation summary
   */
  private printSummary(fileCount: number, errorCount: number, warningCount: number): void {
    console.log(chalk.gray('\n' + '─'.repeat(50)));
    
    const parts: string[] = [];
    parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''} processed`);
    
    if (errorCount > 0) {
      parts.push(chalk.red(`${errorCount} error${errorCount > 1 ? 's' : ''}`));
    }
    
    if (warningCount > 0) {
      parts.push(chalk.yellow(`${warningCount} warning${warningCount > 1 ? 's' : ''}`));
    }
    
    if (errorCount === 0 && warningCount === 0) {
      console.log(chalk.green(`✓ ${parts[0]} successfully`));
    } else {
      console.log(`📊 Summary: ${parts.join(', ')}`);
    }
  }
}
