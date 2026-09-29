"""Entrypoint shim for deployments configured with `app.main:app`."""
from backend.app.main import app

__all__ = ["app"]
