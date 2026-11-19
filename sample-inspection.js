// INK LAB ERP — sample-inspection.js

let allInspections = [];
let stCount        = 0;
let manualResult   = false;

startClock();

const CHECKS = [
    ["reg",      "Color-to-color registration"],
    ["match",    "Color match vs approved sample / Pantone"],
    ["density",  "Ink density / solid uniformity"],
    ["ghost",    "No ghosting"],
    ["bridge",   "No bridging / fill-in of fine text"],
    ["pinhole",  "No pinholes / voids"],
    ["halo",     "No halo / dirty print / hickies"],
    ["dot",      "Dot gain within spec"],
    ["text",     "Text & fine lines legibility"],
    ["barcode",  "Barcode scannable"],
    ["streak",   "No streaks / doctor-blade lines"],
    ["adhesion", "Ink adhesion (tape test)"],
    ["rub",      "Rub / scratch resistance"],
    ["block",    "No blocking (reel test)"],
    ["odor",     "Odor / residual solvent acceptable"],
    ["cr",       "Cut-off / repeat length correct"],
    ["tension",  "Web tension / no wrinkles"],
    ["artwork",  "Artwork matches approved proof"]
];

const RESULT_BADGE = { approved: "approved", hold: "hold", rejected: "rejected" };

function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function genNo() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `SI-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function nowLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

const val = id => document.getElementById(id).value;
const num = id => { const n = parseFloat(val(id)); return Number.isFinite(n) ? n : null; };

// ── FORM ─────────────────────────────────────────────────────
function toggleForm() {
    const form = document.getElementById("inspection-form");
    const btn  = document.getElementById("toggle-btn");
    const open = form.style.display === "none";
    form.style.display = open ? "block" : "none";
    btn.textContent    = open ? "✕ CLOSE" : "+ ADD INSPECTION";
    if (open && !val("i-no")) resetForm();
}

function buildChecks() {
    document.getElementById("chk-grid").innerHTML = CHECKS.map(([k, label]) => `
        <div class="chk">
            <span>${label}</span>
            <select id="c-${k}" onchange="colorChk(this);evalAuto()">
                <option value="na">N/A</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
            </select>
        </div>`).join("");
}

function colorChk(el) {
    el.className = el.value === "pass" ? "pass" : el.value === "fail" ? "fail" : "";
}

function resetForm() {
    document.querySelectorAll("#inspection-form input:not(#i-tol)").forEach(i => i.value = "");
    document.getElementById("i-tol").value = "3";
    document.querySelectorAll(".chk select").forEach(s => { s.value = "na"; s.className = ""; });
    document.getElementById("m-bar").value = "";
    document.getElementById("st-body").innerHTML = "";
    stCount = 0;
    manualResult = false;
    addStation();
    document.getElementById("i-no").value   = genNo();
    document.getElementById("i-date").value = nowLocal();
    imgReset(true);
    evalAuto();
}

// ── STATIONS ─────────────────────────────────────────────────
function addStation(d = {}) {
    stCount++;
    const f = (key, ph, type = "text") =>
        `<input data-f="${key}" type="${type}" ${type === "number" ? 'step="0.01"' : ""}
            placeholder="${ph}" value="${esc(d[key] ?? "")}" oninput="calcAllDE()">`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${stCount}</td>
        <td>${f("color", "PMS 485 C")}</td>
        <td>${f("batch", "Batch")}</td>
        <td>${f("anilox", "360 / 4.5")}</td>
        <td>${f("visc", "sec", "number")}</td>
        <td>${f("tL", "L", "number")}</td>
        <td>${f("ta", "a", "number")}</td>
        <td>${f("tb", "b", "number")}</td>
        <td>${f("mL", "L", "number")}</td>
        <td>${f("ma", "a", "number")}</td>
        <td>${f("mb", "b", "number")}</td>
        <td data-de>—</td>
        <td><button class="btn btn-danger" style="padding:4px 9px"
            onclick="this.closest('tr').remove();calcAllDE()">✕</button></td>`;
    document.getElementById("st-body").appendChild(tr);
    calcAllDE();
}

function rowVals(tr) {
    const o = {};
    tr.querySelectorAll("[data-f]").forEach(i => o[i.dataset.f] = i.value);
    return o;
}

function deltaE76(v) {
    const n = ["tL", "ta", "tb", "mL", "ma", "mb"].map(k => parseFloat(v[k]));
    if (n.some(isNaN)) return null;
    return Math.sqrt((n[3] - n[0]) ** 2 + (n[4] - n[1]) ** 2 + (n[5] - n[2]) ** 2);
}

function calcAllDE() {
    const tol = parseFloat(val("i-tol")) || 3;
    document.querySelectorAll("#st-body tr").forEach(tr => {
        const cell = tr.querySelector("[data-de]");
        const de = deltaE76(rowVals(tr));
        if (de === null) { cell.textContent = "—"; cell.className = ""; return; }
        cell.textContent = de.toFixed(2);
        cell.className   = de <= tol ? "de-ok" : "de-bad";
    });
    evalAuto();
}

