#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
import { startVoiceCLI } from '../src/index.js';
import { installStartup, uninstallStartup } from '../src/install.js';

program
  .name('voice-cli')
  .description('Global voice input for any terminal — speak instead of type')
  .version(version)
  .option('-k, --key <key>',       'Azure Speech API key')
  .option('-r, --region <region>', 'Azure Speech region')
  .option('-l, --lang <lang>',     'Language code (default: en-IN)')
  .option('--hotkey <combo>',      'Global hotkey (default: ctrl+shift+m)')
  .option('--clipboard',           'Copy to clipboard instead of auto-typing')
  .option('--setup',               'Run setup wizard')
  .option('--test',                'Test mic and connection')
  .option('--install',             'Register voice-cli to start automatically on login')
  .option('--uninstall',           'Remove voice-cli from startup')
  .option('--silent',              'Run daemon silently (no console output — used by startup task)')
  .action(async (options) => {
    if (options.install) {
      await installStartup();
      process.exit(0);
    }
    if (options.uninstall) {
      await uninstallStartup();
      process.exit(0);
    }
    await startVoiceCLI(options);
  });

program.parse();
