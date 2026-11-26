---
name: hol-banking-usecases
description: "Research current banking topics on the web (UK regulators, industry bodies, news) and turn them into new, sourced Banking HOL use cases built only from the lab's existing data and modules. Produces use case entries for the Lab Companion, optional regulation entries, and a facilitator brief with sources. Use when the HOL team wants fresh, real-world banking use cases or wants to refresh the lab's stories for an event. Not for other industries or a named bank."
---

# Banking HOL: research-led use cases

Finds what banks are dealing with now, then builds new use cases from what the lab already has. **No new data, modules or checks:** every use case is a new route through existing modules, so it works on every account without extra testing.

## Before you start

1. Run from the repo root (Cortex Code Desktop: this skill needs web search).
2. Read these so you only propose what the lab can do:
   - `lab-companion/lib/content.generated.json`: every module's `code`, `title`, `question` and `build` list.
   - `lab-companion/lib/use-cases.json`: the existing use cases (don't duplicate one). The `UseCase` type is in `lab-companion/lib/content.ts`.
   - `lab-companion/lib/regulations.ts`: the `Regulation` type, existing entries and the "verifiedOn" rule.
   - `lab-companion/lib/data-map.ts`: the tables and what they hold.
   - The demo stops in `lab-companion/lib/demo-stops.ts`: the only valid `demo.stop` values.
3. Write a short inventory for yourself: data products, the questions each module answers, and the demo stops. Every proposal must point at it.

## Workflow

### 1. Scope

Ask the user, one question each (with `ask_user_question`):
- **Business:** Retail, Corporate, or both.
- **How many** use cases to propose (default 5) and to build (default 2).
- **Time window** for news (default the last 12 months).
- **Focus**, optional (for example fraud, vulnerable customers, payments resilience, AI governance).

The lab is UK banking: use UK sources unless the user says otherwise.

### 2. Research

Use `web_search` with the current year in the query. Prefer primary sources, in this order:
1. Regulators and government: FCA, PRA and Bank of England, Payment Systems Regulator, ICO, HM Treasury, NCA.
2. Industry bodies: UK Finance, Pay.UK, Cifas, LINK.
3. Reputable news and analysis, only to show a topic is current.

For each finding, record: the claim in one sentence (your words), the source title, URL, the date you read it, and the publication date. Fetch the page with `web_fetch` before relying on a claim; a search snippet isn't enough.

Rules:
- Paraphrase. Never copy text, and never quote more than a short phrase.
- Don't state a figure, date or rule you haven't read in a fetched source.
- If sources disagree or a page is older than the time window, say so.

### 3. Shortlist

Turn the findings into candidate use cases. Each candidate must have:
- **Business question** in the bank's words, and why it matters now (with its sources).
- **Route through the lab:** 3 to 6 existing module codes in order, each with a one-line `why` that names the data it uses.
- **Demo stop:** an existing `tour`/`stop` pair that shows the finished result.
- **Fit:** strong (existing data answers it directly) or partial (say what's missing).

Reject a candidate if it needs data the lab doesn't have. List rejects separately as **gaps**, with the data they'd need: they're ideas for new modules later, not use cases now.

**Stop.** Show the shortlist as a table (title, business, modules, demo stop, fit, sources) plus the gaps, and ask which to build.

### 4. Draft

For each chosen use case:

1. **An entry in `lab-companion/lib/use-cases.json`**, appended to the array, matching the `UseCase` type exactly:
   - `id`: short kebab-case, unique.
   - `title`: an outcome in plain words, at most about 8 words.
   - `business`: `"Retail"`, `"Corporate"` or `"Every business"`.
   - `question`: one sentence, as a bank leader would ask it.
   - `outcome`: one or two sentences on what the attendee ends up with, naming the Snowflake features.
   - `roles`: from the personas the modules already use.
   - `steps`: the module codes from the shortlist, each with its `why`.
   - `demo`: the `tour` and `stop` from the shortlist.
   - `addedOn`: today's date (`YYYY-MM-DD`). Use cases added in the last 60 days show a **New** badge.
   - `whyNow`: 2 or 3 entries from the brief's "Why now", each `{ text, source: { label, url }, published, read }`, with dates as `YYYY-MM-DD` and an `https` source you fetched. The use case page shows them with their links.
2. **A regulation entry**, only if the use case rests on a regulation that isn't in `REGULATIONS` yet: add its id to `RegId`, then an entry that follows the file's rule. The `duty` paraphrases only the fetched primary source, `verifiedOn` is today's date, and `modules` and `demo` are existing ones.
3. **A facilitator brief** at `pathways/briefs/<id>.md`:
   - **Why now:** 3 to 5 bullets, each ending with its source as a markdown link.
   - **The story:** how to tell it to the room, in 3 or 4 short lines.
   - **Route:** the modules in order, with what to point out in each.
   - **Sources:** every source, with the publication date and the date read.

Writing style for all of it: UK spelling, plain words, short sentences, no em dashes, no emoji, and the `hol-step-layout` rules for anything attendees read.

### 5. Check

1. Every module code exists in `content.generated.json`, and every `demo` pair exists in `lib/demo-stops.ts`.
2. No `id` repeats an existing use case or regulation.
3. Every claim in a brief or regulation entry has a fetched source.
4. Run `cd lab-companion && node scripts/sync-content.mjs && npx tsc --noEmit`.
5. Optional: if the user names a lab account (ask which connection; never assume one), run each step module's main query to confirm the data exists and returns rows.

### 6. Report

- The use cases added, each with its route and demo stop.
- Any regulation entries added, and their sources.
- The briefs written.
- The gaps found (new module ideas).

**Stop** before committing, publishing to the public repo or redeploying the Lab Companion, and ask.

## How new use cases reach installed labs

No redeploy is needed. Once `use-cases.json` is published to the public repo:
- `BANKING_HOL.LAB.REFRESH_LAB_CONTENT_TASK` fetches the repo in every account at 05:00 UK time.
- The Lab Companion reads the file from that copy (`lib/use-cases.ts`), within 10 minutes.
- An entry that names a module or demo stop the running app doesn't have is skipped and logged, so a new module arrives only with the next redeploy.
- To show it straight away on one account, run `ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH;` as HOL_ADMIN.
- An account with `CONTENT_REFRESH = FALSE` in `BANKING_HOL.LAB.SETUP_CONFIG` is frozen and won't change.

## Stopping points

- After the shortlist (step 3): the user picks what to build.
- Before committing, publishing or redeploying.
- If a claim can't be sourced: leave it out and say so.
