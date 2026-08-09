
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
    const list = Array.isArray(history) ? history.slice() : [];
    // show newest first like real DHL
    const ordered = list.slice().reverse();
    if (!ordered.length) {
        return '<div class="dhl-timeline"><div class="dhl-tl-item pending"><div class="dhl-tl-dot">△</div><div><div class="dhl-tl-status">Awaiting first scan</div></div></div></div>';
    }
    return '<div class="dhl-timeline">' + ordered.map((h, i) => {
        const label = String(h.label || h.status || 'Update');
        const loc = String(h.location || '');
        const isDelivered = /deliver/i.test(label);
        const isFirst = i === 0;
        const cls = isDelivered ? 'done' : (isFirst ? 'current' : 'pending');
        const dot = isDelivered ? '✓' : '△';
        const t = dhlParseHistoryDate(h);
        const statusClass = isDelivered ? 'delivered' : '';
        return `<div class="dhl-tl-item ${cls}">
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

function downloadTrackQr(code) {
    const url = qrUrlForCode(code) + '&download=1';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DHL-QR-' + code + '.png';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Also try fetch blob for better mobile save
    fetch(qrUrlForCode(code)).then(r => r.blob()).then(blob => {
        const u = URL.createObjectURL(blob);
        const a2 = document.createElement('a');
        a2.href = u;
        a2.download = 'DHL-QR-' + code + '.png';
        document.body.appendChild(a2);
        a2.click();
        a2.remove();
        URL.revokeObjectURL(u);
    }).catch(() => { });
}

let _qrStream = null;
let _qrTimer = null;
function stopQrScan() {
    if (_qrTimer) { clearInterval(_qrTimer); _qrTimer = null; }
    if (_qrStream) {
        _qrStream.getTracks().forEach(t => t.stop());
        _qrStream = null;
    }
    const area = document.getElementById('qrScanArea');
    if (area) area.style.display = 'none';
    const v = document.getElementById('qrVideo');
    if (v) v.srcObject = null;
}
async function startQrScan() {
    const area = document.getElementById('qrScanArea');
    const video = document.getElementById('qrVideo');
    if (!area || !video) {
        alert('Track a package first, then use Scan QR.');
        return;
    }
    area.style.display = 'block';
    try {
        _qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = _qrStream;
        await video.play();
    } catch (e) {
        alert('Camera not available. Open the QR image or type the tracking code on Box.');
        stopQrScan();
        return;
    }
    if (typeof BarcodeDetector === 'undefined') {
        // Fallback: manual — user can still use downloaded QR which links to box.html
        return;
    }
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    if (_qrTimer) clearInterval(_qrTimer);
    _qrTimer = setInterval(async () => {
        try {
            if (video.readyState < 2) return;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            if (!canvas.width) return;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const codes = await detector.detect(canvas);
            if (!codes || !codes.length) return;
            const raw = String(codes[0].rawValue || '');
            let code = '';
            try {
                const u = new URL(raw);
                code = u.searchParams.get('code') || '';
            } catch (_) {
                code = raw;
            }
            const m = raw.match(/DHL[A-Z0-9]+/i);
            if (!code && m) code = m[0];
            if (code) {
                stopQrScan();
                location.href = '/box.html?code=' + encodeURIComponent(code.trim());
            }
        } catch (_) { }
    }, 700);
}


function qrUrlForCode(code) {
    const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    const target = origin + '/box.html?code=' + encodeURIComponent(code);
    return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(target);
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

// Change this once your backend is deployed somewhere real.
const API_BASE = "https://my-delivery-w6xz.onrender.com/api";

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
    document.getElementById('mobileMenu').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
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
        <div class="meta-chip">Weight<b>${esc(shipment.package.weightKg)} kg</b></div>
        <div class="meta-chip">Dimensions<b>${esc(shipment.package.length)}×${esc(shipment.package.width)}×${esc(shipment.package.height)} cm</b></div>
        <div class="meta-chip">Mode<b>${esc(shipment.mode || '—')}</b></div>
        <div class="meta-chip">Carrier<b>${esc(shipment.carrier || '—')}</b></div>
        <div class="meta-chip">Est. Delivery<b>${esc(shipment.estimatedDelivery || 'TBD')}</b></div>
        <div class="meta-chip">Payment<b>${esc(shipment.payment.status)} · ${esc(shipment.payment.method)}</b></div>
        <div class="meta-chip">Amount<b>${esc(shipment.payment.currency || '')} ${esc(Number(shipment.payment.amount || 0).toFixed(2))}</b></div>
      </div>
      <div class="track-qr-row">
        <img id="trackQrImg" src="${qrUrlForCode(shipment.code)}" alt="QR ${esc(shipment.code)}" width="140" height="140">
        <div class="qr-info">
          <div><b>Shipment QR code</b></div>
          <div>Save to your phone, then scan later to open this package (receiver details from admin).</div>
          <div class="mono" style="margin-top:6px;">${esc(shipment.code)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
            <button type="button" class="btn btn-red small-btn" onclick="downloadTrackQr('${esc(shipment.code)}')">Download QR</button>
            <a class="btn btn-outline small-btn" href="/box.html?code=${encodeURIComponent(shipment.code)}" style="color:#111;border-color:#ccc;text-decoration:none;">Open package box</a>
            <button type="button" class="btn btn-outline small-btn" style="color:#111;border-color:#ccc;" onclick="startQrScan()">Scan QR now</button>
          </div>
          <div id="qrScanArea" style="display:none;margin-top:12px;">
            <video id="qrVideo" playsinline style="width:100%;max-width:280px;border-radius:8px;background:#000;"></video>
            <p style="font-size:12px;color:#666;margin-top:6px;">Point camera at the shipment QR. Correct code opens the package box.</p>
            <button type="button" class="btn btn-outline small-btn" style="color:#111;border-color:#ccc;" onclick="stopQrScan()">Stop scan</button>
          </div>
        </div>
      </div>
      ${dhlTimelineHtml(shipment.history)}
      <h4 class="section-title" style="margin-top:26px;">Live Location</h4>
      <div class="route-progress-wrap">
        <div class="route-ends">
          <span>${esc((shipment.route && shipment.route.originCountry) || 'Origin')}</span>
          <span class="route-vehicle-icon">${(shipment.route && shipment.route.icon === 'plane') ? '✈️' : (shipment.route && shipment.route.icon === 'ship') ? '🚢' : '🚚'}</span>
          <span>${esc((shipment.route && shipment.route.destCountry) || 'Destination')}</span>
        </div>
        <div class="progress-bar tall"><div class="progress-fill" id="publicProgressFill" style="width:${Math.round(computeLiveProgress(shipment.route))}%"></div></div>
        <p style="font-size:12.5px;color:var(--gray);margin-top:8px;" id="publicProgressNote"></p>
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
        adminToken = data.token;
        pendingLoginTicket = null;
        err.style.display = 'none';
        closeModal('pinModal');
        document.getElementById('siteView').classList.add('hidden');
        document.getElementById('trackPage').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
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
function logoutAdmin() { destroyAdminMap(); adminToken = null; unlockedShipments = {}; showSite(); window.scrollTo(0, 0); }

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
      <div class="field"><label>Terms of Trade</label><input id="f_terms" value="${esc(s.termsOfTrade || 'DDP')}"></div>
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
      <select id="f_icon">
        <option value="plane" ${(s.route && s.route.icon === 'plane') ? 'selected' : ''}>✈️ Plane / Flight</option>
        <option value="truck" ${(!(s.route && s.route.icon) || (s.route && s.route.icon === 'truck')) ? 'selected' : ''}>🚚 Truck</option>
        <option value="ship" ${(s.route && s.route.icon === 'ship') ? 'selected' : ''}>🚢 Ship</option>
      </select>
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
      <select id="f_face">
        <option value="auto" ${!(s.route && s.route.flipOverride) && !(s.route && s.route.rotationDeg) ? 'selected' : ''}>Auto — face destination</option>
        <option value="flip" ${(s.route && s.route.flipOverride) ? 'selected' : ''}>Reverse — face opposite way</option>
        <option value="0" ${(s.route && s.route.rotationDeg === 0 && !s.route.flipOverride) ? 'selected' : ''}>Fixed 0° (east style)</option>
        <option value="90" ${(s.route && Number(s.route.rotationDeg) === 90) ? 'selected' : ''}>Fixed 90° (north style)</option>
        <option value="180" ${(s.route && Number(s.route.rotationDeg) === 180) ? 'selected' : ''}>Fixed 180°</option>
        <option value="270" ${(s.route && Number(s.route.rotationDeg) === 270) ? 'selected' : ''}>Fixed 270°</option>
      </select>
      <p style="font-size:12px;color:var(--gray);margin-top:4px;">Use <b>Auto</b> for most routes. Use Reverse if the icon points the wrong way.</p>
    </div>

    <div id="adminMapBox"></div>
    <div class="route-progress-wrap">
      <div class="route-ends">
        <span id="mapOriginLabel">${esc((s.route && s.route.originCountry) || 'Origin')}</span>
        <span class="route-vehicle-icon" id="mapVehicleIcon">${(s.route && s.route.icon === 'plane') ? '✈️' : (s.route && s.route.icon === 'ship') ? '🚢' : '🚚'}</span>
        <span id="mapDestLabel">${esc((s.route && s.route.destCountry) || 'Destination')}</span>
      </div>
      <div class="progress-bar tall"><div class="progress-fill" id="mapProgressFill" style="width:${Math.round(computeLiveProgress(s.route))}%"></div></div>
      <div class="progress-pct mono">Progress: <span id="mapProgressLabel">${Math.round(computeLiveProgress(s.route))}%</span></div>
    </div>
    <div class="map-controls">
      <button class="btn btn-red small-btn" onclick="playRoute('${esc(s.code)}')">▶ Start Moving</button>
      <button class="btn btn-outline small-btn" style="color:var(--ink);border-color:var(--line);" onclick="pauseRoute('${esc(s.code)}')">⏸ Stop</button>
      <button class="btn btn-outline small-btn" style="color:var(--ink);border-color:var(--line);" onclick="resetRoute('${esc(s.code)}')">⟲ Reset</button>
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
const ICONS = { truck: '🚚', plane: '✈️', ship: '🚢' };
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
function makeVehicleIcon(iconType, oLat, oLng, dLat, dLng, flipOverride, rotationDeg) {
    const emoji = ICONS[iconType || 'truck'];
    let deg = (rotationDeg != null && rotationDeg !== '' && Number(rotationDeg) !== 0)
        ? Number(rotationDeg)
        : bearingDeg(oLat, oLng, dLat, dLng);
    if (flipOverride) deg = (deg + 180) % 360;
    // Planes/ships face "up" in emoji art; rotate so nose points toward destination
    const transform = 'rotate(' + deg + 'deg)';
    return L.divIcon({
        html: '<div style="font-size:28px;line-height:28px;transform:' + transform + ';transform-origin:center center;">' + emoji + '</div>',
        className: '', iconSize: [28, 28], iconAnchor: [14, 14]
    });
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
    const icon = makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg);
    const startProgress = computeLiveProgress(r);
    const pos = pointAlong(oLat, oLng, dLat, dLng, startProgress / 100);
    adminMarker = L.marker(pos, { icon, draggable: true }).addTo(adminMap);

    adminMarker.on('drag', e => {
        const ll = e.target.getLatLng();
        const t = projectT(oLat, oLng, dLat, dLng, ll.lat, ll.lng);
        reflectAdminProgress(t * 100);
    });
    adminMarker.on('dragend', async e => {
        const ll = e.target.getLatLng();
        const t = projectT(oLat, oLng, dLat, dLng, ll.lat, ll.lng);
        e.target.setLatLng(pointAlong(oLat, oLng, dLat, dLng, t));
        // Manually dragging always stops automatic movement and freezes it here.
        stopAdminAnimation();
        try {
            await apiRequest('/shipments/' + encodeURIComponent(shipment.code) + '/route', {
                method: 'PATCH', body: JSON.stringify({ isMoving: false, movingSince: null, progress: t * 100 })
            });
        } catch (err) { /* keep the visual position even if the save fails */ }
    });

    if (r.isMoving) { startAdminAnimation(shipment); }
    else { reflectAdminProgress(startProgress); }
}
function reflectAdminProgress(progress) {
    const p = Math.max(0, Math.min(100, Number(progress) || 0));
    const label = document.getElementById('mapProgressLabel');
    if (label) label.textContent = Math.round(p) + '%';
    const fill = document.getElementById('mapProgressFill');
    if (fill) fill.style.width = p + '%';
    const icon = document.getElementById('mapVehicleIcon');
    if (icon) icon.style.left = 'calc(' + p + '% - 10px)';
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
    const payload = {
        originCountry, destCountry,
        originLat: oCoords.lat, originLng: oCoords.lng,
        destLat: dCoords.lat, destLng: dCoords.lng,
        icon: document.getElementById('f_icon').value,
        speed: document.getElementById('f_speed').value,
        flipOverride: (document.getElementById('f_face') && document.getElementById('f_face').value === 'flip'),
        rotationDeg: (function () {
            const v = (document.getElementById('f_face') || {}).value;
            if (!v || v === 'auto' || v === 'flip') return 0;
            return Number(v) || 0;
        })(),
    };
    try {
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', { method: 'PATCH', body: JSON.stringify(payload) });
        unlockedShipments[updated.code] = updated;
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--green)'; msg.textContent = 'Saved.'; }
        initAdminMap(updated);
    } catch (err) {
        if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--red)'; msg.textContent = err.message; }
    }
}
async function playRoute(code) {
    try {
        // Uses the cached full shipment (from unlocking or a non-protected fetch) -
        // shipmentsCache alone doesn't have route data for PIN-protected shipments.
        const s = unlockedShipments[code];
        if (!s || !s.route || [s.route.originLat, s.route.originLng, s.route.destLat, s.route.destLng].some(v => v === undefined || v === null)) {
            alert('Pick origin & destination countries and click "Done" first.');
            return;
        }
        const currentProgress = computeLiveProgress(s.route);
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', {
            method: 'PATCH', body: JSON.stringify({ isMoving: true, movingSince: new Date().toISOString(), progress: currentProgress })
        });
        unlockedShipments[updated.code] = updated;
        initAdminMap(updated);
    } catch (err) {
        alert("Couldn't start movement: " + err.message);
    }
}
async function pauseRoute(code) {
    try {
        const s = unlockedShipments[code];
        const frozenProgress = s ? computeLiveProgress(s.route) : 0;
        stopAdminAnimation();
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', {
            method: 'PATCH', body: JSON.stringify({ isMoving: false, movingSince: null, progress: frozenProgress })
        });
        unlockedShipments[updated.code] = updated;
        initAdminMap(updated);
    } catch (err) {
        alert("Couldn't stop movement: " + err.message);
    }
}
async function resetRoute(code) {
    try {
        stopAdminAnimation();
        const updated = await apiRequest('/shipments/' + encodeURIComponent(code) + '/route', {
            method: 'PATCH', body: JSON.stringify({ isMoving: false, movingSince: null, progress: 0 })
        });
        unlockedShipments[updated.code] = updated;
        initAdminMap(updated);
    } catch (err) {
        alert("Couldn't reset: " + err.message);
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
    publicMap = L.map(box).setView([(oLat + dLat) / 2, (oLng + dLng) / 2], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(publicMap);
    L.marker([oLat, oLng]).addTo(publicMap).bindPopup('Origin' + (r.originCountry ? ': ' + r.originCountry : ''));
    L.marker([dLat, dLng]).addTo(publicMap).bindPopup('Destination' + (r.destCountry ? ': ' + r.destCountry : ''));
    const line = L.polyline([[oLat, oLng], [dLat, dLng]], { color: '#FFCC00', weight: 3, dashArray: '6,8' }).addTo(publicMap);
    publicMap.fitBounds(line.getBounds(), { padding: [30, 30] });
    const icon = makeVehicleIcon(r.icon, oLat, oLng, dLat, dLng, r.flipOverride, r.rotationDeg);
    const startProgress = computeLiveProgress(r);
    const pos = pointAlong(oLat, oLng, dLat, dLng, startProgress / 100);
    publicMarker = L.marker(pos, { icon, draggable: false, interactive: false }).addTo(publicMap).bindPopup('Current location');

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
    const note = document.getElementById('publicProgressNote');
    if (note) note.textContent = Math.round(p) + '% of the way there' + (isMoving ? ' — currently moving.' : '.') + ' You can zoom and pan the map to follow along.';
}
let _lastProgNotif = -1;
function startPublicAnimation(oLat, oLng, dLat, dLng, route) {
    if (publicAnimTimer) clearInterval(publicAnimTimer);
    _lastProgNotif = -1;
    publicAnimTimer = setInterval(() => {
        const p = computeLiveProgress(route);
        reflectPublicProgress(p, true);
        if (publicMarker) publicMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
        // Phone notification on movement milestones (0, 25, 50, 75, 100)
        const step = Math.floor(p / 25) * 25;
        if (nsBrowserPerm && step > _lastProgNotif && step >= 25) {
            _lastProgNotif = step;
            const o = (route && route.originCountry) || 'Origin';
            const d = (route && route.destCountry) || 'Destination';
            const ic = route && route.icon === 'plane' ? '✈️' : route && route.icon === 'ship' ? '🚢' : '🚚';
            nsPhoneNotify(
                'Delivery movement ' + Math.round(p) + '%',
                ic + ' ' + o + ' → ' + d + ' · your package is on the way',
                'dhl-prog-' + step
            );
        }
        if (p >= 100) { clearInterval(publicAnimTimer); publicAnimTimer = null; }
    }, 200);
}


/* ---------- REAL-TIME TRACKING NOTIFICATIONS ---------- */
let nsTrackCode = null;
let nsLastNotifAt = null;
let nsNotifTimer = null;
let nsSeenIds = new Set();
let nsBrowserPerm = false;

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
async function nsToggleLivePhoneNotify() {
    try {
        if (!_dhlSwReg && navigator.serviceWorker) {
            _dhlSwReg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
        }
    } catch (e) { }
    const ok = await nsRequestBrowserNotify();
    nsBrowserPerm = ok;
    const btn = document.getElementById('nsLiveToggleBtn');
    if (btn) btn.textContent = ok ? 'Live notifications ON' : 'Turn on live notifications';
    if (ok) {
        nsPhoneNotify(
            'DHL live tracking ON',
            nsTrackCode
                ? ('Movement updates for ' + nsTrackCode + ' will appear on your notification bar.')
                : 'Live notifications enabled for this site.',
            'dhl-live-on'
        );
    } else {
        alert('Allow notifications for this site in your phone browser settings, then tap again.');
    }
}
function nsPhoneNotify(title, body, tag) {
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
    nsTrackCode = String(code || '').toUpperCase();
    nsLastNotifAt = new Date().toISOString(); // only new events after open
    nsSeenIds = new Set();
    if (nsNotifTimer) clearInterval(nsNotifTimer);
    nsNotifTimer = setInterval(nsPollTrackNotifications, 4000);
    const banner = document.getElementById('nsLiveBanner');
    if (banner) {
        banner.classList.add('show');
        banner.innerHTML = '<span class="ns-live-dot"></span><span>Live tracking on for <b class="mono">' +
            esc(nsTrackCode) + '</b> — movement updates will appear here.</span>' +
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
async function nsLoadAdminNotifs() {
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
