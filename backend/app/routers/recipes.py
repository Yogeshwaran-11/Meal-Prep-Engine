from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import CookingHistory, Favorite, Recipe, RecipeIngredient, RecipeStep, ShoppingItem, User
from ..schemas import MessageOut, RecipeCreate, RecipeOut
from ..services import expiring_names, favorite_ids_for, load_recipes, pantry_index, recipe_to_out

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


def apply_filters(recipes: list[RecipeOut], search: str, diet: str, max_time: int | None, difficulty: str):
    search = search.strip().lower()
    result = []
    for recipe in recipes:
        haystack = " ".join(
            [recipe.name, recipe.description, recipe.diet, *[i.name for i in recipe.ingredients]]
        ).lower()
        if search and search not in haystack:
            continue
        if diet != "all" and recipe.diet != diet:
            continue
        if max_time is not None and recipe.cooking_time > max_time:
            continue
        if difficulty != "all" and recipe.difficulty != difficulty:
            continue
        result.append(recipe)
    return result


@router.get("", response_model=list[RecipeOut])
def list_recipes(
    search: str = Query(default=""),
    diet: str = Query(default="all"),
    max_time: int | None = Query(default=None),
    difficulty: str = Query(default="all"),
    servings: int | None = Query(default=None, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    pantry = pantry_index(db, user.id)
    expiring = expiring_names(db, user.id)
    favs = favorite_ids_for(db, user.id)
    recipes = [recipe_to_out(r, pantry, expiring, favs, servings) for r in load_recipes(db)]
    return apply_filters(recipes, search, diet, max_time, difficulty)


@router.get("/recommendations", response_model=list[RecipeOut])
def recommendations(
    search: str = Query(default=""),
    diet: str = Query(default="all"),
    max_time: int | None = Query(default=None),
    difficulty: str = Query(default="all"),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    pantry = pantry_index(db, user.id)
    expiring = expiring_names(db, user.id)
    favs = favorite_ids_for(db, user.id)
    recipes = [recipe_to_out(r, pantry, expiring, favs) for r in load_recipes(db)]
    recipes = apply_filters(recipes, search, diet, max_time, difficulty)
    recipes.sort(key=lambda r: (-r.score, r.missing_count, r.cooking_time))
    return recipes


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(
    recipe_id: int,
    servings: int | None = Query(default=None, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    pantry = pantry_index(db, user.id)
    return recipe_to_out(
        recipe,
        pantry,
        expiring_names(db, user.id),
        favorite_ids_for(db, user.id),
        servings,
    )


def save_recipe_parts(db: DbSession, recipe: Recipe, payload: RecipeCreate) -> None:
    recipe.ingredients.clear()
    recipe.steps.clear()
    db.flush()
    for ingredient in payload.ingredients:
        recipe.ingredients.append(
            RecipeIngredient(
                name=ingredient.name.strip(),
                quantity=ingredient.quantity,
                unit=ingredient.unit.strip(),
            )
        )
    for step in payload.steps:
        recipe.steps.append(
            RecipeStep(
                step_number=step.step_number,
                instruction=step.instruction.strip(),
                timer_minutes=step.timer_minutes,
            )
        )


@router.post("", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(
    payload: RecipeCreate,
    admin: User = Depends(require_admin),
    db: DbSession = Depends(get_db),
):
    recipe = Recipe(
        name=payload.name.strip(),
        diet=payload.diet,
        cooking_time=payload.cooking_time,
        difficulty=payload.difficulty,
        base_servings=payload.base_servings,
        description=payload.description.strip(),
        image_url=payload.image_url.strip(),
    )
    db.add(recipe)
    try:
        db.flush()
        save_recipe_parts(db, recipe, payload)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A recipe with this name already exists.")
    db.refresh(recipe)
    pantry = pantry_index(db, admin.id)
    return recipe_to_out(recipe, pantry, expiring_names(db, admin.id), favorite_ids_for(db, admin.id))


@router.put("/{recipe_id}", response_model=RecipeOut)
def update_recipe(
    recipe_id: int,
    payload: RecipeCreate,
    admin: User = Depends(require_admin),
    db: DbSession = Depends(get_db),
):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    recipe.name = payload.name.strip()
    recipe.diet = payload.diet
    recipe.cooking_time = payload.cooking_time
    recipe.difficulty = payload.difficulty
    recipe.base_servings = payload.base_servings
    recipe.description = payload.description.strip()
    recipe.image_url = payload.image_url.strip()
    try:
        save_recipe_parts(db, recipe, payload)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A recipe with this name already exists.")
    db.refresh(recipe)
    pantry = pantry_index(db, admin.id)
    return recipe_to_out(recipe, pantry, expiring_names(db, admin.id), favorite_ids_for(db, admin.id))


@router.delete("/{recipe_id}", response_model=MessageOut)
def delete_recipe(recipe_id: int, admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    db.query(Favorite).filter(Favorite.recipe_id == recipe_id).delete()
    db.query(CookingHistory).filter(CookingHistory.recipe_id == recipe_id).delete()
    db.query(ShoppingItem).filter(ShoppingItem.recipe_name == recipe.name).delete()
    db.delete(recipe)
    db.commit()
    return MessageOut(message="Recipe deleted.")
