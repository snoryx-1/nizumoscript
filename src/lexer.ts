import { Token, TokenType } from "./types";
import { Errors } from "./errors";

const KEYWORDS: Record<string, TokenType> = {
  const:       TokenType.CONST,
  let:         TokenType.LET,
  var:         TokenType.VAR,
  int:         TokenType.INT,
  float:       TokenType.FLOAT,
  str:         TokenType.STR,
  bool:        TokenType.BOOL,
  any:         TokenType.ANY,
  type:        TokenType.TYPE,
  store:       TokenType.STORE,
  embed:       TokenType.EMBED,
  bot:         TokenType.BOT,
  node:        TokenType.NODE,
  command:     TokenType.COMMAND,
  slash:       TokenType.SLASH,
  permission:  TokenType.PERMISSION,
  cooldown:    TokenType.COOLDOWN,
  alias:       TokenType.ALIAS,
  prefix:      TokenType.PREFIX,
  description: TokenType.DESCRIPTION,
  params:      TokenType.PARAMS,
  event:       TokenType.EVENT,
  every:       TokenType.EVERY,
  after:       TokenType.AFTER,
  emit:        TokenType.EMIT,
  fn:          TokenType.FN,
  return:      TokenType.RETURN,
  private:     TokenType.PRIVATE,
  export:      TokenType.EXPORT,
  import:      TokenType.IMPORT,
  async:       TokenType.ASYNC,
  await:       TokenType.AWAIT,
  if:          TokenType.IF,
  else:        TokenType.ELSE,
  match:       TokenType.MATCH,
  case:        TokenType.CASE,
  default:     TokenType.DEFAULT,
  for:         TokenType.FOR,
  in:          TokenType.IN,
  from:        TokenType.FROM,
  to:          TokenType.TO,
  while:       TokenType.WHILE,
  break:       TokenType.BREAK,
  continue:    TokenType.CONTINUE,
  try:         TokenType.TRY,
  catch:       TokenType.CATCH,
  finally:     TokenType.FINALLY,
  throw:       TokenType.THROW,
  reply:       TokenType.REPLY,
  ephemeral:   TokenType.EPHEMERAL,
  paginate:    TokenType.PAGINATE,
  page:        TokenType.PAGE,
  dm:          TokenType.DM,
  role:        TokenType.ROLE,
  react:       TokenType.REACT,
  wait:        TokenType.WAIT,
  log:         TokenType.LOG,
  modal:       TokenType.MODAL,
  with:        TokenType.WITH,
  button:      TokenType.BUTTON,
  buttons:     TokenType.BUTTONS,
  row:         TokenType.ROW,
  select:      TokenType.SELECT,
  input:       TokenType.INPUT,
  option:      TokenType.OPTION,
  extends:     TokenType.EXTENDS,
  scope:       TokenType.SCOPE,
  run:         TokenType.RUN,
  onClick:     TokenType.ONCLICK,
  onSelect:    TokenType.ONSELECT,
  onSubmit:    TokenType.ONSUBMIT,
  field:       TokenType.FIELD,
  fields:      TokenType.FIELDS,
  is:          TokenType.IS,
  js:          TokenType.JS,
  true:        TokenType.BOOLEAN,
  false:       TokenType.BOOLEAN,
  null:        TokenType.NULL,
};

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];

  constructor(private source: string, private file: string = "<input>") {}

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      if (ch === "\n") {
        this.line++;
        this.col = 1;
        this.pos++;
        continue;
      }

      if (ch === "#") {
        this.readPragma();
        continue;
      }

      if (ch === "@") {
        this.tokens.push({ type: TokenType.AT, value: "@", line: this.line, col: this.col });
        this.pos++; this.col++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        this.readString(ch);
        continue;
      }

      if (ch === '"' && this.source.slice(this.pos, this.pos + 3) === '"""') {
        this.readMultilineString();
        continue;
      }

      if (this.isDigit(ch) || (ch === "." && this.isDigit(this.source[this.pos + 1]))) {
        this.readNumber();
        continue;
      }

      if (this.isIdentStart(ch)) {
        this.readIdentifierOrKeyword();
        continue;
      }

      this.readSymbol();
    }

    this.tokens.push({ type: TokenType.EOF, value: "", line: this.line, col: this.col });
    return this.tokens;
  }

  private skipWhitespaceAndComments() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      if (ch === " " || ch === "\t" || ch === "\r") {
        this.col++;
        this.pos++;
        continue;
      }

      // Single line comment
      if (ch === "/" && this.source[this.pos + 1] === "/") {
        while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
          this.pos++;
        }
        continue;
      }

      // Multi-line comment
      if (ch === "/" && this.source[this.pos + 1] === "*") {
        this.pos += 2;
        this.col += 2;
        while (this.pos < this.source.length) {
          if (this.source[this.pos] === "\n") {
            this.line++;
            this.col = 1;
            this.pos++;
          } else if (this.source[this.pos] === "*" && this.source[this.pos + 1] === "/") {
            this.pos += 2;
            this.col += 2;
            break;
          } else {
            this.col++;
            this.pos++;
          }
        }
        continue;
      }

      break;
    }
  }

  private readPragma() {
    const startCol = this.col;
    this.pos++; this.col++; // skip #
    let value = "";
    while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
      value += this.source[this.pos];
      this.pos++;
      this.col++;
    }
    this.tokens.push({ type: TokenType.HASH, value: value.trim(), line: this.line, col: startCol });
  }

  private readString(quote: string) {
    // Check for triple-quote multiline
    if (this.source.slice(this.pos, this.pos + 3) === '"""') {
      this.readMultilineString();
      return;
    }

    const startLine = this.line;
    const startCol = this.col;
    this.pos++; this.col++; // skip opening quote
    let value = "";

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === quote) {
        this.pos++; this.col++;
        break;
      }
      if (ch === "\n") {
        throw Errors.unexpectedToken("newline", "closing quote", this.file, this.line, this.col);
      }
      if (ch === "\\") {
        this.pos++; this.col++;
        const esc = this.source[this.pos];
        switch (esc) {
          case "n": value += "\n"; break;
          case "t": value += "\t"; break;
          case "r": value += "\r"; break;
          case "\\": value += "\\"; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += "\\" + esc;
        }
        this.pos++; this.col++;
        continue;
      }
      value += ch;
      this.pos++; this.col++;
    }

    this.tokens.push({ type: TokenType.STRING, value, line: startLine, col: startCol });
  }

  private readMultilineString() {
    const startLine = this.line;
    const startCol = this.col;
    this.pos += 3; this.col += 3; // skip """
    let value = "";

    while (this.pos < this.source.length) {
      if (this.source.slice(this.pos, this.pos + 3) === '"""') {
        this.pos += 3; this.col += 3;
        break;
      }
      const ch = this.source[this.pos];
      if (ch === "\n") {
        value += "\n";
        this.line++;
        this.col = 1;
        this.pos++;
      } else {
        value += ch;
        this.pos++; this.col++;
      }
    }

    // Trim leading newline if present
    if (value.startsWith("\n")) value = value.slice(1);

    this.tokens.push({ type: TokenType.STRING, value, line: startLine, col: startCol });
  }

  private readNumber() {
    const startCol = this.col;
    let value = "";
    let isFloat = false;

    while (this.pos < this.source.length && (this.isDigit(this.source[this.pos]) || this.source[this.pos] === "_")) {
      if (this.source[this.pos] !== "_") value += this.source[this.pos];
      this.pos++; this.col++;
    }

    if (this.source[this.pos] === "." && this.isDigit(this.source[this.pos + 1])) {
      isFloat = true;
      value += ".";
      this.pos++; this.col++;
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this.pos++; this.col++;
      }
    }

    this.tokens.push({ type: TokenType.NUMBER, value, line: this.line, col: startCol });
  }

  private readIdentifierOrKeyword() {
    const startCol = this.col;
    let value = "";

    while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
      value += this.source[this.pos];
      this.pos++; this.col++;
    }

    const kwType = KEYWORDS[value];
    if (kwType) {
      this.tokens.push({ type: kwType, value, line: this.line, col: startCol });
    } else {
      this.tokens.push({ type: TokenType.IDENTIFIER, value, line: this.line, col: startCol });
    }
  }

  private readSymbol() {
    const ch = this.source[this.pos];
    const next = this.source[this.pos + 1];
    const startCol = this.col;
    const startLine = this.line;

    const emit = (type: TokenType, len: number, val?: string) => {
      this.tokens.push({ type, value: val ?? this.source.slice(this.pos, this.pos + len), line: startLine, col: startCol });
      this.pos += len;
      this.col += len;
    };

    switch (ch) {
      case "{": emit(TokenType.LBRACE, 1); break;
      case "}": emit(TokenType.RBRACE, 1); break;
      case "(": emit(TokenType.LPAREN, 1); break;
      case ")": emit(TokenType.RPAREN, 1); break;
      case "[": emit(TokenType.LBRACKET, 1); break;
      case "]": emit(TokenType.RBRACKET, 1); break;
      case ",": emit(TokenType.COMMA, 1); break;
      case ";": emit(TokenType.SEMICOLON, 1); break;
      case ".":
        if (next === ".") {
          // future: spread ... not in spec, skip
          emit(TokenType.DOT, 1);
        } else {
          emit(TokenType.DOT, 1);
        }
        break;
      case ":": emit(TokenType.COLON, 1); break;
      case "?":
        if (next === ".") { emit(TokenType.DOT, 2, "?."); } // optional chain
        else if (next === "?") {
          if (this.source[this.pos + 2] === "=") emit(TokenType.NULLISH_EQ, 3);
          else emit(TokenType.NULL_COAL, 2);
        } else {
          emit(TokenType.QUESTION, 1);
        }
        break;
      case "!":
        if (next === "=") emit(TokenType.BANG_EQ, 2);
        else emit(TokenType.BANG, 1);
        break;
      case "=":
        if (next === "=") emit(TokenType.EQ_EQ, 2);
        else if (next === ">") emit(TokenType.ARROW, 2);
        else emit(TokenType.EQUALS, 1);
        break;
      case "+":
        if (next === "=") emit(TokenType.PLUS_EQ, 2);
        else emit(TokenType.PLUS, 1);
        break;
      case "-":
        if (next === "=") emit(TokenType.MINUS_EQ, 2);
        else emit(TokenType.MINUS, 1);
        break;
      case "*":
        if (next === "*") {
          if (this.source[this.pos + 2] === "=") emit(TokenType.STAR_STAR_EQ, 3);
          else emit(TokenType.STAR_STAR, 2);
        } else if (next === "=") emit(TokenType.STAR_EQ, 2);
        else emit(TokenType.STAR, 1);
        break;
      case "/":
        if (next === "=") emit(TokenType.SLASH_EQ, 2);
        else emit(TokenType.DIV, 1);
        break;
      case "%": emit(TokenType.PERCENT, 1); break;
      case ">":
        if (next === "=") emit(TokenType.GT_EQ, 2);
        else emit(TokenType.GT, 1);
        break;
      case "<":
        if (next === "=") emit(TokenType.LT_EQ, 2);
        else emit(TokenType.LT, 1);
        break;
      case "&":
        if (next === "&") emit(TokenType.AND, 2);
        else { this.pos++; this.col++; } // skip unknown
        break;
      case "|":
        if (next === "|") emit(TokenType.OR, 2);
        else { this.pos++; this.col++; }
        break;
      default:
        // Skip unknown character with a warning
        this.pos++;
        this.col++;
    }
  }

  private isDigit(ch: string) { return ch >= "0" && ch <= "9"; }
  private isIdentStart(ch: string) { return /[a-zA-Z_$]/.test(ch); }
  private isIdentPart(ch: string) { return /[a-zA-Z0-9_$]/.test(ch); }
}
