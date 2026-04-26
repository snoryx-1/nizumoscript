"use strict";

class Compiler {
  constructor(ast) {
    this.ast    = ast;
    this.output = [];
    this.indent = 0;
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

  capitalise(s) {
    if (!s) return "Primary";
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  compilePrefixes(prefixProp) {
    if (!prefixProp) return '["!", "/"]';
    if (prefixProp.type === "prefix_config") {
      const parts = [];
      if (prefixProp.global)   parts.push(this.expr(prefixProp.global));
      if (prefixProp.fallback) parts.push(this.expr(prefixProp.fallback));
      if (!parts.length) parts.push('"!"');
      if (!parts.includes('"/"')) parts.push('"/"');
      return "[" + parts.join(", ") + "]";
    }
    if (prefixProp.type === "array") {
      const items = prefixProp.value.map(v => this.expr(v));
      if (!items.includes('"/"')) items.push('"/"');
      return "[" + items.join(", ") + "]";
    }
    return "[" + this.expr(prefixProp) + ', "/"]';
  }

  compileMentionPrefix(prefixProp) {
    if (prefixProp && prefixProp.type === "prefix_config" && prefixProp.mention) return "true";
    return "false";
  }

  expr(node) {
    if (!node) return "null";
    switch (node.type) {
      case "string":      return this.compileString(node.value);
      case "number":      return String(node.value);
      case "duration":    return JSON.stringify(node.value);
      case "boolean":     return node.value ? "true" : "false";
      case "null":        return "null";
      case "array":       return "[" + node.value.map(v => this.expr(v)).join(", ") + "]";
      case "identifier":  return this.resolveIdentifier(node.name);
      case "member":      return this.expr(node.object) + "." + node.property;
      case "index":       return this.expr(node.object) + "[" + this.expr(node.index) + "]";
      case "binary":      return this.compileBinary(node);
      case "unary":       return this.compileUnary(node);
      case "call":        return this.compileCall(node);
      case "method_call": return this.expr(node.object) + "." + node.method + "(" + node.args.map(a => this.expr(a)).join(", ") + ")";
      default:            return "null";
    }
  }

  compileString(raw) {
    const converted = raw.replace(/\{([^}]+)\}/g, (_, v) => {
      return "${" + this.resolveIdentifier(v.trim()) + "}";
    });
    return "`" + converted + "`";
  }

  resolveIdentifier(name) {
    const map = {
      "member":             "__ctx.member",
      "member.name":        "(__ctx.member?.displayName ?? __ctx.member?.user?.username)",
      "member.id":          "__ctx.member?.id",
      "member.tag":         "__ctx.member?.user?.tag",
      "member.avatarUrl":   "__ctx.member?.user?.displayAvatarURL()",
      "member.joinedAt":    "__ctx.member?.joinedAt?.toISOString()",
      "member.isBot":       "__ctx.member?.user?.bot",
      "member.roles":       "__ctx.member?.roles?.cache?.map(r => r.name)",
      "message":            "__ctx.message?.content",
      "message.content":    "__ctx.message?.content",
      "message.author":     "__ctx.message?.author",
      "server":             "__ctx.guild",
      "server.name":        "__ctx.guild?.name",
      "server.id":          "__ctx.guild?.id",
      "server.memberCount": "__ctx.guild?.memberCount",
      "args":               "__args",
      "ctx":                "__ctx",
      "reaction":           "__ctx.reaction",
      "reaction.emoji":     "__ctx.reaction?.emoji?.name",
    };
    if (name.startsWith("args.")) {
      const arg = name.slice(5);
      return /^\d+$/.test(arg) ? "__args[" + arg + "]" : "__args." + arg;
    }
    return map[name] ?? name;
  }

  compileBinary(node) {
    const left  = this.expr(node.left);
    const right = this.expr(node.right);
    if (node.op === "contains") return "String(" + left + ").toLowerCase().includes(String(" + right + ").toLowerCase())";
    if (node.op === "and")      return "(" + left + " && " + right + ")";
    if (node.op === "or")       return "(" + left + " || " + right + ")";
    const opMap = { "==": "===", "!=": "!==" };
    return "(" + left + " " + (opMap[node.op] ?? node.op) + " " + right + ")";
  }

  compileUnary(node) {
    if (node.op === "not") return "!(" + this.expr(node.expr) + ")";
    return node.op + "(" + this.expr(node.expr) + ")";
  }

  compileCall(node) {
    const a = node.args;
    const builtins = {
      "random":          () => "Math.floor(Math.random() * (" + this.expr(a[1]) + " - " + this.expr(a[0]) + " + 1)) + " + this.expr(a[0]),
      "Math.round":      () => "Math.round(" + this.expr(a[0]) + ")",
      "Math.floor":      () => "Math.floor(" + this.expr(a[0]) + ")",
      "Math.ceil":       () => "Math.ceil("  + this.expr(a[0]) + ")",
      "Math.abs":        () => "Math.abs("   + this.expr(a[0]) + ")",
      "Math.min":        () => "Math.min("   + a.map(x => this.expr(x)).join(", ") + ")",
      "Math.max":        () => "Math.max("   + a.map(x => this.expr(x)).join(", ") + ")",
      "Math.pow":        () => "Math.pow("   + this.expr(a[0]) + ", " + this.expr(a[1]) + ")",
      "Math.sqrt":       () => "Math.sqrt("  + this.expr(a[0]) + ")",
      "Time.now":        () => "Date.now()",
      "Time.today":      () => "new Date().toISOString().slice(0,10)",
      "Storage.get":     () => "await __storage.get("     + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.set":     () => "await __storage.set("     + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.getUser": () => "await __storage.getUser(" + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.setUser": () => "await __storage.setUser(" + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.delete":  () => "await __storage.delete("  + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.has":     () => "await __storage.has("     + a.map(x => this.expr(x)).join(", ") + ")",
    };
    if (builtins[node.name]) return builtins[node.name]();
    return node.name + "(" + a.map(x => this.expr(x)).join(", ") + ")";
  }

  stmt(node, lines) {
    switch (node.type) {
      case "Reply":
        lines.push(this.i("if (__ctx.reply) await __ctx.reply(" + this.expr(node.value) + "); else if (__ctx.message) await __ctx.message.reply(" + this.expr(node.value) + ");"));
        break;
      case "Send":
        lines.push(this.i("if (__ctx.channel) await __ctx.channel.send(" + this.expr(node.value) + ");"));
        break;
      case "SendChannel":
        lines.push(this.i("{ const __ch = __ctx.guild?.channels?.cache?.find(c => c.name === " + this.expr(node.channel) + "); if (__ch) await __ch.send(" + this.expr(node.message) + "); }"));
        break;
      case "Dm":
        lines.push(this.i("{ try { const __dmU = await client.users.fetch(String(" + this.expr(node.target) + "?.id ?? " + this.expr(node.target) + ")); await __dmU?.send(" + this.expr(node.message) + "); } catch(e){} }"));
        break;
      case "EmbedSend":
        this.compileEmbed(node, lines);
        break;
      case "Ban":
        lines.push(this.i("await __ctx.member?.ban({ reason: " + (node.reason ? this.expr(node.reason) : '""') + " }).catch(()=>{});"));
        break;
      case "Kick":
        lines.push(this.i("await __ctx.member?.kick(" + (node.reason ? this.expr(node.reason) : '""') + ").catch(()=>{});"));
        break;
      case "Timeout":
        lines.push(this.i("await __ctx.member?.timeout(" + this.durationToMs(node.duration?.value) + ", 'Timeout').catch(()=>{});"));
        break;
      case "GiveRole":
        lines.push(this.i("{ const __r = __ctx.guild?.roles?.cache?.find(r => r.name === " + this.expr(node.role) + "); if (__r) await __ctx.member?.roles?.add(__r).catch(()=>{}); }"));
        break;
      case "RemoveRole":
        lines.push(this.i("{ const __r = __ctx.guild?.roles?.cache?.find(r => r.name === " + this.expr(node.role) + "); if (__r) await __ctx.member?.roles?.remove(__r).catch(()=>{}); }"));
        break;
      case "DeleteMessage":
        lines.push(this.i("await __ctx.message?.delete().catch(()=>{});"));
        break;
      case "Wait":
        lines.push(this.i("await new Promise(r => setTimeout(r, " + this.durationToMs(node.duration?.value) + "));"));
        break;
      case "Log":
        lines.push(this.i("console.log('[NizumoScript]', " + this.expr(node.value) + ");"));
        break;
      case "AddReaction":
        lines.push(this.i("await __ctx.message?.react(" + this.expr(node.emoji) + ").catch(()=>{});"));
        break;
      case "If":           this.compileIf(node, lines);      break;
      case "While":        this.compileWhile(node, lines);   break;
      case "ForEach":      this.compileForEach(node, lines); break;
      case "Repeat":       this.compileRepeat(node, lines);  break;
      case "Break":        lines.push(this.i("break;"));     break;
      case "Return":       lines.push(this.i("return " + this.expr(node.value) + ";")); break;
      case "VarDecl":      lines.push(this.i("let " + node.name + " = " + this.expr(node.value) + ";")); break;
      case "VarSet":       this.compileSet(node, lines);     break;
      case "FuncDecl":     this.compileFunc(node, lines);    break;
      case "ExprStatement":lines.push(this.i(this.expr(node.expr) + ";")); break;
      case "Button": case "Select": case "ReactionHandler":  break;
      default: lines.push(this.i("// unknown: " + node.type));
    }
  }

  compileEmbed(node, lines) {
    lines.push(this.i("{"));
    this.indent++;
    lines.push(this.i("const __embed = new EmbedBuilder();"));
    if (node.props.title)       lines.push(this.i("__embed.setTitle("       + this.expr(node.props.title)       + ");"));
    if (node.props.description) lines.push(this.i("__embed.setDescription(" + this.expr(node.props.description) + ");"));
    if (node.props.color)       lines.push(this.i("__embed.setColor("       + this.expr(node.props.color)       + ");"));
    if (node.props.footer)      lines.push(this.i("__embed.setFooter({ text: " + this.expr(node.props.footer) + " });"));
    if (node.props.image)       lines.push(this.i("__embed.setImage("       + this.expr(node.props.image)       + ");"));
    if (node.props.thumbnail)   lines.push(this.i("__embed.setThumbnail("   + this.expr(node.props.thumbnail)   + ");"));
    for (const f of node.fields) {
      lines.push(this.i("__embed.addFields({ name: " + this.expr(f.name) + ", value: String(" + this.expr(f.value) + ") });"));
    }
    lines.push(this.i("if (__ctx.reply) await __ctx.reply({ embeds: [__embed] }); else if (__ctx.channel) await __ctx.channel.send({ embeds: [__embed] });"));
    this.indent--;
    lines.push(this.i("}"));
  }

  compileIf(node, lines) {
    lines.push(this.i("if (" + this.expr(node.condition) + ") {"));
    this.indent++;
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    if (node.elseBody) {
      if (node.elseBody[0]?.type === "If") {
        lines.push(this.i("} else if (" + this.expr(node.elseBody[0].condition) + ") {"));
        this.indent++;
        node.elseBody[0].body.forEach(s => this.stmt(s, lines));
        this.indent--;
        if (node.elseBody[0].elseBody) {
          lines.push(this.i("} else {"));
          this.indent++;
          node.elseBody[0].elseBody.forEach(s => this.stmt(s, lines));
          this.indent--;
        }
        lines.push(this.i("}"));
        return;
      }
      lines.push(this.i("} else {"));
      this.indent++;
      node.elseBody.forEach(s => this.stmt(s, lines));
      this.indent--;
    }
    lines.push(this.i("}"));
  }

  compileWhile(node, lines) {
    lines.push(this.i("let __lg = 0;"));
    lines.push(this.i("while (" + this.expr(node.condition) + ") {"));
    this.indent++;
    lines.push(this.i("if (++__lg > 10000) { console.error('[NizumoScript] Loop limit'); break; }"));
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i("}"));
  }

  compileForEach(node, lines) {
    lines.push(this.i("let __idx_" + node.item + " = 0;"));
    lines.push(this.i("for (const " + node.item + " of (" + this.expr(node.iterable) + " ?? [])) {"));
    this.indent++;
    if (node.index) lines.push(this.i("const " + node.index + " = __idx_" + node.item + "++;"));
    node.body.forEach(s => this.stmt(s, lines));
    if (!node.index) lines.push(this.i("__idx_" + node.item + "++;"));
    this.indent--;
    lines.push(this.i("}"));
  }

  compileRepeat(node, lines) {
    lines.push(this.i("for (let __ri = 0; __ri < " + this.expr(node.count) + "; __ri++) {"));
    this.indent++;
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i("}"));
  }

  compileSet(node, lines) {
    lines.push(this.i(this.expr(node.name) + " " + node.op + " " + this.expr(node.value) + ";"));
  }

  compileFunc(node, lines) {
    lines.push(this.i("async function " + node.name + "(" + node.params.join(", ") + ") {"));
    this.indent++;
    node.body.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i("}"));
  }

