import { ASTNode, NodeType, CompilerError, ErrorType, ErrorSeverity, SemanticResult, Symbol, SymbolTable, PineType, ErrorCodes, BuiltinFunction, Parameter } from '../types';

/**
 * Pine Script Semantic Analyzer
 * Performs type checking, scope validation, and Pine Script specific semantic analysis
 */
export class SemanticAnalyzer {
  private symbolTable: SymbolTable;
  private errors: CompilerError[] = [];
  private currentScope: string = 'global';
  private scopeStack: string[] = ['global'];
  private scopeCounter: number = 0;
  private inLoop: boolean = false;
  private hasStrategyOrIndicator: boolean = false;
  private plotCount: number = 0;
  private builtinFunctions: Map<string, BuiltinFunction>;

  constructor() {
    this.symbolTable = {
      symbols: new Map(),
      scopes: new Map(),
      currentScope: 'global'
    };
    this.scopeStack = ['global'];
    this.symbolTable.scopes.set('global', new Set());
    this.builtinFunctions = this.initializeBuiltinFunctions();
    this.initializeBuiltinVariables();
  }

  /**
   * Analyze AST for semantic errors
   */
  public analyze(ast: ASTNode): SemanticResult {
    this.reset();
    
    try {
      this.visitNode(ast);
      this.validatePineScriptRules();
    } catch (error) {
      // Error already added to errors array
    }
    
    return {
      symbolTable: this.symbolTable,
      errors: this.errors
    };
  }

  private reset(): void {
    this.symbolTable = {
      symbols: new Map(),
      scopes: new Map(),
      currentScope: 'global'
    };
    this.scopeStack = ['global'];
    this.errors = [];
    this.currentScope = 'global';
    this.symbolTable.currentScope = 'global';
    this.symbolTable.scopes.set('global', new Set());
    this.scopeCounter = 0;
    this.inLoop = false;
    this.hasStrategyOrIndicator = false;
    this.plotCount = 0;
    this.initializeBuiltinVariables();
  }

  /**
   * Visit AST node and perform semantic analysis
   */
  private visitNode(node: ASTNode): PineType {
    switch (node.type) {
      case NodeType.PROGRAM:
        return this.visitProgram(node);
      case NodeType.STRATEGY_DECLARATION:
        return this.visitStrategyDeclaration(node);
      case NodeType.INDICATOR_DECLARATION:
        return this.visitIndicatorDeclaration(node);
      case NodeType.VARIABLE_DECLARATION:
        return this.visitVariableDeclaration(node);
      case NodeType.FUNCTION_DECLARATION:
        return this.visitFunctionDeclaration(node);
      case NodeType.FUNCTION_CALL:
        return this.visitFunctionCall(node);
      case NodeType.CALL_EXPRESSION:
        // Ensure new AST node type for function calls is handled
        return this.visitFunctionCall(node);
      case NodeType.PLOT_STATEMENT:
        return this.visitPlotStatement(node);
      case NodeType.IF_STATEMENT:
        return this.visitIfStatement(node);
      case NodeType.FOR_STATEMENT:
        return this.visitForStatement(node);
      case NodeType.WHILE_STATEMENT:
        return this.visitWhileStatement(node);
      case NodeType.ASSIGNMENT:
        return this.visitAssignment(node);
      case NodeType.BINARY_EXPRESSION:
        return this.visitBinaryExpression(node);
      case NodeType.UNARY_EXPRESSION:
        return this.visitUnaryExpression(node);
      case NodeType.CONDITIONAL_EXPRESSION:
        return this.visitConditionalExpression(node);
  
      case NodeType.IDENTIFIER:
        return this.visitIdentifier(node);
      case NodeType.LITERAL:
        return this.visitLiteral(node);
      case NodeType.ARRAY_ACCESS:
        return this.visitArrayAccess(node);
      case NodeType.MEMBER_ACCESS:
        return this.visitMemberAccess(node);
      case NodeType.BLOCK:
        return this.visitBlock(node);
      default:
        return PineType.VOID;
    }
  }

