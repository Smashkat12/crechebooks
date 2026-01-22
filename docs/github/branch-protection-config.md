# Branch Protection Configuration

## Overview

This document outlines the branch protection rules configured for the Crechebooks repository. These rules enforce code quality, review processes, and prevent accidental destructive operations.

## Current Status

⚠️ **Note**: Branch protection rules require either:
- GitHub Pro subscription for private repositories
- Repository must be public

**Current repository status**: Private repository on free plan

The configurations below are ready to be applied when the repository is upgraded to GitHub Pro or made public.

## Main Branch Protection

The `main` branch is the production branch and has the strictest protection rules.

### Configuration Summary

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": []
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismissal_restrictions": {},
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false,
    "bypass_pull_request_allowances": {}
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

### Protection Rules

| Rule | Setting | Description |
|------|---------|-------------|
| **Pull Request Reviews** | Required | At least 1 approval needed |
| **Dismiss Stale Reviews** | Enabled | Reviews dismissed when new commits pushed |
| **Status Checks** | Required | All status checks must pass |
| **Require Branches Up to Date** | Enabled | Branch must be up to date before merging |
| **Enforce for Admins** | Enabled | Rules apply to administrators too |
| **Force Pushes** | Disabled | Cannot force push to main |
| **Branch Deletion** | Disabled | Cannot delete main branch |
| **Conversation Resolution** | Required | All review conversations must be resolved |

### Apply Configuration

When ready to apply (requires GitHub Pro or public repo):

```bash
gh api repos/Smashkat12/crechebooks/branches/main/protection \
  -X PUT \
  --input docs/github/main-protection.json
```

## Dev Branch Protection

The `dev` branch is the integration branch with moderate protection rules.

### Configuration Summary

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": []
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

### Protection Rules

| Rule | Setting | Description |
|------|---------|-------------|
| **Pull Request Reviews** | Not Required | Reviews encouraged but not enforced |
| **Status Checks** | Required | All status checks must pass |
| **Require Branches Up to Date** | Enabled | Branch must be up to date before merging |
| **Enforce for Admins** | Disabled | Admins can bypass rules if needed |
| **Force Pushes** | Disabled | Cannot force push to dev |
| **Branch Deletion** | Disabled | Cannot delete dev branch |

### Apply Configuration

When ready to apply (requires GitHub Pro or public repo):

```bash
gh api repos/Smashkat12/crechebooks/branches/dev/protection \
  -X PUT \
  --input docs/github/dev-protection.json
```

## Feature Branches

Feature branches do not have protection rules and can be:
- Created freely from `dev`
- Force pushed (for rebasing during development)
- Deleted after merging

## Status Checks (Future)

When CI/CD is configured, the following status checks should be added:

### Main Branch
- ✅ Build passes
- ✅ All tests pass (unit, integration, e2e)
- ✅ Code quality checks pass (lint, format)
- ✅ Security scan passes
- ✅ Type checking passes

### Dev Branch
- ✅ Build passes
- ✅ Unit tests pass
- ✅ Code quality checks pass

## Applying Protection Rules

### Prerequisites

1. **For Private Repositories**: Upgrade to GitHub Pro
   - Go to repository Settings → Billing
   - Upgrade to GitHub Pro ($4/month per user)

2. **For Public Repositories**: Make repository public
   - Go to repository Settings → Danger Zone
   - Change repository visibility to Public

### Manual Application via GitHub UI

1. Navigate to repository Settings
2. Click "Branches" in left sidebar
3. Click "Add branch protection rule"
4. Configure rules as documented above

### Automated Application via GitHub CLI

The JSON configuration files are stored in this directory:
- `main-protection.json` - Main branch protection rules
- `dev-protection.json` - Dev branch protection rules

Apply using GitHub CLI:

```bash
# Apply main branch protection
gh api repos/Smashkat12/crechebooks/branches/main/protection \
  -X PUT \
  --input docs/github/main-protection.json

# Apply dev branch protection
gh api repos/Smashkat12/crechebooks/branches/dev/protection \
  -X PUT \
  --input docs/github/dev-protection.json
```

### Verification

Verify protection rules are applied:

```bash
# Check main branch protection
gh api repos/Smashkat12/crechebooks/branches/main/protection | jq

# Check dev branch protection
gh api repos/Smashkat12/crechebooks/branches/dev/protection | jq
```

## Workflow Integration

These protection rules enforce the branching strategy:

```
feature/* → dev → release/* → main
    ↓        ↓         ↓        ↓
  Minimal   Moderate   High   Strict
```

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature
   ```

2. **Develop & Commit**
   ```bash
   # Make changes
   git add .
   git commit -m "feat: your feature"
   ```

3. **Push & Create PR to Dev**
   ```bash
   git push origin feature/your-feature
   gh pr create --base dev --title "feat: your feature"
   ```

4. **Dev → Main (via Release Branch)**
   ```bash
   # Create release branch
   git checkout dev
   git pull origin dev
   git checkout -b release/v1.0.0

   # After testing, create PR to main
   gh pr create --base main --title "release: v1.0.0"
   # Requires 1 approval before merge
   ```

## Maintenance

### Updating Protection Rules

1. Update the JSON configuration files in `docs/github/`
2. Apply changes using GitHub CLI commands above
3. Document changes in this file

### Adding Status Checks

When CI/CD workflows are added:

```bash
# Update main branch with required status checks
gh api repos/Smashkat12/crechebooks/branches/main/protection \
  -X PUT \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]=build \
  -f required_status_checks[contexts][]=test \
  -f required_status_checks[contexts][]=lint
```

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub CLI API Reference](https://cli.github.com/manual/gh_api)
- [Branching Strategy Document](../branching-strategy.md)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Initial configuration created | Branch Protection Agent |

---

**Last Updated**: 2026-01-22
**Status**: Ready to apply (requires GitHub Pro or public repository)
