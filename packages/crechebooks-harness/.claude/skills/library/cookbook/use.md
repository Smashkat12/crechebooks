# cookbook: use

Install one or more cataloged items into a target. Supports `<name>*` globs.

`library use <name…|glob> [globally | locally | into <target>]`

1. **Resolve the matches.** Read `library.yaml`; expand globs (`meta-*`) against the
   `skills` / `agents` / `commands` lists.
2. **Resolve the destination:**
   - `globally` → `targets.global` (`~/.claude`)
   - `locally` / no target → the matching `defaults.<primitive>` under the current repo
   - `into <name>` → `targets.<name>`
   - `into <path>` → that literal path
3. **Fetch the latest source for each match:**
   - git source → clone shallow into a temp dir (`git clone --depth 1 <url>`) and read
     the item at its `path`. **Skip any `rm -rf`**; clean temp dirs with explicit paths.
   - local source → read from the recorded path.
4. **Review before install** (trust rule): open the item and confirm it's what's expected.
5. **Place it.** `mkdir -p <dest>/<subdir>` then copy the item's files in
   (skill → `<dest>/skills/<name>/`, agent → `<dest>/agents/<name>.md`,
   command → `<dest>/commands/<name>.md`).
6. **Report** what was installed and where, as a table.

Idempotent: re-running overwrites with the latest version (that's the point — staying synced).
