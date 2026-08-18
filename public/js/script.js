/* CACHE_BUST_TIMELINE_V2 no-qr chronological */

function dhlParseHistoryDate(h) {
    const raw = String((h && (h.date || h.createdAt)) || '').trim();
    let d = raw ? new Date(raw) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
        day: days[d.getDay()],
        dateLine: String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()] + ' ' + d.getFullYear(),
        timeLine: hh + ':' + mm + ' Local time',
    };
}
function dhlTimelineHtml(history) {
    // Same order as admin: first status at TOP, each new status BELOW (never reverse)
    let ordered = Array.isArray(history) ? history.slice() : [];
    ordered.sort((a, b) => {
        const da = String((a && a.date) || '');
        const db = String((b && b.date) || '');
        if (da && db && da !== db) return da.localeCompare(db);
        return 0; // keep original array order when same date (push order)
    });
    if (!ordered.length) {
        return '<div class="dhl-timeline"><div class="dhl-tl-item pending"><div class="dhl-tl-dot">△</div><div><div class="dhl-tl-status">Awaiting first scan</div></div></div></div>';
    }
    const last = ordered.length - 1;
    return '<div class="dhl-timeline">' + ordered.map((h, i) => {
        const label = String(h.label || h.status || 'Update');
        const loc = String(h.location || '');
        const isDelivered = /deliver/i.test(label);
        const isLatest = i === last;
        // All past steps = done (green); latest = current (green ring); none pending in between
        let cls = 'done';
        if (isLatest && !isDelivered) cls = 'current';
        if (isDelivered) cls = 'done';
        const dot = (cls === 'done') ? '✓' : '△';
        const t = dhlParseHistoryDate(h);
        const statusClass = isDelivered ? 'delivered' : '';
        // Line segment below this item is green if this step is done/current (connects to next)
        const lineCls = (i < last) ? (cls === 'done' || cls === 'current' ? 'line-green' : 'line-gray') : '';
        return `<div class="dhl-tl-item ${cls} ${lineCls}">
      <div class="dhl-tl-dot">${dot}</div>
      <div>
        <div class="dhl-tl-day">${esc(t.day)}</div>
        <div class="dhl-tl-date">${esc(t.dateLine)}</div>
        <div class="dhl-tl-time">${esc(t.timeLine)}</div>
        <div class="dhl-tl-status ${statusClass}">${esc(label)}</div>
        ${loc ? `<div class="dhl-tl-loc">${esc(loc)}</div>` : ''}
        <div class="dhl-tl-piece">1 Piece ID: ${esc((h.pieceId || ''))}</div>
      </div>
    </div>`;
    }).join('') + '</div>';
}



function generateTrackCode() {
    const n = Math.floor(100000 + Math.random() * 900000);
    return 'DHL' + n;
}

/* ---------- PLEASE WAIT LOADER ---------- */
let _mdDotTimer = null;
function mdShowWait(sub) {
    let el = document.getElementById('mdPleaseWait');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mdPleaseWait';
        el.className = 'md-please-wait';
        el.innerHTML = '<div class="dots" id="mdDots">......</div><div class="txt">Please wait</div><div class="sub" id="mdWaitSub">Loading…</div>';
        document.body.appendChild(el);
    }
    const subEl = el.querySelector('.sub') || document.getElementById('mdWaitSub');
    if (subEl) subEl.textContent = sub || 'Loading…';
    el.classList.add('show');
    let n = 0;
    const dots = el.querySelector('.dots') || document.getElementById('mdDots');
    if (_mdDotTimer) clearInterval(_mdDotTimer);
    _mdDotTimer = setInterval(() => {
        n = (n % 6) + 1;
        if (dots) dots.textContent = '.'.repeat(n);
    }, 280);
}
function mdHideWait() {
    const el = document.getElementById('mdPleaseWait');
    if (el) el.classList.remove('show');
    if (_mdDotTimer) { clearInterval(_mdDotTimer); _mdDotTimer = null; }
}


/* =========================================================
   NOTE ON THIS FILE
   This front end talks to a real Node.js + Express + MongoDB API
   (the DHL-backend files) instead of using localStorage.
   For it to work, that backend needs to be running.
   ========================================================= */

// Localhost → same origin /api. Online → Render backend.
const API_BASE = (function () {
    try {
        const h = location.hostname;
        if (h === "localhost" || h === "127.0.0.1" || h === "") return "/api";
    } catch (e) { }
    return "https://my-delivery-w6xz.onrender.com/api";
})();

// Admin login token — kept in a plain JS variable only (no localStorage),
// so you'll need to log in again after refreshing the page. That's expected.
let adminToken = null;
let _dhlSwReg = null;
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.register('/sw.js').then(reg => { _dhlSwReg = reg; }).catch(() => { });
}


async function apiRequest(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (adminToken) headers.Authorization = "Bearer " + adminToken;
    let res;
    try {
        res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    } catch (networkErr) {
        throw new Error("Could not reach the backend. Is it running at " + API_BASE + "?");
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body is fine */ }
    if (!res.ok) throw new Error(data.error || ("Request failed (" + res.status + ")"));
    return data;
}

const STATUS_LIBRARY = ["Order Received", "Dispatched", "Picked Up", "In Transit", "Arrived At Hub", "Customs Clearance", "Out For Delivery", "Delivered", "On Hold"];

