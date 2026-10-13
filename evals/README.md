# Evals

One case per pack: `source.md` is the text a model is given; the gold map is the pack's example, drawn by hand
from the same facts.

| Case | Pack | Gold |
|---|---|---|
| `process-onboarding` | process | `examples/onboarding-proceso.json` |
| `business-growth` | business | `examples/business/hr-saas-growth.json` |
| `concept-leverage` | concept | `examples/concept/meadows-leverage.json` |

Generate a map from the source following `skills/graphx/references/paquetes.md`, then score it:

    node tools/eval.mjs candidate.json <gold>

A map passes at node precision ≥ 0.8 with no pack warnings left in `graphx-build.mjs --check`. Precision is
reported apart from recall because models tend to over generate. Three cases is a smoke test, not a benchmark.

## First run (Sonnet, blind to the gold)

| Case | Nodes P / R | Edges P / R | Notes |
|---|---|---|---|
| business-growth | 1.00 / 1.00 | 1.00 / 1.00 | every kind right |
| concept-leverage | 0.54 / 0.88 | 0.33 / 0.57 | split compound phrases, made a node per listed example; the guide now says not to |
| process-onboarding | 0.63 / 0.63 | 0.23 / 0.33 | drew artifacts and flat steps where the gold nests steps under named stages; the guide now says how |

Matching is lexical (five letter stems, Jaccard ≥ 0.5), so a paraphrase can still count as a miss.
