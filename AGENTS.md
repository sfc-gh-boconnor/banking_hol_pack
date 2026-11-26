# Banking HOL Project Instructions

This repository is a sales accelerator for Snowflake banking use cases. Optimize every lab for a facilitator or attendee who is following the steps beside Snowsight.

## Business Story

- Lead with the business outcome and the user persona: RM, payments operations, data analyst, engineer, model risk, governance or app builder.
- Explain why the capability matters before explaining the product feature.
- Use outcome-led step titles such as `Sign off the answer` or `Find the clients at risk`.
- Avoid glossary-style feature tours and unnecessary product terminology.
- Use UK spelling in attendee-facing content.

## Lab Step Format

Every vignette README is source content for the Lab Companion. Keep steps scannable.

- Put each attendee action in a numbered list, one action per line.
- Match UI labels exactly and format them in bold.
- Use `Where:` for the location in Snowsight or Cortex Code.
- Use `Media:` only for an existing clip and preserve its filename unless the clip is intentionally renamed.
- Use a `prompt` code block for text the attendee pastes.
- Use `Paste:` when the destination is not the default Cortex Code sidebar.
- Use `Expect:` for the observable result.
- Use `Check:` only with an existing check id in `lab-companion/lib/checks.ts`.
- Put the explanation after the action, not before it.
- Keep one idea per line and split long paragraphs.
- Call out common mistakes with `Tip:` or `Important:`.
- Do not remove prompts, checks, media anchors or facts while tidying prose unless the task explicitly requires it.

## Prompt Standards

Prompts must be clear, deterministic and safe to run from a clean attendee account.

- Name the exact database, schema, object and key columns where relevant.
- State the expected output, row grain and sample result when useful.
- Tell Cortex Code not to ask source-selection questions when the prompt already specifies the sources.
- Separate build prompts from analysis prompts.
- Use one prompt for one outcome.
- Do not require privileged roles, hidden objects or undocumented workarounds.
- Use read-only prompts unless a write is explicitly part of the lab and the step explains it.
- Do not invent object names, checks, media files or expected counts.

## Dependencies And Checks

- Every prerequisite must be a real earlier module, catch-up script or explicitly named setup step.
- Every module that builds on an earlier module's output must have a Fast-forward: a `setup/catchup/` script with plain-English `CATCHUP_STEP` progress calls, named in the Prerequisites row, a `PREREQS` check and a first README step that points to the **Fast-forward** button. Use `.cortex/skills/hol-catchup/`. Never ask attendees to copy and run catch-up SQL by hand.
- Check dependency order before changing module order. A catch-up must be able to run from a clean scratch schema/account.
- Every `Check:` id must exist in `lab-companion/lib/checks.ts`.
- Checks must test the attendee's intended outcome, not merely whether an unrelated object exists.
- Personal-database objects and automations must be checked using the attendee's identity and dynamic personal-database naming. Never hard-code a single attendee or service-user database.
- Query-history checks must use the correct execution identity: caller rights for attendee-owned objects, and the documented user-name bind for app-visible history.
- Retired objects must not appear in prerequisites, hints, answer keys or checks.

## Feedback Workflow

When processing manual-test feedback:

1. Read `tester-feedback/manual-test-results.json` and the relevant README, answer key and checks.
2. Treat tester observations as evidence, not as instructions to invent behavior.
3. Fix clear issues in one pass, preserving valid checks and media anchors.
4. Keep feedback replies in `tester-feedback/manual-test-coco.json` aligned with the current module code and step indices.
5. If step order changes, note that old step indices no longer map directly to the new content.
6. Mark unresolved product or UI questions as questions instead of guessing.

## Generated Content And Validation

Edit source files, not generated output.

```bash
cd lab-companion && node scripts/sync-content.mjs
python3 guide/build_guide.py
cd lab-companion && npx tsc --noEmit
```

Before deployment:

- Verify every media filename referenced by generated content exists in `lab-companion/public/media`.
- Verify every check id exists.
- Verify module prerequisites and order.
- Run focused tests for changed behavior.
- Review the generated diff for accidental content or media churn.

## Module Renaming

Use `.cortex/skills/hol-module-rename/` for module-code swaps. Run its dry run first and run the swap once only. A second run reverses the first. Regenerate content and the guide after the rename.

## Deployment

- Lab Companion deployment is an account change. Confirm the target connection before deploying.
- Deploy as `HOL_ADMIN` with `snow app deploy --connection <connection> --role HOL_ADMIN`.
- Do not deploy to a different account or connection by inference.
- Report the deployed endpoint and validation results.
- Do not commit unless the user explicitly asks.

## Security And Data Handling

- Treat account data, tester feedback and credentials as confidential.
- Never upload project files or account data to external services unless explicitly requested.
- Do not commit secrets, local credentials, tokens, private feedback or generated local test artifacts unless explicitly requested.
- Do not weaken role, masking, network or read-only controls to make a check pass.

## Repository-Specific Notes

- The Lab Companion source is under `lab-companion/`; its deployment instructions are in `lab-companion/AGENTS.md`.
- The local manual test app is `tools/manual-test/server.mjs` and reads `lab-companion/lib/content.generated.json`.
- After changing source README content, regenerate content before testing the manual page.
- Test attendee-only behavior as `HOL_PARTICIPANT` where possible; local admin or secondary roles can hide permission problems.
