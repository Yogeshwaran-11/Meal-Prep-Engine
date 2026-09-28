import os
from pathlib import Path
import pytest

TEST_DB = Path(__file__).resolve().parent / "test_mealprep.db"
if TEST_DB.exists():
    try:
        TEST_DB.unlink()
    except Exception:
        pass
os.environ["MEALPREP_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"

from backend.app.database import Base, engine, SessionLocal
from backend.app.seed import seed_if_empty


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield
    engine.dispose()
    if TEST_DB.exists():
        try:
            TEST_DB.unlink()
        except Exception:
            pass
