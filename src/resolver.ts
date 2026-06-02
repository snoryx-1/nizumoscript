import {
  ProgramNode, ASTNode, ExpressionNode, NZSType,
  ConstDeclaration, LetDeclaration, VarDeclaration, TypeDeclaration,
  StoreDeclaration, EmbedDeclaration, NodeDeclaration, BotDeclaration,
  CommandDeclaration, EventDeclaration, FnDeclaration, IfStatement,
  MatchStatement, ForInStatement, ForRangeStatement, WhileStatement,
  TryCatchStatement, ReturnStatement, ThrowStatement, EmitStatement,
  ReplyStatement, DmStatement, LogStatement, AssignStatement,
  ExpressionStatement, EveryStatement, AfterStatement, PaginateStatement,
  ModalStatement, SelectStatement, Identifier, Literal, TemplateLiteral,
  ArrayLiteral, MapLiteral, TypeInstantiation, BinaryExpression,
  UnaryExpression, TernaryExpression, NullCoalesce, IsExpression,
  MemberExpression, IndexExpression, CallExpression, ArrowFunction,
  ImportNode, ExportNode, JsEscapeStatement
} from "./types";
import { Errors, NZSError } from "./errors";

interface Symbol {
  name: string;
  kind: "const" | "let" | "var" | "fn" | "type" | "store" | "embed" | "command" | "event" | "param" | "imported";
  type?: NZSType;
  isConst?: boolean;
  file: string;
  line: number;
  col: number;
}

interface Scope {
  symbols: Map<string, Symbol>;
  parent?: Scope;
}

export interface ResolverResult {
  errors: NZSError[];
  warnings: NZSError[];
  symbols: Map<string, Symbol>;
  hasBotBlock: boolean;
  commandNames: string[];
  buttonIds: Map<string, { file: string; line: number }>;
}

export class Resolver {
  private errors: NZSError[] = [];
  private warnings: NZSError[] = [];
  private globalScope: Scope = { symbols: new Map() };
  private currentScope: Scope = this.globalScope;
  private hasBotBlock = false;
  private botBlockCount = 0;
  private commandNames: string[] = [];
  private buttonIds: Map<string, { file: string; line: number }> = new Map();
  private importStack: string[] = [];

  constructor(private file: string = "<input>") {}

  resolve(program: ProgramNode): ResolverResult {
    // First pass: collect all top-level declarations
    this.collectDeclarations(program.body);

    // Second pass: resolve all bodies
    this.resolveNodes(program.body);

    // Check bot block
    if (this.botBlockCount === 0 && this.file.endsWith("main.nzs")) {
      this.errors.push(Errors.missingBotBlock(this.file));
    }
    if (this.botBlockCount > 1) {
      this.errors.push(Errors.multipleBotBlocks(this.file, 0, 0));
    }

    return {
      errors: this.errors,
      warnings: this.warnings,
      symbols: this.globalScope.symbols,
      hasBotBlock: this.hasBotBlock,
      commandNames: this.commandNames,
      buttonIds: this.buttonIds,
    };
  }

  // ─── First Pass: Collect Declarations ────────────────────────────────────

  private collectDeclarations(nodes: ASTNode[]) {
    for (const node of nodes) {
      this.collectDeclaration(node);
    }
  }

