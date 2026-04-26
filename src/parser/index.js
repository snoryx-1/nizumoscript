"use strict";

const { TokenType } = require("../lexer/index.js");

class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.SEMICOLON);
    this.pos = 0;
  }

  current()        { return this.tokens[this.pos]; }
  peek(o = 1)      { return this.tokens[this.pos + o]; }
  isEnd()          { return this.current().type === TokenType.EOF; }
  advance()        { return this.tokens[this.pos++]; }

  check(type)      { return this.current().type === type; }
  match(...types)  { if (types.includes(this.current().type)) { return this.advance(); } return null; }

  expect(type, msg) {
    if (this.current().type !== type) {
      throw new Error(`[NizumoScript] Line ${this.current().line}: ${msg || `Expected ${type} but got "${this.current().value}"`}`);
    }
    return this.advance();
  }

  // ─── Primitives ──────────────────────────────────────────────────────────────

  parseString() {
    if (this.check(TokenType.STRING)) return { type: "string", value: this.advance().value };
    throw new Error(`[NizumoScript] Line ${this.current().line}: Expected a string`);
  }

  parseValue() {
    const tok = this.current();
    if (tok.type === TokenType.STRING)   return { type: "string",   value: this.advance().value };
    if (tok.type === TokenType.NUMBER)   return { type: "number",   value: parseFloat(this.advance().value) };
    if (tok.type === TokenType.DURATION) return { type: "duration", value: this.advance().value };
    if (tok.type === TokenType.BOOLEAN)  return { type: "boolean",  value: this.advance().value === "true" };
    if (tok.type === TokenType.NULL)     return { type: "null",     value: null };
    if (tok.type === TokenType.LBRACKET) return this.parseArray();
    // expression fallback
    return this.parseExpr();
  }

  parseArray() {
    this.expect(TokenType.LBRACKET);
    const items = [];
    while (!this.check(TokenType.RBRACKET) && !this.isEnd()) {
      items.push(this.parseValue());
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACKET);
    return { type: "array", value: items };
  }

  // ─── Expressions ─────────────────────────────────────────────────────────────

  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.check(TokenType.OR)) {
      this.advance();
      left = { type: "binary", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseComparison();
    while (this.check(TokenType.AND)) {
      this.advance();
      left = { type: "binary", op: "and", left, right: this.parseComparison() };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAddSub();
    const ops = [TokenType.EQ_EQ, TokenType.NEQ, TokenType.GT, TokenType.LT, TokenType.GTE, TokenType.LTE, TokenType.CONTAINS];
    while (ops.includes(this.current().type)) {
      const op = this.advance().value;
      left = { type: "binary", op, left, right: this.parseAddSub() };
    }
    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      left = { type: "binary", op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();
    while (this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.PERCENT)) {
      const op = this.advance().value;
      left = { type: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.check(TokenType.NOT)) { this.advance(); return { type: "unary", op: "not", expr: this.parsePrimary() }; }
    if (this.check(TokenType.MINUS)) { this.advance(); return { type: "unary", op: "-", expr: this.parsePrimary() }; }
    return this.parseCall();
  }

  parseCall() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.check(TokenType.DOT)) {
        this.advance();
        const prop = this.expect(TokenType.IDENTIFIER, "Expected property name after '.'").value;
        if (this.check(TokenType.LPAREN)) {
          this.advance();
          const args = [];
          while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
            args.push(this.parseExpr());
            this.match(TokenType.COMMA);
          }
          this.expect(TokenType.RPAREN);
          expr = { type: "method_call", object: expr, method: prop, args };
        } else {
          expr = { type: "member", object: expr, property: prop };
        }
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const index = this.parseExpr();
        this.expect(TokenType.RBRACKET);
        expr = { type: "index", object: expr, index };
      } else {
        break;
      }
    }
    return expr;
  }

  parsePrimary() {
    const tok = this.current();
    if (tok.type === TokenType.STRING)   return { type: "string",   value: this.advance().value };
    if (tok.type === TokenType.NUMBER)   return { type: "number",   value: parseFloat(this.advance().value) };
    if (tok.type === TokenType.DURATION) return { type: "duration", value: this.advance().value };
    if (tok.type === TokenType.BOOLEAN)  return { type: "boolean",  value: this.advance().value === "true" };
    if (tok.type === TokenType.NULL)     return { type: "null",     value: null };
    if (tok.type === TokenType.LBRACKET) return this.parseArray();

    if (tok.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    if (tok.type === TokenType.IDENTIFIER) {
      const name = this.advance().value;
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args = [];
        while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
          args.push(this.parseExpr());
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RPAREN);
        return { type: "call", name, args };
      }
      return { type: "identifier", name };
    }

    // allow keywords used as identifiers (e.g. member.name, ctx.args.user)
    if (tok.type !== TokenType.EOF && tok.type !== TokenType.LBRACE && tok.type !== TokenType.RBRACE) {
      const val = this.advance().value;
      return { type: "identifier", name: val };
    }

    throw new Error(`[NizumoScript] Line ${tok.line}: Unexpected token "${tok.value}"`);
  }

  // ─── Statements ──────────────────────────────────────────────────────────────

  parseBlock() {
    this.expect(TokenType.LBRACE);
    const stmts = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      stmts.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);
    return stmts;
  }

  parseStatement() {
    const tok = this.current();

    if (tok.type === TokenType.REPLY)          return this.parseReply();
    if (tok.type === TokenType.SEND)           return this.parseSend();
    if (tok.type === TokenType.DM)             return this.parseDm();
    if (tok.type === TokenType.EMBED)          return this.parseEmbedStmt();
    if (tok.type === TokenType.BAN)            return this.parseBan();
    if (tok.type === TokenType.KICK)           return this.parseKick();
    if (tok.type === TokenType.TIMEOUT)        return this.parseTimeout();
    if (tok.type === TokenType.GIVE_ROLE)      return this.parseGiveRole();
    if (tok.type === TokenType.REMOVE_ROLE)    return this.parseRemoveRole();
    if (tok.type === TokenType.DELETE_MESSAGE) return this.parseDeleteMsg();
    if (tok.type === TokenType.WAIT)           return this.parseWait();
    if (tok.type === TokenType.LOG)            return this.parseLog();
    if (tok.type === TokenType.BUTTON)         return this.parseButton();
    if (tok.type === TokenType.SELECT)         return this.parseSelect();
    if (tok.type === TokenType.ADD_REACTION)   return this.parseAddReaction();
    if (tok.type === TokenType.IF)             return this.parseIf();
    if (tok.type === TokenType.WHILE)          return this.parseWhile();
    if (tok.type === TokenType.FOR)            return this.parseFor();
    if (tok.type === TokenType.REPEAT)         return this.parseRepeat();
    if (tok.type === TokenType.BREAK)          { this.advance(); return { type: "Break" }; }
    if (tok.type === TokenType.RETURN)         return this.parseReturn();
    if (tok.type === TokenType.VAR)            return this.parseVar();
    if (tok.type === TokenType.SET)            return this.parseSet();
    if (tok.type === TokenType.FUNC)           return this.parseFunc();

    // expression statement (function calls, etc.)
    const expr = this.parseExpr();
    return { type: "ExprStatement", expr };
  }

  parseReply() {
    this.expect(TokenType.REPLY);
    const value = this.parseExpr();
    return { type: "Reply", value };
  }

  parseSend() {
    this.expect(TokenType.SEND);
    // send channel "name" "message"  OR  send dm @user "msg"  OR  send "msg"
    if (this.check(TokenType.IDENTIFIER) && this.current().value === "channel") {
      this.advance();
      const channel = this.parseExpr();
      const message = this.parseExpr();
      return { type: "SendChannel", channel, message };
    }
    const value = this.parseExpr();
    return { type: "Send", value };
  }

  parseDm() {
    this.expect(TokenType.DM);
    const target = this.parseExpr();
    const message = this.parseExpr();
    return { type: "Dm", target, message };
  }

  parseEmbedStmt() {
    this.expect(TokenType.EMBED);
    const name = this.check(TokenType.IDENTIFIER) ? this.advance().value : "embed";
    this.expect(TokenType.LBRACE);
    const props = {};
    const fields = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const key = this.current();
      if (key.type === TokenType.TITLE)     { this.advance(); props.title = this.parseExpr(); }
      else if (key.type === TokenType.COLOR)     { this.advance(); props.color = this.parseExpr(); }
      else if (key.type === TokenType.FOOTER)    { this.advance(); props.footer = this.parseExpr(); }
      else if (key.type === TokenType.IMAGE)     { this.advance(); props.image = this.parseExpr(); }
      else if (key.type === TokenType.THUMBNAIL) { this.advance(); props.thumbnail = this.parseExpr(); }
      else if (key.type === TokenType.FIELD) {
        this.advance();
        const fieldName = this.parseExpr();
        const fieldValue = this.parseExpr();
        fields.push({ name: fieldName, value: fieldValue });
      } else {
        // description
        props.description = this.parseExpr();
      }
    }
    this.expect(TokenType.RBRACE);
    return { type: "EmbedSend", name, props, fields };
  }

  parseBan() {
    this.expect(TokenType.BAN);
    const target = this.parseExpr();
    let reason = null;
    if (this.check(TokenType.STRING) || this.check(TokenType.IDENTIFIER)) {
      reason = this.parseExpr();
    }
    return { type: "Ban", target, reason };
  }

  parseKick() {
    this.expect(TokenType.KICK);
    const target = this.parseExpr();
    let reason = null;
    if (this.check(TokenType.STRING) || this.check(TokenType.IDENTIFIER)) {
      reason = this.parseExpr();
    }
    return { type: "Kick", target, reason };
  }

  parseTimeout() {
    this.expect(TokenType.TIMEOUT);
    const target = this.parseExpr();
    const duration = this.parseExpr();
    return { type: "Timeout", target, duration };
  }

  parseGiveRole() {
    this.expect(TokenType.GIVE_ROLE);
    const target = this.parseExpr();
    const role = this.parseExpr();
    return { type: "GiveRole", target, role };
  }

  parseRemoveRole() {
    this.expect(TokenType.REMOVE_ROLE);
    const target = this.parseExpr();
    const role = this.parseExpr();
    return { type: "RemoveRole", target, role };
  }

  parseDeleteMsg() {
    this.expect(TokenType.DELETE_MESSAGE);
    return { type: "DeleteMessage" };
  }

  parseWait() {
    this.expect(TokenType.WAIT);
    const duration = this.parseExpr();
    return { type: "Wait", duration };
  }

  parseLog() {
    this.expect(TokenType.LOG);
    const value = this.parseExpr();
    return { type: "Log", value };
  }

  parseButton() {
    this.expect(TokenType.BUTTON);
    const label = this.parseExpr();
    const style = this.check(TokenType.IDENTIFIER) ? this.advance().value : "primary";
    const body  = this.parseBlock();
    return { type: "Button", label, style, body };
  }

  parseSelect() {
    this.expect(TokenType.SELECT);
    const placeholder = this.parseExpr();
    this.expect(TokenType.LBRACE);
    const options = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      if (this.current().type === TokenType.OPTION) {
        this.advance();
        const label = this.parseExpr();
        const value = this.check(TokenType.STRING) ? this.parseExpr() : label;
        const body  = this.parseBlock();
        options.push({ label, value, body });
      } else { this.advance(); }
    }
    this.expect(TokenType.RBRACE);
    return { type: "Select", placeholder, options };
  }

  parseAddReaction() {
    this.expect(TokenType.ADD_REACTION);
    const emoji = this.parseExpr();
    let body = null;
    if (this.check(TokenType.LBRACE)) body = this.parseBlock();
    return { type: "AddReaction", emoji, body };
  }

  parseIf() {
    this.expect(TokenType.IF);
    const condition = this.parseExpr();
    const body = this.parseBlock();
    let elseBody = null;
    if (this.check(TokenType.ELIF)) {
      elseBody = [this.parseIf()];
    } else if (this.check(TokenType.ELSE)) {
      this.advance();
      elseBody = this.parseBlock();
    }
    return { type: "If", condition, body, elseBody };
  }

  parseWhile() {
    this.expect(TokenType.WHILE);
    const condition = this.parseExpr();
    const body = this.parseBlock();
    return { type: "While", condition, body };
  }

  parseFor() {
    this.expect(TokenType.FOR);
    this.match(TokenType.EACH);
    const item = this.expect(TokenType.IDENTIFIER, "Expected variable name in for loop").value;
    let index = null;
    if (this.check(TokenType.COMMA)) {
      this.advance();
      index = this.expect(TokenType.IDENTIFIER, "Expected index variable").value;
    }
    this.expect(TokenType.IN);
    const iterable = this.parseExpr();
    const body = this.parseBlock();
    return { type: "ForEach", item, index, iterable, body };
  }

  parseRepeat() {
    this.expect(TokenType.REPEAT);
    const count = this.parseExpr();
    this.match(TokenType.TIMES);
    const body = this.parseBlock();
    return { type: "Repeat", count, body };
  }

  parseReturn() {
    this.expect(TokenType.RETURN);
    const value = this.parseExpr();
    return { type: "Return", value };
  }

  parseVar() {
    this.expect(TokenType.VAR);
    const name = this.expect(TokenType.IDENTIFIER, "Expected variable name").value;
    this.expect(TokenType.EQUALS, "Expected = after variable name");
    const value = this.parseExpr();
    return { type: "VarDecl", name, value };
  }

  parseSet() {
    this.expect(TokenType.SET);
    const name = this.parseExpr(); // supports member access like player.hp
    const opTok = this.current();
    let op = "=";
    if ([TokenType.EQUALS, TokenType.PLUS_EQ, TokenType.MINUS_EQ, TokenType.STAR_EQ, TokenType.SLASH_EQ].includes(opTok.type)) {
      op = this.advance().value;
    }
    const value = this.parseExpr();
    return { type: "VarSet", name, op, value };
  }

  parseFunc() {
    this.expect(TokenType.FUNC);
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    this.expect(TokenType.LPAREN);
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
      params.push(this.expect(TokenType.IDENTIFIER, "Expected parameter name").value);
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RPAREN);
    const body = this.parseBlock();
    return { type: "FuncDecl", name, params, body };
  }

  // ─── Top-level ───────────────────────────────────────────────────────────────

  parseBot() {
    this.expect(TokenType.BOT);
    const name = this.check(TokenType.STRING)
      ? this.advance().value
      : (this.check(TokenType.IDENTIFIER) ? this.advance().value : "NizumoBot");
    this.expect(TokenType.LBRACE);
    const props = {};
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const key = this.current();
      if (key.type === TokenType.TOKEN)   { this.advance(); props.token   = this.parseExpr(); }
      else if (key.type === TokenType.PREFIX)  {
        this.advance();
        // prefix can be a single string or array or block with global/fallback/mention
        if (this.check(TokenType.LBRACE)) {
          this.advance();
          props.prefix = { type: "prefix_config", global: null, fallback: null, mention: false, caseSensitive: false };
          while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
            const pk = this.current().value;
            this.advance();
            if (pk === "global")        { props.prefix.global        = this.parseExpr(); }
            else if (pk === "fallback") { props.prefix.fallback       = this.parseExpr(); }
            else if (pk === "mention")  { props.prefix.mention        = this.parseExpr(); }
            else if (pk === "caseSensitive") { props.prefix.caseSensitive = this.parseExpr(); }
            else { this.parseExpr(); }
          }
          this.expect(TokenType.RBRACE);
        } else if (this.check(TokenType.LBRACKET)) {
          props.prefix = this.parseArray();
        } else {
          props.prefix = this.parseExpr();
        }
      }
      else if (key.type === TokenType.STATUS)  { this.advance(); props.status  = this.parseExpr(); }
      else if (key.type === TokenType.INTENTS) { this.advance(); props.intents = this.parseArray(); }
      else { this.advance(); } // skip unknown
    }
    this.expect(TokenType.RBRACE);
    return { type: "BotDef", name, props };
  }

  parseCommand() {
    this.expect(TokenType.COMMAND);
    // name can be /ping or ping
    this.match(TokenType.SLASH);
    const name = this.check(TokenType.STRING)
      ? this.advance().value
      : this.expect(TokenType.IDENTIFIER, "Expected command name").value;

    this.expect(TokenType.LBRACE);
    const props = {};
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const tok = this.current();
      if (tok.type === TokenType.DESCRIPTION) { this.advance(); props.description = this.parseExpr(); }
      else if (tok.type === TokenType.ACCESS)      { this.advance(); props.access      = this.parseExpr(); }
      else if (tok.type === TokenType.COOLDOWN)    { this.advance(); props.cooldown    = this.parseExpr(); }
      else if (tok.type === TokenType.ALIASES)     { this.advance(); props.aliases     = this.parseArray(); }
      else if (tok.type === TokenType.ARGS)        { this.advance(); props.args        = this.parseArray(); }
      else if (tok.type === TokenType.CATEGORY)    { this.advance(); props.category    = this.parseExpr(); }
      else if (tok.type === TokenType.ERROR)       { this.advance(); props.error       = this.parseExpr(); }
      else if (tok.type === TokenType.SLASH)       { this.advance(); props.slash       = true; }
      else if (tok.type === TokenType.PREFIX)      { this.advance(); props.prefix      = this.check(TokenType.LBRACKET) ? this.parseArray() : this.parseExpr(); }
      else if (tok.type === TokenType.REACTION)    { this.advance(); props.reaction    = this.parseExpr(); const rb = this.parseBlock(); body.push({ type: "ReactionHandler", emoji: props.reaction, body: rb }); }
      else { body.push(this.parseStatement()); }
    }
    this.expect(TokenType.RBRACE);
    return { type: "CommandDef", name, props, body };
  }

  parseEvent() {
    this.expect(TokenType.ON);
    const eventName = this.expect(TokenType.IDENTIFIER, "Expected event name").value;
    const body = this.parseBlock();
    return { type: "EventDef", eventName, body };
  }

  parseTask() {
    this.expect(TokenType.TASK);
    const name = this.check(TokenType.STRING)
      ? this.advance().value
      : this.expect(TokenType.IDENTIFIER, "Expected task name").value;
    this.expect(TokenType.LBRACE);
    let interval = null;
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const tok = this.current();
      if (tok.type === TokenType.EVERY) { this.advance(); interval = this.parseExpr(); }
      else { body.push(this.parseStatement()); }
    }
    this.expect(TokenType.RBRACE);
    return { type: "TaskDef", name, interval, body };
  }

  parseImport() {
    this.expect(TokenType.IMPORT);
    const name = this.expect(TokenType.IDENTIFIER, "Expected module name").value;
    return { type: "Import", name };
  }

  parse() {
    const program = { type: "Program", body: [] };
    while (!this.isEnd()) {
      const tok = this.current();
      if (tok.type === TokenType.BOT)     { program.body.push(this.parseBot());     continue; }
      if (tok.type === TokenType.COMMAND) { program.body.push(this.parseCommand()); continue; }
      if (tok.type === TokenType.ON)      { program.body.push(this.parseEvent());   continue; }
      if (tok.type === TokenType.TASK)    { program.body.push(this.parseTask());    continue; }
      if (tok.type === TokenType.IMPORT)  { program.body.push(this.parseImport());  continue; }
      if (tok.type === TokenType.FUNC)    { program.body.push(this.parseFunc());    continue; }
      throw new Error(`[NizumoScript] Line ${tok.line}: Unexpected top-level token "${tok.value}"`);
    }
    return program;
  }
}

module.exports = { Parser };
