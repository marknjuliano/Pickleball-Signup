import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, onAuthStateChanged, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  onSnapshot, serverTimestamp, query, orderBy, arrayUnion, limit
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = sel => document.querySelector(sel);
const appEl = $('#app');
const DEFAULT_LOCATIONS = ['DinkHouse','Liberty Park','Cerritos Courts'];
let state = { user:null, profile:null, events:[], locations:[], notifications:[], showNotifications:false, view:localStorage.getItem('pickleballView')||'player', ready:false };
let unsubscribers = [];


function friendlyFirebaseError(error){
  const code = error?.code || '';
  const map = {
    'auth/email-already-in-use': 'This email is already registered. Please log in or tap Forgot Password.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/missing-password': 'Please enter your password.',
    'auth/invalid-credential': 'Email or password is incorrect. Please try again.',
    'auth/wrong-password': 'Password is incorrect. Please try again.',
    'auth/user-not-found': 'No account found with this email. Please create an account first.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'permission-denied': 'You do not have permission to do that. Please contact the coordinator.'
  };
  return map[code] || (error?.message ? error.message.replace('Firebase: Error ', '').replace(/[()]/g, '') : 'Something went wrong. Please try again.');
}

const esc = (s='') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const idSafe = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const today = () => new Date().toISOString().slice(0,10);
function fmtDate(d){ if(!d) return ''; return new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
function timeLabel(t){ if(!t)return ''; let [h,m]=String(t).split(':').map(Number); if(Number.isNaN(h)) return t; let am=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${String(m||0).padStart(2,'0')} ${am}`; }
function normalizeChildren(c){ if(Array.isArray(c)) return c.filter(Boolean); if(c && typeof c === 'object') return Object.values(c).filter(Boolean); return []; }
function eventCounts(ev){ const signups=Array.isArray(ev.signups)?ev.signups:[]; return {playing:signups.filter(s=>s.status==='playing').length, interested:signups.filter(s=>s.status==='interested').length,total:signups.length}; }
function isClosedByTime(ev){ if(ev.cutoff==='open') return false; const hrs=Number(ev.cutoff||0); if(!hrs||!ev.date||!ev.start) return false; return Date.now() >= new Date(`${ev.date}T${ev.start}:00`).getTime() - hrs*3600000; }
function selectedStatuses(ev={}){
  const c=eventCounts(ev);
  const statuses=[];
  if(ev.booked) statuses.push({key:'booked',label:'COURT BOOKED',cls:'green',icon:'✅'});
  if(ev.closed) statuses.push({key:'renovation',label:'CLOSED FOR RENOVATION',cls:'red',icon:'🚧'});
  if(ev.closedEvent) statuses.push({key:'closedEvent',label:'CLOSED FOR EVENT',cls:'blue',icon:'🎉'});
  if(ev.cancelled) statuses.push({key:'cancelled',label:'CANCELLED',cls:'red',icon:'❌'});
  if(ev.full || (Number(ev.max||0)>0 && c.playing>=Number(ev.max))) statuses.push({key:'full',label:'FULLY BOOKED',cls:'red',icon:'👥'});
  return statuses;
}
function statusBadges(ev){
  const list=selectedStatuses(ev);
  return list.length ? list.map(s=>`<span class="badge ${s.cls}">${s.icon} ${s.label}</span>`).join('') : `<span class="badge yellow">Waiting</span>`;
}
function eventStatus(ev){ const list=selectedStatuses(ev); return list[0] || {key:'waiting',label:'Waiting',cls:'yellow',icon:'⏳'}; }
function canSignup(ev){ const closed = ev.closed || ev.closedEvent || ev.cancelled || ev.full; const c=eventCounts(ev); return !closed && !(Number(ev.max||0)>0 && c.playing>=Number(ev.max)) && !isClosedByTime(ev); }
function cleanup(){ unsubscribers.forEach(u=>u&&u()); unsubscribers=[]; }
function nav(view){ state.view=view; localStorage.setItem('pickleballView',view); render(); }
window.nav = nav;

onAuthStateChanged(auth, async user => {
  cleanup(); state.user=user; state.profile=null; state.events=[]; state.locations=[]; state.notifications=[]; state.showNotifications=false; state.ready=false;
  if(!user){ renderLogin(); return; }
  await ensureProfile(user);
  startListeners();
});

async function ensureProfile(user){
  const ref=doc(db,'users',user.uid); let snap=await getDoc(ref);
  if(!snap.exists()){
    const fallbackName = user.displayName || user.email.split('@')[0];
    await setDoc(ref,{email:user.email,name:fallbackName,role:'player',children:[],createdAt:serverTimestamp()},{merge:true});
    snap=await getDoc(ref);
  }
  state.profile={id:user.uid,...snap.data(),children:normalizeChildren(snap.data().children)};
}
function startListeners(){
  const evQ=query(collection(db,'events'), orderBy('date'));
  unsubscribers.push(onSnapshot(evQ, snap=>{ state.events=snap.docs.map(d=>({id:d.id,...d.data(),signups:Array.isArray(d.data().signups)?d.data().signups:[]})); state.ready=true; render(); }, err=>renderError(err)));
  unsubscribers.push(onSnapshot(collection(db,'locations'), snap=>{ state.locations=snap.docs.map(d=>({id:d.id,...d.data()})); render(); }, err=>console.error(err)));
  const notifQ=query(collection(db,'notifications'), orderBy('createdAt','desc'), limit(50));
  unsubscribers.push(onSnapshot(notifQ, snap=>{ state.notifications=snap.docs.map(d=>({id:d.id,...d.data(),readBy:Array.isArray(d.data().readBy)?d.data().readBy:[]})); render(); }, err=>console.error(err)));
  unsubscribers.push(onSnapshot(doc(db,'users',state.user.uid), snap=>{ if(snap.exists()){state.profile={id:state.user.uid,...snap.data(),children:normalizeChildren(snap.data().children)}; render();} }));
}
function renderError(err){ appEl.innerHTML=`<div class="wrap"><div class="card"><h2>Firebase Error</h2><div class="error">${esc(err.message)}</div><p class="small">Check Firebase config and Firestore rules.</p></div></div>`; }
function render(){ if(!state.user) return renderLogin(); if(!state.ready) return appEl.innerHTML='<div class="wrap"><div class="card"><h2>Loading...</h2></div></div>'; renderApp(); }
function renderLogin(){
  appEl.innerHTML=`<div class="wrap login"><div><div class="hero"><h1>🏓 Pickleball Signup</h1><p>Login or create your player account.</p></div><div class="card"><h2>Login</h2><label>Email</label><input id="email" type="email" autocomplete="email"><label>Password</label><div class="passwordBox"><input id="pass" type="password" autocomplete="current-password"><button class="secondary" onclick="togglePass('pass',this)">Show</button></div><div class="row" style="margin-top:14px"><button onclick="login()">Login</button><button class="secondary" onclick="createAccount()">Create Account</button><button class="ghost" onclick="forgotPassword()">Forgot Password</button></div><p class="small">First time? Enter email/password, then Create Account. You can edit your name after login.</p></div></div></div>`;
}
window.togglePass=(id,btn)=>{const el=document.getElementById(id); el.type=el.type==='password'?'text':'password'; btn.textContent=el.type==='password'?'Show':'Hide';};
window.login=async()=>{try{await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#pass').value);}catch(e){alert(friendlyFirebaseError(e));}};
window.createAccount=async()=>{try{const email=$('#email').value.trim(); const pass=$('#pass').value; if(!email||!pass)return alert('Enter email and password.'); await createUserWithEmailAndPassword(auth,email,pass);}catch(e){alert(friendlyFirebaseError(e));}};
window.forgotPassword=async()=>{const email=$('#email')?.value.trim()||prompt('Enter your email'); if(!email)return; try{await sendPasswordResetEmail(auth,email); alert('Password reset email sent. Please check your inbox or spam folder.');}catch(e){alert(friendlyFirebaseError(e));}};
window.logout=async()=>{await signOut(auth);};

function isCoordinator(){ return state.profile?.role === 'coordinator' || state.profile?.role === 'admin'; }

function unreadNotifications(){ return state.notifications.filter(n=>!(Array.isArray(n.readBy)&&n.readBy.includes(state.user.uid))).length; }
function notificationIcon(type){ return {booked:'📢',full:'👥',renovation:'🚧',closedEvent:'🎉',cancelled:'❌',event:'🎉',info:'🔔'}[type] || '🔔'; }
function notificationTime(n){
  try{
    const d = n.createdAt?.toDate ? n.createdAt.toDate() : null;
    if(!d) return '';
    const diff = Date.now()-d.getTime();
    if(diff < 60000) return 'Just now';
    if(diff < 3600000) return Math.floor(diff/60000)+' min ago';
    if(diff < 86400000) return Math.floor(diff/3600000)+' hr ago';
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }catch(e){return '';}
}
function renderNotificationButton(){
  const count=unreadNotifications();
  return `<div class="notifWrap"><button class="notifBtn ${count?'hasUnread':''}" title="Notifications" onclick="toggleNotifications()">🔔${count?` <span>${count}</span>`:''}</button>${renderNotificationDrawer()}</div>`;
}
function renderNotificationDrawer(){
  if(!state.showNotifications) return '';
  const items=state.notifications.length?state.notifications.map(n=>{
    const unread=!(Array.isArray(n.readBy)&&n.readBy.includes(state.user.uid));
    return `<div class="notifItem ${unread?'unread':''} type-${esc(n.type||'info')}"><div class="notifIcon">${notificationIcon(n.type)}</div><div class="notifBody"><b>${esc(n.title||'Notification')}</b><p>${esc(n.message||'')}</p><small>${notificationTime(n)}${unread?' • New':''}</small></div></div>`;
  }).join(''):'<p class="small">No notifications yet.</p>';
  return `<div class="notifPanel"><div class="notifHeader"><h3>Notifications</h3><div class="notifActions"><button class="secondary" onclick="markNotificationsRead()" ${unreadNotifications()?'':'disabled'}>Mark all read</button><button class="ghost closeNotif" onclick="toggleNotifications()">✕</button></div></div>${items}</div>`;
}
window.toggleNotifications=()=>{ state.showNotifications=!state.showNotifications; render(); };
window.markNotificationsRead=async()=>{
  const unread=state.notifications.filter(n=>!(Array.isArray(n.readBy)&&n.readBy.includes(state.user.uid)));
  await Promise.all(unread.map(n=>updateDoc(doc(db,'notifications',n.id),{readBy:arrayUnion(state.user.uid)})));
  state.showNotifications=false;
};
async function createNotification({title,message,type='info',eventId=''}){
  try{
    await addDoc(collection(db,'notifications'),{title,message,type,eventId,target:'all',readBy:[],createdAt:serverTimestamp()});
  }catch(e){ console.error('Notification failed',e); }
}
function statusNotificationData(ev,data,isNew){
  const dateLabel = fmtDate(data.date||ev?.date||'');
  const time = `${timeLabel(data.start||ev?.start)} - ${timeLabel(data.end||ev?.end)}`;
  const loc = data.location||ev?.location||'Pickleball';
  if(isNew) return {type:'event',title:`New play date added: ${loc}`,message:`${dateLabel} • ${time}`,eventId:''};
  const keys=[
    ['booked','booked',`${loc} is BOOKED`,`${dateLabel} • ${time}. ${data.details||ev?.details||''}`],
    ['full','full',`${loc} is FULLY BOOKED`,`${dateLabel} • ${time}.`],
    ['closed','renovation',`${loc} Closed for Renovation`,`${data.details||ev?.details||'This location/event is temporarily closed for renovation.'}`],
    ['closedEvent','closedEvent',`${loc} Closed for Event`,`${data.details||ev?.details||'This location is closed for a scheduled event.'}`],
    ['cancelled','cancelled',`${loc} Event Cancelled`,`${data.details||ev?.details||'This play date has been cancelled.'}`]
  ];
  for (const [field,type,title,message] of keys){
    if(!ev?.[field] && data[field]) return {type,title,message,eventId:ev?.id||''};
  }
  return null;
}
function renderApp(){
 const role=isCoordinator()?'Coordinator':'Player';
 appEl.innerHTML=`<div class="wrap"><div class="hero heroWithBell"><div><h1>🏓 Pickleball Signup</h1><p>${role}: ${esc(state.profile?.name||state.user.email)}</p></div>${renderNotificationButton()}</div><div class="tabs"><button class="tab ${state.view==='player'?'active':''}" onclick="nav('player')">Player</button><button class="tab ${state.view==='calendar'?'active':''}" onclick="nav('calendar')">Calendar</button><button class="tab ${state.view==='profile'?'active':''}" onclick="nav('profile')">Profile</button>${isCoordinator()?`<button class="tab ${state.view==='coordinator'?'active':''}" onclick="nav('coordinator')">Coordinator</button>`:''}<button class="tab" onclick="logout()">Logout</button></div><main id="main"></main><div class="footer">Firebase connected • Shared live data</div></div>`;
 if(state.view==='calendar') renderCalendar(); else if(state.view==='profile') renderProfile(); else if(state.view==='coordinator' && isCoordinator()) renderCoordinator(); else renderPlayer();
}
function eventCardPlayer(ev){
 const c=eventCounts(ev), st=eventStatus(ev), signups=Array.isArray(ev.signups)?ev.signups:[], mine=signups.filter(s=>s.owner===state.user.uid || s.email===state.user.email), family=[state.profile.name,...normalizeChildren(state.profile.children)].filter(Boolean), closed=!canSignup(ev);
 const statusBox = (()=>{
  if(ev.cancelled) return `<div class="notice warn"><b>Event cancelled.</b><br>Please see coordinator details below.</div>`;
  if(ev.closedEvent) return `<div class="notice warn"><b>Closed for event.</b><br>Please see coordinator details below.</div>`;
  if(ev.closed) return `<div class="notice warn"><b>Closed for renovation.</b><br>Please see coordinator details below.</div>`;
  if(ev.full) return `<div class="notice warn"><b>Fully booked.</b><br>This play date is currently full.</div>`;
  if(ev.booked) return `<div class="notice"><b>Booking Details</b><br>${esc(ev.details||'Court booked. Details coming soon.')}</div>`;
  return `<div class="notice warn"><b>Waiting for court reservation.</b><br>Minimum 6 playing players before booking court.</div>`;
 })();
 const detailBox = ev.details ? `<div class="notice info"><b>📢 Coordinator Details</b><br>${esc(ev.details)}</div>` : '';
 const closedReason = ev.cancelled?'Cancelled':ev.closedEvent?'Closed for event':ev.closed?'Closed for renovation':st.label==='FULLY BOOKED'?'Fully booked':'Signup closed';
 return `<div class="card"><div class="eventTop"><div><div class="big">${fmtDate(ev.date)}</div><p>📍 <b>${esc(ev.location)}</b><br>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</p></div><div>${c.playing>=6?'<span class="badge red">6+ Ready</span>':''}${statusBadges(ev)}</div></div>${statusBox}${detailBox}${ev.feeOn?feeHtml(ev):''}<h3>Sign up / Update my family</h3>${closed?`<p><span class="badge red">${closedReason}</span></p>`:family.map(n=>{const ex=mine.find(s=>s.name===n);return `<div class="person"><div><b>${esc(n)}</b><div class="small">${ex?esc(ex.status):'Not signed up'}</div></div><div class="actions"><button class="secondary" onclick="upsertSignup('${ev.id}','${idSafe(n)}','interested')">Interested</button><button class="success" onclick="upsertSignup('${ev.id}','${idSafe(n)}','playing')">Playing</button>${ex?`<button class="danger" onclick="removeMySignup('${ev.id}','${idSafe(n)}')">Remove</button>`:''}</div></div>`}).join('')}<h3>Who’s Coming</h3>${signups.length?signups.map(s=>`<div class="person"><span>${s.status==='playing'?'✅':'👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.status)}</span></span></div>`).join(''):'<p class="small">No signups yet.</p>'}</div>`;
}
function feeHtml(ev){ let v=ev.payment||''; const venmoMatch=String(v).match(/@([A-Za-z0-9_.-]+)/); const venmo=venmoMatch?venmoMatch[1]:''; return `<div class="feeBox"><b>💵 Court Fee:</b> $${esc(ev.fee||'')}<br><b>Payment:</b> ${esc(v)}<div style="margin-top:10px">${venmo?`<button class="secondary" onclick="window.open('https://venmo.com/${venmo}','_blank')">Pay with Venmo</button>`:''}<button class="secondary" onclick="markPaid('${ev.id}')">I Paid</button></div></div>`; }
function renderPlayer(){ const events=[...state.events].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)); $('#main').innerHTML=`${events.length?events.map(eventCardPlayer).join(''):`<div class="card"><h2>No play dates yet</h2><p class="small">Waiting for coordinator to create the first event.</p></div>`}`; }
window.upsertSignup=async(eid,name,status)=>{const ev=state.events.find(e=>e.id===eid); if(!ev)return; let signups=[...(ev.signups||[])]; let s=signups.find(x=>(x.owner===state.user.uid||x.email===state.user.email)&&x.name===name); if(!canSignup(ev)&&!s)return alert('This play date is closed, cancelled, or fully booked.'); if(s){s.status=status;s.updatedAt=new Date().toISOString();} else signups.push({id:crypto.randomUUID(),owner:state.user.uid,email:state.user.email,name,status,checked:false,paid:false,createdAt:new Date().toISOString()}); await updateDoc(doc(db,'events',eid),{signups});};
window.removeMySignup=async(eid,name)=>{const ev=state.events.find(e=>e.id===eid); let signups=(ev.signups||[]).filter(s=>!((s.owner===state.user.uid||s.email===state.user.email)&&s.name===name)); await updateDoc(doc(db,'events',eid),{signups});};
window.markPaid=async(eid)=>{const ev=state.events.find(e=>e.id===eid); let signups=[...(ev.signups||[])]; signups.forEach(s=>{if(s.owner===state.user.uid||s.email===state.user.email)s.paid=true;}); await updateDoc(doc(db,'events',eid),{signups}); alert('Marked as paid. Coordinator will verify payment.');};
function renderCalendar(){ const grouped={}; state.events.forEach(e=>(grouped[e.date]??=[]).push(e)); $('#main').innerHTML=`<div class="card"><h2>Calendar</h2>${Object.keys(grouped).sort().length?Object.keys(grouped).sort().map(d=>`<div class="card" style="box-shadow:none"><div class="big">${fmtDate(d)}</div>${grouped[d].map(e=>{const c=eventCounts(e);return `<p>${c.playing>=6?'🔴':'⚪'} ${timeLabel(e.start)} ${esc(e.location)} — ${c.playing} playing, ${c.interested} interested • ${eventStatus(e).label}</p>`}).join('')}</div>`).join(''):'<p class="small">No events yet.</p>'}</div>`; }
function renderProfile(){ const p=state.profile; $('#main').innerHTML=`<div class="card"><h2>Edit Profile</h2><label>Name</label><input id="profileName" value="${esc(p.name||'')}"><label>Email</label><input value="${esc(state.user.email)}" disabled><label>Phone optional</label><input id="profilePhone" value="${esc(p.phone||'')}"><label>DUPR / Skill Level optional</label><input id="profileDupr" value="${esc(p.dupr||'')}"><button style="margin-top:12px" onclick="saveProfile()">Save Profile</button></div><div class="card"><h2>Change Password</h2><div class="passwordBox"><input id="newPassword" type="password" placeholder="New password"><button class="secondary" onclick="togglePass('newPassword',this)">Show</button></div><button style="margin-top:10px" onclick="changeMyPassword()">Change Password</button></div><div class="card"><h2>Family Members</h2>${normalizeChildren(p.children).map((n,i)=>`<div class="person"><b>${esc(n)}</b><span><button class="secondary" onclick="editChild(${i})">Edit</button> <button class="danger" onclick="deleteChild(${i})">Delete</button></span></div>`).join('')||'<p class="small">No children added yet.</p>'}<div class="row"><input id="childName" placeholder="Child name"><button onclick="addChild()">Add Child</button></div></div>`; }
window.saveProfile=async()=>{await updateDoc(doc(db,'users',state.user.uid),{name:$('#profileName').value.trim(),phone:$('#profilePhone').value.trim(),dupr:$('#profileDupr').value.trim()}); alert('Profile saved.');};
window.changeMyPassword=async()=>{const p=$('#newPassword').value; if(p.length<6)return alert('Use at least 6 characters.'); try{await updatePassword(state.user,p); alert('Password changed.');}catch(e){alert(friendlyFirebaseError(e)+' You may need to log out and log in again first.');}};
window.addChild=async()=>{const n=$('#childName').value.trim(); if(!n)return; const children=[...normalizeChildren(state.profile.children),n]; await updateDoc(doc(db,'users',state.user.uid),{children});};
window.editChild=async(i)=>{const children=normalizeChildren(state.profile.children); const old=children[i]; const n=prompt('Child name:',old); if(!n)return; children[i]=n; await updateDoc(doc(db,'users',state.user.uid),{children});};
window.deleteChild=async(i)=>{const children=normalizeChildren(state.profile.children); if(!confirm('Delete this child from profile?'))return; children.splice(i,1); await updateDoc(doc(db,'users',state.user.uid),{children});};
function locationOptions(){ const names=state.locations.map(l=>l.name||l.location||l.title||l.id).filter(Boolean); const all=names.length?names:DEFAULT_LOCATIONS; return all.map(l=>`<option>${esc(l)}</option>`).join(''); }
function renderCoordinator(){ const events=[...state.events].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)); $('#main').innerHTML=`<div class="dash"><div class="stat"><span>Events</span><b>${state.events.length}</b></div><div class="stat"><span>Users</span><b>Live</b></div><div class="stat"><span>Mode</span><b>Cloud</b></div></div><div class="card"><h2>Create / Edit Event</h2><input id="editId" type="hidden"><div class="row"><div><label>Date</label><input id="date" type="date" value="${today()}"></div><div><label>Start</label><input id="start" type="time" value="19:00"></div><div><label>End</label><input id="end" type="time" value="21:00"></div></div><label>Location</label><select id="location">${locationOptions()}</select><div class="row"><div><label>Signup Cutoff</label><select id="cutoff"><option value="open">Keep open</option><option value="1">Close signup 1 hour before</option><option value="2">Close signup 2 hours before</option><option value="4">Close signup 4 hours before</option></select></div><div><label>Max players</label><input id="max" type="number" value="12"></div></div><div class="statusBox"><label>Event Status Options</label><p class="small">You may choose more than one option.</p><div class="statusGrid"><label class="statusChoice"><input id="booked" type="checkbox"><span>✅ Court Booked</span></label><label class="statusChoice"><input id="closed" type="checkbox"><span>🚧 Closed for Renovation</span></label><label class="statusChoice"><input id="closedEvent" type="checkbox"><span>🎉 Closed for Event</span></label><label class="statusChoice"><input id="cancelled" type="checkbox"><span>❌ Cancelled</span></label><label class="statusChoice"><input id="full" type="checkbox"><span>👥 Fully Booked</span></label></div></div><label>Booking Details</label><textarea id="details"></textarea><div class="toggleLine"><input id="feeOn" type="checkbox"><b>Collect court fee?</b></div><div class="row"><input id="fee" placeholder="Fee e.g. 5"><input id="payment" placeholder="Venmo @name, Zelle email, cash"></div><div class="row" style="margin-top:12px"><button onclick="saveEvent()">Save Event</button><button class="secondary" onclick="clearEventForm()">Clear</button></div></div><div class="card"><h2>Events</h2>${events.length?events.map(eventCardCoord).join(''):'<p class="small">No events yet.</p>'}</div><div class="card"><h2>Publish Notification</h2><p class="small">Send an in-app message to all players. This is free and saved in Firebase.</p><label>Title</label><input id="manualNotifTitle" placeholder="Example: DinkHouse update"><label>Message</label><textarea id="manualNotifMessage" placeholder="Type your update here..."></textarea><label>Type</label><select id="manualNotifType"><option value="info">Info</option><option value="event">New Event</option><option value="booked">Booked</option><option value="full">Fully Booked</option><option value="renovation">Closed for Renovation</option><option value="closedEvent">Closed for Event</option><option value="cancelled">Cancelled</option></select><button style="margin-top:12px" onclick="publishManualNotification()">Publish Notification</button></div><div class="card"><h2>Manage Locations</h2>${state.locations.map(l=>`<div class="person"><b>${esc(l.name||l.location||l.title||l.id)}</b><span><button class="secondary" onclick="renameLocation('${l.id}')">Edit</button> <button class="danger" onclick="deleteLocation('${l.id}')">Delete</button></span></div>`).join('')||'<p class="small">No locations yet.</p>'}<div class="row"><input id="newLocation" placeholder="New location"><button onclick="addLocation()">Add Location</button></div></div>`; }
function eventCardCoord(ev){ const c=eventCounts(ev); return `<div class="card" style="box-shadow:none"><div class="eventTop"><div><div class="big">${fmtDate(ev.date)} — ${esc(ev.location)}</div><p>${timeLabel(ev.start)} - ${timeLabel(ev.end)} • ${c.playing} playing • ${c.interested} interested</p></div>${statusBadges(ev)}</div><div class="row"><button class="secondary" onclick="editEvent('${ev.id}')">Edit</button><button class="danger" onclick="deleteEvent('${ev.id}')">Delete</button><button onclick="exportCsv('${ev.id}')">Export CSV</button></div><h3>Players</h3>${(ev.signups||[]).length?(ev.signups||[]).map(s=>`<div class="person"><span>${s.status==='playing'?'✅':'👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.email||s.owner||'')}</span> ${s.paid?'<span class="badge green">Paid</span>':''}</span><span><button class="secondary" onclick="toggleCheck('${ev.id}','${s.id}')">${s.checked?'Checked In':'Check In'}</button> <button class="danger" onclick="removeSignup('${ev.id}','${s.id}')">Remove</button></span></div>`).join(''):'<p class="small">No signups yet.</p>'}</div>`; }

window.publishManualNotification=async()=>{
  const title=$('#manualNotifTitle')?.value.trim();
  const message=$('#manualNotifMessage')?.value.trim();
  const type=$('#manualNotifType')?.value || 'info';
  if(!title||!message) return alert('Please enter a title and message.');
  await createNotification({title,message,type,eventId:'manual'});
  alert('Notification published.');
  renderCoordinator();
};

window.saveEvent=async()=>{ const id=$('#editId').value; const data={date:$('#date').value,start:$('#start').value,end:$('#end').value,location:$('#location').value,cutoff:$('#cutoff').value,max:$('#max').value,booked:$('#booked').checked,closed:$('#closed').checked,closedEvent:$('#closedEvent').checked,cancelled:$('#cancelled').checked,full:$('#full').checked,details:$('#details').value,feeOn:$('#feeOn').checked,fee:$('#fee').value,payment:$('#payment').value}; if(!data.date||!data.start||!data.end||!data.location)return alert('Complete date, time, and location.'); if(id){ const oldEv=state.events.find(e=>e.id===id); await updateDoc(doc(db,'events',id),data); const n=statusNotificationData(oldEv,data,false); if(n) await createNotification(n); } else { const ref=await addDoc(collection(db,'events'),{...data,signups:[],createdAt:serverTimestamp()}); const n=statusNotificationData(null,data,true); if(n) await createNotification({...n,eventId:ref.id}); } clearEventForm(); };
window.editEvent=(id)=>{ const e=state.events.find(x=>x.id===id); ['date','start','end','location','cutoff','max','details','fee','payment'].forEach(k=>{const el=$('#'+k); if(el) el.value=e[k]||''}); $('#editId').value=e.id; $('#booked').checked=!!e.booked; $('#closed').checked=!!e.closed; $('#closedEvent').checked=!!e.closedEvent; $('#cancelled').checked=!!e.cancelled; $('#full').checked=!!e.full; $('#feeOn').checked=!!e.feeOn; window.scrollTo({top:0,behavior:'smooth'}); };
window.clearEventForm=()=>renderCoordinator();
window.deleteEvent=async(id)=>{ if(confirm('Delete this event?')) await deleteDoc(doc(db,'events',id)); };
window.removeSignup=async(eid,sid)=>{ const ev=state.events.find(e=>e.id===eid); await updateDoc(doc(db,'events',eid),{signups:(ev.signups||[]).filter(s=>s.id!==sid)}); };
window.toggleCheck=async(eid,sid)=>{ const ev=state.events.find(e=>e.id===eid); const signups=[...(ev.signups||[])]; const s=signups.find(s=>s.id===sid); if(s)s.checked=!s.checked; await updateDoc(doc(db,'events',eid),{signups}); };
window.addLocation=async()=>{ const name=$('#newLocation').value.trim(); if(!name)return; await addDoc(collection(db,'locations'),{name,createdAt:serverTimestamp()}); };
window.renameLocation=async(id)=>{ const loc=state.locations.find(l=>l.id===id); const old=loc.name||loc.location||loc.title||id; const name=prompt('Location name:',old); if(!name)return; await updateDoc(doc(db,'locations',id),{name}); };
window.deleteLocation=async(id)=>{ if(confirm('Delete this location?')) await deleteDoc(doc(db,'locations',id)); };
window.exportCsv=(id)=>{ const e=state.events.find(x=>x.id===id); let csv='Name,Status,Email,Paid,Checked In\n'+(e.signups||[]).map(s=>`"${s.name}","${s.status}","${s.email||s.owner||''}","${s.paid?'yes':'no'}","${s.checked?'yes':'no'}"`).join('\n'); const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`pickleball-${e.date}-${e.location}.csv`; a.click(); };
