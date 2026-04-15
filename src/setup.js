import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

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

// ── Simple readline prompt — works in PowerShell, CMD, Git Bash ──
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    let input = '';
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '\u0003') {
        process.exit();
      } else if (char === '\u007f' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += char;
        process.stdout.write('•');
      }
    };
    process.stdin.on('data', onData);
  });
}

async function choose(question, choices) {
  console.log('');
  console.log(chalk.white('  ' + question));
  choices.forEach((c, i) => {
    console.log(chalk.gray(`  ${i + 1}) `) + chalk.white(c.name));
  });
  console.log('');

  while (true) {
    const answer = await ask(chalk.cyan(`  Enter choice [1-${choices.length}]: `));
    const num = parseInt(answer);
    if (num >= 1 && num <= choices.length) {
      console.log(chalk.green(`  ✔ `) + chalk.white(choices[num - 1].name));
      return choices[num - 1].value;
    }
    console.log(chalk.yellow(`  Please enter a number between 1 and ${choices.length}`));
  }
}

export async function runSetup() {
  console.log('');
  console.log(chalk.cyan.bold('  🎤  voice-cli — Setup'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  console.log('');

  // Step 1: Provider
  const provider = await choose('Which speech provider?', [
    { name: 'Azure Speech    — Free 5h/month (recommended)', value: 'azure' },
    { name: 'OpenAI Whisper  — Pay per use, very accurate',  value: 'openai' },
    { name: 'Groq Whisper    — Free tier, fastest (~300ms)', value: 'groq' },
  ]);

  const config = { PROVIDER: provider };

  // Step 2: Credentials
  if (provider === 'azure') {
    console.log('');
    console.log(chalk.cyan.bold('  How to get your Azure Speech Key (free):'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.white('  1. Open: ') + chalk.cyan('https://portal.azure.com'));
    console.log(chalk.white('  2. Click ') + chalk.yellow('"Create a resource"'));
    console.log(chalk.white('  3. Search ') + chalk.yellow('"Speech"') + chalk.white(' → Select ') + chalk.yellow('"Speech"') + chalk.white(' by Microsoft'));
    console.log(chalk.white('  4. Create it → Pricing tier: ') + chalk.green('F0 (Free)'));
    console.log(chalk.white('  5. After deploy → Go to resource → ') + chalk.yellow('"Keys and Endpoint"'));
    console.log(chalk.white('  6. Copy ') + chalk.yellow('KEY 1') + chalk.white(' → paste below'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log('');
    const key = await askPassword('  Paste Azure Speech Key 1: ');
    if (key.length < 10) { console.log(chalk.red('  ✗  Invalid key — too short')); process.exit(1); }

    console.log('');
    console.log(chalk.gray('  Region is shown on the Keys and Endpoint page (e.g. centralindia, eastus)'));
    const region = await ask(chalk.white('  Azure Region ') + chalk.gray('[centralindia]: '));
    config.AZURE_SPEECH_KEY    = key;
    config.AZURE_SPEECH_REGION = region || 'centralindia';

  } else if (provider === 'openai') {
    console.log('');
    console.log(chalk.cyan.bold('  How to get your OpenAI API Key:'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.white('  1. Open: ') + chalk.cyan('https://platform.openai.com'));
    console.log(chalk.white('  2. Click your profile → ') + chalk.yellow('"API Keys"'));
    console.log(chalk.white('  3. Click ') + chalk.yellow('"Create new secret key"'));
    console.log(chalk.white('  4. Copy the key (starts with ') + chalk.yellow('sk-') + chalk.white(') → paste below'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log('');
    const key = await askPassword('  Paste OpenAI API Key (sk-...): ');
    if (!key.startsWith('sk-')) { console.log(chalk.yellow('  ⚠  Warning: key should start with sk-')); }
    config.OPENAI_API_KEY = key;

  } else if (provider === 'groq') {
    console.log('');
    console.log(chalk.cyan.bold('  How to get your Groq API Key (free):'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.white('  1. Open: ') + chalk.cyan('https://console.groq.com'));
    console.log(chalk.white('  2. Sign up / Log in (free account)'));
    console.log(chalk.white('  3. Click ') + chalk.yellow('"API Keys"') + chalk.white(' in left sidebar'));
    console.log(chalk.white('  4. Click ') + chalk.yellow('"Create API Key"') + chalk.white(' → Copy → paste below'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log('');
    const key = await askPassword('  Paste Groq API Key: ');
    if (key.length < 10) { console.log(chalk.red('  ✗  Invalid key — too short')); process.exit(1); }
    config.GROQ_API_KEY = key;
  }

  // Step 3: Language
  const lang = await choose('Primary language?', [
    { name: 'English (India)  en-IN', value: 'en-IN' },
    { name: 'Hindi            hi-IN', value: 'hi-IN' },
    { name: 'English (US)     en-US', value: 'en-US' },
    { name: 'English (UK)     en-GB', value: 'en-GB' },
  ]);
  config.VOICE_CLI_LANG = lang;

  // Step 4: Hotkey
  const hotkey = await choose('Global hotkey to start recording?', [
    { name: 'Ctrl+Shift+M   (recommended)', value: 'ctrl+shift+m' },
    { name: 'Ctrl+Alt+Space',               value: 'ctrl+alt+space' },
    { name: 'Ctrl+Shift+Space',             value: 'ctrl+shift+space' },
    { name: 'Ctrl+Alt+R     (R for Record)', value: 'ctrl+alt+r' },
  ]);
  config.HOTKEY = hotkey;

  // Step 5: Output mode
  const outputMode = await choose('How to deliver the transcribed text?', [
    { name: 'Auto-type at cursor  (text appears where you are typing)', value: 'autotype' },
    { name: 'Copy to clipboard    (you press Ctrl+V to paste)',         value: 'clipboard' },
  ]);
  config.OUTPUT_MODE = outputMode;

  // Save
  saveConfig(config);

  console.log('');
  console.log(chalk.green('  ✅  Config saved!'));
  console.log('');
  console.log(
    chalk.white('  Run ') + chalk.cyan.bold('vc') +
    chalk.white(' — then press ') + chalk.cyan.bold(hotkey.toUpperCase()) +
    chalk.white(' anywhere to speak.')
  );
  console.log(chalk.gray('  Works in Claude CLI, any terminal, any app.'));
  console.log(chalk.gray('  Run vc --install to auto-start on login.'));
  console.log('');

  return config;
}
