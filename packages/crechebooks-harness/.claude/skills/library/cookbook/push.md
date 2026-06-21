# cookbook: push

You edited an installed copy of an item and want that change to flow back to the
**source repo** — the one source of truth — so every other device/agent gets it on sync.

`library push <name> [from globally|locally|<path>]`

1. **Find the local edited copy.** Default to the installed location (global, then local).
2. **Resolve the source** for `<name>` from `library.yaml`. If `source: local`, just copy
   the edited files back to the recorded path and stop (it's already the source).
3. **For a git source:**
   a. Clone the source repo into a temp dir (shallow), on its default branch.
   b. Copy the edited item's files over the item's `path` in that clone.
   c. `git -C <tmp> add <path>` then `git -C <tmp> commit -m "library: update <name>"`.
   d. **Push only after the user confirms** — `git push` is a destructive-ish, outward
      action. Show the diff first.
4. **Confirm** the push landed (e.g. `git -C <tmp> log -1`) and report the commit URL.

Never force-push. Never push secrets — scan the diff for credentials before committing.
