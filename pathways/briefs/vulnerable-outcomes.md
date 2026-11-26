# Prove vulnerable customers get as good an outcome

Use case: `vulnerable-outcomes` (Retail). Demo stop: retail tour, **What customers are telling us**.

## Why now

- The FCA and ICO set out, together, what they expect from firms on vulnerability data: understand vulnerability in the customer base, spot its indicators and meet those needs. ([FCA and ICO joint statement](https://www.fca.org.uk/publications/corporate-documents/joint-fca-and-ico-statement-regulatory-expectations-regarding-firms))
- Firms are expected to monitor whether customers in vulnerable circumstances get worse outcomes than others, find the root cause and act, with the board able to challenge it. ([FCA and ICO joint statement](https://www.fca.org.uk/publications/corporate-documents/joint-fca-and-ico-statement-regulatory-expectations-regarding-firms))
- The statement notes indicators can appear in customer interactions and in transaction data, and gives an example of a firm scoring vulnerability from transactions and chat. ([FCA and ICO joint statement](https://www.fca.org.uk/publications/corporate-documents/joint-fca-and-ico-statement-regulatory-expectations-regarding-firms))
- It says UK data protection law doesn't stop firms delivering good outcomes, but that they must still comply with it, for example by minimising data and protecting special category data. ([FCA and ICO joint statement](https://www.fca.org.uk/publications/corporate-documents/joint-fca-and-ico-statement-regulatory-expectations-regarding-firms))

## The story

- Regulators now expect evidence, not intent: are vulnerable customers doing as well as everyone else?
- Most of the signal sits in calls and complaints, not in a flag on a table.
- Snowflake reads every conversation with AI SQL, finds the similar ones, and checks what those customers are offered.
- Masking by role means the team can monitor outcomes without seeing who the customers are.

## Route

1. **C0:** show the vulnerable customers register on `RB_CUSTOMERS`, and complaints with redress paid on `RB_COMPLAINTS`.
2. **AI4:** point out the vulnerability cues AI_CLASSIFY reads from each call transcript.
3. **AI5:** search "calls like this one" to show a cue spotted once can be found everywhere.
4. **DA5:** look at what each value segment is offered, and ask whether it's fair value for vulnerable customers.
5. **GOV5:** show names, incomes and complaint text masked for analysts, and the coverage report.

Tip: ask Cortex Code to compare complaints, redress and churn for vulnerable and other customers. It's a one-query outcome check on data the lab already has. On a freshly built lab, vulnerable customers complain slightly more per head but receive less redress per customer: a gap worth investigating, which is the point of the use case.

## Sources

| Source | Published | Read |
| --- | --- | --- |
| [Joint FCA and ICO statement on regulatory expectations regarding firms' approaches to vulnerability related data](https://www.fca.org.uk/publications/corporate-documents/joint-fca-and-ico-statement-regulatory-expectations-regarding-firms) | 27 March 2026 (updated 20 July 2026) | 26 November 2026 |
