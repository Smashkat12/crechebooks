---
name: git-conventions
description: Conventional commits, branch naming, PR template, and the staging-first workflow for CrecheBooks releases.
when-to-use: Always for release-manager. Read at task start before any git operation.
---

# Git conventions

## Conventional commits (mandatory)

```
<type>(<scope>): <subject>

<body — wrapped at 72 chars, optional>
```

`<type>` ∈ `feat | fix | chore | refactor | docs | test | build | ci`

`<scope>` ∈ `billing | payments | banking | tax | sars | payroll | staff |
parents | dashboard | comms | notifications | platform | scheduler |
agents | integrations | prisma | web | cli | ci | release`

`<subject>` — imperative present tense, lowercase, ≤ 72 chars, no trailing period.

Bad:  `Updated payment matching logic.`
Good: `fix(payments): correct first-name match when child has no enrollment`

The `pnpm` workspace runs commit-message linting via husky. If the hook fails,
fix the message, don't `--no-verify`.

## Branch naming

`<type>/<scope>-<short-kebab-desc>`

Branch off `staging` for normal work. Branch off `main` only for production
hotfixes (rare; needs explicit authorisation in the brief).

Examples:
- `feat/payments-nickname-matching`
- `fix/billing-statement-pagination`
- `chore/prisma-migration-cleanup`

## PR template

PR title: same shape as a conventional commit subject.

PR body (use this skeleton via heredoc when calling `gh pr create --body`):

```
## Summary
- <1–3 bullets — the why>

## Changes
- <files / endpoints / contracts touched>

## Test plan
- [ ] <how to verify>

## Risk
- <none | low | medium | high> — <one sentence on blast radius>
```

If the repo has `.github/PULL_REQUEST_TEMPLATE.md`, `gh pr create` may pull
from it — verify the template exists and decide whether to override.

## Branch policy

- `staging` is the integration branch. PRs target `staging` by default.
- `main` is production. The path to prod is `staging` → `main` merge,
  batched.
- **Never** `git push --force` or `git push -f` to any branch.
- **Never** `git rebase -i` on shared branches (`main`, `staging`).
- **Never** `git config --global ...` — repo-local config only, and only
  with explicit auth.
- **Never** `--no-verify` to skip hooks. If a hook fails, surface the failure.
- **Never** sign with a GPG key the user didn't authorise (`-c
  commit.gpgsign=false` is also forbidden).

## Hotfix protocol (rare)

1. Branch off `main`: `git switch -c fix/<scope>-<desc> origin/main`.
2. Commit, push, open PR to `main`.
3. After merge: cherry-pick or back-merge the fix into `staging` so the two
   branches don't diverge.

## Co-author attribution

pi agents are tools, not authors. Do **not** add `Co-Authored-By:` lines for
pi agents. Attribution is to the human user who initiated the session — they
are the author.

## Forbidden default behaviour

- `git add -A` / `git add .` — always stage specific paths so you don't
  accidentally include `.env` files or build artefacts.
- `git push` to a new branch without `-u` — the upstream tracking matters
  for later operations.
- Opening a PR without a `Test plan` section — the template requires one.
