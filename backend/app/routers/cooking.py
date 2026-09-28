from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..deps import get_current_user
from ..models import CookingHistory, Favorite, Recipe, User
from ..schemas import HistoryCreate, HistoryOut, MessageOut, RecipeOut
from ..services import expiring_names, favorite_ids_for, pantry_index, recipe_to_out

router = APIRouter(prefix="/api/cooking", tags=["cooking"])


@router.get("/favorites", response_model=list[RecipeOut])
def list_favorites(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    pantry = pantry_index(db, user.id)
    expiring = expiring_names(db, user.id)
    favs = favorite_ids_for(db, user.id)
    rows = db.query(Favorite).filter(Favorite.user_id == user.id).order_by(Favorite.created_at.desc()).all()
    recipes = []
    for row in rows:
        recipe = db.get(Recipe, row.recipe_id)
        if recipe:
            recipes.append(recipe_to_out(recipe, pantry, expiring, favs))
    return recipes


@router.post("/favorites/{recipe_id}", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def add_favorite(recipe_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if db.get(Recipe, recipe_id) is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    db.add(Favorite(user_id=user.id, recipe_id=recipe_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Recipe is already in favorites.")
    return MessageOut(message="Recipe saved to favorites.")


@router.delete("/favorites/{recipe_id}", response_model=MessageOut)
def remove_favorite(recipe_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    row = (
        db.query(Favorite)
        .filter(Favorite.user_id == user.id, Favorite.recipe_id == recipe_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Favorite not found.")
    db.delete(row)
    db.commit()
    return MessageOut(message="Recipe removed from favorites.")


@router.get("/history", response_model=list[HistoryOut])
def list_history(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    rows = (
        db.query(CookingHistory)
        .filter(CookingHistory.user_id == user.id)
        .order_by(CookingHistory.cooked_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for row in rows:
        recipe = db.get(Recipe, row.recipe_id)
        result.append(
            HistoryOut(
                id=row.id,
                recipe_id=row.recipe_id,
                recipe_name=recipe.name if recipe else "Removed recipe",
                cooked_at=row.cooked_at,
                servings=row.servings,
            )
        )
    return result


@router.post("/history", response_model=HistoryOut, status_code=status.HTTP_201_CREATED)
def add_history(payload: HistoryCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    recipe = db.get(Recipe, payload.recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    row = CookingHistory(user_id=user.id, recipe_id=payload.recipe_id, servings=payload.servings)
    db.add(row)
    db.commit()
    db.refresh(row)
    return HistoryOut(
        id=row.id,
        recipe_id=row.recipe_id,
        recipe_name=recipe.name,
        cooked_at=row.cooked_at,
        servings=row.servings,
    )
