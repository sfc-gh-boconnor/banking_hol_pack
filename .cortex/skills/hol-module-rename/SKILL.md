---
name: hol-module-rename
description: Swap or rename Banking HOL module codes (for example DA1 <-> DA2) across folders, files, text, media clips, check ids and saved manual-test results, then regenerate and redeploy the Lab Companion. Use when a module code, folder or order must change.
---

# Banking HOL: rename or reshuffle module codes

A module's code comes from its folder prefix (`vignettes/da1_aisql_feedback` is `DA1`). The Lab Companion sorts modules by folder name, so renaming folders is what changes the app order. Text, clips, check ids and saved results all point at the codes, so a rename touches all of them.

`references/swap-codes.mjs` does the file moves and text swap in one pass. Use it, not hand-written one-off scripts.

## Rules

- **Run the swap once.** The text swap is its own inverse, so a second run flips everything back. Dry-run first (`--dry`), and never re-run a half-finished swap. If a run fails, check the state against git HEAD (step 4) before touching anything.
- **Don't touch history.** Leave `tester-feedback/` comments as the tester wrote them and leave `.snowflake/` plans alone. Only the JSON module keys in `tester-feedback/manual-test-*.json` move.
- **Generated files are rebuilt, not edited.** `lab-companion/lib/content.generated.json` and `guide/index.html` come from `sync-content.mjs` and `build_guide.py`.
- **Confirm before deploying.** The Lab Companion deploy needs the connection and the user's go-ahead.

## Workflow

### 1. Inventory

```bash
git grep -n -E "\bDA[12]\b|da[12]_" -- ':!.snowflake' ':!tester-feedback' | head -80
find media/out lab-companion/public/media media/scripts -name "da[12]_*"
```

Note every folder, notebook, script and clip name that changes, and any check id in `lab-companion/lib/checks.ts`.

### 2. Dry run

```bash
node .cortex/skills/hol-module-rename/references/swap-codes.mjs --pairs DA1:DA2 --dry
```

Check the list of moves and the count of text files. The `--pairs` argument takes any number of `A:B` pairs, comma separated.

### 3. Run it once

```bash
node .cortex/skills/hol-module-rename/references/swap-codes.mjs --pairs DA1:DA2
```

### 4. Verify against HEAD

For each tracked file, compare the current content with `git show HEAD:<old path>` after the same swap. Expect every file to be swapped. Files with uncommitted edits from earlier work won't match HEAD exactly, so check those by hand (headings, table rows, prerequisites).

Quick checks:

```bash
git grep -l -E "da1_semantic|da2_aisql" -- ':!.snowflake' ':!tester-feedback'   # should be empty except the generated file
head -1 vignettes/*/README.md
```

### 5. Regenerate and check

```bash
cd lab-companion && node scripts/sync-content.mjs && npx tsc --noEmit
cd .. && python3 guide/build_guide.py
```

Confirm every clip the content references exists in `lab-companion/public/media`. Confirm the module order with:

```bash
node -e 'const j=require("./lab-companion/lib/content.generated.json");console.log((j.modules||j).map(m=>m.code).join(" "))'
```

### 6. Deploy

Ask for the connection, then:

```bash
cd lab-companion && snow app deploy --connection <conn> --role HOL_ADMIN
```

## Gotchas

- **Stale copies.** If a script writes text to an old path after moving the file, it recreates the old file with swapped text. Write text only at new paths, after the move.
- **Mixed state after a failed run.** Files can be half swapped. Classify each one against HEAD before repairing, and fix only what is wrong.
- **Module codes in prose.** Prose such as "scored in DA2" swaps with the code, which is the intent, but check the sentence still makes sense.
- **Check ids and clip names** (`da1_deployed`, `da1_create_sv.mp4`) are swapped too, so the app and the media stay in step.
- **Saved results.** Results and CoCo replies are keyed by module code. After a swap, the entry for the old DA1 moves to DA2 and so on. Their comment text still describes the old module by name.

## Output

The moves and text-file count, the verification result, the module order after regenerating, the clip check, and whether the app was redeployed.