  private visitProgram(node: ASTNode): PineType {
    this.enterScope('global');
    
    for (const child of node.children) {
      this.visitNode(child);
    }
    
    this.exitScope();
    return PineType.VOID;
  }

  private visitStrategyDeclaration(node: ASTNode): PineType {
    if (this.hasStrategyOrIndicator) {
      this.addError(node, ErrorCodes.INVALID_FUNCTION_DECLARATION, 'Only one strategy() or indicator() declaration is allowed per script');
    }
    
    this.hasStrategyOrIndicator = true;
    
    // Validate strategy parameters
    for (const param of node.children) {
      this.visitNode(param);
    }
    
    return PineType.VOID;
  }

  private visitIndicatorDeclaration(node: ASTNode): PineType {
    if (this.hasStrategyOrIndicator) {
      this.addError(node, ErrorCodes.INVALID_FUNCTION_DECLARATION, 'Only one strategy() or indicator() declaration is allowed per script');
    }
    
    this.hasStrategyOrIndicator = true;
    
    // Validate indicator parameters
    for (const param of node.children) {
      this.visitNode(param);
    }
    
    return PineType.VOID;
  }

  private visitVariableDeclaration(node: ASTNode): PineType {
    const identifier = node.children[0];
    const initializer = node.children[1];
    
    if (!identifier) {
      return PineType.VOID;
    }
    
    const varName = identifier.value as string;
    
    // Check for redeclaration
    if (this.isSymbolInCurrentScope(varName)) {
      this.addError(node, ErrorCodes.VARIABLE_REDECLARATION, `Variable '${varName}' is already declared in this scope`);
    }
    
    let varType = PineType.NA;
    if (initializer) {
      varType = this.visitNode(initializer);
    }
    
    // Add to symbol table
    this.addSymbol(varName, varType, node.location, false);
    
    return PineType.VOID;
  }

  private visitFunctionDeclaration(node: ASTNode): PineType {
    const nameNode = node.children[0];
    const bodyIndex = Math.max(1, node.children.length - 1);
    const bodyNode = node.children[bodyIndex];
    const paramNodes = node.children.slice(1, bodyIndex);

    const functionName = (nameNode?.value as string) ?? '';

    if (!functionName) {
      this.addError(node, ErrorCodes.INVALID_FUNCTION_DECLARATION, 'Function declaration must have a name');
      return PineType.VOID;
    }

    if (this.isSymbolInCurrentScope(functionName)) {
      this.addError(node, ErrorCodes.VARIABLE_REDECLARATION, `Function '${functionName}' is already declared`);
    }

    const seenParamNames = new Set<string>();
    const parameterMetadata: Parameter[] = [];
    for (const paramNode of paramNodes) {
      if (paramNode?.type === NodeType.IDENTIFIER && typeof paramNode.value === 'string') {
        const paramName = paramNode.value as string;
        if (!seenParamNames.has(paramName)) {
          parameterMetadata.push({ name: paramName, type: 'na', optional: false });
          seenParamNames.add(paramName);
        }
      }
    }

    this.addSymbol(functionName, PineType.VOID, nameNode?.location ?? node.location, true, parameterMetadata);

    this.enterScope(`function_${functionName}`);

    // Register parameters in the new scope
    seenParamNames.clear();
    for (const paramNode of paramNodes) {
      if (!paramNode || paramNode.type !== NodeType.IDENTIFIER || typeof paramNode.value !== 'string') {
        this.addError(paramNode ?? node, ErrorCodes.INVALID_FUNCTION_DECLARATION, 'Invalid function parameter');
        continue;
      }

      const paramName = paramNode.value as string;
      if (seenParamNames.has(paramName)) {
        this.addError(paramNode, ErrorCodes.VARIABLE_REDECLARATION, `Parameter '${paramName}' is already declared`);
        continue;
      }

      seenParamNames.add(paramName);
      this.addSymbol(paramName, PineType.NA, paramNode.location, false);
    }

    if (bodyNode) {
      this.visitNode(bodyNode);
    }

    this.exitScope();

    return PineType.VOID;
  }

