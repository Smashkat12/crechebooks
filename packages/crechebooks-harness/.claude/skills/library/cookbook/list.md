# cookbook: list

Show everything in the catalog.

`library list [skills|agents|commands]`

1. **Pull first** if the catalog is in a git repo (`git pull`) so the list is current.
2. Read `library.yaml`.
3. Print a table per primitive (filter to the one requested, if given):

   | name | primitive | source | path | tags |
   |---|---|---|---|---|

4. End with a one-line count: `N skills · M agents · K commands`.

Read-only — never mutates the catalog.
