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
    turso_database_url: str = ""
    turso_auth_token: str = ""
    deepseek_api_key: str = ""

    # Single-admin credentials. Không hardcode: đọc từ env. Khi cả hai còn rỗng,
    # dependency require_admin trả 503 "admin not configured". password_hash phải
    # là bcrypt hash (cùng thư viện passlib[bcrypt] mà auth_service dùng).
    admin_email: str = ""
    admin_password_hash: str = ""
    gemini_api_keys: str = ""  # comma-separated fallback keys for vilao.ai
    gemini_api_url: str = "https://api.vilao.ai/v1/chat/completions"
    gemini_model: str = "ram/gemini-3.5-flash-low"

    # Google Gemini TTS. Dùng chung GEMINI_NATIVE_API_KEYS với speech (xem dưới);
    # chỉ giữ model + voice ở đây.
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    gemini_tts_voice: str = "Kore"

    # Native Google AI Studio keys (generativelanguage.googleapis.com) used for
    # audio-input features (pronunciation scoring + voice chat). The vilao relay
    # is text-only, so speech features must call the native API directly.
    gemini_native_api_keys: str = ""  # comma-separated AI Studio keys
    gemini_native_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_native_model: str = "gemini-2.5-flash"

    # ElevenLabs TTS — fallback khi mọi key Gemini cạn quota. Trả MP3 sẵn nên
    # không cần encode. Voice mặc định là giọng đa ngôn ngữ đọc được tiếng Trung.
    # Nhiều key comma-separated: xoay vòng khi key cạn quota ký tự tháng.
    elevenlabs_api_keys: str = ""
    elevenlabs_model: str = "eleven_multilingual_v2"
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    # Giọng riêng đọc phản hồi tiếng Việt (/tts/feedback). Tách khỏi voice_id
    # trên (dùng cho fallback đọc tiếng Trung) để chọn giọng Việt tự nhiên hơn.
    elevenlabs_feedback_voice_id: str = "BlZK9tHPU6XXjwOSIiYA"

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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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

    @property
    def gemini_keys_list(self) -> list[str]:
        return [k.strip() for k in self.gemini_api_keys.split(",") if k.strip()]

    @property
    def gemini_native_keys_list(self) -> list[str]:
        return [k.strip() for k in self.gemini_native_api_keys.split(",") if k.strip()]

    @property
    def elevenlabs_keys_list(self) -> list[str]:
        return [k.strip() for k in self.elevenlabs_api_keys.split(",") if k.strip()]


settings = Settings()
