from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..deps import bearer, get_current_user
from ..models import Session, User
from ..schemas import LoginRequest, LoginResponse, MessageOut, UserOut
from ..security import MAX_FAILED_ATTEMPTS, lock_until, new_token, utcnow, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: DbSession = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if user and user.locked_until and user.locked_until > utcnow():
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account locked for 15 minutes after 5 failed login attempts.",
        )

    if user is None or not verify_password(payload.password, user.password_hash):
        if user:
            user.failed_attempts += 1
            if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
                user.locked_until = lock_until()
                user.failed_attempts = 0
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail="Account locked for 15 minutes after 5 failed login attempts.",
                )
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    user.failed_attempts = 0
    user.locked_until = None
    token = new_token()
    db.add(Session(token=token, user_id=user.id, last_activity=utcnow()))
    db.commit()
    return LoginResponse(token=token, user=UserOut.model_validate(user), message="Signed in successfully.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout", response_model=MessageOut)
def logout(
    user: User = Depends(get_current_user),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: DbSession = Depends(get_db),
):
    if creds:
        session = db.query(Session).filter(Session.token == creds.credentials, Session.user_id == user.id).first()
        if session:
            db.delete(session)
            db.commit()
    return MessageOut(message="Signed out successfully.")
