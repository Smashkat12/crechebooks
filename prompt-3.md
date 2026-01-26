Execute in this sequence

Priority order based on dependencies and criticality:

### Tier 1 - P1-CRITICAL (Must complete first)

### Tier 2 - P2-HIGH Logic Layer (Complete before surface tasks)

### Tier 3 - P2-HIGH Surface Layer (After their logic dependencies)

### Tier 4 - P3-MEDIUM (Complete last)

---

## STEP 1: IMPLEMENT TASKS

Implement the task from /home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/{{TASK-ID}}.md

### CRITICAL RULES - NO EXCEPTIONS:

1. **NO WORKAROUNDS OR FALLBACKS** - If something doesn't work, it MUST error out with robust error logging. Know exactly what failed and how to fix it.

2. **NO MOCK DATA IN TESTS** - Use real data. Test to ensure everything actually works. Do NOT cover up broken functionality with passing tests.

3. **FAIL FAST** - The system needs to work after changes or fail immediately so it can be debugged. ABSOLUTELY NO BACKWARDS COMPATIBILITY hacks.

4. **VERIFY SUBAGENT WORK** - Always personally verify/validate what subagents have done. Do not blindly trust their responses.

5. **SYNCHRONOUS SUBAGENT EXECUTION** - Run subagents synchronously. NEVER launch an agent if it needs another agent's output.

6. **MEMORY COORDINATION** - Each subagent MUST report what memories they left. Tell the next subagent where to look for memories. All agents share context through memories.

### MANDATORY FILES TO READ FIRST:

```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/constitution.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/claudeflow.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/_index.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/_traceability.md

```

### TASK IMPLEMENTATION PROCESS:

1. Read the task spec file completely
2. Read all `<input_context_files>` listed in the task
3. Follow the `<reasoning_mode>` specified
4. Implement according to `<definition_of_done>` signatures
5. Respect all `<constraints>`
6. Create files listed in `<files_to_create>`
7. Modify files listed in `<files_to_modify>`
8. Validate against all `<validation_criteria>`
9. Run `<test_commands>` and ensure all pass
10. Run linters: `npm run lint`

---

## STEP 2: VALIDATE AND PUSH

Follow /home/smash/Documents/dev-env/Playground/ruv/crechebooks/pushrepo.md when pushing.

### VALIDATION CHECKLIST (All must pass):

- [ ] All `<validation_criteria>` from task spec met
- [ ] All tests pass (no skips, no mocks for real functionality)
- [ ] Linter passes with no errors
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] No runtime errors when testing manually
- [ ] Migrations run successfully (if applicable)

### IF ANY REQUIREMENT IS NOT MET:

🚨 **STOP AND RAISE RED FLAG** 🚨

Tell me exactly:
- Which requirement failed
- What the error/issue is
- What needs to be fixed
- Do NOT proceed until resolved

### UPDATE PROJECT STATUS FILES:

After successful implementation, update:
- `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/_index.md` - Mark task complete
- `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/_traceability.md` - Update coverage status
- `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/ai/` - Update relevant AI context files

---

## STEP 3: PREPARE NEXT TASK

BEFORE starting the next Phase 8 task, update it with current context.

### NEXT TASK PREPARATION:

1. Read the next task spec file in execution order
2. Audit against current codebase state
3. Update file paths if they've changed
4. Add any learnings from previous tasks
5. Ensure no ambiguity remains
6. Review git history for recent changes: `git log --oneline -20`

### TASK SPEC UPDATE REQUIREMENTS:

The task spec must be updated so that an AI agent with:
- Fresh context window
- No knowledge of previous work
- No knowledge of project history

Can perfectly implement the task by reading ONLY the task spec file.

Include:
- Exact current file paths (verify they exist)
- Current entity/service method signatures
- Any gotchas discovered during previous tasks
- Dependencies that must be in place
- Environment/config requirements

Remove:
- Outdated file paths
- References to non-existent methods
- Ambiguous instructions

---

## REMEMBER:

1. READ ALL MANDATORY FILES before starting
2. SELECT OPTIMAL REASONING MODE based on task type
3. VERIFY EVERYTHING - don't trust, verify
4. FAIL FAST - no hiding problems
5. UPDATE STATUS FILES after each task
6. PREPARE NEXT TASK before moving on

ultrathink. IMPORTANT: You MUST READ EVERYTHING listed above.
