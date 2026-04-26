#!/usr/bin/env node
"use strict";

const { run, check } = require("./runtime/index.js");
const path = require("path");

const args    = process.argv.slice(2);
const command = args[0];
const file    = args[1];

const VERSION = "1.0.0";

const HELP = `
  ███╗   ██╗██╗███████╗██╗   ██╗███╗   ███╗ ██████╗
  ████╗  ██║██║╚══███╔╝██║   ██║████╗ ████║██╔═══██╗
  ██╔██╗ ██║██║  ███╔╝ ██║   ██║██╔████╔██║██║   ██║
  ██║╚██╗██║██║ ███╔╝  ██║   ██║██║╚██╔╝██║██║   ██║
  ██║ ╚████║██║███████╗╚██████╔╝██║ ╚═╝ ██║╚██████╔╝
  ╚═╝  ╚═══╝╚═╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝
  NizumoScript v${VERSION} — The Discord Bot Language

  Usage:
    nizumo <file.nzs>           Run a bot
    nizumo check <file.nzs>     Check for errors
    nizumo version              Show version
    nizumo help                 Show this help

  Examples:
    nizumo mybot.nzs
    nizumo check mybot.nzs
`;

if (!command || command === "help" || command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(0);
}

if (command === "version" || command === "--version" || command === "-v") {
  console.log(`NizumoScript v${VERSION}`);
  process.exit(0);
}

if (command === "check") {
  if (!file) { console.error("[NizumoScript] ❌ Please provide a file: nizumo check <file.nzs>"); process.exit(1); }
  check(path.resolve(file));
  process.exit(0);
}

// default: nizumo <file.nzs>
const target = command; // first arg IS the file
if (!target.endsWith(".nzs")) {
  console.error(`[NizumoScript] ❌ Unknown command or file: "${target}". Did you mean: nizumo ${target}.nzs?`);
  process.exit(1);
}

run(path.resolve(target));
