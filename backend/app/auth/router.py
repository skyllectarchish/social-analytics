import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..database import get_client
from ..models.queries import CHECK_EMAIL_EXISTS, GET_USER_BY_EMAIL
from .dependencies import get_current_user
from .schemas import TokenResponse, UserLogin, UserRegister, UserResponse
from .service import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister):
    client = get_client()

    existing = client.query(CHECK_EMAIL_EXISTS, parameters={"email": body.email})
    if existing.result_rows:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    client.insert(
        "users",
        [[user_id, body.email, body.username, hash_password(body.password), 1, now, now]],
        column_names=["id", "email", "username", "hashed_password", "is_active", "created_at", "updated_at"],
    )

    token = create_access_token({"sub": user_id})
    user = UserResponse(id=user_id, email=body.email, username=body.username, is_active=True)
    return TokenResponse(access_token=token, user=user)


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    client = get_client()

    rows = client.query(GET_USER_BY_EMAIL, parameters={"email": body.email})
    if not rows.result_rows:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    row = rows.result_rows[0]
    user_id, email, username, hashed_pw, is_active = str(row[0]), row[1], row[2], row[3], bool(row[4])

    if not verify_password(body.password, hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": user_id})
    user = UserResponse(id=user_id, email=email, username=username, is_active=is_active)
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserResponse)
def me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)
