# DE4: Spark on Snowflake: run your PySpark and monitor it

| | |
|---|---|
| **Persona** | Data Engineer |
| **Time** | ~40 min |
| **Prerequisites** | C1 only. Uses the raw status feed `BANKING_HOL.SPARK_LAB.PAYMENT_STATUS_UPDATES` and the Iceberg payments, both built at provisioning |
| **Reference** | [`de4_pipeline.py`](de4_pipeline.py), [`de4.sql`](de4.sql) |

## Business question
> Our nightly payments pipelines are PySpark jobs on clusters we size, patch and pay for when they're idle. Can we run the same Spark code on Snowflake, against the same governed data, and see every run, failure and slow step in one place?

## What you'll build
- An interactive **Spark session** in a Workspace notebook, named so it shows up in **Monitoring > Spark > Spark Sessions**
- A starter notebook with the PySpark already in it, and a bronze to silver to gold pipeline: quarantine bad rows, change data capture (duplicates and late arrivals handled), apply the latest status over the Iceberg payments, reconcile, and summarise failed payments for operations
- Tables `PAYMENT_UPDATES_QUARANTINE`, `PAYMENTS_CURRENT`, `PIPELINE_RECONCILIATION` and `FAILED_PAYMENTS_BY_SCHEME` in `BANKING_HOL.SPARK_LAB`
- The same pipeline as a **batch job** with `EXECUTE CODE BUNDLE`, straight from the lab's git repo, scheduled nightly by a task
- A deliberately failed run, found and diagnosed in **Monitoring > Spark**, and an alert `SPARK_JOB_FAILURE_ALERT` that records every failed Spark job

## Spark on Snowflake
- **Snowpark Connect for Spark** runs PySpark (and Scala and Java) DataFrame code on Snowflake. The client sends the Spark plan; Snowflake runs it as SQL on a warehouse. No cluster, no executors, no autoscaling to tune, and the code reads governed tables, including Iceberg, with masking and row access policies applied.
- **Interactive**: start a session from a notebook, a laptop or an IDE with `init_spark_session()`. **Batch**: submit a `.py` file with `EXECUTE CODE BUNDLE` (SQL), the REST API or `snowpark-submit`, and schedule it with a task.
- **Monitoring > Spark** in Snowsight lists every **Spark Session** with its queries, and every **Batch Job** with its status, duration, owner, logs and an OpenTelemetry trace. It's built on the table function `SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY`, which you can query yourself.

## Steps
### Open the starter notebook
Where: the **banking-hol-pack** Workspace > file explorer > `notebooks/de4_spark_on_snowflake.ipynb`
Media: de4_notebook_service.mp4 | Open de4_spark_on_snowflake > service dropdown > NOTEBOOK_POOL, 1 hour
1. Open `notebooks/` > **de4_spark_on_snowflake.ipynb**. The PySpark is already in it: one numbered heading per step, the cells underneath, and the prompt to paste above them.
2. Connect it to your notebook service (the arrow next to the status dot > **Select service**). No service yet? Create one as in DE3's first step: compute pool **NOTEBOOK_POOL**, idle timeout **1 hour**.
3. Under heading 0, run the **install** cell. It installs `snowpark-connect` (PySpark plus a Java runtime) from the Snowflake PyPI repository on your notebook service. If it says **Installed**, restart the kernel (Connect > **Restart kernel**).
4. Run the **context** cell. It sets the role, warehouse, database and schema: Snowpark Connect needs them before the session starts.
5. Open Snowsight > **Monitoring > Spark** in a second browser tab and keep it open.
Expect: your user, `HOL_PARTICIPANT`, `BANKING_HOL` and `SPARK_LAB` printed. The install takes a minute or two the first time; the service keeps it until it's recreated.

### Start a Spark session
Where: the Cortex Code sidebar, with `de4_spark_on_snowflake` open
```prompt
Explain the spark_session cell in de4_spark_on_snowflake: what Snowpark Connect for Spark is, what runs where when I call a DataFrame action, and where the app name appears in Snowsight. Then run it.
```
Expect: a Spark version and your session name, `de4_<your user>`, printed in a few seconds. Spark Monitoring in the Snowsight UI comes in the last step; if you opened it earlier, the session is listed there by that name with you as the owner.
Check: de4_session

### Explore the feed with PySpark
```prompt
Run the explore cell in de4_spark_on_snowflake and explain each number: what would break downstream if we loaded this feed as it is, ordered by LOADED_AT? Then open my session in Monitoring > Spark and tell me what I'll find there.
```
Expect: about 10,800 events but about 500 fewer distinct ones (duplicate deliveries), 40 rows with no payment id or an unknown status, about 20 payments the bank doesn't hold, and several hundred payments whose PROCESSING event arrived after their final status. Exact counts vary a little by account, because the payments are generated when the lab is installed. Load by `LOADED_AT` and those payments would go back to PROCESSING. In **Monitoring > Spark**, open your session: every DataFrame action is listed as a Snowflake query, each linked to its Query Profile.

