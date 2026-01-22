# Contributing to CrecheBooks

Thank you for considering contributing to CrecheBooks! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Branch Naming Conventions](#branch-naming-conventions)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)

## Code of Conduct

This project follows a standard code of conduct. Please be respectful and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/crechebooks.git
   cd crechebooks
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original/crechebooks.git
   ```

## Development Setup

### Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL 15+
- Docker and Docker Compose (recommended)
- Git

### Initial Setup

1. **Install dependencies**:
   ```bash
   # Install API dependencies
   cd api
   npm install

   # Install Web dependencies
   cd ../web
   npm install
   ```

2. **Configure environment**:
   ```bash
   # Copy example environment files
   cp api/.env.example api/.env
   cp web/.env.example web/.env

   # Edit .env files with your configuration
   ```

3. **Set up database**:
   ```bash
   # Using Docker Compose
   docker-compose up -d postgres

   # Or manually with PostgreSQL
   createdb crechebooks_dev

   # Run migrations
   cd api
   npm run migrate
   ```

4. **Start development servers**:
   ```bash
   # Terminal 1 - API
   cd api
   npm run dev

   # Terminal 2 - Web
   cd web
   npm run dev
   ```

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
```

See [Branch Naming Conventions](#branch-naming-conventions) below.

### 2. Make Changes

- Write code following our [Code Style Guidelines](#code-style-guidelines)
- Add/update tests as needed
- Update documentation if required
- Commit your changes regularly

### 3. Keep Your Branch Updated

Regularly sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

### 4. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Branch Naming Conventions

Use the following prefixes for branch names:

- `feature/` - New features
  - Example: `feature/parent-dashboard`
- `fix/` - Bug fixes
  - Example: `fix/login-validation`
- `docs/` - Documentation changes
  - Example: `docs/api-endpoints`
- `refactor/` - Code refactoring
  - Example: `refactor/auth-service`
- `test/` - Test additions/modifications
  - Example: `test/attendance-reports`
- `chore/` - Maintenance tasks
  - Example: `chore/update-dependencies`
- `hotfix/` - Urgent production fixes
  - Example: `hotfix/payment-processing`

**Format**: `<type>/<short-description-in-kebab-case>`

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions/modifications
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes

### Examples

```bash
feat(auth): add JWT token refresh mechanism

Implement automatic token refresh to improve user experience
and reduce authentication failures.

Closes #123
```

```bash
fix(api): resolve SQL injection vulnerability in user search

Add parameterized queries to prevent SQL injection attacks.

BREAKING CHANGE: Search API now requires minimum 3 characters
```

```bash
docs(readme): update development setup instructions

Add Docker Compose setup steps and troubleshooting section.
```

### Scope

The scope should indicate the affected component:
- `api` - Backend API
- `web` - Frontend web application
- `db` - Database changes
- `auth` - Authentication/authorization
- `parent` - Parent portal
- `staff` - Staff portal
- `reports` - Reports and analytics
- `ci` - CI/CD pipeline
- `deps` - Dependencies

## Pull Request Process

### 1. Before Submitting

- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] Commits follow message format
- [ ] Branch is up to date with main

### 2. Creating the PR

- Use the PR template (auto-populated)
- Provide a clear description
- Link related issues
- Add screenshots/videos if applicable
- Request reviews from appropriate team members

### 3. Review Process

- Address all review comments
- Keep discussions focused and professional
- Make requested changes in new commits
- Don't force-push after review starts (unless requested)
- Mark conversations as resolved when addressed

### 4. Merging

- Squash commits if there are many small ones
- Ensure all CI checks pass
- Get required approvals (minimum 1 for features, 2 for breaking changes)
- Merge using "Squash and merge" for feature branches
- Delete branch after merge

## Code Style Guidelines

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint configuration
- Use Prettier for formatting
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable names
- Add JSDoc comments for public APIs

```typescript
/**
 * Retrieves a child's attendance records for a date range
 * @param childId - The unique identifier for the child
 * @param startDate - Start date of the range
 * @param endDate - End date of the range
 * @returns Array of attendance records
 */
async function getAttendanceRecords(
  childId: string,
  startDate: Date,
  endDate: Date
): Promise<AttendanceRecord[]> {
  // Implementation
}
```

### React/Vue Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use TypeScript for prop types
- Follow component file structure

```typescript
// ComponentName.tsx
import React from 'react';
import styles from './ComponentName.module.css';

interface ComponentNameProps {
  title: string;
  onAction: () => void;
}

export const ComponentName: React.FC<ComponentNameProps> = ({
  title,
  onAction
}) => {
  return (
    <div className={styles.container}>
      <h2>{title}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  );
};
```

### File Organization

```
src/
├── components/        # Reusable components
├── pages/            # Page components
├── hooks/            # Custom React hooks
├── services/         # API services
├── utils/            # Utility functions
├── types/            # TypeScript type definitions
├── constants/        # Constants and enums
└── styles/           # Global styles
```

## Testing Requirements

### Test Coverage

- Minimum 80% code coverage for new code
- 100% coverage for critical paths (auth, payments)
- Tests must pass in CI/CD pipeline

### Test Types

1. **Unit Tests**
   - Test individual functions/components
   - Use Jest and React Testing Library
   - Mock external dependencies

2. **Integration Tests**
   - Test API endpoints
   - Test component interactions
   - Use Supertest for API tests

3. **E2E Tests** (for critical flows)
   - User authentication
   - Child registration
   - Payment processing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test

# Run in watch mode
npm test -- --watch
```

### Writing Tests

```typescript
describe('AttendanceService', () => {
  describe('recordCheckIn', () => {
    it('should record check-in time successfully', async () => {
      // Arrange
      const childId = 'child-123';
      const checkInTime = new Date();

      // Act
      const result = await attendanceService.recordCheckIn(childId, checkInTime);

      // Assert
      expect(result).toBeDefined();
      expect(result.childId).toBe(childId);
      expect(result.checkInTime).toEqual(checkInTime);
    });

    it('should throw error for invalid child ID', async () => {
      // Arrange
      const invalidId = 'invalid';

      // Act & Assert
      await expect(
        attendanceService.recordCheckIn(invalidId, new Date())
      ).rejects.toThrow('Child not found');
    });
  });
});
```

## Documentation

### When to Update Documentation

- Adding new features
- Changing APIs
- Modifying configuration
- Updating dependencies
- Changing architecture

### Documentation Types

1. **Code Comments**
   - Explain why, not what
   - Document complex logic
   - Add JSDoc for public APIs

2. **README Files**
   - Setup instructions
   - Configuration options
   - Usage examples

3. **API Documentation**
   - Update OpenAPI/Swagger specs
   - Document request/response formats
   - Provide example requests

4. **Architecture Docs**
   - Update diagrams
   - Document design decisions
   - Explain system components

### Documentation Structure

```
docs/
├── architecture/          # System architecture
│   ├── overview.md
│   ├── parent-portal-architecture.md
│   └── staff-portal-architecture.md
├── api/                  # API documentation
│   └── endpoints.md
├── guides/               # User guides
│   ├── development.md
│   └── deployment.md
└── specs/                # Specifications
    ├── requirements/
    └── tasks/
```

## Getting Help

- Check existing issues and documentation
- Ask questions in GitHub Discussions
- Reach out to maintainers
- Join our community chat (if available)

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to CrecheBooks! 🎉
