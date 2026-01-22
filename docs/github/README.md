# GitHub Integration Guide - Claude Flow

## Overview

This guide provides comprehensive documentation for GitHub integration capabilities in Claude Flow, enabling AI-powered repository management, code review, issue triage, and pull request automation.

## Table of Contents

- [Quick Start](#quick-start)
- [Available Commands](#available-commands)
- [GitHub Swarm](#github-swarm)
- [Repository Analysis](#repository-analysis)
- [Pull Request Enhancement](#pull-request-enhancement)
- [Code Review](#code-review)
- [Issue Triage](#issue-triage)
- [Workflows](#workflows)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Claude Flow installed (`npm install -g claude-flow@alpha`)
- GitHub repository access
- Proper GitHub authentication (personal access token or OAuth)

### Basic Setup

```bash
# Initialize Claude Flow GitHub integration
npx claude-flow github swarm --repository owner/repo

# Run repository analysis
npx claude-flow github repo-analyze --repository owner/repo --deep

# Triage issues
npx claude-flow github issue-triage --repository owner/repo --auto-label
```

## Available Commands

### GitHub Swarm

Create a specialized swarm for comprehensive GitHub repository management.

```bash
npx claude-flow github swarm [options]
```

**Options:**
- `--repository, -r <owner/repo>` - Target GitHub repository
- `--agents, -a <number>` - Number of specialized agents (default: 5)
- `--focus, -f <type>` - Focus area: maintenance, development, review, triage
- `--auto-pr` - Enable automatic pull request enhancements
- `--issue-labels` - Auto-categorize and label issues
- `--code-review` - Enable AI-powered code reviews

**Example:**
```bash
# Full-featured development swarm
npx claude-flow github swarm \
  --repository myorg/myrepo \
  --agents 8 \
  --focus development \
  --auto-pr \
  --code-review \
  --issue-labels
```

### Repository Analysis

Deep analysis of repository health, code quality, and technical debt.

```bash
npx claude-flow github repo-analyze [options]
```

**Options:**
- `--repository <owner/repo>` - Repository to analyze
- `--deep` - Enable deep analysis
- `--include <areas>` - Specific areas (issues, prs, code, commits)

**Example:**
```bash
# Comprehensive repository analysis
npx claude-flow github repo-analyze \
  --repository myorg/myrepo \
  --deep \
  --include issues,prs,code,commits
```

### Pull Request Enhancement

AI-powered pull request improvements.

```bash
npx claude-flow github pr-enhance [options]
```

**Options:**
- `--pr-number <n>` - Pull request number
- `--add-tests` - Add missing tests
- `--improve-docs` - Improve documentation
- `--check-security` - Security review

**Example:**
```bash
# Full PR enhancement
npx claude-flow github pr-enhance \
  --pr-number 123 \
  --add-tests \
  --improve-docs \
  --check-security
```

### Code Review

Automated code review with swarm intelligence.

```bash
npx claude-flow github code-review [options]
```

**Options:**
- `--pr-number <n>` - Pull request to review
- `--focus <areas>` - Review focus (security, performance, style)
- `--suggest-fixes` - Suggest code fixes

**Example:**
```bash
# Security-focused review with suggestions
npx claude-flow github code-review \
  --pr-number 456 \
  --focus security,performance \
  --suggest-fixes
```

### Issue Triage

Intelligent issue classification and management.

```bash
npx claude-flow github issue-triage [options]
```

**Options:**
- `--repository <owner/repo>` - Target repository
- `--auto-label` - Automatically apply labels
- `--assign` - Auto-assign to team members

**Example:**
```bash
# Full automation
npx claude-flow github issue-triage \
  --repository myorg/myrepo \
  --auto-label \
  --assign
```

## GitHub Swarm

### Agent Types

The GitHub swarm coordinates specialized agents, each with specific responsibilities:

#### 1. Issue Triager Agent
- Analyzes and categorizes issues
- Suggests labels and priorities
- Identifies duplicates and related issues
- Links related pull requests
- Estimates complexity and effort

#### 2. PR Reviewer Agent
- Reviews code changes for quality
- Suggests improvements and optimizations
- Checks for best practices adherence
- Validates test coverage
- Identifies potential bugs

#### 3. Documentation Agent
- Updates README files
- Creates API documentation
- Maintains changelog
- Ensures documentation accuracy
- Generates examples and guides

#### 4. Test Agent
- Identifies missing tests
- Suggests test cases
- Validates test coverage
- Reviews test quality
- Recommends testing strategies

#### 5. Security Agent
- Scans for vulnerabilities
- Reviews dependencies for known issues
- Suggests security improvements
- Validates authentication/authorization
- Checks for common security patterns

### Swarm Workflows

#### Issue Triage Workflow

1. **Scan Phase**
   - Scan all open issues
   - Extract issue metadata
   - Identify priority indicators

2. **Categorization Phase**
   - Categorize by type (bug, feature, enhancement)
   - Assess priority level
   - Determine complexity

3. **Labeling Phase**
   - Apply appropriate labels
   - Add priority tags
   - Tag with component/module

4. **Assignment Phase**
   - Suggest appropriate assignees
   - Consider team expertise
   - Balance workload

5. **Linking Phase**
   - Link related issues
   - Connect to relevant PRs
   - Identify dependencies

#### PR Enhancement Workflow

1. **Analysis Phase**
   - Analyze PR changes
   - Review commit history
   - Assess impact scope

2. **Testing Phase**
   - Identify missing tests
   - Suggest test cases
   - Validate coverage

3. **Documentation Phase**
   - Update relevant docs
   - Add inline comments
   - Create examples

4. **Quality Phase**
   - Format code consistently
   - Check for best practices
   - Validate style guidelines

5. **Review Phase**
   - Add helpful review comments
   - Suggest improvements
   - Approve or request changes

#### Repository Health Check

1. **Code Quality Metrics**
   - Analyze code complexity
   - Review maintainability index
   - Check coding standards compliance

2. **Dependency Review**
   - Check for outdated packages
   - Identify security vulnerabilities
   - Suggest updates

3. **Test Coverage Analysis**
   - Calculate coverage percentage
   - Identify untested code
   - Suggest coverage improvements

4. **Documentation Assessment**
   - Check documentation completeness
   - Validate API docs accuracy
   - Review README quality

5. **Health Report Generation**
   - Generate comprehensive report
   - Prioritize action items
   - Track improvements over time

## Integration with Claude Code

### Using MCP Tools

Claude Code integrates seamlessly with GitHub tools via MCP:

```javascript
// Initialize GitHub swarm
mcp__claude-flow__github_swarm({
  repository: "owner/repo",
  agents: 6,
  focus: "maintenance"
})

// Analyze repository
mcp__claude-flow__repo_analyze({
  repository: "owner/repo",
  deep: true,
  include: ["issues", "prs", "code"]
})

// Enhance pull request
mcp__claude-flow__pr_enhance({
  prNumber: 123,
  addTests: true,
  improveDocs: true
})

// Review code
mcp__claude-flow__code_review({
  prNumber: 456,
  focus: ["security", "performance"],
  suggestFixes: true
})

// Triage issues
mcp__claude-flow__issue_triage({
  repository: "owner/repo",
  autoLabel: true,
  assign: true
})
```

### Coordination Hooks

All GitHub agents use mandatory coordination hooks:

```bash
# Before starting work
npx claude-flow@alpha hooks pre-task --description "GitHub operation"

# During work (after each operation)
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "github/[step]"
npx claude-flow@alpha hooks notify --message "[what was done]"

# After completing work
npx claude-flow@alpha hooks post-task --task-id "[task]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## Workflows

### Custom Workflow Creation

Create custom GitHub workflows for repeated operations:

```bash
# Create workflow
npx claude-flow workflow-create --name "github-maintenance" \
  --steps '[
    {"type": "github-swarm", "config": {"focus": "maintenance"}},
    {"type": "issue-triage", "config": {"autoLabel": true}},
    {"type": "repo-analyze", "config": {"deep": true}}
  ]'

# Execute workflow
npx claude-flow workflow-execute --workflow-id github-maintenance
```

### Automated Workflows

Set up automated workflows for continuous repository management:

```yaml
# .claude/workflows/github-daily.yml
name: Daily GitHub Maintenance
schedule: "0 9 * * *"  # Daily at 9 AM
steps:
  - name: Triage New Issues
    type: issue-triage
    config:
      autoLabel: true
      assign: true

  - name: Review Open PRs
    type: code-review
    config:
      focus: ["security", "quality"]

  - name: Health Check
    type: repo-analyze
    config:
      deep: false
      include: ["issues", "prs"]
```

## Best Practices

### 1. Agent Coordination

- Always use coordination hooks for cross-agent communication
- Store decisions and findings in shared memory
- Check memory before making automated changes
- Coordinate PR reviews with multiple agents

### 2. Security

- Never commit credentials or secrets
- Review security suggestions before applying
- Validate dependency updates
- Use security-focused agents for sensitive code

### 3. Code Quality

- Maintain consistent coding standards
- Ensure adequate test coverage
- Update documentation alongside code
- Use automated formatting

### 4. Issue Management

- Use clear, descriptive labels
- Prioritize issues consistently
- Link related issues and PRs
- Provide context in issue descriptions

### 5. Pull Request Workflow

- Keep PRs focused and small
- Include tests with code changes
- Update documentation
- Respond to review comments promptly

## Troubleshooting

### Common Issues

#### Authentication Errors

```bash
# Check GitHub authentication
gh auth status

# Re-authenticate if needed
gh auth login
```

#### Agent Coordination Failures

```bash
# Check swarm status
npx claude-flow swarm status

# View agent logs
npx claude-flow agent list --verbose
```

#### Memory Issues

```bash
# Check memory usage
npx claude-flow memory stats

# Clear old memories
npx claude-flow memory cleanup --older-than 30d
```

### Performance Optimization

- Use focused swarms for specific tasks
- Limit agent count for simple operations
- Enable caching for repeated analyses
- Use shallow analysis for quick checks

### Debugging

```bash
# Enable debug logging
export CLAUDE_FLOW_DEBUG=true

# View detailed operation logs
npx claude-flow logs --level debug --filter github

# Monitor swarm activity
npx claude-flow swarm monitor --duration 60
```

## Advanced Features

### Custom Agent Configuration

Create specialized GitHub agents:

```javascript
// Custom security-focused agent
mcp__claude-flow__agent_spawn({
  type: "security-specialist",
  capabilities: [
    "vulnerability-scanning",
    "dependency-review",
    "secret-detection",
    "compliance-checking"
  ],
  config: {
    scanDepth: "deep",
    reportFormat: "detailed"
  }
})
```

### Integration with CI/CD

```yaml
# GitHub Actions integration
name: Claude Flow Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Claude Flow Review
        run: |
          npx claude-flow@alpha github code-review \
            --pr-number ${{ github.event.pull_request.number }} \
            --suggest-fixes
```

### Multi-Repository Management

```bash
# Analyze multiple repositories
for repo in repo1 repo2 repo3; do
  npx claude-flow github repo-analyze \
    --repository myorg/$repo \
    --deep
done

# Coordinated swarm across repositories
npx claude-flow github swarm \
  --repositories "myorg/repo1,myorg/repo2" \
  --focus maintenance
```

## Additional Resources

- [Claude Flow Documentation](https://github.com/ruvnet/claude-flow)
- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [GitHub API Reference](https://docs.github.com/en/rest)
- [Quick Reference Guide](./quick-reference.md)
- [Integration Summary](./integration-summary.md)

## Support

For issues, questions, or contributions:

- GitHub Issues: https://github.com/ruvnet/claude-flow/issues
- Documentation: https://github.com/ruvnet/claude-flow/tree/main/docs
- Examples: https://github.com/ruvnet/claude-flow/tree/main/examples

---

**Last Updated:** 2026-01-22
**Version:** 2.0.0
**Maintained by:** Claude Flow GitHub Integration Team