/* ---------- NAV / VIEW SWITCHING ---------- */
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('overlay');
    if (!menu) return;
    const open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    if (overlay) overlay.classList.toggle('show', open);
    document.body.classList.toggle('menu-open', open);
}
function showSite() {
    destroyPublicMap();
    nsStopTrackWatch();
    document.getElementById('siteView').classList.remove('hidden');
    document.getElementById('trackPage').classList.add('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
}
function goTrack() {
    mdShowWait('Please wait……');
    document.getElementById('siteView').classList.add('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('trackPage').classList.remove('hidden');
    window.scrollTo(0, 0);
    setTimeout(mdHideWait, 350);
}
function openModal(id) {
    mdShowWait('Please wait……');
    setTimeout(() => { mdHideWait(); document.getElementById(id).classList.add('show'); }, 280);
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); document.getElementById(id).querySelectorAll('.error-box').forEach(e => e.style.display = 'none'); }

/* ---------- TRACKING (public, reads straight from MongoDB via the API) ---------- */
async function trackFromHero() {
    const code = document.getElementById('heroTrackInput').value.trim();
    const msg = document.getElementById('heroTrackMsg');
    if (!code) { msg.textContent = "Enter a tracking code first."; return; }
    mdShowWait('Tracking your package……');
    try {
        goTrack();
        document.getElementById('pageTrackInput').value = code;
        await renderTrackResult(code);
    } finally { mdHideWait(); }
}
async function trackFromPage() {
    const code = document.getElementById('pageTrackInput').value.trim();
    if (!code) { document.getElementById('pageTrackMsg').textContent = "Enter a tracking code first."; return; }
    mdShowWait('Tracking your package……');
    try { await renderTrackResult(code); } finally { mdHideWait(); }
}
async function renderTrackResult(code) {
    const box = document.getElementById('trackResultBox');
    const msg = document.getElementById('pageTrackMsg');
    let shipment;
    try {
        shipment = await apiRequest('/shipments/track/' + encodeURIComponent(code));
    } catch (err) {
        msg.textContent = err.message.includes('backend') ? err.message : "No shipment found for that code. Double-check and try again.";
        box.innerHTML = "";
        return;
    }
    msg.textContent = "";
    const current = shipment.history.length - 1;
    box.innerHTML = `
    <div class="track-result">
      <div class="track-head">
        <div><div class="mono" style="font-size:13px;color:var(--gray);">TRACKING CODE</div><h3 class="mono" style="font-size:22px;">${esc(shipment.code)}</h3></div>
        <div><span class="status-pill">${esc(shipment.history[current] ? shipment.history[current].label : 'Order Received')}</span></div>
      </div>
      <div class="parties">
        <div class="party"><h4>Sender</h4><p><strong>${esc(shipment.sender.name)}</strong><br>${esc(shipment.sender.address)}<br>${esc(shipment.sender.phone || '')}${shipment.sender.email ? '<br>' + esc(shipment.sender.email) : ''}</p></div>
        <div class="party"><h4>Receiver</h4><p><strong>${esc(shipment.receiver.name)}</strong><br>${esc(shipment.receiver.address)}<br>${esc(shipment.receiver.phone || '')}${shipment.receiver.email ? '<br>' + esc(shipment.receiver.email) : ''}</p></div>
      </div>
      <div class="pkg-meta">
        <div class="meta-chip">Shipment Date<b>${esc(shipment.shipmentDate || (shipment.history && shipment.history[0] && shipment.history[0].date) || (shipment.createdAt ? new Date(shipment.createdAt).toISOString().slice(0, 10) : '—'))}</b></div>
        
        <div class="meta-chip">Service<b>${esc(shipment.serviceType || '—')}</b></div>
        
        <div class="meta-chip">Weight<b>${esc((shipment.package && shipment.package.weightKg) != null ? shipment.package.weightKg : '—')} kg</b></div>
        <div class="meta-chip">Dimensions<b>${esc(shipment.package ? [shipment.package.length, shipment.package.width, shipment.package.height].filter(v => v != null && v !== '').join('×') : '—')} cm</b></div>
        
        <div class="meta-chip">Mode<b>${esc(shipment.mode || '—')}</b></div>
        <div class="meta-chip">Carrier<b>${esc(shipment.carrier || '—')}</b></div>
        <div class="meta-chip">Est. Delivery<b>${esc(shipment.estimatedDelivery || 'TBD')}</b></div>
        <div class="meta-chip">Payment<b>${esc(shipment.payment.status)} · ${esc(shipment.payment.method)}</b></div>
        <div class="meta-chip">Amount<b>${esc(shipment.payment.currency || '')} ${esc(Number(shipment.payment.amount || 0).toFixed(2))}</b></div>
        
        
      </div>
${dhlTimelineHtml(shipment.history)}
      <h4 class="section-title" style="margin-top:26px;" data-i18n="Live Location">Live Location</h4>
      <div class="route-progress-wrap">
        <div class="route-ends" style="font-weight:700;font-size:16px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="color:#D40511;">${esc((shipment.route && shipment.route.originCountry) || 'Origin')}</span>
          <span class="route-vehicle-icon" id="publicVehicleIcon" data-icon="${esc((shipment.route && shipment.route.icon) || 'truck')}"><span style="font-size:28px;line-height:1;">${(ICONS[(shipment.route && shipment.route.icon) || 'truck'] || '🚚')}</span></span>
          <span style="color:#D40511;">${esc((shipment.route && shipment.route.destCountry) || 'Destination')}</span>
        </div>
        <p style="font-size:13px;font-weight:600;margin:8px 0 4px;color:#111;">
          Origin: ${esc((shipment.route && shipment.route.originCountry) || '—')}
          &nbsp;→&nbsp;
          Destination: ${esc((shipment.route && shipment.route.destCountry) || '—')}
        </p>
        <div class="progress-bar tall"><div class="progress-fill" id="publicProgressFill" style="width:${Math.round(computeLiveProgress(shipment.route))}%"></div></div>
        <p style="font-size:12.5px;color:var(--gray);margin-top:8px;" id="publicProgressNote"></p>
      </div>
    </div>
    <div class="public-map-full">
      <div class="map-route-label" style="display:flex;justify-content:space-between;padding:8px 4px;font-weight:700;font-size:14px;">
        <span style="color:#D40511;">From: ${esc((shipment.route && shipment.route.originCountry) || 'Origin')}</span>
        <span style="color:#D40511;">To: ${esc((shipment.route && shipment.route.destCountry) || 'Destination')}</span>
      </div>
      <div id="publicMapBox"></div>
    </div>`;

    initPublicMap(shipment);
    nsStartTrackWatch(shipment.code);
    const rl = document.getElementById('receiptLink');
    if (rl) {
        rl.href = '/receipt?code=' + encodeURIComponent(shipment.code);
        rl.textContent = 'Open receipt for ' + shipment.code + ' (print / PDF)';
    }
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

/* ---------- CONTACT FORM (real POST to the backend) ---------- */
async function handleContactSubmit(e) {
    e.preventDefault();
    const fields = ['cName', 'cEmail', 'cSubject', 'cMessage'];
    let ok = true;
    fields.forEach(id => {
        const el = document.getElementById(id);
        const err = document.getElementById('err-' + id);
        const valid = id === 'cEmail' ? /\S+@\S+\.\S+/.test(el.value) : el.value.trim().length > 0;
        err.style.display = valid ? 'none' : 'block';
        if (!valid) ok = false;
    });
    if (!ok) return false;
    mdShowWait('Sending message……');
    try {
        await apiRequest('/contact', {
            method: 'POST', body: JSON.stringify({
                name: document.getElementById('cName').value.trim(),
                email: document.getElementById('cEmail').value.trim(),
                subject: document.getElementById('cSubject').value.trim(),
                message: document.getElementById('cMessage').value.trim(),
            })
        });
        document.getElementById('contactSuccess').style.display = 'block';
        document.getElementById('contactForm').reset();
    } catch (err) {
        alert("Couldn't send your message: " + err.message);
    } finally { mdHideWait(); }
    return false;
}

/* ---------- LOGIN (real server-side check via JWT) ---------- */
let pendingLoginTicket = null;

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const err = document.getElementById('loginError');
    mdShowWait('Signing in……');
    try {
        const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
        err.style.display = 'none';
        pendingLoginTicket = data.loginTicket;
        closeModal('loginModal');
        document.getElementById('pinInput').value = '';
        openModal('pinModal');
    } catch (err2) {
        err.textContent = err2.message || 'Incorrect username or password.';
        err.style.display = 'block';
    } finally { mdHideWait(); }
    return false;
}
async function handlePinSubmit(e) {
    e.preventDefault();
    const pin = document.getElementById('pinInput').value.trim();
    const err = document.getElementById('pinError');
    mdShowWait('Verifying PIN……');
    try {
        const data = await apiRequest('/auth/verify-pin', { method: 'POST', body: JSON.stringify({ loginTicket: pendingLoginTicket, pin }) });
        adminToken = data.token; sessionStorage.setItem("dhlAdminToken", data.token);
        pendingLoginTicket = null;
        err.style.display = 'none';
        closeModal('pinModal');
        document.getElementById('siteView').classList.add('hidden');
        document.getElementById('trackPage').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        if (typeof setAdminMode === 'function') setAdminMode(true);
        await renderShipList();
        nsLoadAdminNotifs();
        if (window._nsAdminNotifTimer) clearInterval(window._nsAdminNotifTimer);
        window._nsAdminNotifTimer = setInterval(nsLoadAdminNotifs, 8000);
        window.scrollTo(0, 0);
    } catch (err2) {
        err.textContent = err2.message || 'Incorrect PIN.';
        err.style.display = 'block';
    } finally { mdHideWait(); }
    return false;
}
function logoutAdmin() { destroyAdminMap(); adminToken = null; unlockedShipments = {}; showSite(); window.scrollTo(0, 0); const ls = document.getElementById('langStrip'); if (ls) ls.style.display = ''; }

/* ---------- ACCOUNT SETTINGS: change admin username/password/PIN ---------- */
async function handleCredentialsSubmit(e) {
    e.preventDefault();
    const err = document.getElementById('settingsError');
    const ok = document.getElementById('settingsSuccess');
    err.style.display = 'none'; ok.style.display = 'none';
    try {
        const data = await apiRequest('/auth/credentials', {
            method: 'PUT', body: JSON.stringify({
                currentPassword: document.getElementById('settingsCurrentPass').value,
                newUsername: document.getElementById('settingsNewUser').value.trim(),
                newPassword: document.getElementById('settingsNewPass').value.trim(),
                newPin: document.getElementById('settingsNewPin').value.trim(),
            })
        });
        ok.textContent = 'Saved. Username is now: ' + data.username;
        ok.style.display = 'block';
        document.getElementById('settingsCurrentPass').value = '';
        document.getElementById('settingsNewUser').value = '';
        document.getElementById('settingsNewPass').value = '';
        document.getElementById('settingsNewPin').value = '';
    } catch (err2) {
        err.textContent = err2.message;
        err.style.display = 'block';
    }
    return false;
}

/* ---------- SIGN UP: always fails, by design ---------- */
async function handleSignup(e) {
    e.preventDefault();
    document.getElementById('signupError').style.display = 'block';
    return false;
}

/* ---------- ADMIN: SHIPMENT LIST + DETAIL ---------- */
let activeCode = null;
let shipmentsCache = [];
let unlockedShipments = {}; // code -> full shipment data, cached in memory once a PIN has been entered correctly this session

async function renderShipList() {
    const wrap = document.getElementById('shipList');
    mdShowWait('Loading shipments……');
    try {
        shipmentsCache = await apiRequest('/shipments');
    } catch (err) {
        wrap.innerHTML = `<p style="color:var(--red);font-size:13px;">Couldn't load shipments: ${esc(err.message)}</p>`;
        mdHideWait();
        return;
    } finally { mdHideWait(); }
    if (shipmentsCache.length === 0) {
        renderShipListRows();
        document.getElementById('shipDetailPanel').innerHTML = '';
        activeCode = null;
        return;
    }
    const codeToShow = (activeCode && shipmentsCache.find(s => s.code === activeCode)) ? activeCode : shipmentsCache[0].code;
    await selectShipment(codeToShow);
}
function renderShipListRows() {
    const wrap = document.getElementById('shipList');
    if (shipmentsCache.length === 0) {
        wrap.innerHTML = '<p style="color:var(--gray);font-size:13.5px;">No shipments yet — create one to get started.</p>';
        return;
    }
    wrap.innerHTML = shipmentsCache.map(s => {
        const senderName = s.pinProtected ? s.senderName : s.sender.name;
        const receiverName = s.pinProtected ? s.receiverName : s.receiver.name;
        const status = s.pinProtected ? s.latestStatus : (s.history.length ? s.history[s.history.length - 1].label : 'Order Received');
        return `
      <div class="ship-row ${s.code === activeCode ? 'active' : ''}" onclick="selectShipment('${esc(s.code)}')">
        <div class="code">${esc(s.code)} ${s.pinProtected ? '🔒' : ''}</div>
        <div class="who">${esc(senderName)} → ${esc(receiverName)}</div>
        <div class="who">${esc(status)}</div>
      </div>`;
    }).join("");
}
async function selectShipment(code) {
    activeCode = code;
    renderShipListRows();
    if (unlockedShipments[code]) {
        renderShipDetail(unlockedShipments[code]);
        return;
    }
    const summary = shipmentsCache.find(s => s.code === code);
    if (!summary) return;
    if (!summary.pinProtected) {
        unlockedShipments[code] = summary;
        renderShipDetail(summary);
        return;
    }
    renderPinPrompt(code);
}
function renderPinPrompt(code) {
    destroyAdminMap();
    const panel = document.getElementById('shipDetailPanel');
    panel.innerHTML = `
    <h4 class="section-title">🔒 Locked Shipment</h4>
    <p style="font-size:13px;color:var(--gray);margin-bottom:14px;">This shipment has its own access code. Enter it to view or edit — sender, receiver, payment and map details stay hidden until it's correct.</p>
    <div class="field"><label>4-Digit Access Code</label><input id="unlockPinInput" class="mono" maxlength="4" inputmode="numeric" placeholder="0000"></div>
    <button class="btn btn-red small-btn" onclick="attemptUnlock('${esc(code)}')">Unlock</button>
    <p id="unlockError" style="color:var(--red);font-size:13px;margin-top:10px;display:none;"></p>
  `;
}
async function attemptUnlock(code) {
    const pin = document.getElementById('unlockPinInput').value.trim();
    const err = document.getElementById('unlockError');
    try {
        const full = await apiRequest('/shipments/' + encodeURIComponent(code) + '/unlock', { method: 'POST', body: JSON.stringify({ pin }) });
        full.pinProtected = true;
        unlockedShipments[code] = full;
        renderShipDetail(full);
    } catch (e) {
        err.textContent = e.message;
        err.style.display = 'block';
    }
}
function startNewShipment() {
    activeCode = null;
    renderShipListRows();
    renderShipDetail(null);
}

function renderShipDetail(shipment) {
    const panel = document.getElementById('shipDetailPanel');
    const isNew = !shipment;
    const s = shipment || { code: '', sender: { name: '', address: '', phone: '', email: '' }, receiver: { name: '', address: '', phone: '', email: '' }, package: { weightKg: '', length: '', width: '', height: '', description: '' }, payment: { amount: '', method: 'Card', status: 'Unpaid' }, mode: 'Air Freight', estimatedDelivery: '', carrier: '', history: [] };

    panel.innerHTML = `
    <h4 class="section-title">${isNew ? 'New Shipment' : 'Edit Shipment'}</h4>
    <div class="field">
      <label>Tracking Code</label>
      <input id="f_code" class="mono" value="${esc(s.code)}" ${isNew ? '' : 'readonly style="background:#F3F1EC;"'} placeholder="e.g. DHL XXX">
    </div>
    <div class="field">
      <label>Shipment Access Code <span style="color:var(--gray);font-weight:400;">(optional, 4 digits — locks this specific shipment from other admin users)</span></label>
      <input id="f_accessPin" class="mono" maxlength="4" inputmode="numeric" placeholder="e.g. 1234" value="">
      ${!isNew && s.pinProtected ? `<p style="font-size:12px;color:var(--gray);margin-top:5px;">🔒 A code is already set. Leave blank to keep it, or type a new 4-digit code to change it. <a style="color:var(--red);text-decoration:underline;cursor:pointer;" onclick="removeShipmentPin('${esc(s.code)}')">Remove code</a></p>` : ''}
    </div>
    <h4 class="section-title">Sender</h4>
    <div class="grid2">
      <div class="field"><label>Name</label><input id="f_senderName" value="${esc(s.sender.name)}"></div>
      <div class="field"><label>Phone</label><input id="f_senderPhone" value="${esc(s.sender.phone)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Email</label><input id="f_senderEmail" type="email" value="${esc(s.sender.email || '')}"></div>
      <div class="field"><label>Address</label><input id="f_senderAddr" value="${esc(s.sender.address)}"></div>
    </div>

    <h4 class="section-title">Receiver</h4>
    <div class="grid2">
      <div class="field"><label>Name</label><input id="f_recvName" value="${esc(s.receiver.name)}"></div>
      <div class="field"><label>Phone</label><input id="f_recvPhone" value="${esc(s.receiver.phone)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Email</label><input id="f_recvEmail" type="email" value="${esc(s.receiver.email || '')}"></div>
      <div class="field"><label>Address</label><input id="f_recvAddr" value="${esc(s.receiver.address)}"></div>
    </div>

    <h4 class="section-title">Package</h4>
    <div class="grid2">
      <div class="field"><label>Weight (kg)</label><input id="f_weight" type="number" step="0.1" value="${esc(s.package.weightKg)}"></div>
      <div class="field"><label>Mode</label>
        <select id="f_mode">
          ${["Air Freight", "Sea Freight", "Land Freight"].map(m => `<option ${s.mode === m ? 'selected' : ''}>${m}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="grid2">
      <div class="field"><label>Length (cm)</label><input id="f_len" type="number" value="${esc(s.package.length)}"></div>
      <div class="field"><label>Width (cm)</label><input id="f_wid" type="number" value="${esc(s.package.width)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Height (cm)</label><input id="f_hei" type="number" value="${esc(s.package.height)}"></div>
      <div class="field"><label>Description</label><input id="f_desc" value="${esc(s.package.description)}"></div>
    </div>

    <h4 class="section-title">Payment &amp; Delivery</h4>
    <div class="grid2">
      <div class="field"><label>Amount</label><input id="f_amount" type="number" step="0.01" value="${esc(s.payment.amount)}"></div>
      <div class="field"><label>Currency</label><input id="f_currency" value="${esc(s.payment.currency || 'USD')}" placeholder="e.g. USD, NGN, KES"></div>
    <h4 class="section-title">Receipt template (DHL-style)</h4>
    <div class="grid2">
      <div class="field"><label>Waybill Number</label><input id="f_waybill" value="${esc(s.waybillNumber || '')}"></div>
      <div class="field"><label>Service Type</label><input id="f_service" value="${esc(s.serviceType || 'EXPRESS WORLDWIDE')}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Packaging Type</label><input id="f_pack" value="${esc(s.packagingType || 'My Own Package')}"></div>
      <div class="field"><label>Pieces</label><input id="f_pieces" type="number" value="${esc(s.pieces != null ? s.pieces : 1)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Terms of Trade</label><input id="f_terms" value="${esc(s.termsOfTrade || '')}" placeholder="e.g. DDP, DAP, EXW"></div>
      <div class="field"><label>Billing Account</label><input id="f_billAcct" value="${esc(s.billingAccount || '')}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Declared Value</label><input id="f_decl" value="${esc(s.declaredValue || '')}"></div>
      <div class="field"><label>Special Services</label><input id="f_special" value="${esc(s.specialServices || '')}"></div>
    </div>
    <div class="field"><label>Reference</label><input id="f_ref" value="${esc(s.reference || '')}"></div>
    <div class="field"><label>Shipment Date</label><input id="f_shipDate" type="date" value="${esc(s.shipmentDate || '')}"></div>

    </div>
    <div class="field"><label>Method</label>
      <select id="f_method">
        ${["Card", "Bank Transfer", "Outstanding Payment", "Cash on Delivery"].map(m => `<option ${s.payment.method === m ? 'selected' : ''}>${m}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Payment Status</label>
      <select id="f_paystatus">
        ${["Paid", "Unpaid", "Refunded"].map(m => `<option ${s.payment.status === m ? 'selected' : ''}>${m}</option>`).join("")}
      </select>
    </div>
    <div class="grid2">
      <div class="field"><label>Estimated Delivery</label><input id="f_eta" type="date" value="${esc(s.estimatedDelivery || '')}"></div>
      <div class="field"><label>Carrier Service</label>
        <input id="f_carrier" value="${esc(s.carrier || '')}" placeholder="e.g. DHL Express">
      </div>
    </div>

    <div style="display:flex; gap:10px; margin-top:8px;">
      <button class="btn btn-red small-btn" onclick="saveShipment(${isNew})">Save Shipment</button>
      ${!isNew ? `<button class="btn btn-outline small-btn" style="color:var(--red);border-color:var(--red);" onclick="deleteShipment('${esc(s.code)}')">Delete</button>` : ''}
    </div>

    ${!isNew ? `
    <h4 class="section-title">Status Timeline</h4>
    <p style="font-size:12.5px;color:var(--gray);margin-bottom:6px;">Add the next status as the shipment moves. The green line fills up to the latest status you add.</p>
    <div class="quick-tags">
      ${STATUS_LIBRARY.map(l => `<span class="quick-tag" onclick="document.getElementById('f_newStatus').value='${l}'">${l}</span>`).join("")}
    </div>
    <div class="status-add-row">
      <input id="f_newStatus" placeholder="Status label (e.g. Out For Delivery)">
      <input id="f_newLocation" placeholder="Location">
      <input id="f_newDate" type="date">
      <button class="btn btn-red small-btn" onclick="addStatus('${esc(s.code)}')">Add</button>
    </div>
    <div class="timeline admin-timeline" style="margin-top:18px;">
      ${s.history.map((h, i) => `
        <div class="tl-step done ${i === s.history.length - 1 ? 'current' : ''}">
          <h5>${esc(h.label)}</h5>
          <span>${esc(h.date)} — ${esc(h.location)}</span>
          <div class="step-actions"><button onclick="removeStatus('${esc(s.code)}', ${i})">Remove</button></div>
        </div>`).join("")}
    </div>

    <h4 class="section-title">Live Map</h4>
    <p style="font-size:12.5px;color:var(--gray);margin-bottom:6px;">Pick the origin and destination countries, choose a vehicle and speed, then hit Done below to save. Drag the vehicle on the map to fine-tune its exact spot.</p>
    <div class="grid2">
      <div class="field"><label>Origin Country</label>
        ${countrySelectHtml('f_oCountry', (s.route && s.route.originCountry) || 'Indonesia')}
      </div>
      <div class="field"><label>Destination Country</label>
        ${countrySelectHtml('f_dCountry', (s.route && s.route.destCountry) || 'United States')}
      </div>
    </div>
    <div class="field"><label>Vehicle</label>
      <select id="f_icon" onchange="updateVehicleIconDisplay()">
        <option value="plane" ${(s.route && s.route.icon === 'plane') ? 'selected' : ''}>✈️ Plane</option>
        <option value="truck" ${(!(s.route && s.route.icon) || (s.route && s.route.icon === 'truck')) ? 'selected' : ''}>🚚 Truck</option>
        <option value="ship" ${(s.route && s.route.icon === 'ship') ? 'selected' : ''}>🚢 Ship</option>
        <option value="warehouse" ${(s.route && s.route.icon === 'warehouse') ? 'selected' : ''}>🏭 Warehouse</option>
      </select>
    </div>
    <div class="field"><label>Vehicle photo URL <span style="color:var(--gray);font-weight:400;">(optional — any http image link)</span></label>
      <input id="f_vehicleImg" type="url" placeholder="https://...jpg" value="${esc((s.route && s.route.vehicleImg) || '')}" oninput="updateVehicleIconDisplay()">
    </div>
    <div class="field"><label>Movement Speed</label>
      <select id="f_speed">
        <option value="slow" ${(!(s.route && s.route.speed) || (s.route && s.route.speed === 'slow')) ? 'selected' : ''}>Slow (1 week)</option>
        <option value="normal" ${(s.route && s.route.speed === 'normal') ? 'selected' : ''}>Normal (4 days)</option>
        <option value="fast" ${(s.route && s.route.speed === 'fast') ? 'selected' : ''}>Fast (2 days)</option>
      </select>
    </div>
    <div class="field">
      <label>Vehicle direction (simple)</label>
      <p style="font-size:13px;color:#333;line-height:1.45;margin:8px 0;">
        <b>Use your hands:</b> drag the plane/truck/ship on the map (stays on the line).
        Swipe left/right on it to turn. Push the yellow progress bar. Then <b>Pause</b> or <b>Done — Save</b>.
      </p>
      <select id="f_face" style="display:none;">
        <option value="auto">auto</option>
        <option value="manual" selected>manual</option>
        <option value="flip">flip</option>
      </select>
      <input type="hidden" id="f_rotSlider" value="${(s.route && s.route.rotationDeg != null) ? Number(s.route.rotationDeg) : ''}">
      <p id="rotHint" style="font-size:12px;color:#333;margin-top:4px;min-height:18px;"></p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
        <button type="button" class="btn btn-outline small-btn" style="background:#fff;color:#111;border:1px solid #999;" onclick="nudgeVehicleRot(-15)">Turn left</button>
        <button type="button" class="btn btn-outline small-btn" style="background:#fff;color:#111;border:1px solid #999;" onclick="nudgeVehicleRot(15)">Turn right</button>
        <button type="button" class="btn btn-outline small-btn" style="background:#fff;color:#111;border:1px solid #999;" onclick="setVehicleRotAuto()">Auto face destination</button>
      </div>
    </div>

    <div id="adminMapBox"></div>
    <div class="route-progress-wrap">
      <div class="route-ends">
        <span id="mapOriginLabel">${esc((s.route && s.route.originCountry) || 'Origin')}</span>
        <span class="route-vehicle-icon" id="mapVehicleIcon" data-icon="${esc((s.route && s.route.icon) || 'truck')}"><span style="font-size:28px;line-height:1;">${(ICONS[(s.route && s.route.icon) || 'truck'] || '🚚')}</span></span>
        <span id="mapDestLabel">${esc((s.route && s.route.destCountry) || 'Destination')}</span>
      </div>
      <div class="progress-bar tall" title="Drag with finger to push vehicle"><div class="progress-fill" id="mapProgressFill" style="width:${Math.round(computeLiveProgress(s.route))}%"></div></div>
      <div class="progress-pct mono">Progress: <span id="mapProgressLabel">${Math.round(computeLiveProgress(s.route))}%</span></div>
    </div>
    <div class="map-controls">
      <button type="button" class="btn btn-red small-btn" id="btnPlayRoute" onclick="playRoute('${esc(s.code)}')">▶ Start Moving</button>
      <button type="button" class="btn btn-outline small-btn" id="btnPauseRoute" style="color:var(--ink);border-color:var(--line);" onclick="pauseRoute('${esc(s.code)}')">⏸ Pause</button>
      <button type="button" class="btn btn-outline small-btn" id="btnResetRoute" style="color:var(--ink);border-color:var(--line);" onclick="resetRoute('${esc(s.code)}')">⟲ Restart</button>
      <p style="font-size:11px;color:var(--gray);margin-top:6px;">Start / Pause / Restart save by themselves. Done — Save is for countries, vehicle type &amp; hand position/direction.</p>
    </div>
    <button class="btn btn-red" style="width:100%; margin-top:14px; padding:13px;" onclick="saveRoute('${esc(s.code)}')">✓ Done — Save Map Settings</button>
    <p id="routeSaveMsg" style="font-size:12px; color:var(--gray); margin-top:6px; display:none;"></p>
    ` : ''}
  `;
    if (!isNew) initAdminMap(s); else destroyAdminMap();
}

function collectFormShipment(existingCode) {
    let code = document.getElementById('f_code').value.trim() || existingCode || '';
    if (!code) code = generateTrackCode();
    const codeEl = document.getElementById('f_code');
    if (codeEl && !codeEl.value.trim()) codeEl.value = code;
    const payload = {
        code,
        sender: { name: document.getElementById('f_senderName').value.trim(), address: document.getElementById('f_senderAddr').value.trim(), phone: document.getElementById('f_senderPhone').value.trim(), email: document.getElementById('f_senderEmail').value.trim() },
        receiver: { name: document.getElementById('f_recvName').value.trim(), address: document.getElementById('f_recvAddr').value.trim(), phone: document.getElementById('f_recvPhone').value.trim(), email: document.getElementById('f_recvEmail').value.trim() },
        package: { weightKg: document.getElementById('f_weight').value, length: document.getElementById('f_len').value, width: document.getElementById('f_wid').value, height: document.getElementById('f_hei').value, description: document.getElementById('f_desc').value.trim() },
        payment: { amount: document.getElementById('f_amount').value, currency: document.getElementById('f_currency').value.trim() || 'USD', method: document.getElementById('f_method').value, status: document.getElementById('f_paystatus').value },
        mode: document.getElementById('f_mode').value,
        estimatedDelivery: document.getElementById('f_eta').value,
        carrier: document.getElementById('f_carrier').value,
        waybillNumber: (document.getElementById('f_waybill') || {}).value || '',
        serviceType: (document.getElementById('f_service') || {}).value || '',
        packagingType: (document.getElementById('f_pack') || {}).value || '',
        pieces: Number((document.getElementById('f_pieces') || {}).value || 1),
        termsOfTrade: (document.getElementById('f_terms') || {}).value || '',
        billingAccount: (document.getElementById('f_billAcct') || {}).value || '',
        declaredValue: (document.getElementById('f_decl') || {}).value || '',
        specialServices: (document.getElementById('f_special') || {}).value || '',
        reference: (document.getElementById('f_ref') || {}).value || '',
        shipmentDate: (document.getElementById('f_shipDate') || {}).value || '',

    };
    // Only include the access PIN if something was typed - leaving it blank
    // means "keep whatever's already set," it does NOT clear existing protection.
    const pinVal = document.getElementById('f_accessPin').value.trim();
    if (pinVal) payload.accessPin = pinVal;
    return payload;
    // Note: route and history are intentionally left out here — they're saved
    // through their own endpoints (saveRoute / addStatus) so this form never
    // accidentally overwrites them.
}
async function saveShipment(isNew) {
    let code = document.getElementById('f_code').value.trim();
    if (!code) {
        code = generateTrackCode();
        const el = document.getElementById('f_code');
        if (el) el.value = code;
    }
    const pinVal = document.getElementById('f_accessPin').value.trim();
    if (pinVal && !/^\d{4}$/.test(pinVal)) { alert('Shipment access code must be exactly 4 digits.'); return; }
    const payload = collectFormShipment(code);
    try {
        let updated;
        if (isNew) {
            updated = await apiRequest('/shipments', { method: 'POST', body: JSON.stringify(payload) });
        } else {
            updated = await apiRequest('/shipments/' + encodeURIComponent(code), { method: 'PUT', body: JSON.stringify(payload) });
        }
        activeCode = updated.code;
        unlockedShipments[updated.code] = updated;
        await renderShipList();
    } catch (err) {
        alert("Couldn't save shipment: " + err.message);
    }
}
async function removeShipmentPin(code) {
    if (!confirm('Remove the access code from this shipment? Any admin will be able to open it without a code afterward.')) return;
    try {
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code), { method: 'PUT', body: JSON.stringify({ accessPin: null }) });
        unlockedShipments[updated.code] = updated;
        await renderShipList();
    } catch (err) {
        alert("Couldn't remove the code: " + err.message);
    }
}
async function deleteShipment(code) {
    if (!confirm('Delete shipment ' + code + '?')) return;
    try {
        await apiRequest('/shipments/' + encodeURIComponent(code), { method: 'DELETE' });
        delete unlockedShipments[code];
        activeCode = null;
        await renderShipList();
    } catch (err) {
        alert("Couldn't delete shipment: " + err.message);
    }
}
async function addStatus(code) {
    const label = document.getElementById('f_newStatus').value.trim();
    const location = document.getElementById('f_newLocation').value.trim() || "—";
    const date = document.getElementById('f_newDate').value || new Date().toISOString().slice(0, 10);
    if (!label) { alert('Enter a status label first.'); return; }
    try {
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/status', { method: 'POST', body: JSON.stringify({ label, location, date }) });
        unlockedShipments[updated.code] = updated;
        await renderShipList();
    } catch (err) {
        alert("Couldn't add status: " + err.message);
    }
}
async function removeStatus(code, idx) {
    try {
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/status/' + idx, { method: 'DELETE' });
        unlockedShipments[updated.code] = updated;
        await renderShipList();
    } catch (err) {
        alert("Couldn't remove status: " + err.message);
    }
}

/* ---------- LIVE MAP: moving truck/plane/ship along a route ---------- */
const ICONS = { truck: '🚚', plane: '✈️', ship: '🚢', warehouse: '🏭' };
const DEFAULT_VEHICLE_IMGS = {
    plane: 'https://commons.wikimedia.org/wiki/Special:FilePath/Dhl.a300b4.oo-dlz.arp.jpg',
    truck: 'https://commons.wikimedia.org/wiki/Special:FilePath/Fiat_Ducato_DHL_Van.jpg',
    ship: 'https://commons.wikimedia.org/wiki/Special:FilePath/DHL_cargo_loaders_Orio_al_Serio.jpg'
};
function vehicleImgSrc(iconType, customUrl) {
    const custom = String(customUrl || '').trim();
    if (custom && /^https?:\/\//i.test(custom)) return custom;
    return DEFAULT_VEHICLE_IMGS[iconType || 'truck'] || DEFAULT_VEHICLE_IMGS.truck;
}
function vehicleIconHtml(iconType, customUrl, size) {
    const s = size || 28;
    const src = vehicleImgSrc(iconType, customUrl);
    return '<img src="' + src + '" alt="' + (iconType || 'vehicle') + '" width="' + s + '" height="' + s + '" style="width:' + s + 'px;height:' + s + 'px;object-fit:cover;border-radius:50%;border:2px solid #FFCC00;background:#fff;display:block;" onerror="this.style.display=\'none\';this.nextSibling&&(this.nextSibling.style.display=\'inline\');"><span style="display:none;font-size:' + s + 'px;">' + (ICONS[iconType || 'truck'] || '🚚') + '</span>';
}


function onFaceModeChange() {
    const face = document.getElementById('f_face');
    if (face && face.value === 'manual') {
        const sl = document.getElementById('f_rotSlider');
        if (sl) onRotSliderInput(sl.value);
    } else if (face && face.value === 'auto') {
        setVehicleRotAuto();
    }
}
function onRotSliderInput(val) {
    const deg = Math.round(Number(val) || 0);
    const lab = document.getElementById('rotDegLabel');
    if (lab) lab.textContent = deg + '°';
    const face = document.getElementById('f_face');
    if (face) {
        face.value = 'manual';
    }
    // live update map marker
    try {
        if (adminMarker && adminMap) {
            const o = COUNTRY_COORDS[document.getElementById('f_oCountry').value];
            const d = COUNTRY_COORDS[document.getElementById('f_dCountry').value];
            if (!o || !d) return;
            const iconType = (document.getElementById('f_icon') || {}).value || 'truck';
            adminMarker.setIcon(makeVehicleIcon(iconType, o.lat, o.lng, d.lat, d.lng, false, deg, ''));
        }
    } catch (e) { }
    window._lastAdminRotation = deg;
    const hint = document.getElementById('rotHint');
    if (hint) hint.textContent = 'Facing ' + deg + '° — Pause or Done to lock direction.';
}

function nudgeVehicleRot(delta) {
    const face = document.getElementById('f_face');
    const slider = document.getElementById('f_rotSlider');
    let deg = slider ? Number(slider.value) || 0 : 0;
    if (face && (face.value === 'auto' || face.value === 'flip')) {
        try {
            const o = COUNTRY_COORDS[document.getElementById('f_oCountry').value];
            const d = COUNTRY_COORDS[document.getElementById('f_dCountry').value];
            if (o && d) deg = bearingDeg(o.lat, o.lng, d.lat, d.lng);
        } catch (e) { }
    }
    deg = (deg + delta + 360) % 360;
    if (slider) slider.value = String(Math.round(deg));
    if (face) face.value = 'manual';
    onRotSliderInput(deg);
    updateVehicleIconDisplay();
    // live update marker
    try {
        if (adminMarker && adminMap) {
            const o = COUNTRY_COORDS[document.getElementById('f_oCountry').value];
            const d = COUNTRY_COORDS[document.getElementById('f_dCountry').value];
            const iconType = (document.getElementById('f_icon') || {}).value || 'truck';
            const ic = makeVehicleIcon(iconType, o.lat, o.lng, d.lat, d.lng, false, deg, '');
            adminMarker.setIcon(ic);
        }
    } catch (e) { }
}
function setVehicleRotAuto() {
    const face = document.getElementById('f_face');
    if (face) face.value = 'auto';
    const sl = document.getElementById('f_rotSlider');
    if (sl) sl.value = '';
    window._lastAdminRotation = null;
    const hint = document.getElementById('rotHint');
    if (hint) hint.textContent = 'Auto: nose points to DESTINATION (not origin). Save to apply on track.';
    updateVehicleIconDisplay();
    try {
        if (adminMarker && adminMap) {
            const o = COUNTRY_COORDS[document.getElementById('f_oCountry').value];
            const d = COUNTRY_COORDS[document.getElementById('f_dCountry').value];
            if (!o || !d) return;
            const iconType = (document.getElementById('f_icon') || {}).value || 'truck';
            // null = auto face DESTINATION
            const ic = makeVehicleIcon(iconType, o.lat, o.lng, d.lat, d.lng, false, null, '');
            adminMarker.setIcon(ic);
        }
    } catch (e) { }
}

function updateVehicleIconDisplay() {
    const sel = document.getElementById('f_icon');
    const urlEl = document.getElementById('f_vehicleImg');
    const iconType = (sel && sel.value) ? sel.value : 'truck';
    const custom = urlEl ? urlEl.value.trim() : '';
    const emoji = ICONS[iconType] || ICONS.truck;
    // Progress bar: always show matching emoji so plane/truck/ship is obvious
    const el = document.getElementById('mapVehicleIcon');
    if (el) {
        el.innerHTML = '<span style="font-size:28px;line-height:1;">' + emoji + '</span>';
        el.setAttribute('data-icon', iconType);
    }
    const pub = document.getElementById('publicVehicleIcon');
    if (pub) {
        pub.innerHTML = '<span style="font-size:28px;line-height:1;">' + emoji + '</span>';
        pub.setAttribute('data-icon', iconType);
    }
    // Refresh map marker if map is open
    try {
        if (typeof adminMarker !== 'undefined' && adminMarker && adminMap) {
            const oLat = parseFloat((document.getElementById('f_oCountry') && COUNTRY_COORDS[document.getElementById('f_oCountry').value] || {}).lat);
            const oLng = parseFloat((document.getElementById('f_oCountry') && COUNTRY_COORDS[document.getElementById('f_oCountry').value] || {}).lng);
            const dLat = parseFloat((document.getElementById('f_dCountry') && COUNTRY_COORDS[document.getElementById('f_dCountry').value] || {}).lat);
            const dLng = parseFloat((document.getElementById('f_dCountry') && COUNTRY_COORDS[document.getElementById('f_dCountry').value] || {}).lng);
            if (![oLat, oLng, dLat, dLng].some(isNaN)) {
                const face = document.getElementById('f_face');
                const faceVal = face ? face.value : 'auto';
                const flip = faceVal === 'flip';
                let rot = null; // auto → face destination
                if (faceVal === 'manual') {
                    rot = getAdminRotationFromUI();
                } else if (faceVal && faceVal !== 'auto' && faceVal !== 'flip') {
                    rot = Number(faceVal);
                    if (isNaN(rot)) rot = null;
                }
                const ic = makeVehicleIcon(iconType, oLat, oLng, dLat, dLng, flip, rot, custom);
                adminMarker.setIcon(ic);
            }
        }
    } catch (e) { }
}

let adminMap = null, adminMarker = null, adminAnimTimer = null;
let publicMap = null, publicMarker = null, publicAnimTimer = null, publicPollTimer = null;

// Country -> approximate coordinates (capital city), so you pick a country
// instead of typing raw lat/lng numbers. Drag the vehicle on the map afterward
// to nudge its exact position if the capital isn't quite where you want it.

function countrySelectHtml(id, selected) {
    const names = Object.keys(COUNTRY_COORDS).sort();
    const sel = selected && COUNTRY_COORDS[selected] ? selected : (names[0] || '');
    const opts = names.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
    return `<div class="country-pick">
    <input type="search" class="country-search" placeholder="Search country…" oninput="filterCountrySelect('${id}', this.value)" autocomplete="off">
    <select id="${id}" size="6" class="country-select">${opts}</select>
  </div>`;
}
function filterCountrySelect(selectId, q) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const query = (q || '').toLowerCase().trim();
    Array.from(sel.options).forEach(o => {
        o.hidden = query ? !o.value.toLowerCase().includes(query) : false;
    });
}

const COUNTRY_COORDS = {
    "Afghanistan": { lat: 34.5553, lng: 69.2075 },
    "Albania": { lat: 41.3275, lng: 19.8187 },
    "Algeria": { lat: 36.7538, lng: 3.0588 },
    "Angola": { lat: -8.839, lng: 13.2894 },
    "Argentina": { lat: -34.6037, lng: -58.3816 },
    "Armenia": { lat: 40.1792, lng: 44.4991 },
    "Australia": { lat: -35.2809, lng: 149.13 },
    "Austria": { lat: 48.2082, lng: 16.3738 },
    "Azerbaijan": { lat: 40.4093, lng: 49.8671 },
    "Bahrain": { lat: 26.2285, lng: 50.586 },
    "Bangladesh": { lat: 23.8103, lng: 90.4125 },
    "Belarus": { lat: 53.9045, lng: 27.5615 },
    "Belgium": { lat: 50.8503, lng: 4.3517 },
    "Benin": { lat: 6.4969, lng: 2.6289 },
    "Bolivia": { lat: -16.4897, lng: -68.1193 },
    "Bosnia and Herzegovina": { lat: 43.8563, lng: 18.4131 },
    "Botswana": { lat: -24.6282, lng: 25.9231 },
    "Brazil": { lat: -15.8267, lng: -47.9218 },
    "Bulgaria": { lat: 42.6977, lng: 23.3219 },
    "Burkina Faso": { lat: 12.3714, lng: -1.5197 },
    "Cambodia": { lat: 11.5564, lng: 104.9282 },
    "Cameroon": { lat: 3.848, lng: 11.5021 },
    "Canada": { lat: 45.4215, lng: -75.6972 },
    "Chile": { lat: -33.4489, lng: -70.6693 },
    "China": { lat: 39.9042, lng: 116.4074 },
    "Colombia": { lat: 4.711, lng: -74.0721 },
    "Congo": { lat: -4.2634, lng: 15.2429 },
    "Costa Rica": { lat: 9.9281, lng: -84.0907 },
    "Croatia": { lat: 45.815, lng: 15.9819 },
    "Cuba": { lat: 23.1136, lng: -82.3666 },
    "Cyprus": { lat: 35.1856, lng: 33.3823 },
    "Czech Republic": { lat: 50.0755, lng: 14.4378 },
    "Denmark": { lat: 55.6761, lng: 12.5683 },
    "Dominican Republic": { lat: 18.4861, lng: -69.9312 },
    "Ecuador": { lat: -0.1807, lng: -78.4678 },
    "Egypt": { lat: 30.0444, lng: 31.2357 },
    "El Salvador": { lat: 13.6929, lng: -89.2182 },
    "Estonia": { lat: 59.437, lng: 24.7536 },
    "Ethiopia": { lat: 9.025, lng: 38.7469 },
    "Finland": { lat: 60.1699, lng: 24.9384 },
    "France": { lat: 48.8566, lng: 2.3522 },
    "Gabon": { lat: 0.4162, lng: 9.4673 },
    "Gambia": { lat: 13.4549, lng: -16.579 },
    "Georgia": { lat: 41.7151, lng: 44.8271 },
    "Germany": { lat: 52.52, lng: 13.405 },
    "Ghana": { lat: 5.6037, lng: -0.187 },
    "Greece": { lat: 37.9838, lng: 23.7275 },
    "Guatemala": { lat: 14.6349, lng: -90.5069 },
    "Guinea": { lat: 9.6412, lng: -13.5784 },
    "Haiti": { lat: 18.5944, lng: -72.3074 },
    "Honduras": { lat: 14.0723, lng: -87.1921 },
    "Hong Kong": { lat: 22.3193, lng: 114.1694 },
    "Hungary": { lat: 47.4979, lng: 19.0402 },
    "Iceland": { lat: 64.1466, lng: -21.9426 },
    "India": { lat: 28.6139, lng: 77.209 },
    "Indonesia": { lat: -6.2088, lng: 106.8456 },
    "Iran": { lat: 35.6892, lng: 51.389 },
    "Iraq": { lat: 33.3152, lng: 44.3661 },
    "Ireland": { lat: 53.3498, lng: -6.2603 },
    "Israel": { lat: 31.7683, lng: 35.2137 },
    "Italy": { lat: 41.9028, lng: 12.4964 },
    "Ivory Coast": { lat: 5.36, lng: -4.0083 },
    "Jamaica": { lat: 18.0179, lng: -76.8099 },
    "Japan": { lat: 35.6762, lng: 139.6503 },
    "Jordan": { lat: 31.9454, lng: 35.9284 },
    "Kazakhstan": { lat: 51.1694, lng: 71.4491 },
    "Kenya": { lat: -1.2921, lng: 36.8219 },
    "Kuwait": { lat: 29.3759, lng: 47.9774 },
    "Latvia": { lat: 56.9496, lng: 24.1052 },
    "Lebanon": { lat: 33.8938, lng: 35.5018 },
    "Liberia": { lat: 6.3004, lng: -10.7969 },
    "Libya": { lat: 32.8872, lng: 13.1913 },
    "Lithuania": { lat: 54.6872, lng: 25.2797 },
    "Luxembourg": { lat: 49.6116, lng: 6.1319 },
    "Macau": { lat: 22.1987, lng: 113.5439 },
    "Madagascar": { lat: -18.8792, lng: 47.5079 },
    "Malawi": { lat: -13.9626, lng: 33.7741 },
    "Malaysia": { lat: 3.139, lng: 101.6869 },
    "Mali": { lat: 12.6392, lng: -8.0029 },
    "Malta": { lat: 35.8989, lng: 14.5146 },
    "Mexico": { lat: 19.4326, lng: -99.1332 },
    "Moldova": { lat: 47.0105, lng: 28.8638 },
    "Mongolia": { lat: 47.8864, lng: 106.9057 },
    "Morocco": { lat: 34.0209, lng: -6.8417 },
    "Mozambique": { lat: -25.9692, lng: 32.5732 },
    "Myanmar": { lat: 16.8409, lng: 96.1735 },
    "Namibia": { lat: -22.5609, lng: 17.0658 },
    "Nepal": { lat: 27.7172, lng: 85.324 },
    "Netherlands": { lat: 52.3676, lng: 4.9041 },
    "New Zealand": { lat: -41.2865, lng: 174.7762 },
    "Nicaragua": { lat: 12.115, lng: -86.2362 },
    "Niger": { lat: 13.5116, lng: 2.1254 },
    "Nigeria": { lat: 6.5244, lng: 3.3792 },
    "North Macedonia": { lat: 41.9981, lng: 21.4254 },
    "Norway": { lat: 59.9139, lng: 10.7522 },
    "Oman": { lat: 23.588, lng: 58.3829 },
    "Pakistan": { lat: 33.6844, lng: 73.0479 },
    "Panama": { lat: 8.9824, lng: -79.5199 },
    "Paraguay": { lat: -25.2637, lng: -57.5759 },
    "Peru": { lat: -12.0464, lng: -77.0428 },
    "Philippines": { lat: 14.5995, lng: 120.9842 },
    "Poland": { lat: 52.2297, lng: 21.0122 },
    "Portugal": { lat: 38.7223, lng: -9.1393 },
    "Qatar": { lat: 25.2854, lng: 51.531 },
    "Romania": { lat: 44.4268, lng: 26.1025 },
    "Russia": { lat: 55.7558, lng: 37.6173 },
    "Rwanda": { lat: -1.9441, lng: 30.0619 },
    "Saudi Arabia": { lat: 24.7136, lng: 46.6753 },
    "Senegal": { lat: 14.7167, lng: -17.4677 },
    "Serbia": { lat: 44.7866, lng: 20.4489 },
    "Sierra Leone": { lat: 8.4657, lng: -13.2317 },
    "Singapore": { lat: 1.3521, lng: 103.8198 },
    "Slovakia": { lat: 48.1486, lng: 17.1077 },
    "Slovenia": { lat: 46.0569, lng: 14.5058 },
    "Somalia": { lat: 2.0469, lng: 45.3182 },
    "South Africa": { lat: -25.7479, lng: 28.2293 },
    "South Korea": { lat: 37.5665, lng: 126.978 },
    "Spain": { lat: 40.4168, lng: -3.7038 },
    "Sri Lanka": { lat: 6.9271, lng: 79.8612 },
    "Sudan": { lat: 15.5007, lng: 32.5599 },
    "Sweden": { lat: 59.3293, lng: 18.0686 },
    "Switzerland": { lat: 46.948, lng: 7.4474 },
    "Syria": { lat: 33.5138, lng: 36.2765 },
    "Taiwan": { lat: 25.033, lng: 121.5654 },
    "Tanzania": { lat: -6.163, lng: 35.7516 },
    "Thailand": { lat: 13.7563, lng: 100.5018 },
    "Togo": { lat: 6.1725, lng: 1.2314 },
    "Trinidad and Tobago": { lat: 10.6549, lng: -61.5019 },
    "Tunisia": { lat: 36.8065, lng: 10.1815 },
    "Turkey": { lat: 39.9334, lng: 32.8597 },
    "Uganda": { lat: 0.3476, lng: 32.5825 },
    "Ukraine": { lat: 50.4501, lng: 30.5234 },
    "United Arab Emirates": { lat: 25.2048, lng: 55.2708 },
    "United Kingdom": { lat: 51.5074, lng: -0.1278 },
    "United States": { lat: 38.9072, lng: -77.0369 },
    "Uruguay": { lat: -34.9011, lng: -56.1645 },
    "Uzbekistan": { lat: 41.2995, lng: 69.2401 },
    "Venezuela": { lat: 10.4806, lng: -66.9036 },
    "Vietnam": { lat: 21.0278, lng: 105.8342 },
    "Yemen": { lat: 15.3694, lng: 44.191 },
    "Zambia": { lat: -15.3875, lng: 28.3228 },
    "Zimbabwe": { lat: -17.8252, lng: 31.0335 },
};


// Speed setting -> % of the route covered per second. This is the single
// source of truth used both to animate smoothly in the browser AND to
// compute "how far has it actually gotten" from a timestamp saved in MongoDB.
// Duration in days regardless of distance — progress is linear over that time.
const SPEED_DAYS = { slow: 7, normal: 4, fast: 2 };
const SPEEDS = {
    slow: { percentPerSecond: 100 / (7 * 24 * 3600) },   // 1 week
    normal: { percentPerSecond: 100 / (4 * 24 * 3600) }, // 4 days
    fast: { percentPerSecond: 100 / (2 * 24 * 3600) },   // 2 days
};

// Given a shipment's route from the database, compute how far along it is
// RIGHT NOW. If it's moving, this is based on elapsed real time since
// movingSince — meaning the admin dashboard and the public tracking page
// always agree on the current position, without needing to constantly poll.
function computeLiveProgress(route) {
    if (!route) return 0;
    if (!route.isMoving || !route.movingSince) return route.progress || 0;
    const rate = (SPEEDS[route.speed || 'slow'] || SPEEDS.slow).percentPerSecond;
    const elapsedSec = (Date.now() - new Date(route.movingSince).getTime()) / 1000;
    return Math.max(0, Math.min(100, (route.progress || 0) + elapsedSec * rate));
}

function pointAlong(oLat, oLng, dLat, dLng, t) {
    return [oLat + (dLat - oLat) * t, oLng + (dLng - oLng) * t];
}
// Projects a dragged lat/lng onto the origin→destination line, returns 0–1 progress
function projectT(oLat, oLng, dLat, dLng, pLat, pLng) {
    const dx = dLng - oLng, dy = dLat - oLat;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return 0;
    const t = ((pLng - oLng) * dx + (pLat - oLat) * dy) / len2;
    return Math.max(0, Math.min(1, t));
}
// Simple, reliable left/right facing (moving east flips the icon to face
// right; moving west leaves it facing its default/left). The admin checkbox
// lets you manually reverse it if your emoji font draws it the other way.
function bearingDeg(oLat, oLng, dLat, dLng) {
    const toRad = Math.PI / 180;
    const y = Math.sin((dLng - oLng) * toRad) * Math.cos(dLat * toRad);
    const x = Math.cos(oLat * toRad) * Math.sin(dLat * toRad) -
        Math.sin(oLat * toRad) * Math.cos(dLat * toRad) * Math.cos((dLng - oLng) * toRad);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function emojiNoseOffset(iconType) {
    // Emoji art faces a default way: plane/ship usually point RIGHT (east),
    // truck usually points UP (north). CSS rotate(0) keeps that default.
    // Geographic bearing is 0=north, 90=east — convert so the NOSE points
    // toward the destination, not back toward origin.
    const t = (iconType || 'truck').toLowerCase();
    if (t === 'plane' || t === 'ship') return -90;
    return 0;
}
function makeVehicleIcon(iconType, oLat, oLng, dLat, dLng, flipOverride, rotationDeg, customUrl) {
    // Auto: nose points TO destination (never back to origin).
    // Manual: exact rotationDeg. Flip: opposite of destination bearing.
    const manual = rotationDeg !== null && rotationDeg !== undefined && rotationDeg !== '' && !isNaN(Number(rotationDeg));
    let deg;
    if (manual) {
        deg = Number(rotationDeg);
    } else {
        // Bearing from origin → destination, adjusted for emoji default face
        deg = bearingDeg(oLat, oLng, dLat, dLng) + emojiNoseOffset(iconType);
        if (flipOverride) deg += 180;
        deg = (deg % 360 + 360) % 360;
    }
    const emoji = ICONS[iconType || 'truck'] || '🚚';
    const transform = 'rotate(' + deg + 'deg)';
    return L.divIcon({
        html: '<div style="font-size:34px;line-height:34px;transform:' + transform + ';transform-origin:center center;text-align:center;cursor:grab;">' + emoji + '</div>',
        className: 'vehicle-dir-icon', iconSize: [34, 34], iconAnchor: [17, 17]
    });
}


/* ---- Hand push: progress bar + map vehicle (keep auto when moving) ---- */
function ensureProgressKnob(bar) {
    if (!bar) return null;
    let knob = bar.querySelector('.progress-knob');
    if (!knob) {
        knob = document.createElement('div');
        knob.className = 'progress-knob';
        bar.appendChild(knob);
    }
    return knob;
}
function setProgressBarUI(fillId, percent) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const fill = document.getElementById(fillId);
    if (fill) {
        fill.style.width = p + '%';
        const bar = fill.parentElement;
        const knob = ensureProgressKnob(bar);
        if (knob) knob.style.left = p + '%';
    }
    return p;
}
function bindProgressBarDrag(fillId, opts) {
    const fill = document.getElementById(fillId);
    if (!fill) return;
    const bar = fill.parentElement;
    if (!bar || bar.dataset.handBound === '1') return;
    bar.dataset.handBound = '1';
    ensureProgressKnob(bar);

    function pctFromEvent(e) {
        const rect = bar.getBoundingClientRect();
        const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        return Math.max(0, Math.min(100, (x / rect.width) * 100));
    }
    let dragging = false;
    function onStart(e) {
        dragging = true;
        if (opts && opts.onStart) opts.onStart();
        const p = pctFromEvent(e);
        setProgressBarUI(fillId, p);
        if (opts && opts.onMove) opts.onMove(p);
        e.preventDefault();
    }
    function onMove(e) {
        if (!dragging) return;
        const p = pctFromEvent(e);
        setProgressBarUI(fillId, p);
        if (opts && opts.onMove) opts.onMove(p);
        e.preventDefault();
    }
    function onEnd(e) {
        if (!dragging) return;
        dragging = false;
        const p = pctFromEvent(e.changedTouches ? e.changedTouches[0] : e);
        setProgressBarUI(fillId, p);
        if (opts && opts.onEnd) opts.onEnd(p);
    }
    bar.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    bar.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
}

/* ----- ADMIN MAP ----- */
function destroyAdminMap() {
    if (adminAnimTimer) { clearInterval(adminAnimTimer); adminAnimTimer = null; }
    if (adminMap) { adminMap.remove(); adminMap = null; adminMarker = null; }
}
function initAdminMap(shipment) {
    destroyAdminMap();
    const box = document.getElementById('adminMapBox');
    if (!box) return;
    const r = shipment.route || {};
    const oLat = parseFloat(r.originLat), oLng = parseFloat(r.originLng);
    const dLat = parseFloat(r.destLat), dLng = parseFloat(r.destLng);
    if ([oLat, oLng, dLat, dLng].some(isNaN)) {
        box.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--gray);font-size:13px;text-align:center;padding:10px;">Pick origin &amp; destination countries above, then hit Done to see the live map.</div>';
        return;
    }
    box.innerHTML = '';
    adminMap = L.map(box, { scrollWheelZoom: false }).setView([(oLat + dLat) / 2, (oLng + dLng) / 2], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(adminMap);
    L.marker([oLat, oLng]).addTo(adminMap).bindPopup('Origin' + (r.originCountry ? ': ' + r.originCountry : ''));
    L.marker([dLat, dLng]).addTo(adminMap).bindPopup('Destination' + (r.destCountry ? ': ' + r.destCountry : ''));
    const line = L.polyline([[oLat, oLng], [dLat, dLng]], { color: '#FFCC00', weight: 3, dashArray: '6,8' }).addTo(adminMap);
    adminMap.fitBounds(line.getBounds(), { padding: [30, 30] });
    const icon = makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg, r.vehicleImg);
    const startProgress = computeLiveProgress(r);
    const pos = pointAlong(oLat, oLng, dLat, dLng, startProgress / 100);
    adminMarker = L.marker(pos, { icon, draggable: true }).addTo(adminMap);

    adminMarker.on('drag', e => {
        // Always snap to the origin→destination line — never leave the route
        const ll = e.target.getLatLng();
        const t = projectT(oLat, oLng, dLat, dLng, ll.lat, ll.lng);
        const snapped = L.latLng(pointAlong(oLat, oLng, dLat, dLng, t));
        e.target.setLatLng(snapped);
        reflectAdminProgress(t * 100);
    });
    // Extra lock: if Leaflet drifts off-line, pull back next frame
    adminMarker.on('move', e => {
        const ll = e.target.getLatLng();
        const t = projectT(oLat, oLng, dLat, dLng, ll.lat, ll.lng);
        const snapped = pointAlong(oLat, oLng, dLat, dLng, t);
        const dlat = Math.abs(ll.lat - snapped[0]);
        const dlng = Math.abs(ll.lng - snapped[1]);
        if (dlat > 0.00001 || dlng > 0.00001) {
            e.target.setLatLng(snapped);
        }
    });
    adminMarker.on('dragend', async e => {
        const ll = e.target.getLatLng();
        const t = projectT(oLat, oLng, dLat, dLng, ll.lat, ll.lng);
        e.target.setLatLng(pointAlong(oLat, oLng, dLat, dLng, t));
        stopAdminAnimation();
        // Keep current facing when only moving position
        const face = document.getElementById('f_face');
        if (face) face.value = 'manual';
        const sl = document.getElementById('f_rotSlider');
        let rot = sl && sl.value !== '' && !isNaN(Number(sl.value)) ? Number(sl.value) : null;
        try {
            await apiRequest('/shipments/' + encodeURIComponent(shipment.code) + '/route', {
                method: 'PATCH', body: JSON.stringify({
                    isMoving: false, movingSince: null, progress: t * 100,
                    rotationDeg: rot, flipOverride: false
                })
            });
        } catch (err) { }
    });

    // Hand-turn: drag LEFT/RIGHT on the plane icon (map marker) to set direction
    setTimeout(function () {
        try {
            const el = adminMarker.getElement();
            if (!el || el.dataset.turnBound === '1') return;
            el.dataset.turnBound = '1';
            let sx = null, base = Number((document.getElementById('f_rotSlider') || {}).value);
            if (isNaN(base)) base = bearingDeg(oLat, oLng, dLat, dLng);
            function turnTo(deg) {
                deg = (deg % 360 + 360) % 360;
                const iconType = (document.getElementById('f_icon') || {}).value || r.icon || 'truck';
                adminMarker.setIcon(makeVehicleIcon(iconType, oLat, oLng, dLat, dLng, false, deg, ''));
                const face = document.getElementById('f_face');
                if (face) face.value = 'manual';
                const sl = document.getElementById('f_rotSlider');
                if (sl) sl.value = String(Math.round(deg));
                window._lastAdminRotation = Math.round(deg);
                const hint = document.getElementById('rotHint');
                if (hint) hint.textContent = 'Facing ' + Math.round(deg) + '° — Pause or Done to lock it.';
            }
            el.addEventListener('touchstart', function (ev) {
                if (ev.touches.length !== 1) return;
                sx = ev.touches[0].clientX;
                base = Number((document.getElementById('f_rotSlider') || {}).value);
                if (isNaN(base) || (document.getElementById('f_rotSlider') || {}).value === '') base = bearingDeg(oLat, oLng, dLat, dLng);
            }, { passive: true });
            el.addEventListener('touchmove', function (ev) {
                if (sx == null || !ev.touches[0]) return;
                // Horizontal swipe turns; don't prevent drag-move unless mostly horizontal
                const dx = ev.touches[0].clientX - sx;
                if (Math.abs(dx) > 8) {
                    turnTo(base + dx * 0.6);
                }
            }, { passive: true });
            el.addEventListener('touchend', function () { sx = null; });
        } catch (e) { }
    }, 200);

    if (r.isMoving) { startAdminAnimation(shipment); }
    else { reflectAdminProgress(startProgress); }

    // Hand-push progress bar (same as dragging plane on map)
    bindProgressBarDrag('mapProgressFill', {
        onStart: function () { stopAdminAnimation(); },
        onMove: function (p) {
            reflectAdminProgress(p);
            if (adminMarker) adminMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
        },
        onEnd: async function (p) {
            reflectAdminProgress(p);
            if (adminMarker) adminMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
            const sl = document.getElementById('f_rotSlider');
            let rot = sl && sl.value !== '' && !isNaN(Number(sl.value)) ? Number(sl.value) : null;
            const face = document.getElementById('f_face');
            if (face && rot != null) face.value = 'manual';
            try {
                await apiRequest('/shipments/' + encodeURIComponent(shipment.code) + '/route', {
                    method: 'PATCH',
                    body: JSON.stringify({ isMoving: false, movingSince: null, progress: p, rotationDeg: rot, flipOverride: false })
                });
            } catch (err) { }
        }
    });

    // Hand-rotate direction: drag left/right on the vehicle emoji above the bar
    const vIcon = document.getElementById('mapVehicleIcon');
    if (vIcon && vIcon.dataset.rotBound !== '1') {
        vIcon.dataset.rotBound = '1';
        let rot0 = Number(r.rotationDeg) || bearingDeg(oLat, oLng, dLat, dLng);
        let startX = 0, startRot = rot0;
        function applyRot(deg) {
            deg = (deg % 360 + 360) % 360;
            const iconType = (document.getElementById('f_icon') || {}).value || r.icon || 'truck';
            if (adminMarker) {
                adminMarker.setIcon(makeVehicleIcon(iconType, oLat, oLng, dLat, dLng, false, deg, ''));
            }
            const face = document.getElementById('f_face');
            if (face) face.value = 'manual';
            const slider = document.getElementById('f_rotSlider');
            if (slider) slider.value = String(Math.round(deg));
            const lab = document.getElementById('rotDegLabel');
            if (lab) lab.textContent = Math.round(deg) + '°';
            const hint = document.getElementById('rotHint');
            if (hint) hint.textContent = 'Facing ' + Math.round(deg) + '° — tap Done — Save so tracking shows this direction.';
        }
        function down(e) {
            startX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            startRot = Number((document.getElementById('f_face') || {}).value) || rot0;
            if (isNaN(startRot)) startRot = bearingDeg(oLat, oLng, dLat, dLng);
            e.preventDefault();
            e.stopPropagation();
        }
        function move(e) {
            if (startX == null) return;
            const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            if (x == null) return;
            const deg = startRot + (x - startX) * 0.5;
            applyRot(deg);
            e.preventDefault();
        }
        function up() { startX = null; }
        vIcon.addEventListener('mousedown', down);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        vIcon.addEventListener('touchstart', down, { passive: false });
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
    }
}
function reflectAdminProgress(progress) {
    const p = setProgressBarUI('mapProgressFill', progress);
    const label = document.getElementById('mapProgressLabel');
    if (label) label.textContent = Math.round(p) + '%';
    const icon = document.getElementById('mapVehicleIcon');
    if (icon) {
        icon.style.position = 'absolute';
        icon.style.left = 'calc(' + p + '% - 14px)';
        icon.style.top = '0';
    }
}
function startAdminAnimation(shipment) {
    if (adminAnimTimer) clearInterval(adminAnimTimer);
    const r = shipment.route;
    const oLat = parseFloat(r.originLat), oLng = parseFloat(r.originLng);
    const dLat = parseFloat(r.destLat), dLng = parseFloat(r.destLng);
    adminAnimTimer = setInterval(() => {
        const p = computeLiveProgress(r);
        reflectAdminProgress(p);
        if (adminMarker) adminMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
        if (p >= 100) { clearInterval(adminAnimTimer); adminAnimTimer = null; }
    }, 200);
}
function stopAdminAnimation() {
    if (adminAnimTimer) { clearInterval(adminAnimTimer); adminAnimTimer = null; }
}

