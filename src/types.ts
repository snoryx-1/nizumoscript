// ─── Token Types ───────────────────────────────────────────────────────────

export enum TokenType {
  // Literals
  STRING = "STRING",
  NUMBER = "NUMBER",
  BOOLEAN = "BOOLEAN",
  NULL = "NULL",

  // Identifier
  IDENTIFIER = "IDENTIFIER",

  // Variable keywords
  CONST = "CONST",
  LET = "LET",
  VAR = "VAR",

  // Primitive types
  INT = "INT",
  FLOAT = "FLOAT",
  STR = "STR",
  BOOL = "BOOL",
  ANY = "ANY",

  // Top-level declarations
  TYPE = "TYPE",
  STORE = "STORE",
  EMBED = "EMBED",
  BOT = "BOT",
  NODE = "NODE",

  // Command related
  COMMAND = "COMMAND",
  SLASH = "SLASH",
  PERMISSION = "PERMISSION",
  COOLDOWN = "COOLDOWN",
  ALIAS = "ALIAS",
  PREFIX = "PREFIX",
  DESCRIPTION = "DESCRIPTION",
  PARAMS = "PARAMS",

  // Event / scheduling
  EVENT = "EVENT",
  EVERY = "EVERY",
  AFTER = "AFTER",
  EMIT = "EMIT",

  // Functions
  FN = "FN",
  RETURN = "RETURN",
  PRIVATE = "PRIVATE",
  EXPORT = "EXPORT",
  IMPORT = "IMPORT",
  ASYNC = "ASYNC",
  AWAIT = "AWAIT",

  // Control flow
  IF = "IF",
  ELSE = "ELSE",
  MATCH = "MATCH",
  CASE = "CASE",
  DEFAULT = "DEFAULT",

  // Loops
  FOR = "FOR",
  IN = "IN",
  FROM = "FROM",
  TO = "TO",
  WHILE = "WHILE",
  BREAK = "BREAK",
  CONTINUE = "CONTINUE",

  // Error handling
  TRY = "TRY",
  CATCH = "CATCH",
  FINALLY = "FINALLY",
  THROW = "THROW",

  // Reply / interaction
  REPLY = "REPLY",
  EPHEMERAL = "EPHEMERAL",
  PAGINATE = "PAGINATE",
  PAGE = "PAGE",
  DM = "DM",
  ROLE = "ROLE",
  REACT = "REACT",
  WAIT = "WAIT",
  LOG = "LOG",
  MODAL = "MODAL",

  // Buttons / UI
  WITH = "WITH",
  BUTTON = "BUTTON",
  BUTTONS = "BUTTONS",
  ROW = "ROW",
  SELECT = "SELECT",
  INPUT = "INPUT",
  OPTION = "OPTION",

  // Block/callback keywords
  EXTENDS = "EXTENDS",
  SCOPE = "SCOPE",
  RUN = "RUN",
  ONCLICK = "ONCLICK",
  ONSELECT = "ONSELECT",
  ONSUBMIT = "ONSUBMIT",

  // Embed fields
  FIELD = "FIELD",
  FIELDS = "FIELDS",

  // Type system
  IS = "IS",

  // JS escape hatch
  JS = "JS",

  // Punctuation
  LBRACE = "LBRACE",
  RBRACE = "RBRACE",
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",
  LBRACKET = "LBRACKET",
  RBRACKET = "RBRACKET",
  COMMA = "COMMA",
  DOT = "DOT",
  COLON = "COLON",
  SEMICOLON = "SEMICOLON",
  QUESTION = "QUESTION",
  BANG = "BANG",
  HASH = "HASH",
  AT = "AT",

  // Assignment operators
  EQUALS = "EQUALS",
  PLUS_EQ = "PLUS_EQ",
  MINUS_EQ = "MINUS_EQ",
  STAR_EQ = "STAR_EQ",
  SLASH_EQ = "SLASH_EQ",
  STAR_STAR_EQ = "STAR_STAR_EQ",
  NULLISH_EQ = "NULLISH_EQ",

