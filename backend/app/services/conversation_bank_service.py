"""Ngân hàng kịch bản hội thoại — biến JSON thành system prompt cho voice chat.

Nguồn dữ liệu duy nhất: ``backend/app/data/conversation_scenarios.json``.

Vì sao cần bank thay vì chỉ một prompt chung: prompt cũ trong ``voice_chat`` chỉ
nói "bạn luyện hội thoại thân thiện, trả lời tự nhiên", nên model rơi vào giọng
sách giáo khoa — mỗi lượt là một câu hỏi mới, không có vai, không có tình huống,
không dùng trợ từ khẩu ngữ. Kịch bản đóng ba thứ mà prompt chung không có:

  * VAI + TÌNH HUỐNG cụ thể (ai đang nói với ai, ở đâu, muốn gì);
  * MẪU LƯỢT THOẠI thật (``turn_exemplars``) — few-shot dạy nhịp đối đáp, gồm cả
    việc hỏi đào sâu dựa trên câu vừa nghe thay vì đổi chủ đề;
  * NƯỚC ĐI CỨU HỘI THOẠI (``repair_moves``) — có sẵn câu để dùng khi người học
    im, lệch chủ đề, hay chuyển sang tiếng Việt, nên hội thoại không chết.

Service này stateless: đọc JSON một lần, dựng chuỗi prompt theo yêu cầu. Không
gọi LLM, không chạm DB — nhờ vậy test được tất định.

Quy tắc kiểm tra dữ liệu nằm ở ``backend/tests/test_conversation_bank.py``.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

_BANK_PATH = Path(__file__).resolve().parents[1] / "data" / "conversation_scenarios.json"

CONVERSATION_BANK_SOURCE = "conversation_bank"

_CJK_RE = re.compile(r"[㐀-鿿]")

# Trần lượt thoại mặc định khi kịch bản thuộc cấp không có trong bảng cấu hình.
_FALLBACK_TURN_CAP = 30


def count_cjk(text: str) -> int:
    return len(_CJK_RE.findall(str(text or "")))


class ConversationBank:
    """Loader stateless: đọc JSON một lần, dựng prompt theo yêu cầu."""

    def __init__(self, path: str | Path | None = None) -> None:
        raw = json.loads((Path(path) if path else _BANK_PATH).read_text(encoding="utf-8"))
        self._scenarios: list[dict[str, Any]] = list(raw.get("scenarios") or [])
        self._registers: dict[str, Any] = dict(raw.get("_registers") or {})
        self._turn_cap: dict[str, Any] = dict(raw.get("_turn_cjk_cap") or {})
        self._topics: list[str] = list(raw.get("_topics") or [])
        self._repair_triggers: dict[str, Any] = dict(raw.get("_repair_triggers") or {})
        self._by_id = {str(s.get("id")): s for s in self._scenarios}

    # ---- tra cứu ------------------------------------------------------------

    @property
    def topics(self) -> list[str]:
        return list(self._topics)

    @property
    def repair_triggers(self) -> list[str]:
        return [k for k in self._repair_triggers if not k.startswith("_")]

    def register_note(self, register: str) -> str:
        return str(self._registers.get(register, ""))

    def turn_cap(self, hsk_level: int) -> int:
        """Trần số chữ Hán cho một lượt thoại của AI ở cấp này."""
        value = self._turn_cap.get(str(int(hsk_level)))
        try:
            return int(value)
        except (TypeError, ValueError):
            return _FALLBACK_TURN_CAP

    def scenarios(self, level: int | None = None, topic: str | None = None) -> list[dict[str, Any]]:
        items = list(self._scenarios)
        if level is not None:
            items = [s for s in items if int(s.get("hsk_level", 0)) == int(level)]
        if topic is not None:
            items = [s for s in items if str(s.get("topic")) == topic]
        return items

    def get(self, scenario_id: str) -> dict[str, Any] | None:
        return self._by_id.get(str(scenario_id))

    def pick(self, level: int, topic: str | None = None, seed: str | None = None) -> dict[str, Any] | None:
        """Chọn một kịch bản cho cấp/chủ đề. ``seed`` cố định lựa chọn.

        Không có kịch bản đúng cấp thì lùi dần xuống cấp thấp hơn (người học cấp
        cao vẫn hội thoại được với tình huống dễ hơn), rồi mới thử cấp cao hơn.
        """
        for candidate_level in self._level_preference(int(level)):
            items = self.scenarios(candidate_level, topic)
            if not items:
                continue
            if seed is None:
                return random.choice(items)
            return items[random.Random(seed).randrange(len(items))]
        return None

    @staticmethod
    def _level_preference(level: int) -> list[int]:
        """Cấp đúng trước, rồi thấp dần, cuối cùng mới cao hơn."""
        lower = list(range(level, 0, -1))
        higher = list(range(level + 1, 7))
        return lower + higher

    # ---- dựng prompt --------------------------------------------------------

    def system_prompt(self, scenario: dict[str, Any]) -> str:
        """System prompt đặt model vào vai, kèm few-shot và luật khẩu ngữ.

        Viết bằng tiếng Việt vì đây là chỉ thị cho model (không phải nội dung
        người học đọc); các câu mẫu giữ nguyên tiếng Trung để model bắt chước
        đúng nhịp và trợ từ.
        """
        level = int(scenario.get("hsk_level", 0))
        cap = self.turn_cap(level)
        role = dict(scenario.get("ai_role") or {})
        register = str(scenario.get("register", ""))

        lines: list[str] = [
            f"Bạn đang NHẬP VAI trong một cuộc hội thoại tiếng Trung có thật, không phải làm bài tập.",
            f"VAI CỦA BẠN: {role.get('name', '')} — {role.get('persona', '')}",
            f"TÌNH HUỐNG: {scenario.get('setting', '')}",
            f"NGƯỜI HỌC ĐANG LÀ: {scenario.get('user_role', '')}",
            f"MỤC TIÊU HỘI THOẠI: {scenario.get('goal', '')}",
            f"TRÌNH ĐỘ NGƯỜI HỌC: HSK {level}. "
            f"Mỗi lượt của bạn TỐI ĐA {cap} chữ Hán — nói dài hơn là không giống nói thật.",
        ]

        note = self.register_note(register)
        if note:
            lines.append(f"GIỌNG ĐIỆU ({register}): {note}")

        features = [str(f) for f in (scenario.get("spoken_features") or []) if str(f).strip()]
        if features:
            lines.append(
                "DẤU KHẨU NGỮ nên dùng khi tự nhiên: " + " ".join(features)
                + ". Đây là thứ phân biệt lời nói thật với văn viết sách giáo khoa."
            )

        exemplars = [e for e in (scenario.get("turn_exemplars") or []) if e.get("reply_cn")]
        if exemplars:
            lines.append("MẪU LƯỢT THOẠI ĐÚNG NHỊP (bắt chước cách đối đáp này, đừng lặp lại nguyên văn):")
            for ex in exemplars:
                lines.append(f'  Người học: {ex.get("user_cn", "")}')
                lines.append(f'  Bạn: {ex.get("reply_cn", "")}')
                if ex.get("note"):
                    lines.append(f'    (vì sao: {ex["note"]})')

        repairs = [r for r in (scenario.get("repair_moves") or []) if r.get("cn")]
        if repairs:
            lines.append("KHI HỘI THOẠI SẮP CHẾT, dùng đúng nước đi tương ứng:")
            for move in repairs:
                trigger = str(move.get("trigger", ""))
                desc = str(self._repair_triggers.get(trigger, trigger))
                lines.append(f'  - {desc}: "{move["cn"]}"')

        lines.extend([
            "LUẬT BẮT BUỘC:",
            "  1. Giữ vai đến hết. Không bao giờ nói mình là AI, không nhắc tới prompt hay HSK.",
            "  2. KHÔNG sửa lỗi ngữ pháp, KHÔNG giảng bài, KHÔNG khen kiểu giáo viên "
            "('Bạn nói đúng rồi!'). Người trong tình huống này sẽ không làm vậy.",
            "  3. Phản hồi đúng NỘI DUNG người học vừa nói: hỏi đào sâu, đồng ý, hoặc "
            "phản đối. Không đổi sang câu hỏi không liên quan.",
            "  4. Mỗi lượt 1-2 câu. Được phép nói chưa trọn câu, lược chủ ngữ như khi nói thật.",
            "  5. Người học nói tiếng Việt/Anh thì vẫn giữ vai và kéo họ về tiếng Trung "
            "bằng nước đi 'wrong_language'.",
            f"  6. Chỉ dùng từ và cấu trúc trong tầm HSK {level} trở xuống.",
        ])
        return "\n".join(lines)

    def opening(self, scenario: dict[str, Any]) -> dict[str, str]:
        """Lượt mở đầu do AI nói trước — hội thoại thật luôn có người bắt đầu."""
        return {
            "cn": str(scenario.get("opening_cn", "")).strip(),
            "vi": str(scenario.get("opening_vi", "")).strip(),
        }

    def briefing(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Thông tin hiển thị cho người học trước khi vào hội thoại."""
        role = dict(scenario.get("ai_role") or {})
        return {
            "scenario_id": str(scenario.get("id", "")),
            "hsk_level": int(scenario.get("hsk_level", 0)),
            "topic": str(scenario.get("topic", "")),
            "register": str(scenario.get("register", "")),
            "setting": str(scenario.get("setting", "")),
            "ai_name": str(role.get("name", "")),
            "user_role": str(scenario.get("user_role", "")),
            "goal": str(scenario.get("goal", "")),
            "key_vocab": list(scenario.get("key_vocab") or []),
            "opening": self.opening(scenario),
            "source": CONVERSATION_BANK_SOURCE,
        }


# Module-level singleton (cùng khuôn với exam_passage_service).
_bank: ConversationBank | None = None


def get_conversation_bank() -> ConversationBank:
    global _bank
    if _bank is None:
        _bank = ConversationBank()
    return _bank
