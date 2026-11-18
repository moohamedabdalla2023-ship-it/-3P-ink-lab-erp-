// ══════════════════════════════════════════════════════════════
// DEEP SCAN — non-rigid, tolerant comparison of two label photos (no AI, no OpenCV)
//  1) rough global fit (scale + shift) on tiny images
//  2) every small patch of the reference is searched in the sample around its expected place
//  3) patches with no good match = real differences (text / number / logo / shape)
//  returns candidate regions (reference coords) + where each one sits on the sample
// ══════════════════════════════════════════════════════════════
const DS = {
    gray(el, W, H) {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(el, 0, 0, W, H);
        const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H), sat = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) { g[i] = .299 * d[i*4] + .587 * d[i*4+1] + .114 * d[i*4+2]; sat[i] = (g[i] > 238 && Math.max(d[i*4], d[i*4+1], d[i*4+2]) - Math.min(d[i*4], d[i*4+1], d[i*4+2]) < 22) ? 1 : 0; }
        return { g, sat };
    },
    box(src, W, H, r) {                       // separable box blur
        const t = new Float32Array(W * H), o = new Float32Array(W * H), k = 2 * r + 1;
        for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y*W + Math.min(W-1, Math.max(0, x))];
            for (let x = 0; x < W; x++) { t[y*W+x] = s / k; s += src[y*W + Math.min(W-1, x+r+1)] - src[y*W + Math.max(0, x-r)]; } }
        for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H-1, Math.max(0, y))*W + x];
            for (let y = 0; y < H; y++) { o[y*W+x] = s / k; s += t[Math.min(H-1, y+r+1)*W + x] - t[Math.max(0, y-r)*W + x]; } }
        return o;
    },
    band(g, W, H) {                           // keeps strokes/edges, drops lighting
        const a = DS.box(DS.box(g, W, H, 1), W, H, 1), b = DS.box(DS.box(g, W, H, 7), W, H, 7), o = new Float32Array(W * H);
        for (let i = 0; i < o.length; i++) o[i] = a[i] - b[i];
        return o;
    },
    // rough global fit: sample coord = ref coord * s + t   (normalised 0..1, separate x / y scale)
    globalFit(refEl, smpEl) {
        const w = 56, hR = Math.max(24, Math.round(w * refEl.naturalHeight / refEl.naturalWidth)), hS = Math.max(24, Math.round(w * smpEl.naturalHeight / smpEl.naturalWidth));
        const R = DS.band(DS.gray(refEl, w, hR).g, w, hR), S = DS.band(DS.gray(smpEl, w, hS).g, w, hS);
        let best = { e: -1e9, sx: 1, sy: 1, tx: 0, ty: 0 };
        for (let sx = .7; sx <= 1.45; sx += .05) for (let sy = .7; sy <= 1.45; sy += .05)
            for (let tx = -.25; tx <= .25; tx += .025) for (let ty = -.25; ty <= .25; ty += .025) {
                let s12 = 0, s11 = 0, s22 = 0, n = 0;
                for (let y = 2; y < hR - 2; y += 2) { const v = (y / hR) * sy + ty; if (v < 0 || v >= 1) continue; const yy = (v * hS) | 0;
                    for (let x = 2; x < w - 2; x += 2) { const u = (x / w) * sx + tx; if (u < 0 || u >= 1) continue;
                        const a = R[y*w+x], b = S[yy*w + ((u * w) | 0)]; s12 += a * b; s11 += a * a; s22 += b * b; n++; } }
                if (n < 80) continue;
                const e = s12 / Math.sqrt(s11 * s22 + 1e-6) * Math.sqrt(n);     // NCC, favours bigger overlap
                if (e > best.e) best = { e, sx, sy, tx, ty };
            }
        return best;
    },
    scan(refEl, smpEl, opt) {
        opt = opt || {};
        const W = opt.W || 640, H = Math.round(W * refEl.naturalHeight / refEl.naturalWidth);
        const SW = W, SH = Math.round(W * smpEl.naturalHeight / smpEl.naturalWidth);
        const gf = DS.globalFit(refEl, smpEl);
        const R0 = DS.gray(refEl, W, H), S0 = DS.gray(smpEl, SW, SH);
        const R = DS.band(R0.g, W, H), S = DS.band(S0.g, SW, SH);
        const T = opt.T || 28, ST = opt.ST || 14, RAD = opt.RAD || 14;
        const cols = Math.floor((W - T) / ST) + 1, rows = Math.floor((H - T) / ST) + 1;
        const score = new Float32Array(cols * rows).fill(-1), offx = new Float32Array(cols * rows), offy = new Float32Array(cols * rows);
        const ncc = (px, py, qx, qy, pm, ps) => {          // ref patch at (px,py) vs sample patch at (qx,qy)
            let s = 0, s2 = 0, sp = 0;
            for (let j = 0; j < T; j += 2) for (let i = 0; i < T; i += 2) { const b = S[(qy + j) * SW + qx + i]; s += b; s2 += b * b; sp += R[(py + j) * W + px + i] * b; }
            const n = (T / 2) * (T / 2), m = s / n, v = s2 / n - m * m; if (v < 1) return 0;
            return (sp / n - pm * m) / (ps * Math.sqrt(v));
        };
        for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
            const px = cx * ST, py = cy * ST;
            let sat = 0, m = 0, m2 = 0, n = 0;
            for (let j = 0; j < T; j += 2) for (let i = 0; i < T; i += 2) { const k = (py + j) * W + px + i, v = R[k]; m += v; m2 += v * v; n++; sat += R0.sat[k]; }
            m /= n; const sd = Math.sqrt(Math.max(0, m2 / n - m * m));
            if (sat / n > .25) continue;                              // glare
            const ex = ((px + T / 2) / W * gf.sx + gf.tx) * SW - T / 2, ey = ((py + T / 2) / H * gf.sy + gf.ty) * SH - T / 2;
            if (ex < RAD || ey < RAD || ex > SW - T - RAD || ey > SH - T - RAD) continue;   // outside the sample photo
            if (sd < 3.5) continue;                                   // blank paper / flat colour
            let best = -2, bx = 0, by = 0;
            for (let dy = -RAD; dy <= RAD; dy += 2) for (let dx = -RAD; dx <= RAD; dx += 2) {
                const v = ncc(px, py, Math.round(ex + dx), Math.round(ey + dy), m, sd); if (v > best) { best = v; bx = dx; by = dy; } }
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const v = ncc(px, py, Math.round(ex + bx + dx), Math.round(ey + by + dy), m, sd); if (v > best) { best = v; offx[cy*cols+cx] = bx + dx; offy[cy*cols+cx] = by + dy; } }
            if (!offx[cy*cols+cx] && !offy[cy*cols+cx]) { offx[cy*cols+cx] = bx; offy[cy*cols+cx] = by; }
            score[cy*cols+cx] = best;
        }
        // lighting / printing differences lower every score a little: judge against this pair's own median
        const ok = Array.from(score).filter(v => v > -1).sort((a, b) => a - b);
        if (ok.length < 20) return { ok: false, reason: "few", W, H, gf };
        const med = ok[ok.length >> 1], thr = Math.min(.5, med - .22);
        const flag = new Uint8Array(cols * rows); for (let k = 0; k < flag.length; k++) if (score[k] > -1 && score[k] < thr) flag[k] = 1;
        const seen = new Uint8Array(flag.length), regions = [];
        for (let k0 = 0; k0 < flag.length; k0++) {
            if (!flag[k0] || seen[k0]) continue;
            const st = [k0]; seen[k0] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, c = 0, sc = 0, ox = 0, oy = 0;
            while (st.length) { const k = st.pop(), cx = k % cols, cy = (k / cols) | 0; c++; sc += thr - score[k]; ox += offx[k]; oy += offy[k];
                x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
                for (const [ax, ay] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const nx = cx + ax, ny = cy + ay; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                    const nk = ny * cols + nx; if (flag[nk] && !seen[nk]) { seen[nk] = 1; st.push(nk); } } }
            if (c < 2) continue;
            if ((x0 * ST < ST || y0 * ST < ST || x1 * ST + T > W - 2.5 * ST || y1 * ST + T > H - 2.5 * ST) && Math.min((x1 - x0) * ST + T, (y1 - y0) * ST + T) <= T + ST) continue;   // label edge / background strip
            const x = x0 * ST, y = y0 * ST, w = (x1 - x0) * ST + T, h = (y1 - y0) * ST + T, cxm = x + w / 2, cym = y + h / 2;
            regions.push({ x, y, w, h, cells: c, score: sc / c * Math.sqrt(c), odx: ox / c, ody: oy / c,
                pos: (cym < H / 3 ? "top" : cym < 2 * H / 3 ? "middle" : "bottom") + "-" + (cxm < W / 3 ? "left" : cxm < 2 * W / 3 ? "center" : "right") });
        }
        regions.sort((a, b) => b.score - a.score);
        return { ok: true, W, H, SW, SH, gf, med, thr, regions: regions.slice(0, 12), checked: ok.length };
    },
    // sample-image rectangle (normalised) matching a reference rectangle (pixels at scan size)
    smpRect(sc, r, pad) {
        const px = r.w * pad, py = r.h * pad, x = Math.max(0, r.x - px), y = Math.max(0, r.y - py), w = Math.min(sc.W - x, r.w + 2 * px), h = Math.min(sc.H - y, r.h + 2 * py);
        const gx = (x / sc.W * sc.gf.sx + sc.gf.tx) + r.odx / sc.SW, gy = (y / sc.H * sc.gf.sy + sc.gf.ty) + r.ody / sc.SH;
        return { ref: [x / sc.W, y / sc.H, w / sc.W, h / sc.H], smp: [gx, gy, w / sc.W * sc.gf.sx, h / sc.H * sc.gf.sy] };
    }
};