// ── AUTO EVALUATION ──────────────────────────────────────────
function evalAuto() {
    const w = [];
    const dyne = num("i-dyne"), reg = num("m-reg"), solv = num("m-solv"), adh = num("m-adh");

    if (dyne !== null && dyne < 38)  w.push("Corona treatment below 38 dyne — adhesion risk.");
    if (reg  !== null && reg  > 0.15) w.push("Register error exceeds 0.15 mm.");
    if (solv !== null && solv > 10)   w.push("Residual solvent exceeds 10 mg/m².");
    if (adh  !== null && adh  < 95)   w.push("Tape-test adhesion below 95%.");

    const badDE = document.querySelectorAll("#st-body .de-bad").length;
    if (badDE) w.push(`${badDE} station(s) exceed the ΔE tolerance.`);

    const fails = CHECKS.filter(([k]) => document.getElementById("c-" + k)?.value === "fail").length;
    if (fails) w.push(`${fails} quality check(s) marked Fail.`);

    const imgCrit = imgResult ? imgResult.findings.filter(f => f.sev === "crit").length : 0;
    const imgWarn = imgResult ? imgResult.findings.filter(f => f.sev === "warn").length : 0;
    if (imgCrit) w.push(`Image comparison: ${imgCrit} critical difference(s) found.`);
    else if (imgWarn) w.push(`Image comparison: ${imgWarn} warning(s) — review.`);

    document.getElementById("auto-warn").innerHTML = w.length ? "⚠ " + w.join("<br>⚠ ") : "";

    if (!manualResult) {
        document.getElementById("r-result").value =
            !w.length ? "approved" : (fails || badDE || imgCrit) ? "rejected" : "hold";
        paintResult();
    }
}

function manualDecision() { manualResult = true; paintResult(); }

function paintResult() {
    const v = val("r-result"), b = document.getElementById("res-box");
    b.className   = "res-box " + (v === "approved" ? "ok" : v === "rejected" ? "no" : "hold");
    b.textContent = v === "approved" ? "APPROVED" : v === "rejected" ? "REJECTED" : "ON HOLD";
}

// ── SAVE ─────────────────────────────────────────────────────
async function saveInspection() {
    const job_no = val("i-job").trim();
    const inspector = val("i-inspector").trim();

    if (!job_no)    { showToast("Job / Order No required", "warn"); return; }
    if (!inspector) { showToast("QC Inspector required", "warn"); return; }

    const checks = {};
    CHECKS.forEach(([k]) => checks[k] = val("c-" + k));
    const stations = [...document.querySelectorAll("#st-body tr")].map(rowVals);

    const body = {
        inspection_no: val("i-no"),
        inspected_at:  new Date(val("i-date") || Date.now()).toISOString(),
        job_no, inspector,
        customer: val("i-customer").trim(),
        product:  val("i-product").trim(),
        machine:  val("i-machine").trim(),
        operator: val("i-operator").trim(),
        shift: val("i-shift"), stage: val("i-stage"),
        substrate: val("i-substrate"),
        micron: num("i-micron"), web_width: num("i-width"),
        dyne: num("i-dyne"), speed: num("i-speed"), dryer_temp: num("i-temp"),
        plate: val("i-plate").trim(), ink_system: val("i-system"),
        de_tolerance: num("i-tol") ?? 3,
        register_error: num("m-reg"), repeat_length: num("m-repeat"),
        residual_solvent: num("m-solv"), barcode_grade: val("m-bar") || null,
        adhesion_pct: num("m-adh"), rub_cycles: num("m-rub"),
        stations, checks,
        ref_image:    imgData.ref ? imgData.ref.url : null,
        sample_image: imgData.smp ? imgData.smp.url : null,
        diff_image:   imgResult ? imgResult.diffUrl : null,
        image_findings: imgResult ? {
            findings: imgResult.findings, textSim: imgResult.textSim,
            counts: imgResult.counts, refText: imgResult.refText, smpText: imgResult.smpText
        } : null,
        result: val("r-result"),
        notes:  val("r-notes").trim()
    };

    const result = await dbPost("sample_inspections", body);
    if (result.ok) {
        showToast("✓ Inspection saved", "success");
        resetForm(); toggleForm(); loadInspections();
    } else {
        showToast("Error: " + (result.data?.message || "Unknown"), "error");
    }
}

// ── LOAD ─────────────────────────────────────────────────────
async function loadInspections() {
    const data = await dbGet("sample_inspections", "?order=inspected_at.desc");
    if (!Array.isArray(data)) {
        document.getElementById("inspections-tbody").innerHTML =
            `<tr class="empty-row"><td colspan="8">Table not found — run sample_inspections.sql first</td></tr>`;
        showToast("Load failed", "error");
        return;
    }
    allInspections = data;
    renderInspections(data);
    updateStats(data);
}