async function saveRoute(code) {
    const msg = document.getElementById('routeSaveMsg');
    const originCountry = document.getElementById('f_oCountry').value;
    const destCountry = document.getElementById('f_dCountry').value;
    const oCoords = COUNTRY_COORDS[originCountry];
    const dCoords = COUNTRY_COORDS[destCountry];
    const faceVal = (document.getElementById('f_face') || {}).value || 'auto';
    const slider = document.getElementById('f_rotSlider');
    let rotationDeg = null;
    let flipOverride = false;
    if (faceVal === 'flip') {
        flipOverride = true;
        rotationDeg = null;
    } else if (faceVal === 'auto') {
        rotationDeg = null;
    } else if (faceVal === 'manual' || (slider && faceVal === 'slider')) {
        rotationDeg = Number(slider && slider.value != null ? slider.value : faceVal);
        if (isNaN(rotationDeg)) rotationDeg = null;
    } else {
        rotationDeg = Number(faceVal);
        if (isNaN(rotationDeg)) rotationDeg = null;
    }
    // Current progress from bar (hand-pushed position)
    let progress = 0;
    const fill = document.getElementById('mapProgressFill');
    if (fill && fill.style.width) progress = parseFloat(fill.style.width) || 0;
    const label = document.getElementById('mapProgressLabel');
    if (label) {
        const n = parseFloat(String(label.textContent).replace('%', ''));
        if (!isNaN(n)) progress = n;
    }
    const payload = {
        originCountry, destCountry,
        originLat: oCoords.lat, originLng: oCoords.lng,
        destLat: dCoords.lat, destLng: dCoords.lng,
        icon: document.getElementById('f_icon').value,
        vehicleImg: (document.getElementById('f_vehicleImg') && document.getElementById('f_vehicleImg').value.trim()) || '',
        speed: document.getElementById('f_speed').value,
        flipOverride,
        rotationDeg,
        progress,
        isMoving: false,
        movingSince: null,
    };
    try {
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', { method: 'PATCH', body: JSON.stringify(payload) });
        unlockedShipments[updated.code] = updated;
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--green)'; msg.textContent = 'Saved — position & direction locked.'; }
        // Keep marker exactly where you placed it (no jump)
        if (adminMarker && updated.route) {
            const r = updated.route;
            const oLat = parseFloat(r.originLat), oLng = parseFloat(r.originLng);
            const dLat = parseFloat(r.destLat), dLng = parseFloat(r.destLng);
            const p = Number(r.progress) || 0;
            if (![oLat, oLng, dLat, dLng].some(isNaN)) {
                adminMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
                adminMarker.setIcon(makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg, r.vehicleImg));
                reflectAdminProgress(p);
            }
        }
        const iconEl = document.getElementById('mapVehicleIcon');
        if (iconEl && updated.route) {
            const t = updated.route.icon || 'truck';
            iconEl.innerHTML = '<span style="font-size:28px;line-height:1;">' + (ICONS[t] || '🚚') + '</span>';
            iconEl.setAttribute('data-icon', t);
        }
    } catch (err) {
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--red)'; msg.textContent = err.message; }
    }
}

