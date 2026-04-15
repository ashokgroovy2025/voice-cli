// Azure Speech SDK requires window/XMLHttpRequest globals in Node.js
if (typeof window === 'undefined') { global.window = global; }

import sdk from 'microsoft-cognitiveservices-speech-sdk';

/**
 * Transcribes audio from default microphone using Azure Speech SDK.
 * Returns { text: Promise<string>, stop: Function }
 */
export function transcribeAzure({ key, region, lang = 'en-IN' }) {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechRecognitionLanguage = lang;

      // Use default microphone
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      let finalText = '';
      let resolveFinal;
      const textPromise = new Promise((res) => { resolveFinal = res; });

      // Continuous recognition — collects all phrases
      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          finalText += (finalText ? ' ' : '') + e.result.text;
        }
      };

      recognizer.startContinuousRecognitionAsync(
        () => {
          // Started — return stop function and text promise
          resolve({
            text: textPromise,
            stop: () => {
              recognizer.stopContinuousRecognitionAsync(
                () => {
                  recognizer.close();
                  resolveFinal(finalText.trim());
                },
                (err) => {
                  recognizer.close();
                  resolveFinal(finalText.trim());
                }
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
