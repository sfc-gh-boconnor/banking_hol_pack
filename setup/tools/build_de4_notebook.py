"""Build notebooks/de4_spark_on_snowflake.ipynb: DE4 ships its PySpark pre-filled, with the prompt to paste under each heading.
Rerun after changing the pipeline:  python3 setup/tools/build_de4_notebook.py"""
import hashlib, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
cells = []
cid = lambda s: hashlib.sha1(s.encode()).hexdigest()[:8]
def md(t): cells.append({"cell_type": "markdown", "id": cid("md" + t), "metadata": {}, "source": t.splitlines(keepends=True)})
def py(name, t): cells.append({"cell_type": "code", "id": cid("py" + name), "metadata": {"name": name}, "execution_count": None, "outputs": [], "source": t.splitlines(keepends=True)})
def sql(name, t): cells.append({"cell_type": "code", "id": cid("sql" + name), "metadata": {"language": "sql", "name": name, "resultVariableName": name}, "execution_count": None, "outputs": [], "source": (f"%%sql -r {name}\n" + t).splitlines(keepends=True)})
def prompt(t): return "\n\n**Paste into the Cortex Code sidebar:**\n\n```\n" + t + "\n```"

SPEC = """  WITH SPECIFICATION $$
bundle:
  type: spark
  compute_type: warehouse
  language: python
  compute_options: {}
$$;"""
FROM = "'@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/de4_spark_on_snowflake'"

md("# DE4: Spark on Snowflake\n\nStarter notebook for [DE4](../vignettes/de4_spark_on_snowflake/README.md). The PySpark is already here: it's the "
   "kind of pipeline a bank runs on a Spark cluster every night. Run each cell in order, and paste the prompt under each heading into "
   "the **Cortex Code sidebar** to have it explained, or changed.\n\n"
   "Everything runs on Snowflake through **Snowpark Connect for Spark**: the same DataFrame code, executed on the `BANKING_WH` "
   "warehouse against governed tables, including Iceberg. No cluster to size, start or patch.\n\n"
   "Keep a second browser tab open on **Monitoring > Spark**: your session and jobs appear there as you go.")

md("## 0. Install Snowpark Connect and set the context\n\nFirst run **install**. It adds `snowpark-connect` (which brings PySpark and a Java runtime) "
   "from the Snowflake PyPI repository on your notebook service. If it says it installed the package, **restart the kernel** "
   "(Connect button > **Restart kernel**) before going on; if it's already there, carry on. Then run **context**: Snowpark Connect "
   "needs a database and schema before the session starts.")
py("install", '''import importlib.util, subprocess, sys

if importlib.util.find_spec("snowflake.snowpark_connect") and importlib.util.find_spec("pyspark"):
    print("snowpark-connect is already installed: run the context cell next")
else:
    # from snowflake.snowpark.pypi_shared_repository, the artifact repository on your notebook service
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "snowpark-connect[jdk]"])
    print("Installed. Restart the kernel now (Connect > Restart kernel), then run the context cell.")''')
py("context", 'from snowflake.snowpark.context import get_active_session\n\nsession = get_active_session()\n'
   'for q in ["USE ROLE HOL_PARTICIPANT", "USE SECONDARY ROLES NONE", "USE WAREHOUSE BANKING_WH",\n'
   '          "USE DATABASE BANKING_HOL", "USE SCHEMA SPARK_LAB"]:\n    session.sql(q).collect()\n'
   'print(session.sql("SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_DATABASE(), CURRENT_SCHEMA()").collect()[0])')

md("## 1. Start a Spark session\n\n`init_spark_session` starts a Spark Connect session that runs on Snowflake. The app name is what you'll see in "
   "**Monitoring > Spark > Spark Sessions**." + prompt("Explain the spark_session cell in de4_spark_on_snowflake: what Snowpark Connect for Spark is, what runs where when I call a DataFrame action, and where the app name appears in Snowsight. Then run it."))
py("spark_session", 'from snowflake.snowpark_connect import init_spark_session\n\n'
   'user = session.sql("SELECT LOWER(CURRENT_USER())").collect()[0][0]\n'
   'APP_NAME = f"de4_{user}"\n'
   'spark = init_spark_session(app_name=APP_NAME)\n'
   'print("Spark", spark.version, "| session name in Monitoring > Spark:", APP_NAME)')

