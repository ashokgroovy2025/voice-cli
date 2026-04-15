import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Azure Speech SDK needs these browser globals in Node.js — set BEFORE require
if (typeof global.window    === 'undefined') global.window    = global;
if (typeof global.document  === 'undefined') global.document  = { createElement: () => ({}) };
if (typeof global.navigator === 'undefined') global.navigator = { userAgent: 'node' };

const sdk = require('microsoft-cognitiveservices-speech-sdk');

/**
 * Transcribes audio from default microphone using Azure Speech SDK.
 * Returns { text: Promise<string>, stop: Function }
 */
export function transcribeAzure({ key, region, lang = 'en-IN' }) {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechRecognitionLanguage = lang;

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer  = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      let finalText = '';
      let resolveFinal;
      const textPromise = new Promise((res) => { resolveFinal = res; });

      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          finalText += (finalText ? ' ' : '') + e.result.text;
        }
      };

      recognizer.startContinuousRecognitionAsync(
        () => {
          resolve({
            text: textPromise,
            stop: () => {
              recognizer.stopContinuousRecognitionAsync(
                () => { recognizer.close(); resolveFinal(finalText.trim()); },
                ()  => { recognizer.close(); resolveFinal(finalText.trim()); }
              );
            }
          });
        },
        (err) => reject(new Error('Azure Speech start failed: ' + err))
      );

      // Auto-stop after 60 seconds
      setTimeout(() => {
        recognizer.stopContinuousRecognitionAsync(
          () => { recognizer.close(); resolveFinal(finalText.trim()); },
          () => { recognizer.close(); resolveFinal(finalText.trim()); }
        );
      }, 60000);

    } catch (err) {
      reject(err);
    }
  });
}