function updateStats(data) {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s("stat-total",    data.length);
    s("stat-approved", data.filter(x => x.result === "approved").length);
    s("stat-hold",     data.filter(x => x.result === "hold").length);
    s("stat-rejected", data.filter(x => x.result === "rejected").length);
}

function filterInspections() {
    const q  = document.getElementById("search-input").value.toLowerCase();
    const st = document.getElementById("filter-result").value;
    renderInspections(allInspections.filter(x => {
        const hay = [x.inspection_no, x.job_no, x.customer, x.product, x.inspector].join(" ").toLowerCase();
        return hay.includes(q) && (!st || x.result === st);
    }));
}

// ── RENDER ───────────────────────────────────────────────────
function renderInspections(data) {
    const tbody = document.getElementById("inspections-tbody");
    if (!data.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No inspections yet</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(x => `<tr>
        <td class="td-code">${esc(x.inspection_no)}</td>
        <td>${esc(x.job_no)}</td>
        <td>${esc(x.customer) || "—"}</td>
        <td>${esc(x.product) || "—"}</td>
        <td>${esc(x.inspector)}</td>
        <td><span class="badge badge-${RESULT_BADGE[x.result]}">${esc(x.result).toUpperCase()}</span></td>
        <td style="color:var(--text-3)">${new Date(x.inspected_at).toLocaleDateString()}</td>
        <td class="td-actions">
            <button class="btn btn-ghost" style="font-size:0.75rem;padding:5px 10px"
                onclick="viewInspection(${x.id})">👁 View</button>
            <button class="btn btn-ghost" style="font-size:0.75rem;padding:5px 10px"
                onclick="printInspection(${x.id})">🖨 Print</button>
            <button class="btn btn-danger" style="font-size:0.75rem;padding:5px 10px"
                onclick="deleteInspection(${x.id},'${esc(x.inspection_no)}')">✕</button>
        </td>
    </tr>`).join("");
}

// ── REPORT HTML (used by modal + print) ──────────────────────
function reportHTML(x) {
    const tol = Number(x.de_tolerance) || 3;
    const stRows = (x.stations || []).map((s, i) => {
        const de = deltaE76(s);
        return `<tr>
            <td>${i + 1}</td><td>${esc(s.color) || "—"}</td><td>${esc(s.batch) || "—"}</td>
            <td>${esc(s.anilox) || "—"}</td><td>${esc(s.visc) || "—"}</td>
            <td>${esc(s.tL)} / ${esc(s.ta)} / ${esc(s.tb)}</td>
            <td>${esc(s.mL)} / ${esc(s.ma)} / ${esc(s.mb)}</td>
            <td class="${de === null ? "" : de <= tol ? "de-ok" : "de-bad"}">${de === null ? "—" : de.toFixed(2)}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="8" style="text-align:center;color:var(--text-3)">No stations</td></tr>`;

    const chkRows = CHECKS.map(([k, label]) => {
        const v = (x.checks || {})[k] || "na";
        const col = v === "pass" ? "var(--green)" : v === "fail" ? "var(--danger)" : "var(--text-3)";
        return `<div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--bg2);
            border:1px solid var(--border);border-radius:6px;font-size:0.85rem">
            <span>${label}</span><strong style="color:${col}">${v.toUpperCase()}</strong></div>`;
    }).join("");

    const cell = (l, v) => `<div style="background:var(--bg2);padding:10px 12px;border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:0.7rem;color:var(--text-3);text-transform:uppercase;margin-bottom:3px">${l}</div>
        <div style="font-weight:700">${esc(v) || "—"}</div></div>`;

    const grid = items => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:16px">
        ${items.map(([l, v]) => cell(l, v)).join("")}</div>`;
    const title = t => `<div class="sec-title" style="margin-top:6px">${t}</div>`;
    const cls = x.result === "approved" ? "ok" : x.result === "rejected" ? "no" : "hold";

    return `
        ${title("Job Information")}
        ${grid([["Inspection No", x.inspection_no], ["Date", new Date(x.inspected_at).toLocaleString()],
            ["Job / Order", x.job_no], ["Customer", x.customer], ["Product", x.product],
            ["Machine", x.machine], ["Operator", x.operator], ["Inspector", x.inspector],
            ["Shift", x.shift], ["Stage", x.stage]])}
        ${title("Substrate & Setup")}
        ${grid([["Substrate", x.substrate], ["Thickness µm", x.micron], ["Width mm", x.web_width],
            ["Corona dyne", x.dyne], ["Speed m/min", x.speed], ["Dryer °C", x.dryer_temp],
            ["Plate", x.plate], ["Ink System", x.ink_system], ["ΔE Tol.", x.de_tolerance]])}
        ${title("Color Stations")}
        <div style="border:1px solid var(--border);border-radius:8px;overflow:auto;margin-bottom:16px">
            <table><thead><tr><th>#</th><th>Color</th><th>Batch</th><th>Anilox</th><th>Visc</th>
            <th>Target L/a/b</th><th>Measured L/a/b</th><th>ΔE</th></tr></thead>
            <tbody>${stRows}</tbody></table></div>
        ${title("Quality Checks")}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:6px;margin-bottom:16px">${chkRows}</div>
        ${title("Measurements")}
        ${grid([["Register Error mm", x.register_error], ["Repeat Length mm", x.repeat_length],
            ["Residual Solvent mg/m²", x.residual_solvent], ["Barcode Grade", x.barcode_grade],
            ["Adhesion %", x.adhesion_pct], ["Rub Cycles", x.rub_cycles]])}
        ${x.notes ? `<div style="padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);
            margin-bottom:14px;color:var(--text-2)">${esc(x.notes)}</div>` : ""}
        ${imageSectionHTML(x)}
        <div class="res-box ${cls}">${esc(x.result).toUpperCase()}</div>`;
}

// ── VIEW MODAL ───────────────────────────────────────────────
function viewInspection(id) {
    const x = allInspections.find(a => a.id === id);
    if (!x) return;
    document.getElementById("modal-title").textContent = `Inspection — ${x.inspection_no}`;
    document.getElementById("modal-body").innerHTML = reportHTML(x) + `
        <div class="btn-row">
            <button class="btn btn-primary" onclick="printInspection(${x.id})">🖨 Print</button>
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        </div>`;
    document.getElementById("view-modal").classList.add("open");
}

function closeModal() {
    document.getElementById("view-modal").classList.remove("open");
    document.getElementById("modal-body").innerHTML = "";
}

function handleOverlayClick(e) {
    if (e.target === document.getElementById("view-modal")) closeModal();
}

// ── PRINT (clean white report + signatures) ──────────────────
function printInspection(id) {
    const x = allInspections.find(a => a.id === id);
    if (!x) return;

    const w = window.open("", "_blank");
    if (!w) { showToast("Allow pop-ups to print", "warn"); return; }

    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>${esc(x.inspection_no)}</title>
        <link rel="stylesheet" href="../style.css">
        <link rel="stylesheet" href="sample-inspection.css">
        <style>
            body{background:#fff!important;color:#000!important;padding:20px}
            *{color:#000!important;border-color:#999!important;background:transparent!important;box-shadow:none!important}
            .res-box{border:2px solid #000!important}
            .sign-row{display:flex;justify-content:space-between;margin-top:50px}
            .sign-row div{width:30%;border-top:1px solid #000;padding-top:6px;text-align:center;font-size:.8rem}
            .head{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px}
        </style></head><body>
        <div class="head">
            <div><h2 style="margin:0"><span style="color:#dc2626!important">3</span><span style="color:#16a34a!important">P</span> INK LAB</h2>
                <div style="font-size:.8rem">Flexo Print — Sample Inspection Report</div></div>
            <div style="text-align:right;font-size:.85rem"><strong>${esc(x.inspection_no)}</strong><br>${new Date(x.inspected_at).toLocaleString()}</div>
        </div>
        ${reportHTML(x)}
        <div class="sign-row"><div>Operator</div><div>QC Inspector</div><div>Production Manager</div></div>
        <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
        </body></html>`);
    w.document.close();
}

// ── DELETE ───────────────────────────────────────────────────
async function deleteInspection(id, no) {
    if (!confirm(`Delete inspection "${no}"?`)) return;
    const result = await dbDelete("sample_inspections", id);
    if (result.ok) { showToast("Deleted", "success"); loadInspections(); }
    else showToast("Delete failed", "error");
}

// ── INIT ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
// IMAGE COMPARISON — reference vs production sample
//  • Visual: alignment + per-cell Lab color difference + region boxes
//  • Text:   OCR (Tesseract.js) + word-level diff
// ══════════════════════════════════════════════════════════════
const imgData = { ref: null, smp: null };
let imgResult = null;

function toJpeg(el, maxDim, q) {
    const s = Math.min(1, maxDim / Math.max(el.naturalWidth, el.naturalHeight));
    const c = document.createElement("canvas");
    c.width  = Math.round(el.naturalWidth * s);
    c.height = Math.round(el.naturalHeight * s);
    c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
}

function loadImg(kind, input) {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
        imgData[kind] = { el: im, url: toJpeg(im, 1000, 0.7) };
        const p = document.getElementById("prev-" + kind);
        p.src = imgData[kind].url;
        p.style.display = "block";
        URL.revokeObjectURL(url);
    };
    im.onerror = () => showToast("Could not read image", "error");
    im.src = url;
}

function imgReset(silent) {
    imgData.ref = imgData.smp = null;
    imgResult = null;
    ["ref", "smp"].forEach(k => {
        const p = document.getElementById("prev-" + k);
        if (p) { p.src = ""; p.style.display = "none"; }
    });
    const r = document.getElementById("img-results"); if (r) r.innerHTML = "";
    const pr = document.getElementById("ocr-progress"); if (pr) pr.textContent = "";
    if (!silent) evalAuto();
}

// ── color helpers ────────────────────────────────────────────
function rgb2lab(r, g, b) {
    const f = v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
    const R = f(r), G = f(g), B = f(b);
    const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const y =  R * 0.2126 + G * 0.7152 + B * 0.0722;
    const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const t = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
    const fx = t(x), fy = t(y), fz = t(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function dirDesc(dL, da, db) {
    const p = [];
    if (dL < -4) p.push("darker"); else if (dL > 4) p.push("lighter");
    if (da > 4) p.push("more red/magenta"); else if (da < -4) p.push("more green");
    if (db > 4) p.push("more yellow"); else if (db < -4) p.push("more blue");
    return p.length ? p.join(", ") : "slight shift";
}

// ── visual compare ───────────────────────────────────────────
function visualCompare(refEl, smpEl, thr) {
    const W = 640;
    const H = Math.round(W * refEl.naturalHeight / refEl.naturalWidth);
    const mk = el => {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(el, 0, 0, W, H);
        return { c, d: x.getImageData(0, 0, W, H).data };
    };
    const R = mk(refEl), S = mk(smpEl);
    const ra = refEl.naturalWidth / refEl.naturalHeight;
    const sa = smpEl.naturalWidth / smpEl.naturalHeight;
    const aspectDiff = Math.abs(ra - sa) / ra;

    const gray = d => {
        const g = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
        return g;
    };
    const gR = gray(R.d), gS = gray(S.d);

    // alignment: brute-force translation search on a sparse grid
    let best = { dx: 0, dy: 0, e: 1e9 };
    for (let dy = -16; dy <= 16; dy += 2) {
        for (let dx = -16; dx <= 16; dx += 2) {
            let e = 0, n = 0;
            for (let y = 24; y < H - 24; y += 6)
                for (let x = 24; x < W - 24; x += 6) { e += Math.abs(gR[y*W+x] - gS[(y+dy)*W+(x+dx)]); n++; }
            e /= n;
            if (e < best.e) best = { dx, dy, e };
        }
    }
    const { dx, dy } = best;

    // global means (for exposure normalisation + overall shift)
    const gm = d => { let r = 0, g = 0, b = 0; const n = W * H;
        for (let i = 0; i < n; i++) { r += d[i*4]; g += d[i*4+1]; b += d[i*4+2]; }
        return [r / n, g / n, b / n]; };
    const mR = gm(R.d), mS = gm(S.d);
    const ratio = mR.map((v, i) => Math.max(0.7, Math.min(1.4, v / (mS[i] || 1))));
    const labR = rgb2lab(...mR), labS = rgb2lab(...mS);
    const overallDE = Math.sqrt((labS[0]-labR[0])**2 + (labS[1]-labR[1])**2 + (labS[2]-labR[2])**2);
    const overallDesc = dirDesc(labS[0]-labR[0], labS[1]-labR[1], labS[2]-labR[2]);

    // per-cell Lab difference
    const CELL = 12, cols = Math.floor(W / CELL), rows = Math.floor(H / CELL);
    const flag = new Uint8Array(cols * rows);
    const cellInfo = new Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let r1=0,g1=0,b1=0,r2=0,g2=0,b2=0,n=0;
            for (let y = cy*CELL; y < (cy+1)*CELL; y += 2) {
                for (let x = cx*CELL; x < (cx+1)*CELL; x += 2) {
                    const sx = Math.max(0, Math.min(W-1, x+dx)), sy = Math.max(0, Math.min(H-1, y+dy));
                    const i = (y*W+x)*4, j = (sy*W+sx)*4;
                    r1 += R.d[i]; g1 += R.d[i+1]; b1 += R.d[i+2];
                    r2 += S.d[j]*ratio[0]; g2 += S.d[j+1]*ratio[1]; b2 += S.d[j+2]*ratio[2]; n++;
                }
            }
            const a = rgb2lab(r1/n, g1/n, b1/n);
            const b = rgb2lab(Math.min(255,r2/n), Math.min(255,g2/n), Math.min(255,b2/n));
            const dE = Math.sqrt((b[0]-a[0])**2 + (b[1]-a[1])**2 + (b[2]-a[2])**2);
            const k = cy*cols+cx;
            cellInfo[k] = { dE, dL: b[0]-a[0], da: b[1]-a[1], db: b[2]-a[2] };
            if (dE > thr) flag[k] = 1;
        }
    }

    // connected regions of flagged cells
    const seen = new Uint8Array(cols * rows), regions = [];
    for (let k0 = 0; k0 < flag.length; k0++) {
        if (!flag[k0] || seen[k0]) continue;
        const stack = [k0]; seen[k0] = 1;
        let minX=1e9,minY=1e9,maxX=-1,maxY=-1,cnt=0,sdE=0,sL=0,sa=0,sb=0;
        while (stack.length) {
            const k = stack.pop(), cx = k % cols, cy = (k / cols) | 0;
            const ci = cellInfo[k];
            cnt++; sdE += ci.dE; sL += ci.dL; sa += ci.da; sb += ci.db;
            minX=Math.min(minX,cx); maxX=Math.max(maxX,cx); minY=Math.min(minY,cy); maxY=Math.max(maxY,cy);
            [[1,0],[-1,0],[0,1],[0,-1]].forEach(([ax, ay]) => {
                const nx = cx+ax, ny = cy+ay;
                if (nx<0||ny<0||nx>=cols||ny>=rows) return;
                const nk = ny*cols+nx;
                if (flag[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
            });
        }
        if (cnt < 2) continue;
        const x = minX*CELL, y = minY*CELL, w = (maxX-minX+1)*CELL, h = (maxY-minY+1)*CELL;
        const cxm = x + w/2, cym = y + h/2;
        regions.push({
            x, y, w, h, cells: cnt, dE: sdE/cnt,
            desc: dirDesc(sL/cnt, sa/cnt, sb/cnt),
            pos: (cym < H/3 ? "top" : cym < 2*H/3 ? "middle" : "bottom") + "-" +
                 (cxm < W/3 ? "left" : cxm < 2*W/3 ? "center" : "right")
        });
    }
    regions.sort((a, b) => b.cells - a.cells);

    return { W, H, dx, dy, align: best.e, aspectDiff, overallDE, overallDesc,
             regions: regions.slice(0, 8), refCanvas: R.c, smpCanvas: S.c, thr };
}

// ── OCR + text diff ──────────────────────────────────────────
function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++)
            cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
        prev = cur;
    }
    return prev[n];
}

