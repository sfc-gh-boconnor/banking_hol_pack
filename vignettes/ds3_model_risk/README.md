# DS3: Model risk evidence pack

| | |
|---|---|
| **Persona** | Data Scientist |
| **Time** | ~40 min |
| **Prerequisites** | DS1, or `setup/catchup/ds1_model.sql` |

## Business question
> Model risk will ask what this model is, who owns it, what it may be used for, how well it really works, why we picked it over the alternative, and who approved it. Can we answer from the platform the model runs on, instead of a slide deck that's out of date by the next release?

## What you'll build
- `ML.MODEL_INVENTORY` from the Model Registry, with owner, permitted use, risk tier and status
- `ML.MODEL_VALIDATION` (predicted vs actual leavers) and `ML.MODEL_CHALLENGERS` (every experiment run)
- `ML.MODEL_CARD` drafted by AI from that evidence, and `ML.MODEL_APPROVALS` with the decision and its conditions

## Steps
### Put the model on the inventory
Where: the Cortex Code sidebar
```prompt
Run SHOW VERSIONS IN MODEL BANKING_HOL.ML.RB_ATTRITION_MODEL, then create a table BANKING_HOL.ML.MODEL_INVENTORY from its result (RESULT_SCAN of LAST_QUERY_ID) with MODEL_NAME, VERSION, IS_DEFAULT, PURPOSE (the version comment), FRAMEWORK (from model_attributes), AUC (from metadata metrics), REGISTERED_ON, and these fixed values cast to VARCHAR: OWNER 'Retail Analytics', PERMITTED_USE 'Rank customers for retention offers; never used to refuse a product or set a price', RISK_TIER 'MEDIUM', TRAINING_DATA 'ML.RB_CHURN_FEATURES (observed 2026-08-31, label: left by 2026-11-30)', STATUS 'PENDING_VALIDATION'. Show it.
```
Expect: one row per registered version, with the registry's own metrics next to what model risk needs
Check: ds3_inventory

### Validate it against what really happened
```prompt
Create a table BANKING_HOL.ML.MODEL_VALIDATION comparing the model's average CHURN_PROBABILITY in ML.RB_ATTRITION_SCORES with the actual leave rate (CHURNED_NEXT_3M in ML.RB_CHURN_FEATURES), as percentages, with columns CUT, GROUP_NAME, CUSTOMERS, PREDICTED_PCT and ACTUAL_PCT: one set of rows by RISK_BAND and one by SEGMENT. Show it, and tell me in two sentences whether the model ranks customers well and whether its probabilities can be taken at face value.
```
Expect: the high band leaves far more often than the low band (it ranks well), but the predicted rates sit well above the actual ones (balanced class weights inflate them)
Check: ds3_validation

### Compare the champion with the challenger
```prompt
Run SHOW RUN METRICS IN EXPERIMENT BANKING_HOL.ML.RB_ATTRITION and pivot it into a table BANKING_HOL.ML.MODEL_CHALLENGERS with one row per run (RUN_NAME, AUC, AVG_PRECISION, LIFT_TOP_DECILE, PRECISION_TOP_DECILE). Mark which run is the registered default (its name starts the default version's comment in MODEL_INVENTORY) and explain the trade-off between the two runs.
```
Expect: two runs; the one with the higher AUC isn't necessarily the one with the best lift in the top decile, which is the number a retention team acts on

### Draft the model card
```prompt
Create a table BANKING_HOL.ML.MODEL_CARD with one row for the default version in MODEL_INVENTORY: MODEL_NAME, VERSION, DRAFTED_AT and CARD, a plain-English model card under 200 words written by AI_COMPLETE (claude-sonnet-4-5) from MODEL_INVENTORY, MODEL_VALIDATION and MODEL_CHALLENGERS only, as labelled lines: Purpose, Permitted use, Data, Performance, Champion vs challenger, Known limitations, Conditions for use. Show the card.
```
Expect: a card that says what the evidence says, including the calibration limitation

### Record the decision
```prompt
Create a table BANKING_HOL.ML.MODEL_APPROVALS (MODEL_NAME, VERSION, DECISION, CONDITIONS, APPROVER, DECIDED_AT) and insert a row for the default version: decision APPROVED_WITH_CONDITIONS, conditions 'Use for ranking only: probabilities run high against actual outcomes, so recalibrate before quoting them. Review quarterly.', approver CURRENT_USER(). Then update MODEL_INVENTORY.STATUS from the decision and show the inventory with the approval.
```
Expect: the inventory now says who approved the model, when, and on what conditions
Check: ds3_approval

## Check your work
`MODEL_INVENTORY` shows `RB_ATTRITION_MODEL` as `APPROVED_WITH_CONDITIONS`, and `MODEL_VALIDATION` and `MODEL_CARD` explain why.

## In your bank
SS1/23 sets the PRA's expectations for UK banks with internal-model approval for regulatory capital, across all their model types, and expects validation to be independent of the people who built the model. In production the inventory would cover every model, read straight from the registry, and monitoring would add drift over time. The executive demo's "Every model on the record" stop is this module, finished.