function getAdminProgressFromUI() {
    const label = document.getElementById('mapProgressLabel');
    if (label) {
        const n = parseFloat(String(label.textContent).replace('%', ''));
        if (!isNaN(n)) return Math.max(0, Math.min(100, n));
    }
    const fill = document.getElementById('mapProgressFill');
    if (fill && fill.style.width) {
        const n = parseFloat(fill.style.width);
        if (!isNaN(n)) return Math.max(0, Math.min(100, n));
    }
    return 0;
}
function getAdminRotationFromUI() {
    const sl = document.getElementById('f_rotSlider');
    if (sl && sl.value !== '' && !isNaN(Number(sl.value))) return Number(sl.value);
    if (typeof window._lastAdminRotation === 'number' && !isNaN(window._lastAdminRotation)) {
        return window._lastAdminRotation;
    }
    return null; // auto
}
function setRouteActionLoading(on) {
    const ids = ['btnPlayRoute', 'btnPauseRoute', 'btnResetRoute'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (on) {
            if (!el.dataset.label) el.dataset.label = el.textContent;
            el.disabled = true;
            el.textContent = '......';
        } else {
            el.disabled = false;
            if (el.dataset.label) el.textContent = el.dataset.label;
        }
    });
    const msg = document.getElementById('routeSaveMsg');
    if (msg && on) {
        msg.style.display = 'block';
        msg.style.color = 'var(--gray)';
        msg.textContent = 'Please wait……';
    }
}