  // Arithmetic
  PLUS = "PLUS",
  MINUS = "MINUS",
  STAR = "STAR",
  DIV = "DIV",
  PERCENT = "PERCENT",
  STAR_STAR = "STAR_STAR",

  // Comparison
  EQ_EQ = "EQ_EQ",
  BANG_EQ = "BANG_EQ",
  GT = "GT",
  LT = "LT",
  GT_EQ = "GT_EQ",
  LT_EQ = "LT_EQ",

  // Logical
  AND = "AND",
  OR = "OR",
  NULL_COAL = "NULL_COAL",

  // Arrow
  ARROW = "ARROW",

  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ─── AST Node Types ────────────────────────────────────────────────────────

export type NZSType =
  | "int" | "float" | "str" | "bool" | "null" | "any"
  | { array: NZSType }
  | { map: { key: NZSType; value: NZSType } }
  | { nullable: NZSType }
  | { custom: string };

export interface BaseNode {
  kind: string;
  line: number;
  col: number;
}

export interface ProgramNode extends BaseNode {
  kind: "Program";
  pragma?: string;
  body: ASTNode[];
}

export interface PragmaNode extends BaseNode {
  kind: "Pragma";
  version: string;
}

export interface ImportNode extends BaseNode {
  kind: "Import";
  path: string;
  named: string[];
}

export interface ExportNode extends BaseNode {
  kind: "Export";
  declaration: ASTNode;
}

export interface ConstDeclaration extends BaseNode {
  kind: "ConstDeclaration";
  name: string;
  value: ExpressionNode;
}

export interface LetDeclaration extends BaseNode {
  kind: "LetDeclaration";
  name: string;
  typeAnnotation?: NZSType;
  value: ExpressionNode;
}

export interface VarDeclaration extends BaseNode {
  kind: "VarDeclaration";
  name: string;
  varType: NZSType;
  value: ExpressionNode;
}

export interface TypeField {
  name: string;
  type: NZSType;
  defaultValue?: ExpressionNode;
}

export interface TypeDeclaration extends BaseNode {
  kind: "TypeDeclaration";
  name: string;
  fields: TypeField[];
  extends?: string;
}

export interface StoreField {
  name: string;
  type: NZSType;
  defaultValue?: ExpressionNode;
}

export interface StoreDeclaration extends BaseNode {
  kind: "StoreDeclaration";
  name: string;
  scope: "user" | "guild" | "global";
  fields: StoreField[];
}

export interface EmbedField {
  name: string;
  value: ExpressionNode;
  inline?: boolean;
}

export interface EmbedDeclaration extends BaseNode {
  kind: "EmbedDeclaration";
  name: string;
  extends?: string;
  properties: { key: string; value: ExpressionNode }[];
  fields?: EmbedField[];
}

export interface NodeDeclaration extends BaseNode {
  kind: "NodeDeclaration";
  name: string;
  body: ASTNode[];
}

export interface BotDeclaration extends BaseNode {
  kind: "BotDeclaration";
  fields: { key: string; value: ExpressionNode }[];
}

export interface CommandParam {
  name: string;
  type: string;
  defaultValue?: ExpressionNode;
}

export interface CommandDeclaration extends BaseNode {
  kind: "CommandDeclaration";
  name: string;
  options: { key: string; value: ExpressionNode }[];
  params: CommandParam[];
  runParams: string[];
  body: ASTNode[];
}

export interface EventDeclaration extends BaseNode {
  kind: "EventDeclaration";
  name: string;
  params: string[];
  body: ASTNode[];
}

export interface FnParam {
  name: string;
  type?: NZSType;
  defaultValue?: ExpressionNode;
}

export interface FnDeclaration extends BaseNode {
  kind: "FnDeclaration";
  name: string;
  params: FnParam[];
  returnType?: NZSType;
  body: ASTNode[];
  isPrivate: boolean;
  isExport: boolean;
  isAsync: boolean;
}

export interface IfStatement extends BaseNode {
  kind: "IfStatement";
  condition: ExpressionNode;
  consequent: ASTNode[];
  alternates: { condition: ExpressionNode; body: ASTNode[] }[];
  else?: ASTNode[];
}

export interface MatchCase {
  value: ExpressionNode;
  body: ASTNode[];
}

export interface MatchStatement extends BaseNode {
  kind: "MatchStatement";
  value: ExpressionNode;
  cases: MatchCase[];
  default?: ASTNode[];
}

export interface ForInStatement extends BaseNode {
  kind: "ForInStatement";
  index?: string;
  item: string;
  iterable: ExpressionNode;
  body: ASTNode[];
}

export interface ForRangeStatement extends BaseNode {
  kind: "ForRangeStatement";
  variable: string;
  from: ExpressionNode;
  to: ExpressionNode;
  body: ASTNode[];
}

export interface WhileStatement extends BaseNode {
  kind: "WhileStatement";
  condition: ExpressionNode;
  body: ASTNode[];
}

export interface TryCatch {
  param: string;
  type?: string;
  body: ASTNode[];
}

export interface TryCatchStatement extends BaseNode {
  kind: "TryCatchStatement";
  body: ASTNode[];
  catches: TryCatch[];
  finally?: ASTNode[];
}

export interface ReturnStatement extends BaseNode {
  kind: "ReturnStatement";
  value?: ExpressionNode;
}

export interface BreakStatement extends BaseNode { kind: "BreakStatement"; }
export interface ContinueStatement extends BaseNode { kind: "ContinueStatement"; }

export interface ThrowStatement extends BaseNode {
  kind: "ThrowStatement";
  value: ExpressionNode;
}

export interface EmitStatement extends BaseNode {
  kind: "EmitStatement";
  event: string;
  args: ExpressionNode[];
}

export interface WaitStatement extends BaseNode {
  kind: "WaitStatement";
  duration: string;
}

export interface EveryStatement extends BaseNode {
  kind: "EveryStatement";
  interval: string;
  body: ASTNode[];
}

export interface AfterStatement extends BaseNode {
  kind: "AfterStatement";
  delay: string;
  body: ASTNode[];
}

export interface ButtonNode {
  label: ExpressionNode;
  style: string;
  id?: ExpressionNode;
  url?: ExpressionNode;
  disabled?: ExpressionNode;
  onClick: ASTNode[];
}

export interface ButtonRowNode {
  buttons: ButtonNode[];
}

export interface ReplyStatement extends BaseNode {
  kind: "ReplyStatement";
  message?: ExpressionNode;
  embedName?: string;
  inlineEmbed?: { properties: { key: string; value: ExpressionNode }[]; fields?: EmbedField[] };
  overrides?: { key: string; value: ExpressionNode }[];
  fields?: EmbedField[];
  ephemeral: boolean;
  button?: ButtonNode;
  buttons?: ButtonRowNode[];
  ping?: boolean;
}

export interface DmStatement extends BaseNode {
  kind: "DmStatement";
  target: ExpressionNode;
  message?: ExpressionNode;
  embed?: { properties: { key: string; value: ExpressionNode }[] };
}

export interface LogStatement extends BaseNode {
  kind: "LogStatement";
  level: "log" | "warn" | "error";
  value: ExpressionNode;
}

export interface RoleStatement extends BaseNode {
  kind: "RoleStatement";
  action: "give" | "remove" | "has";
  member: ExpressionNode;
  role: ExpressionNode;
}

export interface ReactStatement extends BaseNode {
  kind: "ReactStatement";
  emoji: ExpressionNode;
}

export interface PaginatePage {
  properties: { key: string; value: ExpressionNode }[];
}

export interface PaginateStatement extends BaseNode {
  kind: "PaginateStatement";
  timeout?: string;
  pages: PaginatePage[];
}

export interface AssignStatement extends BaseNode {
  kind: "AssignStatement";
  target: ExpressionNode;
  operator: string;
  value: ExpressionNode;
}

export interface ExpressionStatement extends BaseNode {
  kind: "ExpressionStatement";
  expression: ExpressionNode;
}

export interface ModalStatement extends BaseNode {
  kind: "ModalStatement";
  title: ExpressionNode;
  id: ExpressionNode;
  inputs: ModalInput[];
  onSubmitParams: string[];
  onSubmitBody: ASTNode[];
}

export interface ModalInput {
  label: ExpressionNode;
  placeholder?: ExpressionNode;
  required?: boolean;
  id: ExpressionNode;
}

export interface SelectStatement extends BaseNode {
  kind: "SelectStatement";
  placeholder?: ExpressionNode;
  id: ExpressionNode;
  options: SelectOption[];
  onSelectParams: string[];
  onSelectBody: ASTNode[];
}

export interface SelectOption {
  label: ExpressionNode;
  value: ExpressionNode;
  description?: ExpressionNode;
}

export interface JsEscapeStatement extends BaseNode {
  kind: "JsEscapeStatement";
  code: string;
}

// ─── Expression Nodes ──────────────────────────────────────────────────────

export interface Identifier extends BaseNode {
  kind: "Identifier";
  name: string;
}

export interface Literal extends BaseNode {
  kind: "Literal";
  value: string | number | boolean | null;
  raw: string;
}

export interface TemplateLiteral extends BaseNode {
  kind: "TemplateLiteral";
  parts: Array<{ text: string } | { expr: ExpressionNode; format?: string }>;
}

export interface ArrayLiteral extends BaseNode {
  kind: "ArrayLiteral";
  elements: ExpressionNode[];
}

export interface MapLiteral extends BaseNode {
  kind: "MapLiteral";
  entries: { key: ExpressionNode; value: ExpressionNode }[];
}

export interface TypeInstantiation extends BaseNode {
  kind: "TypeInstantiation";
  typeName: string;
  fields: { key: string; value: ExpressionNode }[];
}

export interface BinaryExpression extends BaseNode {
  kind: "BinaryExpression";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpression extends BaseNode {
  kind: "UnaryExpression";
  operator: string;
  operand: ExpressionNode;
}

export interface TernaryExpression extends BaseNode {
  kind: "TernaryExpression";
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface NullCoalesce extends BaseNode {
  kind: "NullCoalesce";
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface IsExpression extends BaseNode {
  kind: "IsExpression";
  value: ExpressionNode;
  negated: boolean;
  checkType: string;
}

export interface MemberExpression extends BaseNode {
  kind: "MemberExpression";
  object: ExpressionNode;
  property: string;
  optional: boolean;
}

export interface IndexExpression extends BaseNode {
  kind: "IndexExpression";
  object: ExpressionNode;
  index: ExpressionNode;
}

export interface CallExpression extends BaseNode {
  kind: "CallExpression";
  callee: ExpressionNode;
  args: ExpressionNode[];
  await: boolean;
}

export interface ArrowFunction extends BaseNode {
  kind: "ArrowFunction";
  params: FnParam[];
  body: ExpressionNode | ASTNode[];
}

export type ExpressionNode =
  | Identifier
  | Literal
  | TemplateLiteral
  | ArrayLiteral
  | MapLiteral
  | TypeInstantiation
  | BinaryExpression
  | UnaryExpression
  | TernaryExpression
  | NullCoalesce
  | IsExpression
  | MemberExpression
  | IndexExpression
  | CallExpression
  | ArrowFunction;

export type StatementNode =
  | ConstDeclaration
  | LetDeclaration
  | VarDeclaration
  | TypeDeclaration
  | StoreDeclaration
  | EmbedDeclaration
  | NodeDeclaration
  | BotDeclaration
  | CommandDeclaration
  | EventDeclaration
  | FnDeclaration
  | IfStatement
  | MatchStatement
  | ForInStatement
  | ForRangeStatement
  | WhileStatement
  | TryCatchStatement
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | ThrowStatement
  | EmitStatement
  | WaitStatement
  | EveryStatement
  | AfterStatement
  | ReplyStatement
  | DmStatement
  | LogStatement
  | RoleStatement
  | ReactStatement
  | PaginateStatement
  | AssignStatement
  | ExpressionStatement
  | ModalStatement
  | SelectStatement
  | JsEscapeStatement
  | ImportNode
  | ExportNode
  | PragmaNode;

export type ASTNode = StatementNode | ExpressionNode;
