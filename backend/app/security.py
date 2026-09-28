import hashlib
import secrets
from datetime import datetime, timedelta, timezone

PBKDF2_ROUNDS = 120_000
LOCK_MINUTES = 15
MAX_FAILED_ATTEMPTS = 5
SESSION_MINUTES = 30


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS
    )
    return secrets.compare_digest(check.hex(), digest)


def new_token() -> str:
    return secrets.token_urlsafe(48)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def lock_until() -> datetime:
    return utcnow() + timedelta(minutes=LOCK_MINUTES)


def session_expired(last_activity: datetime) -> bool:
    return utcnow() - last_activity > timedelta(minutes=SESSION_MINUTES)
