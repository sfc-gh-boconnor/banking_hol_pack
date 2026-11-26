"""Build guide/index.html from the repo's own README and SQL files.

Run from the repo root:  python3 guide/build_guide.py
The guide is a single self-contained HTML file (no external scripts or fonts).
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PATHWAYS = {
    "Data Engineer":   ["DE1", "DE2", "GOV2"],
    "Data Analyst":    ["DA1", "DA2"],
    "Payments Ops":    ["OPS1", "OPS2", "DA1"],
    "AI Builder":      ["AI1", "AI3", "AI2"],
    "Governance":      ["GOV1", "GOV2", "AI3"],
}


def md_to_html(md: str) -> str:
    """Minimal markdown for the vignette READMEs: headings, tables, lists, quotes, code, links."""
    out, in_list, in_table = [], None, False

    def inline(s):
        s = html.escape(s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<span class="ref">\1</span>', s)
        return s

    def close():
        nonlocal in_list, in_table
        if in_list:
            out.append(f"</{in_list}>")
            in_list = None
        if in_table:
            out.append("</table>")
            in_table = False

    fence = None  # (kind, lines) while inside a ``` block
    for line in md.splitlines():
        f = re.match(r"^```\s*(\w*)\s*$", line)
        if fence is not None:
            if f:
                kind, buf = fence
                code = html.escape("\n".join(buf))
                if kind == "prompt":
                    out.append('<div class="prompt"><div class="plabel"><span>Paste into Cortex Code</span>'
                               '<button class="btn ghost cp">Copy</button></div><pre>' + code + '</pre></div>')
                else:
                    out.append('<div class="code"><button class="btn ghost cp">Copy</button><pre>' + code + '</pre></div>')
                fence = None
            else:
                fence[1].append(line)
            continue
        if f:
            close()
            fence = (f.group(1).lower(), [])
            continue
        # Lab Companion step lines: show Where/Expect/Paste, drop Media/Check (the app only)
        kv = re.match(r"^(Where|Expect|Paste|Media|Check): (.*)$", line)
        if kv:
            close()
            key, val = kv.groups()
            if key == "Where":
                out.append(f'<p class="where">{inline(val)}</p>')
            elif key == "Expect":
                out.append(f'<p class="expect"><strong>What you should see:</strong> {inline(val)}</p>')
            elif key == "Paste":
                out.append(f'<p class="where">Paste into: {inline(val)}</p>')
            continue
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(set(c) <= set("-: ") for c in cells):
                continue
            if not in_table:
                close()
                out.append('<table>')
                in_table = True
            if any(cells):
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
            continue
        m = re.match(r"^(#{1,3}) (.*)", line)
        if m:
            close()
            lvl = len(m.group(1)) + 1
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
        elif re.match(r"^\d+\. ", line):
            if in_list != "ol":
                close()
                out.append("<ol>")
                in_list = "ol"
            item = re.sub(r"^\d+\. ", "", line)
            out.append(f"<li>{inline(item)}</li>")
        elif line.startswith("- "):
            if in_list != "ul":
                close()
                out.append("<ul>")
                in_list = "ul"
            out.append(f"<li>{inline(line[2:])}</li>")
        elif line.startswith("> "):
            close()
            out.append(f"<blockquote>{inline(line[2:])}</blockquote>")
        elif line.strip():
            close()
            out.append(f"<p>{inline(line)}</p>")
        else:
            close()
    close()
    return "\n".join(out)


ARCH_START = "<!-- architecture:start"
ARCH_END = "<!-- architecture:end -->"


def architecture_mermaid(arch) -> str:
    """The C2 diagram GitHub renders: lanes left to right, governance across them."""
    lines = ["```mermaid", "flowchart LR"]
    ids = []
    for i, lane in enumerate(arch["lanes"], 1):
        lid = f"L{i}"
        ids.append(lid)
        lines.append(f'  subgraph {lid}["{i}. {lane["lane"]}"]')
        lines.append("    direction TB")
        for j, it in enumerate(lane["items"], 1):
            lines.append(f'    {lid}_{j}["<b>{it["name"]}</b><br/>{", ".join(it["modules"])}"]')
        lines.append("  end")
    lines.append("  " + " --> ".join(ids))
    g = arch["governance"]
    lines.append(f'  GOV["<b>{g["name"]}, across every step</b><br/>{", ".join(g["modules"])}"]')
    lines += ["  GOV -.- " + i for i in ids]
    lines += ["  classDef lane fill:#F4F8FA,stroke:#29B5E8,color:#11567F",
              "  classDef gov fill:#11567F,stroke:#11567F,color:#FFFFFF",
              "  class " + ",".join(ids) + " lane", "  class GOV gov", "```"]
    return "\n".join(lines)


def sync_c2_diagram(arch) -> str:
    """Rewrite the generated Mermaid block in C2 from core/architecture.json; returns the C2 text."""
    path = ROOT / "core" / "C2_data_product_tour.md"
    text = path.read_text()
    block = (ARCH_START + " (generated from core/architecture.json by guide/build_guide.py: edit that, not this) -->\n"
             + architecture_mermaid(arch) + "\n" + ARCH_END)
    if ARCH_START not in text:
        raise SystemExit("C2 has no architecture block; add the architecture:start / architecture:end markers")
    a = text.index(ARCH_START)
    b = text.index(ARCH_END) + len(ARCH_END)
    new = text[:a] + block + text[b:]
    if new != text:
        path.write_text(new)
    return new


def architecture_html(arch) -> str:
    """The same lanes as cards in the written guide."""
    esc = html.escape
    chips = lambda ms: "".join(f'<span class="chip">{esc(m)}</span>' for m in ms)
    lanes = []
    for i, lane in enumerate(arch["lanes"], 1):
        items = "".join(f'<div class="arch-item"><b>{esc(it["name"])}</b><span>{esc(it["detail"])}</span><div>{chips(it["modules"])}</div></div>'
                        for it in lane["items"])
        lanes.append(f'<div class="arch-lane"><small>Step {i}</small><h4>{esc(lane["lane"])}</h4><p>{esc(lane["summary"])}</p>{items}</div>')
    g = arch["governance"]
    return (f'<div class="arch"><div class="arch-lanes">{"".join(lanes)}</div>'
            f'<div class="arch-gov"><b>{esc(g["name"])}, across every step</b><span>{esc(g["detail"])}</span><div>{chips(g["modules"])}</div></div></div>')


def module(code, title, readme_html, sql_path):
    sql = sql_path.read_text() if sql_path and sql_path.exists() else ""
    return {"code": code, "title": title, "body": readme_html,
            "sql": sql, "sql_name": str(sql_path.relative_to(ROOT)) if sql else ""}


def c2_html(arch) -> str:
    text = sync_c2_diagram(arch)
    a = text.index(ARCH_START)
    b = text.index(ARCH_END) + len(ARCH_END)
    body = md_to_html("\n".join((text[:a] + "@@ARCH@@" + text[b:]).splitlines()[1:]))
    return body.replace("<p>@@ARCH@@</p>", architecture_html(arch))


def main():
    modules = [module("C1", "Explore the Iceberg data product",
                      "<p>Shared core for every pathway. Read the published Iceberg tables, prove the "
                      "read-only guard-rails and build a first client 360 query.</p>",
                      ROOT / "core" / "C1_explore_iceberg.sql"),
               module("C2", "Data product tour",
                      c2_html(json.loads((ROOT / "core" / "architecture.json").read_text())), None)]
    order = ["de", "da", "ds", "ops", "ai", "app", "gov"]
    for d in sorted((ROOT / "vignettes").iterdir(), key=lambda p: (order.index(re.match(r"[a-z]+", p.name).group()), p.name)):
        readme = (d / "README.md").read_text()
        code, title = re.match(r"# (\w+): (.*)", readme).groups()
        body = md_to_html("\n".join(readme.splitlines()[1:]))
        modules.append(module(code, title, body, next(d.glob("*.sql"))))
    catchups = [module(p.stem, "Catch-up: " + p.stem.replace("_", " "),
                       "<p>Run this if a vignette lists it as a prerequisite and you have not built it yet.</p>", p)
                for p in sorted((ROOT / "setup" / "catchup").glob("*.sql"))]

    data = json.dumps({"modules": modules + catchups, "pathways": PATHWAYS})
    page = TEMPLATE.replace("__DATA__", data.replace("</", "<\\/"))
    (ROOT / "guide" / "index.html").write_text(page)
    print(f"guide/index.html written: {len(modules)} modules, {len(catchups)} catch-ups")


TEMPLATE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Banking HOL pack - Lab Guide</title>
<style>
:root{--blue:#29B5E8;--navy:#11567F;--ink:#1F2937;--muted:#6B7280;--line:#E5E7EB;--bg:#F7FAFC}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{background:var(--navy);color:#fff;padding:18px 28px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.8;font-size:13px}
.wrap{display:flex;min-height:calc(100vh - 70px)}
nav{width:300px;background:#fff;border-right:1px solid var(--line);padding:16px;overflow-y:auto}
nav h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:18px 0 6px}
.persona{display:flex;flex-wrap:wrap;gap:6px}.persona button{border:1px solid var(--blue);background:#fff;color:var(--navy);border-radius:14px;padding:4px 10px;font-size:12px;cursor:pointer}
.persona button.on{background:var(--blue);color:#fff}
.item{display:block;width:100%;text-align:left;border:0;background:none;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:13px;color:var(--ink)}
.item:hover{background:#EEF7FC}.item.on{background:#DFF2FB;font-weight:600}.item.dim{opacity:.35}
.item .c{display:inline-block;min-width:42px;font-weight:700;color:var(--navy)}.item .done{float:right;color:#15803D}
main{flex:1;padding:28px 40px;max-width:1100px;overflow-y:auto}
main h2{font-size:24px;margin:0 0 4px}main h3{margin-top:26px;color:var(--navy)}
table{border-collapse:collapse;margin:10px 0}td{border:1px solid var(--line);padding:6px 10px;font-size:14px;vertical-align:top}
blockquote{border-left:4px solid var(--blue);margin:10px 0;padding:6px 14px;background:#fff}
code{background:#EEF2F7;padding:1px 5px;border-radius:4px;font-size:13px}
.sqlbar{display:flex;justify-content:space-between;align-items:center;margin-top:24px}
.arch{margin:16px 0}.arch-lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.arch-lane{background:#11567F0d;border-radius:10px;padding:10px}.arch-lane small{color:#5F6E73;font-size:10px}.arch-lane h4{margin:0 0 4px;color:#11567F;text-transform:uppercase;font-size:12px;letter-spacing:.04em}.arch-lane p{font-size:11px;color:#5F6E73;margin:0 0 8px}.arch-item{background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:6px;font-size:11px}.arch-item b,.arch-item span{display:block}.arch-item span{color:#5F6E73;margin:2px 0 6px}.chip{display:inline-block;border:1px solid #29B5E880;color:#11567F;border-radius:99px;padding:0 6px;margin:0 3px 3px 0;font-size:10px;font-weight:700}.arch-gov{margin-top:10px;background:#11567F;color:#fff;border-radius:10px;padding:12px;font-size:12px}.arch-gov span{display:block;margin:4px 0 8px;opacity:.9}.arch-gov .chip{color:#fff;border-color:#ffffff80}
.where{color:var(--muted);font-size:13px;margin:-4px 0 8px}
.expect{background:#E6F5FB;border-left:3px solid var(--blue);padding:8px 12px;border-radius:6px}
.prompt{border:1px solid var(--blue);border-radius:10px;margin:12px 0;overflow:hidden}
.prompt .plabel{display:flex;justify-content:space-between;align-items:center;background:#E6F5FB;padding:6px 12px;font-weight:600;color:var(--navy);font-size:13px}
.prompt pre{margin:0;border-radius:0;background:#fff;color:var(--ink);white-space:pre-wrap;max-height:none}
.code{position:relative;margin:12px 0}.code .cp{position:absolute;top:8px;right:8px}
pre{background:#0F172A;color:#E2E8F0;padding:16px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.45;max-height:620px}
.btn{background:var(--blue);color:#fff;border:0;border-radius:6px;padding:7px 12px;font-size:13px;cursor:pointer}
.btn.ghost{background:#fff;color:var(--navy);border:1px solid var(--line)}.ref{color:var(--navy);font-weight:600}
.muted{color:var(--muted);font-size:13px}
</style></head><body>
<header><h1>Banking HOL pack - Hands-on Labs</h1>
<p>Corporate banking payments data product on Snowflake - Iceberg to governed AI agents. Synthetic data only.</p></header>
<div class="wrap"><nav>
<h3>Choose your pathway</h3><div class="persona" id="personas"></div>
<h3>Shared core</h3><div id="core"></div>
<h3>Vignettes</h3><div id="vign"></div>
<h3>Catch-up scripts</h3><div id="catch"></div>
</nav><main id="main"></main></div>
<script>
const D = __DATA__;
const byCode = Object.fromEntries(D.modules.map(m => [m.code, m]));
let persona = localStorage.getItem('hol_persona') || '';
const done = JSON.parse(localStorage.getItem('hol_done') || '{}');
function copyText(s, b){
  const done = () => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); };
  const fallback = () => { const a = document.createElement('textarea'); a.value = s; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); done(); } catch (e) {} a.remove(); };
  if (navigator.clipboard) navigator.clipboard.writeText(s).then(done, fallback); else fallback();
}
document.addEventListener('click', e => { const b = e.target.closest('.cp'); if (b) copyText(b.parentElement.closest('.prompt,.code').querySelector('pre').textContent, b); });
function esc(s){return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function navItem(m){
  const b = document.createElement('button'); b.className = 'item'; b.dataset.code = m.code;
  b.innerHTML = '<span class="c">' + esc(m.code.length > 6 ? '' : m.code) + '</span>' + esc(m.title) + (done[m.code] ? '<span class="done">done</span>' : '');
  b.onclick = () => show(m.code); return b;
}
function render(){
  const P = document.getElementById('personas'); P.innerHTML = '';
  ['All', ...Object.keys(D.pathways)].forEach(p => {
    const b = document.createElement('button'); b.textContent = p;
    if ((p === 'All' && !persona) || p === persona) b.className = 'on';
    b.onclick = () => { persona = p === 'All' ? '' : p; localStorage.setItem('hol_persona', persona); render(); };
    P.appendChild(b);
  });
  const sets = {core: [], vign: [], catch: []};
  D.modules.forEach(m => (m.code === 'C1' || m.code === 'C2' ? sets.core : m.sql_name.includes('catchup') ? sets.catch : sets.vign).push(m));
  const order = persona ? D.pathways[persona] : null;
  if (order) sets.vign.sort((a, b) => (order.indexOf(a.code) + 1 || 99) - (order.indexOf(b.code) + 1 || 99));
  for (const [id, list] of Object.entries(sets)) {
    const el = document.getElementById(id); el.innerHTML = '';
    list.forEach(m => { const n = navItem(m); if (order && id === 'vign' && !order.includes(m.code)) n.classList.add('dim'); el.appendChild(n); });
  }
}
function show(code){
  const m = byCode[code];
  document.querySelectorAll('.item').forEach(i => i.classList.toggle('on', i.dataset.code === code));
  let h = '<h2>' + esc(m.code) + ': ' + esc(m.title) + '</h2>' + m.body;
  if (m.sql) h += '<div class="sqlbar"><span class="muted">' + esc(m.sql_name) + '</span><span>'
      + '<button class="btn ghost" id="cp">Copy SQL</button> <button class="btn" id="dn">' + (done[code] ? 'Completed' : 'Mark complete') + '</button></span></div>'
      + '<pre>' + esc(m.sql) + '</pre>';
  const main = document.getElementById('main'); main.innerHTML = h; main.scrollTop = 0;
  const cp = document.getElementById('cp');
  if (cp) cp.onclick = () => navigator.clipboard.writeText(m.sql).then(() => cp.textContent = 'Copied');
  const dn = document.getElementById('dn');
  if (dn) dn.onclick = () => { done[code] = !done[code]; localStorage.setItem('hol_done', JSON.stringify(done)); render(); show(code); };
}
render();
show('C1');
</script></body></html>
"""

if __name__ == "__main__":
    main()