### Build the pipeline
```prompt
Run the pipeline cell in de4_spark_on_snowflake, then walk me through it step by step: the quarantine rules, how the row_number window handles duplicates and late arrivals, and what the reconciliation proves.
```
Expect: 60 rows quarantined, 20 for each reason, `PAYMENTS_CURRENT` with 50,000 rows (the same as the source) and about 5,200 payments updated by the feed: both reconciliation lines `True`.
Check: de4_silver

### Run it as a nightly batch job
Media: de4_batch_trace.mp4 | (what Monitoring shows after this step) Monitoring > Spark > Batch Jobs > payments_nightly > Telemetry (one span per DataFrame action)
```prompt
Run the batch_job, reconciliation and gold cells in de4_spark_on_snowflake and explain what EXECUTE CODE BUNDLE did. Then tell me what to look at for the payments_nightly run in Monitoring > Spark > Batch Jobs, including the Trace tab.
```
Expect: the **batch_job** cell takes about 30 to 60 seconds on the warehouse, with no cluster to start. Both reconciliation checks pass, and the gold table shows failed and returned payments by scheme. In **Monitoring > Spark > Batch Jobs**, open `payments_nightly`: the command, its queries, its logs and the **Trace** tab, one span per DataFrame action.
Check: de4_batch

### Schedule it
```prompt
Run the schedule cell in de4_spark_on_snowflake and explain the task: when it runs, what it runs, and how I'd chain it after the dbt build from DE1.
```
Expect: the task created and resumed, to run at 02:00 London time. The scheduler is Snowflake itself: no Airflow or cluster scheduler to run.

### Break it and find out why
Media: de4_broken_logs.mp4 | (what Monitoring shows after this step) Monitoring > Spark > Batch Jobs > payments_nightly_broken (Failed) > Telemetry
```prompt
The broken_run cell in de4_spark_on_snowflake failed. Find out why from Snowflake: query SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY for my latest failed run, then its ERROR logs in SNOWFLAKE.TELEMETRY.EVENTS_VIEW (filter RESOURCE_ATTRIBUTES['snow.query.id'] on the run's EXECUTE_QUERY_ID), and tell me the root cause and the fix.
```
Expect: the **broken_run** cell fails in about 20 seconds, as intended: upstream "renamed" the feed. In **Monitoring > Spark > Batch Jobs**, `payments_nightly_broken` is **FAILED**, and its **Logs** show `AnalysisException: [TABLE_OR_VIEW_NOT_FOUND] ... PAYMENT_STATUS_UPDATES_V2` with the stack trace (logs can take a minute or two to arrive). Cortex Code finds the same from SQL and names the fix: drop `--source` or point it at `PAYMENT_STATUS_UPDATES`.
Then: don't fix the cell. The fix is the **batch_job** cell from step 4, which already reads the real feed. Leave the failed run in place, because the alert in the next step has to find it, and go on to heading 7.
Check: de4_failed

### Alert on failed Spark jobs
```prompt
Run the cells under heading 7 (spark_history through failures) in de4_spark_on_snowflake and explain how the alert finds each failure exactly once. How would I change the action to email the on-call engineer?
```
Expect: your sessions and batch runs as a table, the same data as **Monitoring > Spark**, then `payments_nightly_broken` in `SPARK_JOB_FAILURES` about a minute after **alert_now**. In production the action would email the on-call engineer or open a ticket; here it records the failure so nothing leaves the lab.
Check: de4_alert

### See it all in Spark Monitoring
Where: Snowsight > **Monitoring > Spark**
Media: de4_spark_sessions.mp4 | Monitoring > Spark > Select warehouse BANKING_WH > Spark Sessions
You've worked in the notebook so far. Now look at the same work from the UI.
1. Open **Monitoring > Spark** and select the warehouse **BANKING_WH**.
2. **Spark Sessions** lists your session, `de4_<your user>`, with you as the owner and its queries.
3. **Batch Jobs** lists `payments_nightly` (succeeded) and `payments_nightly_broken` (failed), with logs and the Telemetry trace.
Expect: your session and both batch runs listed, matching what you ran in the notebook
Note: the clips in the earlier steps show what this screen looks like at that point in the lab.

## Check your work
Your Spark session is listed under your name, `PAYMENTS_CURRENT` matches the source, a `payments_nightly` batch job succeeded, a failed run is recorded, and `SPARK_JOB_FAILURE_ALERT` exists.

## After the lab
Suspend the task so it doesn't run every night: `ALTER TASK BANKING_HOL.SPARK_LAB.PAYMENTS_NIGHTLY_SPARK SUSPEND`.

## In your bank
Bring the Spark code, leave the clusters. The same PySpark runs on Snowflake warehouses against governed Iceberg and Snowflake tables, interactive or batch, and every session, job, log and trace is in one place: Monitoring > Spark.
