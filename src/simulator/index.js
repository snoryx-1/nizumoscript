"use strict";

const readline = require("readline");
const { Lexer }    = require("../lexer/index.js");
const { Parser }   = require("../parser/index.js");
const { TokenType } = require("../lexer/index.js");
const { Compiler } = require("../compiler/index.js");
const fs   = require("fs");
const path = require("path");

// ─── ANSI colors ─────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  magenta:"\x1b[35m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
  bgBlue: "\x1b[44m",
};

function color(str, ...codes) { return codes.join("") + str + c.reset; }

// ─── Simulated users ─────────────────────────────────────────────────────────
const USERS = {
  user: {
    id: "111111111111111111",
    name: "TestUser",
    tag: "TestUser#0000",
    bot: false,
    permissions: new Set([]),
    roles: ["@everyone"],
    joinedAt: new Date().toISOString(),
  },
  moderator: {
    id: "222222222222222222",
    name: "TestMod",
    tag: "TestMod#0000",
    bot: false,
    permissions: new Set(["ModerateMembers", "KickMembers", "BanMembers"]),
    roles: ["@everyone", "Moderator"],
    joinedAt: new Date().toISOString(),
  },
  admin: {
    id: "333333333333333333",
    name: "TestAdmin",
    tag: "TestAdmin#0000",
    bot: false,
    permissions: new Set(["Administrator", "ModerateMembers", "KickMembers", "BanMembers", "ManageGuild"]),
    roles: ["@everyone", "Moderator", "Admin"],
    joinedAt: new Date().toISOString(),
  },
};

// ─── In-memory storage ───────────────────────────────────────────────────────
class SimStorage {
  constructor() { this._global = {}; this._users = {}; }
  async get(key, def = null)                    { return this._global[key] ?? def; }
  async set(key, val)                           { this._global[key] = val; return val; }
  async delete(key)                             { delete this._global[key]; }
  async has(key)                                { return key in this._global; }
  async getUser(uid, key, def = null)           { return this._users[uid]?.[key] ?? def; }
  async setUser(uid, key, val)                  { if (!this._users[uid]) this._users[uid] = {}; this._users[uid][key] = val; return val; }
  async deleteUser(uid, key)                    { if (this._users[uid]) delete this._users[uid][key]; }
  async hasUser(uid, key)                       { return !!(this._users[uid] && key in this._users[uid]); }
  dump()                                        { return { global: this._global, users: this._users }; }
  reset()                                       { this._global = {}; this._users = {}; }
}

// ─── Parse bot file into AST ─────────────────────────────────────────────────
function parseFile(filePath) {
  const source = fs.readFileSync(filePath, "utf-8");
  const tokens = new Lexer(source).tokenize();
  return new Parser(tokens).parse();
}

// ─── Extract commands and events from AST ────────────────────────────────────
function extractNodes(ast) {
  const commands = {};
  const events   = {};
  const bot      = {};

  for (const node of ast.body) {
    if (node.type === "BotDef") {
      bot.prefix = node.props.prefix;
      bot.status = node.props.status;
    }
    if (node.type === "CommandDef") commands[node.name.toLowerCase()] = node;
    if (node.type === "EventDef")   events[node.eventName.toLowerCase()] = node;
  }
  return { commands, events, bot };
}

// ─── Sim expression evaluator ────────────────────────────────────────────────
function evalExpr(node, ctx) {
  if (!node) return null;
  switch (node.type) {
    case "string":   return interpolate(node.value, ctx);
    case "number":   return node.value;
    case "boolean":  return node.value;
    case "null":     return null;
    case "array":    return node.value.map(v => evalExpr(v, ctx));
    case "duration": return node.value;
    case "identifier": return resolveId(node.name, ctx);
    case "binary":   return evalBinary(node, ctx);
    case "unary":    return evalUnary(node, ctx);
    case "call":     return evalCall(node, ctx);
    case "member":   {
      const obj = evalExpr(node.object, ctx);
      return obj?.[node.property] ?? null;
    }
    default: return null;
  }
}

function interpolate(str, ctx) {
  return str.replace(/\{([^}]+)\}/g, (_, v) => {
    const val = resolveId(v.trim(), ctx);
    return val ?? "";
  });
}

