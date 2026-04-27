"use strict";

const { TokenType } = require("../lexer/index.js");

class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.SEMICOLON);
    this.pos = 0;
  }
  current()       { return this.tokens[this.pos]; }
  peek(o = 1)     { return this.tokens[this.pos + o]; }
  isEnd()         { return this.current().type === TokenType.EOF; }
  advance()       { return this.tokens[this.pos++]; }
  check(type)     { return this.current().type === type; }
  match(...types) { if (types.includes(this.current().type)) return this.advance(); return null; }
  expect(type, msg) {
    if (this.current().type !== type)
      throw new Error("[NizumoScript] Line " + this.current().line + ": " + (msg || "Expected " + type + " but got \"" + this.current().value + "\""));
    return this.advance();
  }

  parseValue() {
    const tok = this.current();
    if (tok.type === TokenType.STRING)   return { type: "string",   value: this.advance().value };
    if (tok.type === TokenType.NUMBER)   return { type: "number",   value: parseFloat(this.advance().value) };
    if (tok.type === TokenType.DURATION) return { type: "duration", value: this.advance().value };
    if (tok.type === TokenType.BOOLEAN)  return { type: "boolean",  value: this.advance().value === "true" };
    if (tok.type === TokenType.NULL)     return { type: "null",     value: null };
    if (tok.type === TokenType.LBRACKET) return this.parseArray();
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

  // ── Expressions ──────────────────────────────────────────────────────────────
  parseExpr()       { return this.parseOr(); }
  parseOr() {
    let l = this.parseAnd();
    while (this.check(TokenType.OR)) { this.advance(); l = { type:"binary", op:"or", left:l, right:this.parseAnd() }; }
    return l;
  }
  parseAnd() {
    let l = this.parseComparison();
    while (this.check(TokenType.AND)) { this.advance(); l = { type:"binary", op:"and", left:l, right:this.parseComparison() }; }
    return l;
  }
  parseComparison() {
    let l = this.parseAddSub();
    const ops = [TokenType.EQ_EQ,TokenType.NEQ,TokenType.GT,TokenType.LT,TokenType.GTE,TokenType.LTE,TokenType.CONTAINS];
    while (ops.includes(this.current().type)) {
      const op = this.advance().value;
      l = { type:"binary", op, left:l, right:this.parseAddSub() };
    }
    return l;
  }
  parseAddSub() {
    let l = this.parseMulDiv();
    while (this.check(TokenType.PLUS)||this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      l = { type:"binary", op, left:l, right:this.parseMulDiv() };
    }
    return l;
  }
  parseMulDiv() {
    let l = this.parseUnary();
    while (this.check(TokenType.STAR)||this.check(TokenType.FSLASH)||this.check(TokenType.PERCENT)) {
      const op = this.advance().value;
      l = { type:"binary", op, left:l, right:this.parseUnary() };
    }
    return l;
  }
  parseUnary() {
    if (this.check(TokenType.NOT))   { this.advance(); return { type:"unary", op:"not", expr:this.parsePrimary() }; }
    if (this.check(TokenType.MINUS)) { this.advance(); return { type:"unary", op:"-",   expr:this.parsePrimary() }; }
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
          while (!this.check(TokenType.RPAREN) && !this.isEnd()) { args.push(this.parseExpr()); this.match(TokenType.COMMA); }
          this.expect(TokenType.RPAREN);
          expr = { type:"method_call", object:expr, method:prop, args };
        } else {
          expr = { type:"member", object:expr, property:prop };
        }
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const idx = this.parseExpr();
        this.expect(TokenType.RBRACKET);
        expr = { type:"index", object:expr, index:idx };
      } else break;
    }
    return expr;
  }
  parsePrimary() {
    const tok = this.current();
    if (tok.type === TokenType.STRING)   return { type:"string",   value:this.advance().value };
    if (tok.type === TokenType.NUMBER)   return { type:"number",   value:parseFloat(this.advance().value) };
    if (tok.type === TokenType.DURATION) return { type:"duration", value:this.advance().value };
    if (tok.type === TokenType.BOOLEAN)  return { type:"boolean",  value:this.advance().value==="true" };
    if (tok.type === TokenType.NULL)     { this.advance(); return { type:"null", value:null }; }
    if (tok.type === TokenType.LBRACKET) return this.parseArray();
    if (tok.type === TokenType.LPAREN) {
      this.advance();
      const e = this.parseExpr();
      this.expect(TokenType.RPAREN);
      return e;
    }
    if (tok.type === TokenType.IDENTIFIER) {
      const name = this.advance().value;
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args = [];
        while (!this.check(TokenType.RPAREN) && !this.isEnd()) { args.push(this.parseExpr()); this.match(TokenType.COMMA); }
        this.expect(TokenType.RPAREN);
        return { type:"call", name, args };
      }
      return { type:"identifier", name };
    }
    if (tok.type !== TokenType.EOF && tok.type !== TokenType.LBRACE && tok.type !== TokenType.RBRACE) {
      return { type:"identifier", name:this.advance().value };
    }
    throw new Error("[NizumoScript] Line " + tok.line + ": Unexpected token \"" + tok.value + "\"");
  }

  // ── Statements ───────────────────────────────────────────────────────────────
  parseBlock() {
    this.expect(TokenType.LBRACE);
    const stmts = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) stmts.push(this.parseStatement());
    this.expect(TokenType.RBRACE);
    return stmts;
  }

  parseStatement() {
    const tok = this.current();
    if (tok.type === TokenType.REPLY)          return this.parseReply();
    if (tok.type === TokenType.SEND)           return this.parseSend();
    if (tok.type === TokenType.DM)             return this.parseDm();
    if (tok.type === TokenType.EMBED)          return this.parseEmbedStmt();
    if (tok.type === TokenType.EDIT)           return this.parseEdit();
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
    if (tok.type === TokenType.WARN)           return this.parseWarn();
    if (tok.type === TokenType.WARNINGS)       return this.parseWarnings();
    if (tok.type === TokenType.CLEAR_WARNINGS) return this.parseClearWarnings();
    if (tok.type === TokenType.CONFIRM)        return this.parseConfirm();
    if (tok.type === TokenType.PAGINATE)       return this.parsePaginate();
    if (tok.type === TokenType.CREATE_CHANNEL) return this.parseCreateChannel();
    if (tok.type === TokenType.DELETE_CHANNEL) return this.parseDeleteChannel();
    if (tok.type === TokenType.CREATE_THREAD)  return this.parseCreateThread();
    if (tok.type === TokenType.IF)             return this.parseIf();
    if (tok.type === TokenType.WHILE)          return this.parseWhile();
    if (tok.type === TokenType.FOR)            return this.parseFor();
    if (tok.type === TokenType.REPEAT)         return this.parseRepeat();
    if (tok.type === TokenType.TRY)            return this.parseTryCatch();
    if (tok.type === TokenType.BREAK)          { this.advance(); return { type:"Break" }; }
    if (tok.type === TokenType.RETURN)         return this.parseReturn();
    if (tok.type === TokenType.VAR)            return this.parseVar();
    if (tok.type === TokenType.SET)            return this.parseSet();
    if (tok.type === TokenType.FUNC)           return this.parseFunc();
    const expr = this.parseExpr();
    return { type:"ExprStatement", expr };
  }

  parseReply()  { this.expect(TokenType.REPLY);  return { type:"Reply",  value:this.parseExpr() }; }
  parseEdit()   { this.expect(TokenType.EDIT);   return { type:"Edit",   value:this.parseExpr() }; }
  parseLog()    { this.expect(TokenType.LOG);    return { type:"Log",    value:this.parseExpr() }; }
  parseReturn() { this.expect(TokenType.RETURN); return { type:"Return", value:this.parseExpr() }; }
  parseDeleteMsg() { this.expect(TokenType.DELETE_MESSAGE); return { type:"DeleteMessage" }; }
  parseBreak()  { this.expect(TokenType.BREAK); return { type:"Break" }; }

  parseSend() {
    this.expect(TokenType.SEND);
    if (this.check(TokenType.IDENTIFIER) && this.current().value === "channel") {
      this.advance();
      const channel = this.parseExpr();
      const message = this.parseExpr();
      return { type:"SendChannel", channel, message };
    }
    return { type:"Send", value:this.parseExpr() };
  }

  parseDm() {
    this.expect(TokenType.DM);
    const target  = this.parseExpr();
    const message = this.parseExpr();
    return { type:"Dm", target, message };
  }

  parseEmbedStmt() {
    this.expect(TokenType.EMBED);
    const name = this.check(TokenType.IDENTIFIER) ? this.advance().value : "embed";
    this.expect(TokenType.LBRACE);
    const props = {}; const fields = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const key = this.current();
      if (key.type === TokenType.TITLE)          { this.advance(); props.title       = this.parseExpr(); }
      else if (key.type === TokenType.COLOR)     { this.advance(); props.color       = this.parseExpr(); }
      else if (key.type === TokenType.FOOTER)    { this.advance(); props.footer      = this.parseExpr(); }
      else if (key.type === TokenType.IMAGE)     { this.advance(); props.image       = this.parseExpr(); }
      else if (key.type === TokenType.THUMBNAIL) { this.advance(); props.thumbnail   = this.parseExpr(); }
      else if (key.type === TokenType.FIELD)     { this.advance(); const fn = this.parseExpr(); const fv = this.parseExpr(); fields.push({ name:fn, value:fv }); }
      else { props.description = this.parseExpr(); }
    }
    this.expect(TokenType.RBRACE);
    return { type:"EmbedSend", name, props, fields };
  }

  parseBan() {
    this.expect(TokenType.BAN);
    const target = this.parseExpr();
    const reason = (this.check(TokenType.STRING)||this.check(TokenType.IDENTIFIER)) ? this.parseExpr() : null;
    return { type:"Ban", target, reason };
  }
  parseKick() {
    this.expect(TokenType.KICK);
    const target = this.parseExpr();
    const reason = (this.check(TokenType.STRING)||this.check(TokenType.IDENTIFIER)) ? this.parseExpr() : null;
    return { type:"Kick", target, reason };
  }
  parseTimeout() {
    this.expect(TokenType.TIMEOUT);
    const target   = this.parseExpr();
    const duration = this.parseExpr();
    return { type:"Timeout", target, duration };
  }
  parseGiveRole()   { this.expect(TokenType.GIVE_ROLE);   const t=this.parseExpr(); const r=this.parseExpr(); return { type:"GiveRole",   target:t, role:r }; }
  parseRemoveRole() { this.expect(TokenType.REMOVE_ROLE); const t=this.parseExpr(); const r=this.parseExpr(); return { type:"RemoveRole", target:t, role:r }; }
  parseWait()       { this.expect(TokenType.WAIT); return { type:"Wait", duration:this.parseExpr() }; }

  parseButton() {
    this.expect(TokenType.BUTTON);
    const label = this.parseExpr();
    const style = this.check(TokenType.IDENTIFIER) ? this.advance().value : "primary";
    const body  = this.parseBlock();
    return { type:"Button", label, style, body };
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
        const value = (this.check(TokenType.STRING)||this.check(TokenType.NUMBER)) ? this.parseExpr() : label;
        const body  = this.parseBlock();
        options.push({ label, value, body });
      } else { this.advance(); }
    }
    this.expect(TokenType.RBRACE);
    return { type:"Select", placeholder, options };
  }

  parseAddReaction() {
    this.expect(TokenType.ADD_REACTION);
    const emoji = this.parseExpr();
    const body  = this.check(TokenType.LBRACE) ? this.parseBlock() : null;
    return { type:"AddReaction", emoji, body };
  }

  parseWarn() {
    this.expect(TokenType.WARN);
    const target = this.parseExpr();
    const reason = this.parseExpr();
    return { type:"Warn", target, reason };
  }
  parseWarnings() {
    this.expect(TokenType.WARNINGS);
    const target = this.parseExpr();
    return { type:"Warnings", target };
  }
  parseClearWarnings() {
    this.expect(TokenType.CLEAR_WARNINGS);
    const target = this.parseExpr();
    return { type:"ClearWarnings", target };
  }

  parseConfirm() {
    this.expect(TokenType.CONFIRM);
    const message  = this.parseExpr();
    const yesBody  = this.parseBlock();
    let   noBody   = null;
    if (this.check(TokenType.CANCEL)) { this.advance(); noBody = this.parseBlock(); }
    return { type:"Confirm", message, yesBody, noBody };
  }

  parsePaginate() {
    this.expect(TokenType.PAGINATE);
    this.expect(TokenType.LBRACE);
    const pages = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      if (this.current().type === TokenType.PAGE) {
        this.advance();
        const num  = this.check(TokenType.NUMBER) ? parseFloat(this.advance().value) : pages.length + 1;
        const body = this.parseBlock();
        pages.push({ num, body });
      } else { this.advance(); }
    }
    this.expect(TokenType.RBRACE);
    return { type:"Paginate", pages };
  }

  parseCreateChannel() {
    this.expect(TokenType.CREATE_CHANNEL);
    const name     = this.parseExpr();
    const category = this.check(TokenType.STRING) ? this.parseExpr() : null;
    return { type:"CreateChannel", name, category };
  }
  parseDeleteChannel() {
    this.expect(TokenType.DELETE_CHANNEL);
    const name = this.parseExpr();
    return { type:"DeleteChannel", name };
  }
  parseCreateThread() {
    this.expect(TokenType.CREATE_THREAD);
    const name = this.parseExpr();
    return { type:"CreateThread", name };
  }

  parseIf() {
    this.expect(TokenType.IF);
    const condition = this.parseExpr();
    const body      = this.parseBlock();
    let elseBody    = null;
    if (this.check(TokenType.ELIF)) { elseBody = [this.parseIf()]; }
    else if (this.check(TokenType.ELSE)) { this.advance(); elseBody = this.parseBlock(); }
    return { type:"If", condition, body, elseBody };
  }

  parseWhile() {
    this.expect(TokenType.WHILE);
    return { type:"While", condition:this.parseExpr(), body:this.parseBlock() };
  }

  parseFor() {
    this.expect(TokenType.FOR);
    this.match(TokenType.EACH);
    const item  = this.expect(TokenType.IDENTIFIER, "Expected variable name in for loop").value;
    let   index = null;
    if (this.check(TokenType.COMMA)) { this.advance(); index = this.expect(TokenType.IDENTIFIER).value; }
    this.expect(TokenType.IN);
    return { type:"ForEach", item, index, iterable:this.parseExpr(), body:this.parseBlock() };
  }

  parseRepeat() {
    this.expect(TokenType.REPEAT);
    const count = this.parseExpr();
    this.match(TokenType.TIMES);
    return { type:"Repeat", count, body:this.parseBlock() };
  }

  parseTryCatch() {
    this.expect(TokenType.TRY);
    const tryBody   = this.parseBlock();
    let   catchBody = [];
    let   errVar    = "err";
    if (this.check(TokenType.CATCH)) {
      this.advance();
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        errVar = this.expect(TokenType.IDENTIFIER).value;
        this.expect(TokenType.RPAREN);
      }
      catchBody = this.parseBlock();
    }
    return { type:"TryCatch", tryBody, catchBody, errVar };
  }

  parseVar() {
    this.expect(TokenType.VAR);
    const name = this.expect(TokenType.IDENTIFIER, "Expected variable name").value;
    this.expect(TokenType.EQUALS, "Expected = after variable name");
    return { type:"VarDecl", name, value:this.parseExpr() };
  }

  parseSet() {
    this.expect(TokenType.SET);
    const name  = this.parseExpr();
    const opTok = this.current();
    let   op    = "=";
    if ([TokenType.EQUALS,TokenType.PLUS_EQ,TokenType.MINUS_EQ,TokenType.STAR_EQ,TokenType.SLASH_EQ].includes(opTok.type))
      op = this.advance().value;
    return { type:"VarSet", name, op, value:this.parseExpr() };
  }

  parseFunc() {
    this.expect(TokenType.FUNC);
    const name   = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    this.expect(TokenType.LPAREN);
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
      params.push(this.expect(TokenType.IDENTIFIER).value);
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RPAREN);
    return { type:"FuncDecl", name, params, body:this.parseBlock() };
  }

  // ── Top-level ─────────────────────────────────────────────────────────────
  parseBot() {
    this.expect(TokenType.BOT);
    const name = this.check(TokenType.STRING) ? this.advance().value
      : (this.check(TokenType.IDENTIFIER) ? this.advance().value : "NizumoBot");
    this.expect(TokenType.LBRACE);
    const props = {};
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const key = this.current();
      if (key.type === TokenType.TOKEN)  { this.advance(); props.token  = this.parseExpr(); }
      else if (key.type === TokenType.STATUS)  { this.advance(); props.status  = this.parseExpr(); }
      else if (key.type === TokenType.INTENTS) { this.advance(); props.intents = this.parseArray(); }
      else if (key.type === TokenType.PREFIX)  {
        this.advance();
        if (this.check(TokenType.LBRACE)) {
          this.advance();
          props.prefix = { type:"prefix_config", global:null, fallback:null, mention:false, caseSensitive:false };
          while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
            const pk = this.current().value; this.advance();
            if (pk === "global")        props.prefix.global        = this.parseExpr();
            else if (pk === "fallback") props.prefix.fallback       = this.parseExpr();
            else if (pk === "mention")  props.prefix.mention        = this.parseExpr();
            else if (pk === "caseSensitive") props.prefix.caseSensitive = this.parseExpr();
            else this.parseExpr();
          }
          this.expect(TokenType.RBRACE);
        } else if (this.check(TokenType.LBRACKET)) {
          props.prefix = this.parseArray();
        } else {
          props.prefix = this.parseExpr();
        }
      }
      else if (key.type === TokenType.HELP_AUTO) { this.advance(); props.helpAuto = true; }
      else { this.advance(); }
    }
    this.expect(TokenType.RBRACE);
    return { type:"BotDef", name, props };
  }

  parseCommand() {
    this.expect(TokenType.COMMAND);
    this.match(TokenType.FSLASH);
    const name = this.check(TokenType.STRING) ? this.advance().value
      : this.expect(TokenType.IDENTIFIER, "Expected command name").value;
    this.expect(TokenType.LBRACE);
    const props = {}; const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      const tok = this.current();
      if (tok.type === TokenType.DESCRIPTION)   { this.advance(); props.description = this.parseExpr(); }
      else if (tok.type === TokenType.ACCESS)   { this.advance(); props.access      = this.parseExpr(); }
      else if (tok.type === TokenType.COOLDOWN) { this.advance(); props.cooldown    = this.parseExpr(); }
      else if (tok.type === TokenType.ALIASES)  { this.advance(); props.aliases     = this.parseArray(); }
      else if (tok.type === TokenType.ARGS)     {
        this.advance();
        // support typed args: [user: Member, amount: Number] or plain [user, amount]
        this.expect(TokenType.LBRACKET);
        const typedArgs = [];
        while (!this.check(TokenType.RBRACKET) && !this.isEnd()) {
          const argName = this.expect(TokenType.IDENTIFIER).value;
          let   argType = "Any";
          if (this.check(TokenType.COLON)) { this.advance(); argType = this.expect(TokenType.IDENTIFIER).value; }
          typedArgs.push({ name: argName, type: argType });
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RBRACKET);
        props.args = typedArgs;
      }
      else if (tok.type === TokenType.CATEGORY) { this.advance(); props.category    = this.parseExpr(); }
      else if (tok.type === TokenType.ERROR)     { this.advance(); props.error       = this.parseExpr(); }
      else if (tok.type === TokenType.SLASH)     { this.advance(); props.slash       = true; }
      else if (tok.type === TokenType.PREFIX)    { this.advance(); props.prefix      = this.check(TokenType.LBRACKET) ? this.parseArray() : this.parseExpr(); }
      else if (tok.type === TokenType.REACTION)  {
        this.advance(); const emoji = this.parseExpr(); const rb = this.parseBlock();
        body.push({ type:"ReactionHandler", emoji, body:rb });
      }
      else { body.push(this.parseStatement()); }
    }
    this.expect(TokenType.RBRACE);
    return { type:"CommandDef", name, props, body };
  }

  parseEvent() {
    this.expect(TokenType.ON);
    const eventName = this.expect(TokenType.IDENTIFIER, "Expected event name").value;
    return { type:"EventDef", eventName, body:this.parseBlock() };
  }

  parseTask() {
    this.expect(TokenType.TASK);
    const name = this.check(TokenType.STRING) ? this.advance().value
      : this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);
    let interval = null; const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      if (this.current().type === TokenType.EVERY) { this.advance(); interval = this.parseExpr(); }
      else { body.push(this.parseStatement()); }
    }
    this.expect(TokenType.RBRACE);
    return { type:"TaskDef", name, interval, body };
  }

  parse() {
    const program = { type:"Program", body:[] };
    while (!this.isEnd()) {
      const tok = this.current();
      if (tok.type === TokenType.BOT)     { program.body.push(this.parseBot());     continue; }
      if (tok.type === TokenType.COMMAND) { program.body.push(this.parseCommand()); continue; }
      if (tok.type === TokenType.ON)      { program.body.push(this.parseEvent());   continue; }
      if (tok.type === TokenType.TASK)    { program.body.push(this.parseTask());    continue; }
      if (tok.type === TokenType.FUNC)    { program.body.push(this.parseFunc());    continue; }
      if (tok.type === TokenType.IMPORT)  { this.advance(); this.advance(); continue; }
      throw new Error("[NizumoScript] Line " + tok.line + ": Unexpected top-level token \"" + tok.value + "\"");
    }
    return program;
  }
}

module.exports = { Parser };
