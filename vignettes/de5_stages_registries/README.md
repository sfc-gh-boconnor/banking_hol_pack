# DE5: Know where every file, model and app lives

| | |
|---|---|
| **Persona** | Platform / Data Engineer |
| **Time** | ~35 min |
| **Prerequisites** | None. Step 5 lists the models from DS1, so press **Fast-forward** on DS1 first if you skipped it |

## Business question
> A fraud investigator needs the police report and the phishing screenshot for one case, a regulator asks which models are in production, and an auditor asks who can reach the evidence. Can we answer all three from one governed place, without files and models scattered across shared drives?

## What you'll build
- `EVIDENCE_CATALOGUE`: every evidence file on the stage, with its case and type
- `EVIDENCE_SHARE`: a stage holding one case's files, readable by a role you choose
- `PLATFORM_INVENTORY`: every stage and registered model with its owner

## Steps
### Find where the files live
Where: the Cortex Code sidebar

Stages hold the files Snowflake works with: documents, images, notebooks and training code. Start by seeing what the lab has.

```prompt
List every stage in the database BANKING_HOL from BANKING_HOL.INFORMATION_SCHEMA.STAGES: schema, name, type and owner role. Then, for the stage BANKING_HOL.RETAIL.FINCRIME_EVIDENCE, show the file count and total size by file type from its directory table. Do not ask me questions.
```
Expect: six stages, and 150 evidence files across PDFs and PNG images

### Catalogue the evidence
```prompt
In BANKING_HOL.GOVERNANCE create a table EVIDENCE_CATALOGUE from DIRECTORY(@BANKING_HOL.RETAIL.FINCRIME_EVIDENCE): FILE_NAME (the relative path), CASE_ID (the part of the name before the first underscore), EVIDENCE_TYPE (the name without the case id and the file extension), FILE_FORMAT (PDF or PNG, upper case), SIZE_BYTES and LAST_MODIFIED. Then show the number of files per evidence type.
```
Expect: five evidence types: 50 police reports, 40 phishing texts, 31 booking confirmations, 19 damaged goods photos and 10 refund policy screenshots
Check: de5_catalogue

### Read a file straight from the stage
```prompt
Use AI_PARSE_DOCUMENT in OCR mode on the file FRC100054_police_report.pdf in @BANKING_HOL.RETAIL.FINCRIME_EVIDENCE with TO_FILE, and show the first 400 characters of the text.
```
Expect: a crime reference, the date reported and the offence, read from the PDF
**Tip:** the file is not copied anywhere. The stage is the single copy, and your read permission decides who can run this.

### Share one case with a role, and no more
```prompt
In BANKING_HOL.GOVERNANCE create a stage EVIDENCE_SHARE with a directory table and Snowflake-managed encryption. Copy the files whose names contain FRC100054 from @BANKING_HOL.RETAIL.FINCRIME_EVIDENCE into it with COPY FILES, refresh the directory table, and grant READ on the stage to HOL_RESTRICTED. Then, after USE SECONDARY ROLES NONE and USE ROLE HOL_RESTRICTED, count the files in DIRECTORY(@BANKING_HOL.GOVERNANCE.EVIDENCE_SHARE) and in DIRECTORY(@BANKING_HOL.RETAIL.FINCRIME_EVIDENCE), showing the error if one fails. Switch back to HOL_PARTICIPANT at the end.
```
Expect: 2 files in `EVIDENCE_SHARE`, and "does not exist or is not authorized" for the full evidence stage
Check: de5_share
**Important:** run `USE SECONDARY ROLES NONE` first, or your other roles still give access and nothing is denied.

### Keep one inventory of stages and models
Where: the Cortex Code sidebar

Models live in the Model Registry, the same governed place as the data. One inventory shows both.

```prompt
In BANKING_HOL.GOVERNANCE create a table PLATFORM_INVENTORY (OBJECT_TYPE, OBJECT_NAME, OWNER_ROLE, DETAIL) from two sources with UNION ALL: every stage from BANKING_HOL.INFORMATION_SCHEMA.STAGES as 'Stage' (schema.name, owner, stage type), and every row of BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS as 'Model version' (schema.model and version name, owner, and the model's functions as a comma-separated list). Show the count by OBJECT_TYPE.
```
Expect: stages and model versions, each with an owner role
Check: de5_inventory

### Answer the auditor
```prompt
Using BANKING_HOL.GOVERNANCE.PLATFORM_INVENTORY and SHOW GRANTS on the stage BANKING_HOL.RETAIL.FINCRIME_EVIDENCE, answer in plain English: which stages exist, which roles can read the evidence stage, which models are registered and who owns them. Then say what an auditor should ask next.
```
Expect: the evidence stage readable by `HOL_PARTICIPANT` and owned by `HOL_ADMIN`, and the attrition and margin models owned by the builder role

## Check your work
`EVIDENCE_CATALOGUE` has 150 files, `EVIDENCE_SHARE` holds the two files of case FRC100054 and is readable by `HOL_RESTRICTED`, and `PLATFORM_INVENTORY` lists stages and model versions.

## In your bank
Evidence, notebooks, training code and application artefacts sit on stages and in registries inside the same account as the data, so one set of roles governs all of them. Application and container images are held the same way, in image and artifact repositories. Lineage and access history, shown in GOV2, record who read each file.
