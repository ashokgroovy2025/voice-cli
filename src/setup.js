import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.voice-cli.env');

export function configExists() {
  if (!fs.existsSync(CONFIG_PATH)) return false;
  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  return content.includes('PROVIDER=');
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  const lines = fs.readFileSync(CONFIG_PATH, 'utf8').split('\n');
  const config = {};
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) config[key.trim()] = rest.join('=').trim();
  }
  return config;
}

function saveConfig(config) {
  const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(CONFIG_PATH, lines + '\n', 'utf8');
}

export async function runSetup() {
  console.log('');
  console.log(chalk.cyan.bold('  🎤  voice-cli — First Time Setup'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  console.log('');

  // Step 1: Provider
  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Which speech provider?',
    prefix: '  ',
    choices: [
      { name: '☁️  Azure Speech   (Free 5h/month — recommended)', value: 'azure' },
      { name: '🤖  OpenAI Whisper (Pay per use — very accurate)', value: 'openai' },
      { name: '⚡  Groq Whisper   (Free tier — fastest)',          value: 'groq' },
    ]
  }]);

  const config = { PROVIDER: provider };

  // Step 2: Provider-specific credentials
  if (provider === 'azure') {
    console.log('');
    console.log(chalk.gray('  Get your key: portal.azure.com → Speech resource → Keys'));
    console.log('');
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Azure Speech Key:',
        prefix: '  ',
        mask: '•',
        validate: (v) => v.length > 10 || 'Please enter a valid key'
      },
      {
        type: 'input',
        name: 'region',
        message: 'Azure Region:',
        prefix: '  ',
        default: 'centralindia',
      }
    ]);
    config.AZURE_SPEECH_KEY = answers.key;
    config.AZURE_SPEECH_REGION = answers.region;

  } else if (provider === 'openai') {
    console.log('');
    console.log(chalk.gray('  Get your key: platform.openai.com → API Keys'));
    console.log('');
    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'OpenAI API Key:',
      prefix: '  ',
      mask: '•',
      validate: (v) => v.startsWith('sk-') || 'Key should start with sk-'
    }]);
    config.OPENAI_API_KEY = key;

  } else if (provider === 'groq') {
    console.log('');
    console.log(chalk.gray('  Get your key: console.groq.com → API Keys'));
    console.log('');
    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'Groq API Key:',
      prefix: '  ',
      mask: '•',
      validate: (v) => v.length > 10 || 'Please enter a valid key'
    }]);
    config.GROQ_API_KEY = key;
  }

  // Step 3: Language
  const { lang } = await inquirer.prompt([{
    type: 'list',
    name: 'lang',
    message: 'Primary language?',
    prefix: '  ',
    choices: [
      { name: '🇮🇳  English (India)    en-IN', value: 'en-IN' },
      { name: '🇮🇳  Hindi              hi-IN', value: 'hi-IN' },
      { name: '🇺🇸  English (US)       en-US', value: 'en-US' },
      { name: '🇬🇧  English (UK)       en-GB', value: 'en-GB' },
    ]
  }]);
  config.VOICE_CLI_LANG = lang;

  // Step 4: Global hotkey
  console.log('');
  console.log(chalk.gray('  This hotkey works anywhere — even when Claude CLI is focused.'));
  console.log('');
  const { hotkey } = await inquirer.prompt([{
    type: 'list',
    name: 'hotkey',
    message: 'Global hotkey to trigger recording?',
    prefix: '  ',
    choices: [
      { name: '⌨️   Ctrl+Shift+M   (recommended — easy to press while typing)', value: 'ctrl+shift+m' },
      { name: '⌨️   Ctrl+Alt+Space',                                            value: 'ctrl+alt+space' },
      { name: '⌨️   Ctrl+Shift+Space',                                          value: 'ctrl+shift+space' },
      { name: '⌨️   Ctrl+Alt+R     (R for Record)',                             value: 'ctrl+alt+r' },
    ]
  }]);
  config.HOTKEY = hotkey;

  // Step 5: Output mode
  console.log('');
  const { outputMode } = await inquirer.prompt([{
    type: 'list',
    name: 'outputMode',
    message: 'How to deliver the text?',
    prefix: '  ',
    choices: [
      { name: '⌨️   Auto-type at cursor  (text appears where you are typing — no Ctrl+V)', value: 'autotype' },
      { name: '📋  Copy to clipboard    (you press Ctrl+V to paste)',                      value: 'clipboard' },
    ]
  }]);
  config.OUTPUT_MODE = outputMode;

  // Save
  saveConfig(config);

  console.log('');
  console.log(chalk.green('  ✅  Config saved to ~/.voice-cli.env'));
  console.log('');
  console.log(chalk.white('  Run ') + chalk.cyan.bold('vc') + chalk.white(' — daemon starts, then press ') + chalk.cyan.bold(hotkey.toUpperCase()) + chalk.white(' anywhere to speak.'));
  console.log(chalk.gray('  Works in Claude CLI, any terminal, VS Code, anywhere!'));
  console.log(chalk.gray('  To reconfigure: ') + chalk.cyan('voice-cli --setup'));
  console.log('');

  return config;
}
