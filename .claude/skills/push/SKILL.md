---
name: push
description: Commit and push the current changes to the repo's remote. Use when the user says "push", "push this", "commit and push", "save and push", or "ship it".
---

# Push

Commit whatever is currently changed in the working tree and push it to the remote, with a
confirmation step before the push actually happens.

## Steps

1. **Survey the change.** Run `git status` (never `-uall`) and `git diff` (staged + unstaged) to see
   exactly what changed. Run `git log -5 --format="%h %s"` to match the repo's existing commit
   message style.
2. **Decide scope.** Stage the real work: application code, tests, config, docs. Do **not** stage
   without asking:
   - Anything matching `.gitignore` (never override it).
   - Any file that looks like it holds a secret or credential (`.env*`, `*.key`, `*.pem`, tokens in
     plaintext), even if its name looks innocuous — read it first if unsure.
   - Large, non-project tooling directories that showed up as untracked (e.g. an installed framework
     or generated output unrelated to the app) — flag these separately and ask before including them,
     the same way `.claude/skills`, `_bmad`, and `_bmad-output` were excluded on 2026-08-14.
   If genuinely everything changed is real project work, stage all of it — don't ask just to ask.
3. **Draft the commit message.** Summarize the *why*, not a file listing — 1-3 sentences, or a short
   bulleted list if the change has several distinct parts (bug fixes, features, tests). Match the
   repo's existing style (see `git log`). Append:
   ```
   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   ```
4. **Commit.** Create a new commit — never amend an existing one unless explicitly asked. Never use
   `--no-verify` or otherwise skip hooks; if a pre-commit hook fails, fix the underlying issue and
   commit again.
5. **Confirm before pushing.** Show the user: the commit message, the branch, and the remote/branch
   it's about to push to (`git remote -v` + `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
   if it has an upstream, otherwise say so). Wait for an explicit go-ahead — this skill always
   confirms before pushing, never pushes silently.
6. **Push.** `git push` (set upstream with `-u` if this branch has none yet). Never force-push
   (`--force`/`--force-with-lease`) unless the user explicitly asks for it in that same turn, and
   warn them first if they do. If push is rejected (remote has new commits), report that back and
   ask how to proceed — don't pull/rebase/merge unilaterally.
7. **Confirm the result.** Run `git status` and `git log origin/<branch> -1` (or equivalent) to show
   the push actually landed, and report the commit hash.

## Notes

- If there's nothing to commit (clean working tree), say so and stop — don't create an empty commit.
- If the branch is `main`/`master` and the repo looks shared (has a remote with other contributors,
  or the user hasn't indicated this is a solo/local-only repo), the confirmation step in #5 is not
  optional even if the user seems to be in a hurry.