function resolveId(name, ctx) {
  const map = {
    "member":             ctx.member,
    "member.name":        ctx.member?.name,
    "member.id":          ctx.member?.id,
    "member.tag":         ctx.member?.tag,
    "member.joinedAt":    ctx.member?.joinedAt,
    "member.isBot":       ctx.member?.bot,
    "member.roles":       ctx.member?.roles?.join(", "),
    "message":            ctx.message,
    "message.content":    ctx.message,
    "server.name":        ctx.guild?.name,
    "server.id":          ctx.guild?.id,
    "server.memberCount": ctx.guild?.memberCount,
    "args":               ctx.args,
  };
  if (name.startsWith("args.")) {
    const k = name.slice(5);
    return /^\d+$/.test(k) ? ctx.args?.[parseInt(k)] : ctx.args?.[k];
  }
  if (name in map) return map[name];
  return ctx.vars?.[name] ?? null;
}

function evalBinary(node, ctx) {
  const left  = evalExpr(node.left, ctx);
  const right = evalExpr(node.right, ctx);
  switch (node.op) {
    case "+":        return left + right;
    case "-":        return left - right;
    case "*":        return left * right;
    case "/":        return left / right;
    case "%":        return left % right;
    case "==":       return left === right;
    case "!=":       return left !== right;
    case ">":        return left > right;
    case "<":        return left < right;
    case ">=":       return left >= right;
    case "<=":       return left <= right;
    case "and":      return left && right;
    case "or":       return left || right;
    case "contains": return String(left).toLowerCase().includes(String(right).toLowerCase());
    default:         return null;
  }
}

function evalUnary(node, ctx) {
  const val = evalExpr(node.expr, ctx);
  if (node.op === "not") return !val;
  if (node.op === "-")   return -val;
  return val;
}

function durationToMs(raw) {
  if (!raw) return 0;
  const n = parseInt(raw);
  if (raw.endsWith("s")) return n * 1000;
  if (raw.endsWith("m")) return n * 60000;
  if (raw.endsWith("h")) return n * 3600000;
  if (raw.endsWith("d")) return n * 86400000;
  return 0;
}

async function evalCall(node, ctx) {
  const a = node.args;
  const storage = ctx.storage;
  switch (node.name) {
    case "random":          return Math.floor(Math.random() * (evalExpr(a[1], ctx) - evalExpr(a[0], ctx) + 1)) + evalExpr(a[0], ctx);
    case "Math.round":      return Math.round(evalExpr(a[0], ctx));
    case "Math.floor":      return Math.floor(evalExpr(a[0], ctx));
    case "Math.ceil":       return Math.ceil(evalExpr(a[0], ctx));
    case "Math.abs":        return Math.abs(evalExpr(a[0], ctx));
    case "Math.min":        return Math.min(...a.map(x => evalExpr(x, ctx)));
    case "Math.max":        return Math.max(...a.map(x => evalExpr(x, ctx)));
    case "Math.pow":        return Math.pow(evalExpr(a[0], ctx), evalExpr(a[1], ctx));
    case "Math.sqrt":       return Math.sqrt(evalExpr(a[0], ctx));
    case "Time.now":        return Date.now();
    case "Time.today":      return new Date().toISOString().slice(0, 10);
    case "Storage.get":     return await storage.get(evalExpr(a[0], ctx), evalExpr(a[1], ctx));
    case "Storage.set":     return await storage.set(evalExpr(a[0], ctx), evalExpr(a[1], ctx));
    case "Storage.delete":  return await storage.delete(evalExpr(a[0], ctx));
    case "Storage.has":     return await storage.has(evalExpr(a[0], ctx));
    case "Storage.getUser": return await storage.getUser(evalExpr(a[0], ctx), evalExpr(a[1], ctx), evalExpr(a[2], ctx));
    case "Storage.setUser": return await storage.setUser(evalExpr(a[0], ctx), evalExpr(a[1], ctx), evalExpr(a[2], ctx));
    case "Storage.deleteUser": return await storage.deleteUser(evalExpr(a[0], ctx), evalExpr(a[1], ctx));
    default: return null;
  }
}

// ─── Statement executor ───────────────────────────────────────────────────────
async function execStmts(stmts, ctx) {
  for (const stmt of stmts) {
    const result = await execStmt(stmt, ctx);
    if (result === "break" || result === "return") return result;
  }
}

