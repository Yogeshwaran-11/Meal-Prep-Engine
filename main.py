"""Root entrypoint shim allowing `main:app` or `uvicorn main:app` commands."""
from backend.app.main import app

__all__ = ["app"]
