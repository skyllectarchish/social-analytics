# Plan 2 of 3 — Domain Models & Data Layer

> **Execution order**: Plan 1 ✅ → **Plan 2** → Plan 3. Requires Plan 1 complete (exceptions, constants, crypto exist).

This plan creates the **missing domain models**, introduces a **repository layer** (separating data access from business logic), fixes all **ClickHouse query issues**, and replaces the hand-rolled migration runner with proper `clickhouse-migrations` integration.

---

## Proposed Changes

### Component 1: Domain Model Classes

These are pure Python dataclasses representing database rows. They have no ORM behaviour — just typed data containers with `from_row()` factory methods that eliminate all positional tuple unpacking from router code.

---

#### [NEW] [user.py](file:///c:/laragon/www/social-analytics/backend/app/models/user.py)

```python
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
```

---

#### [NEW] [instagram_profile.py](file:///c:/laragon/www/social-analytics/backend/app/models/instagram_profile.py)

```python
"""Instagram profile domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class IGProfile:
    """Represents a row in the `instagram_profiles` table."""

    id: UUID
    user_id: UUID
    ig_user_id: str
    username: str
    name: str
    biography: str
    profile_picture_url: str
    followers_count: int
    follows_count: int
    media_count: int
    access_token: str  # encrypted ciphertext
    token_expires_at: datetime | None = None
    connected_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_profile_row(cls, row: tuple) -> IGProfile:
        """Construct from a GET_INSTAGRAM_PROFILE result row.

        Expected column order:
            id, ig_user_id, username, name, biography,
            profile_picture_url, followers_count, follows_count,
            media_count, connected_at
        """
        return cls(
            id=row[0] if isinstance(row[0], UUID) else UUID(str(row[0])),
            user_id=UUID(int=0),  # not in this query
            ig_user_id=row[1],
            username=row[2],
            name=row[3],
            biography=row[4],
            profile_picture_url=row[5],
            followers_count=row[6],
            follows_count=row[7],
            media_count=row[8],
            access_token="",  # not in this query
            connected_at=row[9] if len(row) > 9 else None,
        )

    @classmethod
    def from_token_row(cls, row: tuple) -> IGProfile:
        """Construct from a GET_INSTAGRAM_TOKEN result row.

        Expected column order: ig_user_id, access_token, token_expires_at
        """
        return cls(
            id=UUID(int=0),
            user_id=UUID(int=0),
            ig_user_id=row[0],
            username="",
            name="",
            biography="",
            profile_picture_url="",
            followers_count=0,
            follows_count=0,
            media_count=0,
            access_token=row[1],
            token_expires_at=row[2] if len(row) > 2 else None,
        )

    def to_schema_dict(self) -> dict:
        """Return a dict suitable for InstagramProfile schema."""
        return {
            "id": str(self.id),
            "ig_user_id": self.ig_user_id,
            "username": self.username,
            "name": self.name,
            "biography": self.biography,
            "profile_picture_url": self.profile_picture_url,
            "followers_count": self.followers_count,
            "follows_count": self.follows_count,
            "media_count": self.media_count,
            "connected_at": str(self.connected_at) if self.connected_at else "",
        }
```

---

#### [NEW] [instagram_media.py](file:///c:/laragon/www/social-analytics/backend/app/models/instagram_media.py)

```python
"""Instagram media domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class IGMedia:
    """Represents a row in the `instagram_media` table."""

    ig_media_id: str
    media_type: str
    media_url: str
    thumbnail_url: str
    permalink: str
    caption: str
    timestamp: datetime
    like_count: int
    comments_count: int

    @classmethod
    def from_row(cls, row: tuple) -> IGMedia:
        """Construct from a GET_INSTAGRAM_MEDIA_PAGE result row.

        Expected column order:
            ig_media_id, media_type, media_url, thumbnail_url,
            permalink, caption, timestamp, like_count, comments_count
        """
        return cls(
            ig_media_id=row[0],
            media_type=row[1],
            media_url=row[2],
            thumbnail_url=row[3],
            permalink=row[4],
            caption=row[5],
            timestamp=row[6],
            like_count=row[7],
            comments_count=row[8],
        )

    def to_schema_dict(self) -> dict:
        """Return a dict suitable for InstagramMedia schema."""
        return {
            "ig_media_id": self.ig_media_id,
            "media_type": self.media_type,
            "media_url": self.media_url,
            "thumbnail_url": self.thumbnail_url,
            "permalink": self.permalink,
            "caption": self.caption,
            "timestamp": str(self.timestamp),
            "like_count": self.like_count,
            "comments_count": self.comments_count,
        }
```

