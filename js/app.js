/* Pickleball Signup v2.0 — Firebase connected version
   Replace your existing js/app.js with this file.
   Uses existing Firebase project, Authentication, and Firestore collections:
   events, locations, users
*/

// ---------- Firebase setup ----------
const firebaseConfig = {
  apiKey: "AIzaSyDxDO7aD88z1dEvb9T1H6TJZivqAh82JYc",
  authDomain: "pickleballsignup-64eda.firebaseapp.com",
  projectId: "pickleballsignup-64eda",
  storageBucket: "pickleballsignup-64eda.firebasestorage.app",
  messagingSenderId: "39124520969",
  appId: "1:39124520969:web:e33a4bd5bb52787eab28d8"
};

const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/10.12.5";
let fb = {};

const $ = sel => document.querySelector(sel);
const appRoot = () => document.querySelector('#app');

let state = {
  users: {},
  currentUser: null,
  profile: null,
  locations: [],
  events: [],
  ready: false,
  view: localStorage.getItem('pickleballView') || 'player'
};

let unsubscribers = [];

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function timeLabel(t) {
  if (!t) return '';
  let [h, m] = String(t).split(':').map(Number);
  let am = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m || 0).padStart(2, '0')} ${am}`;
}

function normalizeEvent(docSnap) {
  const data = docSnap.data() || {};
  let signups = data.signups || [];
  if (!Array.isArray(signups)) {
    signups = Object.entries(signups).map(([id, value]) => ({ id, ...value }));
  }
  return { id: docSnap.id, ...data, signups };
}

function eventCounts(ev) {
  const signups = ev.signups || [];
  return {
    playing: signups.filter(s => s.status === 'playing').length,
    interested: signups.filter(s => s.status === 'interested').length,
    total: signups.length
  };
}

function isClosedByCutoff(ev) {
  if (!ev.cutoff || ev.cutoff === 'open') return false;
  const hrs = Number(ev.cutoff || 0);
  if (!ev.date || !ev.start || Number.isNaN(hrs)) return false;
  const start = new Date(`${ev.date}T${ev.start}:00`).getTime();
  return Date.now() >= start - hrs * 3600000;
}

function eventStatus(ev) {
  const c = eventCounts(ev);
  if (ev.closed) return { label: 'CLOSED', cls: 'red' };
  if (ev.full || (Number(ev.max || 0) > 0 && c.playing >= Number(ev.max))) {
    return { label: 'FULLY BOOKED', cls: 'red' };
  }
  if (ev.booked) return { label: 'BOOKED', cls: 'green' };
  return { label: 'Waiting', cls: 'yellow' };
}

function canSignup(ev) {
  const st = eventStatus(ev);
  return st.label !== 'CLOSED' && st.label !== 'FULLY BOOKED' && !isClosedByCutoff(ev);
}

async function initFirebase() {
  try {
    const appMod = await import(`${FIREBASE_CDN}/firebase-app.js`);
    const authMod = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const fsMod = await import(`${FIREBASE_CDN}/firebase-firestore.js`);

    const firebaseApp = appMod.initializeApp(firebaseConfig);
    fb.auth = authMod.getAuth(firebaseApp);
    fb.db = fsMod.getFirestore(firebaseApp);

    Object.assign(fb, authMod, fsMod);

    fb.onAuthStateChanged(fb.auth, async user => {
      cleanupListeners();
      state.currentUser = user;
      state.profile = null;
      state.events = [];
      state.locations = [];

      if (!user) {
        renderLogin();
        return;
      }

      await ensureUserProfile(user);
      startRealtimeListeners(user);
    });
  } catch (err) {
    console.error(err);
    appRoot().innerHTML = `<div class="wrap"><div class="card"><h2>Firebase Error</h2><p>${esc(err.message)}</p></div></div>`;
  }
}

function cleanupListeners() {
  unsubscribers.forEach(fn => {
    try { fn(); } catch (_) {}
  });
  unsubscribers = [];
}

async function ensureUserProfile(user) {
  const ref = fb.doc(fb.db, 'users', user.uid);
  const snap = await fb.getDoc(ref);
  if (!snap.exists()) {
    await fb.setDoc(ref, {
      name: user.displayName || user.email?.split('@')[0] || 'Player',
      email: user.email || '',
      role: 'player',
      children: [],
      createdAt: fb.serverTimestamp()
    });
  }
}

function startRealtimeListeners(user) {
  const userRef = fb.doc(fb.db, 'users', user.uid);
  unsubscribers.push(fb.onSnapshot(userRef, snap => {
    state.profile = { id: user.uid, ...(snap.data() || {}) };
    render();
  }));

  unsubscribers.push(fb.onSnapshot(fb.collection(fb.db, 'events'), snap => {
    state.events = snap.docs.map(normalizeEvent).sort((a, b) => String(a.date + a.start).localeCompare(String(b.date + b.start)));
    render();
  }));

  unsubscribers.push(fb.onSnapshot(fb.collection(fb.db, 'locations'), snap => {
    const locs = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    // Supports either {name:'DinkHouse'} documents or document IDs used as location names.
    state.locations = locs.map(l => l.name || l.title || l.id).filter(Boolean);
    if (state.locations.length === 0) state.locations = ['DinkHouse', 'Liberty Park', 'Cerritos Courts'];
    render();
  }));
}

function render() {
  if (!state.currentUser) return renderLogin();
  if (!state.profile) return renderLoading('Loading profile...');
  renderApp(state.view);
}

function renderLoading(msg = 'Loading...') {
  appRoot().innerHTML = `<div class="wrap"><div class="hero"><h1>🏓 Pickleball Signup</h1><p>${esc(msg)}</p></div></div>`;
}

function renderLogin() {
  appRoot().innerHTML = `
    <div class="wrap login">
      <div style="width:100%">
        <div class="hero"><h1>🏓 Pickleball Signup</h1><p>Login or create your player account.</p></div>
        <div class="card">
          <h2>Login</h2>
          <label>Email</label>
          <input id="email" type="email" placeholder="you@email.com" autocomplete="email">
          <label>Password</label>
          <div class="passwordBox">
            <input id="pass" type="password" placeholder="Password" autocomplete="current-password">
            <button class="secondary" onclick="togglePass('pass',this)">Show</button>
          </div>
          <div class="row" style="margin-top:14px">
            <button onclick="loginUser()">Login</button>
            <button class="secondary" onclick="createUser()">Create Account</button>
            <button class="ghost" onclick="forgotPassword()">Forgot Password</button>
          </div>
          <p class="small">First time? Enter email/password, then Create Account. You can edit your name after login.</p>
        </div>
      </div>
    </div>`;
}

window.togglePass = function(id, btn) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
};

window.createUser = async function() {
  const email = $('#email').value.trim().toLowerCase();
  const pass = $('#pass').value;
  if (!email || !pass) return alert('Enter email and password.');
  try {
    const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pass);
    await fb.setDoc(fb.doc(fb.db, 'users', cred.user.uid), {
      name: email.split('@')[0],
      email,
      role: 'player',
      children: [],
      createdAt: fb.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    alert(err.message);
  }
};

window.loginUser = async function() {
  const email = $('#email').value.trim().toLowerCase();
  const pass = $('#pass').value;
  if (!email || !pass) return alert('Enter email and password.');
  try {
    await fb.signInWithEmailAndPassword(fb.auth, email, pass);
  } catch (err) {
    alert(err.message);
  }
};

window.forgotPassword = async function() {
  const email = prompt('Enter your account email:');
  if (!email) return;
  try {
    await fb.sendPasswordResetEmail(fb.auth, email.trim().toLowerCase());
    alert('Password reset email sent.');
  } catch (err) {
    alert(err.message);
  }
};

window.logout = async function() {
  await fb.signOut(fb.auth);
};

window.nav = function(view) {
  state.view = view;
  localStorage.setItem('pickleballView', view);
  render();
};

function renderApp(view) {
  const role = state.profile?.role || 'player';
  const name = state.profile?.name || state.currentUser?.email || 'Player';
  appRoot().innerHTML = `
    <div class="wrap">
      <div class="hero"><h1>🏓 Pickleball Signup</h1><p>${role === 'coordinator' ? 'Coordinator dashboard' : 'Welcome, ' + esc(name)}</p></div>
      <div class="tabs">
        <button class="tab ${view === 'player' ? 'active' : ''}" onclick="nav('player')">Player</button>
        <button class="tab ${view === 'calendar' ? 'active' : ''}" onclick="nav('calendar')">Calendar</button>
        <button class="tab ${view === 'profile' ? 'active' : ''}" onclick="nav('profile')">Profile</button>
        ${role === 'coordinator' ? `<button class="tab ${view === 'coordinator' ? 'active' : ''}" onclick="nav('coordinator')">Coordinator</button>` : ''}
        <button class="tab" onclick="logout()">Logout</button>
      </div>
      <main id="main"></main>
      <div class="footer">GitHub Pages • Firebase connected • Shared live data</div>
    </div>`;

  if (view === 'calendar') renderCalendar();
  else if (view === 'profile') renderProfile();
  else if (view === 'coordinator' && role === 'coordinator') renderCoordinator();
  else renderPlayer();
}

function renderProfile() {
  const user = state.profile || {};
  $('#main').innerHTML = `
    <div class="card">
      <h2>Edit Profile</h2>
      <label>Name</label>
      <input id="profileName" value="${esc(user.name || '')}">
      <label>Email / Login ID</label>
      <input value="${esc(user.email || state.currentUser.email || '')}" disabled>
      <p class="small">Email changes should be handled in Firebase Authentication later. For now, update name and family members here.</p>
      <label>New Password</label>
      <div class="passwordBox">
        <input id="profilePass" type="password" placeholder="Leave blank to keep current password">
        <button class="secondary" onclick="togglePass('profilePass',this)">Show</button>
      </div>
      <button style="margin-top:12px" onclick="saveProfile()">Save Profile</button>
    </div>
    <div class="card">
      <h2>Family Members</h2>
      <div class="list">
        ${(user.children || []).map((n, i) => `<div class="person"><b>${esc(n)}</b><span><button class="secondary" onclick="editChild(${i})">Edit</button> <button class="danger" onclick="removeChild(${i})">Delete</button></span></div>`).join('') || '<p class="small">No children added yet.</p>'}
      </div>
      <div class="row"><input id="profileChild" placeholder="Add child name"><button onclick="addChildFromProfile()">Add Child</button></div>
    </div>`;
}

window.saveProfile = async function() {
  const name = $('#profileName').value.trim();
  const pass = $('#profilePass').value;
  if (!name) return alert('Name is required.');
  try {
    await fb.updateDoc(fb.doc(fb.db, 'users', state.currentUser.uid), { name });
    if (pass) await fb.updatePassword(state.currentUser, pass);
    alert('Profile updated.');
  } catch (err) {
    alert(err.message);
  }
};

window.addChildFromProfile = async function() {
  const n = $('#profileChild').value.trim();
  if (!n) return;
  const children = [...(state.profile.children || []), n];
  await fb.updateDoc(fb.doc(fb.db, 'users', state.currentUser.uid), { children });
};

window.editChild = async function(i) {
  const children = [...(state.profile.children || [])];
  const old = children[i];
  const n = prompt('Child name:', old);
  if (!n) return;
  children[i] = n;
  await fb.updateDoc(fb.doc(fb.db, 'users', state.currentUser.uid), { children });
  // Update existing signups for this child owned by this user
  for (const ev of state.events) {
    const changed = (ev.signups || []).map(s => (s.ownerUid === state.currentUser.uid && s.name === old) ? { ...s, name: n } : s);
    if (JSON.stringify(changed) !== JSON.stringify(ev.signups || [])) {
      await fb.updateDoc(fb.doc(fb.db, 'events', ev.id), { signups: changed });
    }
  }
};

window.removeChild = async function(i) {
  const children = [...(state.profile.children || [])];
  const old = children[i];
  if (!confirm('Remove this child from your profile? Existing signups for this child will also be removed.')) return;
  children.splice(i, 1);
  await fb.updateDoc(fb.doc(fb.db, 'users', state.currentUser.uid), { children });
  for (const ev of state.events) {
    const signups = (ev.signups || []).filter(s => !(s.ownerUid === state.currentUser.uid && s.name === old));
    if (signups.length !== (ev.signups || []).length) {
      await fb.updateDoc(fb.doc(fb.db, 'events', ev.id), { signups });
    }
  }
};

function renderPlayer() {
  const user = state.profile;
  const events = state.events;
  $('#main').innerHTML = `
    <div class="card"><h2>My Family</h2>
      <div class="list">${[user.name, ...(user.children || [])].filter(Boolean).map(n => `<div class="person"><b>${esc(n)}</b></div>`).join('')}</div>
      <div class="row"><input id="childName" placeholder="Add child name"><button onclick="addChildFromPlayer()">Add Child</button></div>
    </div>
    ${events.length ? events.map(eventCardPlayer).join('') : `<div class="card"><h2>No play dates yet</h2><p class="small">Waiting for coordinator to create the first event.</p></div>`}`;
}

window.addChildFromPlayer = async function() {
  const n = $('#childName').value.trim();
  if (!n) return;
  const children = [...(state.profile.children || []), n];
  await fb.updateDoc(fb.doc(fb.db, 'users', state.currentUser.uid), { children });
};

function eventCardPlayer(ev) {
  const c = eventCounts(ev);
  const st = eventStatus(ev);
  const family = [state.profile.name, ...(state.profile.children || [])].filter(Boolean);
  const mine = (ev.signups || []).filter(s => s.ownerUid === state.currentUser.uid || s.owner === state.currentUser.email);
  const closed = !canSignup(ev);
  return `
    <div class="card">
      <div class="eventTop">
        <div><div class="big">${fmtDate(ev.date)}</div><p>📍 <b>${esc(ev.location)}</b><br>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</p></div>
        <div>${c.playing >= 6 ? '<span class="badge red">6+ Ready</span>' : ''} <span class="badge ${st.cls}">${st.label}</span></div>
      </div>
      ${ev.booked ? `<div class="notice"><b>Booking Details</b><br>${esc(ev.details || 'Court booked. Details coming soon.')}</div>` : `<div class="notice warn"><b>Waiting for court reservation.</b><br>Minimum 6 playing players before booking court.</div>`}
      ${ev.feeOn ? `<div class="card" style="box-shadow:none"><b>💵 Court Fee:</b> $${esc(ev.fee || '')}<br><b>Payment:</b> ${esc(ev.payment || '')}</div>` : ''}
      <h3>Sign up / Update my family</h3>
      ${closed ? `<p class="badge red">${st.label === 'FULLY BOOKED' ? 'Fully booked' : 'Signup closed'}</p>` : family.map(n => {
        const ex = mine.find(s => s.name === n);
        return `<div class="person"><b>${esc(n)}</b><span>${ex ? esc(ex.status) : 'Not signed up'}</span><div><button class="secondary" onclick="upsertSignup('${ev.id}','${encodeURIComponent(n)}','interested')">Interested</button> <button class="success" onclick="upsertSignup('${ev.id}','${encodeURIComponent(n)}','playing')">Playing</button></div></div>`;
      }).join('')}
      <h3>Who’s Coming</h3>
      <div class="list">${(ev.signups || []).length ? ev.signups.map(s => `<div class="person"><span>${s.status === 'playing' ? '✅' : '👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.status)}</span></span></div>`).join('') : '<p class="small">No signups yet.</p>'}</div>
    </div>`;
}

window.upsertSignup = async function(eid, encodedName, status) {
  const name = decodeURIComponent(encodedName);
  const ev = state.events.find(e => e.id === eid);
  if (!ev) return;
  const signups = [...(ev.signups || [])];
  let existing = signups.find(s => (s.ownerUid === state.currentUser.uid || s.owner === state.currentUser.email) && s.name === name);
  if (!canSignup(ev) && !existing) return alert('Signup is closed or fully booked.');
  if (existing) existing.status = status;
  else signups.push({ id: uid(), ownerUid: state.currentUser.uid, owner: state.currentUser.email, name, status, checked: false, paid: false, createdAt: Date.now() });
  await fb.updateDoc(fb.doc(fb.db, 'events', eid), { signups });
};

function renderCalendar() {
  const grouped = {};
  state.events.forEach(e => { (grouped[e.date] ??= []).push(e); });
  const dates = Object.keys(grouped).sort();
  $('#main').innerHTML = `<div class="card"><h2>Calendar</h2>${dates.length ? dates.map(d => `<div class="card" style="box-shadow:none"><div class="big">${fmtDate(d)}</div>${grouped[d].map(e => { const c = eventCounts(e); return `<p>${c.playing >= 6 ? '🔴' : '⚪'} ${timeLabel(e.start)} ${esc(e.location)} — ${c.playing} playing, ${c.interested} interested • ${eventStatus(e).label}</p>`; }).join('')}</div>`).join('') : '<p class="small">No events yet.</p>'}</div>`;
}

function renderCoordinator() {
  const events = state.events;
  $('#main').innerHTML = `
    <div class="dash"><div class="stat"><span>Events</span><b>${state.events.length}</b></div><div class="stat"><span>Locations</span><b>${state.locations.length}</b></div><div class="stat"><span>Players</span><b>${Object.keys(state.users).length || '—'}</b></div></div>
    <div class="card">
      <h2>Create / Edit Event</h2>
      <input id="editId" type="hidden">
      <div class="row"><div><label>Date</label><input id="date" type="date" value="${today()}"></div><div><label>Start</label><input id="start" type="time" value="19:00"></div><div><label>End</label><input id="end" type="time" value="21:00"></div></div>
      <label>Location</label><select id="location">${state.locations.map(l => `<option>${esc(l)}</option>`).join('')}</select>
      <div class="row"><div><label>Signup Cutoff</label><select id="cutoff"><option value="open">Keep open until event</option><option value="1">Close 1 hour before</option><option value="2">Close 2 hours before</option><option value="4">Close 4 hours before</option></select></div><div><label>Max players</label><input id="max" type="number" value="12"></div></div>
      <div class="toggleLine"><input id="booked" type="checkbox"><b>Court Booked?</b></div>
      <div class="toggleLine"><input id="closed" type="checkbox"><b>Close Signups?</b></div>
      <div class="toggleLine"><input id="full" type="checkbox"><b>Mark Fully Booked?</b></div>
      <label>Booking Details</label><textarea id="details" placeholder="Court #, parking, arrival time, what to bring..."></textarea>
      <div class="toggleLine"><input id="feeOn" type="checkbox"><b>Collect court fee?</b></div>
      <div class="row"><input id="fee" placeholder="Fee e.g. 5"><input id="payment" placeholder="Venmo/Zelle/Cash info"></div>
      <div class="row" style="margin-top:12px"><button onclick="saveEvent()">Save Event</button><button class="secondary" onclick="clearEventForm()">Clear</button></div>
    </div>
    <div class="card"><h2>Events</h2>${events.length ? events.map(eventCardCoord).join('') : '<p class="small">No events yet.</p>'}</div>
    <div class="card"><h2>Manage Locations</h2><div class="list">${state.locations.map((l, i) => `<div class="person"><b>${esc(l)}</b><span><button class="secondary" onclick="renameLocation(${i})">Edit</button> <button class="danger" onclick="deleteLocation(${i})">Delete</button></span></div>`).join('')}</div><div class="row"><input id="newLocation" placeholder="New location"><button onclick="addLocation()">Add Location</button></div></div>`;
}

window.saveEvent = async function() {
  const id = $('#editId').value;
  const data = {
    date: $('#date').value,
    start: $('#start').value,
    end: $('#end').value,
    location: $('#location').value,
    cutoff: $('#cutoff').value,
    max: $('#max').value,
    booked: $('#booked').checked,
    closed: $('#closed').checked,
    full: $('#full').checked,
    details: $('#details').value,
    feeOn: $('#feeOn').checked,
    fee: $('#fee').value,
    payment: $('#payment').value
  };
  if (!data.date || !data.start || !data.end || !data.location) return alert('Complete date, time, and location.');
  if (id) {
    await fb.updateDoc(fb.doc(fb.db, 'events', id), data);
  } else {
    await fb.addDoc(fb.collection(fb.db, 'events'), { ...data, signups: [], createdAt: fb.serverTimestamp() });
  }
};

function eventCardCoord(ev) {
  const c = eventCounts(ev);
  return `<div class="card" style="box-shadow:none"><div class="eventTop"><div><div class="big">${fmtDate(ev.date)} — ${esc(ev.location)}</div><p>${timeLabel(ev.start)} - ${timeLabel(ev.end)} • ${c.playing} playing • ${c.interested} interested</p></div><div><span class="badge ${eventStatus(ev).cls}">${eventStatus(ev).label}</span></div></div><div class="row"><button class="secondary" onclick="editEvent('${ev.id}')">Edit</button><button class="danger" onclick="deleteEvent('${ev.id}')">Delete</button><button onclick="exportCsv('${ev.id}')">Export CSV</button></div><h3>Players</h3>${(ev.signups || []).length ? ev.signups.map(s => `<div class="person"><span>${s.status === 'playing' ? '✅' : '👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.owner || '')}</span></span><span><button class="secondary" onclick="toggleCheck('${ev.id}','${s.id}')">${s.checked ? 'Checked In' : 'Check In'}</button> <button class="danger" onclick="removeSignup('${ev.id}','${s.id}')">Remove</button></span></div>`).join('') : '<p class="small">No signups yet.</p>'}</div>`;
}

window.editEvent = function(id) {
  const e = state.events.find(x => x.id === id);
  if (!e) return;
  ['date', 'start', 'end', 'location', 'cutoff', 'max', 'details', 'fee', 'payment'].forEach(k => {
    const el = $('#' + k);
    if (el) el.value = e[k] || '';
  });
  $('#editId').value = e.id;
  $('#booked').checked = !!e.booked;
  $('#closed').checked = !!e.closed;
  $('#full').checked = !!e.full;
  $('#feeOn').checked = !!e.feeOn;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearEventForm = function() { renderCoordinator(); };

window.deleteEvent = async function(id) {
  if (confirm('Delete this event?')) await fb.deleteDoc(fb.doc(fb.db, 'events', id));
};

window.removeSignup = async function(eid, sid) {
  const ev = state.events.find(e => e.id === eid);
  const signups = (ev.signups || []).filter(s => s.id !== sid);
  await fb.updateDoc(fb.doc(fb.db, 'events', eid), { signups });
};

window.toggleCheck = async function(eid, sid) {
  const ev = state.events.find(e => e.id === eid);
  const signups = (ev.signups || []).map(s => s.id === sid ? { ...s, checked: !s.checked } : s);
  await fb.updateDoc(fb.doc(fb.db, 'events', eid), { signups });
};

window.addLocation = async function() {
  const v = $('#newLocation').value.trim();
  if (!v) return;
  await fb.addDoc(fb.collection(fb.db, 'locations'), { name: v, createdAt: fb.serverTimestamp() });
};

window.renameLocation = async function(i) {
  const old = state.locations[i];
  const v = prompt('New location name:', old);
  if (!v) return;
  // Update matching location doc if found, otherwise create new one.
  const snap = await fb.getDocs(fb.collection(fb.db, 'locations'));
  const docMatch = snap.docs.find(d => (d.data().name || d.id) === old);
  if (docMatch) await fb.updateDoc(fb.doc(fb.db, 'locations', docMatch.id), { name: v });
  for (const ev of state.events.filter(e => e.location === old)) {
    await fb.updateDoc(fb.doc(fb.db, 'events', ev.id), { location: v });
  }
};

window.deleteLocation = async function(i) {
  if (state.locations.length <= 1) return alert('Keep at least one location.');
  const old = state.locations[i];
  if (!confirm('Delete location?')) return;
  const snap = await fb.getDocs(fb.collection(fb.db, 'locations'));
  const docMatch = snap.docs.find(d => (d.data().name || d.id) === old);
  if (docMatch) await fb.deleteDoc(fb.doc(fb.db, 'locations', docMatch.id));
};

window.exportCsv = function(id) {
  const e = state.events.find(x => x.id === id);
  let csv = 'Name,Status,Email,Checked In,Paid\n' + (e.signups || []).map(s => `"${s.name}","${s.status}","${s.owner || ''}","${s.checked ? 'yes' : 'no'}","${s.paid ? 'yes' : 'no'}"`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pickleball-${e.date}-${e.location}.csv`;
  a.click();
};

initFirebase();