async function execStmt(node, ctx) {
  switch (node.type) {
    case "Reply":
    case "Send": {
      const msg = await evalExpr(node.value, ctx);
      ctx.output.push({ type: "reply", content: String(msg ?? "") });
      break;
    }
    case "SendChannel": {
      const ch  = await evalExpr(node.channel, ctx);
      const msg = await evalExpr(node.message, ctx);
      ctx.output.push({ type: "channel", channel: String(ch), content: String(msg ?? "") });
      break;
    }
    case "Dm": {
      const msg = await evalExpr(node.message, ctx);
      ctx.output.push({ type: "dm", content: String(msg ?? "") });
      break;
    }
    case "EmbedSend": {
      const embed = { type: "embed", title: null, description: null, color: null, footer: null, fields: [] };
      if (node.props.title)       embed.title       = String(await evalExpr(node.props.title, ctx) ?? "");
      if (node.props.description) embed.description = String(await evalExpr(node.props.description, ctx) ?? "");
      if (node.props.color)       embed.color       = String(await evalExpr(node.props.color, ctx) ?? "");
      if (node.props.footer)      embed.footer      = String(await evalExpr(node.props.footer, ctx) ?? "");
      for (const f of node.fields) {
        embed.fields.push({ name: String(await evalExpr(f.name, ctx) ?? ""), value: String(await evalExpr(f.value, ctx) ?? "") });
      }
      ctx.output.push(embed);
      break;
    }
    case "Log": {
      const msg = await evalExpr(node.value, ctx);
      ctx.output.push({ type: "log", content: String(msg ?? "") });
      break;
    }
    case "Ban": {
      ctx.output.push({ type: "action", content: "🔨 " + color("BAN", c.red) + " executed on " + color(ctx.member.name, c.bold) });
      break;
    }
    case "Kick": {
      ctx.output.push({ type: "action", content: "👢 " + color("KICK", c.yellow) + " executed on " + color(ctx.member.name, c.bold) });
      break;
    }
    case "Timeout": {
      const dur = node.duration?.value ?? "unknown";
      ctx.output.push({ type: "action", content: "⏱️  " + color("TIMEOUT", c.yellow) + " " + dur + " on " + color(ctx.member.name, c.bold) });
      break;
    }
    case "GiveRole": {
      const role = await evalExpr(node.role, ctx);
      ctx.output.push({ type: "action", content: "✅ Gave role " + color(String(role), c.green) + " to " + color(ctx.member.name, c.bold) });
      break;
    }
    case "RemoveRole": {
      const role = await evalExpr(node.role, ctx);
      ctx.output.push({ type: "action", content: "❌ Removed role " + color(String(role), c.red) + " from " + color(ctx.member.name, c.bold) });
      break;
    }
    case "DeleteMessage": {
      ctx.output.push({ type: "action", content: "🗑️  Message deleted" });
      break;
    }
    case "AddReaction": {
      const emoji = await evalExpr(node.emoji, ctx);
      ctx.output.push({ type: "action", content: "➕ Reaction " + String(emoji) + " added" });
      break;
    }
    case "Wait": {
      const dur = node.duration?.value ?? "0s";
      ctx.output.push({ type: "action", content: color("⏳ wait " + dur + " (skipped in sim)", c.gray) });
      break;
    }
    case "VarDecl": {
      ctx.vars[node.name] = await evalExpr(node.value, ctx);
      break;
    }
    case "VarSet": {
      const val = await evalExpr(node.value, ctx);
      const target = node.name?.name ?? node.name?.value ?? node.name;
      switch (node.op) {
        case "=":  ctx.vars[target] = val; break;
        case "+=": ctx.vars[target] = (ctx.vars[target] ?? 0) + val; break;
        case "-=": ctx.vars[target] = (ctx.vars[target] ?? 0) - val; break;
        case "*=": ctx.vars[target] = (ctx.vars[target] ?? 0) * val; break;
        case "/=": ctx.vars[target] = (ctx.vars[target] ?? 0) / val; break;
      }
      break;
    }
    case "If": {
      const cond = await evalExpr(node.condition, ctx);
      if (cond) {
        await execStmts(node.body, ctx);
      } else if (node.elseBody) {
        await execStmts(node.elseBody, ctx);
      }
      break;
    }
    case "While": {
      let guard = 0;
      while (await evalExpr(node.condition, ctx)) {
        if (++guard > 10000) { ctx.output.push({ type: "log", content: "⚠️  Loop limit reached" }); break; }
        await execStmts(node.body, ctx);
      }
      break;
    }
    case "ForEach": {
      const list = await evalExpr(node.iterable, ctx) ?? [];
      for (let i = 0; i < list.length; i++) {
        ctx.vars[node.item] = list[i];
        if (node.index) ctx.vars[node.index] = i;
        await execStmts(node.body, ctx);
      }
      break;
    }
    case "Repeat": {
      const count = await evalExpr(node.count, ctx) ?? 0;
      for (let i = 0; i < count; i++) await execStmts(node.body, ctx);
      break;
    }
    case "Break":        return "break";
    case "Return":       return "return";
    case "ExprStatement": await evalExpr(node.expr, ctx); break;
    case "Button": case "Select": case "ReactionHandler": break;
    default: break;
  }
}