  private visitFunctionCall(node: ASTNode): PineType {
    const callee = node.children[0];
    const args = node.children.slice(1);
    
    if (!callee) {
      return PineType.VOID;
    }
    
    let functionName: string;
    if (callee.type === NodeType.IDENTIFIER) {
      functionName = callee.value as string;
    } else if (callee.type === NodeType.MEMBER_EXPRESSION) {
      // Handle complex function calls like ta.sma, strategy.entry
      const object = callee.children[0];
      const property = callee.children[1];
      if (object && property && object.type === NodeType.IDENTIFIER && property.type === NodeType.IDENTIFIER) {
        functionName = `${object.value}.${property.value}`;
      } else {
        this.visitNode(callee);
        return PineType.VOID;
      }
    } else {
      // Complex function call (e.g., nested calls)
      this.visitNode(callee);
      return PineType.VOID;
    }
    
    // Check if function exists
    const builtinFunction = this.builtinFunctions.get(functionName);
    const userFunction = this.getSymbol(functionName);
    
    if (!builtinFunction && !userFunction) {
      this.addError(node, ErrorCodes.UNDEFINED_VARIABLE, `Undefined function '${functionName}'`);
      return PineType.VOID;
    }
    
    // Validate arguments
    for (const arg of args) {
      this.visitNode(arg);
    }
    
    // Return function return type
    if (builtinFunction) {
      return builtinFunction.returnType;
    }
    
    return PineType.VOID;
  }

  private visitPlotStatement(node: ASTNode): PineType {
    if (this.inLoop) {
      this.addError(node, ErrorCodes.PLOT_IN_LOOP, 'plot() calls are not allowed inside loops');
    }
    
    this.plotCount++;
    
    // Plot statements now contain a CALL_EXPRESSION child
    // which has the actual plot call and arguments
    const callNode = node.children[0];
    if (callNode && callNode.type === NodeType.CALL_EXPRESSION) {
      return this.visitFunctionCall(callNode);
    }
    
    // Fallback for legacy format: directly validate children
    for (const arg of node.children) {
      const argType = this.visitNode(arg);
      // First argument should be a series or numeric value
      if (node.children.indexOf(arg) === 0) {
        if (!this.isNumericType(argType) && !this.isSeriesType(argType)) {
          this.addError(arg, ErrorCodes.TYPE_MISMATCH, 'plot() first argument must be a numeric or series value');
        }
      }
    }
    
    return PineType.VOID;
  }

  private visitIfStatement(node: ASTNode): PineType {
    const condition = node.children[0];
    const thenBranch = node.children[1];
    const elseBranch = node.children[2];
    
    if (!condition || !thenBranch) {
      return PineType.VOID;
    }
    
    // Validate condition
    const conditionType = this.visitNode(condition);
    if (!this.isBooleanType(conditionType)) {
      this.addError(condition, ErrorCodes.TYPE_MISMATCH, 'if condition must be a boolean expression');
    }
    
    // Visit branches
    this.visitNode(thenBranch);
    if (elseBranch) {
      this.visitNode(elseBranch);
    }
    
    return PineType.VOID;
  }

