import os

class Config:
    # ── MySQL ──────────────────────────────────
    DB_HOST     = os.getenv("DB_HOST",     "localhost")
    DB_PORT     = int(os.getenv("DB_PORT", "3306"))
    DB_USER     = os.getenv("DB_USER",     "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "kavi95")      
    DB_NAME     = os.getenv("DB_NAME",     "loom_db")

    # ── Flask ──────────────────────────────────
    SECRET_KEY      = os.getenv("SECRET_KEY", "loom-secret-key-2024")
    VOTE_THRESHOLD  = 10
    FRONTEND_ORIGIN = "http://127.0.0.1:5500"        # Live Server default