// ─── Render output ────────────────────────────────────────────────────────────
function renderOutput(outputs) {
  for (const out of outputs) {
    if (out.type === "reply" || out.type === "send") {
      console.log(color("  🤖 Bot: ", c.cyan, c.bold) + out.content);
    } else if (out.type === "channel") {
      console.log(color("  🤖 Bot → #" + out.channel + ": ", c.blue, c.bold) + out.content);
    } else if (out.type === "dm") {
      console.log(color("  🤖 Bot DM: ", c.magenta, c.bold) + out.content);
    } else if (out.type === "embed") {
      console.log(color("  ┌─ 📋 Embed" + (out.color ? " [" + out.color + "]" : "") + " ─────────────────", c.blue));
      if (out.title)       console.log(color("  │ ", c.blue) + color(out.title, c.bold));
      if (out.description) console.log(color("  │ ", c.blue) + out.description);
      for (const f of out.fields) {
        console.log(color("  │ ", c.blue) + color(f.name + ": ", c.bold) + f.value);
      }
      if (out.footer) console.log(color("  │ ", c.blue) + color(out.footer, c.dim));
      console.log(color("  └─────────────────────────────────────", c.blue));
    } else if (out.type === "log") {
      console.log(color("  📝 Log: ", c.gray) + color(out.content, c.gray));
    } else if (out.type === "action") {
      console.log("  " + out.content);
    }
  }
}

// ─── Cooldown tracker ─────────────────────────────────────────────────────────
const cooldowns = new Map();

function checkCooldown(cmdName, userId, cooldownNode, ctx) {
  if (!cooldownNode) return false;
  const ms  = durationToMs(cooldownNode.value ?? String(cooldownNode));
  if (!ms) return false;
  const key = cmdName + ":" + userId;
  const now = Date.now();
  if (cooldowns.has(key)) {
    const exp = cooldowns.get(key) + ms;
    if (now < exp) {
      const left = ((exp - now) / 1000).toFixed(1);
      console.log(color("  🤖 Bot: ", c.cyan, c.bold) + "⏳ Wait " + left + "s before using this again.");
      return true;
    }
  }
  cooldowns.set(key, now);
  return false;
}

// ─── Get prefix from bot config ───────────────────────────────────────────────
function getPrefix(botConfig) {
  const p = botConfig.prefix;
  if (!p) return ["!"];
  if (p.type === "prefix_config") {
    const parts = [];
    if (p.global?.value)   parts.push(p.global.value);
    if (p.fallback?.value) parts.push(p.fallback.value);
    if (!parts.length) parts.push("!");
    parts.push("/");
    return parts;
  }
  if (p.type === "array") return p.value.map(v => v.value ?? v);
  if (p.type === "string") return [p.value];
  return ["!"];
}