  private visitForStatement(node: ASTNode): PineType {
    const variable = node.children[0];
    const start = node.children[1];
    const end = node.children[2];
    const step = node.children.length > 4 ? node.children[3] : null;
    const body = node.children[node.children.length - 1];
    
    if (!variable || !start || !end || !body) {
      return PineType.VOID;
    }
    
    // Enter loop scope
    this.enterScope(`for_${this.scopeCounter++}`);
    const wasInLoop = this.inLoop;
    this.inLoop = true;
    
    // Add loop variable
    const varName = variable.value as string;
    this.addSymbol(varName, PineType.INT, variable.location, false);
    
    // Validate range expressions
    const startType = this.visitNode(start);
    const endType = this.visitNode(end);
    
    if (!this.isNumericType(startType)) {
      this.addError(start, ErrorCodes.TYPE_MISMATCH, 'for loop start value must be numeric');
    }
    
    if (!this.isNumericType(endType)) {
      this.addError(end, ErrorCodes.TYPE_MISMATCH, 'for loop end value must be numeric');
    }
    
    if (step) {
      const stepType = this.visitNode(step);
      if (!this.isNumericType(stepType)) {
        this.addError(step, ErrorCodes.TYPE_MISMATCH, 'for loop step value must be numeric');
      }
    }
    
    // Visit body
    this.visitNode(body);
    
    this.inLoop = wasInLoop;
    this.exitScope();
    
    return PineType.VOID;
  }

  private visitWhileStatement(node: ASTNode): PineType {
    const condition = node.children[0];
    const body = node.children[1];
    
    if (!condition || !body) {
      return PineType.VOID;
    }
    
    // Validate condition
    const conditionType = this.visitNode(condition);
    if (!this.isBooleanType(conditionType)) {
      this.addError(condition, ErrorCodes.TYPE_MISMATCH, 'while condition must be a boolean expression');
    }
    
    // Enter loop scope
    this.enterScope(`while_${this.scopeCounter++}`);
    const wasInLoop = this.inLoop;
    this.inLoop = true;
    
    this.visitNode(body);
    
    this.inLoop = wasInLoop;
    this.exitScope();
    
    return PineType.VOID;
  }

  private visitAssignment(node: ASTNode): PineType {
    const left = node.children[0];
    const right = node.children[1];
    
    if (!left || !right) {
      return PineType.VOID;
    }
    
    const rightType = this.visitNode(right);
    
    if (left.type === NodeType.IDENTIFIER) {
      const varName = left.value as string;
      const symbol = this.getSymbol(varName);
      
      if (!symbol) {
        this.addError(left, ErrorCodes.UNDEFINED_VARIABLE, `Undefined variable '${varName}'`);
      } else {
        // Type compatibility check
        if (!this.areTypesCompatible(symbol.type, this.pineTypeToString(rightType))) {
          this.addError(node, ErrorCodes.TYPE_MISMATCH, `Cannot assign ${this.pineTypeToString(rightType)} to ${symbol.type}`);
        }
      }
    } else {
      this.visitNode(left);
    }
    
    return rightType;
  }

  private visitBinaryExpression(node: ASTNode): PineType {
    const left = node.children[0];
    const right = node.children[1];
    const operator = node.value as string;
    
    if (!left || !right) {
      return PineType.VOID;
    }
    
    const leftType = this.visitNode(left);
    const rightType = this.visitNode(right);
    
    // Type checking based on operator
    switch (operator) {
      case '+': case '-': case '*': case '/': case '%': case '^':
        if (!this.isNumericType(leftType) || !this.isNumericType(rightType)) {
          this.addError(node, ErrorCodes.TYPE_MISMATCH, `Arithmetic operator '${operator}' requires numeric operands`);
        }
        return this.getResultType(leftType, rightType);
        
      case '==': case '!=': case '<': case '<=': case '>': case '>=':
        if (!this.areTypesCompatible(this.pineTypeToString(leftType), this.pineTypeToString(rightType))) {
          this.addError(node, ErrorCodes.TYPE_MISMATCH, `Comparison operator '${operator}' requires compatible operands`);
        }
        return PineType.BOOL;
        
      case 'and': case 'or':
        if (!this.isBooleanType(leftType) || !this.isBooleanType(rightType)) {
          this.addError(node, ErrorCodes.TYPE_MISMATCH, `Logical operator '${operator}' requires boolean operands`);
        }
        return PineType.BOOL;
        
      default:
        return PineType.VOID;
    }
  }

