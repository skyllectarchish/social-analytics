# Backend AI/Jobs/Repos — review findings

## Critical (fix first)
- **`backend/app/repositories/instagram_repo.py:413`** — `_is_schema_missing` referenced but never imported. `NameError` would fire whenever the `post_hashtags` insert raises.
- **`backend/app/models/queries.py:953-961` & `989-1004`** — `GET_AI_DIGEST` is defined TWICE; the second silently overrides the first. Looks like a merge artifact.
- **`backend/app/models/queries.py:299-315`** — `GET_ALGORITHM_METRICS_SUMMARY` reads `metric_name = 'saves'` / `'shares'` from `account_insights`, but those aren't account-level metrics in Meta's API. Returns zeros. Need to compute from `media_insights` aggregates.

## High
- **`backend/app/jobs/weekly_digest.py:118`** — checks `anthropic_api_key` but synthesis uses Ollama. Job refuses to run on Ollama-only deployments.
- **`backend/app/ai/ideas.py:287-296`** — `permalink`/`thumbnail_url` discarded; frontend cannot link to source posts.
- **`backend/app/ai/quota.py:57-63`** — race condition: concurrent requests can bypass the per-user monthly limit.
- **`backend/app/jobs/seed_demo_sentiment.py:254-259`** — `sample_comment_ids` for synthetic topics point to non-existent comments.
- **`backend/app/ai/client.py` / `digest.py`** — streaming path with no `done` frame records zero tokens → quota leak / cost masking.
- **`backend/app/ai/prompts.py`** — no defense against prompt injection in any of the four system prompts; user captions/drafts can hijack the model.

## Medium
- **`backend/app/ai/router.py:246`** — diagnose endpoint caches result; first call charges quota but cached re-reads are free for 5 min.
- **`backend/app/jobs/sentiment_batch.py` + `weekly_digest.py`** — mixed Anthropic / Ollama provider configuration is inconsistent across the codebase.
- **`backend/app/models/queries.py:776-786`** — `GET_COMMENTS_PENDING_SENTIMENT` not scoped per user; a single heavy user can starve others.
- **`backend/app/models/queries.py:1131-1144`** — `LIST_USERS_WITH_RECENT_ACTIVITY` uses `FINAL` inside a subquery that already `DISTINCT`s; expensive on large tables.
- **`backend/app/models/queries.py:1340-1356`** — diagnostic hashtag query O(N²) cross-join for heavy accounts.
- **`backend/app/repositories/safe_query.py:29-37`** — substring-based exception classification on free-text ClickHouse error messages is brittle across versions.
- **`backend/app/models/instagram_profile.py:39-40`** — `from_profile_row` sets `user_id=UUID(int=0)` sentinel because query doesn't select it; fragile if a caller reads it.

## Low / cleanup
- **`backend/app/repositories/instagram_repo.py:329`** — `datetime.fromisoformat(...).replace(tzinfo=None)` drops timezone, relies on ClickHouse server TZ being UTC.
- **`backend/app/models/queries.py:931`** — `SCAN_COMMENTS_FOR_BRANDED_HASHTAG` has no LIMIT.
- **`backend/app/models/queries.py:739`** — `GET_QUESTION_POSTS` doesn't filter by `ig_user_id` (safe today, fragile for multi-IG).
- **`backend/app/models/account_insight.py:14`** — `metric_value: int` annotation lies (stored as Decimal/Float).
- **`backend/app/repositories/user_repo.py:37-65`** — `create` returns constructed model without re-read.