async function playRoute(code) {
    setRouteActionLoading(true);
    try {
        const s = unlockedShipments[code];
        if (!s || !s.route || [s.route.originLat, s.route.originLng, s.route.destLat, s.route.destLng].some(v => v === undefined || v === null)) {
            alert('Pick origin & destination countries and click "Done — Save Map Settings" first.');
            return;
        }
        // Keep the position & facing you set by hand — only start moving from here
        const progress = getAdminProgressFromUI();
        const rotationDeg = getAdminRotationFromUI();
        const body = {
            isMoving: true,
            movingSince: new Date().toISOString(),
            progress
        };
        if (rotationDeg != null) { body.rotationDeg = rotationDeg; body.flipOverride = false; }
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', {
            method: 'PATCH', body: JSON.stringify(body)
        });
        unlockedShipments[updated.code] = updated;
        // Soft update: don't wipe hand-set direction
        if (updated.route) {
            s.route = updated.route;
            startAdminAnimation(updated);
            reflectAdminProgress(computeLiveProgress(updated.route));
        }
        const msg = document.getElementById('routeSaveMsg');
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--green)'; msg.textContent = 'Moving — saved.'; }
    } catch (err) {
        alert("Couldn't start movement: " + err.message);
    } finally {
        setRouteActionLoading(false);
    }
}
async function pauseRoute(code) {
    setRouteActionLoading(true);
    try {
        stopAdminAnimation();
        const progress = getAdminProgressFromUI();
        const rotationDeg = getAdminRotationFromUI();
        const body = { isMoving: false, movingSince: null, progress };
        if (rotationDeg != null) { body.rotationDeg = rotationDeg; body.flipOverride = false; }
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', {
            method: 'PATCH', body: JSON.stringify(body)
        });
        unlockedShipments[updated.code] = updated;
        if (adminMarker && updated.route) {
            const r = updated.route;
            const oLat = parseFloat(r.originLat), oLng = parseFloat(r.originLng);
            const dLat = parseFloat(r.destLat), dLng = parseFloat(r.destLng);
            const p = Number(r.progress) || 0;
            adminMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
            adminMarker.setIcon(makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg, r.vehicleImg));
            reflectAdminProgress(p);
        }
        const msg = document.getElementById('routeSaveMsg');
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--green)'; msg.textContent = 'Paused — position & direction saved.'; }
    } catch (err) {
        alert("Couldn't stop movement: " + err.message);
    } finally {
        setRouteActionLoading(false);
    }
}
async function resetRoute(code) {
    setRouteActionLoading(true);
    try {
        stopAdminAnimation();
        const rotationDeg = getAdminRotationFromUI();
        const body = { isMoving: false, movingSince: null, progress: 0 };
        if (rotationDeg != null) { body.rotationDeg = rotationDeg; body.flipOverride = false; }
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', {
            method: 'PATCH', body: JSON.stringify(body)
        });
        unlockedShipments[updated.code] = updated;
        if (adminMarker && updated.route) {
            const r = updated.route;
            const oLat = parseFloat(r.originLat), oLng = parseFloat(r.originLng);
            const dLat = parseFloat(r.destLat), dLng = parseFloat(r.destLng);
            adminMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, 0));
            adminMarker.setIcon(makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg, r.vehicleImg));
            reflectAdminProgress(0);
        }
        const msg = document.getElementById('routeSaveMsg');
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--green)'; msg.textContent = 'Reset to start — direction kept.'; }
    } catch (err) {
        alert("Couldn't reset: " + err.message);
    } finally {
        setRouteActionLoading(false);
    }
}