  private visitUnaryExpression(node: ASTNode): PineType {
    const operand = node.children[0];
    const operator = node.value as string;
    
    if (!operand) {
      return PineType.VOID;
    }
    
    const operandType = this.visitNode(operand);
    
    switch (operator) {
      case '-': case '+':
        if (!this.isNumericType(operandType)) {
          this.addError(node, ErrorCodes.TYPE_MISMATCH, `Unary operator '${operator}' requires numeric operand`);
        }
        return operandType;
        
      case 'not':
        if (!this.isBooleanType(operandType)) {
          this.addError(node, ErrorCodes.TYPE_MISMATCH, "Unary operator 'not' requires boolean operand");
        }
        return PineType.BOOL;
        
      default:
        return PineType.VOID;
    }
  }

  private visitConditionalExpression(node: ASTNode): PineType {
    const condition = node.children[0];
    const thenExpr = node.children[1];
    const elseExpr = node.children[2];
    
    if (!condition || !thenExpr || !elseExpr) {
      return PineType.VOID;
    }
    
    const conditionType = this.visitNode(condition);
    const thenType = this.visitNode(thenExpr);
    const elseType = this.visitNode(elseExpr);
    
    if (!this.isBooleanType(conditionType)) {
      this.addError(condition, ErrorCodes.TYPE_MISMATCH, 'Conditional expression condition must be boolean');
    }
    
    if (!this.areTypesCompatible(this.pineTypeToString(thenType), this.pineTypeToString(elseType))) {
      this.addError(node, ErrorCodes.TYPE_MISMATCH, 'Conditional expression branches must have compatible types');
    }
    
    return this.getResultType(thenType, elseType);
  }

  private visitIdentifier(node: ASTNode): PineType {
    const name = node.value as string;
    const symbol = this.getSymbol(name);
    
    if (!symbol) {
      this.addError(node, ErrorCodes.UNDEFINED_VARIABLE, `Undefined variable '${name}'`);
      return PineType.VOID;
    }
    
    return this.stringToPineType(symbol.type);
  }

  private visitLiteral(node: ASTNode): PineType {
    const value = node.value;
    
    if (typeof value === 'number') {
      return Number.isInteger(value) ? PineType.INT : PineType.FLOAT;
    } else if (typeof value === 'boolean') {
      return PineType.BOOL;
    } else if (typeof value === 'string') {
      return PineType.STRING;
    } else if (value === null) {
      return PineType.NA;
    }
    
    return PineType.VOID;
  }

  private visitArrayAccess(node: ASTNode): PineType {
    const array = node.children[0];
    const index = node.children[1];
    
    if (array) {
      this.visitNode(array);
    }
    
    if (index) {
      const indexType = this.visitNode(index);
      if (!this.isNumericType(indexType)) {
        this.addError(index, ErrorCodes.TYPE_MISMATCH, 'Array index must be numeric');
      }
    }
    
    // Return element type (simplified)
    return PineType.FLOAT;
  }

  private visitMemberAccess(node: ASTNode): PineType {
    const object = node.children[0];
    const member = node.children[1];
    
    if (object) {
      this.visitNode(object);
    }
    if (member) {
      this.visitNode(member);
    }
    
    // Return generic type (simplified)
    return PineType.FLOAT;
  }

  private visitBlock(node: ASTNode): PineType {
    for (const child of node.children) {
      this.visitNode(child);
    }
    
    return PineType.VOID;
  }



  // Symbol table management
  private enterScope(scopeName: string): void {
    if (scopeName === 'global') {
      if (this.scopeStack.length === 0) {
        this.scopeStack.push('global');
      }
      this.currentScope = 'global';
      this.symbolTable.currentScope = 'global';
      if (!this.symbolTable.scopes.has('global')) {
        this.symbolTable.scopes.set('global', new Set());
      }
      return;
    }

    const parentScope = this.scopeStack[this.scopeStack.length - 1] ?? 'global';
    const fullScopeName = `${parentScope}/${scopeName}`;
    this.scopeStack.push(fullScopeName);
    this.currentScope = fullScopeName;
    this.symbolTable.currentScope = fullScopeName;
    
    if (!this.symbolTable.scopes.has(fullScopeName)) {
      this.symbolTable.scopes.set(fullScopeName, new Set());
    }
  }