  stmts(nodes) {
    const lines = [];
    nodes.forEach(s => this.stmt(s, lines));
    return lines.join("\n");
  }

  accessCheck(access) {
    if (!access) return "";
    const val = access.value ?? access;
    if (val === "everyone") return "";
    const permMap = { moderator: "ModerateMembers", admin: "Administrator", owner: "Administrator", manage: "ManageGuild", ban: "BanMembers", kick: "KickMembers" };
    const perm = permMap[String(val).toLowerCase()] ?? "Administrator";
    return "if (!__ctx.member?.permissions?.has(\"" + perm + "\")) { if (__ctx.reply) await __ctx.reply(\"❌ You don't have permission.\"); return; }";
  }

  cooldownCode(name, cooldown) {
    if (!cooldown) return "";
    const ms = this.durationToMs(cooldown.value ?? String(cooldown));
    if (!ms) return "";
    return [
      "if (!client.__cooldowns.has(\"" + name + "\")) client.__cooldowns.set(\"" + name + "\", new Map());",
      "    const __cd = client.__cooldowns.get(\"" + name + "\");",
      "    const __now = Date.now();",
      "    if (__cd.has(__ctx.member?.id)) {",
      "      const __exp = __cd.get(__ctx.member?.id) + " + ms + ";",
      "      if (__now < __exp) {",
      "        const __left = ((__exp - __now) / 1000).toFixed(1);",
      "        if (__ctx.reply) await __ctx.reply(`\u23f3 Wait ${__left}s before using this again.`);",
      "        return;",
      "      }",
      "    }",
      "    __cd.set(__ctx.member?.id, __now);",
      "    setTimeout(() => __cd.delete(__ctx.member?.id), " + ms + ");",
    ].join("\n");
  }

