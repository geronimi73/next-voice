const ort = require('onnxruntime-node');
const fs = require('fs');

const textProcessor = require('./lib/text-processing.js');
const audioProcessor = require('./lib/audio-processing.js');

const MODEL_URL = "models/kitten_tts_nano_v0_8.onnx";
const VOICES_URL = "models/voices.json";

async function main(text, voice = "expr-voice-5-f", speed = 0.9) {
	let start

	console.log("Tokenizing")
	const tokens = await textProcessor.process(text)

	console.log("Reading Voices")
  let voices = fs.readFileSync(VOICES_URL, 'utf8');
  voices = JSON.parse(voices);
  // Choose voice embedding, the longer the text, the higher the index (?) OK
  const voiceEmbedding = voices[voice][
	  // ref. code on how to pick voice emebedding: `ref_id =  min(len(text), self.voices[voice].shape[0] - 1)` https://github.com/KittenML/KittenTTS/blob/49691a2361cd66a9502c466303c9fec783e9e438/kittentts/onnx_model.py#L131
  	Math.min(text.length, voices[voice].length - 1)
	]

	const modelInputs = {
    'input_ids': new ort.Tensor('int64', tokens, [1, tokens.length]),
    'style': new ort.Tensor('float32', voiceEmbedding, [1, voiceEmbedding.length]),
    'speed': new ort.Tensor('float32', new Float32Array([speed]), [1])
  };

	console.log("Loading model buffer")	
	const buffer = fs.readFileSync(MODEL_URL);

	console.log("Loading ORT session")
	start = performance.now();
	const session = await ort.InferenceSession.create(buffer, {
		executionProviders: ["cpu"],
	});
	console.log(`done in: ${(performance.now() - start).toFixed(2)} milliseconds`);

	console.log("Running ORT session")
	start = performance.now();
	const results = await session.run(modelInputs);
	console.log(`done in: ${(performance.now() - start).toFixed(2)} milliseconds`);

	const audioTensor = results.waveform
	const audioBuffer = audioProcessor.createWavBuffer(audioTensor.data)
  fs.writeFileSync('my-audio_nano.wav', audioBuffer);

}

main("Attention is all you need.")
// console.log(ort)
