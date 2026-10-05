const SUPABASE_URL = "https://vvexorzjkpwduykinwsw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RoMHq19grLJWNu95uPSwug_XwiKt2bB";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Web Push configuration. IMPORTANT: this must be the 65-byte VAPID public key (usually 87 base64url characters).
// Do not put VAPID_PRIVATE_KEY here.
const PUSH_VAPID_PUBLIC_KEY = "BKr8bAqliSKJYef6L974YhlnjPzWUqBI4tw9zw4fpihhv0E6Aw-pI5iN2ZLIv-P7klAvkVTJRXYldnd1hQfPzsg";



let authRole = null;
let authToken = null;
let authName = null;
let giverLoginList = [];
let adminLoginUnlocked = localStorage.getItem("advance_manager_device") === "1";

function setAuthError(msg){const el=$("authError");if(el)el.textContent=msg||"";}
function setAuthBusy(id,busy,label){const b=$(id);if(!b)return;b.disabled=busy;if(label&&!b.dataset.originalLabel)b.dataset.originalLabel=b.textContent;b.textContent=busy?"جارٍ الدخول...":(label||b.dataset.originalLabel||b.textContent);}
function showAuthScreen(){$("authScreen")?.classList.remove("hidden");document.body.classList.remove("giver-mode");}
function hideAuthScreen(){$("authScreen")?.classList.add("hidden");}
function applyRoleUI(){const giverMode=authRole==='giver';document.body.classList.toggle("giver-mode",giverMode);$("currentUserName").textContent=authName||"";const ro=$("giverReadonly");if(ro){ro.textContent=giverMode?`✓ ${authName}`:"";ro.style.display=giverMode?'block':'none';}if(giverMode){$("giverSelect").value="";refreshCustomSelect("giverSelect","اختر الاسم");}}
function saveAuth(role,token,name){authRole=role;authToken=token;authName=name;localStorage.setItem("advance_auth",JSON.stringify({role,token,name}));hideAuthScreen();applyRoleUI();}
function clearAuth(){authRole=null;authToken=null;authName=null;localStorage.removeItem("advance_auth");sessionStorage.removeItem("advance_auth");}
function restoreAuth(){try{
  const raw=localStorage.getItem("advance_auth")||sessionStorage.getItem("advance_auth");
  const x=JSON.parse(raw||"null");
  if(x?.role&&x?.token&&x?.name){
    authRole=x.role;authToken=x.token;authName=x.name;
    localStorage.setItem("advance_auth",JSON.stringify({role:x.role,token:x.token,name:x.name}));
    sessionStorage.removeItem("advance_auth");
    return true;
  }
}catch{}return false;}

async function loadGiverLoginList(){
  setAuthError("");
  // أسماء المانحين في شاشة الدخول تُجلب عبر الدالة الآمنة حتى لا تعتمد على RLS المباشر للجدول.
  let {data,error}=await db.rpc("get_active_givers_for_login");
  if(error){
    // توافق مع النسخ التي لا تحتوي الدالة بعد.
    const fallback=await db.from("advance_givers").select("id,name,is_active").eq("is_active",true).order("name");
    data=fallback.data; error=fallback.error;
  }
  if(error){setAuthError("تعذر تحميل أسماء المانحين: "+error.message);return;}
  giverLoginList=(data||[]).map(g=>({...g,password_set:null}));
  const s=$("loginNameSelect");
  s.innerHTML='<option value="">اختر الاسم</option>';
  giverLoginList.forEach(g=>s.insertAdjacentHTML("beforeend",`<option value="giver:${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`));
  s.insertAdjacentHTML("beforeend",'<option value="admin">عمر اسماعيل</option>');
  updateUnifiedLoginMode();
}

async function revealAdminLogin(){
  if(adminLoginUnlocked)return;
  adminLoginUnlocked=true;
  const s=$("loginNameSelect");
  if(s && ![...s.options].some(o=>o.value==='admin')) s.insertAdjacentHTML("beforeend",'<option value="admin">عمر اسماعيل</option>');
  setAuthError("تم إظهار اسم المدير على هذا الجهاز");
  setTimeout(()=>setAuthError(""),1800);
}

function updateUnifiedLoginMode(){
  const value=$("loginNameSelect")?.value||"";
  const pass=$("loginPassword");
  const firstBtn=$("showFirstSetupBtn");
  const existing=$("loginExisting");
  const setup=$("giverFirstSetup");
  setup?.classList.add("hidden");
  existing?.classList.remove("hidden");
  firstBtn?.classList.toggle("hidden",!value.startsWith("giver:"));
  if(pass){pass.value="";pass.placeholder=value==='admin'?"كلمة مرور المدير":"أدخل كلمة المرور";}
}

function showFirstPasswordSetup(){
  const value=$("loginNameSelect")?.value||"";
  if(!value.startsWith("giver:")) return setAuthError("اختر اسم المانح أولاً");
  $("loginExisting")?.classList.add("hidden");
  $("giverFirstSetup")?.classList.remove("hidden");
  setAuthError("");
}

async function unifiedLogin(){
  setAuthError("");
  const value=$("loginNameSelect").value;
  const password=$("loginPassword").value;
  if(!value)return setAuthError("اختر اسمك أولاً");
  if(value==='admin'){
    if(!password)return setAuthError("أدخل كلمة مرور المدير");
    setAuthBusy("loginBtn",true,"دخول");
    const {data,error}=await db.rpc("advance_manager_login",{p_username:"admin",p_password:password});
    setAuthBusy("loginBtn",false,"دخول");
    if(error)return setAuthError("بيانات الدخول غير صحيحة");
    localStorage.setItem("advance_manager_device","1");
    saveAuth("manager",data.token,"عمر اسماعيل");
    await startApp();
    return;
  }
  const giverId=value.replace(/^giver:/,'');
  if(!password)return setAuthError("أدخل كلمة المرور");
  setAuthBusy("loginBtn",true,"دخول");
  const {data,error}=await db.rpc("advance_giver_login",{p_giver_id:giverId,p_password:password});
  setAuthBusy("loginBtn",false,"دخول");
  if(error){
    const msg=String(error.message||"");
    if(msg.includes("تم إعدادها مسبقاً")||msg.includes("بيانات الدخول غير صحيحة")){
      return setAuthError("بيانات الدخول غير صحيحة. إذا كان هذا أول دخول، استخدم خيار إعداد كلمة المرور.");
    }
    return setAuthError("تعذر تسجيل الدخول: "+msg);
  }
  saveAuth("giver",data.token,data.giver_name);
  await startApp();
}

async function giverFirstPassword(){
  setAuthError("");
  const value=$("loginNameSelect").value;
  const id=value.replace(/^giver:/,'');
  const p1=$("giverNewPassword").value,p2=$("giverConfirmPassword").value;
  if(!value.startsWith('giver:'))return setAuthError("اختر اسم المانح أولاً");
  if(!/^(?:\d{6,}|(?=.*[A-Za-z])[A-Za-z0-9]{6,})$/.test(p1))return setAuthError("كلمة المرور يجب أن تكون 6 خانات أو أكثر، أرقام فقط أو حروف وأرقام بدون رموز");
  if(p1!==p2)return setAuthError("كلمتا المرور غير متطابقتين");
  setAuthBusy("giverSetupBtn",true,"حفظ كلمة المرور والدخول");
  const {error:setError}=await db.rpc("advance_giver_set_first_password",{p_giver_id:id,p_password:p1});
  if(setError){setAuthBusy("giverSetupBtn",false,"حفظ كلمة المرور والدخول");return setAuthError(setError.message.includes("مسبقاً")?"تم إعداد كلمة المرور لهذا الاسم مسبقاً":"تعذر إعداد كلمة المرور");}
  const {data,error}=await db.rpc("advance_giver_login",{p_giver_id:id,p_password:p1});
  setAuthBusy("giverSetupBtn",false,"حفظ كلمة المرور والدخول");
  if(error)return setAuthError("تم حفظ كلمة المرور لكن تعذر تسجيل الدخول. حاول مرة أخرى.");
  saveAuth("giver",data.token,data.giver_name);
  await startApp();
}

function logout(){clearAuth();location.reload();}

let employees=[], givers=[], advances=[];
let leaves=[];
let selectedAdvanceId=null;
let selectedLeaveId=null;

