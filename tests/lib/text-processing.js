const phonemizer = require('phonemizer');

// Source: https://dev.to/soasme/running-kittentts-in-the-browser-a-deep-dive-into-wasm-and-onnx-18hk
const _pad = "$";
const _punctuation = ';:,.!?¡¿—…"«»"" ';
const _letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const _letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
const symbols = [_pad, ...Array.from(_punctuation), ...Array.from(_letters), ...Array.from(_letters_ipa)];

const wordIndexDictionary = {};
for (let i = 0; i < symbols.length; i++) {
  wordIndexDictionary[symbols[i]] = i;
}

function cleanText(text) {
  // Remove emojis using Unicode ranges
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]/gu;
  
  return text
    .replace(emojiRegex, '')
    .replace(/\b\/\b/, ' slash ')
    .replace(/[\/\\()¯]/g, '')
    .replace(/["""]/g, '')
    .replace(/\s—/g, '.')
    .replace(/[^\u0000-\u024F]/g, '') // Keep only Latin characters
    .trim();
}

function tokenizePhonemes(text) {
  const indexes = [];
  for (const char of text) {
    if (wordIndexDictionary[char] !== undefined) {
      indexes.push(wordIndexDictionary[char]);
    } 
  }
  return indexes;
}

async function process(text) {
  text = cleanText(text)
  const phonemes = (await phonemizer.phonemize(text)).join('');
  const tokens = tokenizePhonemes(phonemes) 

  // Add start/end tokens
  tokens.unshift(0);
  tokens.push(0);

  return tokens
}

module.exports = { process }