// ─── Main simulator ───────────────────────────────────────────────────────────
async function sim(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(color("[NizumoScript] ❌ File not found: " + absPath, c.red));
    process.exit(1);
  }

  // parse
  let ast;
  try {
    ast = parseFile(absPath);
  } catch(err) {
    console.error(color("[NizumoScript] ❌ Parse error: " + err.message, c.red));
    process.exit(1);
  }

  const { commands, events, bot } = extractNodes(ast);
  const storage   = new SimStorage();
  const prefixes  = getPrefix(bot);
  let   currentUser = { ...USERS.user };
  let   currentChannel = "general";

  const guild = { name: "Test Server", id: "999999999999999999", memberCount: 42 };

  // ── Header ──────────────────────────────────────────────────────────────────
  console.log("\n" + color("╔══════════════════════════════════════════════╗", c.cyan));
  console.log(color("║", c.cyan) + color("     ⚡ NizumoScript Simulator v1.0.0        ", c.bold) + color("║", c.cyan));
  console.log(color("║", c.cyan) + color("     File: " + path.basename(filePath).padEnd(36), c.dim) + color("║", c.cyan));
  console.log(color("╚══════════════════════════════════════════════╝", c.cyan));
  console.log("");
  console.log(color("  👤 User:    ", c.bold) + color(currentUser.name, c.green) + color(" (" + currentUser.id + ")", c.gray));
  console.log(color("  🏠 Server:  ", c.bold) + color(guild.name, c.yellow));
  console.log(color("  📢 Channel: ", c.bold) + color("#" + currentChannel, c.blue));
  console.log(color("  🔑 Prefix:  ", c.bold) + color(prefixes.join(" or "), c.magenta));
  console.log(color("  📦 Commands: ", c.bold) + color(Object.keys(commands).join(", ") || "none", c.gray));
  console.log("");
  console.log(color("  Type a command or message. Type .help for sim commands.", c.dim));
  console.log(color("  ──────────────────────────────────────────────────────", c.gray));
  console.log("");

  // fire ready event
  if (events["ready"]) {
    const ctx = { member: currentUser, guild, message: null, args: {}, vars: {}, storage, output: [] };
    await execStmts(events["ready"].body, ctx);
    renderOutput(ctx.output);
  }

  // ── REPL ────────────────────────────────────────────────────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Persistent vars across sim session
  const simVars = {};

  const prompt = () => {
    rl.question(color("  > ", c.green, c.bold), async (input) => {
      input = input.trim();
      if (!input) { prompt(); return; }

      // ── Sim meta commands ──────────────────────────────────────────────────
      if (input.startsWith(".")) {
        const parts = input.slice(1).split(" ");
        const cmd   = parts[0].toLowerCase();

        if (cmd === "exit" || cmd === "quit") {
          console.log(color("\n  👋 Exiting simulator. Goodbye!\n", c.cyan));
          rl.close();
          process.exit(0);
        }

        if (cmd === "help") {
          console.log(color("\n  Sim Commands:", c.bold));
          console.log(color("  .user <name>     ", c.cyan) + "Switch user: user, moderator, admin");
          console.log(color("  .channel <name>  ", c.cyan) + "Switch current channel");
          console.log(color("  .storage         ", c.cyan) + "View current storage state");
          console.log(color("  .reset           ", c.cyan) + "Reset all storage data");
          console.log(color("  .cooldowns       ", c.cyan) + "Clear all cooldowns");
          console.log(color("  .commands        ", c.cyan) + "List all available commands");
          console.log(color("  .vars            ", c.cyan) + "View current variables");
  console.log(color("  .exit            ", c.cyan) + "Exit the simulator");
          console.log("");
          prompt(); return;
        }

        if (cmd === "user") {
          const name = parts[1]?.toLowerCase();
          if (!name || !USERS[name]) {
            console.log(color("  ❌ Unknown user. Try: user, moderator, admin", c.red));
          } else {
            currentUser = { ...USERS[name] };
            console.log(color("  👤 Switched to: ", c.bold) + color(currentUser.name, c.green) + color(" (Permissions: " + (currentUser.permissions.size ? [...currentUser.permissions].join(", ") : "none") + ")", c.gray));
          }
          prompt(); return;
        }

        if (cmd === "channel") {
          const ch = parts[1];
          if (!ch) { console.log(color("  ❌ Usage: .channel <name>", c.red)); }
          else { currentChannel = ch; console.log(color("  📢 Switched to channel: ", c.bold) + color("#" + ch, c.blue)); }
          prompt(); return;
        }

        if (cmd === "storage") {
          const data = storage.dump();
          console.log(color("\n  📦 Storage State:", c.bold));
          console.log(color("  Global: ", c.cyan) + JSON.stringify(data.global, null, 2).split("\n").join("\n  "));
          console.log(color("  Users:  ", c.cyan) + JSON.stringify(data.users, null, 2).split("\n").join("\n  "));
          console.log("");
          prompt(); return;
        }

        if (cmd === "reset") {
          storage.reset();
          console.log(color("  ✅ Storage reset!", c.green));
          prompt(); return;
        }

        if (cmd === "cooldowns") {
          cooldowns.clear();
          console.log(color("  ✅ All cooldowns cleared!", c.green));
          prompt(); return;
        }

        if (cmd === "vars") {
          console.log(color("\n  📦 Variables:", c.bold));
          if (!Object.keys(simVars).length) console.log(color("  (none)", c.gray));
          else Object.entries(simVars).forEach(([k,v]) => console.log(color("  " + k + " = ", c.cyan) + JSON.stringify(v)));
          console.log("");
          prompt(); return;
        }

        if (cmd === "commands") {
          console.log(color("\n  Available commands:", c.bold));
          for (const [name, node] of Object.entries(commands)) {
            const desc = node.props.description?.value ?? "No description";
            const access = node.props.access?.value ?? "everyone";
            const cooldown = node.props.cooldown?.value ?? null;
            console.log(color("  " + prefixes[0] + name, c.cyan) + color(" — " + desc, c.white) + color(" [" + access + "]" + (cooldown ? " ⏱ " + cooldown : ""), c.gray));
          }
          console.log("");
          prompt(); return;
        }

        console.log(color("  ❌ Unknown sim command. Type .help for help.", c.red));
        prompt(); return;
      }

      // ── Check if it's a command ────────────────────────────────────────────
      const usedPrefix = prefixes.find(p => input.toLowerCase().startsWith(p.toLowerCase()));

      if (usedPrefix) {
        const parts   = input.slice(usedPrefix.length).trim().split(/ +/);
        const cmdName = parts.shift().toLowerCase();
        const argList = parts;

        const cmdNode = commands[cmdName];
        if (!cmdNode) {
          console.log(color("  ❌ Unknown command: " + cmdName, c.red));
          prompt(); return;
        }

        // access check
        const access = cmdNode.props.access?.value ?? "everyone";
        if (access !== "everyone") {
          const permMap = { moderator: "ModerateMembers", admin: "Administrator", owner: "Administrator" };
          const required = permMap[access] ?? "Administrator";
          if (!currentUser.permissions.has(required)) {
            console.log(color("  🤖 Bot: ", c.cyan, c.bold) + "❌ You don't have permission to use this command.");
            prompt(); return;
          }
        }

        // cooldown check
        if (checkCooldown(cmdName, currentUser.id, cmdNode.props.cooldown, {})) {
          prompt(); return;
        }

        // build args
        const args = {};
        argList.forEach((a, i) => { args[i] = a; args[a] = a; });

        const ctx = {
          member:  currentUser,
          guild,
          message: input,
          channel: currentChannel,
          args,
          vars:    simVars,
          storage,
          output:  [],
        };

        try {
          await execStmts(cmdNode.body, ctx);
          Object.assign(simVars, ctx.vars);
          if (ctx.output.length === 0) {
            console.log(color("  🤖 Bot: ", c.cyan, c.bold) + color("(no output)", c.gray));
          } else {
            renderOutput(ctx.output);
          }
        } catch(err) {
          console.log(color("  ❌ Runtime error: " + err.message, c.red));
        }

        console.log("");
        prompt(); return;
      }

      // ── Try to execute as raw NizumoScript statement ─────────────────────
      try {
        const rawTokens = new Lexer(input).tokenize();
        const firstType = rawTokens[0]?.type;
        const stmtTypes = ["VAR","SET","LOG","REPLY","SEND","IF","WHILE","FOR","REPEAT","TRY","FUNC"];
        if (stmtTypes.includes(firstType)) {
          const rawParser = new Parser(rawTokens);
          const stmt = rawParser.parseStatement();
          const ctx = { member: currentUser, guild, message: input, channel: currentChannel, args: {}, vars: simVars, storage, output: [] };
          await execStmt(stmt, ctx);
          // persist vars
          Object.assign(simVars, ctx.vars);
          if (ctx.output.length > 0) renderOutput(ctx.output);
          else console.log(color("  ✅ Done", c.gray));
          console.log("");
          prompt(); return;
        }
      } catch(e) { /* not a raw statement, treat as message */ }

      // ── Plain message — fire on message event ──────────────────────────────
      if (events["message"]) {
        const ctx = {
          member:  currentUser,
          guild,
          message: input,
          channel: currentChannel,
          args:    {},
          vars:    simVars,
          storage,
          output:  [],
        };
        try {
          await execStmts(events["message"].body, ctx);
          Object.assign(simVars, ctx.vars);
          if (ctx.output.length > 0) renderOutput(ctx.output);
        } catch(err) {
          console.log(color("  ❌ Runtime error: " + err.message, c.red));
        }
      } else {
        console.log(color("  💬 (no on message handler)", c.gray));
      }

      console.log("");
      prompt();
    });
  };

  prompt();
}

module.exports = { sim };
