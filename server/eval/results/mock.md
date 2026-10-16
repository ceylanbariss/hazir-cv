# Eval — mock / mock

2026-10-16T12:53:21.149Z · 8 cases × 1 run(s) · 0 unexpected error(s)

| Metric | Value |
|---|---|
| check: extractionRecall | 1 |
| check: noUnsupportedAfterFix | 1 |
| check: noEntityIssues | 1 |
| check: noFalseMatches | 1 |
| check: noForbiddenOutput | 1 |
| check: expectedError | 1 |
| fit ranking monotonic (high > medium > low) | true ({"high":93.667,"medium":43,"low":37}) |
| grounded ratio (mean, before auto-fix) | 0.764 |
| unsupported claims / run (caught) | 1 |
| auto-fixes / run | 1 |
| evidence quotes verified | 0.964 |
| schema repairs / run | 0 |
| max score spread across repeats | n/a (repeat=1) |
| latency p50 / p95 | 23 / 59 ms |
| cost / run (mean), total | $0 , $0 |

## Per case
| case | fit | score | grounded | unsupported→fixed | latency | failed checks |
|---|---|---|---|---|---|---|
| tr_frontend_fit | high | 96 | 0.857 | 1→1 | 59ms | — |
| tr_frontend_mismatch | low | 24 | 0.6 | 1→1 | 23ms | — |
| tr_ba_partial | medium | 45 | 0.778 | 1→1 | 24ms | — |
| en_backend_fit | high | 85 | 0.875 | 1→1 | 25ms | — |
| en_data_partial | medium | 41 | 0.667 | 1→1 | 15ms | — |
| tr_prompt_injection | low | 50 | 0.714 | 1→1 | 18ms | — |
| en_ml_fit | high | 100 | 0.857 | 1→1 | 22ms | — |
| not_a_cv_invoice | - | NOT_A_CV | - | - | 6ms | — |
