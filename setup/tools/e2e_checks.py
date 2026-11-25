"""End-to-end lab test: run every Lab Companion check against one account and print a pass/fail table.

Checks come from lab-companion/lib/checks.ts, exported to JSON with node (see e2e_run.sh).
They run as the app does: role HOL_ADMIN (HOL_PARTICIPANT for asCaller checks); byUser checks
use the user who ran the answer keys. Each check is one `snow sql` call.
Usage: python3 setup/tools/e2e_checks.py <connection> <checks.json> <attendee_user> [module ...]
"""
import json
import subprocess
import sys

conn, checks_file, user = sys.argv[1], sys.argv[2], sys.argv[3]
only = set(sys.argv[4:])
checks = [c for c in json.load(open(checks_file)) if not only or c["module"] in only]


def run(c):
    sql = c["sql"].replace("?", "'" + user.replace("'", "''") + "'") if c["byUser"] else c["sql"]
    role = "HOL_PARTICIPANT" if c["asCaller"] else "HOL_ADMIN"
    script = f"USE ROLE {role}; USE SECONDARY ROLES NONE; USE WAREHOUSE BANKING_WH;\n{sql.rstrip().rstrip(';')};"
    p = subprocess.run(["snow", "sql", "-c", conn, "--format", "json", "--enable-templating", "NONE", "-q", script],
                       capture_output=True, text=True, timeout=300)
    try:
        last = json.loads(p.stdout)[-1]
        row = last[0] if isinstance(last, list) else last
        row = {k.upper(): v for k, v in row.items()}
        return bool(row.get("OK")), str(row.get("DETAIL"))
    except Exception:
        err = (p.stderr or p.stdout).replace("\n", " ")
        return False, "ERROR " + err[err.find("SQL"):][:160] if "SQL" in err else "ERROR " + err[-160:]


results = []
for c in checks:
    ok, detail = run(c)
    results.append(dict(module=c["module"], id=c["id"], ok=ok, detail=detail))
    print(f"{c['module']:5} {'PASS' if ok else 'FAIL'}  {c['id']:28} {detail[:110]}", flush=True)

print(f"\n{sum(r['ok'] for r in results)}/{len(results)} checks passed")
json.dump(results, open(checks_file.replace(".json", "_results.json"), "w"), indent=1)