function ocrCanvas(el) {
    const s = 1800 / Math.max(el.naturalWidth, el.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.round(el.naturalWidth * s); c.height = Math.round(el.naturalHeight * s);
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(el, 0, 0, c.width, c.height);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        let g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
        d[i] = d[i+1] = d[i+2] = g;
    }
    x.putImageData(id, 0, 0);
    return c;
}

async function ocrWords(el, lang, W, H, label) {
    const c = ocrCanvas(el);
    const res = await Tesseract.recognize(c, lang, {
        logger: m => {
            if (m.status) document.getElementById("ocr-progress").textContent =
                `OCR ${label}: ${m.status}${m.progress ? " " + Math.round(m.progress * 100) + "%" : ""}`;
        }
    });
    const sx = W / c.width, sy = H / c.height;
    const words = [];
    (res.data.words || []).forEach(w => {
        const n = (w.text || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        if (!n) return;
        if (n.length < 2 && !/\d/.test(n)) return;
        if (w.confidence < 35 && n.length < 3) return;
        words.push({ t: w.text.trim(), n, conf: w.confidence,
            bb: { x: w.bbox.x0 * sx, y: w.bbox.y0 * sy, w: (w.bbox.x1 - w.bbox.x0) * sx, h: (w.bbox.y1 - w.bbox.y0) * sy } });
    });
    return { words, text: (res.data.text || "").trim() };
}

function diffWords(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            dp[i][j] = a[i].n === b[j].n ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
    const raw = []; let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i].n === b[j].n) { raw.push({ t: "eq", a: a[i], b: b[j] }); i++; j++; }
        else if (dp[i+1][j] >= dp[i][j+1]) raw.push({ t: "del", a: a[i++] });
        else raw.push({ t: "ins", b: b[j++] });
    }
    while (i < n) raw.push({ t: "del", a: a[i++] });
    while (j < m) raw.push({ t: "ins", b: b[j++] });

    // merge runs of del+ins into "chg" pairs
    const ops = []; let k = 0;
    while (k < raw.length) {
        if (raw[k].t === "eq") { ops.push(raw[k++]); continue; }
        const dels = [], inss = [];
        while (k < raw.length && raw[k].t !== "eq") { (raw[k].t === "del" ? dels : inss).push(raw[k]); k++; }
        const p = Math.min(dels.length, inss.length);
        for (let q = 0; q < p; q++) ops.push({ t: "chg", a: dels[q].a, b: inss[q].b });
        for (let q = p; q < dels.length; q++) ops.push(dels[q]);
        for (let q = p; q < inss.length; q++) ops.push(inss[q]);
    }
    return ops;
}

