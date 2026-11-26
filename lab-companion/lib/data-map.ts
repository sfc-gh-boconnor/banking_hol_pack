/**
 * The data estate shown on the Data map page and toured in C0: data products, the end-to-end
 * architecture and the keys that join products. Row counts on the page come live from the account
 * (/api/data-map); `rows` here is the fallback when the app can't see a schema.
 */

export type DataTable = { name: string; grain: string; rows: number }
export type DataProduct = {
  id: string
  name: string
  business: string
  schema: string
  summary: string
  tables: DataTable[]
  modules: string[]
  alsoWorksFor: string
}

export const DATA_PRODUCTS: DataProduct[] = [
  {
    id: "payments",
    name: "Corporate payments",
    business: "Corporate",
    schema: "BANKING_HOL.RAW_DATA",
    summary: "Corporate clients, their accounts and relationship managers, and every payment they make, with schemes, SLAs, alerts and feedback. Snowflake-managed Iceberg, read-only.",
    tables: [
      { name: "PAYMENTS", grain: "one payment", rows: 50000 },
      { name: "CUSTOMERS", grain: "one corporate client", rows: 30 },
      { name: "ACCOUNTS", grain: "one client account", rows: 36 },
      { name: "RELATIONSHIP_MANAGERS", grain: "one RM", rows: 10 },
      { name: "PAYMENT_SCHEMES", grain: "one scheme (CHAPS, BACS...)", rows: 6 },
      { name: "SLA_DEFINITIONS", grain: "one SLA per scheme", rows: 6 },
      { name: "ERROR_CODES", grain: "one failure reason", rows: 20 },
      { name: "OPERATIONAL_ALERTS", grain: "one alert", rows: 1500 },
      { name: "CUSTOMER_FEEDBACK", grain: "one piece of feedback", rows: 2000 },
    ],
    modules: ["C1", "DE1", "DE2", "DE3", "DE4", "DA0", "DA2", "DA1", "OPS1", "OPS2", "OPS3", "OPS4"],
    alsoWorksFor: "card disputes, fraud alerts, faster-payments SLAs",
  },
  {
    id: "retail",
    name: "Retail banking",
    business: "Retail",
    schema: "BANKING_HOL.RAW_DATA (RB_*)",
    summary: "20,000 retail customers on real UK geography with their products, employer and pay, affordability, monthly balances and a 90-day transaction ledger. Synthetic people; Iceberg, read-only.",
    tables: [
      { name: "RB_CUSTOMERS", grain: "one retail customer", rows: 20000 },
      { name: "RB_PRODUCTS", grain: "one product in the catalogue", rows: 25 },
      { name: "RB_ACCOUNTS", grain: "one product holding", rows: 44058 },
      { name: "RB_EMPLOYMENT", grain: "one customer's income and employer", rows: 20000 },
      { name: "RB_SALARY_HISTORY", grain: "one pay change", rows: 40246 },
      { name: "RB_MONTHLY_SNAPSHOT", grain: "one customer-month", rows: 229161 },
      { name: "RB_TRANSACTIONS", grain: "one transaction", rows: 1296242 },
    ],
    modules: ["C0", "DS0", "DS1", "DS2"],
    alsoWorksFor: "attrition, next best product, affordability, fraud detection",
  },
  {
    id: "voice",
    name: "Customer voice and financial crime",
    business: "Retail",
    schema: "BANKING_HOL.RAW_DATA (RB_ text) + @RETAIL.FINCRIME_EVIDENCE",
    summary: "Call transcripts, emails, complaints, fraud case notes, SAR narratives and card disputes, plus phishing screenshots and police report PDFs. Every record links to a retail customer, and fraud records to the transaction. Synthetic.",
    tables: [
      { name: "RB_CALL_TRANSCRIPTS", grain: "one call, with start and end time", rows: 1000 },
      { name: "RB_EMAILS", grain: "one customer email", rows: 300 },
      { name: "RB_COMPLAINTS", grain: "one complaint", rows: 200 },
      { name: "RB_FRAUD_CASES", grain: "one fraud investigation", rows: 300 },
      { name: "RB_SAR_NARRATIVES", grain: "one Suspicious Activity Report", rows: 60 },
      { name: "RB_DISPUTES", grain: "one card dispute", rows: 120 },
      { name: "RB_EVIDENCE_FILES", grain: "one evidence file on the stage", rows: 150 },
      { name: "RB_NAME_MENTIONS", grain: "one person named in an outside record, as written there", rows: 300 },
    ],
    modules: ["AI4", "AI5"],
    alsoWorksFor: "complaints handling, vulnerability, APP scam reimbursement, SAR quality, fuzzy name matching",
  },
  {
    id: "branches",
    name: "Branch network",
    business: "Retail",
    schema: "BANKING_HOL.RETAIL",
    summary: "57 branches and their ATMs on real high streets in 8 cities, branch visits, and road-network drive and walk times from every branch to the area around it.",
    tables: [
      { name: "BRANCHES", grain: "one branch", rows: 57 },
      { name: "ATMS", grain: "one ATM", rows: 142 },
      { name: "RETAIL_CUSTOMERS", grain: "one DA3 customer", rows: 20000 },
      { name: "BRANCH_VISITS", grain: "one visit", rows: 145424 },
      { name: "BRANCH_CELL_TRAVEL", grain: "branch x H3 cell x profile", rows: 193775 },
      { name: "BRANCH_ISOCHRONES", grain: "branch x minutes x profile", rows: 171 },
    ],
    modules: ["DA3"],
    alsoWorksFor: "ATM placement, mortgage branches, SME lending reach",
  },
  {
    id: "analytics",
    name: "Client 360 and analytics",
    business: "Built in the lab",
    schema: "BANKING_HOL.ANALYTICS",
    summary: "What you build: dbt staging and marts, dynamic tables, the DP_SLA_COMPLIANCE Iceberg data product, semantic views and the agents that use them.",
    tables: [
      { name: "MART_CUSTOMER_PAYMENTS", grain: "one corporate client", rows: 30 },
      { name: "MART_RM_PERFORMANCE", grain: "one RM", rows: 10 },
      { name: "DP_SLA_COMPLIANCE", grain: "day x scheme", rows: 2196 },
    ],
    modules: ["DE1", "DE2", "DA2", "OPS1", "AI1", "AI2", "AI3"],
    alsoWorksFor: "KPI data products, regulatory reporting, self-serve BI",
  },
  {
    id: "governance",
    name: "Governance packs",
    business: "Every data product",
    schema: "BANKING_HOL.AUDIT_PACK, COWORK_PACK",
    summary: "A ready-made audit pack for lineage and access history, and the views behind the CoWork agent. Masking, tags and the AI gateway apply across everything.",
    tables: [
      { name: "AUDIT_PACK.PAYMENT_SLA_DAILY", grain: "day x scheme", rows: 2196 },
      { name: "AUDIT_PACK.CLIENT_ACCOUNTS", grain: "one client account (masked columns)", rows: 36 },
    ],
    modules: ["GOV1", "GOV2", "GOV3"],
    alsoWorksFor: "PII controls, audit evidence, AI model access",
  },
]

