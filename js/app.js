/* Pickleball Signup v2.0 — Firebase/Firestore version for GitHub Pages */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxDO7aD88z1dEyb9T1H6TJZivqAh82JYc",
  authDomain: "pickleballsignup-64eda.firebaseapp.com",
  projectId: "pickleballsignup-64eda",
  storageBucket: "pickleballsignup-64eda.firebasestorage.app",
  messagingSenderId: "39124520969",
  appId: "1:39124520969:web:e33a4bd5bb52787eab28d8"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const OWNER_EMAIL = "marknjuliano@gmail.com";
const $ = sel => document.querySelector(sel);
const app = $('#app');

let currentUser = null;
let profile = null;
let sessionView = localStorage.getItem('pickleballViewV2') || 'player';
let state = { users: {}, locations: [], events: [], connected: false };
let unsubscribers = [];

function esc(s=''){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function uid(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4)}
function today(){return new Date().toISOString().slice(0,10)}
function fmtDate(d){return new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
function timeLabel(t){if(!t)return ''; let [h,m]=t.split(':').map(Number), am=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${String(m).padStart(2,'0')} ${am}`}
function isOwner(){return currentUser?.email?.toLowerCase() === OWNER_EMAIL}
function isCoordinator(){return isOwner() || profile?.role === 'coordinator'}
function eventCounts(ev){const signups=ev.signups||[];return {playing:signups.filter(s=>s.status==='playing').length, interested:signups.filter(s=>s.status==='interested').length,total:signups.length}}
function isClosed(ev){if(ev.cutoff==='open')return false; const hrs=Number(ev.cutoff||0); if(!ev.date||!ev.start)return false; return new Date()>=new Date(`${ev.date}T${ev.start}:00`)-hrs*3600000;}
function render(){ if(!currentUser) return renderLogin(); renderApp(sessionView); }
function setView(view){sessionView=view; localStorage.setItem('pickleballViewV2', view); render();}
function togglePass(id,btn){const el=document.getElementById(id);el.type=el.type==='password'?'text':'password';btn.textContent=el.type==='password'?'Show':'Hide'}
window.togglePass = togglePass;
window.nav = setView;

function renderLogin(){
  app.innerHTML=`<div class="wrap login"><div style="width:100%">
    <div class="hero"><h1>🏓 Pickleball Signup</h1><p>Firebase online version. Login or create your account.</p></div>
    <div class="card"><h2>Login</h2>
      <label>Email</label><input id="email" type="email" placeholder="you@email.com" autocomplete="email">
      <label>Password</label><div class="passwordBox"><input id="pass" type="password" placeholder="Password" autocomplete="current-password"><button class="secondary" onclick="togglePass('pass',this)">Show</button></div>
      <div class="row" style="margin-top:14px"><button onclick="loginUser()">Login</button><button class="secondary" onclick="showCreateAccount()">Create Account</button></div>
      <p class="small">Use your Firebase user email/password. Admin: ${OWNER_EMAIL}</p>
    </div>
  </div></div>`;
}
window.showCreateAccount = function(){
  app.innerHTML=`<div class="wrap login"><div style="width:100%">
    <div class="hero"><h1>🏓 Pickleball Signup</h1><p>Create your player account.</p></div>
    <div class="card"><h2>Create Account</h2>
      <label>Your Name</label><input id="name" placeholder="Full name">
      <label>Email</label><input id="email" type="email" placeholder="you@email.com" autocomplete="email">
      <label>Password</label><div class="passwordBox"><input id="pass" type="password" placeholder="Password"><button class="secondary" onclick="togglePass('pass',this)">Show</button></div>
      <div class="row" style="margin-top:14px"><button onclick="createAccount()">Create Account</button><button class="secondary" onclick="render()">Back to Login</button></div>
    </div>
  </div></div>`;
}
window.loginUser = async function(){
  const email=$('#email').value.trim().toLowerCase(), pass=$('#pass').value;
  if(!email||!pass)return alert('Enter email and password.');
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){ alert('Login failed: '+e.message); }
}
window.createAccount = async function(){
  const name=$('#name').value.trim(), email=$('#email').value.trim().toLowerCase(), pass=$('#pass').value;
  if(!name||!email||!pass)return alert('Enter name, email, and password.');
  try{
    const cred = await createUserWithEmailAndPassword(auth,email,pass);
    await setDoc(doc(db,'users',cred.user.uid), {name,email,children:[],role:email===OWNER_EMAIL?'coordinator':'player',createdAt:serverTimestamp()});
  }catch(e){ alert('Create account failed: '+e.message); }
}
window.logout = async function(){ await signOut(auth); }

async function ensureProfile(user){
  const ref = doc(db,'users',user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    const name = user.email.split('@')[0];
    await setDoc(ref,{name,email:user.email,children:[],role:isOwner()?'coordinator':'player',createdAt:serverTimestamp()});
    return {name,email:user.email,children:[],role:isOwner()?'coordinator':'player'};
  }
  const p = snap.data();
  if(isOwner() && p.role !== 'coordinator') await updateDoc(ref,{role:'coordinator'});
  return {...p, role:isOwner()?'coordinator':p.role};
}
async function seedLocationsIfEmpty(){
  const locsRef = collection(db,'locations');
  if(state.locations.length) return;
  const defaults = ['DinkHouse','Liberty Park','Cerritos Courts'];
  await Promise.all(defaults.map(name=>addDoc(locsRef,{name,createdAt:serverTimestamp()})));
}
function startListeners(){
  unsubscribers.forEach(u=>u()); unsubscribers=[];
  unsubscribers.push(onSnapshot(query(collection(db,'users'), orderBy('name')), snap=>{
    state.users={};
    snap.forEach(d=>state.users[d.id]={id:d.id,...d.data()});
    state.connected=true; render();
  }));
  unsubscribers.push(onSnapshot(query(collection(db,'locations'), orderBy('name')), async snap=>{
    state.locations=[];
    snap.forEach(d=>state.locations.push({id:d.id,...d.data()}));
    if(currentUser && isCoordinator() && state.locations.length===0) await seedLocationsIfEmpty();
    state.connected=true; render();
  }));
  unsubscribers.push(onSnapshot(query(collection(db,'events'), orderBy('date'), orderBy('start')), snap=>{
    state.events=[];
    snap.forEach(d=>state.events.push({id:d.id,...d.data(),signups:d.data().signups||[]}));
    state.connected=true; render();
  }));
}

function renderApp(view){
  const role = isCoordinator() ? 'coordinator' : 'player';
  app.innerHTML=`<div class="wrap">
    <div class="hero"><h1>🏓 Pickleball Signup</h1><p>${role==='coordinator'?'Coordinator dashboard':'Welcome, '+esc(profile?.name||'Player')}</p></div>
    <div class="tabs">
      <button class="tab ${view==='player'?'active':''}" onclick="nav('player')">Player</button>
      <button class="tab ${view==='calendar'?'active':''}" onclick="nav('calendar')">Calendar</button>
      ${role==='coordinator'?`<button class="tab ${view==='coordinator'?'active':''}" onclick="nav('coordinator')">Coordinator</button>`:''}
      <button class="tab" onclick="logout()">Logout</button>
    </div>
    <main id="main"></main>
    <div class="footer">GitHub Pages v2.0 • ${state.connected?'🟢 Connected to Firebase':'🔴 Connecting'} • Online database</div>
  </div>`;
  if(view==='calendar')renderCalendar(); else if(view==='coordinator'&&role==='coordinator')renderCoordinator(); else renderPlayer();
}
function renderPlayer(){
  const events=[...state.events].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const family=[profile?.name,...(profile?.children||[])].filter(Boolean);
  $('#main').innerHTML=`<div class="card"><h2>My Family</h2>
    <div class="list">${family.map(n=>`<div class="person"><b>${esc(n)}</b></div>`).join('')}</div>
    <div class="row"><input id="childName" placeholder="Add child name"><button onclick="addChild()">Add Child</button></div>
  </div>
  ${events.length?events.map(eventCardPlayer).join(''):`<div class="card"><h2>No play dates yet</h2><p class="small">Waiting for coordinator to create the first event.</p></div>`}`
}
window.addChild = async function(){
  const n=$('#childName').value.trim(); if(!n)return;
  const children=[...(profile.children||[]), n].sort((a,b)=>a.localeCompare(b));
  await updateDoc(doc(db,'users',currentUser.uid), {children});
  profile.children=children; renderPlayer();
}
function eventCardPlayer(ev){
  const c=eventCounts(ev), closed=isClosed(ev), mine=(ev.signups||[]).filter(s=>s.owner===currentUser.uid), family=[profile.name,...(profile.children||[])].filter(Boolean);
  return `<div class="card"><div class="eventTop"><div><div class="big">${fmtDate(ev.date)}</div><p>📍 <b>${esc(ev.location)}</b><br>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</p></div><div>${c.playing>=6?'<span class="badge red">6+ Ready</span>':''} ${ev.booked?'<span class="badge green">BOOKED</span>':'<span class="badge yellow">Waiting</span>'}</div></div>${ev.booked?`<div class="notice"><b>Booking Details</b><br>${esc(ev.details||'Court booked. Details coming soon.')}</div>`:`<div class="notice warn"><b>Waiting for court reservation.</b><br>Minimum 6 playing players before booking court.</div>`}${ev.feeOn?`<div class="card" style="box-shadow:none"><b>💵 Court Fee:</b> $${esc(ev.fee||'')}<br><b>Payment:</b> ${esc(ev.payment||'')}</div>`:''}<h3>Sign up / Update my family</h3>${closed?'<p class="badge red">Signup closed</p>':family.map(n=>{const ex=mine.find(s=>s.name===n);return `<div class="person"><b>${esc(n)}</b><span>${ex?esc(ex.status):'Not signed up'}</span><div><button class="secondary" onclick="upsertSignup('${ev.id}','${esc(n)}','interested')">Interested</button> <button class="success" onclick="upsertSignup('${ev.id}','${esc(n)}','playing')">Playing</button> ${ex?`<button class="danger" onclick="cancelSignup('${ev.id}','${esc(n)}')">Cancel</button>`:''}</div></div>`}).join('')}<h3>Who’s Coming</h3><div class="list">${(ev.signups||[]).length?ev.signups.sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<div class="person"><span>${s.status==='playing'?'✅':'👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.status)}</span></span></div>`).join(''):'<p class="small">No signups yet.</p>'}</div></div>`
}
window.upsertSignup = async function(eid,name,status){
  const ev=state.events.find(e=>e.id===eid); const signups=[...(ev.signups||[])];
  let s=signups.find(x=>x.owner===currentUser.uid&&x.name===name);
  if(s){s.status=status; s.updatedAt=new Date().toISOString();}
  else signups.push({id:uid(),owner:currentUser.uid,email:currentUser.email,name,status,checked:false,createdAt:new Date().toISOString()});
  signups.sort((a,b)=>a.name.localeCompare(b.name));
  await updateDoc(doc(db,'events',eid), {signups});
}
window.cancelSignup = async function(eid,name){
  const ev=state.events.find(e=>e.id===eid);
  const signups=(ev.signups||[]).filter(s=>!(s.owner===currentUser.uid&&s.name===name));
  await updateDoc(doc(db,'events',eid), {signups});
}
function renderCalendar(){
  const grouped={}; state.events.forEach(e=>{(grouped[e.date]??=[]).push(e)});
  $('#main').innerHTML=`<div class="card"><h2>Calendar</h2>${Object.keys(grouped).sort().length?Object.keys(grouped).sort().map(d=>`<div class="card" style="box-shadow:none"><div class="big">${fmtDate(d)}</div>${grouped[d].map(e=>{const c=eventCounts(e);return `<p>${c.playing>=6?'🔴':'⚪'} ${timeLabel(e.start)} ${esc(e.location)} — ${c.playing} playing, ${c.interested} interested ${e.booked?'✅ Booked':''}</p>`}).join('')}</div>`).join(''):'<p class="small">No events yet.</p>'}</div>`
}
function renderCoordinator(){
  const players=Object.values(state.users).filter(u=>u.role!=='coordinator').sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const events=[...state.events].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  $('#main').innerHTML=`<div class="dash"><div class="stat"><span>Events</span><b>${state.events.length}</b></div><div class="stat"><span>Locations</span><b>${state.locations.length}</b></div><div class="stat"><span>Players</span><b>${players.length}</b></div></div>
  <div class="card"><h2>Create / Edit Event</h2><input id="editId" type="hidden"><div class="row"><div><label>Date</label><input id="date" type="date" value="${today()}"></div><div><label>Start</label><input id="start" type="time" value="19:00"></div><div><label>End</label><input id="end" type="time" value="21:00"></div></div><label>Location</label><select id="location">${state.locations.map(l=>`<option>${esc(l.name)}</option>`).join('')}</select><div class="row"><div><label>Signup Cutoff</label><select id="cutoff"><option value="open">Keep open until event</option><option value="1">Close 1 hour before</option><option value="2">Close 2 hours before</option><option value="4">Close 4 hours before</option></select></div><div><label>Max players</label><input id="max" type="number" value="12"></div></div><div class="toggleLine"><input id="booked" type="checkbox"><b>Court Booked?</b></div><label>Booking Details</label><textarea id="details" placeholder="Court #, parking, arrival time, what to bring..."></textarea><div class="toggleLine"><input id="feeOn" type="checkbox"><b>Collect court fee?</b></div><div class="row"><input id="fee" placeholder="Fee e.g. 5"><input id="payment" placeholder="Venmo/Zelle/Cash info"></div><div class="row" style="margin-top:12px"><button onclick="saveEvent()">Save Event</button><button class="secondary" onclick="clearEventForm()">Clear</button></div></div>
  <div class="card"><h2>Events</h2>${events.length?events.map(eventCardCoord).join(''):'<p class="small">No events yet.</p>'}</div>
  <div class="card"><h2>Manage Locations</h2><div class="list">${state.locations.map(l=>`<div class="person"><b>${esc(l.name)}</b><span><button class="secondary" onclick="renameLocation('${l.id}','${esc(l.name)}')">Edit</button> <button class="danger" onclick="deleteLocation('${l.id}')">Delete</button></span></div>`).join('')}</div><div class="row"><input id="newLocation" placeholder="New location"><button onclick="addLocation()">Add Location</button></div></div>
  <div class="card"><h2>Registered Players</h2><div class="list">${players.length?players.map(u=>`<div class="person"><span><b>${esc(u.name)}</b><br><span class="small">${esc(u.email)}</span></span></div>`).join(''):'<p class="small">No player accounts yet.</p>'}</div></div>`;
}
window.saveEvent = async function(){
  const id=$('#editId').value;
  const data={date:$('#date').value,start:$('#start').value,end:$('#end').value,location:$('#location').value,cutoff:$('#cutoff').value,max:$('#max').value,booked:$('#booked').checked,details:$('#details').value,feeOn:$('#feeOn').checked,fee:$('#fee').value,payment:$('#payment').value,updatedAt:serverTimestamp()};
  if(!data.date||!data.start||!data.end||!data.location)return alert('Complete date, time, and location.');
  if(id) await updateDoc(doc(db,'events',id), data);
  else await addDoc(collection(db,'events'), {...data,signups:[],createdAt:serverTimestamp()});
  renderCoordinator();
}
function eventCardCoord(ev){const c=eventCounts(ev);return `<div class="card" style="box-shadow:none"><div class="eventTop"><div><div class="big">${fmtDate(ev.date)} — ${esc(ev.location)}</div><p>${timeLabel(ev.start)} - ${timeLabel(ev.end)} • ${c.playing} playing • ${c.interested} interested</p></div><div>${ev.booked?'<span class="badge green">BOOKED</span>':'<span class="badge yellow">Waiting</span>'}</div></div><div class="row"><button class="secondary" onclick="editEvent('${ev.id}')">Edit</button><button class="danger" onclick="deleteEvent('${ev.id}')">Delete</button><button onclick="exportCsv('${ev.id}')">Export CSV</button></div><h3>Players</h3>${(ev.signups||[]).length?ev.signups.sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<div class="person"><span>${s.status==='playing'?'✅':'👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.email||'')}</span></span><span><button class="secondary" onclick="toggleCheck('${ev.id}','${s.id}')">${s.checked?'Checked In':'Check In'}</button> <button class="danger" onclick="removeSignup('${ev.id}','${s.id}')">Remove</button></span></div>`).join(''):'<p class="small">No signups yet.</p>'}</div>`}
window.editEvent = function(id){const e=state.events.find(x=>x.id===id);['date','start','end','location','cutoff','max','details','fee','payment'].forEach(k=>{if($('#'+k))$('#'+k).value=e[k]||''});$('#editId').value=e.id;$('#booked').checked=!!e.booked;$('#feeOn').checked=!!e.feeOn;window.scrollTo({top:0,behavior:'smooth'});}
window.clearEventForm = function(){renderCoordinator()}
window.deleteEvent = async function(id){if(confirm('Delete this event?')) await deleteDoc(doc(db,'events',id));}
window.removeSignup = async function(eid,sid){const e=state.events.find(x=>x.id===eid);const signups=(e.signups||[]).filter(s=>s.id!==sid);await updateDoc(doc(db,'events',eid),{signups});}
window.toggleCheck = async function(eid,sid){const e=state.events.find(x=>x.id===eid);const signups=(e.signups||[]).map(s=>s.id===sid?{...s,checked:!s.checked}:s);await updateDoc(doc(db,'events',eid),{signups});}
window.addLocation = async function(){const name=$('#newLocation').value.trim(); if(!name)return; await addDoc(collection(db,'locations'),{name,createdAt:serverTimestamp()});}
window.renameLocation = async function(id,oldName){const name=prompt('New location name:',oldName); if(!name)return; await updateDoc(doc(db,'locations',id),{name}); for(const e of state.events.filter(e=>e.location===oldName)){await updateDoc(doc(db,'events',e.id),{location:name});}}
window.deleteLocation = async function(id){if(state.locations.length<=1)return alert('Keep at least one location.'); if(confirm('Delete location?')) await deleteDoc(doc(db,'locations',id));}
window.exportCsv = function(id){const e=state.events.find(x=>x.id===id);let csv='Name,Status,Email,Checked In\n'+(e.signups||[]).map(s=>`"${s.name}","${s.status}","${s.email||''}","${s.checked?'yes':'no'}"`).join('\n');const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pickleball-${e.date}-${e.location}.csv`;a.click();}

onAuthStateChanged(auth, async user=>{
  currentUser = user;
  profile = null;
  unsubscribers.forEach(u=>u()); unsubscribers=[];
  if(!user){ renderLogin(); return; }
  profile = await ensureProfile(user);
  startListeners();
  render();
});
renderLogin();
