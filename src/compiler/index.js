"use strict";

class Compiler {
  constructor(ast) {
    this.ast = ast;
    this.output = [];
    this.indent = 0;
    this.imports = new Set();
  }

  i(code) { return "  ".repeat(this.indent) + code; }

  durationToMs(raw) {
    if (typeof raw !== "string") return 0;
    const n = parseInt(raw);
    if (raw.endsWith("s")) return n * 1000;
    if (raw.endsWith("m")) return n * 60000;
    if (raw.endsWith("h")) return n * 3600000;
    if (raw.endsWith("d")) return n * 86400000;
    return 0;
  }

  // ─── Expression codegen ──────────────────────────────────────────────────────

  expr(node) {
    if (!node) return "null";
    switch (node.type) {
      case "string":      return this.compileString(node.value);
      case "number":      return String(node.value);
      case "duration":    return `"${node.value}"`;
      case "boolean":     return node.value ? "true" : "false";
      case "null":        return "null";
      case "array":       return `[${node.value.map(v => this.expr(v)).join(", ")}]`;
      case "identifier":  return this.resolveIdentifier(node.name);
      case "member":      return `${this.expr(node.object)}.${node.property}`;
      case "index":       return `${this.expr(node.object)}[${this.expr(node.index)}]`;
      case "binary":      return this.compileBinary(node);
      case "unary":       return this.compileUnary(node);
      case "call":        return this.compileCall(node);
      case "method_call": return `${this.expr(node.object)}.${node.method}(${node.args.map(a => this.expr(a)).join(", ")})`;
      default:            return "null";
    }
  }