/** The few keys that join data products to each other. */
export const JOIN_KEYS = [
  { from: "PAYMENTS.ORIGINATOR_ACCOUNT_ID", to: "ACCOUNTS.ACCOUNT_ID", why: "who made a corporate payment" },
  { from: "ACCOUNTS.CUSTOMER_ID", to: "CUSTOMERS.CUSTOMER_ID", why: "corporate client for an account" },
  { from: "CUSTOMERS.RM_ID", to: "RELATIONSHIP_MANAGERS.RM_ID", why: "a client's relationship manager" },
  { from: "RB_CUSTOMERS.HOME_BRANCH_ID", to: "RETAIL.BRANCHES.BRANCH_ID", why: "a retail customer's nearest branch by drive time" },
  { from: "RB_ACCOUNTS.PRODUCT_ID", to: "RB_PRODUCTS.PRODUCT_ID", why: "which product a holding is" },
  { from: "RB_EMPLOYMENT.CUSTOMER_ID", to: "RB_CUSTOMERS.CUSTOMER_ID", why: "employer and pay for a customer" },
  { from: "RB_TRANSACTIONS.ACCOUNT_ID", to: "RB_ACCOUNTS.ACCOUNT_ID", why: "the account a transaction hit" },
]

/** End-to-end platform, left to right, with a governance band underneath. */
// The platform lanes and governance band now live in core/architecture.json (ARCHITECTURE in lib/content)
