---
type: decision
status: đã áp dụng
date: 2026-07-01
tags: [decision, speech, dsp]
---

# Quyết định: Cross-check thanh điệu lấy giá trị nhỏ nhất (worse-of)

## Bối cảnh
Chấm phát âm có hai nguồn đánh giá thanh điệu độc lập:
- **DSP** ([[tone_dsp_service]]) — phân tích F0 contour + DTW với khuôn Chao.
- **Gemini** ([[speech-ai]] → backend) — nhận diện ngữ nghĩa, trả tỷ lệ thanh điệu đúng.

Hai nguồn có thể lệch nhau: DSP nhạy với nhiễu âm học (micro kém, tạp âm), Gemini đôi khi "rộng lượng" khi đoán đúng chữ nhưng thanh điệu thực tế sai.

## Quyết định
Lấy **min (worse-of)** giữa độ chính xác DSP và tỷ lệ thanh điệu đúng của Gemini, thay vì trung bình hay max.

## Lý do
- Tránh điểm ảo cao khi một nguồn dễ dãi.
- Người học nhận feedback nghiêm hơn → luyện kỹ hơn, ít bị "qua mặt".
- Trung bình sẽ làm mờ lỗi rõ ràng ở một nguồn.

## Đánh đổi
- Có thể phạt oan khi DSP bị nhiễu micro dù phát âm đúng.
- Cần theo dõi: nếu người dùng phàn nàn điểm thấp bất thường → xem lại ngưỡng DSP ([[project_pron_corpus]] đang thu âm để hiệu chuẩn).

## Liên quan
- [[Feature - Chẩn đoán phát âm]]
- [[PronunciationPractice]]
- Backend: [[Services]] (`tone_dsp_service`, `pinyin_scorer`)
