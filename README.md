# 🎤 voice-cli

**Speech-to-text that actually works in your terminal.**

Press `Ctrl+Shift+M` anywhere — Claude CLI, PowerShell, VS Code, any app — speak, and your words are typed instantly. No window switching. No Ctrl+V. Just talk.

[![npm version](https://img.shields.io/npm/v/voice-cli)](https://www.npmjs.com/package/voice-cli)
[![npm downloads](https://img.shields.io/npm/dm/voice-cli)](https://www.npmjs.com/package/voice-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)]()

```
  🎤  voice-cli — global voice input daemon
  ─────────────────────────────────────────────
  Provider : azure  ·  Language: en-IN
  Output   : ⌨️  auto-type at cursor

  🔑  CTRL+SHIFT+M → speak → text appears where you are typing
  Works in Claude CLI, any terminal, any app
  ─────────────────────────────────────────────

  🔴 Recording  speak now…  press CTRL+SHIFT+M again to stop
  ✅  "explain react hooks in simple terms"
  ⌨️  Typed at cursor
```

---

## Why voice-cli?

Every quality dictation tool is **macOS-only** (SuperWhisper, VoiceInk), **Python-only** (whisper-writer), or **broken in terminals** (Windows Voice Typing `Win+H` doesn't work in PowerShell, WSL, or Claude CLI).

`voice-cli` is the only tool that:

| Feature | voice-cli | SuperWhisper | whisper-writer | Win+H |
|---------|:---------:|:------------:|:--------------:|:-----:|
| Works in terminal / Claude CLI | ✅ | ❌ | ❌ | ❌ |
| Windows + macOS + Linux | ✅ | macOS only | Win/Mac | Windows only |
| `npm install -g` (no Python) | ✅ | ❌ | ❌ | built-in |
| Auto-types at cursor (no Ctrl+V) | ✅ | ✅ | ✅ | ✅ |
| Azure + OpenAI + Groq providers | ✅ | ❌ | ❌ | ❌ |
| Runs as background daemon | ✅ | ✅ | ✅ | ✅ |
| Free / open source | ✅ | $8/mo | ✅ | ✅ |

---

## Install

```bash
npm install -g github:ashokgroovy2025/voice-cli
```

Requires Node.js 18+. No Python. No native build tools.

> Once published to npm: `npm install -g voice-cli`

---

## Quick Start (2 minutes)

```bash
# 1. Run setup wizard (one-time)
vc --setup

# 2. Register as startup daemon (runs on every login)
vc --install

# 3. Start now
vc
```

That's it. Press `Ctrl+Shift+M` in **any app** to start recording.

---

## Setup Wizard

The first time you run `vc`, it guides you through:

1. **Provider** — Choose Azure Speech, OpenAI Whisper, or Groq
2. **Credentials** — Paste your API key (saved to `~/.voice-cli.env`)
3. **Language** — en-IN, hi-IN, en-US, en-GB, and more
4. **Hotkey** — `Ctrl+Shift+M` (recommended) or any combo you prefer
5. **Output mode** — Auto-type at cursor, or clipboard (Ctrl+V)

Run `vc --setup` anytime to reconfigure.

---

## Usage

```bash
vc                              # Start daemon (global hotkey active)
vc --setup                      # Re-run setup wizard
vc --install                    # Register as Windows/macOS/Linux startup task
vc --uninstall                  # Remove from startup
vc --test                       # Test mic + provider connection
vc --hotkey ctrl+alt+space      # Override hotkey for this session
vc --clipboard                  # Clipboard mode instead of auto-type
```

---

## How It Works

```
PC boots → voice-cli daemon starts silently (no window)
             ↓
You open Claude CLI / PowerShell / VS Code terminal
             ↓
Press Ctrl+Shift+M  →  🔴 Recording starts
             ↓
Speak: "write a function to debounce API calls"
             ↓
Press Ctrl+Shift+M  →  text is auto-typed at cursor
```

The daemon uses a **global keyboard hook** (via `node-global-key-listener`) that works even when another application has focus — unlike clipboard-based tools that require switching windows.

---

## Speech Providers

### Azure Speech (Recommended — Free 5h/month)

Best accuracy for Indian English. Enterprise-grade. No usage billing on free tier.

```
Get key: portal.azure.com → Create Resource → Speech
Region:  centralindia (or your nearest region)
```

### OpenAI Whisper (Pay per use)

Highest accuracy globally. ~$0.006/minute.

```
Get key: platform.openai.com → API Keys
```

### Groq (Fastest — Free tier available)

Whisper-large via Groq's ultra-fast inference. Typical response under 300ms. Free tier available.

```
Get key: console.groq.com → API Keys
```

---

## Supported Languages

| Code | Language |
|------|----------|
| `en-IN` | English (India) — default |
| `hi-IN` | Hindi |
| `en-US` | English (US) |
| `en-GB` | English (UK) |

Full Azure language list: [Azure Speech Language Support](https://learn.microsoft.com/azure/ai-services/speech-service/language-support)

---

## Auto-Start on Login

```bash
vc --install
```

**Windows** — Creates a Task Scheduler job that launches the daemon silently on login (no console window).

**macOS** — Creates a `~/Library/LaunchAgents/com.voice-cli.plist` LaunchAgent.

**Linux** — Creates a `~/.config/systemd/user/voice-cli.service` systemd unit.

To remove:
```bash
vc --uninstall
```

---

## Reconfigure

Everything is set up via the wizard. No manual file editing needed.

```bash
vc --setup    # change provider, API key, language, hotkey, or output mode
```

> Advanced: if you need to override for a single session (CI/scripts), use env vars:
> ```bash
> AZURE_SPEECH_KEY=xxx AZURE_SPEECH_REGION=centralindia vc
> ```

---

## Use with Claude CLI

This tool was built for [Claude Code](https://claude.ai/code):

```bash
# Terminal 1: Start voice daemon (once, can minimize)
vc

# Terminal 2: Start Claude
claude --dangerously-skip-permissions

# Now in Claude CLI:
# Press Ctrl+Shift+M → speak your prompt → it auto-types
# Press Enter to send
```

Works the same in any interactive CLI: `python`, `node`, `psql`, `redis-cli`, etc.

---

## Requirements

- **Node.js** 18+
- **Microphone** (built-in or external)
- **OS**: Windows 10/11, macOS 12+, Ubuntu 20.04+
- **API key** from one provider (Azure free tier recommended)

---

## Troubleshooting

**Hotkey not working?**
- On Linux: ensure X11/Wayland accessibility is enabled
- On macOS: grant Accessibility permission in System Settings → Privacy

**Azure error 401?**
- Run `vc --setup` to re-enter credentials

**Auto-type not working?**
- Run `vc --clipboard` as fallback — text goes to clipboard, Ctrl+V to paste
- Install optional auto-type: `npm install -g @nut-tree/nut-js`

**Daemon not starting on login?**
- Re-run `vc --install`
- Windows: check Task Scheduler → `voice-cli` task exists and is enabled

---

## License

MIT © [Ashok Sachdev](https://github.com/ashokgroovy2025)

---

## Keywords

voice to text terminal · speech to text cli · dictation for developers · voice input cli tool · global hotkey speech recognition · auto type voice transcription · whisper cli dictation · azure speech cli npm · openai whisper background daemon · voice coding tool cross-platform
