# cookbook: sync

Refresh **both** the catalog and the referenced code, so this device has the latest
of everything. This is the heart of the library — not just metadata, the actual code.

`library sync [<name…|glob>]`

1. **Update the catalog.** If `library.yaml` is in a git repo, `git pull`.
2. **Determine the set.** All entries, or just those matching the given names/globs.
3. **For each git-sourced entry**, fetch the latest of its source repo (shallow clone
   or `git pull` a cached clone). Skip `rm -rf`; manage temp/cache dirs by explicit path.
4. **Re-install** every entry that is currently installed on this device into the same
   place it already lives (reuse `cookbook/use.md` step 5), overwriting with the latest.
   Do **not** install items that aren't already present here — sync updates, it doesn't
   spread new installs.
5. **Report** a table: `name · old → new (commit/short-sha or "local") · destination`.
   Flag anything that failed to fetch rather than silently skipping it.

Safe to run often; it's how every device, teammate, and agent stays on one version.
