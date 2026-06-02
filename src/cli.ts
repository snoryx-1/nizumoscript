#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Resolver } from "./resolver";
import { Transpiler } from "./transpiler";
import { NZSError } from "./errors";

const VERSION = "1.0.0";

const HELP = `
NizumoScript v${VERSION} — Discord bot language compiler

Usage:
  nzs <command> [options]

Commands:
  build <file>          Compile a .nzs file to JavaScript
  run <file>            Compile and run immediately
  check <file>          Type-check without emitting output
  watch <file>          Watch for changes and recompile
  init [name]           Create a new NZS project
  new <name>            Alias for init
  info <file>           Show AST/token info for debugging
  tokens <file>         Print all tokens from a file
  ast <file>            Print the full AST as JSON
  clean [dir]           Remove all compiled .js output files
  version               Print version
  help                  Print this help message

  migrate <file>        Migrate old NZS syntax to v1.0.0
  format <file>         Auto-format a .nzs file (basic)
  lint <file>           Run the resolver and report issues
  docs                  Open NZS documentation in browser
  repl                  Start an interactive NZS REPL

Options:
  --out <dir>           Output directory (default: ./dist)
  --no-comments         Strip source comments from output
  --minify              Minify JS output
  --strict              Treat warnings as errors
  --silent              Suppress all output except errors
`;

interface CLIOptions {
  out: string;
  comments: boolean;
  minify: boolean;
  strict: boolean;
  silent: boolean;
}

function parseArgs(argv: string[]): { cmd: string; file?: string; opts: CLIOptions; extra: string[] } {
  const opts: CLIOptions = { out: "./dist", comments: true, minify: false, strict: false, silent: false };
  const extra: string[] = [];
  let cmd = "";
  let file: string | undefined;

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) { opts.out = argv[++i]; }
    else if (a === "--no-comments") opts.comments = false;
    else if (a === "--minify") opts.minify = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--silent") opts.silent = true;
    else if (!cmd) cmd = a;
    else if (!file && !a.startsWith("--")) file = a;
    else extra.push(a);
    i++;
  }

  return { cmd, file, opts, extra };
}

function compile(filePath: string, opts: CLIOptions): { js: string; errors: NZSError[]; warnings: NZSError[] } | null {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`[NZS] File not found: ${absPath}`);
    return null;
  }

  const source = fs.readFileSync(absPath, "utf8");

  try {
    // Lex
    const lexer = new Lexer(source, filePath);
    const tokens = lexer.tokenize();

    // Parse
    const parser = new Parser(tokens, filePath);
    const ast = parser.parse();

    // Resolve
    const resolver = new Resolver(filePath);
    const result = resolver.resolve(ast);

    // Print errors/warnings
    for (const w of result.warnings) {
      if (!opts.silent) console.warn(w.format());
    }
    for (const e of result.errors) {
      console.error(e.format());
    }
    if (result.errors.length > 0) return { js: "", errors: result.errors, warnings: result.warnings };
    if (opts.strict && result.warnings.length > 0) {
      console.error("[NZS] Strict mode: warnings treated as errors.");
      return { js: "", errors: result.warnings, warnings: [] };
    }

    // Transpile
    const transpiler = new Transpiler({ sourceComments: opts.comments, minify: opts.minify });
    const js = transpiler.transpile(ast, filePath);

    return { js, errors: [], warnings: result.warnings };
  } catch (err) {
    if (err instanceof NZSError) {
      console.error(err.format());
      return { js: "", errors: [err], warnings: [] };
    }
    throw err;
  }
}

function writeOutput(filePath: string, js: string, outDir: string): string {
  const base = path.basename(filePath, ".nzs");
  const outPath = path.join(outDir, base + ".js");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, js, "utf8");
  return outPath;
}

function cmdBuild(file: string, opts: CLIOptions) {
  if (!opts.silent) console.log(`[NZS] Building ${file}...`);
  const result = compile(file, opts);
  if (!result || result.errors.length > 0) {
    console.error(`[NZS] Build failed.`);
    process.exit(1);
  }
  const out = writeOutput(file, result.js, opts.out);
  if (!opts.silent) console.log(`[NZS] ✓ Built → ${out}`);
}

function cmdRun(file: string, opts: CLIOptions) {
  if (!opts.silent) console.log(`[NZS] Building and running ${file}...`);
  const result = compile(file, opts);
  if (!result || result.errors.length > 0) {
    console.error(`[NZS] Build failed. Cannot run.`);
    process.exit(1);
  }
  const out = writeOutput(file, result.js, opts.out);
  if (!opts.silent) console.log(`[NZS] ✓ Starting bot...`);

  const { spawnSync } = require("child_process");
  const proc = spawnSync("node", [out], { stdio: "inherit" });
  process.exit(proc.status ?? 0);
}

