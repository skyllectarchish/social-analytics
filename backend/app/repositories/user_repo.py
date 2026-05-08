"""User repository — all ClickHouse operations for the users table."""

import logging
import uuid
from datetime import datetime, timezone

from clickhouse_connect.driver.client import Client

from ..models.queries import CHECK_EMAIL_EXISTS, GET_USER_BY_EMAIL, GET_USER_BY_ID
from ..models.user import User

logger = logging.getLogger(__name__)


def find_by_email(client: Client, email: str) -> User | None:
    """Fetch a user by email. Returns None if not found."""
    rows = client.query(GET_USER_BY_EMAIL, parameters={"email": email})
    if not rows.result_rows:
        return None
    return User.from_row(rows.result_rows[0])


def find_by_id(client: Client, user_id: str) -> User | None:
    """Fetch a user by UUID. Returns None if not found."""
    rows = client.query(GET_USER_BY_ID, parameters={"user_id": user_id})
    if not rows.result_rows:
        return None
    return User.from_id_row(rows.result_rows[0])


def email_exists(client: Client, email: str) -> bool:
    """Return True if a user with this email already exists."""
    rows = client.query(CHECK_EMAIL_EXISTS, parameters={"email": email})
    return bool(rows.result_rows)


def create(
    client: Client,
    email: str,
    username: str,
    hashed_password: str,
) -> User:
    """Insert a new user and return the created User model."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    client.insert(
        "users",
        [[user_id, email, username, hashed_password, 1, now, now]],
        column_names=[
            "id", "email", "username", "hashed_password",
            "is_active", "created_at", "updated_at",
        ],
    )

    logger.info("Created user %s (%s)", user_id, email)
    return User(
        id=uuid.UUID(user_id),
        email=email,
        username=username,
        hashed_password=hashed_password,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
