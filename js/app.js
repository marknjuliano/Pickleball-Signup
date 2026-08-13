console.log('Pickleball Signup v3.2 Runtime Fix loaded');
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
const today = () => new Date().toISOString().slice(0,10);
const USERNAME_DOMAIN = 'users.powerdink.app';
function normalizeUsername(value=''){ return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]/g,''); }
function usernameToEmail(username=''){ return `${normalizeUsername(username)}@${USERNAME_DOMAIN}`; }
function loginIdentifierToEmail(value=''){ const v=String(value).trim(); return v.includes('@') ? v.toLowerCase() : usernameToEmail(v); }
function isUsernameAccount(email=''){ return String(email).toLowerCase().endsWith(`@${USERNAME_DOMAIN}`); }
async function usernameRecord(username=''){
  const key=normalizeUsername(username);
  if(!key) return null;
  try{
    const snap=await getDoc(doc(db,'usernames',key));
    return snap.exists()?snap.data():null;
  }catch(error){
    console.warn('Username lookup unavailable',error);
    return null;
  }
}
async function resolveLoginEmail(identifier=''){
  const value=String(identifier).trim();
  if(value.includes('@')) return value.toLowerCase();
  const record=await usernameRecord(value);
  return String(record?.authEmail||record?.email||usernameToEmail(value)).toLowerCase();
}
const DEFAULT_SITE_SETTINGS = {
  appTitle:'Pickleball Signup',
  playerHeading:'Upcoming Events',
  playerSubtitle:'The nearest event is featured. All later events are listed below.',
  nextPlayLabel:'NEXT PLAY DATE',
  allNextHeading:'All Next Events',
  signupHeading:'Sign up / Update my family',
  interestedLabel:'Interested',
  playingLabel:'Playing',
  expandLabel:'Expand',
  waitingTitle:'Waiting for court reservation.',
  waitingMessage:'Minimum {min} playing players before booking court.',
  minimumPlayers:6,
  showCoordinatorDetails:true,
  showPlayersList:true,
  playersDefaultOpen:false,
  showNextPlayRibbon:true,
  accent:'#a8d500',
  spacing:'comfortable',
  logoUrl:'images/powerdink-logo-v271.png',
  headerBackgroundUrl:'images/powerdink-header-v271.jpg',
  headerOverlay:48,
  showNotificationBell:true,
  customBlocks:[]
};
function siteSettings(){ return {...DEFAULT_SITE_SETTINGS,...(state.siteSettings||{})}; }
let state = { user:null, profile:null, events:[], locations:[], notifications:[], showNotifications:false, view:localStorage.getItem('pickleballView')||'player', ready:false, calendarMonth:today().slice(0,7), selectedCalendarDate:today(), siteSettings:{...DEFAULT_SITE_SETTINGS}, editorDraft:null, editorPreviewMode:'desktop', editorTab:'branding' };
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
async function nav(view){ state.view=view; localStorage.setItem('pickleballView',view); if(view==='siteEditor' && isCoordinator()) await loadSiteEditorDraft(); render(); }
window.nav = nav;

onAuthStateChanged(auth, async user => {
  cleanup(); state.user=user; state.profile=null; state.events=[]; state.locations=[]; state.notifications=[]; state.showNotifications=false; state.ready=false;
  if(!user){ renderLogin(); return; }
  await ensureProfile(user);
  startListeners();
});

async function ensureProfile(user){
  const ref=doc(db,'users',user.uid); let snap=await getDoc(ref);
  const pendingRaw=sessionStorage.getItem('pendingPowerDinkAccount');
  let pending={};
  try{ pending=pendingRaw?JSON.parse(pendingRaw):{}; }catch(e){ pending={}; }
  if(!snap.exists()){
    const username = pending.username || (isUsernameAccount(user.email) ? user.email.split('@')[0] : '');
    const fallbackName = pending.displayName || user.displayName || username || user.email.split('@')[0];
    const recoveryEmail = pending.recoveryEmail || (!isUsernameAccount(user.email)?user.email:'');
    await setDoc(ref,{email:user.email,name:fallbackName,username,usernameLower:normalizeUsername(username),recoveryEmail,role:'player',children:[],createdAt:serverTimestamp()},{merge:true});
    if(username){
      await setDoc(doc(db,'usernames',normalizeUsername(username)),{uid:user.uid,username,authEmail:user.email,recoveryEmail,createdAt:serverTimestamp()},{merge:true});
    }
    sessionStorage.removeItem('pendingPowerDinkAccount');
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
  unsubscribers.push(onSnapshot(doc(db,'siteSettings','published'), snap=>{ state.siteSettings=snap.exists()?{...DEFAULT_SITE_SETTINGS,...snap.data()}:{...DEFAULT_SITE_SETTINGS}; applyPublishedTheme(); render(); }, err=>console.warn('Site settings unavailable',err)));
  unsubscribers.push(onSnapshot(doc(db,'users',state.user.uid), snap=>{ if(snap.exists()){state.profile={id:state.user.uid,...snap.data(),children:normalizeChildren(snap.data().children)}; render();} }));
}
function renderError(err){ appEl.innerHTML=`<div class="wrap"><div class="card"><h2>Firebase Error</h2><div class="error">${esc(err.message)}</div><p class="small">Check Firebase config and Firestore rules.</p></div></div>`; }
function render(){ if(!state.user) return renderLogin(); if(!state.ready) return appEl.innerHTML='<div class="wrap"><div class="card"><h2>Loading...</h2></div></div>'; renderApp(); }
function renderLogin(){
  appEl.innerHTML=`<div class="wrap login"><div><div class="hero brandHero loginBrandHero"><div class="brandLeft"><img src="images/powerdink-logo-v271.png?v=2.7.3" class="powerDinkLogo" alt="PowerDink logo"><span class="brandDivider"></span><div class="brandTitle"><h1>Pickleball Signup</h1></div></div></div><div class="card authCard"><div class="authTabs"><button id="loginTabBtn" class="authTab active" onclick="showAuthTab('login')">Login</button><button id="createTabBtn" class="authTab" onclick="showAuthTab('create')">Create Account</button></div><section id="loginPane"><h2>Welcome Back</h2><label>Username or Email</label><input id="loginId" type="text" autocomplete="username" placeholder="Username or email"><label>Password</label><div class="passwordBox"><input id="pass" type="password" autocomplete="current-password"><button class="secondary" onclick="togglePass('pass',this)">Show</button></div><button class="authPrimary" onclick="login()">Login</button><button class="ghost authLink" onclick="forgotPassword()">Forgot Password?</button></section><section id="createPane" class="hide"><h2>Create Your Account</h2><label>Username <span class="required">*</span></label><input id="newUsername" type="text" autocomplete="username" placeholder="your.username"><p class="small fieldHelp">Use 3–24 characters: letters, numbers, dot, underscore, or hyphen.</p><label>Display Name <span class="required">*</span></label><input id="displayName" type="text" autocomplete="name" placeholder="Your Name"><label>Recovery Email <span class="muted">(optional)</span></label><input id="recoveryEmail" type="email" autocomplete="email" placeholder="name@example.com"><p class="small fieldHelp">Add an email for self-service password reset. Without one, coordinator help is required.</p><label>Password <span class="required">*</span></label><div class="passwordBox"><input id="newPass" type="password" autocomplete="new-password"><button class="secondary" onclick="togglePass('newPass',this)">Show</button></div><button class="authPrimary" onclick="createAccount()">Create Account</button><p class="small">New accounts are active immediately after creation.</p></section></div></div></div>`;
}
window.showAuthTab=(tab)=>{
  const login=tab==='login';
  $('#loginPane')?.classList.toggle('hide',!login);
  $('#createPane')?.classList.toggle('hide',login);
  $('#loginTabBtn')?.classList.toggle('active',login);
  $('#createTabBtn')?.classList.toggle('active',!login);
};
window.togglePass=(id,btn)=>{const el=document.getElementById(id); el.type=el.type==='password'?'text':'password'; btn.textContent=el.type==='password'?'Show':'Hide';};
window.login=async()=>{try{const id=$('#loginId').value.trim(); if(!id)return alert('Enter your username or email.'); const email=await resolveLoginEmail(id); await signInWithEmailAndPassword(auth,email,$('#pass').value);}catch(e){alert(friendlyFirebaseError(e));}};
window.createAccount=async()=>{try{
  const raw=$('#newUsername').value.trim(); const username=normalizeUsername(raw); const displayName=$('#displayName').value.trim(); const recoveryEmail=$('#recoveryEmail').value.trim().toLowerCase(); const pass=$('#newPass').value;
  if(!/^[a-z0-9._-]{3,24}$/.test(raw.toLowerCase()) || username!==raw.toLowerCase()) return alert('Username must be 3–24 characters using only letters, numbers, dot, underscore, or hyphen.');
  if(!displayName) return alert('Enter your display name.');
  if(pass.length<6) return alert('Password must be at least 6 characters.');
  if(recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) return alert('Enter a valid recovery email.');
  const existing=await usernameRecord(username);
  if(existing) return alert('That username is already taken. Please choose another.');
  const authEmail=recoveryEmail || usernameToEmail(username);
  sessionStorage.setItem('pendingPowerDinkAccount',JSON.stringify({username,displayName,recoveryEmail}));
  await createUserWithEmailAndPassword(auth,authEmail,pass);
}catch(e){sessionStorage.removeItem('pendingPowerDinkAccount'); alert(friendlyFirebaseError(e));}};
window.forgotPassword=async()=>{
  const id=$('#loginId')?.value.trim()||prompt('Enter your username or email'); if(!id)return;
  try{
    const record=id.includes('@')?null:await usernameRecord(id);
    const email=id.includes('@')?id.toLowerCase():String(record?.recoveryEmail||record?.authEmail||'').toLowerCase();
    if(!email || isUsernameAccount(email)) return alert('No recovery email is connected to this username. Please contact the coordinator for password assistance.');
    await sendPasswordResetEmail(auth,email);
    alert('Password reset email sent. Please check your inbox or spam folder.');
  }catch(e){alert(friendlyFirebaseError(e));}
};
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
  return `<div class="notifWrap"><button class="notifBtn ${count?'hasUnread':''}" title="Notifications" aria-label="Notifications" onclick="toggleNotifications()">🔔${count?` <span>${count}</span>`:''}</button></div>`;
}
function renderNotificationDrawer(){
  if(!state.showNotifications) return '';
  const items=state.notifications.length?state.notifications.map(n=>{
    const unread=!(Array.isArray(n.readBy)&&n.readBy.includes(state.user.uid));
    return `<div class="notifItem ${unread?'unread':''} type-${esc(n.type||'info')}"><div class="notifIcon">${notificationIcon(n.type)}</div><div class="notifBody"><div class="notifTitleRow"><b>${esc(n.title||'Notification')}</b>${unread?'<span class="unreadDot" title="Unread"></span>':''}</div><p>${esc(n.message||'')}</p><small>${notificationTime(n)}${unread?' • New':''}</small></div></div>`;
  }).join(''):'<p class="small emptyNotif">No notifications yet.</p>';
  return `<div class="notifOverlay" onclick="closeNotificationsFromBackdrop(event)"><aside class="notifPanel" role="dialog" aria-modal="true" aria-label="Notifications"><div class="notifHeader"><div><h3>🔔 Notifications</h3><span class="small">${state.notifications.length} update${state.notifications.length===1?'':'s'}</span></div><div class="notifActions"><button class="secondary" onclick="markNotificationsRead()" ${unreadNotifications()?'':'disabled'}>Mark all read</button><button class="ghost closeNotif" onclick="toggleNotifications()" aria-label="Close notifications">✕</button></div></div><div class="notifScroll">${items}</div></aside></div>`;
}
window.closeNotificationsFromBackdrop=(event)=>{ if(event.target?.classList?.contains('notifOverlay')){ state.showNotifications=false; render(); } };

