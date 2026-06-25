from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Chinese Learning Core"
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change-me-in-production-use-env-var"
    jwt_expire_hours: int = 168
    cors_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "https://tiengtrung-49e13.web.app,https://tiengtrung-49e13.firebaseapp.com,"
        "https://tezca-china.vercel.app,https://poseidonz227.id.vn,https://www.poseidonz227.id.vn"
    )
    deepseek_api_key: str = ""
    gemini_api_keys: str = ""  # comma-separated fallback keys for vilao.ai
    gemini_api_url: str = "https://api.vilao.ai/v1/chat/completions"
    gemini_model: str = "google/gemini-3.5-flash"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def gemini_keys_list(self) -> list[str]:
        return [k.strip() for k in self.gemini_api_keys.split(",") if k.strip()]


settings = Settings()
