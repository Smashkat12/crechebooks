# Branching Strategy

## Overview

CrecheBooks uses a **Git Flow-inspired branching strategy** optimized for continuous delivery and feature isolation. This document outlines branch types, naming conventions, protection rules, and workflows.

---

## Branch Structure

### 1. Main Branches

#### `main` (Production)
- **Purpose**: Production-ready code
- **Protected**: Yes
- **Deployment**: Automatically deploys to Railway production
- **Merge Policy**: Only from `dev` via PR with approval
- **Commits**: No direct commits allowed

#### `dev` (Development)
- **Purpose**: Integration branch for features
- **Protected**: Yes
- **Testing**: All CI checks must pass
- **Merge Policy**: From feature/fix branches via PR
- **Commits**: No direct commits allowed

### 2. Supporting Branches

#### Feature Branches (`feature/*`)
**Naming**: `feature/<issue-number>-<short-description>`

**Examples**:
- `feature/TASK-CORE-001-authentication-system`
- `feature/123-parent-portal-dashboard`
- `feature/payment-matching-algorithm`

**Lifecycle**:
1. Branch from: `dev`
2. Merge into: `dev`
3. Delete after: Merge completion

**Best Practices**:
- One feature per branch
- Keep branches short-lived (< 1 week)
- Rebase frequently from `dev`

#### Bugfix Branches (`fix/*`)
**Naming**: `fix/<issue-number>-<short-description>`

**Examples**:
- `fix/456-transaction-validation-error`
- `fix/login-redirect-loop`
- `fix/TASK-TRANS-013-fee-calculation`

**Lifecycle**:
1. Branch from: `dev`
2. Merge into: `dev`
3. Delete after: Merge completion

#### Hotfix Branches (`hotfix/*`)
**Naming**: `hotfix/<version>-<critical-issue>`

**Examples**:
- `hotfix/1.2.1-security-patch`
- `hotfix/1.0.5-payment-failure`

**Lifecycle**:
1. Branch from: `main`
2. Merge into: **both** `main` AND `dev`
3. Tag: Create version tag
4. Delete after: Merge completion

**When to use**:
- Critical production bugs
- Security vulnerabilities
- Data integrity issues

#### Release Branches (`release/*`)
**Naming**: `release/<version>`

**Examples**:
- `release/1.0.0`
- `release/2.1.0-beta`

**Lifecycle**:
1. Branch from: `dev`
2. Stabilize: Bug fixes only
3. Merge into: `main` (with tag) and `dev`
4. Delete after: Merge completion

**Activities**:
- Version bumping
- Documentation updates
- Final testing
- No new features

#### Documentation Branches (`docs/*`)
**Naming**: `docs/<area>-<description>`

**Examples**:
- `docs/api-endpoints-update`
- `docs/installation-guide`
- `docs/architecture-diagrams`

**Lifecycle**:
1. Branch from: `dev`
2. Merge into: `dev`
3. Delete after: Merge completion

---

## Branch Protection Rules

### `main` Branch

**Required**:
- ✅ At least 1 approval from code owners
- ✅ All CI checks must pass
- ✅ Branch must be up-to-date before merge
- ✅ Signed commits (recommended)
- ❌ Force pushes disabled
- ❌ Deletions disabled

**CI Requirements**:
- Lint & Type Check
- Unit Tests (API + Web)
- Integration Tests
- Build Success
- Security Scan (CodeQL)

### `dev` Branch

**Required**:
- ✅ All CI checks must pass
- ✅ Branch must be up-to-date before merge
- ❌ Force pushes disabled (except for maintainers)

**CI Requirements**:
- Lint & Type Check
- Unit Tests
- Build Success

### Feature/Fix Branches

**Required**:
- ✅ CI checks must pass before PR creation
- 🔄 Regular rebasing from `dev`

---

## Merge Strategies

### 1. Squash and Merge (Default)
**Use for**: Feature and bugfix branches
**Benefits**:
- Clean, linear history
- One commit per feature
- Easy to revert

**Example**:
```bash
# All commits squashed into one
git merge --squash feature/123-new-feature
```

### 2. Merge Commit
**Use for**: Release branches, hotfixes
**Benefits**:
- Preserves full history
- Clear merge points

### 3. Rebase and Merge
**Use for**: Small, well-organized feature branches
**Benefits**:
- Linear history
- Preserves individual commits

---

## Pull Request Requirements

### All PRs Must Include:

1. **Description**
   - What changed and why
   - Related issue/task number
   - Screenshots (for UI changes)

2. **Testing**
   - Unit tests for new code
   - Manual testing checklist
   - E2E tests (if applicable)

3. **Documentation**
   - Updated README (if needed)
   - API documentation
   - Code comments for complex logic

4. **Security**
   - No hardcoded secrets
   - Input validation
   - Authentication/authorization checks

5. **Performance**
   - Database query optimization
   - N+1 query prevention
   - Bundle size impact (for Web)

### PR Approval Process