md("## 2. Explore the feed with PySpark\n\nThe payment engine's status feed (bronze) is messy, like a real one: duplicate deliveries, late arrivals "
   "and bad rows. The payments are an **Iceberg** table." + prompt("Run the explore cell in de4_spark_on_snowflake and explain each number: what would break downstream if we loaded this feed as it is, ordered by LOADED_AT? Then open my session in Monitoring > Spark and tell me what I'll find there."))
py("explore", '''from pyspark.sql import functions as F

VALID = ["PROCESSING", "COMPLETED", "FAILED", "RETURNED"]
feed = spark.table("BANKING_HOL.SPARK_LAB.PAYMENT_STATUS_UPDATES")   # bronze
payments = spark.table("BANKING_HOL.RAW_DATA.PAYMENTS")              # Iceberg

events = feed.count()
distinct_events = feed.select("EVENT_ID").distinct().count()
bad = feed.filter(F.col("PAYMENT_ID").isNull() | ~F.col("STATUS").isin(VALID)).count()
unknown = (feed.filter(F.col("PAYMENT_ID").isNotNull())
               .join(payments.select("PAYMENT_ID"), "PAYMENT_ID", "left_anti")
               .select("PAYMENT_ID").distinct().count())
# late arrivals: the PROCESSING event landed after the payment's final status
processing = feed.filter(F.col("STATUS") == "PROCESSING").groupBy("PAYMENT_ID").agg(F.max("LOADED_AT").alias("PROCESSING_LOADED"))
final = feed.filter(F.col("STATUS").isin("COMPLETED", "FAILED", "RETURNED")).groupBy("PAYMENT_ID").agg(F.min("LOADED_AT").alias("FINAL_LOADED"))
late = processing.join(final, "PAYMENT_ID").filter(F.col("PROCESSING_LOADED") > F.col("FINAL_LOADED")).count()

print(f"{events:,} events, {distinct_events:,} distinct: {events - distinct_events:,} duplicate deliveries")
print(f"{bad} rows with no payment id or an unknown status, {unknown} payments we don't hold")
print(f"{late:,} payments whose PROCESSING event arrived after their final status")
feed.orderBy("PAYMENT_ID", "LOADED_AT").show(8)''')

md("## 3. Build the pipeline\n\nBronze to silver: quarantine bad rows, drop duplicates, keep each payment's **latest status by event time** "
   "(not load time, so late arrivals can't overwrite newer statuses), apply it over the Iceberg payments, then reconcile. "
   "This is the same logic as `vignettes/de4_spark_on_snowflake/de4_pipeline.py`, the batch job in step 4." + prompt("Run the pipeline cell in de4_spark_on_snowflake, then walk me through it step by step: the quarantine rules, how the row_number window handles duplicates and late arrivals, and what the reconciliation proves."))
