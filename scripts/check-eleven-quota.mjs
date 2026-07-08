// Kiểm tra key ElevenLabs nào DÙNG ĐƯỢC để tạo audio: gọi thử 1 TTS cực ngắn cho
// từng key. Endpoint /v1/user/subscription cần scope user_read (các key này thiếu
// → 401 giả), nên test thẳng text_to_speech mới phản ánh đúng: 200 = còn dùng
// được, 401 = thiếu quyền TTS, 429 = cạn quota ký tự.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, 'backend', '.env'), 'utf8');
const line = env.split('\n').find(l => l.startsWith('ELEVENLABS_API_KEYS='));
const keys = line.slice('ELEVENLABS_API_KEYS='.length).trim().split(',').map(k => k.trim()).filter(Boolean);

const VOICE = 'JBFqnCBsd6RMkjVDRZzb';  // giọng mặc định (khớp elevenlabs_voice_id)
const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`;
const body = JSON.stringify({ text: '你好', model_id: 'eleven_multilingual_v2' });

console.log(`Tổng ${keys.length} key. Test thực tế qua text_to_speech (text="你好").\n`);
const usable = [];
for (let i = 0; i < keys.length; i += 1) {
  const key = keys[i];
  const masked = `${key.slice(0, 10)}...${key.slice(-4)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
      body,
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`key#${i} ${masked} — OK (trả ${buf.length} bytes MP3) ✓ DÙNG ĐƯỢC`);
      usable.push(i);
    } else {
      const txt = (await res.text()).slice(0, 160);
      const tag = res.status === 429 ? 'CẠN QUOTA' : res.status === 401 ? 'THIẾU QUYỀN/KEY SAI' : 'LỖI';
      console.log(`key#${i} ${masked} — HTTP ${res.status} [${tag}] ${txt}`);
    }
  } catch (err) {
    console.log(`key#${i} ${masked} — LỖI: ${err.message}`);
  }
}

console.log(`\nKey dùng được: ${usable.length ? usable.map(i => `#${i}`).join(', ') : 'KHÔNG CÓ'}`);
if (usable.length) {
  console.log(`Chạy: AUDIO_WORKERS=${usable.length} npm run audio (đảm bảo ${usable.length} key dùng được nằm ở đầu ELEVENLABS_API_KEYS).`);
}
