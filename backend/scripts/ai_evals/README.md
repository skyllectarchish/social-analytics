# AI eval cases

One folder per feature. Each `.json` file is one case.

```
ai_evals/
  digest/
    creator-with-7-posts.json
    creator-with-empty-week.json
  ideas/
    food-creator-90d.json
  diagnostic/
    flopped-carousel.json
    outperformed-reel.json
  caption/
    weak-cta-draft.json
```

Case shape:

```json
{
  "name": "creator-with-7-posts",
  "inputs": { ... whatever the per-feature service loader takes ... },
  "golden": { ... structured fields expected in the output ... }
}
```

`scripts/eval_ai.py --feature digest` runs all digest cases. Markdown
text is **not** diffed — only structured fields (`bullets[].kind`,
`factors[].severity`, `scores.*`, etc.). See plan §14.1.

Phase A ships the harness with zero cases — populate as each feature
phase lands.
