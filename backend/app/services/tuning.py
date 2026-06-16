"""Nguồn duy nhất cho các THAM SỐ TINH CHỈNH thuật toán học tập.

Tách riêng các "magic number" của thuật toán (trọng số ưu tiên, hằng số đường
cong quên FSRS, ngưỡng nấc thụ đắc, cấu hình mode phiên, hệ số làm mượt EWMA)
ra khỏi từng service. Mục tiêu: chỉnh một chỗ, áp dụng toàn hệ, dễ A/B và dễ
giải thích — KHÔNG đổi hành vi hiện tại (mọi giá trị giữ nguyên).

Lưu ý: file này CHỈ chứa tham số tuning. Các hằng số *cấu trúc* gắn chặt logic
(``STAGES``, ``LADDER``, ``EMAIL_PATTERN``, bảng nhãn...) vẫn ở lại module gốc
của chúng vì gom ra đây không có lợi và làm loãng ý nghĩa.
"""

from __future__ import annotations

# --- Priority Engine (Weighted Priority Queue, tài liệu mục 4.7) ---
# Trọng số cộng dồn cho điểm ưu tiên xếp từ trong phiên.
PRIORITY_WEIGHTS = {
    "due_urgency": 0.35,
    "forgetting_risk": 0.20,
    "error_need": 0.20,
    "goal_relevance": 0.10,
    "novelty_need": 0.05,
    "habit_fit": 0.05,
    "recent_repeat_penalty": -0.05,
}

# Hằng số đường cong quên FSRS: R = (1 + t/(F·S))^(-1), F = 9 cho mục tiêu R≈90%.
FSRS_FACTOR = 9.0

# --- Difficulty Engine (desirable difficulty + luật 85%) ---
# Mục tiêu xác suất nhớ lại tối ưu cho việc học.
TARGET_RETRIEVABILITY = 0.85
# Giá trị truy hồi gán cho từ mới (chưa có tiến trình): đặt cao nhưng dưới các
# từ quá hạn đang có rủi ro quên, để vẫn tạo lần phơi nhiễm đầu.
NEW_WORD_VALUE = 0.80

# --- Session Planner (cấu hình theo mode phiên) ---
MODE_CONFIG = {
    "micro": {"minutes": 5, "limit": 5, "new_count": 0, "label": "Ôn nhanh"},
    "standard": {"minutes": 20, "limit": 10, "new_count": 6, "label": "Học hôm nay"},
    "deep": {"minutes": 45, "limit": 16, "new_count": 8, "label": "Học sâu"},
}

# --- Acquisition Engine (ngưỡng 0-100 để bước qua mỗi nấc thụ đắc) ---
# Cố ý "dễ vào, khó thuần": nhận ra rất sớm; "dùng được"/"thuần thục" đòi hỏi
# sản sinh thật.
ACQUISITION_THRESHOLDS = {
    "recognized_seen": 1,        # đã gặp ít nhất 1 lần
    "recognized_recall": 20,     # bắt đầu nhận diện được
    "understood_recall": 55,     # gợi nhớ nghĩa ổn
    "understood_context": 35,    # hiểu trong ngữ cảnh
    "usable_production": 40,     # sản sinh có hướng dẫn
    "usable_context": 55,
    "mastered_production": 75,   # sản sinh tự do vững
    "mastered_mastery": 80,      # trí nhớ ổn định cao
}

# --- Behavior Engine (làm mượt chuỗi tín hiệu) ---
# Hệ số EWMA: càng lớn càng ưu tiên lượt gần đây.
EWMA_ALPHA = 0.35

# --- Item Difficulty Engine (chọn câu theo độ khó thực nghiệm, #1) ---
# Prior trung tính cho p-value (tỉ lệ đúng) khi câu còn ít/chưa có lượt làm.
# Đặt ~ mục tiêu luật 85% để câu mới được coi là "vừa đủ khó" cho tới khi có
# dữ liệu thật kéo lệch đi.
ITEM_DIFFICULTY_PRIOR_P = 0.85
# Số "lượt ảo" của prior: p thô chỉ thắng prior khi lượt thật vượt mức này.
# Càng lớn càng thận trọng với mẫu nhỏ (chống nhiễu 1/1 = 100%).
ITEM_DIFFICULTY_PRIOR_WEIGHT = 6.0