---

#### [MODIFY] [models/\_\_init\_\_.py](file:///c:/laragon/www/social-analytics/backend/app/models/__init__.py)

```python
"""Domain models package."""

from .instagram_media import IGMedia
from .instagram_profile import IGProfile
from .user import User

__all__ = ["User", "IGProfile", "IGMedia"]
```

---

### Component 2: Fix SQL Queries

#### [MODIFY] [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py)

Fix two critical issues:
1. Add `FINAL` to all `ReplacingMergeTree` queries (guarantees deduplication at query time)
2. Use `{user_id:UUID}` instead of `{user_id:String}` for UUID columns (enables index usage)

```python
"""Raw SQL queries for ClickHouse.

All queries against ReplacingMergeTree tables use the FINAL keyword
to guarantee deduplication at read time.

Parameter types use ClickHouse native types (UUID, String, UInt32)
to enable proper index usage.
"""

# --- Users ---

GET_USER_BY_EMAIL = """
SELECT id, email, username, hashed_password, is_active
FROM users FINAL
WHERE email = {email:String}
LIMIT 1
"""

GET_USER_BY_ID = """
SELECT id, email, username, is_active
FROM users FINAL
WHERE id = {user_id:UUID}
LIMIT 1
"""

CHECK_EMAIL_EXISTS = """
SELECT id FROM users FINAL
WHERE email = {email:String}
LIMIT 1
"""

# --- Instagram Profiles ---

GET_INSTAGRAM_PROFILE = """
SELECT id, ig_user_id, username, name, biography, profile_picture_url,
       followers_count, follows_count, media_count, connected_at
FROM instagram_profiles FINAL
WHERE user_id = {user_id:UUID}
ORDER BY updated_at DESC
LIMIT 1
"""

GET_INSTAGRAM_TOKEN = """
SELECT ig_user_id, access_token, token_expires_at
FROM instagram_profiles FINAL
WHERE user_id = {user_id:UUID}
ORDER BY updated_at DESC
LIMIT 1
"""

# --- Instagram Media ---

COUNT_INSTAGRAM_MEDIA = """
SELECT count()
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
"""

GET_INSTAGRAM_MEDIA_PAGE = """
SELECT ig_media_id, media_type, media_url, thumbnail_url, permalink,
       caption, timestamp, like_count, comments_count
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
ORDER BY timestamp DESC
LIMIT {limit:UInt32} OFFSET {offset:UInt32}
"""
```

---

### Component 3: Repository Layer

Create repository modules that encapsulate all ClickHouse read/write operations. Routers and services should **never** call `client.query()` or `client.insert()` directly.

---

#### [NEW] [repositories/\_\_init\_\_.py](file:///c:/laragon/www/social-analytics/backend/app/repositories/__init__.py)

```python
"""Repository layer — encapsulates all ClickHouse data access."""

__all__ = ["user_repo", "instagram_repo"]
```

---

#### [NEW] [repositories/user_repo.py](file:///c:/laragon/www/social-analytics/backend/app/repositories/user_repo.py)

```python
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
```

---

#### [NEW] [repositories/instagram_repo.py](file:///c:/laragon/www/social-analytics/backend/app/repositories/instagram_repo.py)

