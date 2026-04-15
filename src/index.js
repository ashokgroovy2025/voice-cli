import chalk from 'chalk';
import { configExists, loadConfig, runSetup } from './setup.js';
import { transcribeAzure } from './providers/azure.js';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

// Load saved config
const homeEnv = path.join(os.homedir(), '.voice-cli.env');
dotenv.config({ path: homeEnv });
dotenv.config();

export async function startVoiceCLI(options = {}) {
  // ── Setup wizard ──────────────────────────────────────────
  if (options.setup || !configExists()) {
    await runSetup();
    if (options.setup) process.exit(0);
    dotenv.config({ path: homeEnv, override: true });
  }

  const config   = loadConfig();
  const provider = options.provider || config.PROVIDER  || 'azure';
  const lang     = options.lang     || config.VOICE_CLI_LANG || 'en-IN';
  const hotkey   = options.hotkey   || config.HOTKEY || 'ctrl+shift+m';
  // clipboard mode: explicit --clipboard flag, or config says clipboard
  const clipboardMode = options.clipboard || config.OUTPUT_MODE === 'clipboard';

  // ── Build transcribe function ─────────────────────────────
  let transcribe;
  if (provider === 'azure') {
    const key    = options.key    || config.AZURE_SPEECH_KEY    || process.env.AZURE_SPEECH_KEY;
    const region = options.region || config.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION;
    if (!key || !region) {
      console.log(chalk.red('\n  ✗  Azure credentials missing. Run: ') + chalk.cyan('voice-cli --setup\n'));
      process.exit(1);
    }
    transcribe = () => transcribeAzure({ key, region, lang });

  } else if (provider === 'openai' || provider === 'groq') {
    const { transcribeWhisper } = await import('./providers/openai.js');
    const apiKey = provider === 'groq'
      ? (config.GROQ_API_KEY   || process.env.GROQ_API_KEY)
      : (config.OPENAI_API_KEY || process.env.OPENAI_API_KEY);
    if (!apiKey) {
      console.log(chalk.red(`\n  ✗  ${provider} API key missing. Run: `) + chalk.cyan('voice-cli --setup\n'));
      process.exit(1);
    }
    transcribe = () => transcribeWhisper({ apiKey, lang, provider });
  }

  // ── Test mode ─────────────────────────────────────────────
  if (options.test) {
    console.log(chalk.cyan('\n  Testing config...\n'));
    console.log(chalk.gray(`  Provider  : ${provider}`));
    console.log(chalk.gray(`  Language  : ${lang}`));
    console.log(chalk.gray(`  Hotkey    : ${hotkey}`));
    console.log(chalk.gray(`  Output    : ${clipboardMode ? 'clipboard' : 'auto-type at cursor'}`));
    console.log(chalk.green('\n  ✅  Config OK — ready to use!\n'));
    console.log(chalk.white('  Run ') + chalk.cyan('voice-cli') + chalk.white(' to start the daemon.\n'));
    process.exit(0);
  }

  // ── Start global hotkey daemon ────────────────────────────
  const silent = options.silent || false;
  await startDaemon({ transcribe, hotkey, clipboardMode, provider, lang, silent });
}

