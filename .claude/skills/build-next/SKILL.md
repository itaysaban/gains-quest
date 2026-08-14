---
name: build-next
description: Pass the next approved story from the latest epics.md straight to Amelia to start building — no extra confirmation. Use when the user says "build next", "start building", "approved, build it", "ship the next story", or invokes /build-next.
---

# Build Next

Fast on-ramp from an approved epics/stories document straight into implementation. No confirmation
step by design — the user already approved the epics and stories before invoking this; that
approval *is* the go-ahead.

## Steps

1. **Find the source document.** Locate the most recently modified `epics.md` under
   `_bmad-output/planning-artifacts/` (glob `_bmad-output/planning-artifacts/**/epics.md` if it
   isn't at the top level). If more than one exists and it's not obvious which is current from
   context (e.g. the milestone just discussed), ask which one — this is the one ambiguity worth a
   question, since building the wrong milestone's story is expensive to notice late.

2. **Find the next unstarted story.** Check for a sprint/story-tracking file in the same directory
   (e.g. `sprint-status.md`, anything `bmad-sprint-planning` would have produced) — if one exists and
   marks stories done/in-progress, trust it. If none exists, walk `epics.md` in document order
   (Epic 1 → Story 1.1, 1.2, ... then Epic 2, ...) and use lightweight signal from the actual
   codebase to skip anything clearly already built (matching migration files, matching function
   names, matching UI already present) — when genuinely unsure whether a story is already done,
   say so and ask rather than silently re-building or silently skipping.

3. **Adopt Amelia's persona** (💻, Senior Software Engineer, test-first discipline) if not already
   active this session — this skill's whole point is handing off to her.

4. **Dispatch to `bmad-build`** for the identified story. If `bmad-build`'s activation is blocked
   (e.g. `uv` unavailable, matching the failure mode seen repeatedly in this project), don't just
   halt and report the blocker — fall back to implementing the story directly as Amelia: use the
   story's own Given/When/Then acceptance criteria from `epics.md` as the spec, follow red-green-
   refactor, and hold the same bar (typecheck clean, tests passing) as any other Amelia-built story
   in this session. Note in the final summary that the formal `bmad-build` workflow was skipped and
   why, so the user isn't surprised the ceremony (state-tracking, sprint-status updates) didn't run.

5. **Report back.** After the story is built and verified (typecheck + tests), give a short summary:
   what shipped, which FRs/ACs it satisfies, what's next in the epic, and anything from the story's
   own flagged open items (e.g. "confirm with the user" notes left in the acceptance criteria) that
   still needs a decision before the *next* story can proceed cleanly.

## Notes

- This skill deliberately has no confirmation gate before starting work — that's the point of it.
  It still follows this session's normal git-safety rules (no auto-push, no force operations) and
  Amelia's own principle of never marking a task complete without passing tests.
- If `epics.md` has no stories left unbuilt in the current milestone scope, say so plainly and ask
  what's next (new milestone's epics/stories, or something else) rather than inventing work.
