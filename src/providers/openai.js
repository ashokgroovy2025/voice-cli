import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Records audio using ffmpeg (Windows/Mac/Linux), then transcribes via OpenAI/Groq Whisper API.
 * Returns { text: Promise<string>, stop: Function }
 *
 * Requires ffmpeg installed:
 *   Windows: winget install ffmpeg   or   choco install ffmpeg
 *   macOS:   brew install ffmpeg
 *   Linux:   apt install ffmpeg
 */
export function transcribeWhisper({ apiKey, lang = 'en', provider = 'openai' }) {
  const tmpFile = path.join(os.tmpdir(), `voice-cli-${Date.now()}.wav`);

  let recProcess = null;
  let resolveFinal;
  const textPromise = new Promise((res) => { resolveFinal = res; });

  // ── Try ffmpeg first (most reliable cross-platform) ──────
  try {
    recProcess = spawn('ffmpeg', [
      '-y',                    // overwrite output
      '-f', 'dshow',           // Windows DirectShow
      '-i', 'audio=@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{...}', // default mic placeholder
      '-ar', '16000',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      tmpFile
    ], { stdio: 'pipe' });
  } catch { recProcess = null; }

  // ── Better: use platform-specific default audio device ──
  recProcess = null; // reset, use proper approach below
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: ffmpeg with dshow default audio
    recProcess = spawn('ffmpeg', [
      '-y', '-f', 'dshow', '-i', 'audio=virtual-audio-capturer',
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', tmpFile
    ], { stdio: 'pipe' });
    recProcess.on('error', () => {
      // Try with default audio device name
      recProcess = spawn('ffmpeg', [
        '-y', '-f', 'dshow', '-i', 'audio=Microphone',
        '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', tmpFile
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    });
  } else if (platform === 'darwin') {
    recProcess = spawn('ffmpeg', [
      '-y', '-f', 'avfoundation', '-i', ':0',
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', tmpFile
    ], { stdio: 'pipe' });
  } else {
    recProcess = spawn('ffmpeg', [
      '-y', '-f', 'alsa', '-i', 'default',
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', tmpFile
    ], { stdio: 'pipe' });
  }

  const stop = async () => {
    // Send 'q' to ffmpeg stdin to stop gracefully
    if (recProcess && recProcess.stdin) {
      try { recProcess.stdin.write('q'); } catch {}
    }
    if (recProcess) {
      recProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 800));
    }

    try {
      if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size < 1000) {
        resolveFinal('');
        return;
      }

      const baseURL = provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.openai.com/v1';

      const FormData = (await import('form-data')).default;
      const fetch    = (await import('node-fetch')).default;

      const form = new FormData();
      form.append('file', fs.createReadStream(tmpFile), { filename: 'audio.wav' });
      form.append('model', provider === 'groq' ? 'whisper-large-v3' : 'whisper-1');
      form.append('language', lang.split('-')[0]);

      const res = await fetch(`${baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
        body: form,
      });

      const data = await res.json();
      resolveFinal(data.text || '');
    } catch {
      resolveFinal('');
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  };

  return Promise.resolve({ text: textPromise, stop });
}
