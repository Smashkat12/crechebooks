---
description: "Catalog/distribute private skills, agents & prompts via the library meta-skill (add/use/push/list/search/sync)."
argument-hint: "<add|use|push|list|search|sync> [name…] [from <repo>] [globally|locally|into <target>]"
---

Run the **library** meta-skill for: `$ARGUMENTS`

1. Read `.claude/skills/library/SKILL.md` for the model and safety rules.
2. Pick the cookbook for the first argument (`add|use|push|list|search|sync`) from
   `.claude/skills/library/cookbook/<command>.md` and follow it exactly.
3. Operate on `.claude/skills/library/library.yaml` as the catalog (references, not copies).
4. Always pull the source first; never install from an unreviewed public source; never run `rm -rf`.