function cmdCheck(file: string, opts: CLIOptions) {
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath)) { console.error(`[NZS] File not found: ${absPath}`); process.exit(1); }
  const source = fs.readFileSync(absPath, "utf8");

  try {
    const tokens = new Lexer(source, file).tokenize();
    const ast = new Parser(tokens, file).parse();
    const result = new Resolver(file).resolve(ast);

    for (const w of result.warnings) console.warn(w.format());
    for (const e of result.errors) console.error(e.format());

    if (result.errors.length === 0) {
      if (!opts.silent) console.log(`[NZS] ✓ ${file} — no errors`);
    } else {
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof NZSError) { console.error(err.format()); process.exit(1); }
    throw err;
  }
}

function cmdWatch(file: string, opts: CLIOptions) {
  console.log(`[NZS] Watching ${file}...`);
  cmdBuild(file, { ...opts, silent: true });
  console.log(`[NZS] ✓ Initial build done. Watching for changes...`);

  fs.watch(file, (event) => {
    if (event === "change") {
      console.log(`[NZS] Change detected, rebuilding...`);
      const result = compile(file, opts);
      if (result && result.errors.length === 0) {
        writeOutput(file, result.js, opts.out);
        console.log(`[NZS] ✓ Rebuilt at ${new Date().toLocaleTimeString()}`);
      } else {
        console.error(`[NZS] ✗ Build failed at ${new Date().toLocaleTimeString()}`);
      }
    }
  });
}

function cmdInit(name: string) {
  const dir = path.resolve(name);
  if (fs.existsSync(dir)) { console.error(`[NZS] Directory '${name}' already exists.`); process.exit(1); }
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "dist"));
  fs.mkdirSync(path.join(dir, "data"));

  // main.nzs
  fs.writeFileSync(path.join(dir, "main.nzs"), `#nzs 1.0.0

bot {
  token: env.TOKEN
  prefix: "!"
  status: "online"
  activity: "NizumoScript v1.0.0"
  activityType: "playing"
}

command ping {
  description: "Check if the bot is alive"
  permission: "@everyone"
  cooldown: "3s"

  run(ctx) {
    reply "Pong! 🏓"
  }
}
`);

  // .env
  fs.writeFileSync(path.join(dir, ".env"), `TOKEN=your_bot_token_here\nGUILD_ID=your_guild_id_for_dev\nBOT_OWNER_ID=your_discord_id\n`);

  // .gitignore
  fs.writeFileSync(path.join(dir, ".gitignore"), `node_modules/\ndist/\ndata/\n.env\n`);

  // package.json
  const pkg = {
    name,
    version: "1.0.0",
    main: "dist/main.js",
    scripts: {
      build: "nzs build main.nzs",
      start: "nzs run main.nzs",
      watch: "nzs watch main.nzs",
      check: "nzs check main.nzs",
    },
    dependencies: {
      "discord.js": "^14.0.0",
      "dotenv": "^16.0.0",
    },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  // nzs.config
  fs.writeFileSync(path.join(dir, "nzs.config"), `version: 1.0.0\nout: ./dist\nentry: main.nzs\n`);

  // README
  fs.writeFileSync(path.join(dir, "README.md"), `# ${name}\n\nA Discord bot built with NizumoScript v1.0.0.\n\n## Setup\n\n\`\`\`bash\nnpm install\n# Edit .env with your token\nnpm start\n\`\`\`\n`);

  console.log(`[NZS] ✓ Project '${name}' created!`);
  console.log(`[NZS]   cd ${name}`);
  console.log(`[NZS]   npm install`);
  console.log(`[NZS]   # Edit .env with your bot token`);
  console.log(`[NZS]   nzs run main.nzs`);
}

function cmdTokens(file: string) {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const tokens = new Lexer(source, file).tokenize();
  for (const t of tokens) {
    console.log(`[${String(t.line).padStart(3)}:${String(t.col).padStart(3)}] ${t.type.padEnd(20)} ${JSON.stringify(t.value)}`);
  }
}

function cmdAst(file: string) {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const tokens = new Lexer(source, file).tokenize();
  const ast = new Parser(tokens, file).parse();
  console.log(JSON.stringify(ast, null, 2));
}

function cmdInfo(file: string) {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const tokens = new Lexer(source, file).tokenize();
  const ast = new Parser(tokens, file).parse();
  const result = new Resolver(file).resolve(ast);
  console.log(`File:      ${file}`);
  console.log(`Lines:     ${source.split("\n").length}`);
  console.log(`Tokens:    ${tokens.length}`);
  console.log(`Nodes:     ${countNodes(ast)}`);
  console.log(`Errors:    ${result.errors.length}`);
  console.log(`Warnings:  ${result.warnings.length}`);
  console.log(`Commands:  ${result.commandNames.join(", ") || "(none)"}`);
  console.log(`Bot block: ${result.hasBotBlock ? "yes" : "no"}`);
}

function countNodes(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let count = 1;
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) count += v.reduce((a, n) => a + countNodes(n), 0);
    else if (typeof v === "object") count += countNodes(v);
  }
  return count;
}

function cmdClean(dir: string = "./dist") {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) { console.log(`[NZS] Nothing to clean.`); return; }
  const files = fs.readdirSync(absDir).filter(f => f.endsWith(".js"));
  for (const f of files) {
    fs.unlinkSync(path.join(absDir, f));
    console.log(`[NZS] Removed ${f}`);
  }
  console.log(`[NZS] ✓ Cleaned ${files.length} file(s) from ${dir}`);
}

