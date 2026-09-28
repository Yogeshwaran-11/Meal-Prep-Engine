from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import CookingHistory, Favorite, PantryItem, Recipe, ShoppingItem, User
from ..seed import EXPIRY_ALERT_DAYS
from ..services import days_remaining, pantry_status, recipe_to_out, pantry_index, expiring_names, favorite_ids_for

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    pantry_items = db.query(PantryItem).filter(PantryItem.user_id == user.id).all()
    alerts = [item for item in pantry_items if pantry_status(item.expiry_date) != "ok"]
    pantry = pantry_index(db, user.id)
    expiring = expiring_names(db, user.id)
    favs = favorite_ids_for(db, user.id)
    recs = [recipe_to_out(r, pantry, expiring, favs) for r in db.query(Recipe).all()]
    recs.sort(key=lambda r: (-r.score, r.missing_count))
    favorites = db.query(Favorite).filter(Favorite.user_id == user.id).count()
    shopping = db.query(ShoppingItem).filter(ShoppingItem.user_id == user.id, ShoppingItem.purchased.is_(False)).count()
    history = db.query(CookingHistory).filter(CookingHistory.user_id == user.id).count()
    return {
        "user": {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role},
        "counts": {
            "pantry": len(pantry_items),
            "expiring": len(alerts),
            "recommendations": len([r for r in recs if r.match_count > 0]),
            "favorites": favorites,
            "shopping": shopping,
            "history": history,
            "recipes": db.query(Recipe).count(),
        },
        "alerts": [
            {
                "id": item.id,
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "expiry_date": item.expiry_date.isoformat(),
                "days_remaining": days_remaining(item.expiry_date),
                "status": pantry_status(item.expiry_date),
            }
            for item in sorted(alerts, key=lambda i: i.expiry_date)[:6]
        ],
        "recommendations": recs[:4],
        "alert_window_days": EXPIRY_ALERT_DAYS,
    }


@router.get("/reports")
def reports(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    pantry_items = db.query(PantryItem).filter(PantryItem.user_id == user.id).all()
    history = (
        db.query(CookingHistory)
        .filter(CookingHistory.user_id == user.id)
        .order_by(CookingHistory.cooked_at.desc())
        .all()
    )
    cooked_names = []
    for row in history:
        recipe = db.get(Recipe, row.recipe_id)
        if recipe:
            cooked_names.append(recipe.name)
    popular = Counter(cooked_names).most_common(5)
    expiry_groups = {"expired": 0, "expiring": 0, "ok": 0}
    for item in pantry_items:
        expiry_groups[pantry_status(item.expiry_date)] += 1
    payload = {
        "expiry": {
            "window_days": EXPIRY_ALERT_DAYS,
            "groups": expiry_groups,
            "items": [
                {
                    "name": item.name,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "expiry_date": item.expiry_date.isoformat(),
                    "days_remaining": days_remaining(item.expiry_date),
                    "status": pantry_status(item.expiry_date),
                }
                for item in sorted(pantry_items, key=lambda i: i.expiry_date)
                if pantry_status(item.expiry_date) != "ok"
            ],
        },
        "cooking": {
            "total_sessions": len(history),
            "popular_recipes": [{"name": name, "times_cooked": count} for name, count in popular],
        },
        "shopping_open": db.query(ShoppingItem)
        .filter(ShoppingItem.user_id == user.id, ShoppingItem.purchased.is_(False))
        .count(),
    }
    if user.role == "Admin":
        all_history = db.query(CookingHistory).all()
        names = []
        for row in all_history:
            recipe = db.get(Recipe, row.recipe_id)
            if recipe:
                names.append(recipe.name)
        payload["admin"] = {
            "users": db.query(User).count(),
            "recipes": db.query(Recipe).count(),
            "pantry_items": db.query(PantryItem).count(),
            "cooking_sessions": len(all_history),
            "popular_recipes": [{"name": n, "times_cooked": c} for n, c in Counter(names).most_common(5)],
            "accounts": [
                {"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role}
                for u in db.query(User).order_by(User.role.asc(), User.username.asc()).all()
            ],
        }
    return payload


@router.get("/admin/users")
def admin_users(admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    return [
        {"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role}
        for u in db.query(User).order_by(User.id.asc()).all()
    ]
