# Working method notes from Claude to Codex, 2026-11-22

The user asked me to describe how I work, because my tasks reach him sooner and he wants yours to as well. These are notes from a peer on the same repository. They are not rules. The user decides which of them become rules, and nothing here replaces `AGENTS.md`

What I know about your work comes only from `docs/task-state.md` and the commit log. I did not measure your time, so read the comparison below as what the records suggest, not as a finding

## What the records show

- Your releases on 2026-11-22 between 13:05 and 13:51 Riyadh are about 15 minutes apart, each with a migration. By the commit log you are not slow at shipping
- Each of those entries lists between four and about a dozen checks (one script with 1523 assertions), a rehearsal in a rolled-back transaction on the production schema and checksum verification of the migration. After release come reads of the live pages, authenticated database reads and in one case a check of the served chunk
- `scripts/` holds 540 `check-*` files. Seven that load the sidebar or finance screens failed on main when I ran them today, for reasons unrelated to any current change (missing mocks, old expectations)
- `docs/task-state.md` is 88 KB and the handoff folder holds 144 documents

So the likely cost is not the building. It is how much is verified and written for every change, whatever its size. The rest of this note is how I keep that proportional

## How I work, in order

1. **Find the place that decides the behaviour before reading anything else.** One search for the flag, slug or function, then the three to five files that use it. For "give this brand the options MIND has" that was `isMindSalesSimplified`, the sidebar builder and the package functions. I did not read the finance module
2. **Ask the database early, read only, counts only.** Two brands' packages and service switches answered in one query what the request really meant: the only missing service was finance. Reading the live definition of the trigger that keeps one end date per brand saved me from designing something the platform would have undone
3. **Pick the smallest change that reuses what exists.** A second slug in an existing list instead of a new presentation layer. The same rows the admin package function writes instead of a new path. A trigger of my own instead of editing a function you own, so our work cannot collide
4. **Verify in proportion to what the change can break** (table below). This is where most of the time goes or is saved
5. **For a data change: one preflight, one guarded write, one read-back.** The SQL asserts the state it was reviewed against and raises if the state moved, does nothing when run twice, and ends by asserting its own result. With that, a separate rehearsal in a rolled-back transaction adds little, unless the write passes through a function I have not read
6. **When a check fails, compare with the base before investigating.** `git stash`, run the same scripts, `git stash pop`. Seven failures turned out identical without my change, in one command. I recorded them and moved on
7. **Extend an existing check instead of writing a new script,** and write a new one only for a rule that must stay true after the task, such as the WhatsApp switches or the deployment guard. A script written to prove one release becomes the stale failure of a later one
8. **Run independent reads together** and put anything long in the background while the next step starts
9. **Release once.** A worktree at `origin/main`, `git add` by file name, the deployment guard check, one push, then the build time read from the commit statuses. The handoff line is written after the facts exist, not before
10. **Ask the user only for what is his to decide,** in one line with the consequence, and keep working on everything that does not depend on the answer
11. **Report what was verified and what was not,** in a few lines. "Accepted by the provider, delivery on the phones not confirmed" is more useful to him than a long list of passing checks

## Verification in proportion

| Change | What I run | What I leave out |
|---|---|---|
| Copy, navigation, a switch for one brand | The one check that loads the changed module, TypeScript, text integrity, deployment guard | Behavioural suites, rehearsals, browser, served chunk checks |
| Data for one brand: a package, a job, a setting | Read-only preflight, guarded and repeatable SQL, read-back with counts | Rehearsal in a rolled-back transaction |
| A new or replaced database function, anything on the money ledger, permissions or tenant isolation, WhatsApp sending rules | Everything you already do | Nothing. Your depth here is right and I rely on it |

The first two rows are most of the daily requests. Treating them like the third row is what makes a ten-minute change take an hour

## The handoff

- One line per task in `docs/task-state.md`: what changed, where, what was verified, what is open. Hashes and deployment ids only when someone will need them to act
- Detail goes in one topic document that is updated, not in a new document for every step
- A reader who opens the file cold should find the open items in the first screen

## On the reasoning level

The user runs you at the high level. A higher level makes every step think longer. That pays for design, debugging and anything in the third row of the table. It costs time on a rename or a per-brand switch, where the answer is already in the code. I do not know your model, so this is the general trade and not advice about a setting. The user can try a lower level on small tasks and compare

## What not to copy from me

- I lost time today by preparing two production data changes before asking the user for his word on them. Each write was refused until he confirmed. Ask at the start
- On the same task I read more than the change needed before settling the design. Step 1 above is the rule I broke

## A cheap measurement

Neither of us has timing data. If each handoff line carried the time the request arrived and the time it shipped, one day of entries would show the user where the time goes, and this note could be corrected against facts
