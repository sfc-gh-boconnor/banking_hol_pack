# GOV4: Answer a customer's data request

| | |
|---|---|
| **Persona** | Governance / Risk |
| **Time** | ~40 min |
| **Prerequisites** | GOV1 |

## Business question
> A customer has asked for a copy of everything we hold about them. UK GDPR gives us a month, the search has to be reasonable and proportionate, and financial crime records can't simply be handed over. Can we answer it from the data itself, and prove who has seen it?

## What you'll build
- Copies of the customer tables in `GOVERNANCE`, with a `PERSONAL_DATA` tag on every personal column
- Stored procedure `DATA_REQUEST`: everything held about one customer, found from the tags
- `DATA_REQUESTS`: each request with its due date, the pack and an AI-drafted cover letter

## Steps
### Bring the customer data into GOVERNANCE
Where: the Cortex Code sidebar
```prompt
In BANKING_HOL.GOVERNANCE create table copies (CREATE OR REPLACE TABLE ... AS SELECT *) of these tables from BANKING_HOL.RAW_DATA, keeping their names: RB_CUSTOMERS, RB_ACCOUNTS, RB_TRANSACTIONS, RB_CALL_TRANSCRIPTS, RB_COMPLAINTS, RB_EMAILS, RB_FRAUD_CASES and RB_SAR_NARRATIVES. Show the row count of each.
```
Expect: eight tables; the sources in `RAW_DATA` stay read-only

### Tag personal data once, by kind
```prompt
In BANKING_HOL.GOVERNANCE create a tag PERSONAL_DATA with allowed values IDENTITY, CONTACT, FINANCIAL, COMMUNICATIONS, FINANCIAL_CRIME. Set it on: RB_CUSTOMERS first name, last name and date of birth (IDENTITY), address line 1 and postcode (CONTACT), annual income and credit score (FINANCIAL); RB_ACCOUNTS product and balance, RB_TRANSACTIONS amount and merchant (FINANCIAL); RB_CALL_TRANSCRIPTS transcript, RB_COMPLAINTS complaint text, RB_EMAILS body (COMMUNICATIONS); RB_FRAUD_CASES investigator notes and RB_SAR_NARRATIVES narrative (FINANCIAL_CRIME). Then show every tagged column in GOVERNANCE with its value.
```
Expect: 16 tagged columns. From now on, the tags say where personal data lives
Check: gov4_tagged

### Find everything about one customer
```prompt
In BANKING_HOL.GOVERNANCE create a table DATA_REQUESTS (REQUEST_ID, CUSTOMER_ID, RECEIVED_AT TIMESTAMP_LTZ, DUE_BY DATE, TABLES_FOUND, ROWS_FOUND, HELD_BACK, LETTER, PACK VARIANT). Then create a Python stored procedure DATA_REQUEST(CUSTOMER VARCHAR) returning VARIANT that: finds every table in GOVERNANCE with a CUSTOMER_ID column and at least one PERSONAL_DATA-tagged column (using INFORMATION_SCHEMA.COLUMNS and TAG_REFERENCES_ALL_COLUMNS, not a hard-coded list); for each that has rows for the customer, collects the tagged columns (up to 50 rows, bind the customer id); puts any table tagged FINANCIAL_CRIME in a held_back list instead, with only its row count; lists who read those tables in the last 30 days from SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY (flatten BASE_OBJECTS_ACCESSED in a CTE); drafts a short cover letter with AI_COMPLETE (claude-sonnet-4-5) that never mentions fraud or anything held back; and inserts a DATA_REQUESTS row with DUE_BY one month from today.
```
Expect: one procedure that finds the data from the tags, so a newly tagged table is included automatically
Check: gov4_proc

### Answer the request
```prompt
Call BANKING_HOL.GOVERNANCE.DATA_REQUEST('RB101023'), then show the newest row of DATA_REQUESTS: due date, tables found, rows found, how many tables were held back, and the letter.
```
Expect: about 5 tables and 50 records, 2 held back (a fraud case and a SAR), and a due date a month from today
Check: gov4_request

### Explain what was held back
```prompt
For the newest request in BANKING_HOL.GOVERNANCE.DATA_REQUESTS, explain in plain English which records were held back and why a bank would refer financial crime records to its money laundering reporting officer before releasing anything, and what a reviewer should check before the pack goes out.
```
Expect: the reason in plain words, for the person who signs the response off

## Check your work
`DATA_REQUESTS` has a row for RB101023 with a due date, the tables found, two held back, and a letter that doesn't mention them.

## In your bank
In production the tags sit on the source data products, set by classification, so every copy and pipeline inherits them, and the response goes through the bank's data protection review. The executive demo's "A customer asks for their data" stop is this module, finished.