**For `dev` branch**:
1. Create PR with template
2. CI checks automatically run
3. Self-review and fix issues
4. Request review from team
5. Address feedback
6. Merge when approved + CI passes

**For `main` branch**:
1. Requires 1+ code owner approval
2. All CI checks must pass
3. Manual QA verification
4. Deploy to staging first (if applicable)
5. Merge + automatic production deployment

---

## Commit Message Format

We follow **Conventional Commits** specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code change (not feat/fix)
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Build/tooling changes
- `ci`: CI/CD changes

### Examples:
```bash
feat(api): implement JWT authentication system

- Add JWT token generation in auth service
- Implement token validation middleware
- Add refresh token rotation
- Update user entity with password hashing

Closes #TASK-CORE-001

---

fix(web): resolve infinite redirect loop on login

The login page was redirecting to itself when auth token
was invalid. Added proper token validation before redirect.

Fixes #456

---

docs(readme): update installation instructions

Added Railway deployment steps and environment variables
configuration guide.
```

---

## Release Workflow

### Version Numbering (Semantic Versioning)

`MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Process:

1. **Create Release Branch**
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b release/1.0.0
   ```

2. **Prepare Release**
   - Update version in `package.json`
   - Update `CHANGELOG.md`
   - Run full test suite
   - Update documentation

3. **Merge to Main**
   ```bash
   git checkout main
   git merge release/1.0.0
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin main --tags
   ```

4. **Merge Back to Dev**
   ```bash
   git checkout dev
   git merge release/1.0.0
   git push origin dev
   ```

5. **Delete Release Branch**
   ```bash
   git branch -d release/1.0.0
   git push origin --delete release/1.0.0
   ```

---

## Hotfix Workflow

**Emergency fixes for production**:

1. **Create Hotfix Branch**
   ```bash
   git checkout main
   git checkout -b hotfix/1.0.1-critical-bug
   ```

2. **Fix Issue**
   - Make minimal changes
   - Add tests
   - Update version

3. **Merge to Main**
   ```bash
   git checkout main
   git merge hotfix/1.0.1-critical-bug
   git tag -a v1.0.1 -m "Hotfix: Critical bug"
   git push origin main --tags
   ```

4. **Merge to Dev**
   ```bash
   git checkout dev
   git merge hotfix/1.0.1-critical-bug
   git push origin dev
   ```

5. **Delete Hotfix Branch**

---

## Best Practices

### DO ✅

- Keep branches focused and small
- Rebase feature branches regularly from `dev`
- Write descriptive commit messages
- Delete branches after merging
- Use PR templates
- Tag all releases
- Keep `main` always deployable

### DON'T ❌

- Commit directly to `main` or `dev`
- Force push to protected branches
- Leave stale branches open
- Merge without CI passing
- Push secrets or credentials
- Mix unrelated changes in one branch
- Create mega-PRs (>500 lines changed)

---

## Emergency Procedures

### Rollback Production

**If a deployment causes issues**:

1. **Revert the merge commit**:
   ```bash
   git checkout main
   git revert -m 1 <merge-commit-hash>
   git push origin main
   ```

2. **Redeploy previous version**:
   ```bash
   git checkout <previous-tag>
   railway up --service api
   railway up --service web
   ```

### Force Push Recovery

**If someone accidentally force pushes**:

1. Check reflog: `git reflog`
2. Find lost commits
3. Cherry-pick or reset to correct state
4. Notify team immediately

---

## Tools & Commands

### Useful Git Aliases

Add to `~/.gitconfig`:

```ini
[alias]
  co = checkout
  br = branch
  ci = commit
  st = status
  unstage = reset HEAD --
  last = log -1 HEAD
  visual = log --graph --oneline --all
  cleanup = !git branch --merged | grep -v '\\*\\|main\\|dev' | xargs -n 1 git branch -d
```

### Branch Cleanup Script

```bash
#!/bin/bash
# cleanup-branches.sh

# Delete local branches already merged into dev
git checkout dev
git pull origin dev
git branch --merged | grep -v "\\*\\|main\\|dev" | xargs -n 1 git branch -d

# Delete remote-tracking branches that are gone
git fetch --prune
```

---

## Integration with GitHub

### Automated Workflows

- **On PR to `dev`**: Run CI checks
- **On merge to `main`**: Deploy to production
- **On tag creation**: Create GitHub release
- **Weekly**: Dependabot security updates

### GitHub Settings Recommendations

**Repository Settings**:
- ✅ Allow squash merging
- ✅ Automatically delete head branches
- ❌ Allow merge commits (only for releases)
- ❌ Allow rebase merging

**Branch Rules**:
- Configure in: Settings → Branches → Branch protection rules
- Apply rules from "Branch Protection Rules" section above

---

## Support

For questions or issues with the branching strategy:
- Create a GitHub discussion
- Contact the development team
- Review the [Contributing Guide](../../.github/CONTRIBUTING.md)

---

## Changelog

- **2026-01-22**: Initial branching strategy documentation
- Version tracking will be maintained here

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-22
**Maintained By**: CrecheBooks Development Team
