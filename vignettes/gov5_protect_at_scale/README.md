# GOV5: Protect personal data at scale

| | |
|---|---|
| **Persona** | Governance / Risk |
| **Time** | ~40 min |
| **Prerequisites** | GOV4 (or `setup/catchup/gov4_tags.sql`, which copies and tags the customer tables) |

## Business question
> Our customer tables hold names, dates of birth, incomes and complaint text. Analysts need to work with them, model risk needs to see how they are protected, and nobody wants to maintain a masking rule per column. Can we protect every personal column once, by what it is, and prove none is missed?

## What you'll build
- Three masking policies (text, numbers, dates) attached to the `PERSONAL_DATA` tag, so every tagged column is protected by role
- `MASKING_COVERAGE`: every personal column with the policy that protects it, and a gap flag
- `CUSTOMER_PROTECTED`: a shared customer view that carries the protection to anyone who reads it

## Steps
### Check the personal data is tagged
Where: Snowsight > Projects > Workspaces > + Add new > SQL File, role HOL_PARTICIPANT, warehouse BANKING_WH

Protection follows the tags, so check GOV4's tags are in place first.

1. Name the file `gov5_protect.sql`, then paste and run:
```sql
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
SELECT COUNT(*) AS TAGGED_COLUMNS
FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('BANKING_HOL.GOVERNANCE.RB_CUSTOMERS', 'table'))
WHERE TAG_NAME = 'PERSONAL_DATA';
```
Expect: 7 tagged columns.
**Important:** if the query fails or returns 0, GOV4 hasn't been done in this account. Fast-forward instead.

1. In the Lab Companion, find the **Fast-forward** card on this module page.
2. Press **Fast-forward**.
3. Wait for the green tick, then run the query again or press **Check prerequisites**.

### Protect each kind of data once
Where: the Cortex Code sidebar

One policy per data type, so a new column never needs a new rule. Each policy reads the tag value to decide how much to show.

```prompt
In BANKING_HOL.GOVERNANCE create three masking policies and do not ask me questions. MASK_PD_STRING takes a VARCHAR: HOL_ADMIN sees the real value; HOL_PARTICIPANT sees '[restricted]' when the column's PERSONAL_DATA tag (read with SYSTEM$GET_TAG_ON_CURRENT_COLUMN on BANKING_HOL.GOVERNANCE.PERSONAL_DATA) is FINANCIAL_CRIME, the first character plus '****' for IDENTITY, the first three characters plus '****' for CONTACT, and the real value otherwise; every other role sees '****'. MASK_PD_NUMBER takes a NUMBER: HOL_ADMIN sees the real value; HOL_PARTICIPANT sees it rounded to the nearest 1000 when it is 10000 or more, nearest 10 when it is 100 or more, otherwise to a whole number; every other role sees NULL. MASK_PD_DATE takes a DATE: HOL_ADMIN sees the real value; HOL_PARTICIPANT sees 1 January of the same year; every other role sees NULL. Test the role with CURRENT_ROLE().
```
Expect: three policies in `GOVERNANCE`, none attached yet

### Attach them to the tag, not to columns
```prompt
Attach MASK_PD_STRING, MASK_PD_NUMBER and MASK_PD_DATE to the tag BANKING_HOL.GOVERNANCE.PERSONAL_DATA with ALTER TAG ... SET MASKING POLICY, one statement each. Then grant SELECT on all tables in BANKING_HOL.GOVERNANCE to the role HOL_RESTRICTED.
```
Expect: every tagged column is protected at once, with no per-column statements
Check: gov5_policies

### See what each person sees
```prompt
Show 3 rows of BANKING_HOL.GOVERNANCE.RB_CUSTOMERS with FIRST_NAME, LAST_NAME, DATE_OF_BIRTH, POSTCODE, ANNUAL_INCOME_GBP and CREDIT_SCORE, first as my current role and then after USE SECONDARY ROLES NONE and USE ROLE HOL_RESTRICTED. Switch back to HOL_PARTICIPANT at the end, and explain the difference.
```
Expect: as the builder, `M****`, a date of 1 January, a postcode cut to three characters and rounded income; as `HOL_RESTRICTED`, `****` and NULLs
**Tip:** run `USE SECONDARY ROLES NONE` before switching role. Otherwise your other roles stay active and nothing looks masked.

### Prove no personal column is missed
```prompt
In BANKING_HOL.GOVERNANCE create a view MASKING_COVERAGE with one row for every column tagged PERSONAL_DATA in the eight tables RB_CUSTOMERS, RB_ACCOUNTS, RB_TRANSACTIONS, RB_CALL_TRANSCRIPTS, RB_COMPLAINTS, RB_EMAILS, RB_FRAUD_CASES and RB_SAR_NARRATIVES. Columns: TABLE_NAME, COLUMN_NAME, TAG_VALUE, POLICY_NAME and STATUS ('PROTECTED' when a masking policy applies, otherwise 'GAP'). Build it from INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS and INFORMATION_SCHEMA.POLICY_REFERENCES for each table, then show the count by STATUS.
```
Expect: 16 protected columns and no gaps

### Tag a new column and see it protected
```prompt
In BANKING_HOL.GOVERNANCE.RB_CUSTOMERS set the tag PERSONAL_DATA = 'FINANCIAL' on TOTAL_DEBT_GBP. Without creating any policy, query MASKING_COVERAGE again, then show TOTAL_DEBT_GBP for 3 customers as HOL_RESTRICTED (use USE SECONDARY ROLES NONE first) and switch back to HOL_PARTICIPANT.
```
Expect: 17 protected columns, and `TOTAL_DEBT_GBP` is NULL for `HOL_RESTRICTED`
Check: gov5_coverage

### Share a protected data product
```prompt
In BANKING_HOL.GOVERNANCE create a view CUSTOMER_PROTECTED joining RB_CUSTOMERS to RB_ACCOUNTS on CUSTOMER_ID, with CUSTOMER_ID, FIRST_NAME, LAST_NAME, DATE_OF_BIRTH, POSTCODE, ANNUAL_INCOME_GBP, CREDIT_SCORE, PRODUCT and BALANCE_GBP. Grant SELECT on it to HOL_RESTRICTED, then show 3 rows as HOL_RESTRICTED (USE SECONDARY ROLES NONE first) and switch back.
```
Expect: the view returns rows, with the policies applied to the underlying columns
Check: gov5_view

## Check your work
`MASKING_COVERAGE` shows 17 protected columns and no gaps. `HOL_RESTRICTED` sees `****` and NULLs through `CUSTOMER_PROTECTED`. `HOL_ADMIN` sees real values.

## In your bank
Classification sets the `PERSONAL_DATA` tag on the Iceberg source tables, and the three policies are owned by the data governance team. Every copy, view, semantic view and agent then inherits the protection, because Cortex agents run as the user. Network rules and policies, which control where data can be reached from, are set by the platform team and shown on the **Architecture** page.