  private collectDeclaration(node: ASTNode) {
    switch (node.kind) {
      case "ConstDeclaration":
        this.defineSymbol({ name: node.name, kind: "const", isConst: true, file: this.file, line: node.line, col: node.col });
        break;
      case "LetDeclaration":
        this.defineSymbol({ name: node.name, kind: "let", file: this.file, line: node.line, col: node.col });
        break;
      case "VarDeclaration":
        this.defineSymbol({ name: node.name, kind: "var", type: node.varType, file: this.file, line: node.line, col: node.col });
        break;
      case "TypeDeclaration":
        this.defineSymbol({ name: node.name, kind: "type", file: this.file, line: node.line, col: node.col });
        break;
      case "StoreDeclaration":
        this.defineSymbol({ name: node.name, kind: "store", file: this.file, line: node.line, col: node.col });
        break;
      case "EmbedDeclaration":
        this.defineSymbol({ name: node.name, kind: "embed", file: this.file, line: node.line, col: node.col });
        break;
      case "FnDeclaration":
        this.defineSymbol({ name: node.name, kind: "fn", file: this.file, line: node.line, col: node.col });
        break;
      case "CommandDeclaration":
        this.defineSymbol({ name: node.name, kind: "command", file: this.file, line: node.line, col: node.col });
        this.commandNames.push(node.name);
        break;
      case "EventDeclaration":
        this.defineSymbol({ name: node.name, kind: "event", file: this.file, line: node.line, col: node.col });
        break;
      case "BotDeclaration":
        this.botBlockCount++;
        this.hasBotBlock = true;
        if (this.botBlockCount > 1) {
          this.errors.push(Errors.multipleBotBlocks(this.file, node.line, node.col));
        }
        break;
      case "NodeDeclaration":
        this.collectDeclarations(node.body);
        break;
      case "Export":
        this.collectDeclaration(node.declaration);
        break;
    }
  }

  private defineSymbol(sym: Symbol) {
    if (this.currentScope.symbols.has(sym.name)) {
      const existing = this.currentScope.symbols.get(sym.name)!;
      this.errors.push(Errors.duplicateDeclaration(sym.name, this.file, sym.line, sym.col));
    } else {
      this.currentScope.symbols.set(sym.name, sym);
    }
  }

  private lookupSymbol(name: string): Symbol | undefined {
    let scope: Scope | undefined = this.currentScope;
    while (scope) {
      if (scope.symbols.has(name)) return scope.symbols.get(name);
      scope = scope.parent;
    }
    return undefined;
  }

  private pushScope(): Scope {
    const scope: Scope = { symbols: new Map(), parent: this.currentScope };
    this.currentScope = scope;
    return scope;
  }

