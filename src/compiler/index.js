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

  compilePrefixes(p) {
    if (!p) return '["!", "/"]';
    if (p.type === "prefix_config") {
      const parts = [];
      if (p.global)   parts.push(this.expr(p.global));
      if (p.fallback) parts.push(this.expr(p.fallback));
      if (!parts.length) parts.push('"!"');
      if (!parts.includes('"/"')) parts.push('"/"');
      return "[" + parts.join(", ") + "]";
    }
    if (p.type === "array") {
      const items = p.value.map(v => this.expr(v));
      if (!items.includes('"/"')) items.push('"/"');
      return "[" + items.join(", ") + "]";
    }
    return "[" + this.expr(p) + ', "/"]';
  }

  compileMentionPrefix(p) {
    return (p && p.type === "prefix_config" && p.mention) ? "true" : "false";
  }

  // ── Expressions ──────────────────────────────────────────────────────────────
  expr(node) {
    if (!node) return "null";
    switch (node.type) {
      case "string":      return this.compileString(node.value);
      case "number":      return String(node.value);
      case "duration":    return JSON.stringify(node.value);
      case "boolean":     return node.value ? "true" : "false";
      case "null":        return "null";
      case "array":       return "[" + node.value.map(v => this.expr(v)).join(", ") + "]";
      case "identifier":  return this.resolveId(node.name);
      case "member":      return this.expr(node.object) + "." + node.property;
      case "index":       return this.expr(node.object) + "[" + this.expr(node.index) + "]";
      case "binary":      return this.compileBinary(node);
      case "unary":       return this.compileUnary(node);
      case "call":        return this.compileCall(node);
      case "method_call": return this.compileMethodCall(node);
      default:            return "null";
    }
  }

  compileString(raw) {
    const converted = raw.replace(/\{([^}]+)\}/g, (_, v) => "${" + this.resolveId(v.trim()) + "}");
    return "`" + converted + "`";
  }

  resolveId(name) {
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
      const k = name.slice(5);
      return /^\d+$/.test(k) ? "__args[" + k + "]" : "__args." + k;
    }
    return map[name] ?? name;
  }

  compileBinary(node) {
    const l = this.expr(node.left), r = this.expr(node.right);
    if (node.op === "contains") return "String(" + l + ").toLowerCase().includes(String(" + r + ").toLowerCase())";
    if (node.op === "and") return "(" + l + " && " + r + ")";
    if (node.op === "or")  return "(" + l + " || " + r + ")";
    const opMap = { "==": "===", "!=": "!==" };
    return "(" + l + " " + (opMap[node.op] ?? node.op) + " " + r + ")";
  }

  compileUnary(node) {
    if (node.op === "not") return "!(" + this.expr(node.expr) + ")";
    return node.op + "(" + this.expr(node.expr) + ")";
  }

  compileMethodCall(node) {
    const obj = this.expr(node.object);
    const args = node.args.map(a => this.expr(a)).join(", ");
    // string utilities
    const strMethods = {
      upper:    obj + ".toUpperCase()",
      lower:    obj + ".toLowerCase()",
      length:   obj + ".length",
      trim:     obj + ".trim()",
      reverse:  obj + ".split('').reverse().join('')",
      includes: obj + ".toLowerCase().includes(String(" + (node.args[0] ? this.expr(node.args[0]) : '""') + ").toLowerCase())",
      startsWith: obj + ".startsWith(" + args + ")",
      endsWith:   obj + ".endsWith(" + args + ")",
      replace:    obj + ".replaceAll(" + args + ")",
      split:      obj + ".split(" + args + ")",
      slice:      obj + ".slice(" + args + ")",
      indexOf:    obj + ".indexOf(" + args + ")",
      repeat:     obj + ".repeat(" + args + ")",
      padStart:   obj + ".padStart(" + args + ")",
      padEnd:     obj + ".padEnd(" + args + ")",
    };
    if (strMethods[node.method]) return strMethods[node.method];

    // Number object methods
    if (String(node.object?.name) === "Number") {
      if (node.method === "format" || node.method === "comma") return "Number(" + args + ").toLocaleString()";
      if (node.method === "parse")   return "parseFloat(" + args + ")";
      if (node.method === "isValid") return "!isNaN(parseFloat(" + args + "))";
      if (node.method === "round")   return "Math.round(" + args + ")";
      if (node.method === "floor")   return "Math.floor(" + args + ")";
      if (node.method === "ceil")    return "Math.ceil("  + args + ")";
      if (node.method === "abs")     return "Math.abs("   + args + ")";
    }

    // Math object methods
    if (String(node.object?.name) === "Math") {
      return "Math." + node.method + "(" + args + ")";
    }

    // String object methods
    if (String(node.object?.name) === "String") {
      if (node.method === "clean") return "String(" + args + ").replace(/[<@!&#>]/g, '').trim()";
    }

    return obj + "." + node.method + "(" + args + ")";
  }

  compileCall(node) {
    const a = node.args;
    const builtins = {
      "random":          () => "(() => { const __mn = Math.min(" + this.expr(a[0]) + ", " + this.expr(a[1]) + "), __mx = Math.max(" + this.expr(a[0]) + ", " + this.expr(a[1]) + "); return Math.floor(Math.random() * (__mx - __mn + 1)) + __mn; })()",
      "Math.round":      () => "Math.round(" + this.expr(a[0]) + ")",
      "Math.floor":      () => "Math.floor(" + this.expr(a[0]) + ")",
      "Math.ceil":       () => "Math.ceil("  + this.expr(a[0]) + ")",
      "Math.abs":        () => "Math.abs("   + this.expr(a[0]) + ")",
      "Math.min":        () => "Math.min("   + a.map(x => this.expr(x)).join(", ") + ")",
      "Math.max":        () => "Math.max("   + a.map(x => this.expr(x)).join(", ") + ")",
      "Math.pow":        () => "Math.pow("   + this.expr(a[0]) + ", " + this.expr(a[1]) + ")",
      "Math.sqrt":       () => "Math.sqrt("  + this.expr(a[0]) + ")",
      "Math.clamp":      () => "Math.min(Math.max(" + this.expr(a[0]) + ", " + this.expr(a[1]) + "), " + this.expr(a[2]) + ")",
      "Time.now":        () => "Date.now()",
      "Time.today":      () => "new Date().toISOString().slice(0,10)",
      "Time.format":     () => "new Date(" + this.expr(a[0]) + ").toLocaleString()",
      "Number.parse":    () => "parseFloat(" + this.expr(a[0]) + ")",
      "Number.isValid":  () => "!isNaN(parseFloat(" + this.expr(a[0]) + "))",
      "Number.format":   () => "Number(" + this.expr(a[0]) + ").toLocaleString()",
      "clean.id":        () => "String(" + this.expr(a[0]) + ").replace(/[<@!&#>]/g, '').trim()",
      "fetch.user":      () => "await __ctx.guild?.members.fetch(" + this.expr(a[0]) + ").catch(()=>null)",
      "fetch.channel":   () => "await __ctx.guild?.channels.fetch(" + this.expr(a[0]) + ").catch(()=>null)",
      "member.hasRole":  () => "!!__ctx.member?.roles?.cache?.some(r => r.name === " + this.expr(a[0]) + ")",
      "Storage.get":     () => "await __storage.get("     + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.set":     () => "await __storage.set("     + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.getUser": () => "await __storage.getUser(" + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.setUser": () => "await __storage.setUser(" + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.delete":  () => "await __storage.delete("  + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.has":     () => "await __storage.has("     + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.deleteUser": () => "await __storage.deleteUser(" + a.map(x => this.expr(x)).join(", ") + ")",
      "Storage.leaderboard": () => "await __storage.leaderboard(" + a.map(x => this.expr(x)).join(", ") + ")",
    };
    if (builtins[node.name]) return builtins[node.name]();
    return node.name + "(" + a.map(x => this.expr(x)).join(", ") + ")";
  }

  // ── Statements ───────────────────────────────────────────────────────────────
  stmt(node, lines) {
    switch (node.type) {
      case "Reply":
        lines.push(this.i("if (__ctx.reply) await __ctx.reply(" + this.expr(node.value) + "); else if (__ctx.message) await __ctx.message.reply(" + this.expr(node.value) + ");"));
        break;
      case "Send":
        lines.push(this.i("if (__ctx.channel) await __ctx.channel.send(" + this.expr(node.value) + ");"));
        break;
      case "SendChannel":
        lines.push(this.i("{ const __ch = __ctx.guild?.channels?.cache?.find(c => c.name === " + this.expr(node.channel) + " && c.isTextBased()) ?? __ctx.guild?.systemChannel; if (__ch) await __ch.send(" + this.expr(node.message) + ").catch(()=>{}); }"));
        break;
      case "Dm":
        lines.push(this.i("{ try { const __dmId = String(" + this.expr(node.target) + "?.id ?? " + this.expr(node.target) + "); const __dmU = await client.users.fetch(__dmId).catch(()=>null); if (__dmU) await __dmU.send(" + this.expr(node.message) + ").catch(() => console.log('[NizumoScript] DM failed - user may have DMs disabled')); } catch(e){ console.log('[NizumoScript] DM error:', e.message); } }"));
        break;
      case "Edit":
        lines.push(this.i("if (__lastMsg) await __lastMsg.edit(" + this.expr(node.value) + ").catch(()=>{});"));
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
      case "AddReaction":
        lines.push(this.i("await __ctx.message?.react(" + this.expr(node.emoji) + ").catch(()=>{});"));
        break;
      case "Wait":
        lines.push(this.i("await new Promise(r => setTimeout(r, " + this.durationToMs(node.duration?.value) + "));"));
        break;
      case "Log":
        lines.push(this.i("console.log('[NizumoScript]', " + this.expr(node.value) + ");"));
        break;
      case "Warn":
        this.compileWarn(node, lines);
        break;
      case "Warnings":
        this.compileWarnings(node, lines);
        break;
      case "ClearWarnings":
        lines.push(this.i("await __storage.deleteUser(String(" + this.expr(node.target) + "?.id ?? " + this.expr(node.target) + "), 'warnings');"));
        lines.push(this.i("if (__ctx.reply) await __ctx.reply('✅ Warnings cleared.');"));
        break;
      case "Confirm":
        this.compileConfirm(node, lines);
        break;
      case "Paginate":
        this.compilePaginate(node, lines);
        break;
      case "CreateChannel":
        lines.push(this.i("await __ctx.guild?.channels?.create({ name: " + this.expr(node.name) + (node.category ? ", parent: __ctx.guild?.channels?.cache?.find(c => c.name === " + this.expr(node.category) + ")" : "") + " }).catch(()=>{});"));
        break;
      case "DeleteChannel":
        lines.push(this.i("{ const __dch = __ctx.guild?.channels?.cache?.find(c => c.name === " + this.expr(node.name) + "); if (__dch) await __dch.delete().catch(()=>{}); }"));
        break;
      case "CreateThread":
        lines.push(this.i("if (__ctx.message) await __ctx.message.startThread({ name: " + this.expr(node.name) + " }).catch(()=>{});"));
        break;
      case "If":           this.compileIf(node, lines);       break;
      case "While":        this.compileWhile(node, lines);    break;
      case "ForEach":      this.compileForEach(node, lines);  break;
      case "Repeat":       this.compileRepeat(node, lines);   break;
      case "TryCatch":     this.compileTryCatch(node, lines); break;
      case "Break":        lines.push(this.i("break;"));      break;
      case "Return":       lines.push(this.i("return " + this.expr(node.value) + ";")); break;
      case "VarDecl":      lines.push(this.i("let " + node.name + " = " + this.expr(node.value) + ";")); break;
      case "VarSet":       this.compileSet(node, lines);      break;
      case "FuncDecl":     this.compileFunc(node, lines);     break;
      case "ExprStatement":lines.push(this.i(this.expr(node.expr) + ";")); break;
      case "Button": case "Select": case "ReactionHandler": break;
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

  compileWarn(node, lines) {
    lines.push(this.i("{"));
    this.indent++;
    lines.push(this.i("const __warnId = String(" + this.expr(node.target) + "?.id ?? " + this.expr(node.target) + ");"));
    lines.push(this.i("const __warns = await __storage.getUser(__warnId, 'warnings', []);"));
    lines.push(this.i("__warns.push({ reason: " + this.expr(node.reason) + ", date: new Date().toISOString() });"));
    lines.push(this.i("await __storage.setUser(__warnId, 'warnings', __warns);"));
    lines.push(this.i("if (__ctx.reply) await __ctx.reply('⚠️ Warning #' + __warns.length + ' issued: ' + " + this.expr(node.reason) + ");"));
    this.indent--;
    lines.push(this.i("}"));
  }

  compileWarnings(node, lines) {
    lines.push(this.i("{"));
    this.indent++;
    lines.push(this.i("const __wId = String(" + this.expr(node.target) + "?.id ?? " + this.expr(node.target) + ");"));
    lines.push(this.i("const __wList = await __storage.getUser(__wId, 'warnings', []);"));
    lines.push(this.i("const __embed = new EmbedBuilder().setTitle('⚠️ Warnings').setColor('#FFA500');"));
    lines.push(this.i("if (!__wList.length) { __embed.setDescription('No warnings.'); }"));
    lines.push(this.i("else { __wList.forEach((w, i) => __embed.addFields({ name: '#' + (i+1), value: w.reason + ' (' + w.date.slice(0,10) + ')' })); }"));
    lines.push(this.i("if (__ctx.reply) await __ctx.reply({ embeds: [__embed] });"));
    this.indent--;
    lines.push(this.i("}"));
  }

  compileConfirm(node, lines) {
    lines.push(this.i("{"));
    this.indent++;
    lines.push(this.i("const __confirmMsg = await __ctx.reply({ content: " + this.expr(node.message) + " + ' (yes/no)', fetchReply: true }).catch(()=>null);"));
    lines.push(this.i("const __confirmFilter = m => m.author.id === __ctx.member?.id && ['yes','no','y','n'].includes(m.content.toLowerCase());"));
    lines.push(this.i("const __confirmCol = await __ctx.channel?.awaitMessages({ filter: __confirmFilter, max: 1, time: 15000 }).catch(()=>null);"));
    lines.push(this.i("const __confirmAns = __confirmCol?.first()?.content?.toLowerCase();"));
    lines.push(this.i("if (__confirmAns === 'yes' || __confirmAns === 'y') {"));
    this.indent++;
    node.yesBody.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i("}"));
    if (node.noBody) {
      lines.push(this.i("else {"));
      this.indent++;
      node.noBody.forEach(s => this.stmt(s, lines));
      this.indent--;
      lines.push(this.i("}"));
    }
    this.indent--;
    lines.push(this.i("}"));
  }

  compilePaginate(node, lines) {
    lines.push(this.i("{"));
    this.indent++;
    lines.push(this.i("const __pages = [];"));
    for (const page of node.pages) {
      lines.push(this.i("__pages.push(async (__ctx, __args) => {"));
      this.indent++;
      page.body.forEach(s => this.stmt(s, lines));
      this.indent--;
      lines.push(this.i("});"));
    }
    lines.push(this.i("let __pageIdx = 0;"));
    lines.push(this.i("const __pgRow = new ActionRowBuilder().addComponents("));
    lines.push(this.i("  new ButtonBuilder().setCustomId('pg_prev').setLabel('◀').setStyle(ButtonStyle.Secondary),"));
    lines.push(this.i("  new ButtonBuilder().setCustomId('pg_next').setLabel('▶').setStyle(ButtonStyle.Secondary)"));
    lines.push(this.i(");"));
    lines.push(this.i("const __pgMsg = await __ctx.reply({ content: 'Page 1/' + __pages.length, components: [__pgRow], fetchReply: true }).catch(()=>null);"));
    lines.push(this.i("await __pages[0]?.(__ctx, __args);"));
    lines.push(this.i("const __pgCollector = __pgMsg?.createMessageComponentCollector({ time: 60000 });"));
    lines.push(this.i("if (__pgCollector) { __pgCollector.on('collect', async i => {"));
    this.indent++;
    lines.push(this.i("if (i.customId === 'pg_next' && __pageIdx < __pages.length - 1) __pageIdx++;"));
    lines.push(this.i("else if (i.customId === 'pg_prev' && __pageIdx > 0) __pageIdx--;"));
    lines.push(this.i("await i.update({ content: 'Page ' + (__pageIdx+1) + '/' + __pages.length, components: [__pgRow] });"));
    lines.push(this.i("await __pages[__pageIdx]?.(__ctx, __args);"));
    this.indent--;
    lines.push(this.i("}); }"));
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

  compileTryCatch(node, lines) {
    lines.push(this.i("try {"));
    this.indent++;
    node.tryBody.forEach(s => this.stmt(s, lines));
    this.indent--;
    lines.push(this.i("} catch(" + node.errVar + ") {"));
    this.indent++;
    node.catchBody.forEach(s => this.stmt(s, lines));
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
    const permMap = { moderator:"ModerateMembers", admin:"Administrator", owner:"Administrator", manage:"ManageGuild", ban:"BanMembers", kick:"KickMembers" };
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

  buildArgValidation(typedArgs) {
    if (!typedArgs || !typedArgs.length) return "";
    const lines = [];
    typedArgs.forEach((arg, i) => {
      lines.push("    __args." + arg.name + " = __args[" + i + "];");
      if (arg.type === "Number") {
        lines.push("    if (isNaN(parseFloat(__args." + arg.name + "))) { if (__ctx.reply) await __ctx.reply('❌ `" + arg.name + "` must be a number.'); return; }");
        lines.push("    __args." + arg.name + " = parseFloat(__args." + arg.name + ");");
      } else if (arg.type === "Member") {
        lines.push("    { const __mid = String(__args." + arg.name + " || '').replace(/[<@!>]/g, '').trim(); const __m = __mid ? await __ctx.guild?.members.fetch(__mid).catch(()=>null) : null; if (!__m) { if (__ctx.reply) await __ctx.reply('❌ Member not found. Mention them or use their ID.'); return; } __args." + arg.name + " = __m; __ctx.member = __m; }");
      } else if (arg.type === "String") {
        lines.push("    if (!__args." + arg.name + ") { if (__ctx.reply) await __ctx.reply('❌ `" + arg.name + "` is required.'); return; }");
      }
    });
    return lines.join("\n");
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
      'client.__helpData      = [];',
      'const __storage        = new __NzStorage();',
      'const PREFIXES         = ' + prefixes + ';',
      'const MENTION_PREFIX   = ' + mention + ';',
      '',
      'client.once("ready", async () => {',
      '  console.log(`[NizumoScript] \u2705 ${client.user.tag} is online!`);',
    ];
    if (status) lines.push('  client.user.setActivity(' + status + ');');
    if (props.helpAuto) {
      lines.push('  // Auto-generated help command');
      lines.push('  client.__commands.set("help", {');
      lines.push('    name: "help", description: "List all commands", aliases: [], buttons: [], selects: [],');
      lines.push('    async execute(__ctx, __args) {');
      lines.push('      const __helpEmbed = new EmbedBuilder().setTitle("\u2699\ufe0f Available Commands").setColor("#5865F2");');
      lines.push('      for (const [, cmd] of client.__commands) {');
      lines.push('        if (cmd.name === "help") continue;');
      lines.push('        __helpEmbed.addFields({ name: PREFIXES[0] + cmd.name, value: cmd.description || "No description" });');
      lines.push('      }');
      lines.push('      if (__ctx.reply) await __ctx.reply({ embeds: [__helpEmbed] });');
      lines.push('    }');
      lines.push('  });');
    }
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
    const accessCode    = this.accessCheck(props.access);
    const cooldownCode  = this.cooldownCode(name, props.cooldown);
    const aliases       = props.aliases ? props.aliases.value.map(a => this.expr(a)).join(", ") : "";
    const errorMsg      = props.error ? this.expr(props.error) : '"❌ Something went wrong."';
    const isSlash       = props.slash === true;
    const argValidation = this.buildArgValidation(props.args);

    const mainBody  = body.filter(n => !["Button","Select","ReactionHandler"].includes(n.type));
    const buttons   = body.filter(n => n.type === "Button");
    const selects   = body.filter(n => n.type === "Select");
    const reactions = body.filter(n => n.type === "ReactionHandler");

    this.indent = 2;
    const bodyCode = this.stmts(mainBody);
    this.indent = 0;

    const btnDefs = buttons.map((btn, i) => {
      const btnId = name + "_btn_" + i;
      this.indent = 4;
      const btnBody = this.stmts(btn.body);
      this.indent = 0;
      return "{ id: \"" + btnId + "\", label: " + this.expr(btn.label) + ", style: ButtonStyle." + this.capitalise(btn.style) + ", async run(__ctx, __args) {\n" + btnBody + "\n    }}";
    });

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

    const prefixReg = props.prefix ? "client.__cmdPrefixes.set(\"" + name + "\", " + this.compilePrefixes(props.prefix) + ");" : "";

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
        "  const __args = {}; let __lastMsg = null;",
        "  try {",
        "    " + accessCode,
        "    " + cooldownCode,
        slashBody,
        "  } catch(err) { console.error('[NizumoScript Slash]', err); await interaction.reply(" + errorMsg + ").catch(()=>{}); }",
        "});",
      ].join("\n");
    }

    const reactionCode = reactions.map(r => {
      this.indent = 2;
      const rb = this.stmts(r.body);
      this.indent = 0;
      return [
        "client.on(\"messageReactionAdd\", async (reaction, user) => {",
        "  if (user.bot) return;",
        "  if (String(reaction.emoji.name) !== String(" + this.expr(r.emoji) + ")) return;",
        "  const __ctx = { member: await reaction.message.guild?.members.fetch(user.id).catch(()=>null), guild: reaction.message.guild, reaction, reply: (m) => reaction.message.channel.send(m) };",
        "  const __args = {}; let __lastMsg = null;",
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
      "    let __lastMsg = null;",
      "    " + accessCode,
      "    " + cooldownCode,
      argValidation,
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
      ready:"ready", message:"messageCreate",
      memberjoin:"guildMemberAdd", memberleave:"guildMemberRemove",
      guildcreate:"guildCreate",
      reactionadd:"messageReactionAdd", reactionremove:"messageReactionRemove",
      messagedelete:"messageDelete",
    };
    const discordEvent = eventMap[node.eventName.toLowerCase()] ?? node.eventName;
    this.indent = 2;
    const bodyCode = this.stmts(node.body);
    this.indent = 0;
    let params = "...data", ctxSetup = "const __ctx = {}; const __args = {}; let __lastMsg = null;";
    if (discordEvent === "guildMemberAdd" || discordEvent === "guildMemberRemove") {
      params = "member"; ctxSetup = "const __ctx = { member, guild: member.guild }; const __args = {}; let __lastMsg = null;";
    } else if (discordEvent === "messageReactionAdd" || discordEvent === "messageReactionRemove") {
      params = "reaction, user"; ctxSetup = "const __ctx = { reaction, member: user, guild: reaction.message.guild }; const __args = {}; let __lastMsg = null;";
    } else if (discordEvent === "messageDelete") {
      params = "message"; ctxSetup = "const __ctx = { message, guild: message.guild }; const __args = {}; let __lastMsg = null;";
    } else if (discordEvent === "ready") {
      params = ""; ctxSetup = "const __ctx = {}; const __args = {}; let __lastMsg = null;";
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
      "client.once(\"ready\", () => setInterval(async () => {",
      "  const __ctx = {}; const __args = {}; let __lastMsg = null;",
      "  try {",
      bodyCode,
      "    console.log('[NizumoScript] \u2705 Task \\'" + node.name + "\\' ran.');",
      "  } catch(err) { console.error('[NizumoScript Task Error]', err); }",
      "}, " + ms + "));",
    ].join("\n");
  }

  compileMessageHandler(extraBody = "") {
    return [
      "// Interaction handler",
      "client.on(\"interactionCreate\", async (interaction) => {",
      "  const __ctx = { member: interaction.member, guild: interaction.guild, channel: interaction.channel, reply: (m) => interaction.reply(m), interaction };",
      "  const __args = {}; let __lastMsg = null;",
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
      "  const __args = {}; let __lastMsg = null;",
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

    this.output.push(this.compileBot(botNode ?? { type:"BotDef", name:"NizumoBot", props:{} }));

    // Global variables — declared at top level, accessible everywhere
    const globalVars = nodes.filter(n => n.type === "VarDecl");
    if (globalVars.length > 0) {
      const globalLines = globalVars.map(v => "const " + v.name + " = " + this.expr(v.value) + ";");
      this.output.push("// Global variables\n" + globalLines.join("\n"));
    }

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