  compileBot(node) {
    const props    = node.props;
    const prefixes = this.compilePrefixes(props.prefix);
    const mention  = this.compileMentionPrefix(props.prefix);
    const status   = props.status ? this.expr(props.status) : null;
    const lines = [
      'const { Client, GatewayIntentBits, Collection, EmbedBuilder,',
      '        ActionRowBuilder, ButtonBuilder, ButtonStyle,',
      '        StringSelectMenuBuilder, REST, Routes, SlashCommandBuilder } = require("discord.js");',
      'require("dotenv").config();',
      'const __NzStorage = require("./__storage.js");',
      '',
      'const client = new Client({ intents: [',
      '  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,',
      '  GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages,',
      '] });',
      '',
      'client.__commands      = new Collection();',
      'client.__slashCommands = new Collection();',
      'client.__cooldowns     = new Map();',
      'client.__aliases       = new Map();',
      'client.__cmdPrefixes   = new Map();',
      'client.__slashDefs     = [];',
      'const __storage        = new __NzStorage();',
      'const PREFIXES         = ' + prefixes + ';',
      'const MENTION_PREFIX   = ' + mention + ';',
      '',
      'client.once("ready", async () => {',
      '  console.log(`[NizumoScript] \u2705 ${client.user.tag} is online!`);',
    ];
    if (status) lines.push('  client.user.setActivity(' + status + ');');
    lines.push(
      '  if (client.__slashDefs.length > 0) {',
      '    try {',
      '      const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);',
      '      await rest.put(Routes.applicationCommands(client.user.id), { body: client.__slashDefs });',
      '      console.log(`[NizumoScript] \u2705 Registered ${client.__slashDefs.length} slash command(s)`);',
      '    } catch(e) { console.error("[NizumoScript] Slash failed:", e.message); }',
      '  }',
      '});',
    );
    return lines.join("\n");
  }