/* ----- PUBLIC MAP (view/zoom only — no drag, no start/stop) ----- */
function destroyPublicMap() {
    if (publicAnimTimer) { clearInterval(publicAnimTimer); publicAnimTimer = null; }
    if (publicPollTimer) { clearInterval(publicPollTimer); publicPollTimer = null; }
    if (publicMap) { publicMap.remove(); publicMap = null; publicMarker = null; }
}
function initPublicMap(shipment) {
    destroyPublicMap();
    const box = document.getElementById('publicMapBox');
    if (!box) return;
    const r = shipment.route || {};
    const oLat = parseFloat(r.originLat), oLng = parseFloat(r.originLng);
    const dLat = parseFloat(r.destLat), dLng = parseFloat(r.destLng);
    if ([oLat, oLng, dLat, dLng].some(isNaN)) {
        box.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--gray);font-size:13px;text-align:center;padding:10px;">Live location not set for this shipment yet.</div>';
        return;
    }
    box.innerHTML = '';
    publicMap = L.map(box, { scrollWheelZoom: true });
    try {
        publicMap.fitBounds([[oLat, oLng], [dLat, dLng]], { padding: [40, 40], maxZoom: 5 });
    } catch (e) {
        publicMap.setView([(oLat + dLat) / 2, (oLng + dLng) / 2], 3);
    }
    setTimeout(function () { try { publicMap.invalidateSize(); } catch (e) { } }, 200);
    setTimeout(function () { try { publicMap.invalidateSize(); } catch (e) { } }, 600);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(publicMap);
    const oName = r.originCountry || 'Origin';
    const dName = r.destCountry || 'Destination';
    L.marker([oLat, oLng]).addTo(publicMap).bindPopup('<b>Origin</b><br>' + oName).openPopup();
    L.marker([dLat, dLng]).addTo(publicMap).bindPopup('<b>Destination</b><br>' + dName);
    const line = L.polyline([[oLat, oLng], [dLat, dLng]], { color: '#D40511', weight: 4, dashArray: '8,10' }).addTo(publicMap);
    publicMap.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 6 });
    const icon = makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg, r.vehicleImg);
    const startProgress = computeLiveProgress(r);
    const pos = pointAlong(oLat, oLng, dLat, dLng, startProgress / 100);
    publicMarker = L.marker(pos, { icon, draggable: false, interactive: false }).addTo(publicMap).bindPopup('Current location');
    setTimeout(function () {
        try { publicMap.invalidateSize(true); publicMap.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 6 }); } catch (e) { }
    }, 200);
    setTimeout(function () { try { publicMap.invalidateSize(true); } catch (e) { } }, 600);

    reflectPublicProgress(startProgress, r.isMoving);
    if (r.isMoving) startPublicAnimation(oLat, oLng, dLat, dLng, r);




    // Re-check the backend every few seconds in case the admin starts, stops,
    // or changes the speed while this page is open.
    publicPollTimer = setInterval(async () => {
        try {
            const fresh = await apiRequest('/shipments/track/' + encodeURIComponent(shipment.code));
            shipment.route = fresh.route;
            if (publicAnimTimer) { clearInterval(publicAnimTimer); publicAnimTimer = null; }
            const p = computeLiveProgress(fresh.route);
            reflectPublicProgress(p, fresh.route.isMoving);
            if (publicMarker) publicMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
            if (fresh.route.isMoving) startPublicAnimation(oLat, oLng, dLat, dLng, fresh.route);
        } catch (err) { /* skip this poll silently */ }
    }, 6000);
}
function reflectPublicProgress(progress, isMoving) {
    const p = Math.max(0, Math.min(100, Number(progress) || 0));
    const fill = document.getElementById('publicProgressFill');
    if (fill) fill.style.width = p + '%';
    // No knob / hand drag on public track page — view only
    const note = document.getElementById('publicProgressNote');
    if (note) note.textContent = Math.round(p) + '% of the way there' + (isMoving ? ' — currently moving.' : '.') + ' You can zoom and pan the map to follow along.';
}
let _lastProgNotif = -1;
let _lastProgNotifAt = 0;
function startPublicAnimation(oLat, oLng, dLat, dLng, route) {
    if (publicAnimTimer) clearInterval(publicAnimTimer);
    _lastProgNotif = -1;
    _lastProgNotifAt = 0;
    publicAnimTimer = setInterval(() => {
        const p = computeLiveProgress(route);
        reflectPublicProgress(p, true);
        if (publicMarker) publicMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
        // Phone bar: origin → destination + % (every 5%, or every 20s while moving)
        const step = Math.floor(p / 5) * 5;
        const now = Date.now();
        const due = (step > _lastProgNotif && step >= 5) || (now - _lastProgNotifAt > 20000 && p > 0);
        if (nsBrowserPerm && due) {
            _lastProgNotif = Math.max(_lastProgNotif, step);
            _lastProgNotifAt = now;
            const o = (route && route.originCountry) || 'Origin';
            const d = (route && route.destCountry) || 'Destination';
            const ic = (route && route.icon === 'plane') ? '✈️' : (route && route.icon === 'ship') ? '🚢' : (route && route.icon === 'warehouse') ? '🏭' : '🚚';
            const pct = Math.round(p);
            nsPhoneNotify(
                o + ' → ' + d,
                ic + ' ' + pct + '% complete · live location',
                'dhl-live-progress'
            );
        }
        if (p >= 100) {
            if (nsBrowserPerm) {
                const o = (route && route.originCountry) || 'Origin';
                const d = (route && route.destCountry) || 'Destination';
                nsPhoneNotify(o + ' → ' + d, '100% · arrived / complete', 'dhl-live-progress');
            }
            clearInterval(publicAnimTimer); publicAnimTimer = null;
        }
    }, 200);
}


