#!/usr/bin/env node
"use strict";

const { run, check } = require("./runtime/index.js");
const { sim }        = require("./simulator/index.js");
const path = require("path");

const args    = process.argv.slice(2);
const command = args[0];
const file    = args[1];

const VERSION = "0.0.1";

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
    nizumo sim <file.nzs>       Launch interactive simulator
    nizumo check <file.nzs>     Check for errors
    nizumo version              Show version
    nizumo help                 Show this help

  Examples:
    nizumo mybot.nzs
    nizumo sim mybot.nzs
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
  if (!file) { console.error("[NizumoScript] ❌ Usage: nizumo check <file.nzs>"); process.exit(1); }
  check(path.resolve(file));
  process.exit(0);
}

if (command === "sim") {
  if (!file) { console.error("[NizumoScript] ❌ Usage: nizumo sim <file.nzs>"); }
  sim(path.resolve(file));
  process.exit(0);
}

// default: nizumo <file.nzs>
const target = command;
if (!target.endsWith(".nzs")) {
  console.error(`[NizumoScript] ❌ Unknown command: "${target}". Usage: nizumo <file.nzs>`);
  process.exit(1);
}

run(path.resolve(target));
