import { Token, TokenType, ASTNode, NodeType, CompilerError, ErrorType, ErrorSeverity, ParseResult, ErrorCodes } from '../types';

/**
 * Pine Script Parser
 * Builds an Abstract Syntax Tree (AST) from tokens using recursive descent parsing
 */
export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private errors: CompilerError[] = [];

  constructor(tokens: Token[]) {
    // Keep all tokens including NEWLINE, COMMENT, INDENT, DEDENT for proper parsing
    this.tokens = tokens;
  }

  /**
   * Parse tokens into AST
   */
  public parse(): ParseResult {
    this.reset();
    
    try {
      const ast = this.parseProgram();
      return {
        ast,
        errors: this.errors
      };
    } catch (error) {
      // Return partial AST even on error for better error recovery
      const partialAst = this.createEmptyProgram();
      return {
        ast: partialAst,
        errors: this.errors
      };
    }
  }

  private reset(): void {
    this.current = 0;
    this.errors = [];
  }

  /**
   * Parse the entire program
   */
  private parseProgram(): ASTNode {
    const statements: ASTNode[] = [];
    
    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) {
          statements.push(stmt);
        }
      } catch (error) {
        this.synchronize();
      }
    }
    
    return this.createNode(NodeType.PROGRAM, statements);
  }

  /**
   * Parse a statement
   */
  private parseStatement(): ASTNode | null {
    try {
      // Skip newlines, comments, version directives
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.VERSION_DIRECTIVE)) {
        // Continue to next token
      }
      
      if (this.isAtEnd()) return null;

      if (this.match(TokenType.STRATEGY)) {
        return this.parseStrategyDeclaration(this.previous());
      }

      if (this.match(TokenType.INDICATOR)) {
        return this.parseIndicatorDeclaration(this.previous());
      }
      
      // Support explicit type variable declarations, e.g.: "float x = 0.0, y = 1.0"
      if (this.check(TokenType.IDENTIFIER) && this.isTypeKeyword(this.peek())) {
        return this.parseTypedVariableDeclaration();
      }

      if (this.match(TokenType.VAR, TokenType.VARIP)) {
        return this.parseVariableDeclaration();
      }
      
      if (this.match(TokenType.PLOT)) {
        return this.parsePlotStatement();
      }
      
      if (this.match(TokenType.IF)) {
        return this.parseIfStatement();
      }
      
      if (this.match(TokenType.FOR)) {
        return this.parseForStatement();
      }
      
      if (this.match(TokenType.WHILE)) {
        return this.parseWhileStatement();
      }
      
      // Check for array destructuring assignment: [a, b] = expression
      if (this.check(TokenType.LBRACKET)) {
        const checkPoint = this.current;
        
        // Try to parse as array destructuring assignment
        // Use parsePrimary() to correctly parse array literal without treating commas as sequence operators
        const arrayLiteral = this.parsePrimary();
        
        // Check if this is followed by an assignment operator
        if (this.match(TokenType.ASSIGN, TokenType.EQUAL)) {
          const operator = this.previous();
          const value = this.parseExpression();
          
          // Create assignment statement
          const node = this.createNode(NodeType.ASSIGNMENT, [arrayLiteral, value]);
          (node as any).left = arrayLiteral;
          (node as any).right = value;
          (node as any).operator = operator.value;
          return node;
        } else {
          // Not an assignment, reset and parse as expression statement
          this.current = checkPoint;
        }
      }
      
      return this.parseExpressionStatement();
    } catch (error) {
      this.synchronize();
      return null;
    }
  }

  // Note: parseStrategyDeclaration and parseIndicatorDeclaration removed
  // strategy() and indicator() are now treated as regular function calls

  /**
   * Parse variable declaration
   */
  private isTypeKeyword(token: Token | undefined): boolean {
    if (!token) return false;
    if (token.type !== TokenType.IDENTIFIER) return false;
    const kw = (token.value as string).toLowerCase();
    return ['int', 'float', 'bool', 'string', 'color'].includes(kw);
  }

  /**
   * Parse typed variable declaration without the 'var' keyword
   * Example: float a = 0.0, b = 1.0
   */
  private parseTypedVariableDeclaration(): ASTNode {
    const typeToken = this.advance(); // consume type keyword

    const declarations: ASTNode[] = [];

    while (true) {
      // Skip any newlines/comments before identifier
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}

      const identifier = this.consume(TokenType.IDENTIFIER, 'Expected variable name');

      let initializer: ASTNode | null = null;
      if (this.match(TokenType.ASSIGN, TokenType.EQUAL)) {
        initializer = this.parseExpression();
      }

      const children = initializer
        ? [this.createIdentifierNode(identifier), initializer]
        : [this.createIdentifierNode(identifier)];
      const node = this.createNode(NodeType.VARIABLE_DECLARATION, children);
      node.value = typeToken.value; // store declared type
      (node as any).id = this.createIdentifierNode(identifier);
      if (initializer) {
        (node as any).init = initializer;
      }
      declarations.push(node);

      // Skip whitespace/comments between declarations
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}

      if (!this.match(TokenType.COMMA)) break;
    }

    // 如果只有一个声明则直接返回，否则返回一个 BLOCK
    return declarations.length === 1 ? declarations[0]! : this.createNode(NodeType.BLOCK, declarations);
  }

  private parseVariableDeclaration(): ASTNode {
    const varToken = this.previous();
    
    const identifier = this.consume(TokenType.IDENTIFIER, 'Expected variable name');
    
    let initializer: ASTNode | null = null;
    if (this.match(TokenType.ASSIGN, TokenType.EQUAL)) {
      initializer = this.parseExpression();
    }
    
    const children = initializer ? [this.createIdentifierNode(identifier), initializer] : [this.createIdentifierNode(identifier)];
    const node = this.createNode(NodeType.VARIABLE_DECLARATION, children);
    node.value = varToken.value;
    (node as any).id = this.createIdentifierNode(identifier);
    if (initializer) {
      (node as any).init = initializer;
    }

    // 错误恢复：若声明后未以换行/缩进结束且直接开始下一个语句，报告缺少分号/换行
    const next = this.peek();
    const isTerminator = next.type === TokenType.NEWLINE || next.type === TokenType.DEDENT || next.type === TokenType.EOF || next.type === TokenType.RIGHT_PAREN || next.type === TokenType.RBRACKET || next.type === TokenType.COMMA;
    const isStmtStart = next.type === TokenType.VAR || next.type === TokenType.VARIP || next.type === TokenType.IF || next.type === TokenType.FOR || next.type === TokenType.WHILE || next.type === TokenType.PLOT || next.type === TokenType.IDENTIFIER || next.type === TokenType.LBRACKET;
    if (!isTerminator && isStmtStart) {
      this.addError(next, 'Missing semicolon or newline between statements');
    }

    return node;
  }

  private parseStrategyDeclaration(keywordToken: Token): ASTNode {
    return this.parseDeclarationFromKeyword(keywordToken, NodeType.STRATEGY_DECLARATION);
  }

  private parseIndicatorDeclaration(keywordToken: Token): ASTNode {
    return this.parseDeclarationFromKeyword(keywordToken, NodeType.INDICATOR_DECLARATION);
  }

  private parseDeclarationFromKeyword(keywordToken: Token, nodeType: NodeType): ASTNode {
    this.consume(TokenType.LEFT_PAREN, `Expected "(" after "${keywordToken.value}"`);

    const calleeToken: Token = {
      ...keywordToken,
      type: TokenType.IDENTIFIER
    };
    const calleeNode = this.createIdentifierNode(calleeToken);
    const callExpression = this.finishCall(calleeNode);
    const args: ASTNode[] = ((callExpression as any).arguments ?? []) as ASTNode[];

    const node = this.createNode(nodeType, args);
    (node as any).callee = calleeNode;
    (node as any).arguments = args;
    (node as any).expression = callExpression;
    (node as any).name = calleeNode.value;
    return node;
  }

  /**
   * Parse plot statement
   */
  private parsePlotStatement(): ASTNode {
    // Remember the 'plot' token consumed in parseStatement()
    const plotToken = this.previous();
    
    this.consume(TokenType.LEFT_PAREN, 'Expected "(" after "plot"');
    
    // Allow leading newlines/comments/indents
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}

    const parameters: ASTNode[] = [];

    // Handle optional first expression/parameter or empty call
    if (!this.check(TokenType.RIGHT_PAREN)) {
      // First positional expression or named parameter
      parameters.push(this.parseParameter());

      // Additional named/positional parameters separated by commas
      while (true) {
        // Skip whitespace/newlines/comments between args
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
        if (!this.match(TokenType.COMMA)) break;
        // After comma, allow newlines/comments/indents
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
        if (this.check(TokenType.RIGHT_PAREN) || this.check(TokenType.RBRACKET) || this.isAtEnd()) {
          break; // Trailing comma case
        }
        parameters.push(this.parseParameter());
      }
    }
    
    // Skip trailing newlines/comments/indents before closing paren
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
    this.consume(TokenType.RIGHT_PAREN, 'Expected ")" after plot parameters');
    
    // Build callee identifier node from the 'plot' keyword (treated as identifier in call context)
    const calleeNode = this.createIdentifierNode({
      ...plotToken,
      type: TokenType.IDENTIFIER,
    } as any);
    
    // Build call expression: plot(...args)
    const callExpr = this.createNode(NodeType.CALL_EXPRESSION, [calleeNode, ...parameters]);
    (callExpr as any).callee = calleeNode;
    (callExpr as any).arguments = parameters;
    
    // Wrap in PLOT_STATEMENT node, exposing `.expression` as the call expression
    const node = this.createNode(NodeType.PLOT_STATEMENT, [callExpr]);
    (node as any).expression = callExpr;
    return node;
  }

  /**
   * Parse if statement
   */
  private parseIfStatement(): ASTNode {
    const condition = this.parseExpression();
    
    const thenBranch = this.parseBlock();
    
    let elseBranch: ASTNode | null = null;
    if (this.match(TokenType.ELSE)) {
      elseBranch = this.parseBlock();
    }
    
    // Create node with test/consequent/alternate structure to match test expectations
    const node = this.createNode(NodeType.IF_STATEMENT, []);
    (node as any).test = condition;
    (node as any).consequent = thenBranch;
    if (elseBranch) {
      (node as any).alternate = elseBranch;
    }
    
    return node;
  }

  /**
   * Parse for statement
   */
  private parseForStatement(): ASTNode {
    const variable = this.consume(TokenType.IDENTIFIER, 'Expected variable name in for loop');
    
    this.consume(TokenType.EQUAL, 'Expected "=" after for loop variable');
    
    const start = this.parseExpression();
    
    this.consume(TokenType.TO, 'Expected "to" in for loop');
    
    const end = this.parseExpression();
    
    let step: ASTNode | null = null;
    if (this.match(TokenType.BY)) {
      step = this.parseExpression();
    }
    
    const body = this.parseBlock();
    
    const children = step ? 
      [this.createIdentifierNode(variable), start, end, step, body] :
      [this.createIdentifierNode(variable), start, end, body];
    
    const node = this.createNode(NodeType.FOR_STATEMENT, children);
    (node as any).init = this.createIdentifierNode(variable);
    (node as any).test = end;
    (node as any).body = body;
    return node;
  }

  /**
   * Parse while statement
   */
  private parseWhileStatement(): ASTNode {
    const condition = this.parseExpression();
    const body = this.parseBlock();
    
    const node = this.createNode(NodeType.WHILE_STATEMENT, [condition, body]);
    (node as any).test = condition;
    (node as any).body = body;
    return node;
  }

  /**
   * Parse expression statement or function definition
   */
  private parseExpressionStatement(): ASTNode {
    // Check if it's a function definition: identifier(...params) => expression
    if (this.check(TokenType.IDENTIFIER)) {
      const checkPoint = this.current;
      const id = this.advance();
      
      // Skip newlines/comments after identifier
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
      
      if (this.match(TokenType.LEFT_PAREN)) {
        // First, scan ahead to see if this is actually a function definition (has arrow)
        const scanPoint = this.current;
        let parenCount = 1;
        let foundArrow = false;
        
        // Scan through the parameter list to find the closing paren
        while (parenCount > 0 && !this.isAtEnd()) {
          if (this.check(TokenType.LEFT_PAREN)) {
            parenCount++;
          } else if (this.check(TokenType.RIGHT_PAREN)) {
            parenCount--;
          }
          this.advance();
        }
        
        // Skip newlines/comments after closing paren
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
        
        // Check if there's an arrow
        if (this.check(TokenType.ARROW)) {
          foundArrow = true;
        }
        
        // Reset to scan point
        this.current = scanPoint;
        
        if (foundArrow) {
          // Parse as function definition
          const params: ASTNode[] = [];
          
          // Skip leading newlines/comments in parameter list
          while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
          
          if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
              // Skip any newlines/comments before parameter
              while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
              if (this.check(TokenType.RIGHT_PAREN)) break; // Trailing comma case
              
              // Simple parameter: just identifier
              const paramName = this.consume(TokenType.IDENTIFIER, 'Expected parameter name');
              params.push(this.createIdentifierNode(paramName));
              
              // Skip any newlines/comments after parameter
              while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
            } while (this.match(TokenType.COMMA) && (
              // After comma, allow newlines before next parameter
              (() => { while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {} return true; })()
            ));
          }
          
          this.consume(TokenType.RIGHT_PAREN, 'Expected ")" after function parameters');
          
          // Skip newlines/comments before arrow
          while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
          
          this.consume(TokenType.ARROW, 'Expected "=>" after function parameters');
          
          // Skip newlines/comments after arrow
          while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
          
          // Parse function body (expression or block)
          let body: ASTNode;
          if (this.match(TokenType.INDENT)) {
            // Multi-line function body
            const statements: ASTNode[] = [];
            while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
              while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
              if (this.check(TokenType.DEDENT) || this.isAtEnd()) break;
              
              const stmt = this.parseStatement();
              if (stmt) statements.push(stmt);
            }
            this.consume(TokenType.DEDENT, 'Expected dedent after function body');
            body = this.createNode(NodeType.BLOCK, statements);
          } else {
            // Single expression body
            body = this.parseExpression();
          }
          
          // Create function declaration node
          const funcNode = this.createNode(NodeType.FUNCTION_DECLARATION, [this.createIdentifierNode(id), ...params, body]);
          (funcNode as any).id = this.createIdentifierNode(id);
          (funcNode as any).params = params;
          (funcNode as any).body = body;
          return funcNode;
        }
      }
      
      // Reset and parse as regular expression
      this.current = checkPoint;
    }
    
    const expr = this.parseExpression();
    return expr;
  }

  /**
   * Parse block (indented statements)
   */
  private parseBlock(): ASTNode {
    const statements: ASTNode[] = [];
    
    // 允许在块开始前存在换行/注释
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
    
    if (this.match(TokenType.INDENT)) {
      while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
        // Skip empty lines and comments inside block
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
        if (this.check(TokenType.DEDENT) || this.isAtEnd()) break;
        
        // If we encounter a nested INDENT within a block without a construct expecting a block,
        // flatten it by parsing until its corresponding DEDENT and append statements here.
        if (this.match(TokenType.INDENT)) {
          while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
            while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
            if (this.check(TokenType.DEDENT) || this.isAtEnd()) break;
            const inner = this.parseStatement();
            if (inner) statements.push(inner);
          }
          this.consume(TokenType.DEDENT, 'Expected dedent to close nested indentation');
          continue;
        }
        
        const stmt = this.parseStatement();
        if (stmt) {
          statements.push(stmt);
        }
      }
      
      this.consume(TokenType.DEDENT, 'Expected dedent after block');
    } else {
      // Single statement without indentation
      // Skip leading newlines/comments
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }
    
    return this.createNode(NodeType.BLOCK, statements);
  }

  /**
   * Parse expression
   */
  private parseExpression(): ASTNode {
    return this.parseSequence();
  }

  /**
   * Parse sequence expression (comma operator)
   */
  private parseSequence(): ASTNode {
    let left = this.parseAssignment();
    
    while (this.match(TokenType.COMMA)) {
      const operator = this.previous();
      
      // Skip whitespace/comments after comma
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
      if (this.check(TokenType.RIGHT_PAREN) || this.check(TokenType.RBRACKET) || this.isAtEnd()) {
        break; // Trailing comma case
      }
      // Allow empty expressions after commas - treat as undefined
      if (this.check(TokenType.COMMA)) {
        // Create an empty literal for the right side
        const emptyLiteral = this.createLiteralNode(null);
        left = this.createBinaryNode(left, operator, emptyLiteral);
        continue;
      }
      
      const right = this.parseAssignment();
      left = this.createBinaryNode(left, operator, right);
    }
    
    return left;
  }

  /**
   * Parse assignment expression
   */
  private parseAssignment(): ASTNode {
    let expr = this.parseConditional();
    
    if (this.match(TokenType.ASSIGN, TokenType.EQUAL)) {
      const operator = this.previous();
      const value = this.parseAssignment(); // Right-associative
      
      // For assignment, the left side should be an identifier or array literal (for destructuring)
      if (expr.type === NodeType.IDENTIFIER || expr.type === NodeType.ARRAY_LITERAL) {
        const node = this.createNode(NodeType.ASSIGNMENT, [expr, value]);
        (node as any).left = expr;
        (node as any).right = value;
        (node as any).operator = operator.value;
        return node;
      } else {
        this.addError(this.previous(), 'Invalid assignment target');
        return expr;
      }
    }
    
    return expr;
  }

  /**
   * Parse conditional expression (ternary)
   */
  private parseConditional(): ASTNode {
    let expr = this.parseLogicalOr();
    
    if (this.match(TokenType.QUESTION)) {
      const thenExpr = this.parseExpression();
      this.consume(TokenType.COLON, 'Expected ":" after "?" in conditional expression');
      const elseExpr = this.parseExpression();
      
      const node = this.createNode(NodeType.CONDITIONAL_EXPRESSION, [expr, thenExpr, elseExpr]);
      (node as any).test = expr;
      (node as any).consequent = thenExpr;
      (node as any).alternate = elseExpr;
      expr = node;
    }
    
    return expr;
  }

  /**
   * Parse logical OR expression
   */
  private parseLogicalOr(): ASTNode {
    let expr = this.parseLogicalAnd();
    
    while (this.match(TokenType.OR)) {
      const operator = this.previous();
      const right = this.parseLogicalAnd();
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse logical AND expression
   */
  private parseLogicalAnd(): ASTNode {
    let expr = this.parseEquality();
    
    while (this.match(TokenType.AND)) {
      const operator = this.previous();
      const right = this.parseEquality();
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse equality expression
   */
  private parseEquality(): ASTNode {
    let expr = this.parseComparison();
    
    while (this.match(TokenType.EQ, TokenType.NE)) {
      const operator = this.previous();
      const right = this.parseComparison();
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse comparison expression
   */
  private parseComparison(): ASTNode {
    let expr = this.parseTerm();
    
    while (this.match(TokenType.GT, TokenType.GE, TokenType.LT, TokenType.LE)) {
      const operator = this.previous();
      const right = this.parseTerm();
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse term expression (+ -)
   */
  private parseTerm(): ASTNode {
    let expr = this.parseFactor();
    
    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous();
      // Skip whitespace/comments/indents before right operand
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
      if (this.check(TokenType.EOF)) {
        throw this.error(this.peek(), 'Unexpected end of input');
      }
      const right = this.parseFactor();
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse factor expression (* / %)
   */
  private parseFactor(): ASTNode {
    let expr = this.parseUnary();
    
    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO)) {
      const operator = this.previous();
      // Skip whitespace/comments/indents before right operand
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
      if (this.check(TokenType.EOF)) {
        throw this.error(this.peek(), 'Unexpected end of input');
      }
      const right = this.parseUnary();
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse unary expression
   */
  private parseUnary(): ASTNode {
    if (this.match(TokenType.NOT, TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous();
      // Skip whitespace/comments/indents before operand
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
      if (this.check(TokenType.EOF)) {
        throw this.error(this.peek(), 'Unexpected end of input');
      }
      const right = this.parseUnary();
      const node = this.createNode(NodeType.UNARY_EXPRESSION, [right]);
      (node as any).operator = operator.value;
      (node as any).operand = right;
      return node;
    }
    
    return this.parsePower();
  }

  /**
   * Parse power expression (^)
   */
  private parsePower(): ASTNode {
    let expr = this.parseCall();
    
    if (this.match(TokenType.POWER)) {
      const operator = this.previous();
      // Skip whitespace/comments/indents before right operand
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
      if (this.check(TokenType.EOF)) {
        throw this.error(this.peek(), 'Unexpected end of input');
      }
      const right = this.parseUnary(); // Right associative
      expr = this.createBinaryNode(expr, operator, right);
    }
    
    return expr;
  }

  /**
   * Parse function call and member access
   */
  private parseCall(): ASTNode {
    let expr = this.parsePrimary();
    
    while (true) {
      if (this.match(TokenType.LEFT_PAREN)) {
        expr = this.finishCall(expr);
      } else if (this.match(TokenType.LBRACKET)) {
        const index = this.parseExpression();
        this.consume(TokenType.RBRACKET, 'Expected "]" after array index');
        const node = this.createNode(NodeType.ARRAY_ACCESS, [expr, index]);
        (node as any).object = expr;
        (node as any).index = index;
        expr = node;
      } else if (this.match(TokenType.DOT)) {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected property name after "."');
        const propertyNode = this.createIdentifierNode(name);
        const node = this.createNode(NodeType.MEMBER_EXPRESSION, [expr, propertyNode]);
        (node as any).object = expr;
        (node as any).property = propertyNode;
        expr = node;
      } else {
        break;
      }
    }
    
    return expr;
  }

  /**
   * Finish parsing function call
   */
  private finishCall(callee: ASTNode): ASTNode {
    const args: ASTNode[] = [];
    
    // Skip leading newlines/comments/indents in function arguments
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
    
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        // Skip any newlines/comments/indents before parameter
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
        if (this.check(TokenType.RIGHT_PAREN)) break; // Trailing comma case
        
        // Support named and positional parameters
        args.push(this.parseParameter());
        
        // Skip any newlines/comments/indents after parameter
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
      } while (this.match(TokenType.COMMA) && (
        // After comma, allow newlines/indents before next argument
        (() => { while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {} return true; })()
      ));
    }
    
    // Skip any trailing newlines/comments/indents before closing paren
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
    
    this.consume(TokenType.RIGHT_PAREN, 'Expected ")" after function arguments');
    
    const node = this.createNode(NodeType.CALL_EXPRESSION, [callee, ...args]);
    (node as any).callee = callee;
    (node as any).arguments = args;
    return node;
  }

  /**
   * Parse primary expression
   */
  private parsePrimary(): ASTNode {
    // Skip newlines/comments/indents at the start of primary expression
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
    
    if (this.match(TokenType.TRUE)) {
      return this.createLiteralNode(true);
    }
    
    if (this.match(TokenType.FALSE)) {
      return this.createLiteralNode(false);
    }
    
    if (this.match(TokenType.NA)) {
      return this.createLiteralNode(null);
    }
    
    if (this.match(TokenType.NUMBER)) {
      const value = this.previous().value;
      return this.createLiteralNode(value.includes('.') ? parseFloat(value) : parseInt(value));
    }
    
    if (this.match(TokenType.STRING)) {
      return this.createLiteralNode(this.previous().value);
    }
    
    if (this.match(TokenType.IDENTIFIER)) {
      return this.createIdentifierNode(this.previous());
    }

    // Treat certain keywords as identifiers in expression context (namespaces/constants like strategy.*, plot.*)
    if (this.check(TokenType.STRATEGY) || this.check(TokenType.PLOT) || this.check(TokenType.INDICATOR)) {
      const kw = this.advance();
      return this.createIdentifierNode(kw);
    }
    
    if (this.match(TokenType.LEFT_PAREN)) {
      // Skip newlines inside parentheses
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
      
      const expr = this.parseExpression();
      
      // Skip newlines before closing paren
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
      
      this.consume(TokenType.RIGHT_PAREN, 'Expected ")" after expression');
      return expr;
    }
    
    // Parse array literal [element1, element2, ...]
    if (this.match(TokenType.LBRACKET)) {
      const elements: ASTNode[] = [];
      
      // Skip newlines inside brackets
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
      
      if (!this.check(TokenType.RBRACKET)) {
        do {
          // Skip any newlines/comments before element
          while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
          if (this.check(TokenType.RBRACKET)) break; // Trailing comma case
          
          // Parse element without consuming comma operator inside array literal
          elements.push(this.parseAssignment());
          
          // Skip any newlines/comments after element
          while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {}
        } while (this.match(TokenType.COMMA) && (
          // After comma, allow newlines before next element
          (() => { while (this.match(TokenType.NEWLINE, TokenType.COMMENT)) {} return true; })()
        ));
      }
      
      this.consume(TokenType.RBRACKET, 'Expected "]" after array elements');
      return this.createNode(NodeType.ARRAY_LITERAL, elements);
    }
    
    // 针对文件结束给出更准确的错误
    if (this.check(TokenType.EOF)) {
      throw this.error(this.peek(), 'Unexpected end of input');
    }

    throw this.error(this.peek(), 'Expected expression');
  }

  /**
   * Parse parameter (for function calls)
   */
  private parseParameter(): ASTNode {
    // Allow leading newlines/comments/indents before parameter token (handled by callers too, but safe)
    while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
    
    if (this.check(TokenType.IDENTIFIER)) {
      // Peek ahead allowing newlines/comments to see if this is a named argument
      const save = this.current;
      const nameTok = this.peek();
      this.advance(); // consume identifier
      while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
      const isNamed = this.match(TokenType.EQUAL);
      if (isNamed) {
        // Skip newlines/comments/indents after '='
        while (this.match(TokenType.NEWLINE, TokenType.COMMENT, TokenType.INDENT, TokenType.DEDENT)) {}
        const value = this.parseAssignment(); // Use parseAssignment to avoid comma operator
        const nameNode = this.createIdentifierNode(nameTok);
        return this.createNode(NodeType.ASSIGNMENT, [nameNode, value]);
      } else {
        // Not a named arg, rewind and parse as expression
        this.current = save;
      }
    }
    
    // Positional parameter - use parseAssignment to avoid comma operator
    return this.parseAssignment();
  }

  // Helper methods
  private createNode(type: NodeType, children: ASTNode[] = [], value?: unknown): ASTNode {
    const token = this.current > 0 ? this.previous() : { line: 1, column: 1, value: '', type: TokenType.EOF, position: 0 };
    return {
      type,
      children,
      value,
      location: {
        line: token.line,
        column: token.column,
        length: token.value ? token.value.length : 0,
        source: ''
      }
    };
  }

  private createBinaryNode(left: ASTNode, operator: Token, right: ASTNode): ASTNode {
    const node = this.createNode(NodeType.BINARY_EXPRESSION, [left, right], operator.value);
    (node as any).left = left;
    (node as any).right = right;
    (node as any).operator = operator.value;
    node.location = {
      line: operator.line,
      column: operator.column,
      length: operator.value.length,
      source: ''
    };
    return node;
  }

  private createIdentifierNode(token: Token): ASTNode {
    return {
      type: NodeType.IDENTIFIER,
      children: [],
      value: token.value,
      location: {
        line: token.line,
        column: token.column,
        length: token.value.length,
        source: ''
      },
      name: token.value as any
    } as any;
  }

  private createLiteralNode(value: unknown): ASTNode {
    const token = this.current > 0 ? this.previous() : { line: 1, column: 1, value: '', type: TokenType.EOF, position: 0 };
    return {
      type: NodeType.LITERAL,
      children: [],
      value,
      location: {
        line: token.line,
        column: token.column,
        length: token.value.length,
        source: ''
      },
      raw: value as any
    } as any;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  // Note: checkNext method removed as it's no longer needed

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    const token = this.tokens[this.current];
    return !token || token.type === TokenType.EOF;
  }

  private peek(): Token {
    const token = this.tokens[this.current];
    if (token) return token;

    const last = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : undefined;
    const line = last ? last.line : 1;
    const column = last ? last.column + (last.value ? last.value.length : 0) : 1;
    return {
      type: TokenType.EOF,
      value: '',
      line,
      column,
      position: this.current,
      location: { line: 1, column: 1, length: 0, source: '' }
    };
  }

  private previous(): Token {
    const token = this.tokens[this.current - 1];
    if (!token) {
      return {
        type: TokenType.EOF,
        value: '',
        line: 1,
        column: 1,
        position: this.current - 1,
        location: { line: 1, column: 1, length: 0, source: '' }
      };
    }
    return token;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    this.addError(this.peek(), message);
    return {
      type: type,
      value: '',
      line: this.peek().line,
      column: this.peek().column,
      position: this.current,
      location: { line: this.peek().line, column: this.peek().column, length: 0, source: '' }
    };
  }

  private error(token: Token, message: string): Error {
    this.addError(token, message);
    return new Error(message);
  }

  private addError(token: Token, message: string): void {
    const error: CompilerError = {
      type: ErrorType.SYNTAX,
      severity: ErrorSeverity.ERROR,
      message,
      location: {
        line: token.line,
        column: token.column,
        length: token.value.length,
        source: ''
      },
        code: ErrorCodes.UNEXPECTED_TOKEN.toString()
    };
    
    this.errors.push(error);
  }

  private synchronize(): void {
    this.advance();
    
    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.NEWLINE) return;
      
      switch (this.peek().type) {
        case TokenType.STRATEGY:
        case TokenType.INDICATOR:
        case TokenType.VAR:
        case TokenType.VARIP:
        case TokenType.PLOT:
        case TokenType.IF:
        case TokenType.FOR:
        case TokenType.WHILE:
          return;
      }
      
      this.advance();
    }
  }

  private createEmptyProgram(): ASTNode {
    return this.createNode(NodeType.PROGRAM, []);
  }
}