/* ---------- REAL-TIME TRACKING NOTIFICATIONS ---------- */
let nsTrackCode = null;
let nsLastNotifAt = null;
let nsNotifTimer = null;
let nsSeenIds = new Set();
let nsBrowserPerm = false;
try { nsBrowserPerm = localStorage.getItem('dhl_live_notify') === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'; } catch (e) { }


function nsEnsureToastHost() {
    let host = document.getElementById('nsToastWrap');
    if (!host) {
        host = document.createElement('div');
        host.id = 'nsToastWrap';
        host.className = 'ns-toast-wrap';
        document.body.appendChild(host);
    }
    return host;
}

function nsShowToast(n) {
    const host = nsEnsureToastHost();
    const el = document.createElement('div');
    el.className = 'ns-toast ' + (n.type || '');
    const icon = n.icon === 'plane' ? '✈️' : n.icon === 'ship' ? '🚢' : n.icon === 'truck' ? '🚚' : '📦';
    const routeLine = (n.origin || n.destination)
        ? ('<div class="ns-t-route">' + icon + ' ' + esc(n.origin || 'Origin') + ' → ' + esc(n.destination || 'Destination') + '</div>')
        : '';
    el.innerHTML = '<button type="button" class="ns-t-close" aria-label="Close">&times;</button>' +
        '<div class="ns-t-title">' + esc(n.title || 'Update') + '</div>' +
        routeLine +
        '<div class="ns-t-msg">' + esc(n.message || '') + '</div>' +
        (n.code ? '<div class="ns-t-code">' + esc(n.code) + '</div>' : '');
    el.querySelector('.ns-t-close').onclick = () => el.remove();
    host.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) { } }, 8000);
}

async function nsRequestBrowserNotify() {
    if (typeof Notification === 'undefined') {
        alert('This browser does not support phone notifications.');
        return false;
    }
    if (Notification.permission === 'granted') { nsBrowserPerm = true; return true; }
    if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Allow notifications for this site in your phone browser settings.');
        return false;
    }
    const p = await Notification.requestPermission();
    nsBrowserPerm = p === 'granted';
    return nsBrowserPerm;
}



/* ---- Background push (counts on notification bar even when site is closed) ---- */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}
async function nsSubscribePush(trackCode) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
        const reg = _dhlSwReg || await navigator.serviceWorker.register('/sw.js');
        _dhlSwReg = reg;
        const keyRes = await fetch(API_BASE + '/push/vapid-public-key');
        const { publicKey } = await keyRes.json();
        if (!publicKey) return false;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        await fetch(API_BASE + '/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON(), trackCode: trackCode || nsTrackCode || '' })
        });
        return true;
    } catch (e) {
        console.warn('push subscribe', e);
        return false;
    }
}
async function nsUnsubscribePush() {
    try {
        const reg = _dhlSwReg || await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await fetch(API_BASE + '/push/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: sub.endpoint })
            });
            // keep browser permission; just disable server pushes
        }
    } catch (e) { }
}

async function nsToggleLivePhoneNotify() {
    // Turn OFF
    if (nsBrowserPerm) {
        nsBrowserPerm = false;
        try { localStorage.setItem('dhl_live_notify', '0'); } catch (e) { }
        const btn = document.getElementById('nsLiveToggleBtn');
        if (btn) btn.textContent = 'Turn ON notifications';
        await nsUnsubscribePush();
        return;
    }
    // Turn ON
    if (!('Notification' in window)) {
        alert('This browser does not support phone notifications.');
        return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
        try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
    }
    if (perm !== 'granted') {
        alert('Allow notifications for this site in your browser settings, then tap again.');
        return;
    }
    nsBrowserPerm = true;
    try { localStorage.setItem('dhl_live_notify', '1'); } catch (e) { }
    const btn = document.getElementById('nsLiveToggleBtn');
    if (btn) btn.textContent = 'Turn OFF notifications';
    // Register for BACKGROUND pushes (counts even when you leave the site)
    await nsSubscribePush(nsTrackCode);
    try {
        if (nsTrackCode) {
            const fresh = await apiRequest('/shipments/track/' + encodeURIComponent(nsTrackCode));
            const r = fresh.route || {};
            const p = Math.round(computeLiveProgress(r) || 0);
            const o = r.originCountry || 'Origin';
            const d = r.destCountry || 'Destination';
            const ic = ICONS[r.icon || 'truck'] || '🚚';
            nsPhoneNotify(
                o + ' → ' + d,
                ic + ' ' + p + '% complete · tracking ' + nsTrackCode,
                'dhl-live-on'
            );
        } else {
            nsPhoneNotify('DHL tracking', 'Track a package first, then turn ON to get live % on the notification bar.', 'dhl-live-on');
        }
    } catch (e) {
        nsPhoneNotify('DHL tracking', 'Live notifications ON.', 'dhl-live-on');
    }
}

function nsPhoneNotify(title, body, tag) {
    if (!nsBrowserPerm) return; // turned OFF — do not show on notification bar

    const payload = {
        title: title || 'DHL update',
        body: body || '',
        tag: tag || ('dhl-' + Date.now()),
        url: (typeof location !== 'undefined' ? location.href : '/')
    };
    // Prefer service worker (works better on phone notification bar)
    if (_dhlSwReg && Notification.permission === 'granted') {
        try {
            if (_dhlSwReg.active) {
                _dhlSwReg.active.postMessage({ type: 'notify', ...payload });
                return;
            }
            _dhlSwReg.showNotification(payload.title, {
                body: payload.body,
                tag: payload.tag,
                data: { url: payload.url },
                vibrate: [120, 60, 120]
            });
            return;
        } catch (e) { }
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
        new Notification(payload.title, { body: payload.body, tag: payload.tag });
    } catch (e) { }
}

async function nsPollTrackNotifications() {
    if (!nsTrackCode) return;
    try {
        let url = API_BASE + '/shipments/track/' + encodeURIComponent(nsTrackCode) + '/notifications';
        if (nsLastNotifAt) url += '?since=' + encodeURIComponent(nsLastNotifAt);
        const res = await fetch(url);
        if (!res.ok) return;
        const items = await res.json();
        if (!Array.isArray(items) || !items.length) return;
        // API returns newest first
        const chronological = items.slice().reverse();
        chronological.forEach(n => {
            const id = String(n._id || n.createdAt + n.title);
            if (nsSeenIds.has(id)) return;
            nsSeenIds.add(id);
            // Enrich toast with route text for user notification bar
            if (n.location && n.location.includes('→')) {
                const parts = n.location.split('→').map(s => s.trim());
                n.origin = parts[0]; n.destination = parts[1];
                if ((n.title || '').toLowerCase().includes('plane')) n.icon = 'plane';
                else if ((n.title || '').toLowerCase().includes('ship')) n.icon = 'ship';
                else n.icon = 'truck';
            }
            nsShowToast(n);
            nsPhoneNotify(
                n.title || 'Shipment update',
                (n.origin && n.destination)
                    ? ((n.icon === 'plane' ? '✈️ ' : n.icon === 'ship' ? '🚢 ' : '🚚 ') + n.origin + ' → ' + n.destination + (n.message ? ' · ' + n.message : ''))
                    : (n.message || n.location || ''),
                'dhl-n-' + (n._id || n.createdAt || Date.now())
            );
            // refresh track view so timeline matches
            if (document.getElementById('trackResultBox')) {
                renderTrackResult(nsTrackCode).catch(() => { });
            }
        });
        if (items[0] && items[0].createdAt) nsLastNotifAt = items[0].createdAt;
    } catch (e) { }
}

function nsStartTrackWatch(code) {
    // Keep background push linked to this tracking code
    if (nsBrowserPerm) { try { nsSubscribePush(arguments[0]); } catch (e) { } }

    nsTrackCode = String(code || '').toUpperCase();
    nsLastNotifAt = new Date().toISOString(); // only new events after open
    nsSeenIds = new Set();
    if (nsNotifTimer) clearInterval(nsNotifTimer);
    nsNotifTimer = setInterval(nsPollTrackNotifications, 4000);
    const banner = document.getElementById('nsLiveBanner');
    if (banner) {
        banner.classList.add('show');
        banner.innerHTML = '<span class="ns-live-dot"></span><span>Live tracking on for <b class="mono">' +
            esc(nsTrackCode) + '</b> — notifications show origin → destination and %.</span>' +
            '<button type="button" class="btn btn-red small-btn" style="margin-left:auto;" id="nsLiveToggleBtn" onclick="nsToggleLivePhoneNotify()">' +
            (nsBrowserPerm ? 'Live notifications ON' : 'Turn on live notifications') + '</button>';
    }
}

function nsStopTrackWatch() {
    nsTrackCode = null;
    if (nsNotifTimer) { clearInterval(nsNotifTimer); nsNotifTimer = null; }
    const banner = document.getElementById('nsLiveBanner');
    if (banner) banner.classList.remove('show');
}

/* Admin notification panel */
async function nsLoadAdminNotifs() { return; /* alerts removed */ }
async function _nsLoadAdminNotifs_unused() {
    const panel = document.getElementById('nsNotifPanel');
    const badge = document.getElementById('nsNotifBadge');
    if (!panel || !adminToken) return;
    try {
        const items = await apiRequest('/shipments/notifications/admin');
        const unread = (items || []).filter(n => !n.read).length;
        if (badge) {
            if (unread) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.classList.add('show'); }
            else badge.classList.remove('show');
        }
        panel.innerHTML = (items || []).slice(0, 30).map(n => `
      <div class="ns-notif-item">
        <div class="t">${esc(n.title)}</div>
        <div class="m">${esc(n.message)}</div>
        <div class="c">${esc(n.code)} · ${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
      </div>`).join('') || '<div class="ns-notif-item">No notifications yet.</div>';
    } catch (e) {
        panel.innerHTML = '<div class="ns-notif-item" style="color:#a00;">' + esc(e.message) + '</div>';
    }
}

function nsToggleAdminNotifs() {
    const panel = document.getElementById('nsNotifPanel');
    if (!panel) return;
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
        nsLoadAdminNotifs();
        apiRequest('/shipments/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) }).catch(() => { });
    }
}


/* ---------- COUNT-UP ANIMATION ---------- */
function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = el.dataset.decimal ? parseInt(el.dataset.decimal) : 0;
    const suffix = el.dataset.suffix || "";
    const span = el.querySelector('span');
    let cur = 0;
    const steps = 60;
    const inc = target / steps;
    let i = 0;
    const t = setInterval(() => {
        i++; cur += inc;
        if (i >= steps) { cur = target; clearInterval(t); }
        span.textContent = cur.toFixed(decimals) + suffix;
    }, 25);
}
const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); }
    });
}, { threshold: 0.5 });
document.querySelectorAll('.stat h3').forEach(el => io.observe(el));

/* ---------- SCROLL REVEAL FOR SERVICE CARDS ---------- */
const cardIo = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('reveal'); cardIo.unobserve(e.target); }
    });
}, { threshold: 0.2 });
document.querySelectorAll('.service-card').forEach(el => cardIo.observe(el));
function openSettingsProtected() {
    const el = document.getElementById('settingsPinInput');
    if (el) el.value = '';
    const err = document.getElementById('settingsPinError');
    if (err) err.style.display = 'none';
    openModal('settingsPinModal');
}
function submitSettingsPin() {
    const pin = (document.getElementById('settingsPinInput') || {}).value || '';
    const err = document.getElementById('settingsPinError');
    if (String(pin).trim() !== '7799') {
        if (err) { err.style.display = 'block'; err.textContent = 'Incorrect PIN.'; }
        return;
    }
    closeModal('settingsPinModal');
    const m = document.getElementById('settingsModal');
    if (m) m.classList.add('show');
}


