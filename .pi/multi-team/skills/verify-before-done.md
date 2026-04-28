---
name: verify-before-done
description: The verification commands every engineer runs before reporting Done — defines per-domain command and required output format.
when-to-use: Always — every *-engineer and schema-guardian runs verification and includes the Verify block in their Report. No exceptions.
---

# Verify before done

You don't get to claim **Done:** until you've run verification and pasted its
results in your Report. Lying about verification — or skipping it because
"the change was small" — is worse than reporting `Blocked: tests failed`.

The Engineering and Validation leads will refuse a Report that lacks a
`Verify:` block. Don't waste a turn.

## Per-engineer command set

| Agent | Lint | Typecheck / Build | Tests |
|---|---|---|---|
| billing-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| payments-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| banking-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| tax-payroll-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| people-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| comms-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| platform-engineer | `pnpm --filter api lint` | `pnpm --filter api build` | `pnpm --filter api test <pattern>` |
| frontend-engineer | `pnpm --filter web lint` | `pnpm --filter web typecheck` | colocated tests if any |
| schema-guardian | `pnpm --filter api prisma:generate && pnpm --filter api build` | (build is the typecheck) | n/a |

`<pattern>` = the spec file path(s) for the code you actually touched. Don't run
the full repo test suite — targeted is the contract. The full suite is
qa-engineer's territory.

## Required Report block

Every engineer Report **must** include this block, in this shape, before
`Done:`:

```
Verify:
  - lint:        PASS  (0 errors, 0 new warnings)
  - typecheck:   PASS  (0 errors)
  - tests:       PASS  (12 passed, 0 failed)  pattern: payment-matching*.spec.ts
```

Status values:
- `PASS` — exit code 0, no new errors/warnings beyond pre-existing baseline
- `FAIL` — exit code non-zero. Goes to `Blocked:`, not `Done:`.
- `SKIPPED` — only when genuinely not applicable (e.g. tests for a
  schema-only change, or no spec exists for a tiny doc fix). Justify in one
  short clause.

## Discipline

- If lint/typecheck/test fail, you do **not** report Done. You fix or escalate.
- Never `--no-verify`. Never silence a test. Never bypass type errors with
  `as any` or `// @ts-ignore` to make verification pass.
- Pre-existing baseline failures are not yours to fix unless the brief asked.
  Note them in `Observed:` and don't claim they're new.

## What's not your job

- Running the full repo test matrix — qa-engineer's lane (Validation team).
- E2E tests — qa-engineer.
- Security scans — security-reviewer.
- Schema-drift checks — schema-guardian.
