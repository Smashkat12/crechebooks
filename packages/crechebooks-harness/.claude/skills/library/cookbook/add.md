# cookbook: add

Catalog a new reference. **Does not copy code** — records where it lives.

`library add <name…> from <repo-or-path> [as skill|agent|command]`

1. **Pull first.** If `library.yaml` is itself in a git repo, `git pull` so you start
   from the latest catalog.
2. **Resolve the source.** For a git source, `git ls-remote <url>` to confirm it's
   reachable (don't clone yet). For a local source, confirm the path exists.
3. **Locate each item.** Find each `<name>` inside the source — its `path` within the
   repo, or the absolute local path.
4. **Classify the primitive** (skill / agent / command) from `as …`, or infer it:
   a `SKILL.md` → skill, an agent definition → agent, a slash-command `.md` → command.
5. **Append the reference** to the matching list in `library.yaml`:
   `{ name, source, path, tags }`. Do not duplicate an existing `name` — update it instead.
6. **Show the diff** of `library.yaml` and stop. Committing/pushing the catalog is the
   user's call (or use `cookbook/push.md` for the referenced repo, not the catalog).

Never fetch and trust an unreviewed public source — read it before cataloging.
