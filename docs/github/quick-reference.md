# GitHub Integration Quick Reference

## Quick Command Reference

### GitHub Swarm
```bash
# Basic swarm
npx claude-flow github swarm -r owner/repo

# Development focus with automation
npx claude-flow github swarm -r owner/repo -f development --auto-pr --code-review

# Maintenance mode
npx claude-flow github swarm -r owner/repo -f maintenance --issue-labels
```

### Repository Analysis
```bash
# Quick analysis
npx claude-flow github repo-analyze -r owner/repo

# Deep analysis
npx claude-flow github repo-analyze -r owner/repo --deep

# Specific areas
npx claude-flow github repo-analyze -r owner/repo --include issues,prs
```

### Pull Request Enhancement
```bash
# Basic enhancement
npx claude-flow github pr-enhance --pr-number 123

# With tests
npx claude-flow github pr-enhance --pr-number 123 --add-tests

# Full enhancement
npx claude-flow github pr-enhance --pr-number 123 --add-tests --improve-docs --check-security
```

### Code Review
```bash
# Basic review
npx claude-flow github code-review --pr-number 456

# Security focus
npx claude-flow github code-review --pr-number 456 --focus security

# With fixes
npx claude-flow github code-review --pr-number 456 --suggest-fixes
```

### Issue Triage
```bash
# Basic triage
npx claude-flow github issue-triage -r owner/repo

# With auto-labeling
npx claude-flow github issue-triage -r owner/repo --auto-label

# Full automation
npx claude-flow github issue-triage -r owner/repo --auto-label --assign
```

## MCP Tool Reference

### GitHub Swarm (MCP)
```javascript
mcp__claude-flow__github_swarm({
  repository: "owner/repo",
  agents: 6,
  focus: "development",  // maintenance | development | review | triage
  autoPr: true,
  issueLabels: true,
  codeReview: true
})
```

### Repository Analysis (MCP)
```javascript
mcp__claude-flow__repo_analyze({
  repository: "owner/repo",
  deep: true,
  include: ["issues", "prs", "code", "commits"]
})
```

### PR Enhancement (MCP)
```javascript
mcp__claude-flow__pr_enhance({
  prNumber: 123,
  addTests: true,
  improveDocs: true,
  checkSecurity: true
})
```

### Code Review (MCP)
```javascript
mcp__claude-flow__code_review({
  prNumber: 456,
  focus: ["security", "performance", "style"],
  suggestFixes: true
})
```

### Issue Triage (MCP)
```javascript
mcp__claude-flow__issue_triage({
  repository: "owner/repo",
  autoLabel: true,
  assign: true
})
```

## Agent Types

| Agent Type | Purpose | Key Capabilities |
|------------|---------|------------------|
| **Issue Triager** | Issue management | Categorization, labeling, prioritization, duplicate detection |
| **PR Reviewer** | Code review | Quality checks, best practices, bug detection, suggestions |
| **Documentation Agent** | Docs maintenance | README updates, API docs, changelog, examples |
| **Test Agent** | Testing | Coverage analysis, test suggestions, test quality review |
| **Security Agent** | Security | Vulnerability scanning, dependency review, security patterns |

## Coordination Hooks

### Pre-Task Hook
```bash
npx claude-flow@alpha hooks pre-task --description "GitHub operation" --task-id "github-123"
```

### Post-Edit Hook
```bash
npx claude-flow@alpha hooks post-edit --file "path/to/file" --memory-key "github/agent/step"
```

### Notification Hook
```bash
npx claude-flow@alpha hooks notify --message "Operation completed" --telemetry true
```

### Post-Task Hook
```bash
npx claude-flow@alpha hooks post-task --task-id "github-123" --analyze-performance true
```

### Session End Hook
```bash
npx claude-flow@alpha hooks session-end --export-metrics true --generate-summary true
```

## Common Workflows

### Daily Maintenance
```bash
# 1. Triage new issues
npx claude-flow github issue-triage -r owner/repo --auto-label --assign

# 2. Review open PRs
npx claude-flow github code-review --pr-number $(gh pr list --json number -q '.[0].number')

# 3. Health check
npx claude-flow github repo-analyze -r owner/repo --include issues,prs
```

