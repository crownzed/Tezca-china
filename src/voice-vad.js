// Voice activity detection cho chế độ gọi thoại — quyết định KHI NÀO người học
// đã nói xong, để gửi lượt mà không cần bấm nút.
//
// Vì sao tự viết thay vì dùng Silero (@ricky0123/vad-web): Silero kéo theo ONNX
// Runtime WASM (~2MB) vào bundle của một app học tiếng, cho việc mà năng lượng
// tín hiệu làm được. Tiếng nói trong cuộc gọi cách micro 30cm có tỉ lệ
// signal/noise rất cao — không cần mạng neural để biết ai đó đang nói. Nếu về
// sau gặp môi trường ồn thật (quán cà phê, lớp học) thì đây là chỗ để thay.
//
// Tách khỏi speech-ai.js có chủ ý: mọi hàm ở đây là hàm THUẦN trên mảng số, nên
// test được bằng tín hiệu tổng hợp mà không cần micro hay AudioContext.

// Ngưỡng thời gian, tính bằng ms.
export const VAD_DEFAULTS = {
  // Nền nhiễu đo trong bao lâu trước khi bắt đầu nhận tiếng nói. Ngắn hơn thì
  // hơi thở hoặc tiếng click chuột lúc bắt đầu gọi sẽ thành "nền", đẩy ngưỡng
  // lên cao và làm câu đầu bị bỏ.
  calibrateMs: 400,
  // Phải vượt ngưỡng liên tục bao lâu mới coi là bắt đầu nói. Chặn tiếng gõ bàn,
  // tiếng ho, cửa đóng.
  onsetMs: 120,
  // Im lặng bao lâu thì chốt lượt. Đây là con số đánh đổi TRỰC TIẾP với độ trễ:
  // mỗi ms ở đây cộng thẳng vào thời gian người học phải chờ. 600ms là khoảng
  // ngắt giữa hai câu của người nói bình thường — thấp hơn sẽ cắt giữa câu khi
  // họ ngập ngừng tìm từ, việc RẤT hay xảy ra với người mới học.
  hangoverMs: 600,
  // Lượt ngắn hơn mức này bị bỏ, không gửi. Ho, "ừm", chạm bàn.
  minUtteranceMs: 300,
  // Hệ số trên nền nhiễu. 2.5x là ngưỡng nói-hay-không thông thường.
  noiseFactor: 2.5,
  // Sàn tuyệt đối: phòng cực yên có nền ~0.0005, nhân 2.5 vẫn là nhiễu.
  floor: 0.012,
  // Ngưỡng CAO HƠN khi AI đang nói. Vọng âm từ loa ngoài (nếu AEC không dập
  // hết) sẽ tự kích barge-in liên tục và cuộc gọi thành vòng lặp AI cắt lời
  // chính nó. Chỉ tiếng người thật, gần mic, mới vượt được mức này.
  duckedFactor: 6,
};

/** RMS của một khối mẫu Float32. */
export function frameRms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Máy trạng thái VAD. Nuôi bằng từng khối audio, nó trả về việc cần làm:
//   'calibrating' | 'silence' | 'speech-start' | 'speech' | 'utterance-end'
//
// Giữ trạng thái bằng THỜI LƯỢNG AUDIO đã xử lý, không bằng Date.now(): khi tab
// bị throttle hoặc main thread nghẽn, đồng hồ tường vẫn chạy trong khi audio thì
// không — dùng đồng hồ tường sẽ chốt lượt giữa câu chỉ vì máy giật.
export function createVadState(sampleRate, options = {}) {
  const cfg = { ...VAD_DEFAULTS, ...options };
  return {
    cfg,
    sampleRate,
    elapsedMs: 0,
    // Hiệu chỉnh nền nhiễu: cộng dồn rồi lấy trung bình.
    noiseSum: 0,
    noiseCount: 0,
    noiseFloor: 0,
    calibrated: false,
    speaking: false,
    aboveMs: 0,      // đã vượt ngưỡng liên tục bao lâu
    belowMs: 0,      // đã dưới ngưỡng liên tục bao lâu
    utteranceMs: 0,  // thời lượng lượt đang thu
    lastRms: 0,
  };
}

/**
 * Nuôi một khối audio vào máy trạng thái.
 *
 * `ducked` = true khi AI đang phát tiếng: dùng ngưỡng cao hơn để vọng âm không
 * tự kích barge-in.
 *
 * Trả { action, utteranceMs, rms, threshold } — caller dùng `action` để quyết
 * định, và `threshold` để hiển thị/debug.
 */
export function feedVad(state, samples, { ducked = false } = {}) {
  const rms = frameRms(samples);
  const frameMs = (samples.length / state.sampleRate) * 1000;
  state.elapsedMs += frameMs;
  state.lastRms = rms;

  if (!state.calibrated) {
    state.noiseSum += rms;
    state.noiseCount += 1;
    if (state.elapsedMs >= state.cfg.calibrateMs) {
      state.noiseFloor = state.noiseSum / Math.max(1, state.noiseCount);
      state.calibrated = true;
    }
    return { action: 'calibrating', utteranceMs: 0, rms, threshold: 0 };
  }

  const factor = ducked ? state.cfg.duckedFactor : state.cfg.noiseFactor;
  const threshold = Math.max(state.cfg.floor, state.noiseFloor * factor);
  const loud = rms >= threshold;

  if (loud) {
    state.aboveMs += frameMs;
    state.belowMs = 0;
  } else {
    state.belowMs += frameMs;
    state.aboveMs = 0;
    // Nền nhiễu trôi theo thời gian (quạt bật, điều hoà). Chỉ cập nhật khi ĐANG
    // IM LẶNG và bằng trung bình động rất chậm — nếu nhanh thì một câu nói dài
    // sẽ tự nâng ngưỡng lên tới mức không nghe thấy chính nó.
    if (!state.speaking) {
      state.noiseFloor = state.noiseFloor * 0.995 + rms * 0.005;
    }
  }

  if (!state.speaking) {
    if (state.aboveMs >= state.cfg.onsetMs) {
      state.speaking = true;
      // Lượt tính từ lúc vượt ngưỡng, không phải lúc xác nhận — nếu không thì
      // 120ms đầu của mỗi câu bị mất.
      state.utteranceMs = state.aboveMs;
      state.belowMs = 0;
      return { action: 'speech-start', utteranceMs: state.utteranceMs, rms, threshold };
    }
    return { action: 'silence', utteranceMs: 0, rms, threshold };
  }

  state.utteranceMs += frameMs;
  if (state.belowMs >= state.cfg.hangoverMs) {
    const total = state.utteranceMs;
    state.speaking = false;
    state.utteranceMs = 0;
    state.aboveMs = 0;
    state.belowMs = 0;
    // Trừ phần im lặng cuối khi báo thời lượng: caller dùng số này để bỏ lượt
    // quá ngắn, và tính cả hangover vào sẽ làm một tiếng ho 100ms trông như 700ms.
    return {
      action: 'utterance-end',
      utteranceMs: Math.max(0, total - state.cfg.hangoverMs),
      rms,
      threshold,
    };
  }
  return { action: 'speech', utteranceMs: state.utteranceMs, rms, threshold };
}

/** Lượt có đủ dài để đáng gửi không? */
export function isUtteranceUsable(state, utteranceMs) {
  return utteranceMs >= state.cfg.minUtteranceMs;
}
