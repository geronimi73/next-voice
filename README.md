# next-voice: Kitten TTS in the browser 
Next.js app running Kitten TTS Nano/Micro/Mini 0.8 with onnxruntime-web. All the processing is done on the client side.

Demo at [next-voice.vercel.app](https://next-voice.vercel.app/)

<img width="760" height="389" alt="Screenshot 2026-02-22 at 21 13 16" src="https://github.com/user-attachments/assets/4bab4bfc-5cf7-4f31-b769-56569585f974" />

## Features
* Enter text, get .wav

## Issues
Probably Many. 

It definitely breaks with:
 * Safari
 * Mobile Chrome
 * WebGPU (currently wasm backend only)

Any idea what's going on? Open a PR!

## Main sources of inspiration/copied from:
 * https://github.com/KittenML/KittenTTS/blob/49691a2361cd66a9502c466303c9fec783e9e438/kittentts/onnx_model.py
 * https://dev.to/soasme/running-kittentts-in-the-browser-a-deep-dive-into-wasm-and-onnx-18hk

And Claude Code of course who wrote a `.npz` parser in JS, unbelievable