function leaveTypeLabel(type){return type==='time'?'إجازة زمنية':'إجازة بالأيام';}
function leaveDateLabel(d){return d?new Date(d+'T00:00:00').toLocaleDateString('en-GB'):'';}
function leaveRangeLabel(l){
  if(l.leave_type==='time') return `${leaveDateLabel(l.leave_date)} ${l.start_time||''} - ${l.end_time||''}`;
  if(l.start_date===l.end_date) return leaveDateLabel(l.start_date);
  return `${leaveDateLabel(l.start_date)} - ${leaveDateLabel(l.end_date)}`;
}
function currentGiverId(){return givers.find(g=>g.name===authName)?.id||null;}
function isLeaveActive(l){
  const today=isoToday();
  if(l.leave_type==='time') return l.leave_date===today;
  return !!l.start_date && !!l.end_date && l.start_date<=today && l.end_date>=today;
}
async function loadLeaves(){
  const {data,error}=await db.from('advance_leaves').select('id,employee_id,giver_id,leave_type,leave_date,start_date,end_date,start_time,end_time,notes,created_at,employees:employee_id(name),advance_givers:giver_id(name)').order('created_at',{ascending:false});
  if(error){console.warn('Leaves table not ready:',error.message);leaves=[];renderLeaves();return;}
  leaves=data||[]; renderLeaves();
}
function renderLeaves(){
  const active=leaves.filter(isLeaveActive);
  const body=$('leavesTable')?.querySelector('tbody');
  if(body){
    body.innerHTML=leaves.map((l,i)=>{
      const en=l.employees?.name||'غير محدد', gn=l.advance_givers?.name||'غير محدد';
      const actions=authRole==='manager' ? `<button class="mini-edit" onclick="editLeave('${l.id}')">تعديل</button><button class="mini-danger" onclick="deleteLeave('${l.id}')">حذف</button>` : '—';
      return `<tr><td>${i+1}</td><td>${escapeHtml(en)}</td><td>${leaveTypeLabel(l.leave_type)}</td><td>${escapeHtml(leaveRangeLabel(l))}</td><td>${escapeHtml(gn)}</td><td>${escapeHtml(l.notes||'')}</td><td>${actions}</td></tr>`;
    }).join('') || `<tr><td colspan="7" class="empty-cell">لا توجد إجازات مسجلة</td></tr>`;
  }
  const summaryBody=$('leaveSummary')?.querySelector('tbody');
  if(summaryBody){
    const byEmp={};
    leaves.forEach(l=>{const n=l.employees?.name||'غير محدد';if(!byEmp[n])byEmp[n]={count:0,active:0};byEmp[n].count++;if(isLeaveActive(l))byEmp[n].active++;});
    summaryBody.innerHTML=Object.entries(byEmp).sort((a,b)=>b[1].count-a[1].count).map(([n,v])=>`<tr><td>${escapeHtml(n)}</td><td>${v.count}</td><td>${v.active?'مجاز الآن':'—'}</td></tr>`).join('') || `<tr><td colspan="3" class="empty-cell">لا توجد إجازات</td></tr>`;
  }
  if($('leaveCount'))$('leaveCount').textContent=String(leaves.length);
  if($('activeLeaveCount'))$('activeLeaveCount').textContent=String(active.length);
}
function toggleLeaveFields(){
  const type=$('leaveType')?.value;
  $('dayLeaveFields')?.classList.toggle('hidden',type!=='day');
  $('timeLeaveFields')?.classList.toggle('hidden',type!=='time');
}
function openLeaveModal(id=null){
  if(!authRole) return toast('سجل الدخول أولاً');
  if(id && authRole!=='manager') return toast('التعديل للمدير فقط');
  selectedLeaveId=id||null;
  $('leaveModalTitle').textContent=id?'تعديل الإجازة':'إضافة إجازة';
  $('leaveEmployee').innerHTML='<option value="">اختر الموظف</option>'+employees.filter(x=>x.is_active).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
  $('leaveGiver').innerHTML='<option value="">اختر الاسم</option>'+givers.filter(x=>x.is_active).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
  $('leaveGiverWrap').style.display=authRole==='giver'?'none':'';
  if(id){
    const l=leaves.find(x=>x.id===id); if(!l)return;
    $('leaveEmployee').value=l.employee_id||'';$('leaveGiver').value=l.giver_id||'';$('leaveType').value=l.leave_type||'day';
    $('leaveStartDate').value=l.start_date||'';$('leaveEndDate').value=l.end_date||'';$('leaveDate').value=l.leave_date||'';$('leaveStart').value=l.start_time||'';$('leaveEnd').value=l.end_time||'';$('leaveNotes').value=l.notes||'';
  }else{
    $('leaveEmployee').value='';$('leaveGiver').value=authRole==='giver'?(currentGiverId()||''):'';$('leaveType').value='day';$('leaveStartDate').value=isoToday();$('leaveEndDate').value=isoToday();$('leaveDate').value=isoToday();$('leaveStart').value='';$('leaveEnd').value='';$('leaveNotes').value='';
  }
  toggleLeaveFields();$('leaveModal').classList.add('show');
}
async function saveLeave(){
  if(!authRole) return toast('سجل الدخول أولاً');
  if(selectedLeaveId && authRole!=='manager') return toast('التعديل للمدير فقط');
  const employee_id=$('leaveEmployee').value,leave_type=$('leaveType').value,notes=$('leaveNotes').value.trim()||null;
  if(!employee_id)return toast('اختر الموظف');
  const giver_id=authRole==='giver'?currentGiverId():$('leaveGiver').value;
  if(!giver_id)return toast('تعذر تحديد مانح/مسؤول الإجازة');
  let row={employee_id,giver_id,leave_type,leave_date:null,start_date:null,end_date:null,start_time:null,end_time:null,notes};
  if(leave_type==='time'){
    const leave_date=$('leaveDate').value,start_time=$('leaveStart').value,end_time=$('leaveEnd').value;
    if(!leave_date||!start_time||!end_time)return toast('أدخل تاريخ ووقت الإجازة');
    if(start_time>=end_time)return toast('وقت النهاية يجب أن يكون بعد وقت البداية');
    row.leave_date=leave_date;row.start_time=start_time;row.end_time=end_time;
  }else{
    const start_date=$('leaveStartDate').value,end_date=$('leaveEndDate').value;
    if(!start_date||!end_date)return toast('أدخل تاريخ بداية ونهاية الإجازة');
    if(end_date<start_date)return toast('تاريخ النهاية يجب أن يكون بعد البداية');
    row.start_date=start_date;row.end_date=end_date;
  }
  let result;
  if(selectedLeaveId) result=await db.from('advance_leaves').update(row).eq('id',selectedLeaveId);
  else result=await db.from('advance_leaves').insert(row);
  if(result.error)return toast('تعذر حفظ الإجازة: '+result.error.message);
  const wasEdit=!!selectedLeaveId; $('leaveModal').classList.remove('show'); selectedLeaveId=null; await loadLeaves();
  await emitAdvancePushEvent(wasEdit?'leave_updated':'leave_added',wasEdit?'تعديل إجازة':'إضافة إجازة',wasEdit?'تم تعديل إجازة في نظام سلف موظفي وعمال أمازون':'تمت إضافة إجازة في نظام سلف موظفي وعمال أمازون');
  toast(wasEdit?'تم تعديل الإجازة بنجاح':'تمت إضافة الإجازة بنجاح'); if(!wasEdit) openLeavesMenu(); else openLeavesMenu();
}
window.editLeave=id=>openLeaveModal(id);
async function deleteLeave(id){
  if(authRole!=='manager')return toast('الحذف للمدير فقط');
  confirmBox('هل تريد حذف الإجازة المحددة؟',async()=>{const {error}=await db.from('advance_leaves').delete().eq('id',id);if(error)return toast('تعذر حذف الإجازة: '+error.message);await loadLeaves();await emitAdvancePushEvent('leave_deleted','حذف إجازة','تم حذف إجازة من نظام سلف موظفي وعمال أمازون');toast('تم حذف الإجازة بنجاح');});
}

let pushRegistrationPromise=null;
let pushSetupStarted=false;

function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return Promise.resolve(null);
  if(!pushRegistrationPromise){
    pushRegistrationPromise=navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"}).catch(err=>{
      console.warn("Service Worker registration failed",err);
      return null;
    });
  }
  return pushRegistrationPromise;
}

function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const rawData=atob((base64String+padding).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
}

async function subscribeForPush(){
  if(pushSetupStarted) return false;
  if(!authRole || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  if(!PUSH_VAPID_PUBLIC_KEY || PUSH_VAPID_PUBLIC_KEY.length < 80){
    console.warn("Web Push public key is not configured.");
    return false;
  }
  if(Notification.permission==="denied") return false;
  pushSetupStarted=true;
  try{
    const permission=Notification.permission==="granted" ? "granted" : await Notification.requestPermission();
    if(permission!=="granted") return false;
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY)
      });
    }
    const json=subscription.toJSON();
    if(!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const {error}=await db.rpc("save_advance_push_subscription",{
      p_endpoint:json.endpoint,
      p_p256dh:json.keys.p256dh,
      p_auth:json.keys.auth,
      p_role:authRole,
      p_display_name:authName||null,
      p_user_agent:navigator.userAgent
    });
    if(error){
      console.warn("Push subscription save failed",error);
      return false;
    }
    localStorage.setItem("advance_push_registered","1");
    return true;
  }catch(err){
    console.warn("Push setup failed",err);
    return false;
  }finally{
    pushSetupStarted=false;
  }
}

async function emitAdvancePushEvent(eventType,title,body){
  try{
    const {error:insertError}=await db.from("advance_push_events").insert({event_type:eventType,title,body});
    if(insertError){ console.warn("Push event insert failed",insertError); return false; }
    const {error:functionError}=await db.functions.invoke("send-push-notifications",{body:{trigger:"event"}});
    if(functionError){ console.warn("Push sender invoke failed",functionError); return false; }
    return true;
  }catch(err){
    console.warn("Push event failed",err);
    return false;
  }
}

function installAutomaticPushSetup(){
  if(window.__amazonPushClickInstalled) return;
  window.__amazonPushClickInstalled=true;
  const handler=()=>{
    if(!authRole) return;
    subscribeForPush().catch(()=>{});
    if(window.Notification?.permission==="granted" || localStorage.getItem("advance_push_registered")=="1")
      document.removeEventListener("click",handler,true);
  };
  document.addEventListener("click",handler,true);
}

async function startApp(){
  applyRoleUI();
  try{
    await registerServiceWorker();
    await loadPeople();
    await loadAdvances();
    await loadLeaves();
    await loadSalaries();
    await loadPenalties();
    try{ await navigator.serviceWorker.ready.then(r=>r.update()); }catch{}
    setMainView('home');
    installAutomaticPushSetup();
    if(window.Notification?.permission==="granted") subscribeForPush().catch(()=>{});
  }catch(e){
    console.error(e);
    toast("تعذر تحميل البيانات: "+(e.message||e));
  }
}

const $ = id => document.getElementById(id);
const money = n => Number(n||0).toLocaleString("en-US");
const isoToday = () => new Date().toISOString().slice(0,10);
const currentMonthKey = () => isoToday().slice(0,7);
const arDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-GB") : "";
const monthLabel = d => {
  const x = d ? new Date(d+"T00:00:00") : new Date();
  return `${x.getMonth()+1} / ${x.getFullYear()}`;
};
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2500); }

function setMonthHeader(){
  const d=isoToday();
  const monthTitleEl=$("monthTitle"); if(monthTitleEl) monthTitleEl.textContent=`شهر ${monthLabel(d)}`;
  $("summaryMonth").textContent=monthLabel(d);
}

async function loadPeople(){
  const [e,g]=await Promise.all([
    db.from("employees").select("*").order("name"),
    db.from("advance_givers").select("*").order("name")
  ]);
  if(e.error||g.error) throw (e.error||g.error);
  employees=e.data||[]; givers=g.data||[];
  fillSelect("employeeSelect",employees,"اختر الموظف");
  fillSelect("giverSelect",givers,"اختر الاسم");
}

function fillSelect(id, data, placeholder){
  const s=$(id);
  s.innerHTML=`<option value="">${escapeHtml(placeholder)}</option>`;
  data.filter(x=>x.is_active).forEach(x=>s.insertAdjacentHTML("beforeend",`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`));
  refreshCustomSelect(id, placeholder);
}