async function startDaemon({ transcribe, hotkey, clipboardMode, provider, lang, silent }) {
  // ── Banner (skipped in silent/startup mode) ───────────────
  if (!silent) {
    console.log('');
    console.log(chalk.cyan.bold('  🎤  voice-cli') + chalk.gray(' — global voice input'));
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log(chalk.gray(`  Provider : ${provider}  ·  Language: ${lang}`));
    console.log(chalk.gray(`  Output   : ${clipboardMode ? '📋 clipboard (Ctrl+V)' : '⌨️  auto-type at cursor'}`));
    console.log('');
    console.log(
      chalk.green.bold(`  🔑  ${hotkey.toUpperCase()}`) +
      chalk.white(' → speak → text appears where you are typing')
    );
    console.log(chalk.gray('  Works in Claude CLI, any terminal, any app'));
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log(chalk.gray('  Ctrl+C to stop  ·  vc --uninstall to remove from startup'));
    console.log('');
  }

  // ── Load uiohook-napi for global hotkey ──────────────────
  let uIOhook, UiohookKey;
  try {
    const mod = await import('uiohook-napi');
    uIOhook    = mod.uIOhook;
    UiohookKey = mod.UiohookKey;
  } catch {
    console.log(chalk.red('  ✗  uiohook-napi not found. Reinstall: npm install -g github:ashokgroovy2025/voice-cli\n'));
    process.exit(1);
  }

  // Parse hotkey string like "ctrl+shift+m"
  const parts     = hotkey.toLowerCase().split('+');
  const trigKey   = parts[parts.length - 1];
  const needCtrl  = parts.includes('ctrl');
  const needAlt   = parts.includes('alt');
  const needShift = parts.includes('shift');

  // Map key name to uiohook keycode
  const KEY_CODES = {
    'space': 57, 'enter': 28, 'tab': 15,
    'a':65,'b':48,'c':46,'d':32,'e':18,'f':33,'g':34,'h':35,'i':23,'j':36,
    'k':37,'l':38,'m':50,'n':49,'o':24,'p':25,'q':16,'r':19,'s':31,'t':20,
    'u':22,'v':47,'w':17,'x':45,'y':21,'z':44,
    'f1':59,'f2':60,'f3':61,'f4':62,'f5':63,'f6':64,'f7':65,'f8':66,'f9':67,'f10':68,'f11':87,'f12':88,
  };
  const targetCode = KEY_CODES[trigKey];
  if (!targetCode) {
    console.log(chalk.red(`  ✗  Unknown key: "${trigKey}". Use letters, space, enter, or f1-f12\n`));
    process.exit(1);
  }

  let recording = false;
  let stopFn    = null;

  uIOhook.on('keydown', (e) => {
    const ctrlOk  = !needCtrl  || e.ctrlKey;
    const altOk   = !needAlt   || e.altKey;
    const shiftOk = !needShift || e.shiftKey;
    const keyHit  = e.keycode === targetCode;

    if (!keyHit || !ctrlOk || !altOk || !shiftOk) return;

    if (recording) {
      // ── Stop recording ────────────────────────────────────
      recording = false;
      if (stopFn) stopFn();
      process.stdout.write('\r' + ' '.repeat(70) + '\r');
      process.stdout.write(chalk.yellow('  ⏳  Processing...\n'));
    } else {
      // ── Start recording ───────────────────────────────────
      recording = true;
      process.stdout.write(
        '\r  ' + chalk.red('🔴') + chalk.red.bold(' Recording') +
        chalk.gray('  speak now…  press ') + chalk.bold(hotkey.toUpperCase()) + chalk.gray(' again to stop')
      );

      transcribe().then(({ text, stop }) => {
        stopFn = stop;

        text.then(async (result) => {
          recording = false;
          stopFn = null;
          process.stdout.write('\r' + ' '.repeat(70) + '\r');

          if (!result || !result.trim()) {
            console.log(chalk.yellow('  ⚠  Nothing heard — try again\n'));
            return;
          }

          const trimmed = result.trim();
          console.log(chalk.green('  ✅  ') + chalk.white.bold('"' + trimmed + '"'));

          if (clipboardMode) {
            const { copyToClipboard } = await import('./output/clipboard.js');
            await copyToClipboard(trimmed);
            console.log(chalk.gray('  📋  Copied! Ctrl+V to paste\n'));
          } else {
            // Auto-type at cursor
            await typeText(trimmed);
            console.log(chalk.gray('  ⌨️  Typed at cursor\n'));
          }
        });

      }).catch((err) => {
        recording = false;
        process.stdout.write('\r' + ' '.repeat(70) + '\r');
        console.log(chalk.red('  ✗  ' + err.message + '\n'));
      });
    }
  });

  // Start listening
  uIOhook.start();

  process.on('SIGINT', () => {
    uIOhook.stop();
    console.log('\n' + chalk.gray('  voice-cli stopped. Bye! 👋\n'));
    process.exit(0);
  });
}

// ── Auto-type implementation ──────────────────────────────────
async function typeText(text) {
  try {
    // Try @nut-tree/nut-js first (best cross-platform support)
    const { keyboard, Key } = await import('@nut-tree/nut-js');
    keyboard.config.autoDelayMs = 0;
    await keyboard.type(text);
    return;
  } catch { /* not installed */ }

  try {
    // Fallback: robotjs
    const robot = (await import('robotjs')).default;
    robot.typeString(text);
    return;
  } catch { /* not installed */ }

  // Last resort: clipboard + auto-paste
  const { copyToClipboard } = await import('./output/clipboard.js');
  await copyToClipboard(text);

  try {
    const { keyboard, Key } = await import('@nut-tree/nut-js');
    await keyboard.pressKey(Key.LeftControl, Key.V);
    await keyboard.releaseKey(Key.LeftControl, Key.V);
  } catch {
    // Just clipboard, user needs Ctrl+V
    console.log(chalk.yellow('  📋  Auto-type unavailable — Ctrl+V to paste'));
  }
}
