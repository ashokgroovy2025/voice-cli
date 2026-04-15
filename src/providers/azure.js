import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

/**
 * Records audio via Windows MCI (built-in, no SoX/ffmpeg needed),
 * then transcribes via Azure Speech REST API (no SDK, no browser globals).
 * Returns { text: Promise<string>, stop: Function }
 */
export function transcribeAzure({ key, region, lang = 'en-IN' }) {
  const tmpFile = path.join(os.tmpdir(), `vc-${Date.now()}.wav`).replace(/\\/g, '\\\\');

  // PowerShell script: starts MCI recording, waits for Enter, then saves WAV
  const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MCI {
    [DllImport("winmm.dll")]
    public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, IntPtr hwnd);
}
'@
[MCI]::mciSendString("open new Type waveaudio Alias mic", $null, 0, [IntPtr]::Zero) | Out-Null
[MCI]::mciSendString("set mic time format ms bitspersample 16 samplespersec 16000 channels 1 alignment 2 bytespersec 32000", $null, 0, [IntPtr]::Zero) | Out-Null
[MCI]::mciSendString("record mic", $null, 0, [IntPtr]::Zero) | Out-Null
$null = [Console]::In.ReadLine()
[MCI]::mciSendString("stop mic", $null, 0, [IntPtr]::Zero) | Out-Null
[MCI]::mciSendString("save mic \\"${tmpFile}\\"", $null, 0, [IntPtr]::Zero) | Out-Null
[MCI]::mciSendString("close mic", $null, 0, [IntPtr]::Zero) | Out-Null
`;

  const psProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-Command', psScript
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  let resolveFinal;
  const textPromise = new Promise((res) => { resolveFinal = res; });

  const stop = async () => {
    // Send Enter to PowerShell to trigger stop+save
    try { psProcess.stdin.write('\n'); psProcess.stdin.end(); } catch {}

    // Wait for PowerShell to finish saving
    await new Promise((res) => {
      psProcess.on('exit', res);
      setTimeout(res, 3000); // max wait 3s
    });

    try {
      const wavPath = tmpFile.replace(/\\\\/g, '\\');
      if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size < 500) {
        resolveFinal('');
        return;
      }

      // Azure Speech REST API — no SDK needed
      const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=simple`;
      const wavData = fs.readFileSync(wavPath);

      const fetch = (await import('node-fetch')).default;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Accept': 'application/json',
        },
        body: wavData,
      });

      const data = await res.json();
      resolveFinal(data.DisplayText || data.NBest?.[0]?.Display || '');

    } catch (err) {
      resolveFinal('');
    } finally {
      try {
        const wavPath = tmpFile.replace(/\\\\/g, '\\');
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      } catch {}
    }
  };

  return Promise.resolve({ text: textPromise, stop });
}