py("pipeline", '''from pyspark.sql import Window

out = lambda t: f"BANKING_HOL.SPARK_LAB.{t}"

# quarantine: no payment id, an unknown status, or a payment we don't hold
known = payments.select("PAYMENT_ID").withColumn("KNOWN", F.lit(True))
tagged = (feed.join(known, "PAYMENT_ID", "left")
              .withColumn("REJECT_REASON",
                          F.when(F.col("PAYMENT_ID").isNull(), "missing payment id")
                           .when(~F.col("STATUS").isin(VALID), "unknown status")
                           .when(F.col("KNOWN").isNull(), "payment not found")))
tagged.filter(F.col("REJECT_REASON").isNotNull()).drop("KNOWN").write.mode("overwrite").saveAsTable(out("PAYMENT_UPDATES_QUARANTINE"))
good = tagged.filter(F.col("REJECT_REASON").isNull()).drop("KNOWN", "REJECT_REASON")

# CDC: one row per event, then each payment's latest event by EVENT_TS
latest = (good.dropDuplicates(["EVENT_ID"])
              .withColumn("RN", F.row_number().over(Window.partitionBy("PAYMENT_ID").orderBy(F.col("EVENT_TS").desc(), F.col("EVENT_ID").desc())))
              .filter("RN = 1").drop("RN"))

# silver: the current state of every payment
current = (payments.select("PAYMENT_ID", "PAYMENT_TYPE", "AMOUNT", "CURRENCY", "PAYMENT_DATE", F.col("STATUS").alias("SOURCE_STATUS"))
           .join(latest.select("PAYMENT_ID", F.col("STATUS").alias("LATEST_STATUS"), F.col("EVENT_TS").alias("STATUS_AT")), "PAYMENT_ID", "left")
           .withColumn("STATUS", F.coalesce("LATEST_STATUS", "SOURCE_STATUS"))
           .withColumn("UPDATED_BY_FEED", F.col("LATEST_STATUS").isNotNull())
           .drop("LATEST_STATUS"))
current.write.mode("overwrite").saveAsTable(out("PAYMENTS_CURRENT"))

# reconcile
written = spark.table(out("PAYMENTS_CURRENT"))
src, tgt = payments.count(), written.count()
applied, expected = written.filter("UPDATED_BY_FEED").count(), latest.count()
print(f"Quarantined: {spark.table(out('PAYMENT_UPDATES_QUARANTINE')).count()} rows")
print(f"Row count matches source: {src:,} vs {tgt:,} -> {src == tgt}")
print(f"Feed payments applied:    {expected:,} vs {applied:,} -> {expected == applied}")
written.groupBy("STATUS").agg(F.count("*").alias("PAYMENTS"), F.sum(F.col("UPDATED_BY_FEED").cast("int")).alias("UPDATED_BY_FEED")).show()''')

md("## 4. Run it as a nightly batch job\n\nThe same pipeline, packaged as `de4_pipeline.py`, submitted with `EXECUTE CODE BUNDLE` straight from the lab's "
   "git repo. It runs on the warehouse: no cluster to start. The statement waits until the job finishes (30 to 60 seconds)." + prompt("Run the batch_job, reconciliation and gold cells in de4_spark_on_snowflake and explain what EXECUTE CODE BUNDLE did. Then tell me what to look at for the payments_nightly run in Monitoring > Spark > Batch Jobs, including the Trace tab."))
sql("batch_job", f"""EXECUTE CODE BUNDLE FROM {FROM}
  ENTRYPOINT = 'de4_pipeline.py'
  ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB', '--app-name', 'payments_nightly')
  EXECUTION_NAME = 'payments_nightly'
{SPEC}""")
sql("reconciliation", "SELECT CHECK_NAME, EXPECTED, ACTUAL, PASSED, CHECKED_AT FROM BANKING_HOL.SPARK_LAB.PIPELINE_RECONCILIATION ORDER BY CHECKED_AT DESC LIMIT 2")
sql("gold", "SELECT * FROM BANKING_HOL.SPARK_LAB.FAILED_PAYMENTS_BY_SCHEME ORDER BY PAYMENTS DESC")

md("## 5. Schedule it\n\nA task runs the same statement at 02:00 every night. The scheduler is Snowflake itself." + prompt("Run the schedule cell in de4_spark_on_snowflake and explain the task: when it runs, what it runs, and how I'd chain it after the dbt build from DE1."))
sql("schedule", f"""CREATE OR REPLACE TASK BANKING_HOL.SPARK_LAB.PAYMENTS_NIGHTLY_SPARK
  WAREHOUSE = BANKING_WH
  SCHEDULE = 'USING CRON 0 2 * * * Europe/London'
  COMMENT = 'DE4: nightly PySpark payments pipeline'
AS
  EXECUTE CODE BUNDLE FROM {FROM}
    ENTRYPOINT = 'de4_pipeline.py'
    ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB', '--app-name', 'payments_nightly')
    EXECUTION_NAME = 'payments_nightly'
  {SPEC.strip()}""")
sql("schedule_on", "ALTER TASK BANKING_HOL.SPARK_LAB.PAYMENTS_NIGHTLY_SPARK RESUME")