// ── draw annotated side-by-side image ────────────────────────
function drawDiff(vis, txt) {
    const { W, H, dx, dy } = vis;
    const out = document.createElement("canvas");
    out.width = W * 2 + 8; out.height = H;
    const x = out.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, out.width, out.height);
    x.drawImage(vis.refCanvas, 0, 0);

    x.save(); x.beginPath(); x.rect(W + 8, 0, W, H); x.clip();
    x.drawImage(vis.smpCanvas, W + 8 - dx, -dy);
    x.restore();

    const box = (bx, by, bw, bh, col, lw) => { x.strokeStyle = col; x.lineWidth = lw || 2; x.strokeRect(bx, by, bw, bh); };

    if (txt) txt.ops.forEach(o => {
        if (o.t === "del" || o.t === "chg") box(o.a.bb.x - 1, o.a.bb.y - 1, o.a.bb.w + 2, o.a.bb.h + 2, o.t === "del" ? "#a855f7" : "#fb923c");
        if (o.t === "ins" || o.t === "chg") box(W + 8 + o.b.bb.x - dx - 1, o.b.bb.y - dy - 1, o.b.bb.w + 2, o.b.bb.h + 2, "#fb923c");
    });
    vis.regions.forEach((r, i) => {
        box(W + 8 + r.x, r.y, r.w, r.h, "#ef4444", 3);
        x.fillStyle = "#ef4444"; x.fillRect(W + 8 + r.x, Math.max(0, r.y - 16), 18, 16);
        x.fillStyle = "#fff"; x.font = "bold 12px sans-serif"; x.fillText(String(i + 1), W + 8 + r.x + 5, Math.max(12, r.y - 4));
    });
    x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(0, 0, 90, 18); x.fillRect(W + 8, 0, 90, 18);
    x.fillStyle = "#fff"; x.font = "bold 12px sans-serif";
    x.fillText("REFERENCE", 6, 13); x.fillText("SAMPLE", W + 14, 13);
    return out.toDataURL("image/jpeg", 0.72);
}