/* ---- Site language (public pages + receipt; not admin login) ---- */
const SITE_I18N = {
    en: {
        'Track Now': 'Track Now', 'Service': 'Service', 'About Us': 'About Us', 'Contact Us': 'Contact Us',
        'Receipt': 'Receipt', 'Box': 'Box', 'Log In': 'Log In', 'Track Package': 'Track Package',
        'Live Location': 'Live Location', 'Sender': 'Sender', 'Receiver': 'Receiver',
        'Shipment Date': 'Shipment Date', 'Est. Delivery': 'Est. Delivery', 'Language': 'Language',
        'Your package, tracked': 'Your package, tracked', 'Home': 'Home', 'Testimonials': 'Testimonials'
    },
    id: {
        'Track Now': 'Lacak Sekarang', 'Service': 'Layanan', 'About Us': 'Tentang Kami', 'Contact Us': 'Hubungi Kami',
        'Receipt': 'Tanda Terima', 'Box': 'Kotak', 'Log In': 'Masuk', 'Track Package': 'Lacak Paket',
        'Live Location': 'Lokasi Langsung', 'Sender': 'Pengirim', 'Receiver': 'Penerima',
        'Shipment Date': 'Tanggal Pengiriman', 'Est. Delivery': 'Perkiraan Tiba', 'Language': 'Bahasa',
        'Home': 'Beranda', 'Testimonials': 'Testimoni'
    },
    ms: {
        'Track Now': 'Jejak Sekarang', 'Service': 'Perkhidmatan', 'About Us': 'Tentang Kami', 'Contact Us': 'Hubungi Kami',
        'Receipt': 'Resit', 'Box': 'Kotak', 'Log In': 'Log Masuk', 'Track Package': 'Jejak Pakej',
        'Live Location': 'Lokasi Langsung', 'Sender': 'Pengirim', 'Receiver': 'Penerima',
        'Shipment Date': 'Tarikh Penghantaran', 'Est. Delivery': 'Anggaran Sampai', 'Language': 'Bahasa',
        'Home': 'Laman Utama', 'Testimonials': 'Testimoni'
    },
    es: {
        'Track Now': 'Rastrear', 'Service': 'Servicio', 'About Us': 'Sobre nosotros', 'Contact Us': 'Contacto',
        'Receipt': 'Recibo', 'Box': 'Caja', 'Log In': 'Iniciar sesión', 'Track Package': 'Rastrear paquete',
        'Live Location': 'Ubicación en vivo', 'Sender': 'Remitente', 'Receiver': 'Destinatario',
        'Shipment Date': 'Fecha de envío', 'Est. Delivery': 'Entrega est.', 'Language': 'Idioma',
        'Home': 'Inicio', 'Testimonials': 'Testimonios'
    },
    fr: {
        'Track Now': 'Suivre', 'Service': 'Service', 'About Us': 'À propos', 'Contact Us': 'Contact',
        'Receipt': 'Reçu', 'Box': 'Colis', 'Log In': 'Connexion', 'Track Package': 'Suivre le colis',
        'Live Location': 'Localisation', 'Sender': 'Expéditeur', 'Receiver': 'Destinataire',
        'Shipment Date': "Date d'envoi", 'Est. Delivery': 'Livraison est.', 'Language': 'Langue',
        'Home': 'Accueil', 'Testimonials': 'Témoignages'
    },
    de: {
        'Track Now': 'Sendung verfolgen', 'Service': 'Service', 'About Us': 'Über uns', 'Contact Us': 'Kontakt',
        'Receipt': 'Beleg', 'Box': 'Paket', 'Log In': 'Anmelden', 'Track Package': 'Paket verfolgen',
        'Live Location': 'Live-Standort', 'Sender': 'Absender', 'Receiver': 'Empfänger',
        'Shipment Date': 'Versanddatum', 'Est. Delivery': 'Vorauss. Lieferung', 'Language': 'Sprache',
        'Home': 'Start', 'Testimonials': 'Meinungen'
    },
    zh: {
        'Track Now': '追踪', 'Service': '服务', 'About Us': '关于我们', 'Contact Us': '联系我们',
        'Receipt': '收据', 'Box': '包裹', 'Log In': '登录', 'Track Package': '追踪包裹',
        'Live Location': '实时位置', 'Sender': '寄件人', 'Receiver': '收件人',
        'Shipment Date': '发货日期', 'Est. Delivery': '预计送达', 'Language': '语言',
        'Home': '首页', 'Testimonials': '评价'
    }
};
function setSiteLang(lang) {
    try { localStorage.setItem('dhl_lang', lang); } catch (e) { }
    document.documentElement.lang = lang || 'en';
    const map = SITE_I18N[lang] || SITE_I18N.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (map[key]) el.textContent = map[key];
    });
    document.querySelectorAll('a, button, h1, h2, h3, h4, p, label, span, .eyebrow').forEach(el => {
        if (el.closest('#adminDashboard') || el.closest('#adminView') || el.closest('.modal-overlay') || el.closest('#langStrip') || el.closest('#heroLang')) return;
        if (el.querySelector('input,button,select,img,svg')) return;
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
            const t = el.textContent.trim();
            if (map[t]) el.textContent = map[t];
            else {
                // restore from data-en if stored
                const en = el.getAttribute('data-en');
                if (en && map[en]) el.textContent = map[en];
                if (!en && t) el.setAttribute('data-en', t);
            }
        }
    });
    const sel = document.getElementById('siteLang');
    if (sel) sel.value = lang;
}
(function initLang() {
    try {
        const L = localStorage.getItem('dhl_lang') || 'en';
        setTimeout(function () { setSiteLang(L); }, 50);
    } catch (e) { }
})();

async function toggleBoxService() {
    if (!adminToken) return;
    try {
        const cur = await apiRequest('/shipments/box-service');
        const next = !(cur && cur.on !== false);
        const data = await apiRequest('/shipments/box-service', {
            method: 'PUT',
            body: JSON.stringify({ on: next })
        });
        const on = data && data.on !== false;
        const label = on ? 'Box video: ON' : 'Box video: OFF';
        ['boxServiceToggleBtn', 'boxServiceToggleBtn2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = label;
                el.style.borderColor = on ? '#1F9D55' : '#D40511';
                el.style.color = on ? '#1F9D55' : '#D40511';
            }
        });
    } catch (e) {
        const m = (e && e.message) ? String(e.message) : '';
        if (/404/.test(m)) {
            alert('Box ON/OFF API not on server yet (404). Push routes/auth.js + models/AdminSettings.js to GitHub and wait for Render to redeploy.');
        } else {
            alert(m || 'Could not update box service');
        }
    }
}



/* mobile menu open class for dhl.com layout */
(function () {
    var orig = window.toggleMobileMenu;
    window.toggleMobileMenu = function () {
        document.body.classList.toggle("menu-open");
        var m = document.getElementById("mobileMenu");
        if (m) m.classList.toggle("open");
        if (typeof orig === "function") {
            try { orig(); } catch (e) { }
        }
    };
})();

/* ========== LIVE CUSTOMER CHAT (guest + admin, separate threads) ========== */
function dhlGuestId() {
    let id = sessionStorage.getItem('dhlGuestId');
    if (!id) {
        id = 'g_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('dhlGuestId', id);
    }
    return id;
}

function openGuestChat() {
    const p = document.getElementById('guestChatPanel');
    if (p) {
        p.classList.remove('hidden');
        p.classList.remove('fullscreen');
    }
    const badge = document.getElementById('guestChatBadge');
    if (badge) badge.classList.add('hidden');
    document.body.classList.add('guest-chat-open');
}

function closeGuestChat() {
    const p = document.getElementById('guestChatPanel');
    if (p) {
        p.classList.add('hidden');
        p.classList.remove('fullscreen');
    }
    document.body.classList.remove('guest-chat-open');
}

async function guestChatStart() {
    const trackEl = document.getElementById('guestChatTrack');
    const errEl = document.getElementById('guestChatErr');
    const track = (trackEl && trackEl.value || '').trim();
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (!track) {
        if (errEl) {
            errEl.textContent = 'Please enter a tracking code.';
            errEl.style.display = 'block';
        }
        return;
    }
    mdShowWait('Connecting……');
    try {
        const data = await apiRequest('/chat/guest/open', {
            method: 'POST',
            body: JSON.stringify({
                guestId: dhlGuestId(),
                trackCode: track
            })
        });
        document.getElementById('guestChatSetup').classList.add('hidden');
        document.getElementById('guestChatRoom').classList.remove('hidden');
        const panel = document.getElementById('guestChatPanel');
        if (panel) panel.classList.add('fullscreen');
        const lab = document.getElementById('guestChatLabel');
        if (lab) lab.textContent = data.label || track;
        guestRenderMessages(data.messages || []);
        if (window._guestChatPoll) clearInterval(window._guestChatPoll);
        window._guestChatPoll = setInterval(guestChatPoll, 4000);
    } catch (e) {
        if (errEl) {
            errEl.textContent = e.message || 'Could not start chat';
            errEl.style.display = 'block';
        } else {
            alert(e.message || 'Could not start chat');
        }
    } finally {
        mdHideWait();
    }
}

function guestRenderMessages(msgs) {
    const box = document.getElementById('guestChatMessages');
    if (!box) return;
    box.innerHTML = (msgs || []).map(function (m) {
        const side = m.from === 'admin' ? 'left' : 'right';
        const img = m.image ? '<img class="chat-img" src="' + m.image + '" alt="" onclick="window.open(this.src)">' : '';
        return '<div class="chat-bubble ' + side + '"><div class="chat-meta">' +
            (m.from === 'admin' ? 'DHL Support' : 'You') + '</div>' +
            (m.text ? '<div>' + esc(m.text) + '</div>' : '') + img + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function guestChatPoll() {
    try {
        const data = await apiRequest('/chat/guest/' + encodeURIComponent(dhlGuestId()));
        guestRenderMessages(data.messages || []);
    } catch (e) { }
}

async function guestChatSend() {
    const input = document.getElementById('guestChatInput');
    const text = (input && input.value || '').trim();
    if (!text && !window._guestChatPendingImage) return;
    try {
        const data = await apiRequest('/chat/guest/send', {
            method: 'POST',
            body: JSON.stringify({
                guestId: dhlGuestId(),
                text: text,
                image: window._guestChatPendingImage || ''
            })
        });
        if (input) input.value = '';
        window._guestChatPendingImage = '';
        guestRenderMessages(data.messages || []);
    } catch (e) {
        alert(e.message || 'Send failed');
    }
}

function guestChatPickImage(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
        window._guestChatPendingImage = reader.result;
        guestChatSend();
    };
    reader.readAsDataURL(f);
    ev.target.value = '';
}

/* Admin chat */
let adminSelectedThreadId = null;

function adminToggleChatPanel() {
    const p = document.getElementById('adminChatPanel');
    if (!p) return;
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) {
        document.body.classList.add('admin-chat-open');
        adminLoadThreads();
        if (window._adminChatPoll) clearInterval(window._adminChatPoll);
        window._adminChatPoll = setInterval(adminLoadThreads, 5000);
    } else {
        document.body.classList.remove('admin-chat-open');
    }
}

function adminToggleChatNav() {
    const n = document.getElementById('adminChatNav');
    if (n) n.classList.toggle('open');
}

async function adminLoadThreads() {
    if (!adminToken) return;
    try {
        const data = await apiRequest('/chat/admin/threads');
        const list = document.getElementById('adminChatThreadList');
        const badge = document.getElementById('adminChatBadge');
        let totalUnread = 0;
        if (list) {
            list.innerHTML = (data.threads || []).map(function (t) {
                totalUnread += t.unreadAdmin || 0;
                const u = t.unreadAdmin ? '<span class="chat-badge">' + t.unreadAdmin + '</span>' : '';
                return '<button type="button" class="admin-thread-item' +
                    (adminSelectedThreadId === t.id ? ' active' : '') +
                    '" onclick="adminOpenThread(\'' + t.id + '\')"><strong>' + esc(t.label) + '</strong>' +
                    u + '<small>' + esc(t.preview || '') + '</small></button>';
            }).join('') || '<p style="padding:12px;color:#888;font-size:13px;">No chats yet.</p>';
        }
        if (badge) {
            if (totalUnread > 0) {
                badge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) { }
}

async function adminOpenThread(id) {
    adminSelectedThreadId = id;
    const nav = document.getElementById('adminChatNav');
    if (nav) nav.classList.remove('open');
    try {
        const data = await apiRequest('/chat/admin/threads/' + id);
        const title = document.getElementById('adminChatTitle');
        if (title) title.textContent = data.label || 'Chat';
        adminRenderMessages(data.messages || []);
        adminLoadThreads();
    } catch (e) {
        alert(e.message || 'Could not open chat');
    }
}

function adminRenderMessages(msgs) {
    const box = document.getElementById('adminChatMessages');
    if (!box) return;
    box.innerHTML = (msgs || []).map(function (m) {
        const side = m.from === 'admin' ? 'right' : 'left';
        const who = m.from === 'admin' ? 'You (Admin)' : 'Customer';
        const img = m.image ? '<img class="chat-img" src="' + m.image + '" alt="" onclick="window.open(this.src)">' : '';
        return '<div class="chat-bubble ' + side + '"><div class="chat-meta">' + who + '</div>' +
            (m.text ? '<div>' + esc(m.text) + '</div>' : '') + img + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function adminChatSend() {
    if (!adminSelectedThreadId) {
        alert('Select a conversation first (☰ Conversations).');
        return;
    }
    const input = document.getElementById('adminChatInput');
    const text = (input && input.value || '').trim();
    if (!text && !window._adminChatPendingImage) return;
    try {
        const data = await apiRequest('/chat/admin/threads/' + adminSelectedThreadId + '/reply', {
            method: 'POST',
            body: JSON.stringify({ text: text, image: window._adminChatPendingImage || '' })
        });
        if (input) input.value = '';
        window._adminChatPendingImage = '';
        adminRenderMessages(data.messages || []);
        adminLoadThreads();
    } catch (e) {
        alert(e.message || 'Send failed');
    }
}

function adminChatPickImage(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
        window._adminChatPendingImage = reader.result;
        adminChatSend();
    };
    reader.readAsDataURL(f);
    ev.target.value = '';
}

/* Bootstrap admin from /admin login (sessionStorage) or ?admin=1 */
function setAdminMode(on) {
    document.body.classList.toggle('admin-mode', !!on);
    const fab = document.getElementById('chatFab');
    if (fab) fab.style.display = on ? 'none' : '';
    const gp = document.getElementById('guestChatPanel');
    if (gp && on) gp.classList.add('hidden');
}

(function bootstrapAdminFromOffice() {
    try {
        const params = new URLSearchParams(location.search);
        const tok = sessionStorage.getItem('dhlAdminToken');
        if (tok) adminToken = tok;
        if (params.get('admin') === '1' && adminToken) {
            document.getElementById('siteView').classList.add('hidden');
            const tp = document.getElementById('trackPage');
            if (tp) tp.classList.add('hidden');
            document.getElementById('adminDashboard').classList.remove('hidden');
            setAdminMode(true);
            if (typeof renderShipList === 'function') renderShipList();
            if (typeof nsLoadAdminNotifs === 'function') nsLoadAdminNotifs();
            adminLoadThreads();
            if (window._nsAdminNotifTimer) clearInterval(window._nsAdminNotifTimer);
            window._nsAdminNotifTimer = setInterval(function () {
                if (typeof nsLoadAdminNotifs === 'function') nsLoadAdminNotifs();
                adminLoadThreads();
            }, 8000);
            window.scrollTo(0, 0);
        } else if (params.get('admin') === '1' && !adminToken) {
            location.replace('/admin');
        }
    } catch (e) { }
})();

const _logoutAdminOrig = logoutAdmin;
logoutAdmin = function () {
    sessionStorage.removeItem('dhlAdminToken');
    adminToken = null;
    setAdminMode(false);
    document.body.classList.remove('admin-chat-open');
    const ac = document.getElementById('adminChatPanel');
    if (ac) ac.classList.add('hidden');
    if (window._adminChatPoll) clearInterval(window._adminChatPoll);
    if (typeof _logoutAdminOrig === 'function') _logoutAdminOrig();
    else showSite();
};
