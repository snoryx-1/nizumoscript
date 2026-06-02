export class NZSError extends Error {
  constructor(
    public code: string,
    public message: string,
    public file: string = "",
    public line: number = 0,
    public col: number = 0,
    public source: string = "",
    public hint?: string
  ) {
    super(message);
    this.name = "NZSError";
  }

  format(): string {
    let out = `[${this.code}] ${this.message}`;
    if (this.file && this.line) {
      out += `\n  --> ${this.file}:${this.line}:${this.col}`;
      if (this.source) {
        const lineStr = String(this.line);
        const pad = " ".repeat(lineStr.length);
        out += `\n   |`;
        out += `\n${lineStr} | ${this.source}`;
        out += `\n${pad} | ${" ".repeat(this.col - 1)}${"^".repeat(Math.max(1, this.source.length - this.col + 1))} ${this.message}`;
        out += `\n   |`;
      }
    }
    if (this.hint) {
      out += `\n   = hint: ${this.hint}`;
    }
    return out;
  }
}

export const Errors = {
  unexpectedToken: (found: string, expected: string, file: string, line: number, col: number, src = "", hint?: string) =>
    new NZSError("NZS001", `Unexpected token '${found}'${expected ? `, expected ${expected}` : ""}`, file, line, col, src, hint),

  unexpectedEOF: (file: string, line: number, col: number) =>
    new NZSError("NZS002", "Unexpected end of file", file, line, col),

  typeMismatch: (expected: string, got: string, file: string, line: number, col: number, src = "", hint?: string) =>
    new NZSError("NZS003", `Type mismatch: expected ${expected}, got ${got}`, file, line, col, src, hint),

  undefinedVariable: (name: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS004", `Undefined variable '${name}'`, file, line, col, src),

  undefinedFunction: (name: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS005", `Undefined function '${name}'`, file, line, col, src),

  undefinedType: (name: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS006", `Undefined type '${name}'`, file, line, col, src),

  missingRequiredField: (field: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS007", `Missing required field '${field}'`, file, line, col, src),

  importNotFound: (path: string, file: string, line: number, col: number) =>
    new NZSError("NZS008", `Import not found: '${path}'`, file, line, col),

  duplicateDeclaration: (name: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS009", `Duplicate declaration '${name}'`, file, line, col, src),

  invalidAssignment: (name: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS010", `Invalid assignment to '${name}'`, file, line, col, src, `'${name}' is a const and cannot be reassigned`),

  missingBotBlock: (file: string) =>
    new NZSError("NZS011", "Missing bot{} entry point", file, 0, 0),

  multipleBotBlocks: (file: string, line: number, col: number) =>
    new NZSError("NZS012", "Multiple bot{} blocks found — only one is allowed", file, line, col),

  invalidPermission: (perm: string, file: string, line: number, col: number) =>
    new NZSError("NZS013", `Invalid permission level '${perm}'`, file, line, col, "", "valid levels: @everyone, @mod, @admin, @owner, @botowner"),

  invalidCooldown: (val: string, file: string, line: number, col: number) =>
    new NZSError("NZS014", `Invalid cooldown format '${val}'`, file, line, col, "", "valid formats: 5s, 10m, 24h, 7d"),

  storeScopeMissing: (name: string, file: string, line: number, col: number) =>
    new NZSError("NZS015", `Store '${name}' is missing a scope declaration`, file, line, col, "", "add: scope: user | guild | global"),

  nullReference: (name: string, file: string, line: number, col: number, src = "") =>
    new NZSError("NZS016", `Possible null reference on '${name}'`, file, line, col, src, `check if '${name}' is null before accessing`),

  indexOutOfBounds: (file: string, line: number, col: number) =>
    new NZSError("NZS017", "Array index out of bounds", file, line, col),

  invalidOperator: (op: string, type: string, file: string, line: number, col: number) =>
    new NZSError("NZS018", `Invalid operator '${op}' for type '${type}'`, file, line, col),

  missingReturn: (fn: string, file: string, line: number, col: number) =>
    new NZSError("NZS019", `Function '${fn}' is missing a return statement`, file, line, col),

  circularImport: (a: string, b: string) =>
    new NZSError("NZS020", `Circular import detected: '${a}' <-> '${b}'`, a),
};
