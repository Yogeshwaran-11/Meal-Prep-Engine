from datetime import timedelta

from fastapi.testclient import TestClient

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import Session, User
from backend.app.security import utcnow

client = TestClient(app)


def login(username="user", password="User@123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_login_and_dashboard():
    headers = login()
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "User"
    dash = client.get("/api/dashboard", headers=headers)
    assert dash.status_code == 200
    assert dash.json()["counts"]["pantry"] >= 1


def test_bad_login():
    response = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401


def test_pantry_crud_and_search():
    headers = login()
    created = client.post(
        "/api/pantry",
        headers=headers,
        json={"name": "Spinach", "quantity": 200, "unit": "g", "expiry_date": "2026-09-10"},
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]
    listed = client.get("/api/pantry?search=spin", headers=headers)
    assert any(row["id"] == item_id for row in listed.json())
    updated = client.put(
        f"/api/pantry/{item_id}",
        headers=headers,
        json={"name": "Spinach", "quantity": 150, "unit": "g", "expiry_date": "2026-09-11"},
    )
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 150
    alerts = client.get("/api/pantry/alerts", headers=headers)
    assert alerts.status_code == 200
    assert any(row["id"] == item_id for row in alerts.json())
    duplicate = client.post(
        "/api/pantry",
        headers=headers,
        json={"name": "spinach", "quantity": 1, "unit": "g", "expiry_date": "2026-09-20"},
    )
    assert duplicate.status_code == 400
    deleted = client.delete(f"/api/pantry/{item_id}", headers=headers)
    assert deleted.status_code == 200


def test_recommendations_and_filters():
    headers = login()
    recs = client.get("/api/recipes/recommendations?diet=vegetarian&max_time=30", headers=headers)
    assert recs.status_code == 200
    body = recs.json()
    assert body
    assert all(item["diet"] == "vegetarian" and item["cooking_time"] <= 30 for item in body)
    assert body[0]["score"] >= body[-1]["score"]


def test_shopping_favorites_history_reports():
    headers = login()
    recipes = client.get("/api/recipes", headers=headers).json()
    chicken = next(item for item in recipes if item["name"] == "Chicken Tomato Curry")
    assert "Chicken" in chicken["missing_ingredients"]
    generated = client.post(
        "/api/shopping/generate",
        headers=headers,
        json={"recipe_id": chicken["id"], "servings": 2},
    )
    assert generated.status_code == 200
    names = [row["name"] for row in generated.json()]
    assert "Chicken" in names
    fav = client.post(f"/api/cooking/favorites/{chicken['id']}", headers=headers)
    assert fav.status_code in (201, 400)
    cooked = client.post("/api/cooking/history", headers=headers, json={"recipe_id": chicken["id"], "servings": 3})
    assert cooked.status_code == 201
    reports = client.get("/api/reports", headers=headers)
    assert reports.status_code == 200
    assert "expiry" in reports.json()


def test_admin_recipe_crud():
    headers = login("admin", "Admin@123")
    payload = {
        "name": "Test Toast",
        "diet": "vegetarian",
        "cooking_time": 8,
        "difficulty": "Easy",
        "base_servings": 1,
        "description": "Quick toast.",
        "image_url": "",
        "ingredients": [{"name": "Bread", "quantity": 2, "unit": "pcs"}],
        "steps": [{"step_number": 1, "instruction": "Toast the bread.", "timer_minutes": 3}],
    }
    created = client.post("/api/recipes", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    recipe_id = created.json()["id"]
    payload["description"] = "Updated toast."
    updated = client.put(f"/api/recipes/{recipe_id}", headers=headers, json=payload)
    assert updated.status_code == 200
    deleted = client.delete(f"/api/recipes/{recipe_id}", headers=headers)
    assert deleted.status_code == 200
    user_headers = login()
    forbidden = client.post("/api/recipes", headers=user_headers, json=payload)
    assert forbidden.status_code == 403


def test_session_timeout():
    headers = login()
    token = headers["Authorization"].split(" ", 1)[1]
    db = SessionLocal()
    try:
        session = db.query(Session).filter(Session.token == token).first()
        session.last_activity = utcnow() - timedelta(minutes=31)
        db.commit()
    finally:
        db.close()
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401


def test_account_lockout():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "user").first()
        user.failed_attempts = 0
        user.locked_until = None
        db.commit()
    finally:
        db.close()
    try:
        for _ in range(5):
            client.post("/api/auth/login", json={"username": "user", "password": "not-the-password"})
        locked = client.post("/api/auth/login", json={"username": "user", "password": "not-the-password"})
        assert locked.status_code == 423
        still_locked = client.post("/api/auth/login", json={"username": "user", "password": "User@123"})
        assert still_locked.status_code == 423
    finally:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == "user").first()
            user.failed_attempts = 0
            user.locked_until = None
            db.commit()
        finally:
            db.close()