```python
"""Instagram repository — all ClickHouse operations for instagram_profiles and instagram_media."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.instagram_media import IGMedia
from ..models.instagram_profile import IGProfile
from ..models.queries import (
    COUNT_INSTAGRAM_MEDIA,
    GET_INSTAGRAM_MEDIA_PAGE,
    GET_INSTAGRAM_PROFILE,
    GET_INSTAGRAM_TOKEN,
)

logger = logging.getLogger(__name__)


# --- Profiles ---

def find_profile(client: Client, user_id: str) -> IGProfile | None:
    """Fetch the latest Instagram profile for a user. Returns None if not connected."""
    rows = client.query(GET_INSTAGRAM_PROFILE, parameters={"user_id": user_id})
    if not rows.result_rows:
        return None
    return IGProfile.from_profile_row(rows.result_rows[0])


def find_token(client: Client, user_id: str) -> IGProfile | None:
    """Fetch the Instagram token data for a user. Returns None if not connected."""
    rows = client.query(GET_INSTAGRAM_TOKEN, parameters={"user_id": user_id})
    if not rows.result_rows:
        return None
    return IGProfile.from_token_row(rows.result_rows[0])


def upsert_profile(
    client: Client,
    user_id: str,
    ig_user_id: str,
    profile_data: dict[str, Any],
    encrypted_token: str,
    token_expires_at: datetime,
) -> None:
    """Insert or update an Instagram profile.

    Uses ReplacingMergeTree deduplication on (user_id, ig_user_id).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    client.insert(
        "instagram_profiles",
        [[
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            profile_data.get("username", ""),
            profile_data.get("name", ""),
            profile_data.get("biography", ""),
            profile_data.get("profile_picture_url", ""),
            profile_data.get("followers_count", 0),
            profile_data.get("follows_count", 0),
            profile_data.get("media_count", 0),
            encrypted_token,
            token_expires_at,
            now,
            now,
        ]],
        column_names=[
            "id", "user_id", "ig_user_id", "username", "name", "biography",
            "profile_picture_url", "followers_count", "follows_count", "media_count",
            "access_token", "token_expires_at", "connected_at", "updated_at",
        ],
    )
    logger.info("Upserted Instagram profile for user %s (ig: %s)", user_id, ig_user_id)


# --- Media ---

def count_media(client: Client, user_id: str) -> int:
    """Return the total number of media items for a user."""
    rows = client.query(COUNT_INSTAGRAM_MEDIA, parameters={"user_id": user_id})
    return rows.result_rows[0][0] if rows.result_rows else 0


def find_media_page(
    client: Client,
    user_id: str,
    limit: int,
    offset: int,
) -> list[IGMedia]:
    """Fetch a page of media items for a user, ordered by timestamp DESC."""
    rows = client.query(
        GET_INSTAGRAM_MEDIA_PAGE,
        parameters={"user_id": user_id, "limit": limit, "offset": offset},
    )
    return [IGMedia.from_row(r) for r in rows.result_rows]


def bulk_insert_media(
    client: Client,
    user_id: str,
    ig_user_id: str,
    media_list: list[dict[str, Any]],
) -> None:
    """Batch-insert media items into instagram_media."""
    if not media_list:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = []

    for item in media_list:
        ts_str = item.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            ts = now

        rows.append([
            str(uuid.uuid4()),
            item.get("id", ""),
            ig_user_id,
            user_id,
            item.get("media_type", "IMAGE"),
            item.get("media_url", ""),
            item.get("thumbnail_url", ""),
            item.get("permalink", ""),
            item.get("caption", ""),
            ts,
            item.get("like_count", 0),
            item.get("comments_count", 0),
            now,
        ])

    client.insert(
        "instagram_media",
        rows,
        column_names=[
            "id", "ig_media_id", "ig_user_id", "user_id", "media_type",
            "media_url", "thumbnail_url", "permalink", "caption",
            "timestamp", "like_count", "comments_count", "fetched_at",
        ],
    )
    logger.info("Inserted %d media items for user %s", len(rows), user_id)
```

---

### Component 4: Migration System Upgrade

#### [MODIFY] [run_migrations.py](file:///c:/laragon/www/social-analytics/backend/run_migrations.py)