  compileString(raw) {
    // convert {variable} interpolation to JS template literals
    const converted = raw.replace(/\{([^}]+)\}/g, (_, v) => `\${${this.resolveIdentifier(v.trim())}}`);
    return "`" + converted + "`";
  }

  resolveIdentifier(name) {
    // map NizumoScript context vars to JS
    const map = {
      "member":           "__ctx.member",
      "member.name":      "__ctx.member?.displayName ?? __ctx.member?.username",
      "member.id":        "__ctx.member?.id",
      "member.tag":       "__ctx.member?.user?.tag",
      "member.avatarUrl": "__ctx.member?.user?.displayAvatarURL()",
      "member.joinedAt":  "__ctx.member?.joinedAt?.toISOString()",
      "member.isBot":     "__ctx.member?.user?.bot",
      "member.roles":     "__ctx.member?.roles?.cache?.map(r => r.name)",
      "message":          "__ctx.message?.content",
      "message.content":  "__ctx.message?.content",
      "message.author":   "__ctx.message?.author",
      "server":           "__ctx.guild",
      "server.name":      "__ctx.guild?.name",
      "server.id":        "__ctx.guild?.id",
      "server.memberCount": "__ctx.guild?.memberCount",
      "args":             "__args",
      "ctx":              "__ctx",
      "reaction":         "__ctx.reaction",
      "reaction.emoji":   "__ctx.reaction?.emoji?.name",
    };
    // check args.X
    if (name.startsWith("args.")) {
      const argName = name.slice(5);
      return `__args.${argName}`;
    }
    return map[name] ?? name;
  }

  compileBinary(node) {
    const opMap = { "==": "===", "!=": "!==", "contains": null };
    const left = this.expr(node.left);
    const right = this.expr(node.right);
    if (node.op === "contains") return `String(${left}).toLowerCase().includes(String(${right}).toLowerCase())`;
    if (node.op === "and") return `(${left} && ${right})`;
    if (node.op === "or")  return `(${left} || ${right})`;
    const op = opMap[node.op] ?? node.op;
    return `(${left} ${op} ${right})`;
  }

  compileUnary(node) {
    if (node.op === "not") return `!(${this.expr(node.expr)})`;
    return `${node.op}(${this.expr(node.expr)})`;
  }

  compileCall(node) {
    const builtins = {
      "random": (args) => `Math.floor(Math.random() * (${this.expr(args[1])} - ${this.expr(args[0])} + 1)) + ${this.expr(args[0])}`,
      "Math.round": (args) => `Math.round(${this.expr(args[0])})`,
      "Math.floor": (args) => `Math.floor(${this.expr(args[0])})`,
      "Math.ceil":  (args) => `Math.ceil(${this.expr(args[0])})`,
      "Math.abs":   (args) => `Math.abs(${this.expr(args[0])})`,
      "Math.min":   (args) => `Math.min(${args.map(a => this.expr(a)).join(", ")})`,
      "Math.max":   (args) => `Math.max(${args.map(a => this.expr(a)).join(", ")})`,
      "Math.pow":   (args) => `Math.pow(${this.expr(args[0])}, ${this.expr(args[1])})`,
      "Math.sqrt":  (args) => `Math.sqrt(${this.expr(args[0])})`,
      "Math.clamp": (args) => `Math.min(Math.max(${this.expr(args[0])}, ${this.expr(args[1])}), ${this.expr(args[2])})`,
      "Time.now":   (_)    => `Date.now()`,
      "Time.today": (_)    => `new Date().toISOString().slice(0,10)`,
      "Storage.get":     (args) => `await __storage.get(${args.map(a => this.expr(a)).join(", ")})`,
      "Storage.set":     (args) => `await __storage.set(${args.map(a => this.expr(a)).join(", ")})`,
      "Storage.getUser": (args) => `await __storage.getUser(${args.map(a => this.expr(a)).join(", ")})`,
      "Storage.setUser": (args) => `await __storage.setUser(${args.map(a => this.expr(a)).join(", ")})`,
      "Storage.delete":  (args) => `await __storage.delete(${args.map(a => this.expr(a)).join(", ")})`,
      "Storage.has":     (args) => `await __storage.has(${args.map(a => this.expr(a)).join(", ")})`,
    };
    if (builtins[node.name]) return builtins[node.name](node.args);
    return `${node.name}(${node.args.map(a => this.expr(a)).join(", ")})`;
  }

  // ─── Statement codegen ───────────────────────────────────────────────────────

  stmt(node, lines) {
    switch (node.type) {
      case "Reply":        lines.push(this.i(`if (__ctx.reply) await __ctx.reply(${this.expr(node.value)}); else if (__ctx.message) await __ctx.message.reply(${this.expr(node.value)});`)); break;
      case "Send":         lines.push(this.i(`if (__ctx.channel) await __ctx.channel.send(${this.expr(node.value)});`)); break;
      case "SendChannel":  lines.push(this.i(`{ const __ch = __ctx.guild?.channels?.cache?.find(c => c.name === ${this.expr(node.channel)}); if (__ch) await __ch.send(${this.expr(node.message)}); }`)); break;
      case "Dm":           lines.push(this.i(`{ const __dmTarget = await client.users.fetch(${this.expr(node.target)}?.id ?? ${this.expr(node.target)}); await __dmTarget?.send(${this.expr(node.message)}); }`)); break;
      case "EmbedSend":    this.compileEmbed(node, lines); break;
      case "Ban":          lines.push(this.i(`await __ctx.member?.ban({ reason: ${node.reason ? this.expr(node.reason) : '""'} });`)); break;
      case "Kick":         lines.push(this.i(`await __ctx.member?.kick(${node.reason ? this.expr(node.reason) : '""'});`)); break;
      case "Timeout":      lines.push(this.i(`await __ctx.member?.timeout(${this.durationToMs(node.duration?.value)}, "Timeout via NizumoScript");`)); break;
      case "GiveRole":     lines.push(this.i(`{ const __role = __ctx.guild?.roles?.cache?.find(r => r.name === ${this.expr(node.role)}); if (__role) await __ctx.member?.roles?.add(__role); }`)); break;
      case "RemoveRole":   lines.push(this.i(`{ const __role = __ctx.guild?.roles?.cache?.find(r => r.name === ${this.expr(node.role)}); if (__role) await __ctx.member?.roles?.remove(__role); }`)); break;
      case "DeleteMessage":lines.push(this.i(`await __ctx.message?.delete().catch(() => {});`)); break;
      case "Wait":         lines.push(this.i(`await new Promise(r => setTimeout(r, ${this.durationToMs(node.duration?.value)}));`)); break;
      case "Log":          lines.push(this.i(`console.log("[NizumoScript]", ${this.expr(node.value)});`)); break;
      case "If":           this.compileIf(node, lines); break;
      case "While":        this.compileWhile(node, lines); break;
      case "ForEach":      this.compileForEach(node, lines); break;
      case "Repeat":       this.compileRepeat(node, lines); break;
      case "Break":        lines.push(this.i("break;")); break;
      case "Return":       lines.push(this.i(`return ${this.expr(node.value)};`)); break;
      case "VarDecl":      lines.push(this.i(`let ${node.name} = ${this.expr(node.value)};`)); break;
      case "VarSet":       this.compileSet(node, lines); break;
      case "FuncDecl":     this.compileFunc(node, lines); break;
      case "ExprStatement":lines.push(this.i(`${this.expr(node.expr)};`)); break;
      default:             lines.push(this.i(`// unknown stmt: ${node.type}`));
    }
  }

  compileEmbed(node, lines) {
    lines.push(this.i(`{`));
    this.indent++;
    lines.push(this.i(`const __embed = new EmbedBuilder();`));
    if (node.props.title)       lines.push(this.i(`__embed.setTitle(${this.expr(node.props.title)});`));
    if (node.props.description) lines.push(this.i(`__embed.setDescription(${this.expr(node.props.description)});`));
    if (node.props.color)       lines.push(this.i(`__embed.setColor(${this.expr(node.props.color)});`));
    if (node.props.footer)      lines.push(this.i(`__embed.setFooter({ text: ${this.expr(node.props.footer)} });`));
    if (node.props.image)       lines.push(this.i(`__embed.setImage(${this.expr(node.props.image)});`));
    if (node.props.thumbnail)   lines.push(this.i(`__embed.setThumbnail(${this.expr(node.props.thumbnail)});`));
    for (const field of node.fields) {
      lines.push(this.i(`__embed.addFields({ name: ${this.expr(field.name)}, value: String(${this.expr(field.value)}) });`));
    }
    lines.push(this.i(`if (__ctx.reply) await __ctx.reply({ embeds: [__embed] }); else if (__ctx.channel) await __ctx.channel.send({ embeds: [__embed] });`));
    this.indent--;
    lines.push(this.i(`}`));
  }

  compileIf(node, lines) {
    lines.push(this.i(`if (${this.expr(node.condition)}) {`));
    this.indent++;
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    if (node.elseBody) {
      if (node.elseBody[0]?.type === "If") {
        lines.push(this.i(`} else `));
        this.compileIf(node.elseBody[0], lines);
        return;
      }
      lines.push(this.i(`} else {`));
      this.indent++;
      node.elseBody.forEach(s => this.stmt(s, lines));
      this.indent--;
    }
    lines.push(this.i(`}`));
  }

  compileWhile(node, lines) {
    lines.push(this.i(`let __loopGuard = 0;`));
    lines.push(this.i(`while (${this.expr(node.condition)}) {`));
    this.indent++;
    lines.push(this.i(`if (++__loopGuard > 10000) { console.error("[NizumoScript] Loop limit reached"); break; }`));
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i(`}`));
  }

  compileForEach(node, lines) {
    const iterable = this.expr(node.iterable);
    lines.push(this.i(`let __idx_${node.item} = 0;`));
    lines.push(this.i(`for (const ${node.item} of (${iterable} ?? [])) {`));
    this.indent++;
    if (node.index) lines.push(this.i(`const ${node.index} = __idx_${node.item}++;`));
    node.body.forEach(s => this.stmt(s, lines));
    if (!node.index) lines.push(this.i(`__idx_${node.item}++;`));
    this.indent--;
    lines.push(this.i(`}`));
  }

  compileRepeat(node, lines) {
    lines.push(this.i(`for (let __ri = 0; __ri < ${this.expr(node.count)}; __ri++) {`));
    this.indent++;
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i(`}`));
  }

  compileSet(node, lines) {
    const target = this.expr(node.name);
    lines.push(this.i(`${target} ${node.op} ${this.expr(node.value)};`));
  }

  compileFunc(node, lines) {
    lines.push(this.i(`async function ${node.name}(${node.params.join(", ")}) {`));
    this.indent++;
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i(`}`));
  }

  stmts(nodes) {
    const lines = [];
    nodes.forEach(s => this.stmt(s, lines));
    return lines.join("\n");
  }

  // ─── Access level helper ─────────────────────────────────────────────────────

  accessCheck(access) {
    if (!access) return "";
    const val = access.value ?? access;
    if (val === "everyone") return "";
    const permMap = {
      moderator:   "ModerateMembers",
      admin:       "Administrator",
      owner:       "Administrator",
      manage:      "ManageGuild",
      ban:         "BanMembers",
      kick:        "KickMembers",
    };
    const perm = permMap[String(val).toLowerCase()] ?? "Administrator";
    return `if (!__ctx.member?.permissions?.has("${perm}")) { if (__ctx.reply) await __ctx.reply("❌ You don't have permission to use this command."); return; }`;
  }

  cooldownCode(name, cooldown) {
    if (!cooldown) return "";
    const ms = this.durationToMs(cooldown.value ?? String(cooldown));
    if (!ms) return "";
    return `
  if (!client.__cooldowns.has("${name}")) client.__cooldowns.set("${name}", new Map());
  const __cd = client.__cooldowns.get("${name}");
  const __now = Date.now();
  if (__cd.has(__ctx.member?.id)) {
    const __exp = __cd.get(__ctx.member?.id) + ${ms};
    if (__now < __exp) {
      const __left = ((__exp - __now) / 1000).toFixed(1);
      if (__ctx.reply) await __ctx.reply(\`⏳ Wait \${__left}s before using this again.\`);
      return;
    }
  }
  __cd.set(__ctx.member?.id, __now);
  setTimeout(() => __cd.delete(__ctx.member?.id), ${ms});`;
  }

  // ─── Top-level node compilation ──────────────────────────────────────────────

  compileBot(node) {
    const props = node.props;
    const prefix = props.prefix ? this.expr(props.prefix) : '"!"';
    const status = props.status ? this.expr(props.status) : null;

    return `
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const __NzStorage = require("./__storage.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ]
});

client.__commands  = new Collection();
client.__cooldowns = new Map();
client.__aliases   = new Map();
const __storage    = new __NzStorage();
const PREFIXES     = [${prefix}, "/"];

client.once("ready", () => {
  console.log(\`[NizumoScript] ✅ \${client.user.tag} is online!\`);
  ${status ? `client.user.setActivity(${status});` : ""}
});
    `.trim();
  }

  compileCommand(node) {
    const { name, props, body } = node;
    const accessCode  = this.accessCheck(props.access);
    const cooldownCode = this.cooldownCode(name, props.cooldown);
    const aliases = props.aliases ? props.aliases.value.map(a => this.expr(a)).join(", ") : "";

    this.indent = 2;
    const bodyCode = this.stmts(body);
    this.indent = 0;

    return `
client.__commands.set("${name}", {
  name: "${name}",
  description: ${props.description ? this.expr(props.description) : `"A NizumoScript command"`},
  aliases: [${aliases}],
  async execute(__ctx, __args) {
    ${accessCode}
    ${cooldownCode}
${bodyCode}
  }
});
${aliases ? `[${aliases}].forEach(a => client.__aliases.set(a, "${name}"));` : ""}
    `.trim();
  }

  compileEvent(node) {
    const eventMap = {
      ready:        "ready",
      message:      "messageCreate",
      memberjoin:   "guildMemberAdd",
      memberleave:  "guildMemberRemove",
      guildcreate:  "guildCreate",
      reactionadd:  "messageReactionAdd",
      reactionremove:"messageReactionRemove",
      messagedelete:"messageDelete",
    };
    const discordEvent = eventMap[node.eventName.toLowerCase()] ?? node.eventName;

    this.indent = 2;
    const bodyCode = this.stmts(node.body);
    this.indent = 0;

    // build context object per event type
    let ctxSetup = `const __ctx = { member, guild: member?.guild };`;
    if (discordEvent === "messageCreate") {
      ctxSetup = `
  if (message.author.bot) return;
  const __ctx = { member: message.member, guild: message.guild, message, channel: message.channel, reply: (m) => message.reply(m) };
  const __args = {};`;
    } else if (discordEvent === "messageReactionAdd" || discordEvent === "messageReactionRemove") {
      ctxSetup = `const __ctx = { reaction, member: user, guild: reaction.message.guild }; const __args = {};`;
    } else if (discordEvent === "guildMemberAdd" || discordEvent === "guildMemberRemove") {
      ctxSetup = `const __ctx = { member, guild: member.guild }; const __args = {};`;
    } else if (discordEvent === "messageDelete") {
      ctxSetup = `const __ctx = { message, guild: message.guild }; const __args = {};`;
    } else if (discordEvent === "ready") {
      ctxSetup = `const __ctx = {}; const __args = {};`;
    }

    return `
client.on("${discordEvent}", async (...__evArgs) => {
  const [${this.eventParams(discordEvent)}] = __evArgs;
  ${ctxSetup}
  try {
${bodyCode}
  } catch(err) { console.error("[NizumoScript Event Error]", err); }
});
    `.trim();
  }

  eventParams(event) {
    const map = {
      messageCreate: "message",
      guildMemberAdd: "member",
      guildMemberRemove: "member",
      messageReactionAdd: "reaction, user",
      messageReactionRemove: "reaction, user",
      messageDelete: "message",
      ready: "",
    };
    return map[event] ?? "data";
  }

  compileTask(node) {
    const ms = node.interval ? this.durationToMs(node.interval.value ?? String(node.interval)) : 60000;
    this.indent = 2;
    const bodyCode = this.stmts(node.body);
    this.indent = 0;
    return `
setInterval(async () => {
  const __ctx = {}; const __args = {};
  try {
${bodyCode}
    console.log("[NizumoScript] ✅ Task '${node.name}' ran.");
  } catch(err) { console.error("[NizumoScript Task Error]", err); }
}, ${ms});
    `.trim();
  }

  compileMessageHandler() {
    return `
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const usedPrefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;
  const args   = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const cmdName = args.shift().toLowerCase();
  const cmd = client.__commands.get(cmdName) ?? client.__commands.get(client.__aliases.get(cmdName));
  if (!cmd) return;
  const __ctx = {
    member:  message.member,
    guild:   message.guild,
    message,
    channel: message.channel,
    reply:   (m) => message.reply(m),
  };
  const __args = {};
  args.forEach((a, i) => { __args[i] = a; });
  try { await cmd.execute(__ctx, __args); }
  catch(err) {
    console.error("[NizumoScript Error]", err);
    await message.reply("❌ Something went wrong.").catch(() => {});
  }
});
    `.trim();
  }

  compile() {
    const nodes = this.ast.body;
    const botNode = nodes.find(n => n.type === "BotDef");
    const hasMessageEvent = nodes.some(n => n.type === "EventDef" && n.eventName.toLowerCase() === "message");

    // header
    this.output.push(this.compileBot(botNode ?? { type: "BotDef", name: "NizumoBot", props: {} }));

    // top-level functions
    for (const node of nodes) {
      if (node.type === "FuncDecl") {
        const lines = [];
        this.compileFunc(node, lines);
        this.output.push(lines.join("\n"));
      }
    }

    // commands
    for (const node of nodes) {
      if (node.type === "CommandDef") this.output.push(this.compileCommand(node));
    }

    // message handler (only if no manual ON message event)
    if (!hasMessageEvent) this.output.push(this.compileMessageHandler());

    // events
    for (const node of nodes) {
      if (node.type === "EventDef") this.output.push(this.compileEvent(node));
    }

    // tasks
    for (const node of nodes) {
      if (node.type === "TaskDef") this.output.push(this.compileTask(node));
    }

    // login
    this.output.push(`client.login(process.env.TOKEN);`);

    return this.output.join("\n\n");
  }
}

module.exports = { Compiler };
