import { Token, TokenType, NZSType, ASTNode, ExpressionNode, StatementNode,
  ProgramNode, PragmaNode, ImportNode, ExportNode, ConstDeclaration,
  LetDeclaration, VarDeclaration, TypeDeclaration, TypeField, StoreDeclaration,
  StoreField, EmbedDeclaration, EmbedField, NodeDeclaration, BotDeclaration,
  CommandDeclaration, CommandParam, EventDeclaration, FnDeclaration, FnParam,
  IfStatement, MatchStatement, ForInStatement, ForRangeStatement, WhileStatement,
  TryCatchStatement, ReturnStatement, BreakStatement, ContinueStatement,
  ThrowStatement, EmitStatement, WaitStatement, EveryStatement, AfterStatement,
  ReplyStatement, DmStatement, LogStatement, RoleStatement, ReactStatement,
  PaginateStatement, AssignStatement, ExpressionStatement, ModalStatement,
  SelectStatement, JsEscapeStatement, Identifier, Literal, TemplateLiteral,
  ArrayLiteral, MapLiteral, TypeInstantiation, BinaryExpression, UnaryExpression,
  TernaryExpression, NullCoalesce, IsExpression, MemberExpression, IndexExpression,
  CallExpression, ArrowFunction, ButtonNode, ButtonRowNode, PaginatePage
} from "./types";
import { Errors } from "./errors";

export class Parser {
  private pos = 0;
  private tokens: Token[];

  constructor(tokens: Token[], private file: string = "<input>") {
    this.tokens = tokens;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (t.type !== TokenType.EOF) this.pos++;
    return t;
  }

  private check(...types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  private match(...types: TokenType[]): Token | null {
    if (this.check(...types)) return this.advance();
    return null;
  }

  private expect(type: TokenType, hint?: string): Token {
    if (this.peek().type === type) return this.advance();
    const t = this.peek();
    throw Errors.unexpectedToken(t.value || t.type, type, this.file, t.line, t.col, "", hint);
  }

  private loc() { const t = this.peek(); return { line: t.line, col: t.col }; }

  // ─── Entry Point ──────────────────────────────────────────────────────────

  parse(): ProgramNode {
    const { line, col } = this.loc();
    const body: ASTNode[] = [];
    let pragma: string | undefined;

    // Optional pragma
    if (this.check(TokenType.HASH)) {
      const t = this.advance();
      pragma = t.value;
    }

    while (!this.check(TokenType.EOF)) {
      // skip extra newlines represented as semicolons
      if (this.match(TokenType.SEMICOLON)) continue;
      body.push(this.parseTopLevel());
    }

    return { kind: "Program", pragma, body, line, col };
  }

  // ─── Top-Level Statements ─────────────────────────────────────────────────

  private parseTopLevel(): ASTNode {
    const t = this.peek();

    if (t.type === TokenType.IMPORT)    return this.parseImport();
    if (t.type === TokenType.EXPORT)    return this.parseExport();
    if (t.type === TokenType.CONST)     return this.parseConst();
    if (t.type === TokenType.TYPE)      return this.parseType();
    if (t.type === TokenType.STORE)     return this.parseStore();
    if (t.type === TokenType.EMBED)     return this.parseEmbed();
    if (t.type === TokenType.NODE)      return this.parseNode();
    if (t.type === TokenType.BOT)       return this.parseBot();
    if (t.type === TokenType.COMMAND)   return this.parseCommand();
    if (t.type === TokenType.EVENT)     return this.parseEvent();
    if (t.type === TokenType.EVERY)     return this.parseEvery();
    if (t.type === TokenType.AFTER)     return this.parseAfter();
    if (t.type === TokenType.FN)        return this.parseFn(false, false, false);
    if (t.type === TokenType.ASYNC)     return this.parseAsyncFn(false, false);
    if (t.type === TokenType.PRIVATE)   return this.parsePrivateFn();

    return this.parseStatement();
  }

  // ─── Import / Export ──────────────────────────────────────────────────────

  private parseImport(): ImportNode {
    const { line, col } = this.loc();
    this.expect(TokenType.IMPORT);

    // import { a, b } from "./file.nzs"
    if (this.check(TokenType.LBRACE)) {
      this.advance();
      const named: string[] = [];
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        named.push(this.expect(TokenType.IDENTIFIER).value);
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACE);
      this.expect(TokenType.FROM);
      const path = this.expect(TokenType.STRING).value;
      return { kind: "Import", path, named, line, col };
    }

    // import "./file.nzs"
    const path = this.expect(TokenType.STRING).value;
    return { kind: "Import", path, named: [], line, col };
  }

  private parseExport(): ExportNode {
    const { line, col } = this.loc();
    this.expect(TokenType.EXPORT);
    const declaration = this.parseTopLevel();
    return { kind: "Export", declaration, line, col };
  }

  // ─── Variables ────────────────────────────────────────────────────────────