  compileCommand(node) {
    const { name, props, body } = node;
    const accessCode   = this.accessCheck(props.access);
    const cooldownCode = this.cooldownCode(name, props.cooldown);
    const aliases      = props.aliases ? props.aliases.value.map(a => this.expr(a)).join(", ") : "";
    const errorMsg     = props.error ? this.expr(props.error) : '"❌ Something went wrong."';
    const isSlash      = props.slash === true;

    const mainBody  = body.filter(n => !["Button","Select","ReactionHandler"].includes(n.type));
    const buttons   = body.filter(n => n.type === "Button");
    const selects   = body.filter(n => n.type === "Select");
    const reactions = body.filter(n => n.type === "ReactionHandler");

    this.indent = 2;
    const bodyCode = this.stmts(mainBody);
    this.indent = 0;

    // buttons
    const btnDefs = buttons.map((btn, i) => {
      const btnId = name + "_btn_" + i;
      this.indent = 4;
      const btnBody = this.stmts(btn.body);
      this.indent = 0;
      return "{ id: \"" + btnId + "\", label: " + this.expr(btn.label) + ", style: ButtonStyle." + this.capitalise(btn.style) + ", async run(__ctx, __args) {\n" + btnBody + "\n    }}";
    });

    // selects
    const selDefs = selects.map((sel, si) => {
      const selId = name + "_sel_" + si;
      const optDefs = sel.options.map(opt => {
        this.indent = 6;
        const optBody = this.stmts(opt.body);
        this.indent = 0;
        return "{ label: " + this.expr(opt.label) + ", value: " + this.expr(opt.value ?? opt.label) + ", async run(__ctx, __args) {\n" + optBody + "\n      }}";
      });
      return "{ id: \"" + selId + "\", placeholder: " + this.expr(sel.placeholder) + ", options: [\n" + optDefs.join(",\n") + "\n    ]}";
    });

    // per-command prefix
    const prefixReg = props.prefix ? "client.__cmdPrefixes.set(\"" + name + "\", " + this.compilePrefixes(props.prefix) + ");" : "";

    // slash
    let slashReg = "";
    if (isSlash) {
      const desc = props.description ? this.expr(props.description).replace(/^[`'"]|[`'"]$/g, "") : "A /" + name + " command";
      this.indent = 4;
      const slashBody = this.stmts(mainBody);
      this.indent = 0;
      slashReg = [
        "client.__slashDefs.push(new SlashCommandBuilder().setName(\"" + name + "\").setDescription(\"" + desc + "\").toJSON());",
        "client.__slashCommands.set(\"" + name + "\", async (interaction) => {",
        "  const __ctx = { member: interaction.member, guild: interaction.guild, channel: interaction.channel, reply: (m) => interaction.reply(m), interaction };",
        "  const __args = {};",
        "  try {",
        "    " + accessCode,
        "    " + cooldownCode,
        slashBody,
        "  } catch(err) { console.error('[NizumoScript Slash]', err); await interaction.reply(" + errorMsg + ").catch(()=>{}); }",
        "});",
      ].join("\n");
    }

    // reactions
    const reactionCode = reactions.map(r => {
      this.indent = 2;
      const rb = this.stmts(r.body);
      this.indent = 0;
      return [
        "client.on(\"messageReactionAdd\", async (reaction, user) => {",
        "  if (user.bot) return;",
        "  if (String(reaction.emoji.name) !== String(" + this.expr(r.emoji) + ")) return;",
        "  const __ctx = { member: await reaction.message.guild?.members.fetch(user.id).catch(()=>null), guild: reaction.message.guild, reaction, reply: (m) => reaction.message.channel.send(m) };",
        "  const __args = {};",
        rb,
        "});",
      ].join("\n");
    }).join("\n\n");

    const lines = [
      "client.__commands.set(\"" + name + "\", {",
      "  name: \"" + name + "\",",
      "  description: " + (props.description ? this.expr(props.description) : "\"A NizumoScript command\"") + ",",
      "  aliases: [" + aliases + "],",
      "  buttons: [" + btnDefs.join(",\n") + "],",
      "  selects: [" + selDefs.join(",\n") + "],",
      "  async execute(__ctx, __args) {",
      "    " + accessCode,
      "    " + cooldownCode,
      bodyCode,
      "  }",
      "});",
    ];
    if (aliases)      lines.push("[" + aliases + "].forEach(a => client.__aliases.set(a, \"" + name + "\"));");
    if (prefixReg)    lines.push(prefixReg);
    if (slashReg)     lines.push(slashReg);
    if (reactionCode) lines.push(reactionCode);
    return lines.join("\n");
  }

  compileEvent(node) {
    const eventMap = {
      ready: "ready", message: "messageCreate",
      memberjoin: "guildMemberAdd", memberleave: "guildMemberRemove",
      guildcreate: "guildCreate",
      reactionadd: "messageReactionAdd", reactionremove: "messageReactionRemove",
      messagedelete: "messageDelete",
    };
    const discordEvent = eventMap[node.eventName.toLowerCase()] ?? node.eventName;
    this.indent = 2;
    const bodyCode = this.stmts(node.body);
    this.indent = 0;

    let params = "...data", ctxSetup = "const __ctx = {}; const __args = {};";
    if (discordEvent === "guildMemberAdd" || discordEvent === "guildMemberRemove") {
      params = "member"; ctxSetup = "const __ctx = { member, guild: member.guild }; const __args = {};";
    } else if (discordEvent === "messageReactionAdd" || discordEvent === "messageReactionRemove") {
      params = "reaction, user"; ctxSetup = "const __ctx = { reaction, member: user, guild: reaction.message.guild }; const __args = {};";
    } else if (discordEvent === "messageDelete") {
      params = "message"; ctxSetup = "const __ctx = { message, guild: message.guild }; const __args = {};";
    } else if (discordEvent === "ready") {
      params = ""; ctxSetup = "const __ctx = {}; const __args = {};";
    }

    return [
      "client.on(\"" + discordEvent + "\", async (" + params + ") => {",
      "  " + ctxSetup,
      "  try {",
      bodyCode,
      "  } catch(err) { console.error('[NizumoScript Event Error]', err); }",
      "});",
    ].join("\n");
  }

  compileTask(node) {
    const ms = node.interval ? this.durationToMs(node.interval.value ?? String(node.interval)) : 60000;
    this.indent = 2;
    const bodyCode = this.stmts(node.body);
    this.indent = 0;
    return [
      "setInterval(async () => {",
      "  const __ctx = {}; const __args = {};",
      "  try {",
      bodyCode,
      "    console.log('[NizumoScript] \u2705 Task \\'" + node.name + "\\' ran.');",
      "  } catch(err) { console.error('[NizumoScript Task Error]', err); }",
      "}, " + ms + ");",
    ].join("\n");
  }

  compileMessageHandler(extraBody = "") {
    return [
      "// Interaction handler",
      "client.on(\"interactionCreate\", async (interaction) => {",
      "  const __ctx = { member: interaction.member, guild: interaction.guild, channel: interaction.channel, reply: (m) => interaction.reply(m), interaction };",
      "  const __args = {};",
      "  if (interaction.isChatInputCommand()) {",
      "    const sc = client.__slashCommands.get(interaction.commandName);",
      "    if (sc) { try { await sc(interaction); } catch(e) { console.error('[NizumoScript Slash]', e); } }",
      "    return;",
      "  }",
      "  if (interaction.isButton()) {",
      "    for (const [, cmd] of client.__commands) {",
      "      const btn = cmd.buttons?.find(b => b.id === interaction.customId);",
      "      if (btn) { try { await btn.run(__ctx, __args); await interaction.deferUpdate().catch(()=>{}); } catch(e) { console.error('[NizumoScript Button]', e); } return; }",
      "    }",
      "    return;",
      "  }",
      "  if (interaction.isStringSelectMenu()) {",
      "    for (const [, cmd] of client.__commands) {",
      "      const sel = cmd.selects?.find(s => s.id === interaction.customId);",
      "      if (sel) {",
      "        const chosen = interaction.values[0];",
      "        const opt = sel.options.find(o => String(typeof o.value === 'object' ? o.value.value : o.value) === String(chosen));",
      "        if (opt) { try { await opt.run(__ctx, __args); await interaction.deferUpdate().catch(()=>{}); } catch(e) { console.error('[NizumoScript Select]', e); } }",
      "        return;",
      "      }",
      "    }",
      "    return;",
      "  }",
      "});",
      "",
      "// Message handler",
      "client.on(\"messageCreate\", async (message) => {",
      "  if (message.author.bot) return;",
      "  const __ctx = { member: message.member, guild: message.guild, message, channel: message.channel, reply: (m) => message.reply(m) };",
      "  const __args = {};",
      extraBody ? extraBody : "",
      "  let msgContent = message.content;",
      "  if (MENTION_PREFIX) {",
      "    const mentionRe = new RegExp(`^<@!?${client.user.id}>\\\\s*`);",
      "    if (mentionRe.test(msgContent)) msgContent = msgContent.replace(mentionRe, '').trim();",
      "  }",
      "  const usedPrefix = PREFIXES.find(p => msgContent.toLowerCase().startsWith(p.toLowerCase()));",
      "  if (!usedPrefix) return;",
      "  const args    = msgContent.slice(usedPrefix.length).trim().split(/ +/);",
      "  const cmdName = args.shift().toLowerCase();",
      "  args.forEach((a, i) => { __args[i] = a; __args[a] = a; });",
      "  const cmdPrefixes = client.__cmdPrefixes.get(cmdName);",
      "  if (cmdPrefixes && !cmdPrefixes.some(p => msgContent.toLowerCase().startsWith(p.toLowerCase()))) return;",
      "  const cmd = client.__commands.get(cmdName) ?? client.__commands.get(client.__aliases.get(cmdName));",
      "  if (!cmd) return;",
      "  const rows = [];",
      "  if (cmd.buttons?.length) {",
      "    const btnRow = new ActionRowBuilder();",
      "    cmd.buttons.forEach(b => btnRow.addComponents(new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(b.style)));",
      "    rows.push(btnRow);",
      "  }",
      "  if (cmd.selects?.length) {",
      "    cmd.selects.forEach(s => {",
      "      const selRow = new ActionRowBuilder();",
      "      selRow.addComponents(new StringSelectMenuBuilder().setCustomId(s.id).setPlaceholder(s.placeholder).addOptions(s.options.map(o => ({ label: String(typeof o.label === 'object' ? o.label.value : o.label), value: String(typeof o.value === 'object' ? o.value.value : o.value) }))));",
      "      rows.push(selRow);",
      "    });",
      "  }",
      "  if (rows.length) __ctx.reply = (m) => typeof m === 'string' ? message.reply({ content: m, components: rows }) : message.reply({ ...m, components: rows });",
      "  try { await cmd.execute(__ctx, __args); }",
      "  catch(err) { console.error('[NizumoScript Error]', err); await message.reply('❌ Something went wrong.').catch(()=>{}); }",
      "});",
    ].join("\n");
  }

  compile() {
    const nodes   = this.ast.body;
    const botNode = nodes.find(n => n.type === "BotDef");

    this.output.push(this.compileBot(botNode ?? { type: "BotDef", name: "NizumoBot", props: {} }));

    for (const node of nodes) {
      if (node.type === "FuncDecl") {
        const lines = [];
        this.compileFunc(node, lines);
        this.output.push(lines.join("\n"));
      }
    }

    for (const node of nodes) {
      if (node.type === "CommandDef") this.output.push(this.compileCommand(node));
    }

    const msgEvent = nodes.find(n => n.type === "EventDef" && n.eventName.toLowerCase() === "message");
    let extraBody = "";
    if (msgEvent) {
      this.indent = 2;
      extraBody = this.stmts(msgEvent.body);
      this.indent = 0;
    }
    this.output.push(this.compileMessageHandler(extraBody));

    for (const node of nodes) {
      if (node.type === "EventDef" && node.eventName.toLowerCase() !== "message") {
        this.output.push(this.compileEvent(node));
      }
    }

    for (const node of nodes) {
      if (node.type === "TaskDef") this.output.push(this.compileTask(node));
    }

    this.output.push("client.login(process.env.TOKEN);");
    return this.output.join("\n\n");
  }
}

module.exports = { Compiler };