// ── main analysis ────────────────────────────────────────────
async function analyzeImages() {
    if (!imgData.ref || !imgData.smp) { showToast("Add both images first", "warn"); return; }

    const btn = document.getElementById("analyze-btn"), prog = document.getElementById("ocr-progress");
    btn.disabled = true; prog.textContent = "Comparing visuals...";
    await new Promise(r => setTimeout(r, 40));

    const findings = [];
    const thr = parseFloat(val("img-sens")) || 9;

    try {
        const vis = visualCompare(imgData.ref.el, imgData.smp.el, thr);

        if (vis.aspectDiff > 0.1)
            findings.push({ sev: "warn", msg: "Image proportions differ by " + Math.round(vis.aspectDiff * 100) + "% — retake with the same framing for accurate comparison." });
        if (vis.align > 45)
            findings.push({ sev: "warn", msg: "Images could not be aligned well (very different angle/crop). Visual results may include false positives." });
        if (vis.overallDE > thr * 0.6)
            findings.push({ sev: vis.overallDE > thr * 1.2 ? "crit" : "warn",
                msg: `Overall color shift ΔE ${vis.overallDE.toFixed(1)}: sample looks ${vis.overallDesc} vs reference (check lighting too).` });

        vis.regions.forEach((r, i) => findings.push({
            sev: r.dE >= thr * 1.6 ? "crit" : "warn",
            msg: `Region #${i + 1} (${r.pos}): print differs from reference — ${r.desc} (ΔE ≈ ${r.dE.toFixed(1)}). Possible color error, missing ink, smear or artwork difference.`
        }));

        // text
        let txt = null, textSim = null, refText = "", smpText = "";
        const counts = { missing: 0, extra: 0, changed: 0, regions: vis.regions.length };
        if (typeof Tesseract === "undefined") {
            findings.push({ sev: "info", msg: "OCR engine not loaded (needs internet) — text comparison skipped." });
        } else {
            try {
                const lang = val("img-lang");
                const a = await ocrWords(imgData.ref.el, lang, vis.W, vis.H, "reference");
                const b = await ocrWords(imgData.smp.el, lang, vis.W, vis.H, "sample");
                const ops = diffWords(a.words, b.words);
                txt = { ops, a, b };
                refText = a.text; smpText = b.text;

                const eq = ops.filter(o => o.t === "eq").length;
                textSim = Math.round(100 * eq / Math.max(a.words.length, b.words.length, 1));

                ops.forEach(o => {
                    if (o.t === "eq") {
                        if (o.b.conf < 55 && o.a.conf >= 75)
                            findings.push({ sev: "warn", msg: `Word "${o.a.t}" is unclear/blurred in the sample (OCR confidence ${Math.round(o.b.conf)}% vs ${Math.round(o.a.conf)}% in reference) — possible print quality issue.` });
                        return;
                    }
                    if (o.t === "del") { counts.missing++;
                        findings.push({ sev: /\d/.test(o.a.n) ? "crit" : "warn", msg: `Missing in sample: "${o.a.t}"` }); }
                    if (o.t === "ins") { counts.extra++;
                        findings.push({ sev: /\d/.test(o.b.n) ? "crit" : "warn", msg: `Extra in sample: "${o.b.t}"` }); }
                    if (o.t === "chg") { counts.changed++;
                        findings.push({ sev: /\d/.test(o.a.n + o.b.n) ? "crit" : "warn", msg: `Text differs: reference "${o.a.t}" → sample "${o.b.t}"` }); }
                });
                if (textSim < 85)
                    findings.unshift({ sev: "crit", msg: `Text match only ${textSim}% — label text differs noticeably from reference (OCR can misread; verify visually).` });
                if (!a.words.length)
                    findings.push({ sev: "info", msg: "No readable text found in the reference image." });
            } catch (e) {
                console.error(e);
                findings.push({ sev: "info", msg: "OCR failed (" + (e.message || "network") + ") — text comparison skipped." });
            }
        }

        // cap the long lists
        let trimmed = findings;
        if (findings.length > 40) { trimmed = findings.slice(0, 40); trimmed.push({ sev: "info", msg: `+ ${findings.length - 40} more findings not shown.` }); }

        prog.textContent = "Drawing report...";
        const diffUrl = drawDiff(vis, txt);

        imgResult = { findings: trimmed, textSim, counts, refText, smpText, diffUrl,
                      overallDE: vis.overallDE, ops: txt ? txt.ops : [] };
        renderImgResults(imgResult);
        prog.textContent = "Done.";
        evalAuto();
        showToast("Comparison complete", "success");
    } catch (e) {
        console.error(e);
        prog.textContent = "";
        showToast("Analysis failed: " + e.message, "error");
    }
    btn.disabled = false;
}

