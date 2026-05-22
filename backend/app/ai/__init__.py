"""Tier 4 — AI Copilot.

Feature module for the four AI-layer surfaces (weekly digest, content
ideas, post diagnostic, caption studio) plus the cross-cutting quota,
feedback, and telemetry endpoints.

Contracts match `tier4-ai-layer-frontend-plan.md` §2. Implementation
details in `tier4-ai-layer-backend-plan.md`.

Phase A scope (this commit):
  - schemas.py with Pydantic models for every endpoint
  - client.py — Anthropic SDK singleton + synthesize() helper
  - quota.py / feedback.py / telemetry.py — fully wired
  - router.py — quota / feedback / telemetry endpoints active;
    digest / ideas / diagnostic / caption return 501 until later phases
"""
