"use strict";

const fs   = require("fs");
const path = require("path");
const { Lexer }    = require("../lexer/index.js");
const { Parser }   = require("../parser/index.js");
const { Compiler } = require("../compiler/index.js");

function compile(source) {
  const tokens  = new Lexer(source).tokenize();
  const ast     = new Parser(tokens).parse();
  return new Compiler(ast).compile();
}

function run(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`[NizumoScript] ❌ File not found: ${absPath}`);
    process.exit(1);
  }

  const source   = fs.readFileSync(absPath, "utf-8");
  const compiled = compile(source);

  // write compiled output next to source file
  const outPath = path.join(path.dirname(absPath), ".nizumo_out.js");

  // also copy storage helper next to output
  const storageSrc  = path.join(__dirname, "__storage.js");
  const storageDest = path.join(path.dirname(absPath), "__storage.js");
  if (!fs.existsSync(storageDest)) fs.copyFileSync(storageSrc, storageDest);

  fs.writeFileSync(outPath, compiled, "utf-8");
  console.log(`[NizumoScript] ✅ Compiled successfully!`);
  console.log(`[NizumoScript] 🚀 Starting bot...\n`);

  // run from project dir so dotenv finds .env
  process.chdir(path.dirname(absPath));
  require(outPath);
}

function check(filePath) {
  const source = fs.readFileSync(path.resolve(filePath), "utf-8");
  try {
    compile(source);
    console.log("[NizumoScript] ✅ No errors found!");
  } catch (err) {
    console.error("[NizumoScript] ❌ Error:", err.message);
    process.exit(1);
  }
}

module.exports = { run, check, compile };
