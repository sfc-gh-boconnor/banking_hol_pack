/**
 * The regulations the executive demo maps to Snowflake controls, demo stops and lab modules.
 * Every "duty" line paraphrases only what the linked primary source says; each was read on the
 * date in verifiedOn. Add nothing that isn't in a source.
 */
export type RegId = "op-res" | "consumer-duty" | "app-scams" | "aml" | "uk-gdpr" | "model-risk" | "cash-access"

export type Regulation = {
  id: RegId
  name: string
  regulator: string
  duty: string
  source: { label: string; url: string }
  verifiedOn: string
  controls: string[]                       // what Snowflake does, in business words
  demo: { tour: "retail" | "corporate"; stop: string; label: string }[]
  modules: string[]                        // lab modules that build the controls
}

export const REGULATIONS: Regulation[] = [
  {
    id: "op-res", name: "Operational resilience", regulator: "FCA and PRA (FCA rules in SYSC 15A)",
    duty: "Identify important business services, set an impact tolerance for each (the maximum tolerable disruption, measured in time), and be able to stay within it in a severe but plausible disruption. Mapping and testing had to be complete by 31 March 2025, with an annual self-assessment for the board.",
    source: { label: "FCA: Operational resilience, insights and observations one year on", url: "https://www.fca.org.uk/publications/good-and-poor-practice/operational-resilience-insights-observations-one-year" },
    verifiedOn: "2026-11-23",
    controls: [
      "Each important business service and its impact tolerance held as data, next to the payments it covers",
      "A dynamic table measures every payment against its limit within a minute",
      "A Snowflake Alert escalates a breach to the owner before the tolerance is reached, and records it",
    ],
    demo: [{ tour: "corporate", stop: "live", label: "A payment at risk" }, { tour: "corporate", stop: "whatif", label: "What if we fixed it?" }, { tour: "corporate", stop: "alerts", label: "Alerts and next best actions" }],
    modules: ["DE2", "DE3", "OPS2", "OPS4"],
  },
  {
    id: "consumer-duty", name: "Consumer Duty", regulator: "FCA (PRIN 2A)",
    duty: "Act to deliver good outcomes for retail customers: act in good faith, avoid causing foreseeable harm, and enable and support customers. Four outcomes: products and services, price and value, consumer understanding, and consumer support.",
    source: { label: "FCA: About the Consumer Duty", url: "https://www.fca.org.uk/firms/consumer-duty/about" },
    verifiedOn: "2026-11-23",
    controls: [
      "Every call and complaint read by AI SQL for sentiment, themes and signs of vulnerability",
      "Vulnerable customers counted before a branch decision, not after",
      "Outcomes monitored from the same governed data the business runs on",
    ],
    demo: [{ tour: "retail", stop: "voice", label: "What customers are telling us" }, { tour: "retail", stop: "branches", label: "Branch catchments" }, { tour: "corporate", stop: "feedback", label: "What clients say" }],
    modules: ["DA1", "DA3", "AI4"],
  },
  {
    id: "app-scams", name: "APP scam reimbursement", regulator: "Payment Systems Regulator (PS23/3, PS23/4)",
    duty: "Victims of authorised push payment scams over Faster Payments or CHAPS are covered by minimum standards: most are reimbursed within five business days, sending and receiving firms split the cost 50:50, and vulnerable customers get additional protection.",
    source: { label: "PSR: APP scams", url: "https://www.psr.org.uk/our-work/app-scams/" },
    verifiedOn: "2026-11-23",
    controls: [
      "Case notes, calls, police reports and phishing screenshots read together with AI SQL",
      "A reimbursement recommendation drafted for each case; the investigator decides",
      "The receiving mule accounts traced across victims, for the 50:50 cost share",
    ],
    demo: [{ tour: "retail", stop: "case", label: "One case, worked by AI" }, { tour: "retail", stop: "money", label: "Follow the money" }],
    modules: ["AI4", "AI5", "APP0", "APP1"],
  },
  {
    id: "aml", name: "Anti-money laundering: suspicious activity reports", regulator: "National Crime Agency (POCA 2002, Terrorism Act 2000)",
    duty: "The regulated sector has a legal obligation to submit suspicious activity reports to the UK Financial Intelligence Unit, with specific requirements for the minimum information a report should contain.",
    source: { label: "NCA: Suspicious Activity Reports", url: "https://www.nationalcrimeagency.gov.uk/what-we-do/crime-threats/money-laundering-and-illicit-finance/suspicious-activity-reports" },
    verifiedOn: "2026-11-23",
    controls: [
      "Mule networks found from the money flows, not one alert at a time",
      "Every SAR narrative checked by AI for the information it should contain",
      "Past cases and SARs searchable in plain English, and outside names matched to customers",
    ],
    demo: [{ tour: "retail", stop: "money", label: "Follow the money" }, { tour: "retail", stop: "cases", label: "Find similar cases" }, { tour: "retail", stop: "names", label: "Is this our customer?" }],
    modules: ["AI4", "AI5", "DS2"],
  },
  {
    id: "uk-gdpr", name: "UK GDPR: protecting personal data and the right of access", regulator: "Information Commissioner's Office",
    duty: "People have the right to a copy of their personal information. In most cases a firm can't charge for it, must make a reasonable and proportionate search, and must respond without undue delay and within one month (extendable by up to two months for complex requests).",
    source: { label: "ICO: A guide to subject access", url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/" },
    verifiedOn: "2026-11-23",
    controls: [
      "Personal data classified and tagged once; masking and row access follow it into every tool, agent and app",
      "Every read of a personal column recorded in access history",
      "One query finds everything held about a customer, ready for the response",
    ],
    demo: [{ tour: "retail", stop: "data-request", label: "A customer asks for their data" }, { tour: "corporate", stop: "governed", label: "Governed by design" }, { tour: "corporate", stop: "ai-audit", label: "Every AI call on the record" }],
    modules: ["GOV1", "GOV2", "GOV3", "GOV4", "GOV5"],
  },
  {
    id: "model-risk", name: "Model risk management", regulator: "PRA (SS1/23)",
    duty: "Five principles for managing risk across all model types: model identification and risk classification, governance, development and use, independent validation, and risk mitigants. SS1/23 sets these expectations for UK banks with internal-model approval for regulatory capital.",
    source: { label: "Bank of England: SS1/23 Model risk management principles for banks", url: "https://www.bankofengland.co.uk/prudential-regulation/publication/2023/may/model-risk-management-principles-for-banks-ss" },
    verifiedOn: "2026-11-23",
    controls: [
      "Every model, version, training run and metric recorded in the Model Registry and experiments",
      "Validation by customer segment and over time, from the scores and real outcomes",
      "Model card and approval recorded next to the model before it goes live",
    ],
    demo: [{ tour: "retail", stop: "models", label: "Every model on the record" }, { tour: "retail", stop: "attrition", label: "Who's about to leave" }],
    modules: ["DS1", "DS2", "DS3", "DE5"],
  },
  {
    id: "cash-access", name: "Access to cash", regulator: "FCA (PS24/8), firms designated by HM Treasury",
    duty: "In force since 18 September 2024. Designated banks, including the UK's largest high-street banks, must identify and assess gaps in cash deposit and withdrawal services for personal and business current accounts, and fill a significant gap promptly. FCA guidance FG22/6 expects customers to be told of a branch closure at least 12 weeks ahead.",
    source: { label: "FCA: PS24/8 Access to cash", url: "https://www.fca.org.uk/publications/policy-statements/ps24-8-access-cash" },
    verifiedOn: "2026-11-23",
    controls: [
      "Real drive and walk times from every customer and business to every branch, not straight lines",
      "Small businesses, charities and clubs that pay cash in counted per branch, with their treasurers' digital access",
      "The closure assessment kept as data, so it can be shown to the regulator and rerun when the network changes",
    ],
    demo: [{ tour: "retail", stop: "branches", label: "Branch catchments" }],
    modules: ["DA3"],
  },
]

export const regulationById = (id: string) => REGULATIONS.find((r) => r.id === id)

/**
 * Public UK enforcement for IT failures that stopped payments. Every figure is taken from the FCA
 * Final Notice linked, checked against the PDF on 23 Nov 2026. `regulations` names the related
 * control on this map (our link, not a finding of the notice).
 */
export const ENFORCEMENT = [
  { firm: "TSB Bank plc", when: "FCA Final Notice, 20 Dec 2022", fine: 29_750_000, redress: 32_705_762, regulations: ["op-res"] as RegId[],
    what: "April 2018 move to a new IT platform: digital, telephone and branch banking failed, with knock-on problems for payments and card transactions. 225,492 complaints; the most common payment to a customer was £150.",
    url: "https://www.fca.org.uk/publication/final-notices/tsb-bank-plc-2022.pdf" },
  { firm: "Royal Bank of Scotland, NatWest and Ulster Bank", when: "FCA Final Notice, 19 Nov 2014", fine: 42_000_000, redress: 70_300_000, regulations: ["op-res"] as RegId[],
    what: "June 2012 IT incident: at least 6.5 million UK customers couldn't make payments, including SWIFT transfers and standing orders, or see accurate balances.",
    url: "https://www.fca.org.uk/publication/final-notices/rbs-natwest-ulster-final-notice.pdf" },
]
