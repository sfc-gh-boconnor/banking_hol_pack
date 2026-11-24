# DS4: Calibrate the attrition model and predict customer margin

| | |
|---|---|
| **Persona** | Data Scientist |
| **Time** | ~45 min |
| **Prerequisites** | DS1, or `setup/catchup/ds1_model.sql` (uses `ML.RB_CHURN_FEATURES` and the `RB_ATTRITION` experiment) |

## Business question
> The retention team wants to put a value on every customer at risk. Are DS1's churn scores real probabilities they can multiply by money, and how much will each customer actually be worth over the next few months?

## What you'll build
- Two new runs in experiment `ML.RB_ATTRITION`, comparing DS1's class-weighted XGBoost with an isotonic-calibrated one on AUC, Brier score and calibration error
- A calibrated version of `ML.RB_ATTRITION_MODEL` in the Model Registry, registered as a challenger (not the default)
- Experiment `ML.RB_MARGIN`: a "margin stays flat" baseline against Ridge and XGBoost models of next-3-month margin
- Model `ML.RB_MARGIN_MODEL` in the Model Registry
- Table `ML.RB_CUSTOMER_PREDICTIONS`: every customer's calibrated chance of leaving and predicted monthly margin, which DA5 turns into lifetime value and value at risk

## Steps
### Open the starter notebook
Where: the **banking-hol-pack** Workspace > file explorer > `notebooks/ds4_customer_value.ipynb`
1. Open `notebooks/` > **ds4_customer_value.ipynb**.
2. Connect it to the notebook service you made in DS1 (the arrow next to the status dot > **Select service**, usually `USER_SERVICE_1`). No service yet? Create one as in DS1: **NOTEBOOK_POOL**, **1 hour**, **HOL_NOTEBOOK_ACCESS_INTEGRATION** (leave it empty on a trial account).
3. Check the role is **HOL_PARTICIPANT** and the warehouse is **BANKING_WH**.
4. Open the **Cortex Code** sidebar (round button, bottom right). You'll paste each step's prompt there.
Expect: the starter notebook open with four numbered headings

### Are the scores probabilities?
Where: the Cortex Code sidebar, with `ds4_customer_value` open
A score can rank customers well and still not be a probability. DS1 trained XGBoost with `scale_pos_weight` to handle the imbalance, which pushes its scores up.
```prompt
In the open notebook ds4_customer_value, put each cell I ask for under its matching numbered heading. Under heading 1, add a SQL cell named score_check that joins BANKING_HOL.ML.RB_ATTRITION_SCORES to RB_CHURN_FEATURES and shows, for each of 10 score deciles, the customer count, the average CHURN_PROBABILITY and the share who actually left (CHURNED_NEXT_3M). Then add a Python cell named reliability that draws the same as a reliability chart: average score against actual leave rate per decile, with the diagonal for a perfectly calibrated model. Run both.
```
Expect: the points sit far above the diagonal. The top decile's average score is far higher than the share who really left (2% leave overall). The model ranks well; its numbers just aren't probabilities.

### Calibrate, and track it
Where: the Cortex Code sidebar
```prompt
Under heading 2, add a Python cell named calibrate that sets the session's database and schema to BANKING_HOL.ML and runs the training as a Snowflake ML Job with the @remote decorator from snowflake.ml.jobs (compute pool DS_TRAINING_POOL, stage BANKING_HOL.ML.JOB_STAGE). Inside the job: read RB_CHURN_FEATURES into pandas, split 70/30 stratified (random_state 42), and train two scikit-learn pipelines on the same features as DS1: XGBoost with scale_pos_weight (DS1's approach) and XGBoost without it wrapped in CalibratedClassifierCV with method isotonic and cv 3. Track each as a run in the experiment RB_ATTRITION with snowflake.ml.experiment.ExperimentTracking, with timestamped run names, logging AUC, Brier score, calibration error (the size-weighted average gap between predicted and actual leave rate across 10 score deciles), mean predicted and actual leave rate. Log the calibrated model to the Model Registry as a new version of RB_ATTRITION_MODEL with conda_dependencies scikit-learn and xgboost, target platform WAREHOUSE and a comment saying it is a calibrated challenger, and do not make it the default. Return the metrics, submit the job, wait and print the result. Run it.
```
**Tip:** a calibrator wraps the pipeline, which hides XGBoost from the registry's dependency detection. Naming `conda_dependencies` avoids a "No module named xgboost" error when it registers.
Then compare the runs: **AI & ML > Experiments** > **RB_ATTRITION**, tick the two new runs, **Compare**.
Expect: similar AUC (the ranking barely changes), but the calibrated run's Brier score and calibration error are far lower, and its mean predicted leave rate matches the actual rate of about 2%
Check: ds4_calibrated

