import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Records audio via Windows MCI (built-in), sends to Azure Speech REST API.
 * Returns { text: Promise<string>, stop: Function }
 */
export function transcribeAzure({ key, region, lang = 'en-IN' }) {
  // Simple path — forward slashes work in PowerShell
  const tmpFile = path.join(os.tmpdir(), `vc-${Date.now()}.wav`).replace(/\\/g, '/');

  // MCI commands one per line — more reliable than chained set
  const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MCI {
    [DllImport("winmm.dll")]
    public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, IntPtr hwnd);
}
'@
function Send-MCI($cmd) {
    $sb = New-Object System.Text.StringBuilder 256
    $r  = [MCI]::mciSendString($cmd, $sb, 256, [IntPtr]::Zero)
    return $r
}
$file = "${tmpFile}"
Send-MCI("open new type waveaudio alias cap") | Out-Null
Send-MCI("set cap time format ms")           | Out-Null
Send-MCI("set cap bitspersample 16")         | Out-Null
Send-MCI("set cap samplespersec 16000")      | Out-Null
Send-MCI("set cap channels 1")               | Out-Null
Send-MCI("record cap")                       | Out-Null
Write-Host "REC_STARTED"
[Console]::Out.Flush()
$null = [Console]::In.ReadLine()
Send-MCI("stop cap")                         | Out-Null
$q = [char]34
$saveResult = Send-MCI("save cap $q$file$q")
Write-Host "SAVE_RESULT:$saveResult"
Send-MCI("close cap")                        | Out-Null
Write-Host "DONE"
[Console]::Out.Flush()
`;

  const psProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-Command', psScript
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  let psOutput = '';
  psProcess.stdout.on('data', (d) => { psOutput += d.toString(); });
  psProcess.stderr.on('data', (d) => { psOutput += 'ERR:' + d.toString(); });

  let resolveFinal;
  const textPromise = new Promise((res) => { resolveFinal = res; });

  const stop = async () => {
    try { psProcess.stdin.write('\n'); psProcess.stdin.end(); } catch {}

    // Wait for PowerShell to save the file
    await new Promise((res) => {
      psProcess.on('exit', res);
      setTimeout(res, 4000);
    });

    // Debug: show what PowerShell output and file status
    const wavPath = tmpFile.replace(/\//g, '\\');
    const fileExists = fs.existsSync(wavPath);
    const fileSize   = fileExists ? fs.statSync(wavPath).size : 0;

    console.log('\n' +
      `  [debug] PS output: ${psOutput.trim().replace(/\n/g, ' | ')}\n` +
      `  [debug] WAV: ${wavPath} | exists: ${fileExists} | size: ${fileSize} bytes`
    );

    if (!fileExists || fileSize < 500) {
      console.log('  [debug] WAV too small — mic not captured');
      resolveFinal('');
      return;
    }

    try {
      const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=simple`;
      const wavData = fs.readFileSync(wavPath);

      const { default: fetch } = await import('node-fetch');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Accept': 'application/json',
        },
        body: wavData,
      });

      const raw  = await res.text();
      console.log(`  [debug] Azure response (${res.status}): ${raw}`);

      let data;
      try { data = JSON.parse(raw); } catch { data = {}; }

      resolveFinal(
        data.DisplayText ||
        data.NBest?.[0]?.Display ||
        data.RecognitionStatus === 'NoMatch' ? '' :
        ''
      );

    } catch (err) {
      console.log('  [debug] fetch error:', err.message);
      resolveFinal('');
    } finally {
      try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}
    }
  };

  return Promise.resolve({ text: textPromise, stop });
}
