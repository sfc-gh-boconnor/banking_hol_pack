-- DA0: the totals the interactive report must match (Cortex Code builds the report itself).
-- Run as HOL_PARTICIPANT on BANKING_WH. Expect 50,000 payments and about 96% success; the exact counts differ per account (the data is generated at install).
SELECT COUNT(*)                                                       AS payments,
       COUNT_IF(STATUS = 'FAILED')                                    AS failed,
       COUNT_IF(STATUS = 'RETURNED')                                  AS returned,
       ROUND(100 * COUNT_IF(STATUS = 'COMPLETED') / COUNT(*), 2)      AS success_rate_pct,
       ROUND(SUM(IFF(CURRENCY = 'GBP', AMOUNT, AMOUNT * FX_RATE)) / 1e9, 1) AS gbp_volume_bn
FROM BANKING_HOL.RAW_DATA.PAYMENTS;
