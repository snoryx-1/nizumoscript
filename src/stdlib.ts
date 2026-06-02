/**
 * NizumoScript v1.0.0 Standard Library
 * This code is emitted at the top of every compiled JS file.
 */

export const STDLIB = `
// ─── NizumoScript v1.0.0 Runtime ───────────────────────────────────────────

// Environment helper
const env = new Proxy({}, {
  get(_, key) {
    const val = process.env[key];
    if (val === undefined) {
      console.warn(\`[NZS] env.\${key} is undefined. Check your .env file.\`);
      return "";
    }
    return val;
  }
});

// Random integer (inclusive)
function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Math.clamp
Math.clamp = function(x, min, max) {
  return Math.max(min, Math.min(max, x));
};

// Array extensions
if (!Array.prototype.unique) {
  Array.prototype.unique = function() { return [...new Set(this)]; };
}
if (!Array.prototype.first) {
  Array.prototype.first = function() { return this[0]; };
}
if (!Array.prototype.last) {
  Array.prototype.last = function() { return this[this.length - 1]; };
}
if (!Array.prototype.isEmpty) {
  Array.prototype.isEmpty = function() { return this.length === 0; };
}
if (!Array.prototype.sum) {
  Array.prototype.sum = function() { return this.reduce((a, b) => a + b, 0); };
}
if (!Array.prototype.average) {
  Array.prototype.average = function() { return this.sum() / this.length; };
}
if (!Array.prototype.shuffle) {
  Array.prototype.shuffle = function() {
    const arr = [...this];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
}
if (!Array.prototype.chunk) {
  Array.prototype.chunk = function(size) {
    const chunks = [];
    for (let i = 0; i < this.length; i += size) chunks.push(this.slice(i, i + size));
    return chunks;
  };
}
if (!Array.prototype.remove) {
  Array.prototype.remove = function(val) {
    const idx = this.indexOf(val);
    if (idx !== -1) this.splice(idx, 1);
    return this;
  };
}

// String extensions
if (!String.prototype.capitalize) {
  String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  };
}
if (!String.prototype.titleCase) {
  String.prototype.titleCase = function() {
    return this.split(' ').map(w => w.capitalize()).join(' ');
  };
}
if (!String.prototype.upper) {
  String.prototype.upper = function() { return this.toUpperCase(); };
}
if (!String.prototype.lower) {
  String.prototype.lower = function() { return this.toLowerCase(); };
}

// str.parse helpers
const str = {
  parse: {
    int: (s) => Math.floor(Number(s)),
    float: (s) => Number(s),
    bool: (s) => s === "true" || s === "1" || s === "yes",
  }
};

// Time helpers
const time = {
  now: () => Date.now(),
  format: (ts, fmt) => {
    const d = new Date(ts);
    return fmt
      .replace("YYYY", d.getFullYear())
      .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
      .replace("DD", String(d.getDate()).padStart(2, "0"))
      .replace("HH", String(d.getHours()).padStart(2, "0"))
      .replace("mm", String(d.getMinutes()).padStart(2, "0"))
      .replace("ss", String(d.getSeconds()).padStart(2, "0"));
  },
  diff: (ts1, ts2, unit) => {
    const ms = Math.abs(ts1 - ts2);
    const units = { milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
    return Math.floor(ms / (units[unit] || 1));
  },
  add: (ts, amount, unit) => {
    const units = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
    return ts + amount * (units[unit] || 1000);
  },
  fromNow: (ts) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return \`\${Math.floor(diff / 60000)} minutes ago\`;
    if (diff < 86400000) return \`\${Math.floor(diff / 3600000)} hours ago\`;
    return \`\${Math.floor(diff / 86400000)} days ago\`;
  }
};

// Wait helper
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Duration string to ms
function __durationToMs(dur) {
  const match = dur.match(/^(\\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const n = Number(match[1]);
  const u = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (u[match[2]] || 0);
}

// Number formatting
function __formatNumber(val, spec) {
  if (spec === ",") return Number(val).toLocaleString();
  if (spec === "d") return Math.floor(Number(val)).toString();
  if (spec === "upper") return String(val).toUpperCase();
  if (spec === "lower") return String(val).toLowerCase();
  if (spec === "trim") return String(val).trim();
  const floatMatch = spec.match(/^\\.([0-9]+)f$/);
  if (floatMatch) return Number(val).toFixed(Number(floatMatch[1]));
  return String(val);
}

// Store factory
function __createStore(name, scope, defaults) {
  const path = \`./data/\${name}.json\`;
  const fs = require("fs");
  const fsPath = require("path");

  if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true });

  function load() {
    try { return JSON.parse(fs.readFileSync(path, "utf8")); }
    catch { return {}; }
  }

  function save(data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  }

  function getKey(ctx) {
    if (scope === "user") return ctx?.user?.id || "global";
    if (scope === "guild") return ctx?.guild?.id || "global";
    return "global";
  }

  function applyDefaults(obj) {
    const result = { ...obj };
    for (const [key, val] of Object.entries(defaults)) {
      if (result[key] === undefined) result[key] = typeof val === "object" ? JSON.parse(JSON.stringify(val)) : val;
    }
    return result;
  }

  return {
    get(ctx) {
      const data = load();
      const key = getKey(ctx);
      return applyDefaults(data[key] || {});
    },
    set(ctx, val) {
      const data = load();
      const key = getKey(ctx);
      data[key] = val;
      save(data);
    },
    update(ctx, changes) {
      const data = load();
      const key = getKey(ctx);
      data[key] = { ...applyDefaults(data[key] || {}), ...changes };
      save(data);
    },
    delete(ctx) {
      const data = load();
      const key = getKey(ctx);
      delete data[key];
      save(data);
    },
    exists(ctx) {
      const data = load();
      return getKey(ctx) in data;
    },
    init(ctx) {
      const data = load();
      const key = getKey(ctx);
      if (!(key in data)) { data[key] = applyDefaults({}); save(data); }
      return applyDefaults(data[key]);
    },
    getById(id) {
      const data = load();
      return applyDefaults(data[id] || {});
    },
    getAll() {
      const data = load();
      return Object.entries(data).map(([k, v]) => ({ _key: k, ...applyDefaults(v) }));
    },
    query(fn) {
      return this.getAll().filter(fn);
    },
    count() {
      return Object.keys(load()).length;
    }
  };
}

// db low-level key-value store
const db = (() => {
  const path = "./data/_db.json";
  const fs = require("fs");
  if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true });
  function load() { try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return {}; } }
  function save(d) { fs.writeFileSync(path, JSON.stringify(d, null, 2)); }
  return {
    set(key, val) { const d = load(); d[key] = val; save(d); },
    get(key) { return load()[key] ?? null; },
    delete(key) { const d = load(); delete d[key]; save(d); },
    has(key) { return key in load(); },
    increment(key, amount = 1) { const d = load(); d[key] = (Number(d[key]) || 0) + amount; save(d); return d[key]; },
    decrement(key, amount = 1) { const d = load(); d[key] = (Number(d[key]) || 0) - amount; save(d); return d[key]; },
    push(key, val) { const d = load(); if (!Array.isArray(d[key])) d[key] = []; d[key].push(val); save(d); },
    pull(key, val) { const d = load(); if (Array.isArray(d[key])) d[key] = d[key].filter(v => v !== val); save(d); },
    all() { return load(); },
    keys() { return Object.keys(load()); },
    count() { return Object.keys(load()).length; },
    filter(fn) { return Object.entries(load()).filter(([k, v]) => fn(k, v)); }
  };
})();

// Embed builder
function __buildEmbed(base, overrides, extraFields) {
  const embed = { ...base, ...overrides };
  if (extraFields && extraFields.length > 0) {
    embed.fields = [...(base.fields || []), ...extraFields];
  }
  return embed;
}

// Permission check helper
async function __checkPermission(ctx, level) {
  if (!ctx.member && level !== "@everyone") return false;
  switch (level) {
    case "@everyone": return true;
    case "@mod": return ctx.member?.permissions?.has("ModerateMembers") ?? false;
    case "@admin": return ctx.member?.permissions?.has("Administrator") ?? false;
    case "@owner": return ctx.guild?.ownerId === ctx.user?.id;
    case "@botowner": return ctx.user?.id === (process.env.BOT_OWNER_ID || "");
    default: return false;
  }
}

// Cooldown tracker
const __cooldowns = new Map();
function __checkCooldown(userId, commandName, durationMs) {
  const key = \`\${userId}:\${commandName}\`;
  const now = Date.now();
  if (__cooldowns.has(key)) {
    const expires = __cooldowns.get(key);
    if (now < expires) {
      const remaining = Math.ceil((expires - now) / 1000);
      return { ok: false, remaining };
    }
  }
  __cooldowns.set(key, now + durationMs);
  return { ok: true };
}

// Pagination builder
async function __paginate(ctx, pages, timeoutMs = 60000) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  let current = 0;

  function buildEmbed(idx) {
    const p = pages[idx];
    const embed = new EmbedBuilder();
    if (p.title) embed.setTitle(p.title);
    if (p.description) embed.setDescription(p.description);
    if (p.color) embed.setColor(p.color);
    embed.setFooter({ text: \`Page \${idx + 1} / \${pages.length}\` });
    return embed;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("__page_prev").setLabel("◀").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("__page_next").setLabel("▶").setStyle(ButtonStyle.Secondary)
  );

  const msg = await ctx.reply({ embeds: [buildEmbed(0)], components: [row], fetchReply: true });
  const collector = msg.createMessageComponentCollector({ time: timeoutMs });

  collector.on("collect", async i => {
    if (i.user.id !== ctx.user.id) {
      await i.reply({ content: "This is not your paginator.", ephemeral: true });
      return;
    }
    if (i.customId === "__page_next") current = (current + 1) % pages.length;
    if (i.customId === "__page_prev") current = (current - 1 + pages.length) % pages.length;
    await i.update({ embeds: [buildEmbed(current)] });
  });

  collector.on("end", () => {
    msg.edit({ components: [] }).catch(() => {});
  });
}

// log helpers
const log = Object.assign(
  (msg) => console.log(\`[\${new Date().toISOString()}] \${msg}\`),
  {
    warn: (msg) => console.warn(\`[\${new Date().toISOString()}] WARN \${msg}\`),
    error: (msg) => console.error(\`[\${new Date().toISOString()}] ERROR \${msg}\`),
  }
);
`;
