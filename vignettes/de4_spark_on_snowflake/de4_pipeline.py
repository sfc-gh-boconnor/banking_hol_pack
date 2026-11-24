"""DE4 reference: the nightly payments pipeline, written in PySpark and run on Snowflake.

Bronze -> silver -> gold, the way a bank's Spark jobs usually look:
  1. Read the raw status feed (bronze) and the Iceberg payments.
  2. Quarantine bad rows instead of loading them.
  3. Drop duplicate deliveries and keep each payment's latest status by event time,
     not load time, so late arrivals don't overwrite newer statuses (CDC).
  4. Apply the latest status over the payments to get the current state (silver).
  5. Reconcile source and target, and fail the run if they don't agree.
  6. Summarise failed and returned payments by scheme for operations (gold).

Run it as a batch job:
  EXECUTE CODE BUNDLE FROM '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/de4_spark_on_snowflake'
    ENTRYPOINT = 'de4_pipeline.py' ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB') ...
Arguments:
  --schema   where the feed lives and the outputs are written
  --source   the feed table (default PAYMENT_STATUS_UPDATES). Pass a wrong name to see a failed run.
  --app-name the name shown in Snowsight > Monitoring > Spark
"""
import argparse

from pyspark.sql import Window
from pyspark.sql import functions as F
from snowflake.snowpark_connect import init_spark_session

VALID = ["PROCESSING", "COMPLETED", "FAILED", "RETURNED"]
PAYMENTS = "BANKING_HOL.RAW_DATA.PAYMENTS"  # Iceberg, published in setup 02


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--schema", default="BANKING_HOL.SPARK_LAB")
    p.add_argument("--source", default="PAYMENT_STATUS_UPDATES")
    p.add_argument("--app-name", default="payments_nightly")
    a, _ = p.parse_known_args()

    spark = init_spark_session(app_name=a.app_name)
    out = lambda t: f"{a.schema}.{t}"  # noqa: E731

    # 1. bronze and the Iceberg payments
    feed = spark.table(out(a.source))
    payments = spark.table(PAYMENTS).select("PAYMENT_ID", "PAYMENT_TYPE", "AMOUNT", "CURRENCY", "PAYMENT_DATE",
                                            F.col("STATUS").alias("SOURCE_STATUS"))

    # 2. quarantine: no payment id, an unknown status, or a payment we don't hold
    known = payments.select("PAYMENT_ID").withColumn("KNOWN", F.lit(True))
    tagged = (feed.join(known, "PAYMENT_ID", "left")
                  .withColumn("REJECT_REASON",
                              F.when(F.col("PAYMENT_ID").isNull(), "missing payment id")
                               .when(~F.col("STATUS").isin(VALID), "unknown status")
                               .when(F.col("KNOWN").isNull(), "payment not found")))
    tagged.filter(F.col("REJECT_REASON").isNotNull()).drop("KNOWN") \
          .write.mode("overwrite").saveAsTable(out("PAYMENT_UPDATES_QUARANTINE"))
    good = tagged.filter(F.col("REJECT_REASON").isNull()).drop("KNOWN", "REJECT_REASON")

    # 3. CDC: one row per event, then the latest event per payment by EVENT_TS
    deduped = good.dropDuplicates(["EVENT_ID"])
    latest = (deduped.withColumn("RN", F.row_number().over(
                  Window.partitionBy("PAYMENT_ID").orderBy(F.col("EVENT_TS").desc(), F.col("EVENT_ID").desc())))
              .filter("RN = 1").drop("RN"))

    # 4. silver: the current state of every payment
    current = (payments.join(latest.select("PAYMENT_ID", F.col("STATUS").alias("LATEST_STATUS"),
                                           F.col("ERROR_CODE").alias("LATEST_ERROR_CODE"),
                                           F.col("EVENT_TS").alias("STATUS_AT")), "PAYMENT_ID", "left")
               .withColumn("STATUS", F.coalesce("LATEST_STATUS", "SOURCE_STATUS"))
               .withColumn("UPDATED_BY_FEED", F.col("LATEST_STATUS").isNotNull())
               .drop("LATEST_STATUS"))
    current.write.mode("overwrite").saveAsTable(out("PAYMENTS_CURRENT"))

    # 5. reconcile: every payment kept, every valid feed payment applied
    src = payments.count()
    tgt = spark.table(out("PAYMENTS_CURRENT")).count()
    applied = spark.table(out("PAYMENTS_CURRENT")).filter("UPDATED_BY_FEED").count()
    expected = latest.count()
    checks = [("row count matches source", src, tgt), ("feed payments applied", expected, applied)]
    recon = spark.createDataFrame([(n, int(e), int(g), e == g) for n, e, g in checks],
                                  "CHECK_NAME STRING, EXPECTED BIGINT, ACTUAL BIGINT, PASSED BOOLEAN") \
                 .withColumn("CHECKED_AT", F.current_timestamp())
    recon.write.mode("append").saveAsTable(out("PIPELINE_RECONCILIATION"))
    failed = [n for n, e, g in checks if e != g]
    if failed:
        raise RuntimeError(f"Reconciliation failed: {', '.join(failed)}")

    # 6. gold: what operations needs each morning
    (spark.table(out("PAYMENTS_CURRENT"))
          .filter(F.col("STATUS").isin("FAILED", "RETURNED"))
          .groupBy("PAYMENT_TYPE", "STATUS")
          .agg(F.count("*").alias("PAYMENTS"), F.round(F.sum("AMOUNT"), 2).alias("AMOUNT"),
               F.sum(F.col("UPDATED_BY_FEED").cast("int")).alias("CHANGED_OVERNIGHT"))
          .write.mode("overwrite").saveAsTable(out("FAILED_PAYMENTS_BY_SCHEME")))

    print(f"Done: {src} payments, {applied} updated from the feed, quarantine and gold written to {a.schema}")


if __name__ == "__main__":
    main()