md("## 6. Break it and find out why\n\nUpstream has \"renamed\" the feed. **This cell is meant to fail**, in about 20 seconds. Then find out why in "
   "**Monitoring > Spark > Batch Jobs** > `payments_nightly_broken` > **Logs** (logs take a minute or two to arrive).\n\n"
   "**After Cortex Code answers:** don't fix the cell. Compare its root cause with the Logs in Monitoring > Spark: same error, found from SQL instead of a click. Leave the failed run in place, because the alert in step 7 has to find it, then go on to heading 7. (The fix is the batch_job cell in step 4, which already reads the real feed.)" + prompt("The broken_run cell in de4_spark_on_snowflake failed. Find out why from Snowflake: query SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY for my latest failed run, then its ERROR logs in SNOWFLAKE.TELEMETRY.EVENTS_VIEW (filter RESOURCE_ATTRIBUTES['snow.query.id'] on the run's EXECUTE_QUERY_ID), and tell me the root cause and the fix."))
sql("broken_run", f"""EXECUTE CODE BUNDLE FROM {FROM}
  ENTRYPOINT = 'de4_pipeline.py'
  ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB', '--source', 'PAYMENT_STATUS_UPDATES_V2', '--app-name', 'payments_nightly_broken')
  EXECUTION_NAME = 'payments_nightly_broken'
{SPEC}""")

md("## 7. Alert on failed Spark jobs\n\nThe data behind **Monitoring > Spark** is a table function you can query. An alert checks it every 5 minutes and "
   "records each new failure. In production the action would page the on-call engineer; here it writes to a table so nothing leaves the lab." + prompt("Run the cells under heading 7 (spark_history through failures) in de4_spark_on_snowflake and explain how the alert finds each failure exactly once. How would I change the action to email the on-call engineer?"))
sql("spark_history", """SELECT NAME, MODE, EXECUTION_STATUS, CREATED_ON, DATEDIFF('second', STARTED_ON, COMPLETED_ON) AS SECONDS, ERROR_CODE
FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(
    CREATION_TIME_START => DATEADD('day', -1, CURRENT_TIMESTAMP()), RESULT_LIMIT => 100))
WHERE OWNER = CURRENT_USER()
ORDER BY CREATED_ON DESC""")
sql("failures_table", """CREATE TABLE IF NOT EXISTS BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES (
    APPLICATION_ID VARCHAR, NAME VARCHAR, MODE VARCHAR, OWNER VARCHAR,
    COMPLETED_ON TIMESTAMP_LTZ, ERROR_CODE VARCHAR, RECORDED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP())""")
sql("failure_alert", """CREATE OR REPLACE ALERT BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURE_ALERT
  WAREHOUSE = BANKING_WH
  SCHEDULE = '5 MINUTE'
  IF (EXISTS (
    SELECT ID, NAME, MODE, OWNER, COMPLETED_ON, ERROR_CODE
    FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(
        CREATION_TIME_START => DATEADD('day', -1, SNOWFLAKE.ALERT.SCHEDULED_TIME()), RESULT_LIMIT => 10000))
    WHERE EXECUTION_STATUS = 'FAILED' AND MODE <> 'SCOS_CLIENT'
      AND ID NOT IN (SELECT APPLICATION_ID FROM BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES)))
  THEN
    INSERT INTO BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES (APPLICATION_ID, NAME, MODE, OWNER, COMPLETED_ON, ERROR_CODE)
    SELECT ID, NAME, MODE, OWNER, COMPLETED_ON, ERROR_CODE
    FROM TABLE(RESULT_SCAN(SNOWFLAKE.ALERT.GET_CONDITION_QUERY_UUID()))""")
sql("alert_on", "ALTER ALERT BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURE_ALERT RESUME")
sql("alert_now", "EXECUTE ALERT BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURE_ALERT")
md("Wait about a minute for the alert to run, then:")
sql("failures", "SELECT NAME, MODE, ERROR_CODE, COMPLETED_ON, RECORDED_AT FROM BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES ORDER BY RECORDED_AT DESC")

md("## After the lab\n\nSuspend the nightly task: `ALTER TASK BANKING_HOL.SPARK_LAB.PAYMENTS_NIGHTLY_SPARK SUSPEND`.")

nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
(ROOT / "notebooks/de4_spark_on_snowflake.ipynb").write_text(json.dumps(nb, indent=1) + "\n")
assert len({c["id"] for c in cells}) == len(cells)
print(len(cells), "cells")