window.toggleNotifications=()=>{ state.showNotifications=!state.showNotifications; render(); };

window.toggleEventDetails=(event,btn)=>{
  event.preventDefault();
  event.stopPropagation();
  const d=btn.closest('details');
  if(!d) return false;
  d.open=!d.open;
  btn.textContent=d.open?'Collapse':'Expand';
  return false;
};
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


function normalizeBlocks(blocks){ return Array.isArray(blocks)?blocks.filter(Boolean):[]; }
function blockId(){ return (crypto?.randomUUID?.() || ('block-'+Date.now()+'-'+Math.random().toString(36).slice(2))); }
function renderCustomBlock(block, preview=false){
  if(!block || block.hidden) return '';
  const cls=`customBlock customBlock-${esc(block.type||'text')}${preview?' previewCustomBlock':''}`;
  if(block.type==='heading') return `<section class="${cls}"><h3>${esc(block.text||'New heading')}</h3></section>`;
  if(block.type==='announcement') return `<section class="${cls}"><b>${esc(block.title||'Announcement')}</b><p>${esc(block.text||'Add your announcement here.')}</p></section>`;
  if(block.type==='button') return `<section class="${cls}"><a class="customBlockButton" href="${esc(block.url||'#')}" ${preview?'onclick="return false"':'target="_blank" rel="noopener"'}>${esc(block.label||'Button')}</a></section>`;
  if(block.type==='divider') return `<div class="${cls}"><hr></div>`;
  if(block.type==='image') return block.url?`<section class="${cls}"><img src="${esc(block.url)}" alt="${esc(block.alt||'Custom image')}"></section>`:'';
  return `<section class="${cls}"><p>${esc(block.text||'Add your text here.')}</p></section>`;
}
function renderCustomBlocks(cfg, preview=false){ return normalizeBlocks(cfg.customBlocks).map(b=>renderCustomBlock(b,preview)).join(''); }
function safeImageUrl(value,fallback){ const v=String(value||'').trim(); return v || fallback; }
function defaultSiteBlock(type){
  const defaults={
    heading:{text:'New heading'},
    text:{text:'Add your text here.'},
    announcement:{title:'Announcement',text:'Add your announcement here.'},
    button:{label:'Learn More',url:'#'},
    divider:{},
    image:{url:'',alt:'Custom image'}
  };
  return {id:blockId(),type,...(defaults[type]||defaults.text)};
}
window.addSiteBlock=(type,index=null)=>{
  if(!state.editorDraft) state.editorDraft={...siteSettings()};
  const blocks=normalizeBlocks(state.editorDraft.customBlocks).slice();
  const block=defaultSiteBlock(type);
  const at=Number.isInteger(index)?Math.max(0,Math.min(index,blocks.length)):blocks.length;
  blocks.splice(at,0,block);
  state.editorDraft.customBlocks=blocks;
  renderSiteEditor();
  requestAnimationFrame(()=>document.querySelector(`[data-site-block-id="${block.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}));
};
window.removeSiteBlock=(id)=>{ if(!confirm('Delete this block?'))return; state.editorDraft.customBlocks=normalizeBlocks(editorSettings().customBlocks).filter(b=>b.id!==id); renderSiteEditor(); };
window.moveSiteBlock=(id,delta)=>{ const blocks=normalizeBlocks(editorSettings().customBlocks).slice(); const i=blocks.findIndex(b=>b.id===id); const j=i+delta; if(i<0||j<0||j>=blocks.length)return; [blocks[i],blocks[j]]=[blocks[j],blocks[i]]; state.editorDraft.customBlocks=blocks; renderSiteEditor(); };
window.duplicateSiteBlock=(id)=>{ const blocks=normalizeBlocks(editorSettings().customBlocks).slice(); const i=blocks.findIndex(b=>b.id===id); if(i<0)return; const clone={...blocks[i],id:blockId()}; blocks.splice(i+1,0,clone); state.editorDraft.customBlocks=blocks; renderSiteEditor(); };
window.toggleSiteBlock=(id)=>{ const blocks=normalizeBlocks(editorSettings().customBlocks).map(b=>b.id===id?{...b,hidden:!b.hidden}:b); state.editorDraft.customBlocks=blocks; renderSiteEditor(); };
window.updateSiteBlock=(id,key,value)=>{ const blocks=normalizeBlocks(editorSettings().customBlocks).map(b=>b.id===id?{...b,[key]:value}:b); state.editorDraft.customBlocks=blocks; renderSiteEditorPreview(); };

let draggedSiteBlockId='';
let draggedPaletteType='';
window.startSiteBlockDrag=(event,id)=>{
  draggedSiteBlockId=id; draggedPaletteType='';
  event.currentTarget?.classList.add('dragging');
  if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/site-block',id);event.dataTransfer.setData('text/plain',id);}
};
window.endSiteBlockDrag=(event)=>{draggedSiteBlockId='';event.currentTarget?.classList.remove('dragging');document.querySelectorAll('.siteBlockDropTarget').forEach(x=>x.classList.remove('dragOver'));};
window.startPaletteBlockDrag=(event,type)=>{
  draggedPaletteType=type; draggedSiteBlockId='';
  if(event.dataTransfer){event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/site-palette',type);event.dataTransfer.setData('text/plain','palette:'+type);}
};
window.siteBlockDragOver=(event)=>{event.preventDefault(); if(event.dataTransfer)event.dataTransfer.dropEffect=draggedPaletteType?'copy':'move'; event.currentTarget?.classList.add('dragOver');};
window.siteBlockDragLeave=(event)=>{event.currentTarget?.classList.remove('dragOver');};
window.dropSiteBlock=(event,targetId)=>{
  event.preventDefault();event.stopPropagation();event.currentTarget?.classList.remove('dragOver');
  const palette=draggedPaletteType||event.dataTransfer?.getData('text/site-palette')||String(event.dataTransfer?.getData('text/plain')||'').replace(/^palette:/,'');
  if(palette && ['heading','text','announcement','image','button','divider'].includes(palette)){
    const blocks=normalizeBlocks(editorSettings().customBlocks); const idx=blocks.findIndex(b=>b.id===targetId); draggedPaletteType=''; return addSiteBlock(palette,idx<0?blocks.length:idx);
  }
  const sourceId=draggedSiteBlockId||event.dataTransfer?.getData('text/site-block')||event.dataTransfer?.getData('text/plain');
  if(!sourceId||sourceId===targetId)return;
  const blocks=normalizeBlocks(editorSettings().customBlocks).slice(); const from=blocks.findIndex(b=>b.id===sourceId); const to=blocks.findIndex(b=>b.id===targetId);
  if(from<0||to<0)return;
  const [moved]=blocks.splice(from,1); let insert=to; if(from<to)insert=to-1; blocks.splice(Math.max(0,insert),0,moved);
  state.editorDraft.customBlocks=blocks; draggedSiteBlockId=''; renderSiteEditor();
};
window.dropSiteBlockAtEnd=(event)=>{
  event.preventDefault();event.stopPropagation();event.currentTarget?.classList.remove('dragOver');
  const palette=draggedPaletteType||event.dataTransfer?.getData('text/site-palette')||String(event.dataTransfer?.getData('text/plain')||'').replace(/^palette:/,'');
  if(palette && ['heading','text','announcement','image','button','divider'].includes(palette)){draggedPaletteType='';return addSiteBlock(palette);}
  const sourceId=draggedSiteBlockId||event.dataTransfer?.getData('text/site-block')||event.dataTransfer?.getData('text/plain');
  const blocks=normalizeBlocks(editorSettings().customBlocks).slice(); const from=blocks.findIndex(b=>b.id===sourceId); if(from<0)return;
  const [moved]=blocks.splice(from,1);blocks.push(moved);state.editorDraft.customBlocks=blocks;draggedSiteBlockId='';renderSiteEditor();
};
window.resetBrandingDraft=()=>{ if(!confirm('Reset logo and header background to the built-in PowerDink branding?'))return; state.editorDraft.logoUrl=DEFAULT_SITE_SETTINGS.logoUrl; state.editorDraft.headerBackgroundUrl=DEFAULT_SITE_SETTINGS.headerBackgroundUrl; state.editorDraft.headerOverlay=DEFAULT_SITE_SETTINGS.headerOverlay; renderSiteEditor(); };
window.readBrandImageFile=(input,key)=>{
  const file=input.files?.[0]; if(!file)return;
  if(file.size>180000){ alert('For Firestore safety, please use an image smaller than 180 KB. You can also paste an image URL instead.'); input.value=''; return; }
  const reader=new FileReader(); reader.onload=()=>{ window.updateSiteDraft(key,String(reader.result||'')); renderSiteEditor(); }; reader.readAsDataURL(file);
};
function siteBlockEditor(block,index,total){
  const visual=(()=>{
    if(block.type==='heading') return `<div class="builderBlockVisual visualHeading"><h3>${esc(block.text||'Heading')}</h3></div>`;
    if(block.type==='announcement') return `<div class="builderBlockVisual visualAnnouncement"><b>${esc(block.title||'Announcement')}</b><p>${esc(block.text||'Add your announcement here.')}</p></div>`;
    if(block.type==='button') return `<div class="builderBlockVisual visualButton"><span>${esc(block.label||'Button')}</span></div>`;
    if(block.type==='image') return `<div class="builderBlockVisual visualImage">${block.url?`<img src="${esc(block.url)}" alt="${esc(block.alt||'')}">`:'<span>▧ Image — add URL below</span>'}</div>`;
    if(block.type==='divider') return `<div class="builderBlockVisual visualDivider"><hr></div>`;
    return `<div class="builderBlockVisual visualText"><p>${esc(block.text||'Add your text here.')}</p></div>`;
  })();
  const common=`<div class="blockEditorHead"><div><span class="dragHandle" title="Drag to reorder">⠿</span><b>${esc((block.type||'text').replace(/^./,m=>m.toUpperCase()))}</b>${block.hidden?'<em>Hidden</em>':''}</div><div class="blockActions"><button class="tinyBtn mobileMoveBtn" onclick="moveSiteBlock('${block.id}',-1)" ${index===0?'disabled':''}>↑</button><button class="tinyBtn mobileMoveBtn" onclick="moveSiteBlock('${block.id}',1)" ${index===total-1?'disabled':''}>↓</button><button class="tinyBtn" onclick="duplicateSiteBlock('${block.id}')">Duplicate</button><button class="tinyBtn" onclick="toggleSiteBlock('${block.id}')">${block.hidden?'Show':'Hide'}</button><button class="tinyBtn dangerLite" onclick="removeSiteBlock('${block.id}')">Delete</button></div></div>`;
  let fields='';
  if(block.type==='heading') fields=`<label>Heading</label><input value="${esc(block.text||'')}" oninput="updateSiteBlock('${block.id}','text',this.value)">`;
  else if(block.type==='announcement') fields=`<label>Title</label><input value="${esc(block.title||'')}" oninput="updateSiteBlock('${block.id}','title',this.value)"><label>Message</label><textarea oninput="updateSiteBlock('${block.id}','text',this.value)">${esc(block.text||'')}</textarea>`;
  else if(block.type==='button') fields=`<label>Button Label</label><input value="${esc(block.label||'')}" oninput="updateSiteBlock('${block.id}','label',this.value)"><label>Link URL</label><input value="${esc(block.url||'')}" placeholder="https://..." oninput="updateSiteBlock('${block.id}','url',this.value)">`;
  else if(block.type==='image') fields=`<label>Image URL</label><input value="${esc(block.url||'')}" placeholder="https://..." oninput="updateSiteBlock('${block.id}','url',this.value)"><label>Alt text</label><input value="${esc(block.alt||'')}" oninput="updateSiteBlock('${block.id}','alt',this.value)">`;
  else if(block.type==='divider') fields='<p class="small">A simple divider line will appear on the Player page.</p>';
  else fields=`<label>Text</label><textarea oninput="updateSiteBlock('${block.id}','text',this.value)">${esc(block.text||'')}</textarea>`;
  return `<div class="siteBlockDropTarget" ondragover="siteBlockDragOver(event)" ondragleave="siteBlockDragLeave(event)" ondrop="dropSiteBlock(event,'${block.id}')"><div class="siteBlockEditor ${block.hidden?'isHidden':''}" data-site-block-id="${block.id}" draggable="true" ondragstart="startSiteBlockDrag(event,'${block.id}')" ondragend="endSiteBlockDrag(event)">${common}${visual}<details class="blockSettings"><summary>Edit content & settings</summary><div class="blockSettingsBody">${fields}</div></details></div></div>`;
}

function applyPublishedTheme(){
  const cfg=siteSettings();
  document.documentElement.style.setProperty('--site-accent',cfg.accent||DEFAULT_SITE_SETTINGS.accent);
  document.documentElement.style.setProperty('--site-header-bg',`url(\"${safeImageUrl(cfg.headerBackgroundUrl,DEFAULT_SITE_SETTINGS.headerBackgroundUrl)}\")`);
  document.documentElement.style.setProperty('--site-header-overlay',Math.max(0,Math.min(90,Number(cfg.headerOverlay??48)))/100);
  document.body.dataset.siteSpacing=cfg.spacing||'comfortable';
}
async function loadSiteEditorDraft(){
  if(state.editorDraft) return;
  try{
    const snap=await getDoc(doc(db,'siteSettings','draft'));
    state.editorDraft=snap.exists()?{...DEFAULT_SITE_SETTINGS,...snap.data()}:{...siteSettings()};
  }catch(e){ state.editorDraft={...siteSettings()}; }
}
function editorSettings(){ return {...siteSettings(),...(state.editorDraft||{})}; }
function minimumPlayers(cfg=siteSettings()){ const n=Math.floor(Number(cfg.minimumPlayers||6)); return Math.max(1,Math.min(99,Number.isFinite(n)?n:6)); }
function waitingMessageText(cfg=siteSettings()){ return String(cfg.waitingMessage||DEFAULT_SITE_SETTINGS.waitingMessage).replaceAll('{min}',String(minimumPlayers(cfg))); }
window.setEditorTab=(tab)=>{ if(!['branding','builder','labels'].includes(tab)) return; state.editorTab=tab; renderSiteEditor(); };
window.updateSiteDraft=(key,value)=>{
  if(!state.editorDraft) state.editorDraft={...siteSettings()};
  state.editorDraft[key]=value;
  renderSiteEditorPreview();
};
window.updateSiteDraftBool=(key,checked)=>window.updateSiteDraft(key,!!checked);
window.setEditorPreviewMode=(mode)=>{state.editorPreviewMode=mode; document.querySelector('.sitePreviewFrame')?.setAttribute('data-mode',mode); document.querySelectorAll('.previewModeBtn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));};
window.saveSiteDraft=async()=>{
  if(!isCoordinator()) return;
  const data={...editorSettings(),updatedAt:serverTimestamp(),updatedBy:state.user.uid};
  await setDoc(doc(db,'siteSettings','draft'),data,{merge:true});
  alert('Draft saved. The live Player page was not changed.');
};
window.publishSiteChanges=async()=>{
  if(!isCoordinator()) return;
  if(!confirm('Publish these changes to the live Player page?')) return;
  const clean={...editorSettings()}; delete clean.updatedAt; delete clean.updatedBy;
  await setDoc(doc(db,'siteSettings','published'),{...clean,publishedAt:serverTimestamp(),publishedBy:state.user.uid},{merge:true});
  await setDoc(doc(db,'siteSettings','draft'),{...clean,updatedAt:serverTimestamp(),updatedBy:state.user.uid},{merge:true});
  state.siteSettings={...DEFAULT_SITE_SETTINGS,...clean};
  applyPublishedTheme();
  alert('Changes published.');
  renderSiteEditor();
};
window.discardSiteChanges=()=>{ if(!confirm('Discard this draft and return to the currently published design?'))return; state.editorDraft={...siteSettings()}; renderSiteEditor(); };
window.resetSiteDraft=()=>{ if(!confirm('Reset the editor to the default PowerDink settings? This does not publish until you tap Publish Changes.'))return; state.editorDraft={...DEFAULT_SITE_SETTINGS}; renderSiteEditor(); };
function sitePreviewEvent(){
  const upcoming=[...state.events].filter(e=>e.date && new Date(e.date+'T23:59:59').getTime()>=Date.now()).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  return upcoming[0]||{date:today(),start:'19:00',end:'22:00',location:'Pickle N\' Play',details:'Coordinator details appear here.',signups:[]};
}
function renderSiteEditorPreview(){
  const root=document.querySelector('#siteEditorPreview'); if(!root) return;
  const cfg=editorSettings(), ev=sitePreviewEvent();
  const d=new Date((ev.date||today())+'T12:00:00');
  const signups=Array.isArray(ev.signups)?ev.signups:[];
  const logo=safeImageUrl(cfg.logoUrl,DEFAULT_SITE_SETTINGS.logoUrl);
  const bg=safeImageUrl(cfg.headerBackgroundUrl,DEFAULT_SITE_SETTINGS.headerBackgroundUrl);
  root.innerHTML=`<div class="previewApp" style="--preview-accent:${esc(cfg.accent)}"><div class="previewHero" style="background-image:linear-gradient(rgba(0,0,0,${Number(cfg.headerOverlay??48)/100}),rgba(0,0,0,${Number(cfg.headerOverlay??48)/100})),url('${esc(bg)}')"><img src="${esc(logo)}" alt="PowerDink"><span></span><h2>${esc(cfg.appTitle)}</h2>${cfg.showNotificationBell?'<button>🔔</button>':''}</div><div class="previewTabs"><b>Player</b><span>Calendar</span><span>Profile</span><span>Coordinator</span></div><div class="previewHeading"><h3>${esc(cfg.playerHeading)}</h3><p>${esc(cfg.playerSubtitle)}</p></div>${renderCustomBlocks(cfg,true)}<div class="previewEvent"><aside>${cfg.showNextPlayRibbon?`<b>⭐ ${esc(cfg.nextPlayLabel)}</b>`:''}<strong>${d.toLocaleDateString(undefined,{day:'numeric'})}</strong><span>${d.toLocaleDateString(undefined,{month:'short'}).toUpperCase()} ${d.getFullYear()}</span></aside><main><h3>${esc(ev.location)}</h3><p>📍 ${esc(ev.location)}<br>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</p><div class="previewNotice"><b>${esc(cfg.waitingTitle)}</b><br>${esc(waitingMessageText(cfg))}</div>${cfg.showCoordinatorDetails?`<div class="previewDetail"><b>📢 Coordinator Details</b><br>${esc(ev.details||'Coordinator details appear here.')}</div>`:''}<h4>${esc(cfg.signupHeading)}</h4><div class="previewPerson"><span><b>${esc(state.profile?.name||'Player Name')}</b><small>Choose ${esc(cfg.interestedLabel)} or ${esc(cfg.playingLabel)}.</small></span><button>${esc(cfg.interestedLabel)}</button><button>${esc(cfg.playingLabel)}</button></div>${cfg.showPlayersList?`<div class="previewPlayers">👥 Players (${signups.length}) <span>${esc(cfg.expandLabel)}</span></div>`:''}</main></div></div>`;
  root.closest('.sitePreviewFrame')?.setAttribute('data-mode',state.editorPreviewMode);
}

function renderSiteEditor(){
  if(!isCoordinator()){ nav('player'); return; }
  if(!state.editorDraft){ loadSiteEditorDraft().then(()=>renderSiteEditor()); return; }
  const cfg=editorSettings(), blocks=normalizeBlocks(cfg.customBlocks), tab=state.editorTab||'branding';
  const blockList=blocks.length?blocks.map((b,i)=>siteBlockEditor(b,i,blocks.length)).join(''):'<div class="emptyBuilder"><b>No custom blocks yet.</b><p>Add a heading, announcement, text, image, button, or divider.</p></div>';
  const brandingSection=`<div class="editorSection"><h3>Branding</h3><label>App Title</label><input value="${esc(cfg.appTitle)}" oninput="updateSiteDraft('appTitle',this.value)"><div class="brandAssetGrid"><div><label>Logo</label><div class="assetPreview logoAsset"><img src="${esc(safeImageUrl(cfg.logoUrl,DEFAULT_SITE_SETTINGS.logoUrl))}" alt="Current logo"></div><label>Logo Image URL</label><input value="${esc(cfg.logoUrl||'')}" placeholder="images/... or https://..." oninput="updateSiteDraft('logoUrl',this.value)"><label class="filePickerLabel">Or choose a small image file<input type="file" accept="image/*" onchange="readBrandImageFile(this,'logoUrl')"></label></div><div><label>Header Background</label><div class="assetPreview bgAsset" style="background-image:url('${esc(safeImageUrl(cfg.headerBackgroundUrl,DEFAULT_SITE_SETTINGS.headerBackgroundUrl))}')"></div><label>Background Image URL</label><input value="${esc(cfg.headerBackgroundUrl||'')}" placeholder="images/... or https://..." oninput="updateSiteDraft('headerBackgroundUrl',this.value)"><label class="filePickerLabel">Or choose a small image file<input type="file" accept="image/*" onchange="readBrandImageFile(this,'headerBackgroundUrl')"></label></div></div><label>Header dark overlay <b>${Number(cfg.headerOverlay??48)}%</b></label><input type="range" min="0" max="90" value="${Number(cfg.headerOverlay??48)}" oninput="updateSiteDraft('headerOverlay',Number(this.value));this.previousElementSibling.querySelector('b').textContent=this.value+'%'"><label class="editorToggle"><span>Show Notification Bell</span><input type="checkbox" ${cfg.showNotificationBell?'checked':''} onchange="updateSiteDraftBool('showNotificationBell',this.checked)"></label><label>Accent Color</label><input type="color" value="${esc(cfg.accent)}" oninput="updateSiteDraft('accent',this.value)"><button class="secondary" onclick="resetBrandingDraft()">Reset PowerDink Branding</button></div>`;
  const blockLibrary=[
    ['heading','H','Heading','Section title'],['text','¶','Text','Paragraph or note'],['announcement','!','Announcement','Highlighted message'],['image','▧','Image','Image from URL'],['button','↗','Button','Link button'],['divider','—','Divider','Spacing line']
  ].map(([type,icon,label,help])=>`<button class="builderPaletteItem" draggable="true" ondragstart="startPaletteBlockDrag(event,'${type}')" onclick="addSiteBlock('${type}')"><span>${icon}</span><b>${label}</b><small>${help}</small><em>Drag</em></button>`).join('');
  const builderSection=`<div class="editorSection"><h3>Player Page Layout</h3><label>Main Heading</label><input value="${esc(cfg.playerHeading)}" oninput="updateSiteDraft('playerHeading',this.value)"><label>Subtitle</label><textarea oninput="updateSiteDraft('playerSubtitle',this.value)">${esc(cfg.playerSubtitle)}</textarea><label class="editorToggle"><span>Show “Next Play Date” ribbon</span><input type="checkbox" ${cfg.showNextPlayRibbon?'checked':''} onchange="updateSiteDraftBool('showNextPlayRibbon',this.checked)"></label><label class="editorToggle"><span>Show Coordinator Details</span><input type="checkbox" ${cfg.showCoordinatorDetails?'checked':''} onchange="updateSiteDraftBool('showCoordinatorDetails',this.checked)"></label><label class="editorToggle"><span>Show Players list</span><input type="checkbox" ${cfg.showPlayersList?'checked':''} onchange="updateSiteDraftBool('showPlayersList',this.checked)"></label><label class="editorToggle"><span>Players list expanded by default</span><input type="checkbox" ${cfg.playersDefaultOpen?'checked':''} onchange="updateSiteDraftBool('playersDefaultOpen',this.checked)"></label></div><div class="editorSection pageBuilderSection"><div class="builderTitle"><div><h3>Drag & Drop Page Builder</h3><p class="small">Build directly on a visual canvas. Drop elements where you want them, then open a block only when you need to edit its content. Up/down buttons remain available on phones.</p></div></div><div class="dragBuilderWorkspace"><aside class="blockLibrary"><div class="blockLibraryTitle"><b>Elements</b><span>Drag onto page</span></div>${blockLibrary}</aside><div class="builderCanvas"><div class="builderCanvasHead"><b>Player Page — Custom Area</b><span>${blocks.length} block${blocks.length===1?'':'s'}</span></div><div class="builderSystemBlock"><span class="lockedBadge">LOCKED</span><b>Upcoming Events Header</b><small>Managed by Player Page Layout above</small></div><div class="siteBlocksList">${blockList}<div class="builderDropEnd siteBlockDropTarget" ondragover="siteBlockDragOver(event)" ondragleave="siteBlockDragLeave(event)" ondrop="dropSiteBlockAtEnd(event)"><b>＋ Drop element here</b><span>or click an element in the library</span></div></div><div class="builderSystemBlock"><span class="lockedBadge">SYSTEM</span><b>Featured Event + All Upcoming Events</b><small>Live Firebase event content stays protected from accidental deletion.</small></div></div></div></div>`;
  const labelsSection=`<div class="editorSection"><h3>Waiting / Booking Message</h3><p class="small">Use <b>{min}</b> anywhere in the message and it will automatically show your minimum player count.</p><label>Waiting Title</label><input value="${esc(cfg.waitingTitle)}" oninput="updateSiteDraft('waitingTitle',this.value)"><label>Waiting Message</label><textarea oninput="updateSiteDraft('waitingMessage',this.value)">${esc(cfg.waitingMessage)}</textarea><label>Minimum players before booking</label><input type="number" min="1" max="99" value="${minimumPlayers(cfg)}" oninput="updateSiteDraft('minimumPlayers',Math.max(1,Math.min(99,Number(this.value)||1)))"><div class="editorMessagePreview"><b>${esc(cfg.waitingTitle)}</b><br>${esc(waitingMessageText(cfg))}</div></div><div class="editorSection"><h3>Button & Section Labels</h3><label>Next Play Date Label</label><input value="${esc(cfg.nextPlayLabel)}" oninput="updateSiteDraft('nextPlayLabel',this.value)"><label>All Next Events Heading</label><input value="${esc(cfg.allNextHeading)}" oninput="updateSiteDraft('allNextHeading',this.value)"><label>Signup Heading</label><input value="${esc(cfg.signupHeading)}" oninput="updateSiteDraft('signupHeading',this.value)"><div class="editorTwoCol"><div><label>Interested</label><input value="${esc(cfg.interestedLabel)}" oninput="updateSiteDraft('interestedLabel',this.value)"></div><div><label>Playing</label><input value="${esc(cfg.playingLabel)}" oninput="updateSiteDraft('playingLabel',this.value)"></div></div><label>Expand Label</label><input value="${esc(cfg.expandLabel)}" oninput="updateSiteDraft('expandLabel',this.value)"></div>`;
  const activeSection=tab==='builder'?builderSection:tab==='labels'?labelsSection:brandingSection;
  $('#main').innerHTML=`<section class="siteEditorShell"><div class="siteEditorToolbar"><div><h2>Visual Site Editor <span class="versionChip">v3.3</span></h2><p>Edit, preview, save as draft, then publish when ready.</p></div><div class="editorToolbarActions"><button class="secondary" onclick="saveSiteDraft()">Save Draft</button><button class="secondary" onclick="discardSiteChanges()">Discard</button><button class="secondary" onclick="resetSiteDraft()">Reset</button><button class="publishBtn" onclick="publishSiteChanges()">Publish Changes</button></div></div><div class="siteEditorGrid"><div class="editorPanel"><div class="editorTabs"><button class="${tab==='branding'?'editorTabActive':''}" onclick="setEditorTab('branding')">Branding</button><button class="${tab==='builder'?'editorTabActive':''}" onclick="setEditorTab('builder')">Page Builder</button><button class="${tab==='labels'?'editorTabActive':''}" onclick="setEditorTab('labels')">Labels</button></div>${activeSection}</div><div class="previewPanel"><div class="previewPanelHead"><div><b>Live Preview</b><span>Draft only — not live yet</span></div><div><button data-mode="desktop" class="previewModeBtn ${state.editorPreviewMode==='desktop'?'active':''}" onclick="setEditorPreviewMode('desktop')">Desktop</button><button data-mode="mobile" class="previewModeBtn ${state.editorPreviewMode==='mobile'?'active':''}" onclick="setEditorPreviewMode('mobile')">Mobile</button></div></div><div class="sitePreviewFrame" data-mode="${state.editorPreviewMode}"><div id="siteEditorPreview"></div></div></div></div></section>`;
  renderSiteEditorPreview();
}

function renderApp(){
 const cfg=siteSettings();
 appEl.innerHTML=`<div class="wrap"><div class="hero heroWithBell brandHero" style="background-image:linear-gradient(rgba(0,0,0,${Math.max(0,Math.min(90,Number(cfg.headerOverlay??48)))/100}),rgba(0,0,0,${Math.max(0,Math.min(90,Number(cfg.headerOverlay??48)))/100})),url('${esc(safeImageUrl(cfg.headerBackgroundUrl,DEFAULT_SITE_SETTINGS.headerBackgroundUrl))}')"><div class="brandLeft"><img src="${esc(safeImageUrl(cfg.logoUrl,DEFAULT_SITE_SETTINGS.logoUrl))}" class="powerDinkLogo" alt="PowerDink logo"><span class="brandDivider"></span><div class="brandTitle"><h1>${esc(cfg.appTitle)}</h1></div></div>${cfg.showNotificationBell?renderNotificationButton():''}</div>${renderNotificationDrawer()}<div class="tabs"><button class="tab ${state.view==='player'?'active':''}" onclick="nav('player')">Player</button><button class="tab ${state.view==='calendar'?'active':''}" onclick="nav('calendar')">Calendar</button><button class="tab ${state.view==='profile'?'active':''}" onclick="nav('profile')">Profile</button>${isCoordinator()?`<button class="tab ${state.view==='coordinator'?'active':''}" onclick="nav('coordinator')">Coordinator</button><button class="tab ${state.view==='siteEditor'?'active':''}" onclick="nav('siteEditor')">Site Editor</button>`:''}<button class="tab" onclick="logout()">Logout</button></div><main id="main"></main></div>`;
 applyPublishedTheme();
 if(state.view==='calendar') renderCalendar(); else if(state.view==='profile') renderProfile(); else if(state.view==='coordinator' && isCoordinator()) renderCoordinator(); else if(state.view==='siteEditor' && isCoordinator()) renderSiteEditor(); else renderPlayer();
}
function playerEventInner(ev, opts={}){
 const cfg=siteSettings();
 const c=eventCounts(ev), st=eventStatus(ev), signups=Array.isArray(ev.signups)?ev.signups:[], mine=signups.filter(s=>s.owner===state.user.uid || s.email===state.user.email), family=[state.profile.name,...normalizeChildren(state.profile.children)].filter(Boolean), closed=!canSignup(ev);
 const statusBox = (()=>{
  if(ev.cancelled) return `<div class="notice warn"><b>Event cancelled.</b><br>Please see coordinator details below.</div>`;
  if(ev.closedEvent) return `<div class="notice warn"><b>Closed for event.</b><br>Please see coordinator details below.</div>`;
  if(ev.closed) return `<div class="notice warn"><b>Closed for renovation.</b><br>Please see coordinator details below.</div>`;
  if(ev.full) return `<div class="notice warn"><b>Fully booked.</b><br>This play date is currently full.</div>`;
  if(ev.booked) return `<div class="notice"><b>Booking Details</b><br>${esc(ev.details||'Court booked. Details coming soon.')}</div>`;
  return `<div class="notice warn"><b>${esc(cfg.waitingTitle)}</b><br>${esc(waitingMessageText(cfg))}</div>`;
 })();
 const detailBox = cfg.showCoordinatorDetails && ev.details ? `<div class="notice info"><b>📢 Coordinator Details</b><br>${esc(ev.details)}</div>` : '';
 const closedReason = ev.cancelled?'Cancelled':ev.closedEvent?'Closed for event':ev.closed?'Closed for renovation':st.label==='FULLY BOOKED'?'Fully booked':'Signup closed';
 const signupHtml = closed
  ? `<p><span class="badge red">${closedReason}</span></p>`
  : family.map(n=>{const ex=mine.find(s=>s.name===n);return `<div class="person"><div><b>${esc(n)}</b><div class="small">${ex?esc(ex.status):'Choose Interested or Playing.'}</div></div><div class="actions"><button class="secondary" onclick="upsertSignup('${ev.id}','${idSafe(n)}','interested')">${esc(cfg.interestedLabel)}</button><button class="success" onclick="upsertSignup('${ev.id}','${idSafe(n)}','playing')">${esc(cfg.playingLabel)}</button>${ex?`<button class="danger" onclick="removeMySignup('${ev.id}','${idSafe(n)}')">Remove</button>`:''}</div></div>`}).join('');
 return `${statusBox}${detailBox}${ev.feeOn?feeHtml(ev):''}<h3>${esc(cfg.signupHeading)}</h3>${signupHtml}${cfg.showPlayersList?`<details class="comingDetails" ${cfg.playersDefaultOpen?'open':''}><summary><span>👥 Players (${signups.length})</span></summary><div class="comingList">${signups.length?signups.map(s=>`<div class="person"><span>${s.status==='playing'?'✅':'👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.status)}</span></span></div>`).join(''):'<p class="small">No signups yet.</p>'}</div></details>`:''}`;
}
function eventCardPlayer(ev){
 const c=eventCounts(ev);
 return `<div class="card"><div class="eventTop"><div><div class="big">${fmtDate(ev.date)}</div><p>📍 <b>${esc(ev.location)}</b><br>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</p></div><div>${c.playing>=minimumPlayers(siteSettings())?`<span class="badge red">${minimumPlayers(siteSettings())}+ Ready</span>`:''}${statusBadges(ev)}</div></div>${playerEventInner(ev)}</div>`;
}
function featuredEventCard(ev){
 const c=eventCounts(ev);
 const d=new Date((ev.date||today())+'T12:00:00');
 const day=d.toLocaleDateString(undefined,{weekday:'short'});
 const mon=d.toLocaleDateString(undefined,{month:'short'}).toUpperCase();
 const num=d.toLocaleDateString(undefined,{day:'numeric'});
 const year=d.getFullYear();
 const cfg=siteSettings();
 return `<section class="featuredEvent">${cfg.showNextPlayRibbon?`<div class="featuredRibbon">⭐ ${esc(cfg.nextPlayLabel)}</div>`:''}<div class="featuredDate"><span>${day}</span><b>${mon}</b><strong>${num}</strong><em>${year}</em></div><div class="featuredMain"><div class="featuredTop"><div><h2>${esc(ev.location)}</h2><p>📍 ${esc(ev.location)}<br>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</p></div><div class="featuredBadges">${c.playing>=minimumPlayers(siteSettings())?`<span class="badge red">${minimumPlayers(siteSettings())}+ Ready</span>`:''}${statusBadges(ev)}</div></div>${playerEventInner(ev)}</div></section>`;
}
function collapsedEventCard(ev){
 const c=eventCounts(ev);
 return `<details class="eventDetailsCard"><summary><div class="miniDate"><span>${new Date((ev.date||today())+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})}</span><b>${new Date((ev.date||today())+'T12:00:00').toLocaleDateString(undefined,{month:'short'}).toUpperCase()}</b><strong>${new Date((ev.date||today())+'T12:00:00').toLocaleDateString(undefined,{day:'numeric'})}</strong></div><div class="miniInfo"><b>${esc(ev.location)}</b><span>🕒 ${timeLabel(ev.start)} - ${timeLabel(ev.end)}</span></div><div class="miniStatus">${statusBadges(ev)}</div><div class="miniCount">👥 ${c.total} signed up</div><button class="secondary expandBtn" type="button" onclick="toggleEventDetails(event,this)">${esc(siteSettings().expandLabel)}</button></summary><div class="eventExpanded">${playerEventInner(ev)}</div></details>`;
}
function renderPlayer(){
 const events=[...state.events].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 const upcoming=events.filter(e=>e.date && new Date(e.date+'T23:59:59').getTime()>=Date.now());
 if(!upcoming.length){ $('#main').innerHTML=`<div class="card"><h2>No upcoming play dates</h2><p class="small">Past events are hidden from players. Waiting for the coordinator to add the next event.</p></div>`; return; }
 const current=upcoming[0];
 const future=upcoming.slice(1);
 const cfg=siteSettings(); $('#main').innerHTML=`<div class="sectionTitle"><h2>${esc(cfg.playerHeading)}</h2><p class="small">${esc(cfg.playerSubtitle)}</p></div>${renderCustomBlocks(cfg)}${featuredEventCard(current)}${future.length?`<h2 class="otherTitle">${esc(cfg.allNextHeading)}</h2>${future.map(collapsedEventCard).join('')}`:''}`;
}
function feeHtml(ev){ let v=ev.payment||''; const venmoMatch=String(v).match(/@([A-Za-z0-9_.-]+)/); const venmo=venmoMatch?venmoMatch[1]:''; return `<div class="feeBox"><b>💵 Court Fee:</b> $${esc(ev.fee||'')}<br><b>Payment:</b> ${esc(v)}<div style="margin-top:10px">${venmo?`<button class="secondary" onclick="window.open('https://venmo.com/${venmo}','_blank')">Pay with Venmo</button>`:''}<button class="secondary" onclick="markPaid('${ev.id}')">I Paid</button></div></div>`; }
window.upsertSignup=async(eid,name,status)=>{const ev=state.events.find(e=>e.id===eid); if(!ev)return; let signups=[...(ev.signups||[])]; let s=signups.find(x=>(x.owner===state.user.uid||x.email===state.user.email)&&x.name===name); if(!canSignup(ev)&&!s)return alert('This play date is closed, cancelled, or fully booked.'); if(s){s.status=status;s.updatedAt=new Date().toISOString();} else signups.push({id:crypto.randomUUID(),owner:state.user.uid,email:state.user.email,name,status,checked:false,paid:false,createdAt:new Date().toISOString()}); await updateDoc(doc(db,'events',eid),{signups});};
window.removeMySignup=async(eid,name)=>{const ev=state.events.find(e=>e.id===eid); let signups=(ev.signups||[]).filter(s=>!((s.owner===state.user.uid||s.email===state.user.email)&&s.name===name)); await updateDoc(doc(db,'events',eid),{signups});};
window.markPaid=async(eid)=>{const ev=state.events.find(e=>e.id===eid); let signups=[...(ev.signups||[])]; signups.forEach(s=>{if(s.owner===state.user.uid||s.email===state.user.email)s.paid=true;}); await updateDoc(doc(db,'events',eid),{signups}); alert('Marked as paid. Coordinator will verify payment.');};
function renderCalendar(){
 const [yr,mo]=String(state.calendarMonth||today().slice(0,7)).split('-').map(Number);
 const year=yr||new Date().getFullYear(), month=(mo||1)-1;
 const first=new Date(year,month,1), last=new Date(year,month+1,0);
 const startDay=first.getDay(), days=last.getDate();
 const monthLabel=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const byDate={};
 state.events.forEach(e=>{ if(e.date) (byDate[e.date]??=[]).push(e); });
 const cells=[];
 for(let i=0;i<startDay;i++) cells.push('<div class="calendarCell empty"></div>');
 for(let day=1;day<=days;day++){
   const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
   const count=(byDate[date]||[]).length;
   const selected=date===state.selectedCalendarDate;
   const isToday=date===today();
   cells.push(`<button class="calendarCell ${selected?'selected':''} ${isToday?'today':''}" onclick="selectCalendarDate('${date}')"><span>${day}</span>${count?`<b>${count} event${count>1?'s':''}</b>`:''}</button>`);
 }
 const selectedEvents=byDate[state.selectedCalendarDate]||[];
 const details=selectedEvents.length?selectedEvents.map(e=>{
   const c=eventCounts(e);
   return `<div class="calendarEvent"><div><b>${esc(e.location)}</b><div class="small">${timeLabel(e.start)} - ${timeLabel(e.end)}</div></div><div>${statusBadges(e)}<div class="small">${c.playing} playing • ${c.interested} interested</div></div></div>`;
 }).join(''):'<p class="small">No event scheduled for this date.</p>';
 $('#main').innerHTML=`<div class="card calendarCard"><div class="calendarHeader"><button class="secondary" onclick="changeCalendarMonth(-1)">‹</button><h2>${monthLabel}</h2><button class="secondary" onclick="changeCalendarMonth(1)">›</button></div><div class="calendarWeekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div>${d}</div>`).join('')}</div><div class="calendarGrid">${cells.join('')}</div><div class="calendarSelected"><h3>${fmtDate(state.selectedCalendarDate)}</h3>${details}</div></div>`;
}
window.selectCalendarDate=(date)=>{state.selectedCalendarDate=date; renderCalendar();};
window.changeCalendarMonth=(delta)=>{
 const [y,m]=String(state.calendarMonth).split('-').map(Number);
 const d=new Date(y,m-1+delta,1);
 state.calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
 state.selectedCalendarDate=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
 renderCalendar();
};
function renderProfile(){ const p=state.profile; const username=p.username||''; const accountLabel=isUsernameAccount(state.user.email)?username:state.user.email; $('#main').innerHTML=`<div class="card"><h2>Edit Profile</h2><label>Name</label><input id="profileName" value="${esc(p.name||'')}"><label>${username?'Username':'Email'}</label><input value="${esc(accountLabel)}" disabled><label>Phone optional</label><input id="profilePhone" value="${esc(p.phone||'')}"><label>DUPR / Skill Level optional</label><input id="profileDupr" value="${esc(p.dupr||'')}"><button style="margin-top:12px" onclick="saveProfile()">Save Profile</button></div><div class="card"><h2>Change Password</h2><div class="passwordBox"><input id="newPassword" type="password" placeholder="New password"><button class="secondary" onclick="togglePass('newPassword',this)">Show</button></div><button style="margin-top:10px" onclick="changeMyPassword()">Change Password</button></div><div class="card"><h2>Family Members</h2>${normalizeChildren(p.children).map((n,i)=>`<div class="person"><b>${esc(n)}</b><span><button class="secondary" onclick="editChild(${i})">Edit</button> <button class="danger" onclick="deleteChild(${i})">Delete</button></span></div>`).join('')||'<p class="small">No children added yet.</p>'}<div class="row"><input id="childName" placeholder="Child name"><button onclick="addChild()">Add Child</button></div></div>`; }
window.saveProfile=async()=>{await updateDoc(doc(db,'users',state.user.uid),{name:$('#profileName').value.trim(),phone:$('#profilePhone').value.trim(),dupr:$('#profileDupr').value.trim()}); alert('Profile saved.');};
window.changeMyPassword=async()=>{const p=$('#newPassword').value; if(p.length<6)return alert('Use at least 6 characters.'); try{await updatePassword(state.user,p); alert('Password changed.');}catch(e){alert(friendlyFirebaseError(e)+' You may need to log out and log in again first.');}};
window.addChild=async()=>{const n=$('#childName').value.trim(); if(!n)return; const children=[...normalizeChildren(state.profile.children),n]; await updateDoc(doc(db,'users',state.user.uid),{children});};
window.editChild=async(i)=>{const children=normalizeChildren(state.profile.children); const old=children[i]; const n=prompt('Child name:',old); if(!n)return; children[i]=n; await updateDoc(doc(db,'users',state.user.uid),{children});};
window.deleteChild=async(i)=>{const children=normalizeChildren(state.profile.children); if(!confirm('Delete this child from profile?'))return; children.splice(i,1); await updateDoc(doc(db,'users',state.user.uid),{children});};
function locationOptions(){ const names=state.locations.map(l=>l.name||l.location||l.title||l.id).filter(Boolean); const all=names.length?names:DEFAULT_LOCATIONS; return all.map(l=>`<option>${esc(l)}</option>`).join(''); }
function renderCoordinator(){
 const events=[...state.events].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 const upcoming=events.filter(e=>!e.date || new Date(e.date+'T23:59:59').getTime()>=Date.now());
 const past=events.filter(e=>e.date && new Date(e.date+'T23:59:59').getTime()<Date.now()).reverse();
 $('#main').innerHTML=`<div class="dash"><div class="stat"><span>Events</span><b>${state.events.length}</b></div><div class="stat"><span>Users</span><b>Live</b></div><div class="stat"><span>Mode</span><b>Cloud</b></div></div><div class="card siteEditorPromo"><div><h2>Site Editor</h2><p class="small">Change player-page text, labels, visibility, and accent color with a live Desktop/Mobile preview. Publish only when you are ready.</p></div><button onclick="nav('siteEditor')">Open Site Editor</button></div><div class="card"><h2>Create / Edit Event</h2><input id="editId" type="hidden"><div class="row"><div><label>Date</label><input id="date" type="date" value="${today()}"></div><div><label>Start</label><input id="start" type="time" value="19:00"></div><div><label>End</label><input id="end" type="time" value="21:00"></div></div><label>Location</label><select id="location">${locationOptions()}</select><div class="row"><div><label>Signup Cutoff</label><select id="cutoff"><option value="open">Keep open</option><option value="1">Close signup 1 hour before</option><option value="2">Close signup 2 hours before</option><option value="4">Close signup 4 hours before</option></select></div><div><label>Max players</label><input id="max" type="number" value="12"></div></div><div class="statusBox"><label>Event Status Options</label><p class="small">You may choose more than one option.</p><div class="statusGrid"><label class="statusChoice"><input id="booked" type="checkbox"><span>✅ Court Booked</span></label><label class="statusChoice"><input id="closed" type="checkbox"><span>🚧 Closed for Renovation</span></label><label class="statusChoice"><input id="closedEvent" type="checkbox"><span>🎉 Closed for Event</span></label><label class="statusChoice"><input id="cancelled" type="checkbox"><span>❌ Cancelled</span></label><label class="statusChoice"><input id="full" type="checkbox"><span>👥 Fully Booked</span></label></div></div><label>Booking Details</label><textarea id="details"></textarea><div class="toggleLine"><input id="feeOn" type="checkbox"><b>Collect court fee?</b></div><div class="row"><input id="fee" placeholder="Fee e.g. 5"><input id="payment" placeholder="Venmo @name, Zelle email, cash"></div><div class="row" style="margin-top:12px"><button onclick="saveEvent()">Save Event</button><button class="secondary" onclick="clearEventForm()">Clear</button></div></div><div class="card"><h2>Upcoming / Current Events</h2>${upcoming.length?upcoming.map(e=>eventCardCoord(e,false)).join(''):'<p class="small">No upcoming events.</p>'}</div><div class="card"><h2>Past Events</h2><p class="small">Past events remain here until you delete them.</p>${past.length?past.map(e=>eventCardCoord(e,true)).join(''):'<p class="small">No past events.</p>'}</div><div class="card"><h2>Publish Notification</h2><p class="small">Send an in-app message to all players. This is free and saved in Firebase.</p><label>Title</label><input id="manualNotifTitle" placeholder="Example: DinkHouse update"><label>Message</label><textarea id="manualNotifMessage" placeholder="Type your update here..."></textarea><label>Type</label><select id="manualNotifType"><option value="info">Info</option><option value="event">New Event</option><option value="booked">Booked</option><option value="full">Fully Booked</option><option value="renovation">Closed for Renovation</option><option value="closedEvent">Closed for Event</option><option value="cancelled">Cancelled</option></select><button style="margin-top:12px" onclick="publishManualNotification()">Publish Notification</button></div><div class="card"><h2>Manage Locations</h2>${state.locations.map(l=>`<div class="person"><b>${esc(l.name||l.location||l.title||l.id)}</b><span><button class="secondary" onclick="renameLocation('${l.id}')">Edit</button> <button class="danger" onclick="deleteLocation('${l.id}')">Delete</button></span></div>`).join('')||'<p class="small">No locations yet.</p>'}<div class="row"><input id="newLocation" placeholder="New location"><button onclick="addLocation()">Add Location</button></div></div>`;
}
function eventCardCoord(ev,isPast=false){
 const c=eventCounts(ev);
 return `<details class="coordEventCard"><summary><div><div class="big">${fmtDate(ev.date)} — ${esc(ev.location)}</div><p>${timeLabel(ev.start)} - ${timeLabel(ev.end)} • ${c.playing} playing • ${c.interested} interested ${isPast?'• Past event':''}</p></div><div class="coordSummaryRight">${statusBadges(ev)}<span class="coordExpandText">Expand</span></div></summary><div class="coordEventBody"><div class="row"><button class="secondary" onclick="editEvent('${ev.id}')">Edit</button><button class="danger" onclick="deleteEvent('${ev.id}')">Delete</button><button onclick="exportCsv('${ev.id}')">Export CSV</button></div><h3>Players</h3>${(ev.signups||[]).length?(ev.signups||[]).map(s=>`<div class="person"><span>${s.status==='playing'?'✅':'👍'} <b>${esc(s.name)}</b> <span class="small">${esc(s.email||s.owner||'')}</span> ${s.paid?'<span class="badge green">Paid</span>':''}</span><span><button class="secondary" onclick="toggleCheck('${ev.id}','${s.id}')">${s.checked?'Checked In':'Check In'}</button> <button class="danger" onclick="removeSignup('${ev.id}','${s.id}')">Remove</button></span></div>`).join(''):'<p class="small">No signups yet.</p>'}</div></details>`;
}

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