function findingsHTML(list) {
    if (!list || !list.length) return `<div class="finding" style="border-color:var(--green)">✅ No differences detected.</div>`;
    const icon = { crit: "⛔", warn: "⚠️", info: "ℹ️" };
    return list.map(f => `<div class="finding ${f.sev}">${icon[f.sev] || ""} ${esc(f.msg)}</div>`).join("");
}

function wdiffHTML(ops) {
    return ops.map(o => {
        if (o.t === "eq")  return `<span class="w-eq">${esc(o.a.t)}</span>`;
        if (o.t === "del") return `<span class="w-del" title="missing in sample">${esc(o.a.t)}</span>`;
        if (o.t === "ins") return `<span class="w-ins" title="extra in sample">${esc(o.b.t)}</span>`;
        return `<span class="w-chg">${esc(o.a.t)} → ${esc(o.b.t)}</span>`;
    }).join(" ");
}

function renderImgResults(r) {
    const c = r.counts;
    const textDiffs = c.missing + c.extra + c.changed;
    document.getElementById("img-results").innerHTML = `
        <div class="sum-grid">
            <div class="sum-card"><b style="color:${r.textSim === null ? "var(--text-3)" : r.textSim >= 95 ? "var(--green)" : r.textSim >= 85 ? "var(--warn)" : "var(--danger)"}">${r.textSim === null ? "—" : r.textSim + "%"}</b><span>Text Match</span></div>
            <div class="sum-card"><b style="color:${textDiffs ? "var(--danger)" : "var(--green)"}">${textDiffs}</b><span>Text Differences</span></div>
            <div class="sum-card"><b style="color:${c.regions ? "var(--danger)" : "var(--green)"}">${c.regions}</b><span>Print Regions</span></div>
            <div class="sum-card"><b>${r.overallDE.toFixed(1)}</b><span>Overall ΔE</span></div>
        </div>
        <img class="img-diff" src="${r.diffUrl}">
        <div class="hint">Purple = missing text · Orange = changed/extra text · Red numbered = print/color difference</div>
        <div class="sec-title">Findings</div>
        ${findingsHTML(r.findings)}
        ${r.ops.length ? `<div class="sec-title">Text Comparison</div><div class="wdiff">${wdiffHTML(r.ops)}</div>
        <div class="hint">Grey = matches · <span class="w-del" style="padding:0 4px">red</span> missing · <span class="w-ins" style="padding:0 4px">orange</span> extra · <span class="w-chg" style="padding:0 4px">blue</span> changed</div>` : ""}
        <details style="margin-top:12px"><summary style="cursor:pointer;color:var(--text-2)">Show raw OCR text</summary>
            <pre style="white-space:pre-wrap;font-size:.78rem;margin-top:8px;color:var(--text-2)">REFERENCE:\n${esc(r.refText)}\n\nSAMPLE:\n${esc(r.smpText)}</pre></details>`;
}

// used in saved report / modal / print
function imageSectionHTML(x) {
    if (!x.sample_image && !x.ref_image) return "";
    const f = x.image_findings || {};
    return `
        <div class="sec-title" style="margin-top:6px">Image Comparison</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            ${x.ref_image ? `<div><div class="hint">Reference</div><img class="img-prev" src="${x.ref_image}"></div>` : ""}
            ${x.sample_image ? `<div><div class="hint">Production Sample</div><img class="img-prev" src="${x.sample_image}"></div>` : ""}
        </div>
        ${x.diff_image ? `<img class="img-diff" src="${x.diff_image}">` : ""}
        ${f.textSim !== undefined && f.textSim !== null ? `<div style="margin-bottom:8px;font-weight:700">Text match: ${f.textSim}%</div>` : ""}
        ${findingsHTML(f.findings)}
        <div style="margin-bottom:16px"></div>`;
}

buildChecks();
loadInspections();
