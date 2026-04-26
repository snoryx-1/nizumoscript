# ⚡ NizumoScript

**The programming language built for Discord bots.**

Write powerful Discord bots with clean, simple syntax. No boilerplate. No setup hell. Just write your bot.

---

## Installation

```bash
npm install -g nizumoscript
```

---

## Quick Start

Create a file called `mybot.nzs`:

```
bot "MyBot" {
  token env.TOKEN
  prefix "!"
  status "Built with NizumoScript ⚡"
}

command ping {
  description "Ping the bot"
  access everyone
  cooldown 5s

  reply "🏓 Pong!"
}

on memberjoin {
  send channel "welcome" "Welcome {member.name}! 🎉"
}
```

Create a `.env` file:
```
TOKEN=your_discord_bot_token_here
```

Run your bot:
```bash
nizumo mybot.nzs
```

---

## CLI Commands

| Command | Description |
|---|---|
| `nizumo <file.nzs>` | Run a bot |
| `nizumo check <file.nzs>` | Check for errors |
| `nizumo version` | Show version |
| `nizumo help` | Show help |

---

## Syntax

### Bot Definition
```
bot "BotName" {
  token env.TOKEN
  prefix "!"
  status "Playing something"
}
```

### Commands
```
command ping {
  description "A ping command"
  access everyone       // everyone | moderator | admin
  cooldown 5s           // 5s, 10m, 2h, 1d
  aliases ["p", "pong"]

  reply "Pong! 🏓"
}
```

### Events
```
on memberjoin {
  send channel "welcome" "Welcome {member.name}!"
}

on message {
  if message contains "hello" {
    reply "Hey {member.name}!"
  }
}
```

### Variables
```
var coins = Storage.getUser(member.id, "coins", 0)
set coins += 100
Storage.setUser(member.id, "coins", coins)
```

### Embeds
```
embed {
  title "My Embed"
  "This is the description"
  field "Name" "Value"
  color "#5865F2"
  footer "My Bot"
}
```

### Tasks (Scheduled)
```
task cleanup {
  every 24h

  log "Cleanup ran!"
}
```

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

### Loops
```
for each item in items {
  reply "{item}"
}

repeat 5 times {
  log "Hello!"
}
```

### Functions
```
func greet(name) {
  return "Hello {name}!"
}

var msg = greet(member.name)
reply msg
```

---

## Built-in Storage

NizumoScript has a built-in database — no setup needed.

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

// Leaderboard
Storage.leaderboard("coins", 10)
```

---

## Context Variables

| Variable | Description |
|---|---|
| `member.name` | Member's display name |
| `member.id` | Member's Discord ID |
| `member.tag` | Member's tag |
| `member.roles` | Member's roles |
| `member.isBot` | True if member is a bot |
| `message` | Message content (in ON message) |
| `server.name` | Server name |
| `server.id` | Server ID |
| `server.memberCount` | Member count |
| `args.0`, `args.1` | Command arguments |

---

## Actions

| Action | Description |
|---|---|
| `reply "msg"` | Reply to the command |
| `send "msg"` | Send to current channel |
| `send channel "name" "msg"` | Send to a specific channel |
| `dm member "msg"` | DM a member |
| `ban member "reason"` | Ban a member |
| `kick member "reason"` | Kick a member |
| `timeout member 10m` | Timeout a member |
| `give.role member "RoleName"` | Give a role |
| `remove.role member "RoleName"` | Remove a role |
| `delete.message` | Delete the message |
| `wait 2s` | Wait before next action |
| `log "text"` | Log to console |

---

## License

MIT — Made with ❤️ by the NizumoScript team.
