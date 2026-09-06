from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-in-production-use-env-var"


class Settings(BaseSettings):
    app_name: str = "Chinese Learning Core"
    # "production" bật các kiểm tra cứng khi khởi động (vd jwt_secret phải đổi).
    env: str = "development"
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_expire_hours: int = 168
    cors_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "https://tezca-china.vercel.app,https://poseidonz227.id.vn,https://www.poseidonz227.id.vn"
    )
    # Trần kích thước request body (byte). FastAPI đọc TRỌN body vào RAM trước khi
    # dependency/validator nào chạy, nên mọi ``Field(max_length=...)`` và mọi
    # RateLimiter chỉ thực thi khi payload đã nằm sẵn trong bộ nhớ. Trên máy Fly
    # 512MB, một request body ~300MB là đủ để OOM kill. Middleware ở main.py chặn
    # trước routing.
    #
    # 1.5MB được chọn theo trần thực tế của schema lớn nhất: ``audio_base64`` có
    # ``max_length=700_000`` (schemas.py:516/529/619/630) và không model nào có hai
    # field audio, nên body hợp lệ lớn nhất ~800KB kể cả 40 lượt history. Hạ xuống
    # dưới ~900KB sẽ chặn audio thật.
    max_request_bytes: int = 1_500_000

    turso_database_url: str = ""
    turso_auth_token: str = ""

    # Relay vilao.ai — provider LLM DỰ PHÒNG. Kể từ khi StepFun được dùng làm
    # provider chính (xem stepfun_chat_* dưới), relay này chỉ còn được chọn khi
    # STEPFUN_API_KEYS trống. OpenAI và DeepSeek đã bị bỏ — key OpenAI chưa bao giờ
    # được cấu hình nên luôn bị skip, còn ai-box.vn/DeepSeek trả 403
    # insufficient_user_quota, mỗi lần fail chỉ tốn thêm round-trip vô ích.
    # Không ghi secret vào repo; các giá trị này chỉ đọc từ environment.
    # Nhiều key comma-separated: _call_api xoay vòng khi một key cạn quota.
    gemini_api_keys: str = ""
    gemini_api_url: str = "https://api.vilao.ai/v1/chat/completions"
    # Relay tự chọn model thật (response trả model="gemini-default"), nên giá trị
    # này chỉ là khai báo mong muốn phía client.
    gemini_model: str = "ram/gemini-3.5-flash-low"
    llm_max_tokens: int = 24000

    # Override provider LLM mà không cần sửa code: cả ba biến dưới đây, khi đặt,
    # thắng các giá trị ``gemini_*`` ở trên (xem property ``llm_*_effective``).
    # Mọi relay đang dùng đều là OpenAI-compatible ``/chat/completions`` nên đổi
    # provider chỉ là đổi 3 biến môi trường:
    #   LLM_API_URL=https://<host>/v1/chat/completions
    #   LLM_API_KEYS=<key1,key2>
    #   LLM_MODEL=<tên model>
    # URL chỉ có gốc (kết thúc bằng /v1) sẽ tự được nối "/chat/completions".
    # Cả BA phải cùng đặt hoặc cùng để rỗng — xem _enforce_llm_custom_complete:
    # đặt lẻ một biến sẽ ghép URL của provider này với key của provider khác và
    # chỉ lộ ra dưới dạng 401/404 lúc chạy, nên chặn ngay từ lúc khởi động.
    llm_api_url: str = ""
    llm_api_keys: str = ""
    llm_model: str = ""
    # json_object mode: chỉ bật khi provider hỗ trợ response_format. Để RỖNG =
    # tự quyết theo provider (StepFun hỗ trợ -> bật; relay vilao không -> tắt,
    # JSON ép bằng system prompt). Đặt "true"/"false" để ghi đè thủ công.
    llm_json_mode: str = ""
    # Ngân sách reasoning ("low"/"medium"/"high"). Model reasoning đốt phần lớn
    # thời gian vào chain-of-thought: đo trên gilotex/grok-4.5 cùng một prompt,
    # mặc định tốn 103s/4360 reasoning token, còn effort=low chỉ 13s/250 token và
    # vẫn finish_reason=stop. Gateway cắt ở ~121s nên bundle đầy đủ chỉ chạy nổi
    # khi hạ effort. Để rỗng = tự quyết theo provider (StepFun -> "low", relay
    # vilao -> không gửi vì không nhận tham số này).
    llm_reasoning_effort: str = ""

    # Single-admin credentials. Không hardcode: đọc từ env. Khi cả hai còn rỗng,
    # dependency require_admin trả 503 "admin not configured". password_hash phải
    # là bcrypt hash (cùng thư viện passlib[bcrypt] mà auth_service dùng).
    admin_email: str = ""
    admin_password_hash: str = ""

    # Google Gemini TTS. Dùng chung GEMINI_NATIVE_API_KEYS với speech (xem dưới);
    # chỉ giữ model + voice ở đây.
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    gemini_tts_voice: str = "Kore"

    # Native Google AI Studio keys (generativelanguage.googleapis.com) used for
    # audio-input features (pronunciation scoring + voice chat). The vilao relay
    # is text-only, so speech features must call the native API directly.
    gemini_native_api_keys: str = ""  # comma-separated AI Studio keys
    gemini_native_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_native_model: str = "gemini-3.5-flash-lite"

    # ElevenLabs TTS — fallback khi mọi key Gemini cạn quota. Trả MP3 sẵn nên
    # không cần encode. Voice mặc định là giọng đa ngôn ngữ đọc được tiếng Trung.
    # Nhiều key comma-separated: xoay vòng khi key cạn quota ký tự tháng.
    elevenlabs_api_keys: str = ""
    elevenlabs_model: str = "eleven_multilingual_v2"
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    # Giọng riêng đọc phản hồi tiếng Việt (/tts/feedback). Tách khỏi voice_id
    # trên (dùng cho fallback đọc tiếng Trung) để chọn giọng Việt tự nhiên hơn.
    elevenlabs_feedback_voice_id: str = "BlZK9tHPU6XXjwOSIiYA"

    # StepFun Step Plan TTS — provider ưu tiên cho audio tiếng Trung khi có key.
    # Không ghi secret vào repo; đặt STEPFUN_API_KEYS trong environment/.env.
    # Step Plan dùng hostname api.stepfun.ai và path /step_plan/v1.
    stepfun_api_keys: str = ""
    stepfun_tts_url: str = "https://api.stepfun.ai/step_plan/v1/audio/speech"
    stepfun_tts_model: str = "stepaudio-2.5-tts"
    # Voice giáo dục đã kiểm tra quyền trên Step Plan: rõ, êm, phù hợp học tiếng
    # Trung. Đã dò 9 giọng khác trong tài liệu (yuanqinansheng, wenrounansheng,
    # linjiajiejie, ...): TẤT CẢ trả 400 "voice_id does not exist" trên Step Plan,
    # và ``GET /audio/voices`` trả danh sách rỗng. Nói cách khác đây là giọng DUY
    # NHẤT khả dụng — đừng mất thời gian thử đổi giọng để tăng biểu cảm.
    stepfun_tts_voice: str = "zixinnansheng"

    # Chỉ dẫn diễn đạt cho các câu ĐỌC LẺ (flashcard, quiz, luyện nghe).
    #
    # Giữ trung tính có chủ ý: ở đây câu được nghe lặp nhiều lần để nhớ mặt chữ và
    # thanh điệu, nên đều đặn là ưu điểm. Chế độ hội thoại dùng bản khác, xem
    # ``stepfun_tts_instruction_chat``.
    stepfun_tts_instruction: str = (
        "标准普通话，清晰、自然、语速稍慢，准确读出声调。"
    )

    # Chỉ dẫn cho HỘI THOẠI (/tts/stream): sinh động hơn, vì ở đây giọng đóng vai
    # người đối thoại chứ không phải máy đọc từ điển.
    #
    # Đo trên key thật (parselmouth, 4 câu, so với bản trung tính ở trên):
    #   F0 trung vị  116Hz -> 129Hz  (+11%)
    #   cường độ      73.5 -> 75.5dB (+2.0dB)
    #   ASR chép lại  3/3 và 2/2 khớp -> thanh điệu KHÔNG bị méo
    #
    # Hai điều đã học được khi đo, để ai sửa chuỗi này không lặp lại:
    #  1. Phải dùng từ DỨT KHOÁT ("音调偏高", "重音明显"). Mô tả mơ hồ kiểu
    #     "语调有自然起伏" đo ra KHÔNG khác gì bản trung tính — thậm chí phẳng hơn.
    #  2. Bỏ "语速稍慢" ở đây. Cụm đó đẩy model về giọng phát thanh đều đặn, và
    #     chính nó là lý do các bản "ấm áp" thử trước lại phẳng hơn bản gốc.
    #  Giữ "声调准确清晰" ở cuối: đây là app học tiếng, biểu cảm mà sai thanh điệu
    #  thì phản tác dụng. ASR round-trip là cách kiểm điều đó.
    stepfun_tts_instruction_chat: str = (
        "热情洋溢的中文老师，音调偏高，语气积极上扬，重音明显，语速适中；"
        "标准普通话，声调准确清晰。"
    )

    stepfun_tts_speed: float = 0.9
    stepfun_tts_sample_rate: int = 24000
    stepfun_tts_text_normalization: str = "enhanced"

    # StepFun Step Plan chat — provider LLM ƯU TIÊN khi có STEPFUN_API_KEYS,
    # dùng chung key với TTS ở trên. Đo trực tiếp trên key hiện tại:
    #   /step_plan/v1  -> 200 OK
    #   /v1 (trả tiền theo token) -> 402 quota_exceeded
    # nên phải giữ path /step_plan/v1; đổi sang /v1 là chết request.
    stepfun_chat_url: str = "https://api.stepfun.ai/step_plan/v1/chat/completions"
    stepfun_chat_model: str = "step-3.7-flash"

    # StepFun Step Plan ASR — chép âm hội thoại, thay Gemini làm ĐƯỜNG CHÍNH
    # (Gemini vẫn là fallback, xem ``transcribe_speech``). Dùng chung
    # STEPFUN_API_KEYS với chat/TTS.
    #
    # Host là api.stepfun.ai chứ không phải api.stepfun.com như tài liệu ghi:
    # cả hai endpoint Step Plan đang chạy được (TTS + chat) đều dùng .ai, nên
    # theo cái đã đo thay vì cái đã đọc. Path /step_plan/v1 là bắt buộc, cùng lý
    # do như chat ở trên.
    #
    # Chỉ dùng bản HTTP+SSE. Step Plan KHÔNG mở bản WebSocket song hướng
    # (stepaudio-2.5-asr-stream), và bản đó cũng đắt hơn (¥1.2/giờ so với
    # ¥0.15/giờ), nên không có đường làm streaming ASR hai chiều ở đây.
    stepfun_asr_url: str = "https://api.stepfun.ai/step_plan/v1/audio/asr/sse"
    stepfun_asr_model: str = "stepaudio-2.5-asr"

    # StepFun Step Plan TTS streaming (WebSocket) — dùng cho chế độ gọi thoại.
    #
    # Khác ``stepfun_tts_url`` (HTTP, trả trọn file): đường này trả byte đầu tiên
    # ~0.65s sau khi gửi text, so với ~2.5s của HTTP — đo trên key thật, cùng câu.
    # Đổi lại phải trả ~0.94s mở socket mỗi câu, nên chỉ đáng cho hội thoại.
    #
    # Host .ai chứ không .com như tài liệu, cùng lý do đã ghi ở khối ASR trên: đo
    # trên key thật, .com trả 401 "Incorrect API key" còn .ai trả 200.
    #
    # Model dùng chung ``stepfun_tts_model``, voice/speed/instruction dùng chung
    # các setting ở khối TTS — giọng phải KHỚP /tts, nếu không cùng một cuộc gọi
    # sẽ đổi giọng giữa câu khi rơi về fallback HTTP.
    stepfun_tts_ws_url: str = "wss://api.stepfun.ai/step_plan/v1/realtime/audio"

    # SMTP — gửi email đặt lại mật khẩu. Nếu smtp_host trống, luồng reset vẫn
    # chạy (sinh + lưu token) nhưng chỉ log link ra console thay vì gửi mail —
    # tiện cho môi trường dev không cấu hình SMTP.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""  # địa chỉ From; mặc định dùng smtp_user nếu trống
    # Tên hiển thị người gửi (kèm trước địa chỉ). Gmail vẫn để lộ địa chỉ thật
    # trong header, nhưng hộp thư người nhận hiện tên này thay vì email cá nhân.
    smtp_from_name: str = "Học tiếng Trung"
    smtp_use_tls: bool = True  # STARTTLS trên cổng 587
    # Gốc URL frontend để dựng link reset: {frontend_url}/reset-password?token=...
    frontend_url: str = "http://localhost:5173"
    # Thời hạn token đặt lại mật khẩu (phút).
    password_reset_expire_minutes: int = 30
    # In NGUYÊN VĂN nội dung mail (kèm link reset chứa token thô) ra log khi SMTP
    # chưa cấu hình. Mặc định TẮT và phải bật tường minh.
    #
    # Trước đây điều kiện là ``not is_production``, tức fail-OPEN: vì ``ENV`` không
    # được đặt ở đâu cả (fly.toml [env] chỉ có PORT), ``is_production`` là False
    # trên máy production thật, nên link đặt lại mật khẩu còn hiệu lực 30 phút
    # được đổ vào log stream của Fly. Ai đọc được log là đổi được mật khẩu bất kỳ
    # tài khoản nào. Cờ riêng này bịt lỗ đó KHÔNG phụ thuộc vào việc ``ENV`` có
    # được đặt đúng hay không — đặt sai tên biến thì mặc định vẫn là an toàn.
    email_debug_log: bool = False

    # extra="ignore": biến môi trường không khớp field nào thì BỎ QUA thay vì
    # ném ValidationError. Mặc định của pydantic-settings là "forbid", nên khi bỏ
    # một field (vd DEEPSEEK_API_KEY/OPENAI_API_KEY) mà .env hoặc secret store của
    # môi trường triển khai vẫn còn dòng cũ thì app không khởi động nổi — hỏng cả
    # service chỉ vì một biến đã hết dùng.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def smtp_from_addr(self) -> str:
        return self.smtp_from or self.smtp_user

    @property
    def admin_configured(self) -> bool:
        return bool(self.admin_email.strip() and self.admin_password_hash.strip())

    @property
    def admin_email_normalized(self) -> str:
        return self.admin_email.strip().lower()

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.strip().lower() in ("production", "prod")

    @model_validator(mode="after")
    def _enforce_production_secrets(self) -> "Settings":
        # Ở production, từ chối khởi động khi jwt_secret còn giá trị mặc định —
        # secret công khai cho phép giả mạo token của bất kỳ user nào.
        if self.is_production and self.jwt_secret.strip() == _DEFAULT_JWT_SECRET:
            raise ValueError(
                "jwt_secret vẫn là giá trị mặc định ở production. "
                "Đặt biến môi trường JWT_SECRET thành một chuỗi bí mật ngẫu nhiên."
            )
        return self

    @model_validator(mode="after")
    def _enforce_llm_custom_complete(self) -> "Settings":
        # LLM_API_URL / LLM_API_KEYS / LLM_MODEL là một bộ ba: chỉ llm_api_keys
        # quyết định provider == "custom", nên đặt lẻ URL hoặc model sẽ trộn hai
        # provider vào một request. Hai trường hợp đã đo được:
        #   - Chỉ LLM_API_URL: provider vẫn "stepfun" -> URL custom + key StepFun.
        #   - Chỉ LLM_MODEL:   URL/key StepFun + model lạ -> 404 model-not-found.
        # Cả hai chỉ lộ ra khi request chạy thật, nên chặn ngay lúc khởi động.
        provided = {
            "LLM_API_URL": bool(self.llm_api_url.strip()),
            "LLM_API_KEYS": bool(self.llm_api_keys.strip()),
            "LLM_MODEL": bool(self.llm_model.strip()),
        }
        if any(provided.values()) and not all(provided.values()):
            missing = ", ".join(name for name, ok in provided.items() if not ok)
            have = ", ".join(name for name, ok in provided.items() if ok)
            raise ValueError(
                f"Cấu hình LLM custom thiếu: {missing} (đang có {have}). "
                "Phải đặt cả LLM_API_URL, LLM_API_KEYS và LLM_MODEL, hoặc để "
                "trống cả ba để dùng StepFun/vilao."
            )
        return self

    @property
    def gemini_keys_list(self) -> list[str]:
        return [k.strip() for k in self.gemini_api_keys.split(",") if k.strip()]

    @property
    def llm_provider(self) -> str:
        """Provider LLM đang thực sự được dùng: "custom" | "stepfun" | "vilao".

        Thứ tự ưu tiên, dừng ở cái đầu tiên có key:
          1. ``custom``  — LLM_API_KEYS được đặt (người dùng chỉ định tay).
          2. ``stepfun`` — STEPFUN_API_KEYS được đặt (mặc định hiện tại).
          3. ``vilao``   — GEMINI_API_KEYS, đường dự phòng cũ.

        Mọi property ``llm_*_effective`` bên dưới đọc chung giá trị này, nên URL,
        key, model và payload không bao giờ lệch provider — lỗi trước đây rất dễ
        xảy ra khi đổi URL mà quên đổi key.
        """
        if self._llm_keys_explicit:
            return "custom"
        if self.stepfun_keys_list:
            return "stepfun"
        return "vilao"

    @property
    def _llm_keys_explicit(self) -> list[str]:
        return [k.strip() for k in self.llm_api_keys.split(",") if k.strip()]

    @property
    def llm_api_url_effective(self) -> str:
        """URL /chat/completions đang dùng.

        LLM_API_URL thắng tuyệt đối nếu được đặt. Nhận cả URL gốc (``.../v1``) và
        URL đầy đủ: chỉ nối hậu tố khi thiếu, nên đặt biến kiểu nào cũng chạy.
        """
        url = self.llm_api_url.strip().rstrip("/")
        if url:
            if url.endswith("/chat/completions"):
                return url
            return f"{url}/chat/completions"
        if self.llm_provider == "stepfun":
            return self.stepfun_chat_url
        return self.gemini_api_url

    @property
    def llm_keys_list(self) -> list[str]:
        """Key đang dùng, theo đúng provider mà ``llm_provider`` đã chọn."""
        explicit = self._llm_keys_explicit
        if explicit:
            return explicit
        if self.llm_provider == "stepfun":
            return self.stepfun_keys_list
        return self.gemini_keys_list

    @property
    def llm_model_effective(self) -> str:
        model = self.llm_model.strip()
        if model:
            return model
        if self.llm_provider == "stepfun":
            return self.stepfun_chat_model
        return self.gemini_model

    @property
    def llm_json_mode_effective(self) -> bool:
        """Có gửi ``response_format: json_object`` hay không.

        LLM_JSON_MODE rỗng = tự quyết theo provider. StepFun hỗ trợ nên bật (đo
        được: cùng prompt, có json_object mất 10.8s/892 token thay vì 29s/3749
        token vì model thôi vòng vo ngoài JSON). Relay vilao không hỗ trợ nên tắt.
        """
        raw = self.llm_json_mode.strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
        if raw in ("0", "false", "no", "off"):
            return False
        return self.llm_provider == "stepfun"

    @property
    def llm_reasoning_effort_effective(self) -> str:
        """Ngân sách reasoning; rỗng = không gửi tham số.

        Mặc định "low" cho StepFun: kết hợp với json_object, cùng prompt xuống
        6.0s/457 token (so với 29s/3749 khi không gửi gì) — đủ xa trần gateway
        ~121s. Relay vilao không nhận tham số này nên để rỗng.
        """
        effort = self.llm_reasoning_effort.strip()
        if effort:
            return effort
        if self.llm_provider == "stepfun":
            return "low"
        return ""

    @property
    def llm_reasoning_flat(self) -> bool:
        """True = gửi ``reasoning_effort: "low"``; False = ``reasoning: {effort}``.

        Không phải chuyện style: đo trên key StepFun hiện tại, dạng phẳng làm
        prompt_tokens 80 -> 85 (server nhận tham số), còn dạng lồng giữ nguyên 80
        (bị bỏ qua im lặng). Relay gilotex thì ngược lại — dạng lồng mới hạ được
        103s -> 13s. Nên cờ này đi theo provider.
        """
        return self.llm_provider == "stepfun"

    @property
    def gemini_native_keys_list(self) -> list[str]:
        return [k.strip() for k in self.gemini_native_api_keys.split(",") if k.strip()]

    @property
    def elevenlabs_keys_list(self) -> list[str]:
        return [k.strip() for k in self.elevenlabs_api_keys.split(",") if k.strip()]

    @property
    def stepfun_keys_list(self) -> list[str]:
        return [k.strip() for k in self.stepfun_api_keys.split(",") if k.strip()]


settings = Settings()

# Thông báo dùng chung cho mọi script khi ``settings.llm_keys_list`` rỗng. Trước
# đây bảy script tự viết câu riêng và đều chỉ nhắc GEMINI_API_KEYS — nhánh ưu tiên
# thấp nhất, nên người chạy đặt key vào đó rồi bị StepFun đè im lặng. Một hằng số
# để lần đổi thứ tự ưu tiên sau không phải sửa bảy chỗ.
NO_LLM_KEY_MESSAGE = (
    "Chưa cấu hình key LLM nào — đặt STEPFUN_API_KEYS (khuyến nghị), "
    "hoặc LLM_API_URL+LLM_API_KEYS+LLM_MODEL, hoặc GEMINI_API_KEYS."
)