### Predict margin, against a baseline
Where: the Cortex Code sidebar
Lifetime value needs a margin per customer. The simplest assumption is that next month looks like the last 12: that's the baseline any model has to beat.
```prompt
Under heading 3, add a Python cell named margin that runs as an ML Job the same way. Inside the job: build a training set from RB_CHURN_FEATURES plus, from BANKING_HOL.RAW_DATA.RB_MONTHLY_SNAPSHOT up to 31 Aug 2026, each customer's average monthly PROFIT_GBP over the last 3 and last 12 months and average REVENUE_GBP and COST_TO_SERVE_GBP over the last 3 months. The target MARGIN_NEXT_3M is their average monthly PROFIT_GBP in the 3 months after 31 Aug 2026, excluding churned months; train only on customers who have it. Split 70/30 (random_state 42). In a new experiment RB_MARGIN, log a run for the flat baseline (the last-12-month average as the prediction), then Ridge and XGBoost regressors (reg:absoluteerror) as scikit-learn pipelines, each with mean absolute error, MAE against the baseline in percent and total error in percent. Register the model with the lowest MAE as RB_MARGIN_MODEL (conda_dependencies scikit-learn and xgboost, target platform WAREHOUSE, a comment naming the experiment), make it the default, and return the metrics. Run it.
```
Expect: the flat baseline is hard to beat. A simple linear model edges it (a few percent lower error); XGBoost may do worse. Register the one that wins, not the one that sounds cleverest.
Check: ds4_margin_model

### Score every customer with both models
Where: the Cortex Code sidebar
```prompt
Under heading 4, add a Python cell named predictions that scores every customer in RB_CHURN_FEATURES with the calibrated version of RB_ATTRITION_MODEL (predict_proba) and the default version of RB_MARGIN_MODEL (predict, on the same inputs as training), and writes CUSTOMER_ID, CHURN_3M, PREDICTED_MONTHLY_MARGIN_GBP and both model version names to BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS. Then add a SQL cell named prediction_summary showing the customer count, average CHURN_3M against the actual leave rate, and total predicted monthly margin. Run both.
```
Expect: about 18,400 customers, an average chance of leaving of about 2% (matching what really happened), and about £20 of predicted margin per customer a month
Check: ds4_predictions

## Check your work
- Experiment `RB_ATTRITION` has the calibrated run, and `RB_ATTRITION_MODEL` has a calibrated version that isn't the default
- Experiment `RB_MARGIN` has a baseline and at least one model, and `RB_MARGIN_MODEL` is registered
- `RB_CUSTOMER_PREDICTIONS` has a calibrated chance of leaving and a predicted margin for every customer

## In your bank
- **Calibrate before anyone multiplies.** Pricing, provisions, lifetime value and campaign budgets all treat model outputs as probabilities. A model trained with class weights or resampling needs calibrating first, and calibration error belongs in its validation pack alongside AUC.
- **Champion and challenger.** The calibrated model is a new version, not a replacement: DS3's model risk process decides whether it becomes the default.
- **Always log the baseline.** "Margin stays flat" is a model too. Recording it in the experiment is what shows a reviewer the new model earns its complexity.
- **Hand over a table, not a notebook.** `RB_CUSTOMER_PREDICTIONS` records which model versions produced each number, so DA5's lifetime value and every campaign built on it trace back to the registry.
