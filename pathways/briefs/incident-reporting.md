# Be ready to report an operational incident

Use case: `incident-reporting` (Corporate). Demo stop: corporate tour, **Alerts and next best actions**.

## Why now

- New operational incident reporting rules from the FCA, PRA and Bank of England come into force on 18 March 2027, for almost all FCA-regulated firms. ([FCA: Reporting operational incidents](https://www.fca.org.uk/firms/operational-resilience/reporting-operational-incidents))
- An incident must be reported if it risks intolerable harm to consumers that they can't easily recover from, the safety and soundness of the firm, or market stability and confidence. ([FCA: Reporting operational incidents](https://www.fca.org.uk/firms/operational-resilience/reporting-operational-incidents))
- There will be one form for every regulator. Most firms send a short standard report, and some firms send enhanced reports with updates and a final report. ([FCA: Reporting operational incidents](https://www.fca.org.uk/firms/operational-resilience/reporting-operational-incidents))
- The PRA's 2026 letter to UK banks and building societies keeps operational resilience and data risk among its priorities. ([Bank of England: UK deposit takers, 2026 priorities](https://www.bankofengland.co.uk/prudential-regulation/publication/2026/january/letter-from-charlotte-gerken-and-laura-wallis-uk-deposit-takers-supervision-2026-priorities))

## The story

- Reporting an incident starts with knowing it's happening, and how bad it is for customers.
- The data that tells you is already in Snowflake: payments, SLAs, alerts and client feedback.
- A dynamic table and an alert spot the breach; AI ranks the response; lineage and access history are the evidence.
- None of it is a separate reporting system: it's the same governed data products the business runs on.

## Route

1. **DE2:** show the SLA monitor refreshing as a dynamic table, and the data quality checks feeding it.
2. **OPS4:** show the impact tolerance held as data, and the alert escalating a breach with its own history.
3. **OPS2:** rank the open alerts with AI next actions, and show which unhappy clients are linked to them.
4. **GOV2:** use lineage to show what the incident touched downstream, and access history to show who read client data.

Gap: the new rules also bring an annual register of material third parties. The lab has no supplier data, so this route covers incidents, not the register.

## Sources

| Source | Published | Read |
| --- | --- | --- |
| [FCA: Reporting operational incidents](https://www.fca.org.uk/firms/operational-resilience/reporting-operational-incidents) | 18 March 2026 (updated 30 October 2026) | 26 November 2026 |
| [Bank of England: Letter to UK deposit takers, 2026 priorities](https://www.bankofengland.co.uk/prudential-regulation/publication/2026/january/letter-from-charlotte-gerken-and-laura-wallis-uk-deposit-takers-supervision-2026-priorities) | 15 January 2026 | 26 November 2026 |
