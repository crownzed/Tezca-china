"""AI phân tích dữ liệu học tập tổng hợp — nhận xét + lộ trình bằng tiếng Việt.

Gom số liệu học đã có (AnalyticsOut từ router quiz + streak/động lực từ
ProfileService) rồi nhờ LLM viết nhận xét tổng hợp và lộ trình các bước tiếp
theo. Chỉ gọi khi khách bấm nút (on-demand), không chạy nền.

Dùng _call_api (llm_generator_service): Gemini primary + DeepSeek fallback, ép
JSON. Trả về dict {summary, strengths[], weaknesses[], roadmap[]}; nếu LLM fail
hoặc trả JSON méo, raise RuntimeError để router map 502 (giống mẫu speech).
"""
import json
import logging

from sqlalchemy.orm import Session

from .llm_generator_service import _call_api
from .profile_service import ProfileService

logger = logging.getLogger(__name__)


def _build_prompt(analytics: dict, stats: dict) -> str:
    """Gom analytics + stats thành prompt tiếng Việt yêu cầu JSON thuần.

    analytics: AnalyticsOut.model_dump() — có weak_word_list, readiness scores,
    type/level breakdown, recommendation. stats: ProfileService.get_stats — có
    streak, study_days, points.
    """
    payload = {
        "tong_quan": {
            "so_cau_da_lam": analytics.get("answered", 0),
            "do_chinh_xac_phan_tram": analytics.get("accuracy", 0),
            "muc_thanh_thao": analytics.get("mastery_label", ""),
            "so_tu_yeu": analytics.get("weak_words", 0),
            "so_tu_den_han_on": analytics.get("due_count", 0),
        },
        "cac_ky_nang": {
            "on_dinh_tri_nho": analytics.get("memory_stability", 0),
            "san_sang_nghe": analytics.get("listening_readiness", 0),
            "chuyen_giao_ngu_canh": analytics.get("context_transfer", 0),
            "san_sang_tao_cau": analytics.get("production_readiness", 0),
        },
        "tu_yeu_nhat": [
            {
                "hanzi": w.get("hanzi"),
                "pinyin": w.get("pinyin"),
                "nghia": w.get("meaning_vi"),
                "do_chinh_xac": w.get("accuracy"),
                "so_lan_sai": w.get("wrong"),
            }
            for w in (analytics.get("weak_word_list") or [])
        ],
        "theo_dang_bai": [
            {
                "dang": item.get("label"),
                "do_chinh_xac": item.get("accuracy"),
                "so_cau": item.get("answered"),
            }
            for item in (analytics.get("type_breakdown") or [])
        ],
        "theo_cap_hsk": [
            {
                "cap": item.get("level"),
                "do_chinh_xac": item.get("accuracy"),
                "so_cau": item.get("answered"),
            }
            for item in (analytics.get("level_breakdown") or [])
        ],
        "dong_luc": {
            "chuoi_ngay_hien_tai": stats.get("current_streak", 0),
            "chuoi_ngay_dai_nhat": stats.get("longest_streak", 0),
            "tong_ngay_hoc": stats.get("study_days", 0),
            "diem": stats.get("points", 0),
        },
    }

    return (
        "Bạn là CỐ VẤN HỌC TẬP tiếng Trung cho người Việt. Dưới đây là dữ liệu "
        "học tập tổng hợp THẬT của một người học (JSON):\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "Nhiệm vụ: phân tích toàn diện và đưa ra nhận xét + lộ trình học tiếp theo.\n"
        "Quy tắc:\n"
        "- CHỈ dựa vào số liệu trên, TUYỆT ĐỐI không bịa dữ liệu không có.\n"
        "- Viết bằng TIẾNG VIỆT, giọng động viên nhưng thẳng thắn, cụ thể.\n"
        "- 'summary': 2-3 câu tổng hợp tình hình hiện tại.\n"
        "- 'strengths': 1-3 điểm mạnh cụ thể (mỗi mục 1 câu ngắn).\n"
        "- 'weaknesses': 1-3 điểm cần cải thiện, nêu rõ từ/kỹ năng/dạng bài cụ thể.\n"
        "- 'roadmap': 3-5 bước hành động tiếp theo theo thứ tự ưu tiên (mỗi bước 1 câu).\n"
        "Trả về DUY NHẤT một JSON object thuần (không markdown, không giải thích "
        "ngoài JSON) theo đúng schema:\n"
        '{"summary": "...", "strengths": ["..."], "weaknesses": ["..."], "roadmap": ["..."]}'
    )


def _coerce_str_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def analyze_study_data(db: Session, user_id: str, analytics: dict) -> dict:
    """Gọi LLM phân tích dữ liệu học. Raise RuntimeError nếu LLM fail/JSON méo."""
    stats = ProfileService(db).get_stats(user_id)
    prompt = _build_prompt(analytics, stats)

    try:
        raw = _call_api(prompt)
    except Exception as e:  # noqa: BLE001 — mọi lỗi LLM gộp thành RuntimeError
        logger.warning("Study analysis LLM failed: %s", e)
        raise RuntimeError(str(e)) from e

    if not isinstance(raw, dict):
        raise RuntimeError("LLM trả về không phải JSON object")

    return {
        "summary": str(raw.get("summary", "")).strip(),
        "strengths": _coerce_str_list(raw.get("strengths")),
        "weaknesses": _coerce_str_list(raw.get("weaknesses")),
        "roadmap": _coerce_str_list(raw.get("roadmap")),
    }