  private exitScope(): void {
    if (this.scopeStack.length > 1) {
      this.scopeStack.pop();
    }
    this.currentScope = this.scopeStack[this.scopeStack.length - 1] ?? 'global';
    this.symbolTable.currentScope = this.currentScope;
  }

  private addSymbol(name: string, type: PineType | string, location: { line: number; column: number; length: number; source: string; }, isFunction: boolean, parameters?: Parameter[]): void {
    const scope = this.scopeStack[this.scopeStack.length - 1] ?? 'global';
    const typeStr = typeof type === 'string' ? type : this.pineTypeToString(type);

    const symbol: Symbol = {
      name,
      type: typeStr,
      location,
      scope,
      isFunction
    };

    if (parameters && parameters.length > 0) {
      symbol.parameters = parameters;
    }

    const key = `${scope}:${name}`;
    this.symbolTable.symbols.set(key, symbol);

    let scopeSymbols = this.symbolTable.scopes.get(scope);
    if (!scopeSymbols) {
      scopeSymbols = new Set<string>();
      this.symbolTable.scopes.set(scope, scopeSymbols);
    }
    scopeSymbols.add(name);
  }

  private getSymbol(name: string): Symbol | undefined {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scope = this.scopeStack[i]!;
      const symbol = this.symbolTable.symbols.get(`${scope}:${name}`);
      if (symbol) {
        return symbol;
      }
    }
    return undefined;
  }

  private isSymbolInCurrentScope(name: string): boolean {
    const scope = this.scopeStack[this.scopeStack.length - 1] ?? 'global';
    return this.symbolTable.symbols.has(`${scope}:${name}`);
  }

  // Type checking utilities
  private isNumericType(type: PineType): boolean {
    return type === PineType.INT || type === PineType.FLOAT || 
           type === PineType.SERIES_INT || type === PineType.SERIES_FLOAT;
  }

  private isBooleanType(type: PineType): boolean {
    return type === PineType.BOOL || type === PineType.SERIES_BOOL;
  }

  private isSeriesType(type: PineType): boolean {
    return type === PineType.SERIES_INT || type === PineType.SERIES_FLOAT ||
           type === PineType.SERIES_BOOL || type === PineType.SERIES_STRING ||
           type === PineType.SERIES_COLOR;
  }

  private areTypesCompatible(type1: string, type2: string): boolean {
    if (type1 === type2) return true;
    
    // Numeric compatibility
    const numericTypes = ['int', 'float', 'series<int>', 'series<float>'];
    if (numericTypes.includes(type1) && numericTypes.includes(type2)) {
      return true;
    }
    
    return false;
  }

  private getResultType(type1: PineType, type2: PineType): PineType {
    if (type1 === type2) return type1;
    
    // Numeric promotion rules
    if (this.isNumericType(type1) && this.isNumericType(type2)) {
      if (type1 === PineType.FLOAT || type2 === PineType.FLOAT) {
        return PineType.FLOAT;
      }
      return PineType.INT;
    }
    
    return PineType.VOID;
  }

  private pineTypeToString(type: PineType): string {
    return type.toString();
  }

  private stringToPineType(type: string): PineType {
    return (PineType as any)[type.toUpperCase().replace('<', '_').replace('>', '')] || PineType.VOID;
  }

  // Pine Script specific validations
  private validatePineScriptRules(): void {
    if (!this.hasStrategyOrIndicator) {
      this.addError(
        { type: NodeType.PROGRAM, children: [], location: { line: 1, column: 1, length: 1, source: '' } },
        ErrorCodes.MISSING_STRATEGY_DECLARATION,
        'Pine Script must contain either strategy() or indicator() declaration'
      );
    }
  }

  // Built-in functions and variables
  private initializeBuiltinFunctions(): Map<string, BuiltinFunction> {
    const functions = new Map<string, BuiltinFunction>();
    
    // Math functions
    functions.set('abs', { name: 'abs', returnType: PineType.FLOAT, parameters: [{ name: 'x', type: 'float', optional: false }], description: 'Absolute value' });
    functions.set('max', { name: 'max', returnType: PineType.FLOAT, parameters: [{ name: 'x', type: 'float', optional: false }, { name: 'y', type: 'float', optional: false }], description: 'Maximum of two values' });
    functions.set('min', { name: 'min', returnType: PineType.FLOAT, parameters: [{ name: 'x', type: 'float', optional: false }, { name: 'y', type: 'float', optional: false }], description: 'Minimum of two values' });
    
    // Technical analysis functions
    functions.set('ta.sma', { name: 'ta.sma', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }], description: 'Simple moving average' });
    functions.set('ta.ema', { name: 'ta.ema', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }], description: 'Exponential moving average' });
    functions.set('ta.rsi', { name: 'ta.rsi', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }], description: 'Relative strength index' });
    functions.set('ta.bb', { name: 'ta.bb', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }, { name: 'mult', type: 'float', optional: false }], description: 'Bollinger bands' });
    functions.set('ta.crossover', { name: 'ta.crossover', returnType: PineType.SERIES_BOOL, parameters: [{ name: 'source1', type: 'series<float>', optional: false }, { name: 'source2', type: 'series<float>', optional: false }], description: 'Crossover detection' });
    
    // Strategy functions  
    functions.set('strategy.entry', { name: 'strategy.entry', returnType: PineType.VOID, parameters: [{ name: 'id', type: 'string', optional: false }, { name: 'direction', type: 'string', optional: false }], description: 'Strategy entry' });
    
    // Pine Script built-in functions
    functions.set('sma', { name: 'sma', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }], description: 'Simple moving average (legacy)' });
    functions.set('ema', { name: 'ema', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }], description: 'Exponential moving average (legacy)' });
    functions.set('rsi', { name: 'rsi', returnType: PineType.SERIES_FLOAT, parameters: [{ name: 'source', type: 'series<float>', optional: false }, { name: 'length', type: 'int', optional: false }], description: 'Relative strength index (legacy)' });
    
    // Plot function
    functions.set('plot', { name: 'plot', returnType: PineType.VOID, parameters: [{ name: 'series', type: 'series<float>', optional: false }], description: 'Plot series on chart' });
    
    return functions;
  }

  private initializeBuiltinVariables(): void {
    // Built-in variables
    this.addSymbol('close', PineType.SERIES_FLOAT, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('open', PineType.SERIES_FLOAT, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('high', PineType.SERIES_FLOAT, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('low', PineType.SERIES_FLOAT, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('volume', PineType.SERIES_FLOAT, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('time', PineType.SERIES_INT, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('bar_index', PineType.SERIES_INT, { line: 0, column: 0, length: 0, source: '' }, false);
    
    // Strategy constants
    this.addSymbol('strategy.long', PineType.STRING, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('strategy.short', PineType.STRING, { line: 0, column: 0, length: 0, source: '' }, false);
    this.addSymbol('strategy.percent_of_equity', PineType.STRING, { line: 0, column: 0, length: 0, source: '' }, false);
  }

  private addError(node: ASTNode, code: ErrorCodes, message: string, suggestion?: string): void {
    const error: CompilerError = {
      type: ErrorType.SEMANTIC,
      severity: ErrorSeverity.ERROR,
      message,
      location: node.location,
      code: code.toString()
    };
    
    if (suggestion !== undefined) {
      error.suggestion = suggestion;
    }
    
    this.errors.push(error);
  }
}