### Pre-Release Workflow
```bash
# 1. Deep analysis
npx claude-flow github repo-analyze -r owner/repo --deep

# 2. Review all open PRs
for pr in $(gh pr list --json number -q '.[].number'); do
  npx claude-flow github code-review --pr-number $pr --suggest-fixes
done

# 3. Update documentation
npx claude-flow github swarm -r owner/repo -f development --improve-docs
```

### Security Audit
```bash
# 1. Security-focused analysis
npx claude-flow github repo-analyze -r owner/repo --deep --include code

# 2. Review all PRs for security
for pr in $(gh pr list --json number -q '.[].number'); do
  npx claude-flow github code-review --pr-number $pr --focus security
done

# 3. Generate security report
npx claude-flow github swarm -r owner/repo -a 3 -f security
```

## Troubleshooting Commands

### Check Authentication
```bash
gh auth status
gh auth login  # If needed
```

### Swarm Status
```bash
npx claude-flow swarm status --verbose
```

### Agent List
```bash
npx claude-flow agent list --filter github
```

### Memory Check
```bash
npx claude-flow memory stats
npx claude-flow memory list --pattern "github/*"
```

### Logs
```bash
# Enable debug mode
export CLAUDE_FLOW_DEBUG=true

# View logs
npx claude-flow logs --level debug --filter github

# Monitor swarm
npx claude-flow swarm monitor --duration 60
```

## Environment Variables

```bash
# Debug mode
export CLAUDE_FLOW_DEBUG=true

# GitHub token (if not using gh CLI)
export GITHUB_TOKEN=ghp_xxxxx

# Max concurrent agents
export CLAUDE_FLOW_MAX_AGENTS=10

# Cache directory
export CLAUDE_FLOW_CACHE_DIR=~/.cache/claude-flow

# Log level
export CLAUDE_FLOW_LOG_LEVEL=debug
```

## Configuration Files

### GitHub Swarm Config
```yaml
# .claude/github-swarm.yml
repository: owner/repo
agents: 6
focus: development
automation:
  autoPr: true
  issueLabels: true
  codeReview: true
scheduling:
  dailyTriage: "0 9 * * *"
  weeklyAnalysis: "0 10 * * 1"
```

### Workflow Config
```yaml
# .claude/workflows/github-maintenance.yml
name: GitHub Maintenance
schedule: "0 9 * * *"
steps:
  - name: Triage Issues
    type: issue-triage
    config:
      autoLabel: true
      assign: true

  - name: Review PRs
    type: code-review
    config:
      focus: ["security", "quality"]

  - name: Health Check
    type: repo-analyze
    config:
      deep: false
```

## Key Shortcuts

### Claude Code Integration

```javascript
// Parallel execution pattern
[BatchTool]:
  // Initialize swarm
  mcp__claude-flow__github_swarm({ repository: "owner/repo", agents: 5 })

  // Spawn agents
  Task("Issue Triager", "Triage all open issues...", "github-triager")
  Task("PR Reviewer", "Review open pull requests...", "github-reviewer")
  Task("Docs Agent", "Update documentation...", "github-docs")

  // Update todos
  TodoWrite({ todos: [...] })
```

## Performance Tips

1. **Use focused swarms** - Specify `--focus` to limit agent scope
2. **Limit agents** - Start with 3-5 agents, increase as needed
3. **Enable caching** - Reuse analysis results when possible
4. **Shallow analysis** - Use without `--deep` for quick checks
5. **Parallel operations** - Batch operations in single messages
6. **Memory management** - Clean old memories periodically

## Common Patterns

### Pattern: Multi-PR Review
```bash
# Review all open PRs in parallel
gh pr list --json number -q '.[].number' | xargs -P 3 -I {} \
  npx claude-flow github code-review --pr-number {}
```

### Pattern: Label Standardization
```bash
# Standardize labels across issues
npx claude-flow github issue-triage -r owner/repo --auto-label
```

### Pattern: Documentation Sync
```bash
# Keep docs in sync with code changes
npx claude-flow github pr-enhance --pr-number $(gh pr view --json number -q '.number') --improve-docs
```

## Resources

- **Full Documentation**: [README.md](./README.md)
- **Integration Summary**: [integration-summary.md](./integration-summary.md)
- **Claude Flow Docs**: https://github.com/ruvnet/claude-flow
- **GitHub CLI Docs**: https://cli.github.com/manual/

---

**Quick Reference Version:** 1.0.0
**Last Updated:** 2026-01-22
