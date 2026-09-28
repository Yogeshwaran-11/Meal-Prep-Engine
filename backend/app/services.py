from datetime import date

from sqlalchemy.orm import Session

from .models import Favorite, PantryItem, Recipe
from .schemas import RecipeIngredientOut, RecipeOut, RecipeStepOut
from .seed import EXPIRY_ALERT_DAYS


def days_remaining(expiry: date) -> int:
    return (expiry - date.today()).days


def pantry_status(expiry: date) -> str:
    days = days_remaining(expiry)
    if days < 0:
        return "expired"
    if days <= EXPIRY_ALERT_DAYS:
        return "expiring"
    return "ok"


def pantry_index(db: Session, user_id: int) -> dict[str, PantryItem]:
    items = db.query(PantryItem).filter(PantryItem.user_id == user_id).all()
    return {item.name.strip().lower(): item for item in items}


def expiring_names(db: Session, user_id: int) -> set[str]:
    names = set()
    for item in db.query(PantryItem).filter(PantryItem.user_id == user_id).all():
        if pantry_status(item.expiry_date) in {"expired", "expiring"}:
            names.add(item.name.strip().lower())
    return names


def recipe_to_out(
    recipe: Recipe,
    pantry: dict[str, PantryItem],
    expiring: set[str],
    favorite_ids: set[int],
    servings: int | None = None,
) -> RecipeOut:
    scale = 1.0
    if servings:
        scale = servings / max(recipe.base_servings, 1)

    ingredients = []
    missing = []
    used_expiring = []
    match_count = 0
    for ingredient in recipe.ingredients:
        qty = round(ingredient.quantity * scale, 2)
        ingredients.append(
            RecipeIngredientOut(name=ingredient.name, quantity=qty, unit=ingredient.unit)
        )
        key = ingredient.name.strip().lower()
        have = pantry.get(key)
        if have is not None and have.quantity + 1e-9 >= qty:
            match_count += 1
            if key in expiring:
                used_expiring.append(ingredient.name)
        else:
            missing.append(ingredient.name)

    missing_count = len(missing)
    score = match_count * 10 + len(used_expiring) * 8 - missing_count * 4
    if match_count and missing_count == 0:
        score += 12

    steps = [
        RecipeStepOut(
            step_number=step.step_number,
            instruction=step.instruction,
            timer_minutes=step.timer_minutes,
        )
        for step in sorted(recipe.steps, key=lambda s: s.step_number)
    ]
    return RecipeOut(
        id=recipe.id,
        name=recipe.name,
        diet=recipe.diet,
        cooking_time=recipe.cooking_time,
        difficulty=recipe.difficulty,
        base_servings=recipe.base_servings,
        description=recipe.description,
        image_url=recipe.image_url,
        ingredients=ingredients,
        steps=steps,
        match_count=match_count,
        missing_count=missing_count,
        missing_ingredients=missing,
        expiring_used=used_expiring,
        score=score,
        favorite=recipe.id in favorite_ids,
    )


def favorite_ids_for(db: Session, user_id: int) -> set[int]:
    rows = db.query(Favorite.recipe_id).filter(Favorite.user_id == user_id).all()
    return {row[0] for row in rows}


def load_recipes(db: Session) -> list[Recipe]:
    return db.query(Recipe).order_by(Recipe.name).all()
