"use strict";

const TokenType = {
  // Bot definition
  BOT: "BOT",
  TOKEN: "TOKEN",
  PREFIX: "PREFIX",
  STATUS: "STATUS",
  INTENTS: "INTENTS",

  // Blocks
  COMMAND: "COMMAND",
  ON: "ON",
  TASK: "TASK",

  // Command properties
  DESCRIPTION: "DESCRIPTION",
  ACCESS: "ACCESS",
  COOLDOWN: "COOLDOWN",
  ALIASES: "ALIASES",
  ARGS: "ARGS",
  CATEGORY: "CATEGORY",

  // Actions
  REPLY: "REPLY",
  SEND: "SEND",
  DM: "DM",
  EMBED: "EMBED",
  BAN: "BAN",
  KICK: "KICK",
  TIMEOUT: "TIMEOUT",
  GIVE_ROLE: "GIVE_ROLE",
  REMOVE_ROLE: "REMOVE_ROLE",
  DELETE_MESSAGE: "DELETE_MESSAGE",
  WAIT: "WAIT",
  LOG: "LOG",

  // Control flow
  IF: "IF",
  ELSE: "ELSE",
  ELIF: "ELIF",
  WHILE: "WHILE",
  FOR: "FOR",
  EACH: "EACH",
  IN: "IN",
  REPEAT: "REPEAT",
  TIMES: "TIMES",
  BREAK: "BREAK",
  RETURN: "RETURN",

  // Variables & functions
  VAR: "VAR",
  SET: "SET",
  FUNC: "FUNC",

  // Embed builder
  TITLE: "TITLE",
  COLOR: "COLOR",
  FIELD: "FIELD",
  FOOTER: "FOOTER",
  IMAGE: "IMAGE",
  THUMBNAIL: "THUMBNAIL",

  // Intervals
  EVERY: "EVERY",

  // Imports
  IMPORT: "IMPORT",

  // Literals
  STRING: "STRING",
  NUMBER: "NUMBER",
  BOOLEAN: "BOOLEAN",
  NULL: "NULL",
  DURATION: "DURATION",

  // Symbols
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  LBRACKET: "LBRACKET",
  RBRACKET: "RBRACKET",
  COLON: "COLON",
  COMMA: "COMMA",
  DOT: "DOT",
  SEMICOLON: "SEMICOLON",
  SLASH: "SLASH",
  AT: "AT",

  // Operators
  EQUALS: "EQUALS",
  PLUS_EQ: "PLUS_EQ",
  MINUS_EQ: "MINUS_EQ",
  STAR_EQ: "STAR_EQ",
  SLASH_EQ: "SLASH_EQ",
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  PERCENT: "PERCENT",
  EQ_EQ: "EQ_EQ",
  NEQ: "NEQ",
  GT: "GT",
  LT: "LT",
  GTE: "GTE",
  LTE: "LTE",
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  CONTAINS: "CONTAINS",

  // Identifiers
  IDENTIFIER: "IDENTIFIER",

  // Special
  NEWLINE: "NEWLINE",
  EOF: "EOF",
};

