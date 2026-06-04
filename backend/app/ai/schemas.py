"""Pydantic schemas for the Tier 4 AI Copilot endpoints.

Field names mirror the frontend's TypeScript contracts in
`tier4-ai-layer-frontend-plan.md` §2 exactly. Do not drift — any
rename here requires a matching frontend change.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

# --- Weekly Digest -------------------------------------------------------

class DigestBulletLink(BaseModel):
    route: str
    query: dict[str, str] = Field(default_factory=dict)


class DigestBullet(BaseModel):
    kind: Literal["win", "warning", "trend", "experiment"]
    headline: str
    detail_md: str
    link: DigestBulletLink | None = None


class MetricsSnapshot(BaseModel):
    save_rate_pct_delta: float | None = None
    reach_pct_delta: float | None = None
    follows_delta: int | None = None
    posts_count: int = 0


class WeeklyDigestResponse(BaseModel):
    week_of: date
    generated_at: datetime
    status: Literal["ready", "stale", "generating", "not_enough_data"]
    cached: bool
    narrative_md: str
    bullets: list[DigestBullet] = Field(default_factory=list)
    metrics_snapshot: MetricsSnapshot = Field(default_factory=MetricsSnapshot)
    followups: list[str] = Field(default_factory=list)


class RegenerateDigestRequest(BaseModel):
    # Optional — blank means "current ISO week", matching the GET /weekly
    # and /stream endpoints. Lets the frontend POST an empty body when
    # the user clicks Regenerate without a specific week pinned.
    week_of: date | None = None


# --- Content Ideas -------------------------------------------------------

class IdeasSourcePost(BaseModel):
    ig_media_id: str
    permalink: str | None = None
    thumbnail_url: str | None = None
    caption_preview: str | None = None
    algorithm_score_pct: int = 0


class Idea(BaseModel):
    id: str
    title: str
    body_md: str
    suggested_format: Literal["REELS", "CAROUSEL", "IMAGE", "STORY"]
    rationale: str
    adjacent: bool = False


class ContentIdeasResponse(BaseModel):
    period_days: int
    generated_at: datetime
    source_posts: list[IdeasSourcePost] = Field(default_factory=list)
    themes_detected: list[str] = Field(default_factory=list)
    ideas: list[Idea] = Field(default_factory=list)


# --- Post Diagnostic -----------------------------------------------------

class DiagnoseRequest(BaseModel):
    ig_media_id: str


class BaselineMetrics(BaseModel):
    avg_reach: float = 0
    avg_engagement_rate_pct: float = 0
    avg_save_rate_pct: float = 0


class FactorEvidence(BaseModel):
    metric: str
    value: float
    comparison: str = ""


class DiagnosticFactor(BaseModel):
    key: Literal["format", "timing", "hashtags", "topic", "duration", "hook"]
    severity: Literal["high", "medium", "low", "neutral"]
    headline: str
    detail_md: str
    evidence: FactorEvidence


class DiagnosticResponse(BaseModel):
    ig_media_id: str
    baseline: BaselineMetrics
    observed: BaselineMetrics
    underperformed: bool
    verdict_md: str
    factors: list[DiagnosticFactor] = Field(default_factory=list)
    recommendations_md: str = ""


# --- Caption Studio ------------------------------------------------------

class CaptionSuggestRequest(BaseModel):
    draft: str = Field(min_length=1, max_length=4000)
    format: Literal["REELS", "CAROUSEL", "IMAGE", "STORY"] = "REELS"
    topic_hint: str | None = Field(default=None, max_length=200)


class CaptionScores(BaseModel):
    hook_strength: int = Field(ge=0, le=100)
    cta_presence: int = Field(ge=0, le=100)
    length_fit: int = Field(ge=0, le=100)
    overall: int = Field(ge=0, le=100)


class CaptionVariant(BaseModel):
    id: str
    label: str
    caption: str
    rationale: str


class CaptionSuggestResponse(BaseModel):
    draft: str
    scores: CaptionScores
    variants: list[CaptionVariant] = Field(default_factory=list)
    notes_md: str = ""


# --- Comment Reply Suggester ----------------------------------------------

class CommentReplySuggestRequest(BaseModel):
    ig_comment_id: str = Field(min_length=1, max_length=256)


class CommentReplySuggestion(BaseModel):
    id: str
    tone: Literal["friendly", "playful", "professional"]
    reply: str


class CommentReplySuggestResponse(BaseModel):
    ig_comment_id: str
    suggestions: list[CommentReplySuggestion] = Field(default_factory=list)


# --- Quota ---------------------------------------------------------------

class QuotaResponse(BaseModel):
    used: int
    limit: int
    resets_at: datetime


# --- Feedback ------------------------------------------------------------

class FeedbackRequest(BaseModel):
    feature: Literal["digest", "ideas", "diagnostic", "caption", "comment_reply"]
    ref_id: str = Field(min_length=1, max_length=256)
    rating: Literal["up", "down"]
    note: str | None = Field(default=None, max_length=2000)


# --- Telemetry -----------------------------------------------------------

class TelemetryEvent(BaseModel):
    ts: datetime
    feature: str = Field(max_length=64)
    action: str = Field(max_length=64)
    ref_id: str | None = Field(default=None, max_length=256)
    meta: dict | None = None
    latency_ms: int | None = Field(default=None, ge=0, le=600_000)


class TelemetryRequest(BaseModel):
    events: list[TelemetryEvent] = Field(min_length=1)
