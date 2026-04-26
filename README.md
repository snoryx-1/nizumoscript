# ⚡ NizumoScript

> **The programming language built for Discord bots.**

Write powerful, feature-rich Discord bots with clean and simple syntax. No boilerplate. No setup hell. Just write your bot and run it.

[![npm version](https://img.shields.io/npm/v/nizumo-script.svg)](https://www.npmjs.com/package/nizumo-script)
[![license](https://img.shields.io/npm/l/nizumo-script.svg)](https://github.com/snoryx-1/nizumoscript/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/nizumo-script.svg)](https://nodejs.org)

---

## What is NizumoScript?

NizumoScript is a purpose-built programming language designed exclusively for creating Discord bots. Instead of writing hundreds of lines of JavaScript or Python, you write clean NizumoScript code and the compiler handles everything — commands, events, cooldowns, permissions, embeds, buttons, slash commands, databases and more.

**Why NizumoScript over Discord.js or discord.py?**

| Problem with JS/Python | NizumoScript Solution |
|---|---|
| Massive boilerplate | Everything Discord-related is built in |
| Manual cooldowns | `cooldown 5s` — one line |
| No built-in database | `Storage` is first-class, no setup |
| Permission checks everywhere | `access moderator` — one line |
| Slash + prefix commands are complex | Both work from the same command block |
| Rate limits crash your bot | Handled automatically |
| Buttons/selects need complex handlers | `button "Label" { }` — inline |

---

## Installation

```bash
npm install -g nizumo-script
```

Verify:
```bash
nizumo help
```

Requires **Node.js >= 16.0.0**

---

## Quick Start

**1. Create your bot file** `mybot.nzs`:

```
bot "MyBot" {
  token "process.env.TOKEN"
  prefix "!"
  status "Built with NizumoScript ⚡"
}

command ping {
  description "Check if the bot is alive"
  access everyone
  cooldown 5s

  reply "🏓 Pong!"
}

on memberjoin {
  send channel "welcome" "Welcome {member.name}! 🎉"
}
```

**2. Create a `.env` file:**

```
TOKEN=your_discord_bot_token_here
```

**3. Run your bot:**

```bash
nizumo mybot.nzs
```

---

## CLI Commands

| Command | Description |
|---|---|
| `nizumo <file.nzs>` | Run a bot |
| `nizumo check <file.nzs>` | Check for syntax errors |
| `nizumo version` | Show version |
| `nizumo help` | Show help |

---

## Syntax Guide

### Bot Definition

```
bot "BotName" {
  token "process.env.TOKEN"
  prefix "!"
  status "Playing something"
}
```

**Advanced prefix system:**
```
bot "BotName" {
  token "process.env.TOKEN"
  prefix {
    global "!"
    fallback "."
    mention true
  }
}
```

---

### Commands

```
command ping {
  description "A ping command"
  access everyone
  cooldown 5s
  aliases ["p", "pong"]
  error "❌ Something went wrong!"

  reply "Pong! 🏓"
}
```

**Access levels:** `everyone` `moderator` `admin` `owner`
**Cooldown formats:** `5s` `10m` `2h` `1d`

---

### Per-Command Prefix

```
command modban {
  prefix ["!", "/"]
  access moderator

  ban member "Rule violation"
  reply "✅ Banned."
}
```

---

### Slash Commands

```
command info {
  slash
  access everyone
  description "Get bot info"

  reply "NizumoScript Bot v1.0 ⚡"
}
```

Slash commands are automatically registered with Discord on startup.

---

### Embeds

```
command profile {
  access everyone

  embed {
    title "👤 {member.name}"
    "Member profile"
    field "ID" "{member.id}"
    field "Joined" "{member.joinedAt}"
    color "#5865F2"
    footer "NizumoScript Bot"
  }
}
```

---

### Buttons

```
command confirm {
  access everyone

  reply "Are you sure?"

  button "✅ Yes" success {
    reply "Confirmed!"
  }

  button "❌ No" danger {
    reply "Cancelled."
  }
}
```

**Button styles:** `primary` `secondary` `success` `danger`

---

### Select Menus

```
command role {
  access everyone

  reply "Pick your role:"

  select "Choose a role..." {
    option "🔴 Red Team" "red" {
      give.role member "Red Team"
      reply "You joined Red Team!"
    }
    option "🔵 Blue Team" "blue" {
      give.role member "Blue Team"
      reply "You joined Blue Team!"
    }
  }
}
```

---

### Reaction Roles

```
command roles {
  access everyone

  reply "React with ⭐ to get the Star role!"

  reaction "⭐" {
    give.role member "Star"
    dm member "✅ You got the Star role!"
  }
}
```

---

### Events

```
on memberjoin {
  send channel "welcome" "Welcome {member.name}! 🎉"
}

on memberleave {
  send channel "general" "Goodbye {member.name}!"
}

on message {
  if message contains "hello bot" {
    reply "Hey {member.name}! 👋"
  }
}
```

**Available events:** `memberjoin` `memberleave` `message` `reactionadd` `reactionremove` `messagedelete` `ready`

---

### Variables

```
var coins = 100
set coins += 50
reply "You have {coins} coins!"
```

---

### Control Flow

```
if balance >= 1000 {
  reply "💎 Rich!"
} elif balance >= 100 {
  reply "🥈 Getting there!"
} else {
  reply "🥉 Keep going!"
}
```

---

### Loops

```
for each item in items {
  reply "{item}"
}

repeat 5 times {
  log "Hello!"
}

while count > 0 {
  set count -= 1
}
```

---

### Functions

```
func greet(name) {
  return "Hello {name}! 👋"
}

var msg = greet(member.name)
reply msg
```

---

### Scheduled Tasks

```
task cleanup {
  every 24h

  log "Running cleanup..."
}
```

**Duration formats:** `30s` `5m` `12h` `7d`

---

## Built-in Storage

NizumoScript has a built-in persistent database — no setup needed. Data is saved automatically to `.nizumo_data/` in your project.

```
// Global storage
Storage.set("key", value)
Storage.get("key", defaultValue)
Storage.delete("key")
Storage.has("key")

// Per-user storage
Storage.setUser(member.id, "coins", 100)
Storage.getUser(member.id, "coins", 0)
Storage.deleteUser(member.id, "coins")
```

**Economy example:**
```
command daily {
  access everyone
  cooldown 24h

  var current = Storage.getUser(member.id, "coins", 0)
  var reward = random(50, 150)
  var newBal = current + reward
  Storage.setUser(member.id, "coins", newBal)
  reply "✅ You claimed {reward} coins! Balance: {newBal} 🪙"
}
```

---

## Actions Reference

| Action | Description |
|---|---|
| `reply "msg"` | Reply to the command/message |
| `send "msg"` | Send to current channel |
| `send channel "name" "msg"` | Send to a specific channel |
| `dm member "msg"` | DM a member |
| `ban member "reason"` | Ban a member |
| `kick member "reason"` | Kick a member |
| `timeout member 10m` | Timeout a member |
| `give.role member "RoleName"` | Give a role to a member |
| `remove.role member "RoleName"` | Remove a role from a member |
| `delete.message` | Delete the triggering message |
| `add.reaction "⭐"` | Add a reaction to the message |
| `wait 2s` | Pause before next action |
| `log "text"` | Log to console |

---

## Context Variables

| Variable | Description |
|---|---|
| `member.name` | Member's display name |
| `member.id` | Member's Discord ID |
| `member.tag` | Member's tag (user#0000) |
| `member.roles` | Member's roles list |
| `member.isBot` | True if member is a bot |
| `member.joinedAt` | When the member joined |
| `message` | Message content |
| `server.name` | Server name |
| `server.id` | Server ID |
| `server.memberCount` | Total member count |
| `args.0` `args.1` | Command arguments |

---

## Built-in Math & Utilities

```
random(1, 100)       // Random number between 1 and 100
Math.round(x)
Math.floor(x)
Math.ceil(x)
Math.abs(x)
Math.min(a, b)
Math.max(a, b)
Math.pow(x, y)
Math.sqrt(x)
Time.now()           // Current timestamp
Time.today()         // Today's date (YYYY-MM-DD)
```

---

## Getting a Discord Bot Token

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**
3. Go to **Bot** → **Reset Token** → copy it
4. Enable **Message Content Intent**, **Server Members Intent**, **Presence Intent**
5. Paste the token in your `.env` file as `TOKEN=your_token_here`

---

## Project Structure

```
myproject/
├── mybot.nzs       ← Your NizumoScript bot
├── .env            ← Your bot token (never share this!)
└── .nizumo_data/   ← Auto-generated storage (gitignore this)
```

---

## License

MIT — Made with ❤️ by [snoryx-1](https://github.com/snoryx-1)