const KEYWORDS = {
  bot:           TokenType.BOT,
  token:         TokenType.TOKEN,
  prefix:        TokenType.PREFIX,
  status:        TokenType.STATUS,
  intents:       TokenType.INTENTS,
  command:       TokenType.COMMAND,
  on:            TokenType.ON,
  task:          TokenType.TASK,
  description:   TokenType.DESCRIPTION,
  access:        TokenType.ACCESS,
  cooldown:      TokenType.COOLDOWN,
  aliases:       TokenType.ALIASES,
  args:          TokenType.ARGS,
  category:      TokenType.CATEGORY,
  reply:         TokenType.REPLY,
  send:          TokenType.SEND,
  dm:            TokenType.DM,
  embed:         TokenType.EMBED,
  ban:           TokenType.BAN,
  kick:          TokenType.KICK,
  timeout:       TokenType.TIMEOUT,
  "give.role":   TokenType.GIVE_ROLE,
  "remove.role": TokenType.REMOVE_ROLE,
  "delete.message": TokenType.DELETE_MESSAGE,
  wait:          TokenType.WAIT,
  log:           TokenType.LOG,
  if:            TokenType.IF,
  else:          TokenType.ELSE,
  elif:          TokenType.ELIF,
  while:         TokenType.WHILE,
  for:           TokenType.FOR,
  each:          TokenType.EACH,
  in:            TokenType.IN,
  repeat:        TokenType.REPEAT,
  times:         TokenType.TIMES,
  break:         TokenType.BREAK,
  return:        TokenType.RETURN,
  var:           TokenType.VAR,
  set:           TokenType.SET,
  func:          TokenType.FUNC,
  title:         TokenType.TITLE,
  color:         TokenType.COLOR,
  field:         TokenType.FIELD,
  footer:        TokenType.FOOTER,
  image:         TokenType.IMAGE,
  thumbnail:     TokenType.THUMBNAIL,
  every:         TokenType.EVERY,
  import:        TokenType.IMPORT,
  true:          TokenType.BOOLEAN,
  false:         TokenType.BOOLEAN,
  null:          TokenType.NULL,
  and:           TokenType.AND,
  or:            TokenType.OR,
  not:           TokenType.NOT,
  contains:      TokenType.CONTAINS,
};

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.tokens = [];
  }

  current()            { return this.source[this.pos]; }
  peek(offset = 1)     { return this.source[this.pos + offset]; }
  isEnd()              { return this.pos >= this.source.length; }

  advance() {
    const ch = this.source[this.pos++];
    if (ch === "\n") { this.line++; this.col = 1; }
    else             { this.col++; }
    return ch;
  }

  addToken(type, value) {
    this.tokens.push({ type, value, line: this.line, col: this.col });
  }

  skipWhitespace() {
    while (!this.isEnd() && /[ \t\r]/.test(this.current())) this.advance();
  }

  skipComment() {
    while (!this.isEnd() && this.current() !== "\n") this.advance();
  }

  readString(quote) {
    this.advance(); // skip opening quote
    let str = "";
    while (!this.isEnd() && this.current() !== quote) {
      if (this.current() === "\\") {
        this.advance();
        const esc = this.advance();
        const map = { n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "\\": "\\" };
        str += map[esc] ?? esc;
      } else {
        str += this.advance();
      }
    }
    this.advance(); // skip closing quote
    this.addToken(TokenType.STRING, str);
  }

  readNumber() {
    let num = "";
    while (!this.isEnd() && /[0-9.]/.test(this.current())) num += this.advance();
    // duration suffix: 5s, 10m, 2h, 7d
    if (!this.isEnd() && /[smhd]/.test(this.current())) {
      num += this.advance();
      this.addToken(TokenType.DURATION, num);
    } else {
      this.addToken(TokenType.NUMBER, num);
    }
  }

  readIdentifier() {
    let id = "";
    while (!this.isEnd() && /[a-zA-Z0-9_]/.test(this.current())) id += this.advance();

    // check for compound keywords like give.role
    if (!this.isEnd() && this.current() === ".") {
      const saved = id + ".";
      const savedPos = this.pos;
      this.advance();
      let rest = "";
      while (!this.isEnd() && /[a-zA-Z0-9_]/.test(this.current())) rest += this.advance();
      const compound = saved + rest;
      if (KEYWORDS[compound]) {
        this.addToken(KEYWORDS[compound], compound);
        return;
      }
      // not a compound keyword — backtrack
      this.pos = savedPos;
    }

    const type = KEYWORDS[id.toLowerCase()] ?? TokenType.IDENTIFIER;
    this.addToken(type, id);
  }

  tokenize() {
    while (!this.isEnd()) {
      this.skipWhitespace();
      if (this.isEnd()) break;

      const ch = this.current();

      // Comments
      if (ch === "/" && this.peek() === "/") { this.skipComment(); continue; }
      if (ch === "#") { this.skipComment(); continue; }

      // Newlines
      if (ch === "\n") {
        this.advance();
        this.addToken(TokenType.NEWLINE, "\n");
        continue;
      }

      // Strings
      if (ch === '"' || ch === "'") { this.readString(ch); continue; }

      // Numbers
      if (/[0-9]/.test(ch)) { this.readNumber(); continue; }

      // Identifiers & keywords
      if (/[a-zA-Z_]/.test(ch)) { this.readIdentifier(); continue; }

      // Multi-char operators
      if (ch === "+" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.PLUS_EQ, "+="); continue; }
      if (ch === "-" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.MINUS_EQ, "-="); continue; }
      if (ch === "*" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.STAR_EQ, "*="); continue; }
      if (ch === "/" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.SLASH_EQ, "/="); continue; }
      if (ch === "=" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.EQ_EQ, "=="); continue; }
      if (ch === "!" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.NEQ, "!="); continue; }
      if (ch === ">" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.GTE, ">="); continue; }
      if (ch === "<" && this.peek() === "=") { this.advance(); this.advance(); this.addToken(TokenType.LTE, "<="); continue; }

      // Single char
      switch (ch) {
        case "{": this.advance(); this.addToken(TokenType.LBRACE, "{"); break;
        case "}": this.advance(); this.addToken(TokenType.RBRACE, "}"); break;
        case "(": this.advance(); this.addToken(TokenType.LPAREN, "("); break;
        case ")": this.advance(); this.addToken(TokenType.RPAREN, ")"); break;
        case "[": this.advance(); this.addToken(TokenType.LBRACKET, "["); break;
        case "]": this.advance(); this.addToken(TokenType.RBRACKET, "]"); break;
        case ":": this.advance(); this.addToken(TokenType.COLON, ":"); break;
        case ",": this.advance(); this.addToken(TokenType.COMMA, ","); break;
        case ".": this.advance(); this.addToken(TokenType.DOT, "."); break;
        case ";": this.advance(); this.addToken(TokenType.SEMICOLON, ";"); break;
        case "/": this.advance(); this.addToken(TokenType.SLASH, "/"); break;
        case "@": this.advance(); this.addToken(TokenType.AT, "@"); break;
        case "=": this.advance(); this.addToken(TokenType.EQUALS, "="); break;
        case "+": this.advance(); this.addToken(TokenType.PLUS, "+"); break;
        case "-": this.advance(); this.addToken(TokenType.MINUS, "-"); break;
        case "*": this.advance(); this.addToken(TokenType.STAR, "*"); break;
        case "%": this.advance(); this.addToken(TokenType.PERCENT, "%"); break;
        case ">": this.advance(); this.addToken(TokenType.GT, ">"); break;
        case "<": this.advance(); this.addToken(TokenType.LT, "<"); break;
        default:  this.advance(); break; // skip unknown
      }
    }

    this.addToken(TokenType.EOF, null);
    return this.tokens;
  }
}

module.exports = { Lexer, TokenType };