  private popScope() {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  // ─── Second Pass: Resolve Bodies ─────────────────────────────────────────

  private resolveNodes(nodes: ASTNode[]) {
    for (const node of nodes) {
      this.resolveNode(node);
    }
  }

  private resolveNode(node: ASTNode) {
    switch (node.kind) {
      case "ConstDeclaration":     this.resolveExpr(node.value); break;
      case "LetDeclaration":       this.resolveExpr(node.value); break;
      case "VarDeclaration":       this.resolveExpr(node.value); break;
      case "TypeDeclaration":      break; // purely structural
      case "StoreDeclaration":     this.resolveStoreDecl(node); break;
      case "EmbedDeclaration":     this.resolveEmbedDecl(node); break;
      case "NodeDeclaration":      this.resolveNodes(node.body); break;
      case "BotDeclaration":       node.fields.forEach(f => this.resolveExpr(f.value)); break;
      case "CommandDeclaration":   this.resolveCommand(node); break;
      case "EventDeclaration":     this.resolveEvent(node); break;
      case "FnDeclaration":        this.resolveFn(node); break;
      case "IfStatement":          this.resolveIf(node); break;
      case "MatchStatement":       this.resolveMatch(node); break;
      case "ForInStatement":       this.resolveForIn(node); break;
      case "ForRangeStatement":    this.resolveForRange(node); break;
      case "WhileStatement":       this.resolveWhile(node); break;
      case "TryCatchStatement":    this.resolveTryCatch(node); break;
      case "ReturnStatement":      if (node.value) this.resolveExpr(node.value); break;
      case "ThrowStatement":       this.resolveExpr(node.value); break;
      case "EmitStatement":        node.args.forEach(a => this.resolveExpr(a)); break;
      case "ReplyStatement":       this.resolveReply(node); break;
      case "DmStatement":          this.resolveDm(node); break;
      case "LogStatement":         this.resolveExpr(node.value); break;
      case "AssignStatement":      this.resolveAssign(node); break;
      case "ExpressionStatement":  this.resolveExpr(node.expression); break;
      case "EveryStatement":       this.resolveNodes(node.body); break;
      case "AfterStatement":       this.resolveNodes(node.body); break;
      case "PaginateStatement":    break;
      case "ModalStatement":       this.resolveNodes(node.onSubmitBody); break;
      case "SelectStatement":      this.resolveNodes(node.onSelectBody); break;
      case "Import":               this.resolveImport(node); break;
      case "Export":               this.resolveNode(node.declaration); break;
      case "JsEscapeStatement":    break; // raw JS, no resolution
      case "RoleStatement":
        this.resolveExpr(node.member);
        this.resolveExpr(node.role);
        break;
      case "WaitStatement":        break;
      case "ReactStatement":       this.resolveExpr(node.emoji); break;
    }
  }

  private resolveStoreDecl(node: StoreDeclaration) {
    if (!node.scope) {
      this.errors.push(Errors.storeScopeMissing(node.name, this.file, node.line, node.col));
    }
    for (const f of node.fields) {
      if (f.defaultValue) this.resolveExpr(f.defaultValue);
    }
  }

  private resolveEmbedDecl(node: EmbedDeclaration) {
    if (node.extends) {
      const sym = this.lookupSymbol(node.extends);
      if (!sym) {
        this.errors.push(Errors.undefinedType(node.extends, this.file, node.line, node.col));
      }
    }
    node.properties.forEach(p => this.resolveExpr(p.value));
  }

  private resolveCommand(node: CommandDeclaration) {
    this.pushScope();

    // Validate permission
    const permOpt = node.options.find(o => o.key === "permission");
    if (permOpt) {
      const pval = this.getStringValue(permOpt.value);
      const valid = ["@everyone", "@mod", "@admin", "@owner", "@botowner"];
      if (pval && !valid.includes(pval)) {
        this.errors.push(Errors.invalidPermission(pval, this.file, node.line, node.col));
      }
    }

    // Validate cooldown format
    const cooldownOpt = node.options.find(o => o.key === "cooldown");
    if (cooldownOpt) {
      const cval = this.getStringValue(cooldownOpt.value);
      if (cval && !/^\d+[smhd]$/.test(cval)) {
        this.errors.push(Errors.invalidCooldown(cval, this.file, node.line, node.col));
      }
    }

    // Register params as scope variables
    for (const p of node.params) {
      this.currentScope.symbols.set(p.name, { name: p.name, kind: "param", file: this.file, line: node.line, col: node.col });
    }
    // Register run params (ctx etc.)
    for (const p of node.runParams) {
      this.currentScope.symbols.set(p, { name: p, kind: "param", file: this.file, line: node.line, col: node.col });
    }

    // Collect and resolve body
    this.collectDeclarations(node.body);
    this.resolveNodes(node.body);

    // Collect button IDs
    this.collectButtonIds(node);

    this.popScope();
  }

  private collectButtonIds(node: CommandDeclaration) {
    for (const stmt of node.body) {
      if (stmt.kind === "ReplyStatement") {
        const checkButton = (btn: import("./types").ButtonNode) => {
          if (btn.id) {
            const idVal = this.getStringValue(btn.id);
            if (idVal) {
              if (this.buttonIds.has(idVal)) {
                this.warnings.push(new NZSError("NZS009",
                  `Duplicate button id '${idVal}' — second handler will overwrite the first`,
                  this.file, node.line, node.col));
              }
              this.buttonIds.set(idVal, { file: this.file, line: node.line });
            }
          }
        };
        if (stmt.button) checkButton(stmt.button);
        if (stmt.buttons) {
          for (const row of stmt.buttons) {
            for (const btn of row.buttons) checkButton(btn);
          }
        }
        // Validate button row counts
        if (stmt.buttons) {
          if (stmt.buttons.length > 5) {
            this.errors.push(new NZSError("NZS001", "Maximum 5 button rows per message", this.file, node.line, node.col));
          }
          for (const row of stmt.buttons) {
            if (row.buttons.length > 5) {
              this.errors.push(new NZSError("NZS001", "Maximum 5 buttons per row", this.file, node.line, node.col));
            }
          }
        }
      }
    }
  }

  private resolveEvent(node: EventDeclaration) {
    this.pushScope();
    for (const p of node.params) {
      this.currentScope.symbols.set(p, { name: p, kind: "param", file: this.file, line: node.line, col: node.col });
    }
    this.collectDeclarations(node.body);
    this.resolveNodes(node.body);
    this.popScope();
  }

  private resolveFn(node: FnDeclaration) {
    this.pushScope();
    for (const p of node.params) {
      this.currentScope.symbols.set(p.name, { name: p.name, kind: "param", type: p.type, file: this.file, line: node.line, col: node.col });
      if (p.defaultValue) this.resolveExpr(p.defaultValue);
    }
    this.collectDeclarations(node.body);
    this.resolveNodes(node.body);
    this.popScope();
  }

  private resolveIf(node: IfStatement) {
    this.resolveExpr(node.condition);
    this.pushScope(); this.resolveNodes(node.consequent); this.popScope();
    for (const alt of node.alternates) {
      this.resolveExpr(alt.condition);
      this.pushScope(); this.resolveNodes(alt.body); this.popScope();
    }
    if (node.else) { this.pushScope(); this.resolveNodes(node.else); this.popScope(); }
  }

  private resolveMatch(node: MatchStatement) {
    this.resolveExpr(node.value);
    for (const c of node.cases) {
      this.resolveExpr(c.value);
      this.pushScope(); this.resolveNodes(c.body); this.popScope();
    }
    if (node.default) { this.pushScope(); this.resolveNodes(node.default); this.popScope(); }
  }

  private resolveForIn(node: ForInStatement) {
    this.resolveExpr(node.iterable);
    this.pushScope();
    this.currentScope.symbols.set(node.item, { name: node.item, kind: "let", file: this.file, line: node.line, col: node.col });
    if (node.index) {
      this.currentScope.symbols.set(node.index, { name: node.index, kind: "let", file: this.file, line: node.line, col: node.col });
    }
    this.resolveNodes(node.body);
    this.popScope();
  }

  private resolveForRange(node: ForRangeStatement) {
    this.resolveExpr(node.from);
    this.resolveExpr(node.to);
    this.pushScope();
    this.currentScope.symbols.set(node.variable, { name: node.variable, kind: "let", file: this.file, line: node.line, col: node.col });
    this.resolveNodes(node.body);
    this.popScope();
  }

  private resolveWhile(node: WhileStatement) {
    this.resolveExpr(node.condition);
    this.pushScope(); this.resolveNodes(node.body); this.popScope();
  }

  private resolveTryCatch(node: TryCatchStatement) {
    this.pushScope(); this.resolveNodes(node.body); this.popScope();
    for (const c of node.catches) {
      this.pushScope();
      this.currentScope.symbols.set(c.param, { name: c.param, kind: "let", file: this.file, line: 0, col: 0 });
      this.resolveNodes(c.body);
      this.popScope();
    }
    if (node.finally) { this.pushScope(); this.resolveNodes(node.finally); this.popScope(); }
  }

  private resolveReply(node: ReplyStatement) {
    if (node.message) this.resolveExpr(node.message);
    if (node.overrides) node.overrides.forEach(o => this.resolveExpr(o.value));
    if (node.inlineEmbed) node.inlineEmbed.properties.forEach(p => this.resolveExpr(p.value));
    if (node.embedName) {
      const sym = this.lookupSymbol(node.embedName);
      if (!sym && node.embedName !== "") {
        this.warnings.push(new NZSError("NZS006", `Embed '${node.embedName}' not found`, this.file, node.line, node.col));
      }
    }
    if (node.button) {
      node.button.onClick.forEach(s => this.resolveNode(s));
      if (node.button.label) this.resolveExpr(node.button.label);
    }
    if (node.buttons) {
      for (const row of node.buttons) {
        for (const btn of row.buttons) {
          if (btn.label) this.resolveExpr(btn.label);
          btn.onClick.forEach(s => this.resolveNode(s));
        }
      }
    }
  }

  private resolveDm(node: DmStatement) {
    this.resolveExpr(node.target);
    if (node.message) this.resolveExpr(node.message);
    if (node.embed) node.embed.properties.forEach(p => this.resolveExpr(p.value));
  }

  private resolveAssign(node: AssignStatement) {
    this.resolveExpr(node.value);

    // Check const reassignment
    if (node.target.kind === "Identifier") {
      const sym = this.lookupSymbol(node.target.name);
      if (sym?.isConst) {
        this.errors.push(Errors.invalidAssignment(node.target.name, this.file, node.line, node.col));
      }
    }
  }

  private resolveImport(node: ImportNode) {
    // Circular import detection (basic)
    if (this.importStack.includes(node.path)) {
      this.errors.push(Errors.circularImport(this.file, node.path));
    }
  }

  // ─── Expression Resolution ────────────────────────────────────────────────

  private resolveExpr(expr: ExpressionNode) {
    switch (expr.kind) {
      case "Identifier": {
        // Skip known globals and keywords
        const knownGlobals = new Set([
          "ctx", "client", "Math", "JSON", "Date", "console", "process",
          "env", "db", "time", "str", "random", "fetch", "Error", "true", "false", "null",
          "@everyone", "@mod", "@admin", "@owner", "@botowner",
          "playing", "watching", "listening", "competing", "default",
          "primary", "secondary", "success", "danger", "link",
          "user", "guild", "global",
        ]);
        if (knownGlobals.has(expr.name) || expr.name.startsWith("@")) break;
        const sym = this.lookupSymbol(expr.name);
        if (!sym) {
          // Only warn — the transpiler injects stdlib names we don't track
          // so be lenient here (don't hard-error on unknown identifiers)
          this.warnings.push(Errors.undefinedVariable(expr.name, this.file, expr.line, expr.col));
        }
        break;
      }
      case "BinaryExpression":
        this.resolveExpr(expr.left);
        this.resolveExpr(expr.right);
        break;
      case "UnaryExpression":
        this.resolveExpr(expr.operand);
        break;
      case "TernaryExpression":
        this.resolveExpr(expr.condition);
        this.resolveExpr(expr.consequent);
        this.resolveExpr(expr.alternate);
        break;
      case "NullCoalesce":
        this.resolveExpr(expr.left);
        this.resolveExpr(expr.right);
        break;
      case "IsExpression":
        this.resolveExpr(expr.value);
        break;
      case "MemberExpression":
        this.resolveExpr(expr.object);
        break;
      case "IndexExpression":
        this.resolveExpr(expr.object);
        this.resolveExpr(expr.index);
        break;
      case "CallExpression":
        this.resolveExpr(expr.callee);
        expr.args.forEach(a => this.resolveExpr(a));
        break;
      case "ArrowFunction":
        this.pushScope();
        for (const p of expr.params) {
          this.currentScope.symbols.set(p.name, { name: p.name, kind: "param", file: this.file, line: 0, col: 0 });
        }
        if (Array.isArray(expr.body)) {
          this.resolveNodes(expr.body);
        } else {
          this.resolveExpr(expr.body);
        }
        this.popScope();
        break;
      case "ArrayLiteral":
        expr.elements.forEach(e => this.resolveExpr(e));
        break;
      case "MapLiteral":
        expr.entries.forEach(e => { this.resolveExpr(e.key); this.resolveExpr(e.value); });
        break;
      case "TypeInstantiation":
        expr.fields.forEach(f => this.resolveExpr(f.value));
        break;
      case "TemplateLiteral":
        for (const part of expr.parts) {
          if ("expr" in part) this.resolveExpr(part.expr);
        }
        break;
      case "Literal":
        break;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getStringValue(expr: ExpressionNode): string | null {
    if (expr.kind === "Literal" && typeof expr.value === "string") return expr.value;
    if (expr.kind === "Identifier") return expr.name;
    return null;
  }
}
