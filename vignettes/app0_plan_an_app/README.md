# APP0: Plan an app with Cortex Code

| | |
|---|---|
| **Persona** | App Builder |
| **Time** | ~20 min |
| **Prerequisites** | Facilitator setup complete. No Git account needed. |

## Business question
> Fraud investigators get names from police reports, other banks and dispute forms, spelt every which way. They need one screen to see who each name probably is, what we know about that customer, and to record a decision. What should that app do, and what data does it need?

## What you'll build
- A one-page plan for a fraud investigator app, written with Cortex Code: who uses it, the screens, the data, the actions, and who can see what
- `APPS.FRAUD_REVIEW_QUEUE`: every outside name mention with its best candidate customer, the evidence (date of birth, town, name similarity) and the customer's fraud history
- `APPS.MATCH_DECISIONS`: an empty table the app will save each investigator decision to

## Steps
### Open Cortex Code
Where: Snowsight home page, the **Home / CoCo** toggle (top left) > **CoCo**
Media: app0_open_coco.mp4 | Home/CoCo toggle > CoCo > New session, then paste the planning prompt
1. At the top left of Snowsight, switch the toggle from **Home** to **CoCo**.
2. Close the **CoCo mode (preview)** pop-up if it appears.
3. Press **New session**.
**Tip:** everything in this pathway stays in your own Snowflake account. You don't need a Git account: Cortex Code and your workspace keep the code.
Expect: the Cortex Code screen with a **How can I help?** box

### Plan the app
```prompt
I want to build a Streamlit in Snowflake app for fraud investigators. They receive names from police reports, other banks' mule referrals, dispute forms and our watchlist, in BANKING_HOL.RAW_DATA.RB_NAME_MENTIONS (NAME_AS_WRITTEN, DOB_AS_WRITTEN, TOWN, SOURCE_DESCRIPTION), and need to decide which of our customers in BANKING_HOL.RAW_DATA.RB_CUSTOMERS each one is, using that customer's fraud cases in BANKING_HOL.RAW_DATA.RB_FRAUD_CASES. Look at those tables, then write a one-page plan: who uses the app, the screens (a queue and a review panel), the data each screen needs, the actions (confirm, reject, escalate), what gets saved and where (schema BANKING_HOL.APPS), and who should be able to see what. Don't build anything yet.
```
**Tip:** planning first is the quickest way to a good app. Push back on the plan in plain English ("investigators also need the customer's city") before anything is built.
Expect: a short plan with a queue screen, a review panel, three decision buttons, a decisions table in `BANKING_HOL.APPS`, and a note that a name match is a lead, not a fact

### Build the review queue
```prompt
Build the data for the plan as BANKING_HOL.APPS.FRAUD_REVIEW_QUEUE, one row per name mention. Find candidate customers whose LAST_NAME starts with the same 3 letters as the mention's surname (turn "SURNAME, First" round first). Score each candidate: 50 points if DATE_OF_BIRTH matches DOB_AS_WRITTEN (try DD/MM/YYYY and MM/DD/YYYY), 20 if the city matches TOWN, plus 0.3 times JAROWINKLER_SIMILARITY of the upper-cased names. Keep the best candidate per mention with its CUSTOMER_ID, name, city and date of birth, the evidence columns, SCORE, SUGGESTED (MATCH at 75 or more, REVIEW from 45, otherwise NO_MATCH) and CANDIDATE_FRAUD_CASES (how many RB_FRAUD_CASES that customer has). Then show the count of mentions by SUGGESTED.
```
Expect: about 300 mentions: around 165 MATCH, 60 REVIEW and 70 NO_MATCH, with a handful of REVIEW candidates who already have fraud cases
Check: app0_queue

### Create the decisions table
```prompt
Create an empty table BANKING_HOL.APPS.MATCH_DECISIONS for the app to save to: MENTION_ID, CUSTOMER_ID, DECISION (CONFIRMED, REJECTED or ESCALATED), NOTE, DECIDED_BY and DECIDED_AT defaulting to the current timestamp. Add a comment that DECIDED_BY is the app viewer, not the app owner.
```
**Important:** the app will run with its owner's rights, so `CURRENT_USER()` inside it returns the owner. The app must record the person using it from Streamlit (`st.user`), which APP1 does.
Expect: an empty `MATCH_DECISIONS` table in `BANKING_HOL.APPS`

## Check your work
`BANKING_HOL.APPS.FRAUD_REVIEW_QUEUE` has a suggested decision for every outside name mention.

## In your bank
In production the queue would come from AI5's Cortex Search matching once it's approved. The plain SQL scoring here works in any account and gives the investigator the same evidence to decide on.
