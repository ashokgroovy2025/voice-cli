import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath   = path.resolve(__dirname, '..', 'bin', 'voice-cli.js');

// ── Windows startup via Task Scheduler ────────────────────────
export async function installStartup() {
  const platform = os.platform();

  if (platform === 'win32') {
    await installWindows();
  } else if (platform === 'darwin') {
    await installMac();
  } else {
    await installLinux();
  }
}

export async function uninstallStartup() {
  const platform = os.platform();

  if (platform === 'win32') {
    try {
      execSync('schtasks /delete /tn "voice-cli" /f', { stdio: 'pipe' });
      console.log(chalk.green('\n  ✅  voice-cli removed from startup\n'));
    } catch {
      console.log(chalk.yellow('\n  ⚠  voice-cli was not in startup\n'));
    }

  } else if (platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.voice-cli.plist');
    if (fs.existsSync(plistPath)) {
      try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' }); } catch {}
      fs.unlinkSync(plistPath);
      console.log(chalk.green('\n  ✅  voice-cli removed from startup\n'));
    } else {
      console.log(chalk.yellow('\n  ⚠  voice-cli was not in startup\n'));
    }

  } else {
    const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'voice-cli.service');
    if (fs.existsSync(servicePath)) {
      try { execSync('systemctl --user disable --now voice-cli', { stdio: 'pipe' }); } catch {}
      fs.unlinkSync(servicePath);
      console.log(chalk.green('\n  ✅  voice-cli removed from startup\n'));
    } else {
      console.log(chalk.yellow('\n  ⚠  voice-cli was not in startup\n'));
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Windows: Task Scheduler — runs hidden on login
// ────────────────────────────────────────────────────────────────
async function installWindows() {
  // Find node.exe path
  let nodePath;
  try {
    nodePath = execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0].trim();
  } catch {
    console.log(chalk.red('\n  ✗  node.exe not found in PATH\n'));
    process.exit(1);
  }

  // Create a VBS launcher (runs node silently, no console window)
  const vbsPath = path.join(os.homedir(), '.voice-cli-startup.vbs');
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${nodePath}"" ""${binPath}"" --silent", 0, False`;

  fs.writeFileSync(vbsPath, vbsContent, 'utf8');

  // Register with Task Scheduler
  const cmd = [
    'schtasks /create',
    '/tn "voice-cli"',
    `/tr "wscript.exe \\"${vbsPath}\\""`,
    '/sc onlogon',
    '/rl limited',
    '/f',           // overwrite if exists
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(chalk.green('\n  ✅  voice-cli will start automatically on login'));
    console.log(chalk.gray('  Runs silently in background — no terminal window'));
    console.log(chalk.gray('  To remove: ') + chalk.cyan('vc --uninstall'));
    console.log('');
    console.log(chalk.white('  ➡  Restart your PC or run ') + chalk.cyan('vc') + chalk.white(' manually to start now.\n'));
  } catch (err) {
    console.log(chalk.red('\n  ✗  Failed to register startup task'));
    console.log(chalk.gray('  Try running as Administrator, or add manually:'));
    console.log(chalk.cyan(`  wscript.exe "${vbsPath}"`) + chalk.gray('  (add to Startup folder)\n'));
  }
}

// ────────────────────────────────────────────────────────────────
// macOS: LaunchAgent
// ────────────────────────────────────────────────────────────────
async function installMac() {
  let nodePath;
  try {
    nodePath = execSync('which node', { encoding: 'utf8' }).trim();
  } catch {
    console.log(chalk.red('\n  ✗  node not found in PATH\n'));
    process.exit(1);
  }

  const plistDir  = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const plistPath = path.join(plistDir, 'com.voice-cli.plist');

  if (!fs.existsSync(plistDir)) fs.mkdirSync(plistDir, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.voice-cli</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${binPath}</string>
    <string>--silent</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${os.homedir()}/.voice-cli.log</string>
  <key>StandardErrorPath</key>
  <string>${os.homedir()}/.voice-cli.log</string>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plist, 'utf8');
  try { execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' }); } catch {}

  console.log(chalk.green('\n  ✅  voice-cli will start automatically on login'));
  console.log(chalk.gray('  Logs: ~/.voice-cli.log'));
  console.log(chalk.gray('  To remove: ') + chalk.cyan('vc --uninstall\n'));
}

// ────────────────────────────────────────────────────────────────
// Linux: systemd user service
// ────────────────────────────────────────────────────────────────
async function installLinux() {
  let nodePath;
  try {
    nodePath = execSync('which node', { encoding: 'utf8' }).trim();
  } catch {
    console.log(chalk.red('\n  ✗  node not found in PATH\n'));
    process.exit(1);
  }

  const serviceDir  = path.join(os.homedir(), '.config', 'systemd', 'user');
  const servicePath = path.join(serviceDir, 'voice-cli.service');

  fs.mkdirSync(serviceDir, { recursive: true });

  const service = `[Unit]
Description=voice-cli global voice input daemon
After=graphical-session.target

[Service]
ExecStart=${nodePath} ${binPath} --silent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target`;

  fs.writeFileSync(servicePath, service, 'utf8');

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    execSync('systemctl --user enable --now voice-cli', { stdio: 'pipe' });
    console.log(chalk.green('\n  ✅  voice-cli systemd service enabled'));
    console.log(chalk.gray('  To remove: ') + chalk.cyan('vc --uninstall\n'));
  } catch {
    console.log(chalk.yellow('\n  ⚠  systemctl failed. Enable manually:'));
    console.log(chalk.cyan(`  systemctl --user enable --now voice-cli\n`));
  }
}
