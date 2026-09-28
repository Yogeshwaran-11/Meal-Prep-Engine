from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..deps import get_current_user
from ..models import Recipe, ShoppingItem, User
from ..schemas import MessageOut, ShoppingCreate, ShoppingGenerate, ShoppingOut, ShoppingUpdate
from ..services import pantry_index

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


@router.get("", response_model=list[ShoppingOut])
def list_items(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return (
        db.query(ShoppingItem)
        .filter(ShoppingItem.user_id == user.id)
        .order_by(ShoppingItem.purchased.asc(), ShoppingItem.name.asc())
        .all()
    )


@router.post("", response_model=ShoppingOut, status_code=status.HTTP_201_CREATED)
def add_item(payload: ShoppingCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    item = ShoppingItem(
        user_id=user.id,
        name=payload.name.strip(),
        quantity=payload.quantity,
        unit=payload.unit.strip(),
        recipe_name=payload.recipe_name.strip(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/generate", response_model=list[ShoppingOut])
def generate_from_recipe(
    payload: ShoppingGenerate,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    recipe = db.get(Recipe, payload.recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    pantry = pantry_index(db, user.id)
    scale = payload.servings / max(recipe.base_servings, 1)
    created = []
    existing = {
        item.name.strip().lower()
        for item in db.query(ShoppingItem).filter(ShoppingItem.user_id == user.id, ShoppingItem.purchased.is_(False)).all()
    }
    for ingredient in recipe.ingredients:
        key = ingredient.name.strip().lower()
        needed = ingredient.quantity * scale
        have = pantry.get(key)
        if have is not None and have.quantity + 1e-9 >= needed:
            continue
        if key in existing:
            continue
        shortfall = needed if have is None else max(needed - have.quantity, 0)
        item = ShoppingItem(
            user_id=user.id,
            name=ingredient.name,
            quantity=round(shortfall, 2),
            unit=ingredient.unit,
            recipe_name=recipe.name,
        )
        db.add(item)
        created.append(item)
        existing.add(key)
    db.commit()
    for item in created:
        db.refresh(item)
    if created:
        return created
    return (
        db.query(ShoppingItem)
        .filter(ShoppingItem.user_id == user.id)
        .order_by(ShoppingItem.purchased.asc(), ShoppingItem.name.asc())
        .all()
    )


@router.put("/{item_id}", response_model=ShoppingOut)
def update_item(
    item_id: int,
    payload: ShoppingUpdate,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id, ShoppingItem.user_id == user.id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Shopping item not found.")
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.purchased is not None:
        item.purchased = payload.purchased
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", response_model=MessageOut)
def delete_item(item_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id, ShoppingItem.user_id == user.id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Shopping item not found.")
    db.delete(item)
    db.commit()
    return MessageOut(message="Item removed from shopping list.")


@router.delete("", response_model=MessageOut)
def clear_list(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    db.query(ShoppingItem).filter(ShoppingItem.user_id == user.id).delete()
    db.commit()
    return MessageOut(message="Shopping list cleared.")
