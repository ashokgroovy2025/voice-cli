import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Records audio to a temp file, then transcribes via OpenAI/Groq Whisper API.
 * Returns { text: Promise<string>, stop: Function }
 */
export function transcribeWhisper({ apiKey, lang = 'en', provider = 'openai' }) {
  const tmpFile = path.join(os.tmpdir(), `voice-cli-${Date.now()}.wav`);

  // Start recording using SoX or ffmpeg
  let recProcess;
  try {
    // Try sox first (most common)
    recProcess = require('child_process').spawn('sox', [
      '-d', '-r', '16000', '-c', '1', '-b', '16', tmpFile
    ]);
  } catch {
    recProcess = null;
  }

  let resolveFinal;
  const textPromise = new Promise((res) => { resolveFinal = res; });

  const stop = async () => {
    if (recProcess) {
      recProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const baseURL = provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.openai.com/v1';

      const FormData = (await import('form-data')).default;
      const fetch = (await import('node-fetch')).default;

      const form = new FormData();
      form.append('file', fs.createReadStream(tmpFile));
      form.append('model', 'whisper-1');
      form.append('language', lang.split('-')[0]);

      const res = await fetch(`${baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
        body: form,
      });

      const data = await res.json();
      resolveFinal(data.text || '');
    } catch (err) {
      resolveFinal('');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  };

  return Promise.resolve({ text: textPromise, stop });
}