function refreshCustomSelect(id, placeholder){
  const select=$(id);
  if(!select) return;
  const picker=select.closest('.custom-select');
  if(!picker) return;
  const display=picker.querySelector('.select-display');
  const span=display?.querySelector('span');
  const optionsBox=picker.querySelector('.select-options');
  if(!display || !span || !optionsBox) return;
  const selected=select.options[select.selectedIndex];
  span.textContent=selected?.value ? selected.textContent : placeholder;
  display.classList.toggle('has-value',!!selected?.value);
  optionsBox.innerHTML='';
  [...select.options].filter(o=>o.value).forEach(o=>{
    const item=document.createElement('button');
    item.type='button';
    item.className='select-option';
    item.dataset.value=o.value;
    item.innerHTML=`<span>${escapeHtml(o.textContent)}</span>`;
    if(o.value===select.value) item.classList.add('selected');
    item.onclick=()=>{
      select.value=o.value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      closeCustomSelect(picker);
      refreshCustomSelect(id,placeholder);
    };
    optionsBox.appendChild(item);
  });
}

function positionCustomMenu(picker){
  const menu=picker.querySelector('.select-menu');
  const display=picker.querySelector('.select-display');
  if(!menu || !display) return;
  if(window.innerWidth>900){ menu.style.left=''; menu.style.right=''; menu.style.top=''; menu.style.width=''; return; }
  const r=display.getBoundingClientRect();
  const margin=8;
  const width=Math.min(window.innerWidth-margin*2,420);
  let left=Math.max(margin,Math.min(r.right-width,window.innerWidth-width-margin));
  let top=r.bottom+6;
  const maxH=Math.min(window.innerHeight*0.62,420);
  if(top+maxH>window.innerHeight-margin) top=Math.max(margin,r.top-maxH-6);
  menu.style.left=`${left}px`; menu.style.right='auto'; menu.style.top=`${top}px`; menu.style.width=`${width}px`; menu.style.maxHeight=`${maxH}px`;
}
function openCustomSelect(picker){
  document.querySelectorAll('.custom-select.open').forEach(x=>{if(x!==picker) closeCustomSelect(x);});
  picker.classList.add('open');
  positionCustomMenu(picker);
  const search=picker.querySelector('.select-search');
  if(search){ search.value=''; filterCustomOptions(picker,''); setTimeout(()=>search.focus(),0); }
}
function closeCustomSelect(picker){
  picker.classList.remove('open');
  const menu=picker.querySelector('.select-menu');
  if(menu && window.innerWidth<=900){ menu.style.left=''; menu.style.right=''; menu.style.top=''; menu.style.width=''; }
}
function filterCustomOptions(picker,term){
  const q=String(term||'').trim().toLocaleLowerCase('ar');
  picker.querySelectorAll('.select-option').forEach(item=>{
    const text=item.textContent.toLocaleLowerCase('ar');
    item.style.display=(!q || text.includes(q))?'flex':'none';
  });
}
window.addEventListener('resize',()=>{ document.querySelectorAll('.custom-select.open').forEach(positionCustomMenu); });
window.addEventListener('scroll',()=>{ document.querySelectorAll('.custom-select.open').forEach(positionCustomMenu); },{passive:true});

