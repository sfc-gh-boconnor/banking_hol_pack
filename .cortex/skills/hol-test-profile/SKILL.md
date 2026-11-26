---
name: hol-test-profile
description: "Maintain the non-secret account profile captured by the Banking HOL manual test checklist. Use when adding, changing or reviewing cloud, region, Snowflake edition, account restrictions or tester-environment notes."
---

# Banking HOL Test Profile

Capture the environment used for a manual lab test so failures can be reproduced and account limitations are not mistaken for lab defects.

## When To Use

Use this skill when the user asks to:

- Update a manual-test account profile
- Record cloud, region or Snowflake edition
- Record account restrictions or unavailable features
- Prepare a fork for independent lab testing
- Make manual-test feedback reproducible

The profile belongs in the local manual-test results file, not in a URL and not in Snowflake credentials.

## Workflow

### 1. Inspect the current profile

Read:

- `tester-feedback/manual-test-results.json`, if present
- `tools/manual-test/index.html`
- `tools/manual-test/README.md`

The profile is stored under `profile` in the results JSON:

```json
{
  "profile": {
    "cloud": "AWS",
    "region": "us-west-2",
    "edition": "Enterprise",
    "restrictions": "No external access integration",
    "notes": "Notebook and Postgres modules not tested"
  }
}
```

Preserve the tester, account, module results, comments and submission metadata. Do not overwrite test results while updating the profile.

### 2. Collect only non-secret environment facts

Use the manual-test page fields when available:

- Cloud: AWS, Azure or GCP
- Region: provider region, such as `us-west-2`
- Snowflake edition: account edition, such as `Enterprise`
- Restrictions: concise limitations affecting module coverage
- Notes: optional details about enabled features or test scope

Do not collect or store:

- Passwords
- Tokens
- Private keys
- Connection strings
- Hostnames or application URLs
- User secrets
- Raw query results containing account data

If a user provides a secret, do not write it to the profile. Tell them to remove it and record only the relevant capability restriction.

### 3. Update through the manual test app when possible

Start the local checklist from the repository root:

```bash
node tools/manual-test/server.mjs
```

Open `http://localhost:4400`, update **Test profile**, and leave the URL unchanged. The page autosaves the profile into `tester-feedback/manual-test-results.json`.

If updating the file directly is necessary, preserve valid JSON and retain all existing `modules` entries:

```bash
node -e 'JSON.parse(require("fs").readFileSync("tester-feedback/manual-test-results.json", "utf8")); console.log("valid")'
```

### 4. Interpret restrictions

Record a restriction when it changes what can be tested, for example:

- Trial or feature-limited account
- No external access integration
- No compute pool or notebook service
- No Postgres or Data Mirroring
- Marketplace listing unavailable
- Cortex model or AI feature unavailable
- Missing role privileges
- Region or cloud-specific behaviour
- No permission to deploy an Application Service

A restriction explains a blocked test; it does not automatically prove a lab defect. Reproduce the issue on a supported account before changing lab content or checks.

### 5. Validate

Confirm:

- The profile is under `profile`, not in the URL or module comments.
- Existing tester feedback and module results are unchanged.
- The JSON parses successfully.
- No credential-like values were added.
- The profile describes the environment at the time of testing.

Run the manual app and confirm the fields reload after a restart if the profile was edited directly.

## Stopping Points

- Stop and ask before recording any value that might be a credential, connection detail or private account identifier.
- Stop before committing `tester-feedback/`; these files are local test artifacts unless the user explicitly asks to commit them.
- Stop before using a profile restriction to alter a lab module. First distinguish account capability from a genuine lab issue.

## Output

Report:

- Which profile fields were updated
- Which restrictions affect module coverage
- Whether existing results were preserved
- Whether the JSON and local app were validated
- Any modules that remain untested because of account limitations
