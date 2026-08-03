
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
   (the novaship-backend files) instead of using localStorage.
   For it to work, that backend needs to be running.
   ========================================================= */

// Change this once your backend is deployed somewhere real.
const API_BASE = "https://my-delivery-w6xz.onrender.com/api";

// Admin login token — kept in a plain JS variable only (no localStorage),
// so you'll need to log in again after refreshing the page. That's expected.
let adminToken = null;

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
      <div class="timeline">
        ${shipment.history.map((h, i) => `
          <div class="tl-step done ${i === shipment.history.length - 1 ? 'current' : ''}">
            <h5>${esc(h.label)}</h5>
            <span>${esc(h.date)} — ${esc(h.location)}</span>
          </div>`).join("")}
      </div>
      <h4 class="section-title" style="margin-top:26px;">Live Location</h4>
      <div id="publicMapBox"></div>
      <div class="progress-bar"><div class="progress-fill" id="publicProgressFill" style="width:${Math.round(computeLiveProgress(shipment.route))}%"></div></div>
      <p style="font-size:12.5px;color:var(--gray);margin-top:8px;" id="publicProgressNote"></p>
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
      <input id="f_code" class="mono" value="${esc(s.code)}" ${isNew ? '' : 'readonly style="background:#F3F1EC;"'} placeholder="e.g. DHL">
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
        ${["Card", "Bank Transfer", "Cash on Delivery"].map(m => `<option ${s.payment.method === m ? 'selected' : ''}>${m}</option>`).join("")}
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
        <input id="f_carrier" value="${esc(s.carrier || '')}" placeholder="e.g. My Delivery Express">
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
        <select id="f_oCountry">
          ${Object.keys(COUNTRY_COORDS).map(c => `<option ${((s.route && s.route.originCountry) === c) ? 'selected' : ''}>${c}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Destination Country</label>
        <select id="f_dCountry">
          ${Object.keys(COUNTRY_COORDS).map(c => `<option ${((s.route && s.route.destCountry) === c) ? 'selected' : ''}>${c}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Vehicle Icon</label>
      <select id="f_icon">
        <option value="truck" ${(!(s.route && s.route.icon) || (s.route && s.route.icon === 'truck')) ? 'selected' : ''}>🚚 Truck</option>
        <option value="plane" ${(s.route && s.route.icon === 'plane') ? 'selected' : ''}>✈️ Plane</option>
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
    <div class="field" style="display:flex; align-items:center; gap:8px;">
      <input type="checkbox" id="f_flip" style="width:auto;" ${(s.route && s.route.flipOverride) ? 'checked' : ''}>
      <label style="margin:0;">Reverse vehicle direction (+180°)</label>
    </div>
    <div class="field">
      <label>Rotation degree (plane faces destination — drag to adjust) <span id="rotLabel">${Math.round((s.route && s.route.rotationDeg != null) ? s.route.rotationDeg : 0)}°</span></label>
      <input type="range" id="f_rotation" min="0" max="360" step="1" value="${(s.route && s.route.rotationDeg != null) ? s.route.rotationDeg : 0}" oninput="document.getElementById('rotLabel').textContent=this.value+'°'">
      <p style="font-size:12px;color:var(--gray);margin-top:4px;">Leave at 0 to auto-face destination. Or set exact degree 0–360.</p>
    </div>

    <div id="adminMapBox"></div>
    <div class="progress-bar"><div class="progress-fill" id="mapProgressFill" style="width:${Math.round(computeLiveProgress(s.route))}%"></div></div>
    <div class="map-controls">
      <button class="btn btn-red small-btn" onclick="playRoute('${esc(s.code)}')">▶ Start Moving</button>
      <button class="btn btn-outline small-btn" style="color:var(--ink);border-color:var(--line);" onclick="pauseRoute('${esc(s.code)}')">⏸ Stop</button>
      <button class="btn btn-outline small-btn" style="color:var(--ink);border-color:var(--line);" onclick="resetRoute('${esc(s.code)}')">⟲ Reset</button>
      <span class="mono" style="font-size:12.5px;color:var(--gray);">Progress: <span id="mapProgressLabel">${Math.round(computeLiveProgress(s.route))}%</span></span>
    </div>
    <button class="btn btn-red" style="width:100%; margin-top:14px; padding:13px;" onclick="saveRoute('${esc(s.code)}')">✓ Done — Save Map Settings</button>
    <p id="routeSaveMsg" style="font-size:12px; color:var(--gray); margin-top:6px; display:none;"></p>
    ` : ''}
  `;
    if (!isNew) initAdminMap(s); else destroyAdminMap();
}

function collectFormShipment(existingCode) {
    const code = document.getElementById('f_code').value.trim() || existingCode;
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
    const code = document.getElementById('f_code').value.trim();
    if (!code) { alert('Please enter a tracking code.'); return; }
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
const COUNTRY_COORDS = {
    "United States": { lat: 38.9072, lng: -77.0369 },
    "Canada": { lat: 45.4215, lng: -75.6972 },
    "United Kingdom": { lat: 51.5074, lng: -0.1278 },
    "Germany": { lat: 52.5200, lng: 13.4050 },
    "France": { lat: 48.8566, lng: 2.3522 },
    "Spain": { lat: 40.4168, lng: -3.7038 },
    "Italy": { lat: 41.9028, lng: 12.4964 },
    "Netherlands": { lat: 52.3676, lng: 4.9041 },
    "Portugal": { lat: 38.7223, lng: -9.1393 },
    "Ireland": { lat: 53.3498, lng: -6.2603 },
    "Sweden": { lat: 59.3293, lng: 18.0686 },
    "Poland": { lat: 52.2297, lng: 21.0122 },
    "Switzerland": { lat: 46.9480, lng: 7.4474 },
    "Turkey": { lat: 39.9334, lng: 32.8597 },
    "Russia": { lat: 55.7558, lng: 37.6173 },
    "Nigeria": { lat: 6.5244, lng: 3.3792 },
    "Kenya": { lat: -1.2921, lng: 36.8219 },
    "Ghana": { lat: 5.6037, lng: -0.1870 },
    "South Africa": { lat: -25.7479, lng: 28.2293 },
    "Egypt": { lat: 30.0444, lng: 31.2357 },
    "Ethiopia": { lat: 9.0250, lng: 38.7469 },
    "Morocco": { lat: 34.0209, lng: -6.8417 },
    "United Arab Emirates": { lat: 25.2048, lng: 55.2708 },
    "Saudi Arabia": { lat: 24.7136, lng: 46.6753 },
    "India": { lat: 28.6139, lng: 77.2090 },
    "China": { lat: 39.9042, lng: 116.4074 },
    "Japan": { lat: 35.6762, lng: 139.6503 },
    "South Korea": { lat: 37.5665, lng: 126.9780 },
    "Singapore": { lat: 1.3521, lng: 103.8198 },
    "Malaysia": { lat: 3.1390, lng: 101.6869 },
    "Indonesia": { lat: -6.2088, lng: 106.8456 },
    "Philippines": { lat: 14.5995, lng: 120.9842 },
    "Vietnam": { lat: 21.0278, lng: 105.8342 },
    "Thailand": { lat: 13.7563, lng: 100.5018 },
    "Australia": { lat: -35.2809, lng: 149.1300 },
    "New Zealand": { lat: -41.2865, lng: 174.7762 },
    "Brazil": { lat: -15.8267, lng: -47.9218 },
    "Mexico": { lat: 19.4326, lng: -99.1332 },
    "Argentina": { lat: -34.6037, lng: -58.3816 },
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
    const label = document.getElementById('mapProgressLabel');
    if (label) label.textContent = Math.round(progress) + '%';
    const fill = document.getElementById('mapProgressFill');
    if (fill) fill.style.width = Math.round(progress) + '%';
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
        flipOverride: document.getElementById('f_flip').checked,
        rotationDeg: Number(document.getElementById('f_rotation') ? document.getElementById('f_rotation').value : 0),
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
    const fill = document.getElementById('publicProgressFill');
    if (fill) fill.style.width = Math.round(progress) + '%';
    const note = document.getElementById('publicProgressNote');
    if (note) note.textContent = Math.round(progress) + '% of the way there' + (isMoving ? ' — currently moving.' : '.') + ' You can zoom and pan the map to follow along.';
}
function startPublicAnimation(oLat, oLng, dLat, dLng, route) {
    if (publicAnimTimer) clearInterval(publicAnimTimer);
    publicAnimTimer = setInterval(() => {
        const p = computeLiveProgress(route);
        reflectPublicProgress(p, true);
        if (publicMarker) publicMarker.setLatLng(pointAlong(oLat, oLng, dLat, dLng, p / 100));
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
    el.innerHTML = '<button type="button" class="ns-t-close" aria-label="Close">&times;</button>' +
        '<div class="ns-t-title">' + esc(n.title || 'Update') + '</div>' +
        '<div>' + esc(n.message || '') + '</div>' +
        '<div class="ns-t-code">' + esc(n.code || '') + (n.location ? ' · ' + esc(n.location) : '') + '</div>';
    el.querySelector('.ns-t-close').onclick = () => el.remove();
    host.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 9000);

    if (nsBrowserPerm && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
            new Notification(n.title || 'Shipment update', {
                body: (n.code ? n.code + ' — ' : '') + (n.message || ''),
                tag: String(n._id || n.code || Date.now()),
            });
        } catch (e) { }
    }
}

async function nsRequestBrowserNotify() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') { nsBrowserPerm = true; return true; }
    if (Notification.permission !== 'denied') {
        const p = await Notification.requestPermission();
        nsBrowserPerm = p === 'granted';
        return nsBrowserPerm;
    }
    return false;
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
            nsShowToast(n);
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
        banner.innerHTML = '<span class="ns-live-dot"></span><span>Live updates on for <b class="mono">' +
            esc(nsTrackCode) + '</b></span><button type="button" class="btn btn-outline small-btn" style="color:#111;border-color:#ccc;margin-left:auto;" onclick="nsRequestBrowserNotify()">Enable desktop alerts</button>';
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