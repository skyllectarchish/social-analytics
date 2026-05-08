from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from ..database import get_client
from ..models.queries import GET_USER_BY_ID
from .service import decode_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    client = get_client()
    rows = client.query(GET_USER_BY_ID, parameters={"user_id": user_id})
    if not rows.result_rows:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    row = rows.result_rows[0]
    return {"id": str(row[0]), "email": row[1], "username": row[2], "is_active": bool(row[3])}
