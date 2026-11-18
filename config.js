const SUPABASE_URL = "https://irpyrvykhltuqmbzskfw.supabase.co";

const SUPABASE_KEY = "sb_publishable_jY6DFXLHabujhTUaZqvm5w_UyevaSi6";

const HEADERS = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

// =========================
// DATABASE GET
// =========================
async function dbGet(table, params = "") {

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}${params}`,
        {
            headers: HEADERS
        }
    );

    return res.json();
}

// =========================
// DATABASE POST
// =========================
async function dbPost(table, data) {

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}`,
        {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(data)
        }
    );

    const result = await res.json();

    if (!res.ok) {
        console.error("SUPABASE ERROR:", JSON.stringify(result, null, 2));
        return {
            ok: false,
            data: result
        };
    }

    return {
        ok: true,
        data: result
    };
}

// =========================
// DATABASE PATCH
// =========================
async function dbPatch(table, id, body) {

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
        {
            method: "PATCH",
            headers: HEADERS,
            body: JSON.stringify(body)
        }
    );

    return {
        ok: res.ok,
        data: await res.json()
    };
}

// =========================
// DATABASE DELETE
// =========================
async function dbDelete(table, id) {

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
        {
            method: "DELETE",
            headers: HEADERS
        }
    );

    return {
        ok: res.ok
    };
}

// =========================
// TOAST
// =========================
function showToast(msg, type = "success") {

    const t = document.getElementById("toast");

    if (!t) return;

    t.textContent = msg;

    t.className = `toast show ${type}`;

    setTimeout(() => {

        t.className = "toast";

    }, 3500);
}

// =========================
// LIVE CLOCK
// =========================
function startClock() {

    const el = document.getElementById("clock");

    if (!el) return;

    setInterval(() => {

        el.textContent =
            new Date().toLocaleTimeString(
                "en-GB",
                { hour12: false }
            );

    }, 1000);
}