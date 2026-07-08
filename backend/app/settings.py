from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Chinese Learning Core"
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change-me-in-production-use-env-var"
    jwt_expire_hours: int = 168
    cors_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "https://tezca-china.vercel.app,https://poseidonz227.id.vn,https://www.poseidonz227.id.vn"
    )
    turso_database_url: str = ""
    turso_auth_token: str = ""
    deepseek_api_key: str = ""
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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

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
