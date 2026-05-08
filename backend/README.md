# Social Analytics Backend

FastAPI backend for the Social Analytics application. It handles user authentication, Instagram Graph API integration, and ClickHouse database interactions.

## Architecture

The backend follows a layered architecture to separate concerns:

- **Routers** (`app/auth/router.py`, `app/instagram/router.py`): Handle HTTP requests, input validation (via Pydantic schemas), and HTTP responses.
- **Services** (`app/auth/service.py`, `app/instagram/service.py`): Contain business logic and external API calls (e.g., Meta/Instagram API). **No database operations occur here.**
- **Repositories** (`app/repositories/`): Encapsulate all database operations. Services and routers call these instead of executing raw SQL directly.
- **Domain Models** (`app/models/`): Pure Python dataclasses representing database rows. They provide `from_row()` methods to safely construct objects from ClickHouse query results.

## Setup Instructions

### 1. Prerequisites

- Python 3.10+
- A ClickHouse Cloud instance (or local ClickHouse server)
- A Meta (Facebook) Developer App with Instagram Basic Display and Graph API enabled.

### 2. Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### 3. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and configure the following required variables:

   **ClickHouse Credentials:**
   - `CLICKHOUSE_HOST`: Your ClickHouse host (e.g., `xxxx.clickhouse.cloud`)
   - `CLICKHOUSE_PORT`: `8443` — the **HTTPS port** used by the FastAPI app (`clickhouse-connect`)
   - `CLICKHOUSE_NATIVE_PORT`: `9440` — the **secure native TCP port** used by `run_migrations.py` (`clickhouse-migrations`). These are two different protocols; both ports must be open on your ClickHouse Cloud instance (they are by default).
   - `CLICKHOUSE_USER`: Your ClickHouse user (e.g., `default` or an API key ID)
   - `CLICKHOUSE_PASSWORD`: Your ClickHouse password or API key secret
   - `CLICKHOUSE_DATABASE`: The database name (default: `social_analytics`)

   **Security:**
   - `JWT_SECRET_KEY`: A highly secure random string used to sign JWTs and encrypt access tokens. **Do not use the placeholder.**
     - *Generate one via terminal:* `python -c "import secrets; print(secrets.token_urlsafe(48))"`

   **Meta / Instagram OAuth:**
   - `META_APP_ID`: Your Meta Developer App ID.
   - `META_APP_SECRET`: Your Meta Developer App Secret.
   - `META_REDIRECT_URI`: The URL the user is redirected to after OAuth consent (must match what is configured in your Meta App dashboard, e.g., `http://localhost:5173/callback`).

### 4. Database Migrations

Before running the app, you must create the database schema in ClickHouse.

```bash
python run_migrations.py
```

This script will apply all SQL files located in the `migrations/` directory and track applied migrations using the `clickhouse-migrations` library.

### 5. Running the Development Server

Start the FastAPI development server:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.
You can view the interactive API documentation at `http://localhost:8000/docs`.

---

## Managing Database Migrations

We use the [`clickhouse-migrations`](https://github.com/VVVi/clickhouse-migrations) library to manage all schema changes. It automatically tracks which migrations have been applied in a `_migrations` table inside your database, so **you never need to manually track or apply anything**.

### How it works

- All migration files live in the `migrations/` directory and are named with a sequential numeric prefix (e.g., `001_create_users.sql`, `002_create_profiles.sql`).
- When you run `python run_migrations.py`, the library checks which files have already been applied and **only runs the new ones**.
- Re-running the script is always safe — already-applied migrations are skipped automatically.

### Running Migrations

```bash
python run_migrations.py
```

Run this command whenever you add new migration files, or after first cloning the project to create the initial schema.

---

### How to Add a New Column

1. Create a new file in `migrations/` with the next sequential number, e.g., `004_add_user_avatar.sql`:
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url String DEFAULT '';
   ```
2. Update the corresponding Python domain model (`app/models/user.py`) to add the new field.
3. Update the SQL queries in `app/models/queries.py` to `SELECT` or `INSERT` the new column. Make sure the column order matches what the model's `from_row()` method expects.
4. Run migrations:
   ```bash
   python run_migrations.py
   ```

---

### How to Delete a Column

1. Create a new file, e.g., `005_drop_user_avatar.sql`:
   ```sql
   ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
   ```
2. Remove the field from the Python domain model and queries.
3. Run migrations:
   ```bash
   python run_migrations.py
   ```

---

### How to Rename a Column

1. Create a new file, e.g., `006_rename_avatar.sql`:
   ```sql
   ALTER TABLE users RENAME COLUMN IF EXISTS avatar_url TO profile_picture_url;
   ```
2. Update the field name in the Python domain model and queries.
3. Run migrations:
   ```bash
   python run_migrations.py
   ```

---

> **Important:** Never edit or delete an existing migration file that has already been applied. The library tracks migrations by filename — changing a file's contents after it has been applied will cause it to be re-run on the next migration, which can corrupt your schema. Always create a **new** migration file for every change.

> **Note on ClickHouse type changes:** Changing a column's data type (`MODIFY COLUMN`) can be slow on large tables since ClickHouse may need to rewrite data on disk. For analytics databases it is often better to add a new column, backfill it, and drop the old one across separate migrations.
