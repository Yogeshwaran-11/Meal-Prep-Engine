from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..deps import get_current_user
from ..models import PantryItem, User
from ..schemas import MessageOut, PantryCreate, PantryOut, PantryUpdate
from ..services import days_remaining, pantry_status

router = APIRouter(prefix="/api/pantry", tags=["pantry"])


def to_out(item: PantryItem) -> PantryOut:
    return PantryOut(
        id=item.id,
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        expiry_date=item.expiry_date,
        days_remaining=days_remaining(item.expiry_date),
        status=pantry_status(item.expiry_date),
    )


@router.get("", response_model=list[PantryOut])
def list_pantry(
    search: str = Query(default=""),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    query = db.query(PantryItem).filter(PantryItem.user_id == user.id)
    if search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(PantryItem.name.ilike(like))
    items = query.order_by(PantryItem.expiry_date.asc(), PantryItem.name.asc()).all()
    return [to_out(item) for item in items]


@router.get("/alerts", response_model=list[PantryOut])
def expiry_alerts(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    items = (
        db.query(PantryItem)
        .filter(PantryItem.user_id == user.id)
        .order_by(PantryItem.expiry_date.asc())
        .all()
    )
    return [to_out(item) for item in items if pantry_status(item.expiry_date) != "ok"]


def _duplicate_name(db: DbSession, user_id: int, name: str, exclude_id: int | None = None) -> bool:
    query = db.query(PantryItem).filter(PantryItem.user_id == user_id)
    for item in query.all():
        if exclude_id is not None and item.id == exclude_id:
            continue
        if item.name.strip().lower() == name.strip().lower():
            return True
    return False


@router.post("", response_model=PantryOut, status_code=status.HTTP_201_CREATED)
def create_item(payload: PantryCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if _duplicate_name(db, user.id, payload.name):
        raise HTTPException(status_code=400, detail="This ingredient is already in your pantry.")
    item = PantryItem(
        user_id=user.id,
        name=payload.name.strip(),
        quantity=payload.quantity,
        unit=payload.unit,
        expiry_date=payload.expiry_date,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This ingredient is already in your pantry.")
    db.refresh(item)
    return to_out(item)


@router.put("/{item_id}", response_model=PantryOut)
def update_item(
    item_id: int,
    payload: PantryUpdate,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    item = db.query(PantryItem).filter(PantryItem.id == item_id, PantryItem.user_id == user.id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Pantry item not found.")
    if _duplicate_name(db, user.id, payload.name, exclude_id=item.id):
        raise HTTPException(status_code=400, detail="This ingredient is already in your pantry.")
    item.name = payload.name.strip()
    item.quantity = payload.quantity
    item.unit = payload.unit
    item.expiry_date = payload.expiry_date
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This ingredient is already in your pantry.")
    db.refresh(item)
    return to_out(item)


@router.delete("/{item_id}", response_model=MessageOut)
def delete_item(item_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    item = db.query(PantryItem).filter(PantryItem.id == item_id, PantryItem.user_id == user.id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Pantry item not found.")
    db.delete(item)
    db.commit()
    return MessageOut(message="Ingredient removed from pantry.")
