# The lab guide inside Snowflake: shows guide/index.html (built by build_guide.py) in a
# Streamlit app, so every account has the steps, including trial accounts, where the
# Lab Companion (Snowflake App Runtime) isn't available. Branding: .streamlit/config.toml.
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

HERE = Path(__file__).parent

st.set_page_config(page_title="Banking HOL lab guide", page_icon=str(HERE / "snowflake-bug-color-rgb.svg"), layout="wide")
st.logo(str(HERE / "snowflake-logo-color-rgb.svg"))

st.title("Banking HOL lab guide")
st.caption("Every module's steps, prompts and reference SQL. Check my work is in the Lab Companion, where your account supports it.")

components.html((HERE / "index.html").read_text(encoding="utf-8"), height=1800, scrolling=True)
