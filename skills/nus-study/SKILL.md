---
name: nus-study
description: Set up and refresh a student's NUS Study pack — read-only Canvas sync, NUSMods timetable, courseware review with page-level evidence, encrypted publishing to the student's own secret Gist, phone pairing, and a 48-hour refresh.
---

# NUS Study pack

Repository: https://github.com/woodyhouse/nus-study (branch `main`). Web app:
https://woodyhouse.github.io/nus-study/. Read `AGENTS.md` first; its rules apply
to every step. Every script prints a short JSON summary — read that, not the files
under `.local/`, except the courseware text you are asked to review.

## First-time setup

1. **Prerequisites.** Node 22.13+, npm, git, and the GitHub CLI (`gh`). If `gh` is
   missing, install it (`winget install GitHub.cli`, `brew install gh`, or the
   distro package). The student must have a GitHub account.
2. **Checkout.** Clone into a dedicated folder (reuse an existing clone; pull only
   when the tree is clean). Run `npm ci`, `npm test`, `npm run setup`.
3. **Canvas token (the student acts).** Run `npm run canvas:auto`. It first checks
   that Chromium is installed and starts (installing or reinstalling it once if
   needed), then opens a separate window: the student logs in to Canvas (with MFA)
   and types YES. Poll `.local/token-status.json` until `verified`. On `failed`,
   read its `stage` and `reason` (never secret), fix what you can (e.g. a
   `browser-preflight` failure), and ask before reopening. The window stays open on
   errors so the student can read them. Never retry token creation on your own.
   Fallback when the browser flow cannot run: ask the student to run
   `npm run canvas:token` in their own terminal and paste an existing token there.
4. **Sync.** `npm run sync`. `unavailable` lists sections Canvas refused; that is
   not evidence that nothing exists there.
5. **Timetable.** Run `npm run timetable`. It takes the course codes from the Canvas
   sync and the public NUSMods data; lesson types with a single class are chosen
   automatically. If `needsChoice` is not empty, read the `unresolved` options in
   `.local/timetable.json` and ask the student, in ONE message, which class they
   are in for each (e.g. "CS2040 Tutorial: which class?"), then run
   `npm run timetable -- --choose "CS2040:TUT=12,LAB=3C"`. Choices are remembered.
   If the student prefers, a NUSMods share link (Timetable → Share/Sync) resolves
   everything at once: `npm run timetable -- "<link>"`. Codes in `missing` are
   Canvas sites that are not NUSMods modules for this semester; just report them.
6. **Documents.** `npm run documents` downloads new or changed PDFs and writes
   `.local/review-queue.json`. If `deferred` > 0, run it again later.
7. **Courseware review.** For each queue item follow
   [courseware review](references/courseware-review.md), then run
   `npm run review:check` until `rejected` is empty. `needsReview` and
   `quoteMismatches` are allowed but report them.
8. **GitHub login (the student acts).** Install the GitHub CLI if missing, then run
   `npm run github:login`. It finds `gh` even if the fresh install is not on PATH
   yet, and if not signed in opens a window where the student completes the web
   sign-in. Poll `.local/github-status.json` until `logged-in`. Never type or read
   the one-time code.
9. **Publish.** `npm run pack`, then `npm run publish`. The first publish creates a
   secret Gist and opens `.local/pairing.html` with a QR code. Tell the student:
   - Scan the QR with the iPhone Camera and open the link in Safari.
   - The page guides Share → Add to Home Screen (do it in the light/dark mode they
     normally use); opening NUS Study from the Home Screen pairs automatically.
   - Already installed? Tap 复制配对链接 on that page, then in the app
     设置 → 从剪贴板粘贴并配对.
   Ask them to confirm pairing. Never read or print the pairing link yourself.
10. **Schedule.** With the student's agreement, create ONE recurring task in your own
    scheduler (every 48 hours) that runs "Periodic refresh" below. Check for an
    existing task first; never create duplicates. If you have no scheduler, tell
    the student to ask you to run "Periodic refresh" every two days.

## Periodic refresh

1. `npm run sync`. On failure stop: do not publish. HTTP 401 means the token
   expired or was revoked — ask the student to run `npm run canvas:auto -- --replace`.
2. `npm run documents`, then review every item in the queue (only new or changed
   files appear) and run `npm run review:check`.
3. `npm run pack`, `npm run publish`. The phone keeps its pairing; the Gist may
   serve the previous version for up to ~5 minutes (`cdn-cache-pending`).
4. Report: courses synced, unavailable sections, files reviewed, records needing
   review, publish result. Do not claim success for a step that failed.

## When things change

- New semester: after the first sync of the new term, rerun `npm run timetable`
  (add `--sem 2` if needed) and ask about any new `needsChoice`.
- `npm run status` summarises local state at any time without secrets.
- To stop: delete the scheduled task; the student can delete the Gist on GitHub
  and unpair in the app (设置 → 取消配对并清除本机数据).