function cmdMigrate(file: string) {
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath)) { console.error(`[NZS] File not found: ${absPath}`); process.exit(1); }
  let src = fs.readFileSync(absPath, "utf8");

  let changed = 0;

  // v0.x → v1.0.0 migrations
  // use X.set() → X.update()
  src = src.replace(/\buse\b\s+(\w+)/g, (_, name) => { changed++; return `${name}.update(ctx,`; });

  // #nzs without version
  if (!src.startsWith("#nzs")) { src = `#nzs 1.0.0\n` + src; changed++; }

  // Old variable syntax: x = 5 at top level → let x = 5
  // (too risky to automate fully — just warn)

  const backup = absPath + ".bak";
  fs.writeFileSync(backup, fs.readFileSync(absPath));
  fs.writeFileSync(absPath, src);
  console.log(`[NZS] ✓ Migrated ${file} (${changed} change(s)). Backup saved to ${backup}`);
}

function cmdFormat(file: string) {
  // Basic formatter: normalize indentation
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath)) { console.error(`[NZS] File not found`); process.exit(1); }
  const src = fs.readFileSync(absPath, "utf8");
  const lines = src.split("\n");
  let indent = 0;
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { out.push(""); continue; }
    if (line.startsWith("}")) indent = Math.max(0, indent - 1);
    out.push("  ".repeat(indent) + line);
    if (line.endsWith("{")) indent++;
  }
  fs.writeFileSync(absPath, out.join("\n"));
  console.log(`[NZS] ✓ Formatted ${file}`);
}

function cmdDocs() {
  const url = "https://github.com/snoryx-1/nizumoscript#readme";
  console.log(`[NZS] Opening docs: ${url}`);
  const { execSync } = require("child_process");
  try { execSync(`xdg-open "${url}" 2>/dev/null || open "${url}" 2>/dev/null || start "${url}"`); }
  catch { console.log(`[NZS] Visit: ${url}`); }
}

function cmdRepl() {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "nzs> " });
  console.log(`NizumoScript v${VERSION} REPL — type .exit to quit`);
  rl.prompt();
  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (trimmed === ".exit" || trimmed === "exit") { console.log("Bye!"); process.exit(0); }
    if (!trimmed) { rl.prompt(); return; }
    try {
      const tokens = new Lexer(trimmed + "\n", "<repl>").tokenize();
      const ast = new Parser(tokens, "<repl>").parse();
      const transpiler = new Transpiler({ sourceComments: false });
      const js = transpiler.transpile(ast, "<repl>");
      // Only print the generated code since we can't run Discord code standalone
      const relevant = js.split("\n").filter(l =>
        !l.includes("require(") && !l.includes("const client") &&
        !l.includes("client.") && !l.trim().startsWith("//") && l.trim()
      ).slice(0, 10);
      console.log(relevant.join("\n"));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
    }
    rl.prompt();
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) { console.log(HELP); process.exit(0); }

  const { cmd, file, opts, extra } = parseArgs(argv);

  switch (cmd) {
    case "build":
      if (!file) { console.error("[NZS] Usage: nzs build <file>"); process.exit(1); }
      cmdBuild(file, opts);
      break;

    case "run":
      if (!file) { console.error("[NZS] Usage: nzs run <file>"); process.exit(1); }
      cmdRun(file, opts);
      break;

    case "check":
    case "lint":
      if (!file) { console.error("[NZS] Usage: nzs check <file>"); process.exit(1); }
      cmdCheck(file, opts);
      break;

    case "watch":
      if (!file) { console.error("[NZS] Usage: nzs watch <file>"); process.exit(1); }
      cmdWatch(file, opts);
      break;

    case "init":
    case "new":
      cmdInit(file || "my-bot");
      break;

    case "tokens":
      if (!file) { console.error("[NZS] Usage: nzs tokens <file>"); process.exit(1); }
      cmdTokens(file);
      break;

    case "ast":
      if (!file) { console.error("[NZS] Usage: nzs ast <file>"); process.exit(1); }
      cmdAst(file);
      break;

    case "info":
      if (!file) { console.error("[NZS] Usage: nzs info <file>"); process.exit(1); }
      cmdInfo(file);
      break;

    case "clean":
      cmdClean(file || "./dist");
      break;

    case "migrate":
      if (!file) { console.error("[NZS] Usage: nzs migrate <file>"); process.exit(1); }
      cmdMigrate(file);
      break;

    case "format":
      if (!file) { console.error("[NZS] Usage: nzs format <file>"); process.exit(1); }
      cmdFormat(file);
      break;

    case "docs":
      cmdDocs();
      break;

    case "repl":
      cmdRepl();
      break;

    case "version":
    case "--version":
    case "-v":
      console.log(`NizumoScript v${VERSION}`);
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;

    default:
      console.error(`[NZS] Unknown command: '${cmd}'. Run 'nzs help' for usage.`);
      process.exit(1);
  }
}

main();
