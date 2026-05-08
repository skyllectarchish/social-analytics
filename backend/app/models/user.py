"""User domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class User:
    """Represents a row in the `users` table."""

    id: UUID
    email: str
    username: str
    hashed_password: str
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_row(cls, row: tuple) -> User:
        """Construct a User from a ClickHouse result row.

        Expected column order: id, email, username, hashed_password, is_active
        (created_at and updated_at are optional — only present in full-row queries).
        """
        return cls(
            id=row[0] if isinstance(row[0], UUID) else UUID(str(row[0])),
            email=row[1],
            username=row[2],
            hashed_password=row[3],
            is_active=bool(row[4]),
            created_at=row[5] if len(row) > 5 else None,
            updated_at=row[6] if len(row) > 6 else None,
        )

    @classmethod
    def from_id_row(cls, row: tuple) -> User:
        """Construct a User from a GET_USER_BY_ID result row.

        Expected column order: id, email, username, is_active
        (no hashed_password — used for profile responses).
        """
        return cls(
            id=row[0] if isinstance(row[0], UUID) else UUID(str(row[0])),
            email=row[1],
            username=row[2],
            hashed_password="",  # not selected
            is_active=bool(row[3]),
        )

    def to_response_dict(self) -> dict:
        """Return a dict suitable for UserResponse schema."""
        return {
            "id": str(self.id),
            "email": self.email,
            "username": self.username,
            "is_active": self.is_active,
        }
