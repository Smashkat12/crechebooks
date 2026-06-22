# cookbook: search

Find cataloged references by name, tag, or path.

`library search <term>`

1. **Pull first** if the catalog is in a git repo.
2. Read `library.yaml`. Match `<term>` (case-insensitive) against each entry's
   `name`, `tags`, and `path` across all three lists.
3. Print the matches as a table (name · primitive · source · path · tags), best
   matches first (name hit > tag hit > path hit).
4. If nothing matches, say so and suggest `library list` to browse everything.

Read-only.