  private parseConst(): ConstDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.CONST);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.EQUALS);
    const value = this.parseExpression();
    return { kind: "ConstDeclaration", name, value, line, col };
  }

  private parseLet(): LetDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.LET);
    const name = this.expect(TokenType.IDENTIFIER).value;
    let typeAnnotation: NZSType | undefined;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseType_();
    }
    this.expect(TokenType.EQUALS);
    const value = this.parseExpression();
    return { kind: "LetDeclaration", name, typeAnnotation, value, line, col };
  }

  private parseVar(): VarDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.VAR);
    const varType = this.parseType_();
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.EQUALS);
    const value = this.parseExpression();
    return { kind: "VarDeclaration", name, varType, value, line, col };
  }

  // ─── Type Annotations ─────────────────────────────────────────────────────

  private parseType_(): NZSType {
    const t = this.advance();
    let base: NZSType;

    switch (t.type) {
      case TokenType.INT:   base = "int";   break;
      case TokenType.FLOAT: base = "float"; break;
      case TokenType.STR:   base = "str";   break;
      case TokenType.BOOL:  base = "bool";  break;
      case TokenType.NULL:  base = "null";  break;
      case TokenType.ANY:   base = "any";   break;
      case TokenType.IDENTIFIER: {
        // map<k, v>
        if (t.value === "map" && this.check(TokenType.LT)) {
          this.advance(); // <
          const key = this.parseType_();
          this.expect(TokenType.COMMA);
          const value = this.parseType_();
          this.expect(TokenType.GT);
          base = { map: { key, value } };
          break;
        }
        base = { custom: t.value };
        break;
      }
      default:
        throw Errors.unexpectedToken(t.value, "type", this.file, t.line, t.col);
    }

    // Array suffix: int[]
    if (this.check(TokenType.LBRACKET) && this.peek(1).type === TokenType.RBRACKET) {
      this.advance(); this.advance();
      base = { array: base };
    }

    // Nullable suffix: int?
    if (this.match(TokenType.QUESTION)) {
      base = { nullable: base };
    }

    return base;
  }

  // ─── Type Declaration ─────────────────────────────────────────────────────

  private parseType(): TypeDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.TYPE);
    const name = this.expect(TokenType.IDENTIFIER).value;
    let ext: string | undefined;
    if (this.match(TokenType.EXTENDS)) {
      ext = this.expect(TokenType.IDENTIFIER).value;
    }
    this.expect(TokenType.LBRACE);
    const fields: TypeField[] = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const fname = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const ftype = this.parseType_();
      let defaultValue;
      if (this.match(TokenType.EQUALS)) {
        defaultValue = this.parseExpression();
      }
      fields.push({ name: fname, type: ftype, defaultValue });
    }
    this.expect(TokenType.RBRACE);
    return { kind: "TypeDeclaration", name, fields, extends: ext, line, col };
  }

  // ─── Store ────────────────────────────────────────────────────────────────

  private parseStore(): StoreDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.STORE);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);

    let scope: "user" | "guild" | "global" = "user";
    const fields: StoreField[] = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const key = this.peek();

      if (key.type === TokenType.SCOPE || (key.type === TokenType.IDENTIFIER && key.value === "scope")) {
        this.advance();
        this.expect(TokenType.COLON);
        const s = this.advance().value;
        if (s === "user" || s === "guild" || s === "global") {
          scope = s;
        }
        continue;
      }

      const fname = this.advance().value;
      this.expect(TokenType.COLON);
      const ftype = this.parseType_();
      let defaultValue;
      if (this.match(TokenType.EQUALS)) {
        defaultValue = this.parseExpression();
      }
      fields.push({ name: fname, type: ftype, defaultValue });
    }

    this.expect(TokenType.RBRACE);
    return { kind: "StoreDeclaration", name, scope, fields, line, col };
  }

  // ─── Embed ────────────────────────────────────────────────────────────────

  private parseEmbed(): EmbedDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.EMBED);
    const name = this.expect(TokenType.IDENTIFIER).value;
    let ext: string | undefined;
    if (this.match(TokenType.EXTENDS)) {
      ext = this.expect(TokenType.IDENTIFIER).value;
    }
    this.expect(TokenType.LBRACE);
    const props: { key: string; value: ExpressionNode }[] = [];
    let fields: EmbedField[] | undefined;

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.check(TokenType.FIELDS) || (this.peek().type === TokenType.IDENTIFIER && this.peek().value === "fields")) {
        this.advance();
        this.expect(TokenType.COLON);
        fields = this.parseEmbedFields();
        continue;
      }
      const key = this.advance().value;
      this.expect(TokenType.COLON);
      const value = this.parseExpression();
      props.push({ key, value });
    }

    this.expect(TokenType.RBRACE);
    return { kind: "EmbedDeclaration", name, extends: ext, properties: props, fields, line, col };
  }

  private parseEmbedFields(): EmbedField[] {
    this.expect(TokenType.LBRACKET);
    const fields: EmbedField[] = [];
    while (!this.check(TokenType.RBRACKET) && !this.check(TokenType.EOF)) {
      this.expect(TokenType.LBRACE);
      let name: ExpressionNode | undefined, value: ExpressionNode | undefined;
      let inline = false;
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        const k = this.advance().value;
        this.expect(TokenType.COLON);
        if (k === "name") name = this.parseExpression();
        else if (k === "value") value = this.parseExpression();
        else if (k === "inline") { this.parseExpression(); inline = true; }
        else this.parseExpression();
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACE);
      this.match(TokenType.COMMA);
      if (name && value) fields.push({ name: (name as Literal).value as string || "", value, inline });
    }
    this.expect(TokenType.RBRACKET);
    return fields;
  }

  // ─── Node (organisational container) ─────────────────────────────────────

  private parseNode(): NodeDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.NODE);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);
    const body: ASTNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.match(TokenType.SEMICOLON)) continue;
      body.push(this.parseTopLevel());
    }
    this.expect(TokenType.RBRACE);
    return { kind: "NodeDeclaration", name, body, line, col };
  }

  // ─── Bot ──────────────────────────────────────────────────────────────────

  private parseBot(): BotDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.BOT);
    this.expect(TokenType.LBRACE);
    const fields: { key: string; value: ExpressionNode }[] = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const key = this.advance().value;
      this.expect(TokenType.COLON);
      const value = this.parseExpression();
      fields.push({ key, value });
    }
    this.expect(TokenType.RBRACE);
    return { kind: "BotDeclaration", fields, line, col };
  }

  // ─── Command ──────────────────────────────────────────────────────────────

  private parseCommand(): CommandDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.COMMAND);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);

    const options: { key: string; value: ExpressionNode }[] = [];
    let params: CommandParam[] = [];
    let runParams: string[] = [];
    let body: ASTNode[] = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const t = this.peek();

      // params block
      if (t.type === TokenType.PARAMS) {
        this.advance();
        this.expect(TokenType.LBRACE);
        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
          const pname = this.expect(TokenType.IDENTIFIER).value;
          this.expect(TokenType.COLON);
          const ptype = this.advance().value; // mention, int, str, bool, float, user etc
          let defaultValue;
          if (this.match(TokenType.EQUALS)) {
            defaultValue = this.parseExpression();
          }
          params.push({ name: pname, type: ptype, defaultValue });
        }
        this.expect(TokenType.RBRACE);
        continue;
      }

      // run block
      if (t.type === TokenType.RUN) {
        this.advance();
        this.expect(TokenType.LPAREN);
        runParams = [];
        while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
          runParams.push(this.expect(TokenType.IDENTIFIER).value);
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RPAREN);
        this.expect(TokenType.LBRACE);
        body = this.parseBlock();
        continue;
      }

      // option key: value
      const key = this.advance().value;
      this.expect(TokenType.COLON);
      const value = this.parseExpression();
      options.push({ key, value });
    }

    this.expect(TokenType.RBRACE);
    return { kind: "CommandDeclaration", name, options, params, runParams, body, line, col };
  }

  // ─── Event ────────────────────────────────────────────────────────────────

  private parseEvent(): EventDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.EVENT);
    const name = this.expect(TokenType.IDENTIFIER).value;
    const params: string[] = [];

    if (this.match(TokenType.LPAREN)) {
      while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
        params.push(this.expect(TokenType.IDENTIFIER).value);
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RPAREN);
    }

    this.expect(TokenType.LBRACE);
    const body = this.parseBlock();
    return { kind: "EventDeclaration", name, params, body, line, col };
  }

  // ─── Functions ────────────────────────────────────────────────────────────

  private parsePrivateFn(): FnDeclaration {
    this.expect(TokenType.PRIVATE);
    if (this.check(TokenType.ASYNC)) {
      this.advance();
      return this.parseFn(true, false, true);
    }
    this.expect(TokenType.FN);
    return this.parseFn(true, false, false);
  }

  private parseAsyncFn(isPrivate: boolean, isExport: boolean): FnDeclaration {
    this.expect(TokenType.ASYNC);
    this.expect(TokenType.FN);
    return this.parseFn(isPrivate, isExport, true);
  }

  private parseFn(isPrivate: boolean, isExport: boolean, isAsync: boolean): FnDeclaration {
    const { line, col } = this.loc();
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LPAREN);
    const params: FnParam[] = [];
    while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
      const pname = this.expect(TokenType.IDENTIFIER).value;
      let ptype: NZSType | undefined;
      if (this.match(TokenType.COLON)) {
        ptype = this.parseType_();
      }
      let defaultValue;
      if (this.match(TokenType.EQUALS)) {
        defaultValue = this.parseExpression();
      }
      params.push({ name: pname, type: ptype, defaultValue });
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RPAREN);
    let returnType: NZSType | undefined;
    if (this.match(TokenType.COLON)) {
      returnType = this.parseType_();
    }
    this.expect(TokenType.LBRACE);
    const body = this.parseBlock();
    return { kind: "FnDeclaration", name, params, returnType, body, isPrivate, isExport, isAsync, line, col };
  }

  // ─── Scheduled ────────────────────────────────────────────────────────────

  private parseEvery(): EveryStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.EVERY);
    const interval = this.parseDuration();
    this.expect(TokenType.LBRACE);
    const body = this.parseBlock();
    return { kind: "EveryStatement", interval, body, line, col };
  }

  private parseAfter(): AfterStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.AFTER);
    const delay = this.parseDuration();
    this.expect(TokenType.LBRACE);
    const body = this.parseBlock();
    return { kind: "AfterStatement", delay, body, line, col };
  }

  private parseDuration(): string {
    const num = this.expect(TokenType.NUMBER).value;
    const unit = this.advance().value; // s, m, h, d
    return `${num}${unit}`;
  }

  // ─── Statements ───────────────────────────────────────────────────────────

  private parseBlock(): ASTNode[] {
    const stmts: ASTNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.match(TokenType.SEMICOLON)) continue;
      stmts.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);
    return stmts;
  }

  private parseStatement(): ASTNode {
    const t = this.peek();

    if (t.type === TokenType.CONST)    return this.parseConst();
    if (t.type === TokenType.LET)      return this.parseLet();
    if (t.type === TokenType.VAR)      return this.parseVar();
    if (t.type === TokenType.IF)       return this.parseIf();
    if (t.type === TokenType.MATCH)    return this.parseMatch();
    if (t.type === TokenType.FOR)      return this.parseFor();
    if (t.type === TokenType.WHILE)    return this.parseWhile();
    if (t.type === TokenType.TRY)      return this.parseTryCatch();
    if (t.type === TokenType.RETURN)   return this.parseReturn();
    if (t.type === TokenType.BREAK)    { this.advance(); return { kind: "BreakStatement", line: t.line, col: t.col }; }
    if (t.type === TokenType.CONTINUE) { this.advance(); return { kind: "ContinueStatement", line: t.line, col: t.col }; }
    if (t.type === TokenType.THROW)    return this.parseThrow();
    if (t.type === TokenType.EMIT)     return this.parseEmit();
    if (t.type === TokenType.WAIT)     return this.parseWait();
    if (t.type === TokenType.REPLY)    return this.parseReply();
    if (t.type === TokenType.DM)       return this.parseDm();
    if (t.type === TokenType.LOG)      return this.parseLog();
    if (t.type === TokenType.ROLE)     return this.parseRole();
    if (t.type === TokenType.REACT)    return this.parseReact();
    if (t.type === TokenType.PAGINATE) return this.parsePaginate();
    if (t.type === TokenType.MODAL)    return this.parseModal();
    if (t.type === TokenType.FN)       return this.parseFn(false, false, false);
    if (t.type === TokenType.ASYNC)    return this.parseAsyncFn(false, false);
    if (t.type === TokenType.PRIVATE)  return this.parsePrivateFn();
    if (t.type === TokenType.EVERY)    return this.parseEvery();
    if (t.type === TokenType.AFTER)    return this.parseAfter();
    if (t.type === TokenType.JS)       return this.parseJsEscape();

    // Expression or assignment
    return this.parseExpressionOrAssignment();
  }

  private parseIf(): IfStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    this.expect(TokenType.LBRACE);
    const consequent = this.parseBlock();
    const alternates: { condition: ExpressionNode; body: ASTNode[] }[] = [];
    let elseBranch: ASTNode[] | undefined;

    while (this.check(TokenType.ELSE)) {
      this.advance();
      if (this.check(TokenType.IF)) {
        this.advance();
        const cond = this.parseExpression();
        this.expect(TokenType.LBRACE);
        const body = this.parseBlock();
        alternates.push({ condition: cond, body });
      } else {
        this.expect(TokenType.LBRACE);
        elseBranch = this.parseBlock();
        break;
      }
    }

    return { kind: "IfStatement", condition, consequent, alternates, else: elseBranch, line, col };
  }

  private parseMatch(): MatchStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.MATCH);
    const value = this.parseExpression();
    this.expect(TokenType.LBRACE);
    const cases: { value: ExpressionNode; body: ASTNode[] }[] = [];
    let defaultBranch: ASTNode[] | undefined;

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.check(TokenType.CASE)) {
        this.advance();
        const cval = this.parseExpression();
        this.expect(TokenType.LBRACE);
        const body = this.parseBlock();
        cases.push({ value: cval, body });
      } else if (this.check(TokenType.DEFAULT)) {
        this.advance();
        this.expect(TokenType.LBRACE);
        defaultBranch = this.parseBlock();
      } else {
        break;
      }
    }

    this.expect(TokenType.RBRACE);
    return { kind: "MatchStatement", value, cases, default: defaultBranch, line, col };
  }

  private parseFor(): ForInStatement | ForRangeStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.FOR);

    const first = this.expect(TokenType.IDENTIFIER).value;

    // for i, item in arr
    if (this.match(TokenType.COMMA)) {
      const item = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.IN);
      const iterable = this.parseExpression();
      this.expect(TokenType.LBRACE);
      const body = this.parseBlock();
      return { kind: "ForInStatement", index: first, item, iterable, body, line, col };
    }

    // for item in arr
    if (this.match(TokenType.IN)) {
      const iterable = this.parseExpression();
      this.expect(TokenType.LBRACE);
      const body = this.parseBlock();
      return { kind: "ForInStatement", item: first, iterable, body, line, col };
    }

    // for i from X to Y
    if (this.match(TokenType.FROM)) {
      const from = this.parseExpression();
      this.expect(TokenType.TO);
      const to = this.parseExpression();
      this.expect(TokenType.LBRACE);
      const body = this.parseBlock();
      return { kind: "ForRangeStatement", variable: first, from, to, body, line, col };
    }

    throw Errors.unexpectedToken(this.peek().value, "in or from", this.file, this.peek().line, this.peek().col);
  }

  private parseWhile(): WhileStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.WHILE);
    const condition = this.parseExpression();
    this.expect(TokenType.LBRACE);
    const body = this.parseBlock();
    return { kind: "WhileStatement", condition, body, line, col };
  }

  private parseTryCatch(): TryCatchStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.TRY);
    this.expect(TokenType.LBRACE);
    const body = this.parseBlock();
    const catches: { param: string; type?: string; body: ASTNode[] }[] = [];
    let finally_: ASTNode[] | undefined;

    while (this.check(TokenType.CATCH)) {
      this.advance();
      this.expect(TokenType.LPAREN);
      const param = this.expect(TokenType.IDENTIFIER).value;
      let type: string | undefined;
      if (this.match(TokenType.COLON)) {
        type = this.advance().value;
      }
      this.expect(TokenType.RPAREN);
      this.expect(TokenType.LBRACE);
      const cbody = this.parseBlock();
      catches.push({ param, type, body: cbody });
    }

    if (this.check(TokenType.FINALLY)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      finally_ = this.parseBlock();
    }

    return { kind: "TryCatchStatement", body, catches, finally: finally_, line, col };
  }

  private parseReturn(): ReturnStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.RETURN);
    let value: ExpressionNode | undefined;
    if (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF) && !this.check(TokenType.SEMICOLON)) {
      value = this.parseExpression();
    }
    return { kind: "ReturnStatement", value, line, col };
  }

  private parseThrow(): ThrowStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.THROW);
    const value = this.parseExpression();
    return { kind: "ThrowStatement", value, line, col };
  }

  private parseEmit(): EmitStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.EMIT);
    const event = this.expect(TokenType.IDENTIFIER).value;
    const args: ExpressionNode[] = [];
    if (this.match(TokenType.LPAREN)) {
      while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
        args.push(this.parseExpression());
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RPAREN);
    }
    return { kind: "EmitStatement", event, args, line, col };
  }

  private parseWait(): WaitStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.WAIT);
    this.expect(TokenType.LPAREN);
    const duration = this.parseDuration();
    this.expect(TokenType.RPAREN);
    return { kind: "WaitStatement", duration, line, col };
  }

  private parseLog(): LogStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.LOG);
    let level: "log" | "warn" | "error" = "log";
    if (this.match(TokenType.DOT)) {
      const l = this.advance().value;
      if (l === "warn" || l === "error") level = l;
    }
    const value = this.parseExpression();
    return { kind: "LogStatement", level, value, line, col };
  }

  private parseRole(): RoleStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.ROLE);
    this.expect(TokenType.DOT);
    const action = this.advance().value as "give" | "remove" | "has";
    this.expect(TokenType.LPAREN);
    const member = this.parseExpression();
    this.expect(TokenType.COMMA);
    const role = this.parseExpression();
    this.expect(TokenType.RPAREN);
    return { kind: "RoleStatement", action, member, role, line, col };
  }

  private parseReact(): ReactStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.REACT);
    const emoji = this.parseExpression();
    return { kind: "ReactStatement", emoji, line, col };
  }

  // ─── Reply ────────────────────────────────────────────────────────────────

  private parseReply(): ReplyStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.REPLY);

    let ephemeral = false;
    let ping = false;

    if (this.check(TokenType.EPHEMERAL)) {
      this.advance();
      ephemeral = true;
    }

    // reply embed { ... }
    if (this.check(TokenType.EMBED)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      const props: { key: string; value: ExpressionNode }[] = [];
      let fields;
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        if (this.peek().value === "fields") {
          this.advance(); this.expect(TokenType.COLON);
          fields = this.parseEmbedFields();
          continue;
        }
        const k = this.advance().value;
        this.expect(TokenType.COLON);
        const v = this.parseExpression();
        props.push({ key: k, value: v });
      }
      this.expect(TokenType.RBRACE);
      const stmt: ReplyStatement = { kind: "ReplyStatement", ephemeral, ping, inlineEmbed: { properties: props, fields }, line, col };
      return this.parseReplyWith(stmt);
    }

    // reply EmbedName { overrides }  OR  reply EmbedName
    if (this.check(TokenType.IDENTIFIER) &&
        this.peek().value[0] === this.peek().value[0].toUpperCase() &&
        this.peek(1).type === TokenType.LBRACE) {
      const embedName = this.advance().value;
      this.expect(TokenType.LBRACE);
      const overrides: { key: string; value: ExpressionNode }[] = [];
      let fields;
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        if (this.peek().value === "fields") {
          this.advance(); this.expect(TokenType.COLON);
          fields = this.parseEmbedFields();
          continue;
        }
        const k = this.advance().value;
        this.expect(TokenType.COLON);
        const v = this.parseExpression();
        overrides.push({ key: k, value: v });
      }
      this.expect(TokenType.RBRACE);
      const stmt: ReplyStatement = { kind: "ReplyStatement", ephemeral, ping, embedName, overrides, fields, line, col };
      return this.parseReplyWith(stmt);
    }

    // reply EmbedName (no overrides)
    if (this.check(TokenType.IDENTIFIER) && this.peek().value[0] === this.peek().value[0].toUpperCase()) {
      const embedName = this.advance().value;
      const stmt: ReplyStatement = { kind: "ReplyStatement", ephemeral, ping, embedName, line, col };
      return this.parseReplyWith(stmt);
    }

    // reply "message"
    const message = this.parseExpression();
    const stmt: ReplyStatement = { kind: "ReplyStatement", ephemeral, ping, message, line, col };
    return this.parseReplyWith(stmt);
  }

  private parseReplyWith(stmt: ReplyStatement): ReplyStatement {
    if (!this.check(TokenType.WITH)) return stmt;
    this.advance(); // with

    // with button { ... }
    if (this.check(TokenType.BUTTON)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      stmt.button = this.parseButtonBody();
      return stmt;
    }

    // with buttons { row { ... } }
    if (this.check(TokenType.BUTTONS)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      const rows: ButtonRowNode[] = [];
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        if (this.check(TokenType.ROW)) {
          this.advance();
          this.expect(TokenType.LBRACE);
          const buttons: ButtonNode[] = [];
          while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            this.expect(TokenType.BUTTON);
            this.expect(TokenType.LBRACE);
            buttons.push(this.parseButtonBody());
          }
          this.expect(TokenType.RBRACE);
          rows.push({ buttons });
        } else {
          break;
        }
      }
      this.expect(TokenType.RBRACE);
      stmt.buttons = rows;
      return stmt;
    }

    // with select { ... }
    return stmt;
  }

  private parseButtonBody(): ButtonNode {
    let label: ExpressionNode = { kind: "Literal", value: "", raw: '""', line: 0, col: 0 };
    let style = "secondary";
    let id: ExpressionNode | undefined;
    let url: ExpressionNode | undefined;
    let disabled: ExpressionNode | undefined;
    let onClick: ASTNode[] = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.check(TokenType.ONCLICK)) {
        this.advance();
        this.expect(TokenType.LPAREN);
        // params (ctx)
        while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
          this.advance(); this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RPAREN);
        this.expect(TokenType.LBRACE);
        onClick = this.parseBlock();
        continue;
      }
      const k = this.advance().value;
      this.expect(TokenType.COLON);
      const v = this.parseExpression();
      if (k === "label") label = v;
      else if (k === "style") style = (v as Literal).value as string || "secondary";
      else if (k === "id") id = v;
      else if (k === "url") url = v;
      else if (k === "disabled") disabled = v;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE);
    return { label, style, id, url, disabled, onClick };
  }

  // ─── DM ───────────────────────────────────────────────────────────────────

  private parseDm(): DmStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.DM);
    const target = this.parseExpression();

    if (this.check(TokenType.EMBED)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      const props: { key: string; value: ExpressionNode }[] = [];
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        const k = this.advance().value;
        this.expect(TokenType.COLON);
        const v = this.parseExpression();
        props.push({ key: k, value: v });
      }
      this.expect(TokenType.RBRACE);
      return { kind: "DmStatement", target, embed: { properties: props }, line, col };
    }

    const message = this.parseExpression();
    return { kind: "DmStatement", target, message, line, col };
  }

  // ─── Paginate ─────────────────────────────────────────────────────────────

  private parsePaginate(): PaginateStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.PAGINATE);
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      // ctx parameter
      while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) this.advance();
      this.expect(TokenType.RPAREN);
    }
    this.expect(TokenType.LBRACE);
    let timeout: string | undefined;
    const pages: PaginatePage[] = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.peek().value === "timeout") {
        this.advance();
        this.expect(TokenType.COLON);
        timeout = this.parseDuration();
        continue;
      }
      if (this.check(TokenType.PAGE)) {
        this.advance();
        this.expect(TokenType.LBRACE);
        const props: { key: string; value: ExpressionNode }[] = [];
        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
          const k = this.advance().value;
          this.expect(TokenType.COLON);
          const v = this.parseExpression();
          props.push({ key: k, value: v });
        }
        this.expect(TokenType.RBRACE);
        pages.push({ properties: props });
        continue;
      }
      this.advance();
    }

    this.expect(TokenType.RBRACE);
    return { kind: "PaginateStatement", timeout, pages, line, col };
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  private parseModal(): ModalStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.MODAL);
    this.expect(TokenType.LBRACE);

    let title: ExpressionNode = { kind: "Literal", value: "", raw: '""', line, col };
    let id: ExpressionNode = { kind: "Literal", value: "", raw: '""', line, col };
    const inputs: { label: ExpressionNode; placeholder?: ExpressionNode; required?: boolean; id: ExpressionNode }[] = [];
    let onSubmitParams: string[] = [];
    let onSubmitBody: ASTNode[] = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.check(TokenType.INPUT)) {
        this.advance();
        this.expect(TokenType.LBRACE);
        let ilabel: ExpressionNode = { kind: "Literal", value: "", raw: '""', line, col };
        let iplaceholder: ExpressionNode | undefined;
        let irequired = false;
        let iid: ExpressionNode = { kind: "Literal", value: "", raw: '""', line, col };
        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
          const k = this.advance().value;
          this.expect(TokenType.COLON);
          if (k === "label") ilabel = this.parseExpression();
          else if (k === "placeholder") iplaceholder = this.parseExpression();
          else if (k === "required") { const v = this.advance(); irequired = v.value === "true"; }
          else if (k === "id") iid = this.parseExpression();
          else this.parseExpression();
        }
        this.expect(TokenType.RBRACE);
        inputs.push({ label: ilabel, placeholder: iplaceholder, required: irequired, id: iid });
        continue;
      }

      if (this.check(TokenType.ONSUBMIT)) {
        this.advance();
        this.expect(TokenType.LPAREN);
        while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
          onSubmitParams.push(this.advance().value);
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RPAREN);
        this.expect(TokenType.LBRACE);
        onSubmitBody = this.parseBlock();
        continue;
      }

      const k = this.advance().value;
      this.expect(TokenType.COLON);
      const v = this.parseExpression();
      if (k === "title") title = v;
      else if (k === "id") id = v;
    }

    this.expect(TokenType.RBRACE);
    return { kind: "ModalStatement", title, id, inputs, onSubmitParams, onSubmitBody, line, col };
  }

  // ─── JS Escape ────────────────────────────────────────────────────────────

  private parseJsEscape(): JsEscapeStatement {
    const { line, col } = this.loc();
    this.expect(TokenType.JS);
    this.expect(TokenType.LBRACE);
    let code = "";
    let depth = 1;
    while (this.pos < this.tokens.length && depth > 0) {
      const t = this.tokens[this.pos];
      if (t.type === TokenType.LBRACE) { depth++; code += "{"; this.pos++; }
      else if (t.type === TokenType.RBRACE) { depth--; if (depth > 0) code += "}"; this.pos++; }
      else if (t.type === TokenType.EOF) break;
      else { code += t.value + " "; this.pos++; }
    }
    return { kind: "JsEscapeStatement", code: code.trim(), line, col };
  }

  // ─── Expression / Assignment ──────────────────────────────────────────────

  private parseExpressionOrAssignment(): ASTNode {
    const { line, col } = this.loc();
    const expr = this.parseExpression();

    const assignOps = [
      TokenType.EQUALS, TokenType.PLUS_EQ, TokenType.MINUS_EQ,
      TokenType.STAR_EQ, TokenType.SLASH_EQ, TokenType.STAR_STAR_EQ,
      TokenType.NULLISH_EQ
    ];

    if (this.check(...assignOps)) {
      const op = this.advance().value;
      const value = this.parseExpression();
      return { kind: "AssignStatement", target: expr, operator: op, value, line, col };
    }

    return { kind: "ExpressionStatement", expression: expr, line, col };
  }

  // ─── Expressions ──────────────────────────────────────────────────────────

  parseExpression(): ExpressionNode {
    return this.parseTernary();
  }

  private parseTernary(): ExpressionNode {
    let left = this.parseNullCoalesce();
    if (this.match(TokenType.QUESTION)) {
      const consequent = this.parseExpression();
      this.expect(TokenType.COLON);
      const alternate = this.parseExpression();
      return { kind: "TernaryExpression", condition: left, consequent, alternate, line: left.line, col: left.col };
    }
    return left;
  }

  private parseNullCoalesce(): ExpressionNode {
    let left = this.parseOr();
    while (this.check(TokenType.NULL_COAL)) {
      this.advance();
      const right = this.parseOr();
      left = { kind: "NullCoalesce", left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.check(TokenType.OR)) {
      const op = this.advance().value;
      const right = this.parseAnd();
      left = { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseEquality();
    while (this.check(TokenType.AND)) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseIs();
    while (this.check(TokenType.EQ_EQ, TokenType.BANG_EQ)) {
      const op = this.advance().value;
      const right = this.parseIs();
      left = { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseIs(): ExpressionNode {
    let left = this.parseComparison();
    while (this.check(TokenType.IS)) {
      this.advance();
      let negated = false;
      if (this.check(TokenType.BANG)) { this.advance(); negated = true; }
      const checkType = this.advance().value;
      left = { kind: "IsExpression", value: left, negated, checkType, line: left.line, col: left.col };
    }
    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAddSub();
    while (this.check(TokenType.GT, TokenType.LT, TokenType.GT_EQ, TokenType.LT_EQ)) {
      const op = this.advance().value;
      const right = this.parseAddSub();
      left = { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseAddSub(): ExpressionNode {
    let left = this.parseMulDiv();
    while (this.check(TokenType.PLUS, TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.parseMulDiv();
      left = { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseMulDiv(): ExpressionNode {
    let left = this.parsePower();
    while (this.check(TokenType.STAR, TokenType.DIV, TokenType.PERCENT)) {
      const op = this.advance().value;
      const right = this.parsePower();
      left = { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parsePower(): ExpressionNode {
    let left = this.parseUnary();
    if (this.check(TokenType.STAR_STAR)) {
      const op = this.advance().value;
      const right = this.parsePower(); // right-associative
      return { kind: "BinaryExpression", operator: op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (this.check(TokenType.BANG)) {
      const t = this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpression", operator: "!", operand, line: t.line, col: t.col };
    }
    if (this.check(TokenType.MINUS)) {
      const t = this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpression", operator: "-", operand, line: t.line, col: t.col };
    }
    if (this.check(TokenType.AWAIT)) {
      const t = this.advance();
      const expr = this.parseCallChain() as CallExpression;
      return { ...expr, await: true };
    }
    return this.parseCallChain();
  }

  private parseCallChain(): ExpressionNode {
    let expr = this.parsePrimary();

    while (true) {
      // Optional chaining ?.
      if (this.check(TokenType.DOT) && this.peek().value === "?.") {
        this.advance();
        const prop = this.advance().value;
        expr = { kind: "MemberExpression", object: expr, property: prop, optional: true, line: expr.line, col: expr.col };
        continue;
      }

      // Regular member access .
      if (this.check(TokenType.DOT)) {
        this.advance();
        const prop = this.advance().value;
        expr = { kind: "MemberExpression", object: expr, property: prop, optional: false, line: expr.line, col: expr.col };
        continue;
      }

      // Index access []
      if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = { kind: "IndexExpression", object: expr, index, line: expr.line, col: expr.col };
        continue;
      }

      // Call ()
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args: ExpressionNode[] = [];
        while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
          args.push(this.parseExpression());
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RPAREN);
        expr = { kind: "CallExpression", callee: expr, args, await: false, line: expr.line, col: expr.col };
        continue;
      }

      break;
    }

    return expr;
  }

  private parsePrimary(): ExpressionNode {
    const t = this.peek();

    // Literals
    if (t.type === TokenType.NUMBER) {
      this.advance();
      return { kind: "Literal", value: Number(t.value), raw: t.value, line: t.line, col: t.col };
    }
    if (t.type === TokenType.BOOLEAN) {
      this.advance();
      return { kind: "Literal", value: t.value === "true", raw: t.value, line: t.line, col: t.col };
    }
    if (t.type === TokenType.NULL) {
      this.advance();
      return { kind: "Literal", value: null, raw: "null", line: t.line, col: t.col };
    }
    if (t.type === TokenType.STRING) {
      this.advance();
      return this.parseStringInterpolation(t.value, t.line, t.col);
    }

    // Array
    if (t.type === TokenType.LBRACKET) {
      this.advance();
      const elements: ExpressionNode[] = [];
      while (!this.check(TokenType.RBRACKET) && !this.check(TokenType.EOF)) {
        elements.push(this.parseExpression());
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACKET);
      return { kind: "ArrayLiteral", elements, line: t.line, col: t.col };
    }

    // Map/Object
    if (t.type === TokenType.LBRACE) {
      return this.parseMapLiteral();
    }

    // Grouped
    if (t.type === TokenType.LPAREN) {
      this.advance();

      // Arrow function detection: (params) =>
      const saved = this.pos;
      let isArrow = false;
      try {
        const params: string[] = [];
        while (!this.check(TokenType.RPAREN) && !this.check(TokenType.EOF)) {
          if (!this.check(TokenType.IDENTIFIER)) { isArrow = false; break; }
          params.push(this.advance().value);
          this.match(TokenType.COMMA);
        }
        if (this.check(TokenType.RPAREN)) {
          this.advance();
          if (this.check(TokenType.ARROW)) {
            isArrow = true;
            this.advance();
            const body = this.parseExpression();
            const fnParams: import("./types").FnParam[] = params.map(p => ({ name: p }));
            return { kind: "ArrowFunction", params: fnParams, body, line: t.line, col: t.col };
          }
        }
      } catch {
        isArrow = false;
      }
      if (!isArrow) {
        this.pos = saved;
        const expr = this.parseExpression();
        this.expect(TokenType.RPAREN);
        return expr;
      }
    }

    // @everyone, @mod, etc.
    if (t.type === TokenType.AT) {
      this.advance();
      const name = this.advance().value;
      return { kind: "Identifier", name: `@${name}`, line: t.line, col: t.col };
    }

    // env.TOKEN shorthand
    if (t.type === TokenType.IDENTIFIER && t.value === "env") {
      this.advance();
      this.expect(TokenType.DOT);
      const key = this.advance().value;
      return { kind: "MemberExpression", object: { kind: "Identifier", name: "env", line: t.line, col: t.col }, property: key, optional: false, line: t.line, col: t.col };
    }

    // Type instantiation: Kingdom { name: "x" }
    if (t.type === TokenType.IDENTIFIER &&
        this.peek(1).type === TokenType.LBRACE &&
        t.value[0] === t.value[0].toUpperCase() &&
        t.value[0] !== t.value[0].toLowerCase()) {
      this.advance();
      this.expect(TokenType.LBRACE);
      const fields: { key: string; value: ExpressionNode }[] = [];
      while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
        const k = this.advance().value;
        this.expect(TokenType.COLON);
        const v = this.parseExpression();
        fields.push({ key: k, value: v });
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACE);
      return { kind: "TypeInstantiation", typeName: t.value, fields, line: t.line, col: t.col };
    }

    // Single-param arrow: x => expr
    if (t.type === TokenType.IDENTIFIER && this.peek(1).type === TokenType.ARROW) {
      this.advance();
      this.advance(); // =>
      const body = this.parseExpression();
      return { kind: "ArrowFunction", params: [{ name: t.value }], body, line: t.line, col: t.col };
    }

    // Identifier
    if (t.type === TokenType.IDENTIFIER) {
      this.advance();
      return { kind: "Identifier", name: t.value, line: t.line, col: t.col };
    }

    // Keywords used as identifiers in expressions (ctx, Math, etc.)
    const keywordAsIdent = [
      TokenType.INT, TokenType.FLOAT, TokenType.STR, TokenType.BOOL,
      TokenType.LOG, TokenType.ROLE, TokenType.DM, TokenType.EMIT,
    ];
    if (keywordAsIdent.includes(t.type)) {
      this.advance();
      return { kind: "Identifier", name: t.value, line: t.line, col: t.col };
    }

    throw Errors.unexpectedToken(t.value || t.type, "expression", this.file, t.line, t.col);
  }

  private parseMapLiteral(): MapLiteral {
    const t = this.peek();
    this.expect(TokenType.LBRACE);
    const entries: { key: ExpressionNode; value: ExpressionNode }[] = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const key = this.parseExpression();
      this.expect(TokenType.COLON);
      const value = this.parseExpression();
      entries.push({ key, value });
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE);
    return { kind: "MapLiteral", entries, line: t.line, col: t.col };
  }

  // Parse string interpolation: "Hello {name}" → TemplateLiteral
  private parseStringInterpolation(raw: string, line: number, col: number): ExpressionNode {
    // Check if any {} interpolation exists
    if (!raw.includes("{")) {
      return { kind: "Literal", value: raw, raw: JSON.stringify(raw), line, col };
    }

    const parts: Array<{ text: string } | { expr: ExpressionNode; format?: string }> = [];
    let i = 0;
    let text = "";

    while (i < raw.length) {
      if (raw[i] === "{" && raw[i + 1] !== "{") {
        if (text) { parts.push({ text }); text = ""; }
        i++; // skip {
        let inner = "";
        while (i < raw.length && raw[i] !== "}") {
          inner += raw[i++];
        }
        i++; // skip }

        // Handle format specifier: {value:,} {value:.2f}
        let format: string | undefined;
        const colonIdx = inner.lastIndexOf(":");
        if (colonIdx > 0) {
          format = inner.slice(colonIdx + 1);
          inner = inner.slice(0, colonIdx);
        }

        // Parse the inner expression using a sub-lexer
        const { Lexer } = require("./lexer");
        const subTokens = new Lexer(inner.trim(), this.file).tokenize();
        const subParser = new Parser(subTokens, this.file);
        const expr = subParser.parseExpression();
        parts.push({ expr, format });
      } else if (raw[i] === "{" && raw[i + 1] === "{") {
        text += "{"; i += 2;
      } else {
        text += raw[i++];
      }
    }

    if (text) parts.push({ text });

    return { kind: "TemplateLiteral", parts, line, col };
  }
}
