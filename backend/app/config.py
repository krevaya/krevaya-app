from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # the repo root .env (shared with docker compose), then backend/.env, then the real environment
    model_config = SettingsConfigDict(env_file=(BASE_DIR.parent / ".env", BASE_DIR / ".env"), extra="ignore")

    secret_key: str = "dev-only-change-me"
    debug: bool = False
    site_url: str = "http://localhost:8460"
    site_name: str = "Krevaya"

    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'app.db'}"
    redis_url: str = ""

    data_dir: Path = BASE_DIR / "data"
    media_url: str = "/media"
    upload_limit_mb: int = 50

    # S3-compatible storage. Leave the bucket empty to keep uploads on disk.
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_public_url: str = ""

    allow_signup: bool = True
    session_ttl_days: int = 14
    cookie_secure: bool = False

    # Email. Without a host, emails are printed to the log.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = True
    email_from: str = "Krevaya <noreply@localhost>"

    google_client_id: str = ""
    google_client_secret: str = ""

    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_label: str = "Work account"
    oidc_scopes: str = "openid email profile"

    unsplash_key: str = ""
    pexels_key: str = ""
    freesound_key: str = ""

    # the /mcp endpoint for assistants, off until you turn it on
    assistant_api: bool = False
    assistant_rate: str = "60/minute"
    copies_per_request: int = 250
    # fetching https images named in copy values or "add from link"
    remote_images: bool = False

    headless_export: bool = False
    headless_browser_path: str = ""
    # base URL the export browser loads /snapshot/<id> from, when site_url isn't reachable from the server
    snapshot_url: str = ""

    rate_limit_login: str = "10/minute"
    rate_limit_upload: str = "60/minute"
    rate_limit_export: str = "30/minute"
    rate_limit_copies: str = "100/minute"
    rate_limit_remote_images: str = "200/minute"

    @field_validator("data_dir", mode="before")
    @classmethod
    def _path(cls, v):
        return Path(v)

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_issuer and self.oidc_client_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
