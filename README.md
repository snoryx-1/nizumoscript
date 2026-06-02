# NizumoScript v1.0.0

A clean, readable language for building Discord bots. Compiles to JavaScript (discord.js v14).

## Install

```bash
npm install -g nizumoscript
```
## Quick Start

```bash
nzs init my-bot
cd my-bot
npm install
# Edit .env with your bot token
nzs run main.nzs
```

## CLI Commands

| Command | Description |
|---|---|
| `nzs build <file>` | Compile to JS |
| `nzs run <file>` | Compile and run |
| `nzs check <file>` | Type-check only |
| `nzs watch <file>` | Watch and recompile |
| `nzs init <name>` | New project |
| `nzs tokens <file>` | Print all tokens |
| `nzs ast <file>` | Print AST as JSON |
| `nzs info <file>` | File stats |
| `nzs clean` | Remove dist files |
| `nzs migrate <file>` | Migrate old syntax |
| `nzs format <file>` | Auto-format |
| `nzs repl` | Interactive REPL |

## Language Overview

```nzs
#nzs 1.0.1

bot {
  token: env.TOKEN
  prefix: "!"
  status: "online"
  activity: "my bot"
  activityType: "playing"
}

// Variables
const MAX = 100
let name = "Hero"
var int score = 0

// Types
type Player {
  name: str = "Unknown"
  level: int = 1
  coins: int = 0
}

// Store (persists to disk)
store PlayerData {
  scope: user
  level: int = 1
  xp: int = 0
}

// Embed
embed ProfileEmbed {
  title: "Profile"
  color: 0x5865F2
  description: "Your stats"
}

// Command
command profile {
  description: "View your profile"
  permission: "@everyone"
  cooldown: "5s"

  run(ctx) {
    const data = PlayerData.get(ctx)
    reply ProfileEmbed {
      description: "Level: {data.level} | XP: {data.xp:,}"
    }
  }
}

// Buttons
command menu {
  description: "Open menu"
  run(ctx) {
    reply "Choose an option:" with buttons {
      row {
        button {
          label: "Stats"
          style: "primary"
          id: "btn_stats"
          onClick(ctx) {
            reply ephemeral "Your stats!"
          }
        }
        button {
          label: "Help"
          style: "secondary"
          id: "btn_help"
          onClick(ctx) {
            reply ephemeral "Help menu!"
          }
        }
      }
    }
  }
}

// Events
event guildMemberAdd(member) {
  dm member "Welcome! 👋"
}

// Scheduled
every 1h {
  log "Still running!"
}

// Functions
fn add(a: int, b: int): int {
  return a + b
}

async fn fetchData(url: str) {
  const res = await fetch(url)
  return res
}
```

## Variables

| Syntax | Use |
|---|---|
| `const x = 5` | Immutable, inferred type |
| `let x = 5` | Mutable, inferred type |
| `var int x = 5` | Mutable, explicit type |

## Types

`int` `float` `str` `bool` `null` `any` `int[]` `map<str, int>` `Player?`

## Stores

```nzs
store Wallet {
  scope: user   // or guild / global
  coins: int = 0
}

// Usage
const w = Wallet.get(ctx)
Wallet.update(ctx, { coins: w.coins + 100 })
Wallet.delete(ctx)
Wallet.exists(ctx)
Wallet.init(ctx)
Wallet.getAll()
Wallet.query(x => x.coins > 500)
```

## String Interpolation

```nzs
"Hello {name}"
"Balance: {coins:,}"       // 1,234,567
"Score: {score:.2f}"       // 3.14
"ID: {id:d}"               // integer
```

## Control Flow

```nzs
if x > 10 {
  reply "big"
} else if x > 5 {
  reply "medium"
} else {
  reply "small"
}

match status {
  case "active" { reply "Online" }
  case "away"   { reply "Away" }
  default       { reply "Unknown" }
}

for item in list { log item }
for i, item in list { log "{i}: {item}" }
for i from 1 to 10 { log i }
while running { wait(1s) }
```

## Error Codes

| Code | Meaning |
|---|---|
| NZS001 | Unexpected token |
| NZS002 | Unexpected EOF |
| NZS003 | Type mismatch |
| NZS004 | Undefined variable |
| NZS005 | Undefined function |
| NZS006 | Undefined type |
| NZS007 | Missing required field |
| NZS008 | Import not found |
| NZS009 | Duplicate declaration |
| NZS010 | Invalid assignment to const |
| NZS011 | Missing bot{} block |
| NZS012 | Multiple bot{} blocks |
| NZS013 | Invalid permission level |
| NZS014 | Invalid cooldown format |
| NZS015 | Store missing scope |
| NZS016 | Possible null reference |
| NZS017 | Array index out of bounds |
| NZS018 | Invalid operator for type |
| NZS019 | Missing return statement |
| NZS020 | Circular import |

## License

MIT