Replace the hand-rolled script with one that uses `clickhouse-migrations`. If you prefer keeping the manual approach, at minimum add migration tracking:

**Option A — Use `clickhouse-migrations` (recommended, aligns with plan):**

```python
"""Run migrations using clickhouse-migrations library."""

import os
import sys

from clickhouse_migrations.clickhouse_cluster import ClickhouseCluster
from dotenv import load_dotenv

load_dotenv()

cluster = ClickhouseCluster(
    db_host=os.environ["CLICKHOUSE_HOST"],
    db_port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
    db_user=os.environ["CLICKHOUSE_USER"],
    db_password=os.environ["CLICKHOUSE_PASSWORD"],
    db_name=os.environ.get("CLICKHOUSE_DATABASE", "social_analytics"),
    cluster_name=None,  # None for single-node / ClickHouse Cloud
)

migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

try:
    cluster.migrate(
        migrations_dir,
        cluster_name=None,
        multi_statement=True,
    )
    print("All migrations applied successfully.")
except Exception as e:
    print(f"Migration failed: {e}", file=sys.stderr)
    sys.exit(1)
```

> [!IMPORTANT]
> The `clickhouse-migrations` library automatically creates a `_migrations` tracking table in your database. This means re-running the script is safe — already-applied migrations are skipped. Check the library docs for exact API if the above fails — the API may differ slightly between versions. Run `pip show clickhouse-migrations` to verify the installed version and check its README.

**Option B — If `clickhouse-migrations` API doesn't match, add manual tracking:**

```python
"""Run SQL migrations against ClickHouse with tracking."""

import os
import sys

import clickhouse_connect
from dotenv import load_dotenv

load_dotenv()

client = clickhouse_connect.get_client(
    host=os.environ["CLICKHOUSE_HOST"],
    port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
    username=os.environ["CLICKHOUSE_USER"],
    password=os.environ["CLICKHOUSE_PASSWORD"],
    database=os.environ.get("CLICKHOUSE_DATABASE", "social_analytics"),
    secure=True,
)

# Ensure tracking table exists
client.command("""
    CREATE TABLE IF NOT EXISTS _migrations_applied (
        name String,
        applied_at DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (name)
""")

# Get already-applied migrations
applied = {
    row[0]
    for row in client.query("SELECT name FROM _migrations_applied").result_rows
}

migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))

for fname in files:
    if fname in applied:
        print(f"Skipping {fname} (already applied)")
        continue

    path = os.path.join(migrations_dir, fname)
    with open(path, encoding="utf-8") as f:
        sql = f.read().strip()

    print(f"Running {fname}...")
    for statement in sql.split(";"):
        stmt = statement.strip()
        if stmt:
            client.command(stmt)

    client.insert(
        "_migrations_applied",
        [[fname]],
        column_names=["name"],
    )
    print(f"  OK")

print("All migrations applied.")
```

---

## Files Changed Summary

| File | Action | What |
|---|---|---|
| `app/models/user.py` | NEW | `User` dataclass with `from_row()`, `from_id_row()`, `to_response_dict()` |
| `app/models/instagram_profile.py` | NEW | `IGProfile` dataclass with `from_profile_row()`, `from_token_row()`, `to_schema_dict()` |
| `app/models/instagram_media.py` | NEW | `IGMedia` dataclass with `from_row()`, `to_schema_dict()` |
| `app/models/__init__.py` | MODIFY | Export all model classes, add `__all__` |
| `app/models/queries.py` | MODIFY | Add `FINAL` keyword, fix UUID parameter types |
| `app/repositories/__init__.py` | NEW | Repository package init |
| `app/repositories/user_repo.py` | NEW | User CRUD operations |
| `app/repositories/instagram_repo.py` | NEW | Instagram profile + media CRUD operations |
| `run_migrations.py` | MODIFY | Use `clickhouse-migrations` or add tracking table |

> [!IMPORTANT]
> **After completing Plan 2**, proceed to **Plan 3** (Service Layer & API Hardening).