function initCustomSelects(){
  document.querySelectorAll('.custom-select').forEach(picker=>{
    const select=picker.querySelector('.native-select');
    const display=picker.querySelector('.select-display');
    const search=picker.querySelector('.select-search');
    const id=select.id;
    const placeholder=select.options[0]?.textContent||'اختر';
    display.onclick=()=>{
      if(picker.classList.contains('open')) closeCustomSelect(picker); else openCustomSelect(picker);
    };
    display.ondblclick=()=>{
      if(id==='employeeSelect') openPeople('employees');
      if(id==='giverSelect') openPeople('givers');
    };
    select.addEventListener('change',()=>refreshCustomSelect(id,placeholder));
    search?.addEventListener('input',e=>filterCustomOptions(picker,e.target.value));
    refreshCustomSelect(id,placeholder);
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.custom-select')) document.querySelectorAll('.custom-select.open').forEach(closeCustomSelect);
  });
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

async function loadAdvances(){
  const {data,error}=await db.from("advances").select(`
    id,operation_no,employee_id,giver_id,amount,advance_date,notes,
    employees:employee_id(name),
    advance_givers:giver_id(name)
  `).order("advance_date",{ascending:false}).order("created_at",{ascending:false});
  if(error) throw error;
  advances=data||[];
  renderAdvances();
}

const PERSON_COLORS = [
  "#e8f5e9", "#e3f2fd", "#fff3e0", "#f3e5f5", "#e0f7fa", "#fff8e1",
  "#fce4ec", "#ede7f6", "#e8eaf6", "#f1f8e9", "#fbe9e7", "#e0f2f1"
];
function personColor(name){
  const text=String(name||"");
  let hash=0;
  for(let i=0;i<text.length;i++) hash=((hash<<5)-hash)+text.charCodeAt(i)|0;
  return PERSON_COLORS[Math.abs(hash)%PERSON_COLORS.length];
}
function colorStyle(name){
  const c=personColor(name);
  return `background:${c};`;
}

function renderAdvances(){
  // الصفحة الرئيسية تعرض سلف الشهر الحالي فقط. السلف السابقة تبقى محفوظة في قاعدة البيانات.
  const month=currentMonthKey();
  const rows=advances.filter(a=>String(a.advance_date).slice(0,7)===month);
  const body=$("advancesTable").querySelector("tbody");
  body.innerHTML="";
  rows.forEach((a,i)=>{
    const tr=document.createElement("tr");
    if(a.id===selectedAdvanceId) tr.classList.add("selected");
    tr.dataset.id=a.id;
    const employeeName=a.employees?.name||"";
    tr.style.cssText=colorStyle(employeeName);
    tr.title=`${employeeName} — لون مميز لهذا الموظف`;
    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${escapeHtml(a.operation_no)}</td>
      <td>${arDate(a.advance_date)}</td>
      <td class="person-cell" style="background:${personColor(employeeName)}">${escapeHtml(employeeName)}</td>
      <td>${money(a.amount)}</td>
      <td>${escapeHtml(a.advance_givers?.name||"")}</td>
      <td>${escapeHtml(a.notes||"")}</td>`;
    tr.onclick=()=>selectAdvance(a.id);
    body.appendChild(tr);
  });
  renderSummaries(rows);
}

function selectAdvance(id){
  selectedAdvanceId=id;
  const a=advances.find(x=>x.id===id);
  if(!a) return;
  $("employeeSelect").value=a.employee_id||"";
  $("amount").value=a.amount;
  $("advanceDate").value=a.advance_date;
  $("giverSelect").value=a.giver_id||"";
  $("notes").value=a.notes||"";
  refreshCustomSelect("employeeSelect","اختر الموظف");
  refreshCustomSelect("giverSelect","اختر الاسم");
  setMonthHeader(); renderAdvances();
}

function renderSummaries(rows){
  const byGiver={}, byEmp={};
  rows.forEach(a=>{
    const gn=a.advance_givers?.name||"غير محدد", en=a.employees?.name||"غير محدد";
    if(!byGiver[gn]) byGiver[gn]={count:0,total:0}; byGiver[gn].count++; byGiver[gn].total+=Number(a.amount);
    if(!byEmp[en]) byEmp[en]={count:0,total:0}; byEmp[en].count++; byEmp[en].total+=Number(a.amount);
  });
  $("giverSummary").querySelector("tbody").innerHTML=Object.entries(byGiver).map(([n,v])=>`<tr><td>${escapeHtml(n)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد بيانات</td></tr>`;
  $("employeeSummary").querySelector("tbody").innerHTML=Object.entries(byEmp).map(([n,v])=>`<tr style="background:${personColor(n)}"><td class="person-cell" style="background:${personColor(n)}">${escapeHtml(n)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد بيانات</td></tr>`;
  const total=rows.reduce((s,a)=>s+Number(a.amount),0);
  $("opCount").textContent=rows.length;
  $("employeeCount").textContent=new Set(rows.map(a=>a.employee_id)).size;
  $("giverCount").textContent=new Set(rows.map(a=>a.giver_id).filter(Boolean)).size;
  $("grandTotal").textContent=`${money(total)} د.ع`;
  renderPrintDetails(rows);
}

function renderPrintDetails(rows){
  const body=$("printDetailsBody");
  if(!body) return;
  $("detailsMonth").textContent=monthLabel(isoToday());
  $("detailsCount").textContent=rows.length;
  body.innerHTML=rows.map((a,i)=>{
    const employeeName=a.employees?.name||"";
    return `<tr style="background:${personColor(employeeName)}">
      <td>${i+1}</td>
      <td>${escapeHtml(a.operation_no)}</td>
      <td>${arDate(a.advance_date)}</td>
      <td class="person-cell" style="background:${personColor(employeeName)}">${escapeHtml(employeeName)}</td>
      <td>${money(a.amount)}</td>
      <td>${escapeHtml(a.advance_givers?.name||"")}</td>
      <td>${escapeHtml(a.notes||"")}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="7">لا توجد سلف مسجلة لهذا الشهر</td></tr>`;
}

async function addAdvance(){
  if(!authRole||!authToken) return toast("سجل الدخول أولاً");
  const currentMonth=currentMonthKey();
  const selectedDate=$("advanceDate").value||isoToday();
  if(selectedDate.slice(0,7)!==currentMonth){
    $("advanceDate").value=isoToday();
    setMonthHeader();
    return toast("لا يمكن إضافة سلفة خارج الشهر الحالي");
  }
  const employee_id=$("employeeSelect").value, amount=Number($("amount").value), date=selectedDate;
  if(!employee_id) return toast("اختر الموظف أولاً");
  if(!amount||amount<=0) return toast("أدخل مبلغ السلفة");
  let error;
  if(authRole==='giver'){
    ({error}=await db.rpc("create_advance_for_giver",{p_token:authToken,p_employee_id:employee_id,p_amount:amount,p_advance_date:date,p_notes:$("notes").value.trim()||null}));
  }else{
    ({error}=await db.rpc("create_advance",{p_employee_id:employee_id,p_amount:amount,p_advance_date:date,p_giver_id:$("giverSelect").value||null,p_cashier_id:null,p_notes:$("notes").value.trim()||null}));
  }
  if(error) return toast("تعذر حفظ السلفة: "+error.message);
  clearForm();await loadAdvances();
  await subscribeForPush();
  await emitAdvancePushEvent("advance_added","سلفة جديدة","تمت إضافة سلفة جديدة في نظام سلف موظفي وعمال أمازون");
  toast("تمت إضافة السلفة بنجاح");
}

async function editAdvance(){
  if(authRole!=="manager") return toast("هذه الصلاحية للمدير فقط");
  if(!selectedAdvanceId) return toast("حدد السلفة من الجدول أولاً");
  if(!$("employeeSelect").value) return toast("اختر الموظف أولاً");
  const amount=Number($("amount").value);
  if(!amount || amount<=0) return toast("أدخل مبلغ السلفة");
  const {error}=await db.from("advances").update({
    employee_id:$("employeeSelect").value,
    amount:amount,
    advance_date:$("advanceDate").value,
    giver_id:$("giverSelect").value||null,
    cashier_id:null,
    notes:$("notes").value.trim()||null
  }).eq("id",selectedAdvanceId);
  if(error) return toast("تعذر التعديل: "+error.message);
  clearForm(); await loadAdvances();
  await emitAdvancePushEvent("advance_updated","تعديل سلفة","تم تعديل سلفة في نظام سلف موظفي وعمال أمازون");
  toast("تم تعديل السلفة بنجاح");
}

async function deleteAdvance(){
  if(authRole!=="manager") return toast("هذه الصلاحية للمدير فقط");
  if(!selectedAdvanceId) return toast("حدد السلفة من الجدول أولاً");
  confirmBox("هل تريد حذف السلفة المحددة نهائياً؟",async()=>{
    const {error}=await db.from("advances").delete().eq("id",selectedAdvanceId);
    if(error) return toast("تعذر الحذف: "+error.message);
    selectedAdvanceId=null; clearForm(); await loadAdvances();
    await emitAdvancePushEvent("advance_deleted","حذف سلفة","تم حذف سلفة من نظام سلف موظفي وعمال أمازون");
    toast("تم حذف السلفة بنجاح");
  });
}

function clearForm(){
  selectedAdvanceId=null;
  $("employeeSelect").value=""; $("amount").value=""; $("advanceDate").value=isoToday();
  $("giverSelect").value=""; $("notes").value="";
  refreshCustomSelect("employeeSelect","اختر الموظف");
  refreshCustomSelect("giverSelect","اختر الاسم");
  setMonthHeader(); renderAdvances();
}

function confirmBox(text,yes){
  $("confirmText").textContent=text; $("confirmModal").classList.add("show");
  $("confirmYes").onclick=()=>{ $("confirmModal").classList.remove("show"); yes(); };
  $("confirmNo").onclick=()=>$("confirmModal").classList.remove("show");
}

function openPeople(type){
  if(authRole!=="manager") return toast("إدارة الموظفين والمانحين للمدير فقط");
  document.querySelectorAll('.custom-select.open').forEach(closeCustomSelect);
  const title={employees:"إدارة الموظفين والعمال",givers:"إدارة مانحي السلف"}[type];
  $("peopleTitle").textContent=title;
  $("peopleModal").classList.add("show");
  $("peopleModal").dataset.type=type;
  $("personName").value="";
  renderPeople(type);
}
function renderPeople(type){
  const arr={employees,givers}[type];
  $("peopleList").innerHTML=arr.map(p=>`
    <div class="person-row">
      <span>${escapeHtml(p.name)} ${p.is_active?"":"(غير فعال)"}</span>
      <span>
        <button onclick="renamePerson('${type}','${p.id}')">✎ تعديل</button>
        <button onclick="removePerson('${type}','${p.id}')">🗑 حذف</button>
      </span>
    </div>`).join("") || "<p>لا توجد أسماء.</p>";
}
window.renamePerson=async(type,id)=>{
  const arr={employees,givers}[type], p=arr.find(x=>x.id===id); if(!p)return;
  const n=prompt("الاسم الجديد:",p.name); if(!n?.trim())return;
  const table={employees:"employees",givers:"advance_givers"}[type];
  const {error}=await db.from(table).update({name:n.trim()}).eq("id",id);
  if(error)return toast("تعذر التعديل: "+error.message);
  await loadPeople(); renderPeople(type); toast("تم تعديل الاسم");
};
window.removePerson=async(type,id)=>{
  const table={employees:"employees",givers:"advance_givers"}[type];
  confirmBox("هل تريد حذف هذا الاسم؟",async()=>{
    const {error}=await db.from(table).delete().eq("id",id);
    if(error){ toast("لا يمكن حذف الاسم إذا كان مرتبطًا بسجلات سابقة."); return; }
    await loadPeople(); renderPeople(type); toast("تم الحذف");
  });
};

async function savePerson(){
  const type=$("peopleModal").dataset.type, name=$("personName").value.trim();
  if(!name)return toast("اكتب الاسم");
  const table={employees:"employees",givers:"advance_givers"}[type];
  const {error}=await db.from(table).insert({name});
  if(error)return toast("تعذر الإضافة: "+error.message);
  $("personName").value=""; await loadPeople(); renderPeople(type); toast("تمت إضافة الاسم");
}

async function savePeopleBulk(){
  const type=$("peopleModal").dataset.type;
  const raw=$("bulkPersonNames").value.trim();
  if(!raw)return toast("اكتب الأسماء، كل اسم في سطر");
  const names=[...new Set(raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  const table={employees:"employees",givers:"advance_givers"}[type];
  const {data:existing,error:readError}=await db.from(table).select("name");
  if(readError)return toast("تعذر قراءة الأسماء: "+readError.message);
  const existingSet=new Set((existing||[]).map(x=>x.name.trim()));
  const rows=names.filter(n=>!existingSet.has(n)).map(name=>({name}));
  if(!rows.length){ $("bulkPersonNames").value=""; return toast("كل الأسماء موجودة مسبقاً"); }
  const {error}=await db.from(table).insert(rows);
  if(error)return toast("تعذر إضافة الأسماء: "+error.message);
  $("bulkPersonNames").value="";
  await loadPeople(); renderPeople(type);
  toast(`تمت إضافة ${rows.length} أسماء`);
}

async function exportPDF(){
  const month=currentMonthKey();
  const report=document.querySelector(".page");
  if(!window.html2pdf) return toast("تعذر تحميل أداة PDF، أعد تحميل الصفحة");
  const oldWidth=report.style.width;
  report.style.width="1180px";
  const options={
    margin:[6,6,6,6],
    filename:`سلف_${month}.pdf`,
    image:{type:"jpeg",quality:0.98},
    html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff",scrollX:0,scrollY:0},
    jsPDF:{unit:"mm",format:"a4",orientation:"landscape"},
    pagebreak:{mode:["css","legacy"],before:".print-details",avoid:[".summary-grid",".print-details-head","tr"]}
  };
  try{
    document.body.classList.add("pdf-exporting");
    await html2pdf().set(options).from(report).save();
  }catch(e){
    console.error(e); toast("تعذر إنشاء ملف PDF");
  }finally{
    document.body.classList.remove("pdf-exporting");
    report.style.width=oldWidth;
  }
}


function monthKeyFromDate(value){
  return String(value||'').slice(0,7);
}

function getAdvanceMonths(){
  const set=new Set((advances||[]).map(a=>monthKeyFromDate(a.advance_date)).filter(Boolean));
  set.add(currentMonthKey());
  return [...set].sort((a,b)=>b.localeCompare(a));
}

function monthOptionLabel(key){
  if(!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y,m]=key.split('-').map(Number);
  const names=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${names[m-1]||m} ${y}`;
}

function fillAdvanceDetailMonths(){
  const months=getAdvanceMonths();
  ['allAdvancesMonth','employeeAdvancesMonth'].forEach(id=>{
    const s=$(id);
    if(!s)return;
    const current=s.value||currentMonthKey();
    s.innerHTML='<option value="">جميع الأشهر</option>'+months.map(m=>`<option value="${m}">${monthOptionLabel(m)}</option>`).join('');
    s.value=months.includes(current)?current:'';
    s.style.color='#26352f'; s.style.webkitTextFillColor='#26352f'; s.style.fontWeight='700';
  });
}

function renderAllAdvanceDetails(){
  const body=$('allAdvancesDetailsBody');
  if(!body)return;
  const month=$('allAdvancesMonth')?.value||'';
  const rows=[...advances].filter(a=>!month || monthKeyFromDate(a.advance_date)===month).sort((a,b)=>String(b.advance_date).localeCompare(String(a.advance_date)));
  body.innerHTML=rows.map((a,i)=>{
    const en=a.employees?.name||'غير محدد', gn=a.advance_givers?.name||'غير محدد';
    return `<tr style="background:${personColor(en)}">
      <td>${i+1}</td><td>${escapeHtml(a.operation_no||'')}</td><td>${arDate(a.advance_date)}</td>
      <td class="person-cell" style="background:${personColor(en)}">${escapeHtml(en)}</td>
      <td>${money(a.amount)}</td><td>${escapeHtml(gn)}</td><td>${escapeHtml(a.notes||'')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-cell">لا توجد سلف مسجلة</td></tr>`;
  if($('allAdvancesCount'))$('allAdvancesCount').textContent=String(rows.length);
  if($('allAdvancesTotal'))$('allAdvancesTotal').textContent=`${money(rows.reduce((sum,a)=>sum+Number(a.amount||0),0))} د.ع`;
}

function fillEmployeeDetailsSelect(){
  const s=$('advanceDetailsEmployeeSelect');
  if(!s)return;
  const current=s.value||'';
  s.innerHTML='<option value="">اختر الموظف / العامل</option>'+
    employees.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar')).map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join('');
  if(current)s.value=current;
  applyEmployeeSelectColor('advanceDetailsEmployeeSelect');
}

function renderEmployeeAdvanceDetails(){
  const employeeId=$('advanceDetailsEmployeeSelect')?.value||'';
  const body=$('employeeAdvancesDetailsBody');
  if(!body)return;
  if(!employeeId){
    body.innerHTML='<tr><td colspan="7" class="empty-cell">اختر الموظف / العامل لعرض تفاصيل سلفه</td></tr>';
    if($('employeeDetailsCount'))$('employeeDetailsCount').textContent='0';
    if($('employeeDetailsTotal'))$('employeeDetailsTotal').textContent='0 د.ع';
    return;
  }
  const month=$('employeeAdvancesMonth')?.value||'';
  const rows=advances.filter(a=>a.employee_id===employeeId && (!month || monthKeyFromDate(a.advance_date)===month)).sort((a,b)=>String(b.advance_date).localeCompare(String(a.advance_date)));
  body.innerHTML=rows.map((a,i)=>{
    const en=a.employees?.name||'غير محدد', gn=a.advance_givers?.name||'غير محدد';
    return `<tr style="background:${personColor(en)}">
      <td>${i+1}</td><td>${escapeHtml(a.operation_no||'')}</td><td>${arDate(a.advance_date)}</td>
      <td>${escapeHtml(en)}</td><td>${money(a.amount)}</td><td>${escapeHtml(gn)}</td><td>${escapeHtml(a.notes||'')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-cell">لا توجد سلف لهذا الموظف</td></tr>`;
  if($('employeeDetailsCount'))$('employeeDetailsCount').textContent=String(rows.length);
  if($('employeeDetailsTotal'))$('employeeDetailsTotal').textContent=`${money(rows.reduce((sum,a)=>sum+Number(a.amount||0),0))} د.ع`;
}


function leaveMonthKeyFromRecord(l){
  if(l.leave_type==='time') return monthKeyFromDate(l.leave_date);
  return null;
}
function leaveOverlapsMonth(l, month){
  if(!month) return true;
  if(l.leave_type==='time') return monthKeyFromDate(l.leave_date)===month;
  const start=String(l.start_date||'');
  const end=String(l.end_date||l.start_date||'');
  if(!start || !end) return false;
  const monthStart=month+'-01';
  const [y,m]=month.split('-').map(Number);
  const next=new Date(y,m,1);
  const nextMonth=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`;
  return start<nextMonth && end>=monthStart;
}
function leaveDayCountForMonth(l, month){
  if(l.leave_type==='time') return 0;
  const start=new Date((l.start_date||'')+'T00:00:00');
  const end=new Date((l.end_date||l.start_date||'')+'T00:00:00');
  if(isNaN(start)||isNaN(end)) return 0;
  if(!month) return Math.max(0,Math.floor((end-start)/86400000)+1);
  const [y,m]=month.split('-').map(Number);
  const ms=new Date(y,m-1,1);
  const me=new Date(y,m,0);
  const a=start>ms?start:ms;
  const b=end<me?end:me;
  return b>=a?Math.floor((b-a)/86400000)+1:0;
}
function getLeaveMonths(){
  const set=new Set();
  (leaves||[]).forEach(l=>{
    if(l.leave_type==='time'){
      const k=monthKeyFromDate(l.leave_date); if(k)set.add(k);
    }else if(l.start_date && l.end_date){
      let d=new Date(l.start_date+'T00:00:00');
      const end=new Date(l.end_date+'T00:00:00');
      const ey=end.getFullYear(),em=end.getMonth(); let y=d.getFullYear(),m=d.getMonth(); while(y<ey || (y===ey && m<=em)){set.add(`${y}-${String(m+1).padStart(2,'0')}`);m++;if(m>11){m=0;y++;}}
    }
  });
  set.add(currentMonthKey());
  return [...set].sort((a,b)=>b.localeCompare(a));
}
function fillLeaveReportMonths(){
  const months=getLeaveMonths();
  ['allLeavesMonth','employeeLeavesMonth'].forEach(id=>{
    const s=$(id); if(!s)return;
    const current=s.value||currentMonthKey();
    s.innerHTML='<option value="">جميع الأشهر</option>'+months.map(m=>`<option value="${m}">${monthOptionLabel(m)}</option>`).join('');
    s.value=months.includes(current)?current:'';
  });
}
function renderAllLeaveDetails(){
  const body=$('allLeavesDetailsBody'); if(!body)return;
  const month=$('allLeavesMonth')?.value||'';
  const rows=leaves.filter(l=>leaveOverlapsMonth(l,month)).sort((a,b)=>String(b.start_date||b.leave_date||'').localeCompare(String(a.start_date||a.leave_date||'')));
  body.innerHTML=rows.map((l,i)=>{
    const en=l.employees?.name||'غير محدد',gn=l.advance_givers?.name||'غير محدد';
    return `<tr style="background:${personColor(en)}"><td>${i+1}</td><td class="person-cell" style="background:${personColor(en)}">${escapeHtml(en)}</td><td>${leaveTypeLabel(l.leave_type)}</td><td>${escapeHtml(leaveRangeLabel(l))}</td><td>${escapeHtml(gn)}</td><td>${escapeHtml(l.notes||'')}</td></tr>`;
  }).join('')||'<tr><td colspan="6" class="empty-cell">لا توجد إجازات للشهر المحدد</td></tr>';
  if($('allLeavesCount'))$('allLeavesCount').textContent=String(rows.length);
  if($('allLeavesDays'))$('allLeavesDays').textContent=String(rows.reduce((sum,l)=>sum+leaveDayCountForMonth(l,month),0));
}
function renderEmployeeLeaveReport(){
  const month=$('employeeLeavesMonth')?.value||'';
  const summaryBody=$('employeeLeavesSummaryBody');
  const employeeId=$('leaveDetailsEmployeeSelect')?.value||'';
  const rows=leaves.filter(l=>leaveOverlapsMonth(l,month));
  const byEmp={};
  rows.forEach(l=>{
    const id=l.employee_id,n=l.employees?.name||'غير محدد';
    if(!byEmp[id])byEmp[id]={name:n,count:0,days:0,time:0};
    byEmp[id].count++;byEmp[id].days+=leaveDayCountForMonth(l,month);if(l.leave_type==='time')byEmp[id].time++;
  });
  if(summaryBody){
    summaryBody.innerHTML=Object.entries(byEmp).sort((a,b)=>a[1].name.localeCompare(b[1].name,'ar')).map(([id,v])=>`<tr class="report-employee-row ${employeeId===id?'selected':''}" data-employee-id="${escapeHtml(id)}" style="background:${personColor(v.name)}"><td class="person-cell" style="background:${personColor(v.name)}">${escapeHtml(v.name)}</td><td>${v.count}</td><td>${v.days}</td><td>${v.time}</td></tr>`).join('')||'<tr><td colspan="4" class="empty-cell">لا توجد إجازات للشهر المحدد</td></tr>';
    summaryBody.querySelectorAll('[data-employee-id]').forEach(tr=>tr.onclick=()=>{ $('leaveDetailsEmployeeSelect').value=tr.dataset.employeeId; renderEmployeeLeaveReport(); });
  }
  const selected=employeeId?rows.filter(l=>l.employee_id===employeeId):[];
  const name=employeeId?(employees.find(e=>e.id===employeeId)?.name||selected[0]?.employees?.name||'') : '';
  if($('selectedLeaveEmployeeTitle'))$('selectedLeaveEmployeeTitle').textContent=name?`تفاصيل إجازات الموظف: ${name}`:'اختر موظفاً لعرض تفاصيل إجازاته';
  const body=$('employeeLeavesDetailsBody');
  if(body){body.innerHTML=selected.map((l,i)=>`<tr><td>${i+1}</td><td>${leaveTypeLabel(l.leave_type)}</td><td>${escapeHtml(leaveRangeLabel(l))}</td><td>${escapeHtml(l.advance_givers?.name||'غير محدد')}</td><td>${escapeHtml(l.notes||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">اختر الموظف / العامل لعرض تفاصيل إجازاته</td></tr>';}
  if($('employeeLeavesCount'))$('employeeLeavesCount').textContent=String(selected.length);
  if($('employeeLeavesDays'))$('employeeLeavesDays').textContent=String(selected.reduce((sum,l)=>sum+leaveDayCountForMonth(l,month),0));
  if($('employeeLeavesTimeCount'))$('employeeLeavesTimeCount').textContent=String(selected.filter(l=>l.leave_type==='time').length);
}
function fillLeaveEmployeeSelect(){
  const s=$('leaveDetailsEmployeeSelect');if(!s)return;
  const current=s.value||'';
  s.innerHTML='<option value="">اختر الموظف / العامل</option>'+employees.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar')).map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join('');
  if(current)s.value=current;applyEmployeeSelectColor('leaveDetailsEmployeeSelect');
}
function openLeavesMenu(){
  document.querySelectorAll('.leaves-part').forEach(el=>el.classList.add('hidden-view'));
  $('leavesMenu')?.classList.remove('hidden-view');
  $('leaveDetailsAll')?.classList.add('hidden-view');$('leaveDetailsEmployee')?.classList.add('hidden-view');
  $('leavesActions')?.classList.remove('show-actions');
  $('leavesWorkspaceActions')?.classList.add('hidden-view');
  window.scrollTo({top:0,behavior:'smooth'});
}
function openLeaveWorkspace(mode){
  $('leavesMenu')?.classList.add('hidden-view');
  $('leaveDetailsAll')?.classList.toggle('hidden-view',mode!=='all');
  $('leaveDetailsEmployee')?.classList.toggle('hidden-view',mode!=='employee');
  $('leaveSection')?.classList.toggle('hidden-view',mode!=='edit');
  $('leaveSummaryCard')?.classList.add('hidden-view');
  $('leavesActions')?.classList.toggle('show-actions',mode==='add'||mode==='edit');
  $('leavesWorkspaceActions')?.classList.toggle('hidden-view',!['add','edit'].includes(mode));
  if(mode==='add'){openLeaveModal();}
  if(mode==='edit'){loadLeaves();}
  if(mode==='all'){fillLeaveReportMonths();renderAllLeaveDetails();}
  if(mode==='employee'){fillLeaveReportMonths();fillLeaveEmployeeSelect();renderEmployeeLeaveReport();}
  if(mode==='print'){window.print();}
  if(mode==='pdf'){exportPDF();}
  window.scrollTo({top:0,behavior:'smooth'});
}

function openAdvanceWorkspace(mode){
  $('advancesMenu')?.classList.add('hidden-view');
  $('advanceDetailsAll')?.classList.toggle('hidden-view',mode!=='all');
  $('advanceDetailsEmployee')?.classList.toggle('hidden-view',mode!=='employee');
  const showMain=['add','edit','print','pdf'].includes(mode);
  document.querySelectorAll('.advances-part').forEach(el=>el.classList.toggle('hidden-view',!showMain));
  document.querySelectorAll('.advance-report-only').forEach(el=>el.classList.toggle('hidden-view',!['print','pdf'].includes(mode)));
  $('advancesActions')?.classList.toggle('show-actions',mode==='add'||mode==='edit');
  $('advancesWorkspaceActions')?.classList.toggle('hidden-view',!['add','edit'].includes(mode));
  if(mode==='add'){
    clearForm();
    document.querySelectorAll('.advance-report-only').forEach(el=>el.classList.add('hidden-view'));
    document.querySelector('.advances-part.table-wrap')?.classList.add('hidden-view');
  }
  if(mode==='edit'){
    document.querySelector('.advances-part.entry-card')?.classList.remove('hidden-view');
    document.querySelector('.advances-part.table-wrap')?.classList.remove('hidden-view');
    document.querySelectorAll('.advance-report-only').forEach(el=>el.classList.add('hidden-view'));
  }
  if(mode==='all'){fillAdvanceDetailMonths();renderAllAdvanceDetails();}
  if(mode==='employee'){fillAdvanceDetailMonths();fillEmployeeDetailsSelect();renderEmployeeAdvanceDetails();}
  if(mode==='print')window.print();
  if(mode==='pdf')exportPDF();
  window.scrollTo({top:0,behavior:'smooth'});
}

function openAdvancesMenu(){
  document.querySelectorAll('.advances-part').forEach(el=>el.classList.add('hidden-view'));
  $('advanceDetailsAll')?.classList.add('hidden-view');
  $('advanceDetailsEmployee')?.classList.add('hidden-view');
  $('advancesActions')?.classList.remove('show-actions');
  $('advancesWorkspaceActions')?.classList.add('hidden-view');
  $('advancesMenu')?.classList.remove('hidden-view');
  window.scrollTo({top:0,behavior:'smooth'});
}

function setMainView(view){
  const pages=['homeDashboard','advancesMenu','leavesMenu','salaryMenu','salaryEntryPage','salaryReport','salaryEmployeeReport','penaltiesMenu','penaltyEntryPage','penaltyAllReport','penaltyEmployeeReport'];
  pages.forEach(id=>$(id)?.classList.add('hidden-view'));
  document.querySelectorAll('.advances-part,.leaves-part,.sub-toolbar').forEach(el=>el.classList.add('hidden-view'));
  if(view==='home')$('homeDashboard')?.classList.remove('hidden-view');
  if(view==='advances')openAdvancesMenu();
  if(view==='leaves')openLeavesMenu();
  if(view==='salary')showSalaryMenu();
  if(view==='penalties')showPenaltyMenu();
  document.querySelectorAll('.main-nav').forEach(b=>b.classList.remove('active'));
  const map={advances:'advancesNav',leaves:'leavesNav',salary:'salaryNav',penalties:'penaltiesNav'};if(map[view])$(map[view])?.classList.add('active');
}

let salaries=[], penalties=[], selectedPenaltyId=null;
function salaryMonthKey(v){return String(v||'').slice(0,7)}
function monthListFromData(){const s=new Set([currentMonthKey()]);salaries.forEach(x=>x.salary_month&&s.add(salaryMonthKey(x.salary_month)));advances.forEach(x=>s.add(monthKeyFromDate(x.advance_date)));leaves.forEach(x=>{const k=x.leave_type==='time'?monthKeyFromDate(x.leave_date):monthKeyFromDate(x.start_date);if(k)s.add(k)});penalties.forEach(x=>s.add(monthKeyFromDate(x.penalty_date)));return [...s].filter(Boolean).sort((a,b)=>b.localeCompare(a));}
function fillMonthSelect(id,all=true){const s=$(id);if(!s)return;const cur=s.value;const ms=monthListFromData();s.innerHTML=(all?'<option value="">جميع الأشهر</option>':'<option value="">اختر الشهر</option>')+ms.map(m=>`<option value="${m}">${monthOptionLabel(m)}</option>`).join('');if(ms.includes(cur))s.value=cur;}
function applyEmployeeSelectColor(id){const s=$(id);if(!s)return;const name=(employees||[]).find(e=>e.id===s.value)?.name||'';if(name){const c=personColor(name);s.style.backgroundColor=c;s.style.fontWeight='800';s.style.color='#18382e';s.style.borderColor='#9bb9aa';}else{s.style.backgroundColor='';s.style.fontWeight='';s.style.color='';s.style.borderColor='';}}
function fillSalaryEmployeeSelects(){['salaryEmployeeInput','salaryEmployeeSelect','penaltyEmployee','penaltyEmployeeSelect'].forEach(id=>{const s=$(id);if(!s)return;const cur=s.value;s.innerHTML='<option value="">اختر الموظف / العامل</option>'+(employees||[]).filter(x=>x.is_active!==false).map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');if(cur)s.value=cur;applyEmployeeSelectColor(id);s.onchange=()=>applyEmployeeSelectColor(id);});}
async function loadSalaries(){const r=await db.from('employee_salaries').select('*');if(r.error){console.warn('employee_salaries:',r.error.message);salaries=[];return;}salaries=r.data||[];}
async function loadPenalties(){const r=await db.from('employee_penalties').select('*,employees:employee_id(name)').order('penalty_date',{ascending:false});if(r.error){console.warn('employee_penalties:',r.error.message);penalties=[];return;}penalties=r.data||[];}
function penaltyLabel(t){return t==='absence1'?'غياب ×1':t==='absence2'?'غياب ×2':'خصم'}
function salaryCalc(s,month){const currency=s.currency||'IQD',nominal=Number(s.nominal_salary||0),otHours=Number(s.overtime_hours||0),overtime=otHours/30*50000,official=Number(s.official_hours||8)||8,workHours=Number(s.work_hours||0),secondDays=Number(s.second_job_days||Math.floor(workHours/official)),dayBase=currency==='IQD'?(nominal+overtime)/30:nominal/30,empId=s.employee_id,adv=advances.filter(a=>a.employee_id===empId&&monthKeyFromDate(a.advance_date)===month).reduce((n,a)=>n+Number(a.amount||0),0),salaryAdvDed=currency==='IQD'?adv:0,dayLeaves=leaves.filter(l=>l.employee_id===empId&&l.leave_type==='day'&&leaveOverlapsMonth(l,month)).reduce((n,l)=>n+leaveDayCountForMonth(l,month),0),timeHours=leaves.filter(l=>l.employee_id===empId&&l.leave_type==='time'&&monthKeyFromDate(l.leave_date)===month).reduce((n,l)=>{if(!l.start_time||!l.end_time)return n;const a=l.start_time.split(':').map(Number),b=l.end_time.split(':').map(Number);let x=(b[0]*60+b[1])-(a[0]*60+a[1]);if(x<0)x+=1440;return n+x/60},0),timeDed=timeHours*(dayBase/official),absenceDays=penalties.filter(p=>p.employee_id===empId&&monthKeyFromDate(p.penalty_date)===month).reduce((n,p)=>n+(p.penalty_type==='absence2'?2:p.penalty_type==='absence1'?1:0),0),directPenalty=penalties.filter(p=>p.employee_id===empId&&monthKeyFromDate(p.penalty_date)===month&&p.penalty_type==='deduction').reduce((n,p)=>n+Number(p.amount||0),0),leaveDed=dayLeaves*dayBase,absenceDed=absenceDays*dayBase,secondValue=s.second_job_enabled?Number(s.second_job_daily_value||0)*secondDays:0,salaryNet=nominal-leaveDed-timeDed-salaryAdvDed-directPenalty-absenceDed;return {currency,nominal,overtime,adv,salaryAdvDed,dayLeaves,leaveDed,timeHours,timeDed,absenceDays,absenceDed,directPenalty,secondValue,secondDays,salaryNet,workHours,official,otHours};}
function renderSalaryReport(){const month=$('salaryReportMonth')?.value||currentMonthKey(),body=$('salaryReportBody');if(!body)return;const rows=salaries.filter(s=>salaryMonthKey(s.salary_month)===month);body.innerHTML=rows.map(s=>{const e=employees.find(x=>x.id===s.employee_id),c=salaryCalc(s,month),u=c.currency==='USD'?'$':'د.ع';return `<tr data-employee-id="${s.employee_id}"><td>${escapeHtml(e?.name||'غير محدد')}</td><td>${c.currency}</td><td>${money(c.nominal)} ${u}</td><td>${money(c.overtime)} د.ع</td><td>${money(c.adv)} د.ع</td><td>${money(c.leaveDed)} ${u}</td><td>${money(c.timeDed)} ${u}</td><td>${money(c.directPenalty+c.absenceDed)} ${u}</td><td>${money(c.secondValue)} د.ع</td><td>${money(c.salaryNet)} ${u}</td><td>${money(c.overtime+c.secondValue)} د.ع</td></tr>`}).join('')||'<tr><td colspan="11" class="empty-cell">لا توجد رواتب لهذا الشهر</td></tr>';body.querySelectorAll('[data-employee-id]').forEach(tr=>tr.onclick=()=>{$('salaryEmployeeMonth').value=month;$('salaryEmployeeSelect').value=tr.dataset.employeeId;showSalaryMenu();openSalaryEmployee();});}
function renderSalaryEmployeeReport(){const month=$('salaryEmployeeMonth')?.value||currentMonthKey(),id=$('salaryEmployeeSelect')?.value,box=$('salaryEmployeeDetail');if(!box)return;if(!id){box.innerHTML='<div class="empty-cell">اختر الموظف لعرض كشف الراتب</div>';return;}const s=salaries.find(x=>x.employee_id===id&&salaryMonthKey(x.salary_month)===month),e=employees.find(x=>x.id===id);if(!s){box.innerHTML='<div class="empty-cell">لا يوجد راتب مسجل لهذا الموظف في الشهر المحدد</div>';return;}const c=salaryCalc(s,month),u=c.currency==='USD'?'$':'د.ع';box.innerHTML=`<h3>كشف راتب: ${escapeHtml(e?.name||'')}</h3><div class="salary-detail-grid"><div><span>الراتب الاسمي</span><b>${money(c.nominal)} ${u}</b></div><div><span>ساعات العمل</span><b>${c.workHours}</b></div><div><span>الساعات الإضافية</span><b>${c.otHours}</b></div><div><span>مبلغ الإضافي</span><b>${money(c.overtime)} د.ع</b></div><div><span>السلف</span><b>${money(c.adv)} د.ع</b></div><div><span>الإجازات</span><b>${c.dayLeaves} يوم / ${money(c.leaveDed)} ${u}</b></div><div><span>الزمنيات</span><b>${c.timeHours.toFixed(2)} ساعة / ${money(c.timeDed)} ${u}</b></div><div><span>العقوبات</span><b>${c.absenceDays} يوم غياب + ${money(c.directPenalty)} ${u}</b></div><div><span>العمل الثاني</span><b>${c.secondDays} يوم / ${money(c.secondValue)} د.ع</b></div><div><span>صافي الراتب</span><b>${money(c.salaryNet)} ${u}</b></div><div><span>الإضافي + بدل العمل الثاني</span><b>${money(c.overtime+c.secondValue)} د.ع</b></div></div>`;}
function renderPenaltyReports(){const month=$('penaltyReportMonth')?.value||'',body=$('penaltyReportBody');if(body){const rows=penalties.filter(p=>!month||monthKeyFromDate(p.penalty_date)===month);body.innerHTML=rows.map(p=>`<tr><td>${escapeHtml(p.employees?.name||'')}</td><td>${arDate(p.penalty_date)}</td><td>${penaltyLabel(p.penalty_type)}</td><td>${p.penalty_type==='deduction'?money(p.amount):'يحسب مع الراتب'}</td><td>${escapeHtml(p.notes||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد عقوبات</td></tr>';}}
function renderPenaltyEmployeeReport(){const month=$('penaltyEmployeeMonth')?.value||'',id=$('penaltyEmployeeSelect')?.value,box=$('penaltyEmployeeDetail'),summary=$('penaltyEmployeeSummaryBody');if(!box)return;const rows=penalties.filter(p=>(!month||monthKeyFromDate(p.penalty_date)===month)&&(!id||p.employee_id===id));const direct=rows.filter(p=>p.penalty_type==='deduction').reduce((n,p)=>n+Number(p.amount||0),0),a1=rows.filter(p=>p.penalty_type==='absence1').length,a2=rows.filter(p=>p.penalty_type==='absence2').length;if(summary)summary.innerHTML=id?`<tr><td>${escapeHtml(employees.find(e=>e.id===id)?.name||'')}</td><td>${money(direct)}</td><td>${a1}</td><td>${a2}</td><td>${money(direct)}</td></tr>`:'<tr><td colspan="5" class="empty-cell">اختر الموظف لعرض ملخص العقوبات</td></tr>';box.innerHTML=rows.map(p=>`<div class="person-row"><span>${escapeHtml(p.employees?.name||'')} — ${arDate(p.penalty_date)} — ${penaltyLabel(p.penalty_type)}</span><b>${p.penalty_type==='deduction'?money(p.amount):'يحسب مع الراتب'}</b></div>`).join('')||'<div class="empty-cell">لا توجد عقوبات</div>';}
async function saveSalary(){if(authRole!=='manager')return toast('هذه الصلاحية للمدير فقط');const employee_id=$('salaryEmployeeInput').value,month=$('salaryMonthInput').value;if(!employee_id||!month)return toast('اختر الموظف والشهر');const row={employee_id,salary_month:month+'-01',currency:$('salaryCurrency').value,nominal_salary:Number($('salaryNominal').value||0),official_hours:Number($('salaryOfficialHours').value||8),work_hours:Number($('salaryWorkHours').value||0),overtime_hours:Number($('salaryOvertimeHours').value||0),second_job_enabled:$('salarySecondJob').value==='true',second_job_daily_value:Number($('salarySecondJobValue').value||0),second_job_days:Number($('salarySecondJobDays').value||0)};const {error}=await db.from('employee_salaries').upsert(row,{onConflict:'employee_id,salary_month'});if(error)return toast('تعذر حفظ الراتب: '+error.message);await loadSalaries();toast('تم حفظ راتب الموظف بنجاح');}
function clearPenaltyForm(){$('penaltyEmployee').value='';$('penaltyDate').value=isoToday();$('penaltyType').value='deduction';$('penaltyAmount').value='';$('penaltyNotes').value='';$('savePenaltyBtn').textContent='حفظ العقوبة';$('cancelPenaltyEditBtn')?.classList.add('hidden');}
function renderPenaltyEditList(){const body=$('penaltyEditBody');if(!body)return;body.innerHTML=penalties.map(p=>`<tr><td>${escapeHtml(p.employees?.name||'')}</td><td>${arDate(p.penalty_date)}</td><td>${penaltyLabel(p.penalty_type)}</td><td>${p.penalty_type==='deduction'?money(p.amount):'—'}</td><td><button class="mini-edit" onclick="editPenalty('${p.id}')">تعديل</button><button class="mini-danger" onclick="deletePenalty('${p.id}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد عقوبات</td></tr>';}
window.editPenalty=async function(id){const p=penalties.find(x=>x.id===id);if(!p)return;selectedPenaltyId=id;fillSalaryEmployeeSelects();$('penaltyEmployee').value=p.employee_id||'';$('penaltyDate').value=p.penalty_date||isoToday();$('penaltyType').value=p.penalty_type||'deduction';$('penaltyAmount').value=p.amount||'';$('penaltyNotes').value=p.notes||'';$('savePenaltyBtn').textContent='حفظ تعديل العقوبة';$('cancelPenaltyEditBtn')?.classList.remove('hidden');};
window.deletePenalty=function(id){if(authRole!=='manager')return;confirmBox('هل تريد حذف العقوبة المحددة؟',async()=>{const {error}=await db.from('employee_penalties').delete().eq('id',id);if(error)return toast('تعذر حذف العقوبة: '+error.message);await loadPenalties();renderPenaltyEditList();toast('تم حذف العقوبة بنجاح');});};
async function savePenalty(){if(authRole!=='manager')return toast('هذه الصلاحية للمدير فقط');const row={employee_id:$('penaltyEmployee').value,penalty_date:$('penaltyDate').value||isoToday(),penalty_type:$('penaltyType').value,amount:Number($('penaltyAmount').value||0),notes:$('penaltyNotes').value.trim()||null};if(!row.employee_id)return toast('اختر الموظف');if(row.penalty_type==='deduction'&&!row.amount)return toast('أدخل مبلغ الخصم');let result=selectedPenaltyId?await db.from('employee_penalties').update(row).eq('id',selectedPenaltyId):await db.from('employee_penalties').insert(row);if(result.error)return toast('تعذر حفظ العقوبة: '+result.error.message);const edit=!!selectedPenaltyId;selectedPenaltyId=null;await loadPenalties();renderPenaltyEditList();clearPenaltyForm();toast(edit?'تم تعديل العقوبة بنجاح':'تمت إضافة العقوبة بنجاح');}
function showSalaryMenu(){hideAllNewPages();$('salaryMenu')?.classList.remove('hidden-view');}
function showPenaltyMenu(){hideAllNewPages();$('penaltiesMenu')?.classList.remove('hidden-view');}
function hideAllNewPages(){['salaryMenu','salaryEntryPage','salaryReport','salaryEmployeeReport','penaltiesMenu','penaltyEntryPage','penaltyAllReport','penaltyEmployeeReport'].forEach(id=>$(id)?.classList.add('hidden-view'));}
async function openSalaryReport(){hideAllNewPages();await loadSalaries();fillMonthSelect('salaryReportMonth',false);$('salaryReport')?.classList.remove('hidden-view');renderSalaryReport();}
async function openSalaryEmployee(){hideAllNewPages();await loadSalaries();fillMonthSelect('salaryEmployeeMonth',false);fillSalaryEmployeeSelects();$('salaryEmployeeReport')?.classList.remove('hidden-view');renderSalaryEmployeeReport();}
function openSalaryEntry(){hideAllNewPages();fillSalaryEmployeeSelects();$('salaryMonthInput').value=currentMonthKey();$('salaryEntryPage')?.classList.remove('hidden-view');}
async function openPenaltyAll(){hideAllNewPages();await loadPenalties();fillMonthSelect('penaltyReportMonth',true);$('penaltyAllReport')?.classList.remove('hidden-view');renderPenaltyReports();}
async function openPenaltyEmployee(){hideAllNewPages();await loadPenalties();fillMonthSelect('penaltyEmployeeMonth',true);fillSalaryEmployeeSelects();$('penaltyEmployeeReport')?.classList.remove('hidden-view');renderPenaltyEmployeeReport();}
async function openPenaltyEntry(){hideAllNewPages();await loadPenalties();fillSalaryEmployeeSelects();clearPenaltyForm();renderPenaltyEditList();$('penaltyEntryPage')?.classList.remove('hidden-view');}
function fillPasswordTargetGivers(){
  const s=$('passwordTargetGiver');
  if(!s)return;
  const current=$("loginNameSelect")?.value||"";
  s.innerHTML='<option value="">اختر اسم المانح</option>';
  (giverLoginList.length ? giverLoginList : givers).filter(g=>g.is_active!==false).forEach(g=>{
    s.insertAdjacentHTML('beforeend',`<option value="giver:${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`);
  });
  if(current.startsWith('giver:')) s.value=current;
}
function openPasswordModal(forgot=false){
  const value=$("loginNameSelect")?.value||"";
  const isManager=authRole==='manager' || value==='admin';
  const target=$('passwordTargetWrap');
  const targetSelect=$('passwordTargetGiver');
  if(isManager){
    fillPasswordTargetGivers();
    target?.classList.remove('hidden');
    $('passwordModalTitle').textContent='إعادة تعيين كلمة مرور المانح';
    $('passwordChangeFields')?.classList.add('hidden');
    $('forgotManagerFields')?.classList.remove('hidden');
    $('forgotPasswordNote')?.classList.remove('hidden');
    $('oldPassword').value='';
    $('forgotManagerPassword').value='';
  }else if(value.startsWith('giver:')){
    target?.classList.add('hidden');
    $('passwordModalTitle').textContent=forgot?'إعادة تعيين كلمة مرور المانح':'تغيير كلمة المرور';
    $('passwordChangeFields')?.classList.toggle('hidden',forgot);
    $('forgotManagerFields')?.classList.toggle('hidden',!forgot);
    $('forgotPasswordNote')?.classList.toggle('hidden',!forgot);
    $('oldPassword').value=''; $('forgotManagerPassword').value='';
    if(targetSelect)targetSelect.value=value;
  }else{
    return setAuthError('اختر اسم المانح أولاً');
  }
  $('newPassword').value=''; $('confirmPassword').value='';
  $('passwordModal').classList.add('show');
}
async function savePasswordChange(){
  const loginValue=$("loginNameSelect")?.value||"";
  const isManager=authRole==='manager' || loginValue==='admin';
  const targetValue=isManager?($('passwordTargetGiver')?.value||''):loginValue;
  const id=targetValue.replace(/^giver:/,'');
  if(!targetValue.startsWith('giver:')) return toast('اختر اسم المانح الذي تريد تغيير كلمة مروره');
  const p1=$('newPassword').value, p2=$('confirmPassword').value;
  if(!/^(?:\d{6,}|(?=.*[A-Za-z])[A-Za-z0-9]{6,})$/.test(p1))return toast('كلمة المرور يجب أن تكون 6 خانات أو أكثر، أرقام فقط أو حروف وأرقام بدون رموز');
  if(p1!==p2)return toast('كلمتا المرور غير متطابقتين');
  const forgot=$('forgotManagerFields')?.classList.contains('hidden')===false;
  if(isManager || forgot){
    const managerPassword=$('forgotManagerPassword').value;
    if(!managerPassword)return toast('أدخل كلمة مرور المدير');
    const {error}=await db.rpc('advance_manager_reset_giver_password',{p_giver_id:id,p_manager_password:managerPassword,p_new_password:p1});
    if(error)return toast(error.message||'تعذر إعادة تعيين كلمة المرور');
    $('passwordModal').classList.remove('show');
    toast('تمت إعادة تعيين كلمة مرور المانح بنجاح');
    return;
  }
  const old=$('oldPassword').value;
  if(!old)return toast('أدخل كلمة المرور الحالية');
  const {error}=await db.rpc('advance_giver_change_password',{p_giver_id:id,p_old_password:old,p_new_password:p1});
  if(error)return toast(error.message.includes('غير صحيحة')?'كلمة المرور الحالية غير صحيحة':'تعذر تغيير كلمة المرور');
  $('passwordModal').classList.remove('show'); toast('تم تغيير كلمة المرور بنجاح');
}
function openEmployeeManager(mode){
  if(authRole!=='manager') return toast('هذه الصلاحية للمدير فقط');
  $('peopleModal').dataset.type='employees'; $('peopleModal').dataset.mode=mode;
  $('peopleTitle').textContent=mode==='delete'?'حذف موظف / عامل':'إضافة موظف / عامل';
  $('peopleModal').classList.add('show'); $('personName').value=''; $('bulkPersonNames').value='';
  document.querySelector('.inline-form')?.classList.toggle('hidden',mode==='delete');
  document.querySelector('.bulk-people')?.classList.toggle('hidden',mode==='delete');
  renderPeople('employees');
}
async function init(){
  registerServiceWorker();
  $("today").textContent=new Date().toLocaleDateString("en-GB");
  $("advanceDate").value=isoToday();setMonthHeader();
  if(restoreAuth()){hideAuthScreen();await startApp();}
  else{showAuthScreen();await loadGiverLoginList();}
}
$("loginBtn").onclick=unifiedLogin;
$("loginNameSelect").onchange=updateUnifiedLoginMode;
$("showFirstSetupBtn")?.addEventListener("click",showFirstPasswordSetup);
$("giverSetupBtn")?.addEventListener("click",giverFirstPassword);
$("cancelFirstSetupBtn")?.addEventListener("click",()=>{
  $("giverFirstSetup")?.classList.add("hidden");
  $("loginExisting")?.classList.remove("hidden");
  $("giverNewPassword") && ($("giverNewPassword").value="");
  $("giverConfirmPassword") && ($("giverConfirmPassword").value="");
  setAuthError("");
  updateUnifiedLoginMode();
});
let logoTapCount=0, logoTapTimer=null;
document.querySelector(".auth-brand img")?.addEventListener("click",()=>{
  logoTapCount++;
  clearTimeout(logoTapTimer);
  logoTapTimer=setTimeout(()=>{logoTapCount=0;},1800);
  if(logoTapCount>=5){logoTapCount=0;revealAdminLogin();}
});
$("logoutBtn").onclick=logout;
$("addBtn").onclick=addAdvance;
$("editBtn").onclick=editAdvance;
$("deleteBtn")?.addEventListener("click",deleteAdvance);
$("printBtn").onclick=()=>window.print();
$("exportBtn").onclick=exportPDF;
$("advanceDate").onchange=()=>{
  if($("advanceDate").value.slice(0,7)!==currentMonthKey()){
    $("advanceDate").value=isoToday();
    toast("الصفحة تعرض الشهر الحالي فقط");
  }
  setMonthHeader();
  renderAdvances();
};
$("savePeopleBulk").onclick=savePeopleBulk;
$("closePeople")?.addEventListener('click',()=>{$("peopleModal")?.classList.remove('show');document.querySelector('.inline-form')?.classList.remove('hidden');document.querySelector('.bulk-people')?.classList.remove('hidden');});
$("savePerson").onclick=savePerson;
$('closeLeave')?.addEventListener('click',()=>{selectedLeaveId=null;$('leaveModal')?.classList.remove('show');openLeavesMenu();});
$('leaveType')?.addEventListener('change',toggleLeaveFields);
$('saveLeave')?.addEventListener('click',saveLeave);
$('homeFromAdvancesBtn')?.addEventListener('click',()=>setMainView('home'));$('sectionFromAdvancesBtn')?.addEventListener('click',openAdvancesMenu);$('advanceWorkspaceHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('advanceWorkspaceSectionBtn')?.addEventListener('click',openAdvancesMenu);$('advanceWorkspaceAddBtn')?.addEventListener('click',()=>openAdvanceWorkspace('add'));$('advanceWorkspaceEditBtn')?.addEventListener('click',()=>openAdvanceWorkspace('edit'));
$('homeFromLeavesBtn')?.addEventListener('click',()=>setMainView('home'));$('sectionFromLeavesBtn')?.addEventListener('click',openLeavesMenu);$('leaveWorkspaceHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('leaveWorkspaceSectionBtn')?.addEventListener('click',openLeavesMenu);$('leaveWorkspaceAddBtn')?.addEventListener('click',()=>openLeaveWorkspace('add'));$('leaveWorkspaceEditBtn')?.addEventListener('click',()=>openLeaveWorkspace('edit'));
$('advancesNav')?.addEventListener('click',()=>setMainView('advances'));
$('advanceMenuAddBtn')?.addEventListener('click',()=>openAdvanceWorkspace('add'));
$('advanceMenuEditBtn')?.addEventListener('click',()=>openAdvanceWorkspace('edit'));
$('advanceMenuAddEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('add'));
$('advanceMenuDeleteEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('delete'));
$('advanceMenuPrintBtn')?.addEventListener('click',()=>openAdvanceWorkspace('print'));
$('advanceMenuPdfBtn')?.addEventListener('click',()=>openAdvanceWorkspace('pdf'));
$('advanceMenuAllDetailsBtn')?.addEventListener('click',()=>openAdvanceWorkspace('all'));
$('advanceMenuEmployeeDetailsBtn')?.addEventListener('click',()=>openAdvanceWorkspace('employee'));
$('advanceMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));
$('advanceDetailsEmployeeSelect')?.addEventListener('change',()=>{applyEmployeeSelectColor('advanceDetailsEmployeeSelect');renderEmployeeAdvanceDetails();});$('employeeAdvancesMonth')?.addEventListener('change',()=>{const s=$('employeeAdvancesMonth');if(s){s.style.color='#26352f';s.style.webkitTextFillColor='#26352f';s.style.fontWeight='700';}renderEmployeeAdvanceDetails();});
$('allAdvancesMonth')?.addEventListener('change',renderAllAdvanceDetails);

$('backToAdvancesMenuBtn')?.addEventListener('click',openAdvancesMenu);
$('backToAdvancesMenuAllBtn')?.addEventListener('click',openAdvancesMenu);
$('backToAdvancesMenuEmployeeBtn')?.addEventListener('click',openAdvancesMenu);
$('leavesNav')?.addEventListener('click',()=>setMainView('leaves'));
$('leavesMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));
$('leaveMenuAddBtn')?.addEventListener('click',()=>openLeaveWorkspace('add'));
$('leaveMenuEditBtn')?.addEventListener('click',()=>openLeaveWorkspace('edit'));
$('leaveMenuAllDetailsBtn')?.addEventListener('click',()=>openLeaveWorkspace('all'));
$('leaveMenuEmployeeDetailsBtn')?.addEventListener('click',()=>openLeaveWorkspace('employee'));
$('leaveMenuPrintBtn')?.addEventListener('click',()=>openLeaveWorkspace('print'));
$('leaveMenuPdfBtn')?.addEventListener('click',()=>openLeaveWorkspace('pdf'));
$('editLeaveBtn')?.addEventListener('click',()=>openLeaveWorkspace('edit'));
$('leaveDetailsEmployeeSelect')?.addEventListener('change',()=>{applyEmployeeSelectColor('leaveDetailsEmployeeSelect');renderEmployeeLeaveReport();});
$('allLeavesMonth')?.addEventListener('change',renderAllLeaveDetails);
$('employeeLeavesMonth')?.addEventListener('change',renderEmployeeLeaveReport);
$('backToLeavesMenuAllBtn')?.addEventListener('click',openLeavesMenu);
$('backToLeavesMenuEmployeeBtn')?.addEventListener('click',openLeavesMenu);
$('penaltiesNav')?.addEventListener('click',()=>setMainView('penalties'));
$('rewardsNav')?.addEventListener('click',()=>{setMainView('rewards');toast('قسم المكافئات سيتم تفعيله في المرحلة القادمة');});
$('addLeaveBtn')?.addEventListener('click',()=>openLeaveModal());
$('addEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('add'));
$('deleteEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('delete'));
$('changePasswordBtn')?.addEventListener('click',()=>openPasswordModal(false));
$('forgotPasswordBtn')?.addEventListener('click',()=>openPasswordModal(true));
$('closePassword')?.addEventListener('click',()=>$('passwordModal')?.classList.remove('show'));
$('savePassword')?.addEventListener('click',savePasswordChange);
$('salaryNav')?.addEventListener('click',()=>setMainView('salary'));$('salaryMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('salaryEntryBtn')?.addEventListener('click',openSalaryEntry);$('salaryReportBtn')?.addEventListener('click',openSalaryReport);$('salaryEmployeeBtn')?.addEventListener('click',openSalaryEmployee);$('salaryEntryHomeBtn')?.addEventListener('click',showSalaryMenu);$('salaryReportHomeBtn')?.addEventListener('click',showSalaryMenu);$('salaryEmployeeHomeBtn')?.addEventListener('click',showSalaryMenu);$('salaryReportMonth')?.addEventListener('change',renderSalaryReport);$('salaryEmployeeMonth')?.addEventListener('change',renderSalaryEmployeeReport);$('salaryEmployeeSelect')?.addEventListener('change',renderSalaryEmployeeReport);$('saveSalaryBtn')?.addEventListener('click',saveSalary);$('penaltiesMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('penaltyAddBtn')?.addEventListener('click',openPenaltyEntry);$('penaltyEditBtn')?.addEventListener('click',openPenaltyEntry);$('penaltyAllReportBtn')?.addEventListener('click',openPenaltyAll);$('penaltyEmployeeReportBtn')?.addEventListener('click',openPenaltyEmployee);$('penaltyEntryHomeBtn')?.addEventListener('click',showPenaltyMenu);$('penaltyAllHomeBtn')?.addEventListener('click',showPenaltyMenu);$('penaltyEmployeeHomeBtn')?.addEventListener('click',showPenaltyMenu);$('penaltyReportMonth')?.addEventListener('change',renderPenaltyReports);$('penaltyEmployeeMonth')?.addEventListener('change',renderPenaltyEmployeeReport);$('penaltyEmployeeSelect')?.addEventListener('change',renderPenaltyEmployeeReport);$('savePenaltyBtn')?.addEventListener('click',savePenalty);$('cancelPenaltyEditBtn')?.addEventListener('click',()=>{selectedPenaltyId=null;clearPenaltyForm();});$('advanceAllHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('advanceEmployeeHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('leaveAllHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('leaveEmployeeHomeBtn')?.addEventListener('click',()=>setMainView('home'));
initCustomSelects();

document.addEventListener("keydown",e=>{
  if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();addAdvance();}
});
init();
