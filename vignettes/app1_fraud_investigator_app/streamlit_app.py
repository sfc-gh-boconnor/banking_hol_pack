"""APP1 reference solution: the fraud investigator app.

The answer key for the app Cortex Code builds in APP1. Streamlit in Snowflake,
container runtime, owner's rights (runs as HOL_PARTICIPANT). Reads the APP0 review
queue and saves each decision to BANKING_HOL.APPS.MATCH_DECISIONS.
"""
import streamlit as st
from snowflake.snowpark.context import get_active_session

APPS = "BANKING_HOL.APPS"
RAW = "BANKING_HOL.RAW_DATA"

st.set_page_config(page_title="Fraud investigator", layout="wide")
session = get_active_session()

# Who is deciding: the viewer, not the app owner (CURRENT_USER() is the owner here)
viewer = getattr(st, "user", None)
viewer = (viewer.get("user_name") if viewer else None) or "unknown"


@st.cache_data(ttl=60)
def queue(suggested: list[str]):
    return session.sql(
        f"""SELECT q.*, d.DECISION AS LAST_DECISION, d.DECIDED_BY, d.DECIDED_AT
            FROM {APPS}.FRAUD_REVIEW_QUEUE q
            LEFT JOIN (SELECT * FROM {APPS}.MATCH_DECISIONS
                       QUALIFY ROW_NUMBER() OVER (PARTITION BY MENTION_ID ORDER BY DECIDED_AT DESC) = 1) d USING (MENTION_ID)
            WHERE ARRAY_CONTAINS(q.SUGGESTED::VARIANT, PARSE_JSON(?))
            ORDER BY q.CANDIDATE_FRAUD_CASES DESC, q.SCORE DESC""",
        params=[str(suggested).replace("'", '"')],
    ).to_pandas()


@st.cache_data(ttl=300)
def fraud_history(customer_id: str):
    return session.sql(
        f"""SELECT CASE_ID, FRAUD_TYPE, REPORTED_TS::DATE AS REPORTED, LOSS_GBP, DECISION
            FROM {RAW}.RB_FRAUD_CASES WHERE CUSTOMER_ID = ? ORDER BY REPORTED_TS DESC""",
        params=[customer_id],
    ).to_pandas()


def save(mention_id: str, customer_id: str | None, decision: str, note: str):
    session.sql(
        f"INSERT INTO {APPS}.MATCH_DECISIONS (MENTION_ID, CUSTOMER_ID, DECISION, NOTE, DECIDED_BY) VALUES (?, ?, ?, ?, ?)",
        params=[mention_id, customer_id, decision, note or None, viewer],
    ).collect()
    queue.clear()


st.title("Fraud investigator")
st.caption("Names from police reports, other banks and dispute forms, matched to our customers. "
           "A match is a lead, never a fact on a name alone. Every decision is saved with who made it.")

suggested = st.segmented_control("Suggested", ["REVIEW", "MATCH", "NO_MATCH"], selection_mode="multi", default=["REVIEW"])
df = queue(suggested or ["REVIEW"])

c1, c2, c3 = st.columns(3)
c1.metric("In this queue", len(df))
c2.metric("Decided", int(df["LAST_DECISION"].notna().sum()))
c3.metric("Candidate has fraud history", int((df["CANDIDATE_FRAUD_CASES"] > 0).sum()))

left, right = st.columns([3, 2])
with left:
    event = st.dataframe(
        df[["MENTION_ID", "SOURCE_DESCRIPTION", "NAME_AS_WRITTEN", "DOB_AS_WRITTEN", "TOWN", "CANDIDATE_NAME",
            "CANDIDATE_CITY", "SCORE", "SUGGESTED", "CANDIDATE_FRAUD_CASES", "LAST_DECISION"]],
        hide_index=True, on_select="rerun", selection_mode="single-row", use_container_width=True,
    )

with right:
    rows = event.selection.rows if event and event.selection else []
    if not rows:
        st.info("Select a row to review it.")
    else:
        r = df.iloc[rows[0]]
        st.subheader(r["NAME_AS_WRITTEN"])
        st.write(f"{r['SOURCE_DESCRIPTION']}, {r['TOWN'] or 'no town'}, date of birth {r['DOB_AS_WRITTEN'] or 'not given'}")
        if r["CANDIDATE_CUSTOMER_ID"]:
            st.markdown(f"**Best candidate:** {r['CANDIDATE_NAME']} ({r['CANDIDATE_CUSTOMER_ID']}), {r['CANDIDATE_CITY']}, born {r['CANDIDATE_DOB']}")
            e1, e2, e3 = st.columns(3)
            e1.metric("Date of birth", "match" if r["DOB_MATCH"] else "no")
            e2.metric("Town", "match" if r["TOWN_MATCH"] else "no")
            e3.metric("Name similarity", int(r["NAME_SIM"]))
            hist = fraud_history(r["CANDIDATE_CUSTOMER_ID"])
            st.markdown(f"**Fraud history:** {len(hist)} case(s)")
            if len(hist):
                st.dataframe(hist, hide_index=True, use_container_width=True)
        else:
            st.warning("No candidate customer found.")
        if pd_last := r["LAST_DECISION"]:
            st.caption(f"Last decision: {pd_last} by {r['DECIDED_BY']} at {r['DECIDED_AT']}")
        note = st.text_input("Note (optional)", key=f"note_{r['MENTION_ID']}")
        b1, b2, b3 = st.columns(3)
        for col, label, decision in ((b1, "Confirm match", "CONFIRMED"), (b2, "Not our customer", "REJECTED"), (b3, "Escalate", "ESCALATED")):
            if col.button(label, key=f"{decision}_{r['MENTION_ID']}", use_container_width=True):
                save(r["MENTION_ID"], r["CANDIDATE_CUSTOMER_ID"], decision, note)
                st.toast(f"Saved: {decision.lower()}")
                st.rerun()
