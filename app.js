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
function saveAuth(role,token,name){authRole=role;authToken=token;authName=name;sessionStorage.setItem("advance_auth",JSON.stringify({role,token,name}));hideAuthScreen();applyRoleUI();}
function clearAuth(){authRole=null;authToken=null;authName=null;sessionStorage.removeItem("advance_auth");}
function restoreAuth(){try{const x=JSON.parse(sessionStorage.getItem("advance_auth")||"null");if(x?.role&&x?.token&&x?.name){authRole=x.role;authToken=x.token;authName=x.name;return true;}}catch{}return false;}

async function loadGiverLoginList(){
  setAuthError("");
  const {data,error}=await db.from("advance_givers").select("id,name,is_active").eq("is_active",true).order("name");
  if(error){setAuthError("تعذر تحميل أسماء المانحين: "+error.message);return;}
  // نحتاج حالة كلمة المرور، لكن لا نعرض جدول الحسابات مباشرة. نستخدم دالة الإعداد/الدخول؛
  // ولأجل معرفة هل هذا أول دخول، نتحقق من وجود الحساب عبر دالة آمنة منفصلة إن وجدت،
  // وإلا نظهر خانة كلمة المرور ونترك الخادم يرفض/يوجه الحالة.
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
  if(p1.length<6)return setAuthError("كلمة المرور يجب أن تكون 6 أحرف أو أكثر");
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

async function startApp(){applyRoleUI();try{await loadPeople();await loadAdvances();setMainView('advances');}catch(e){console.error(e);toast("تعذر تحميل البيانات: "+(e.message||e));}}

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
  const wasEdit=!!selectedLeaveId; $('leaveModal').classList.remove('show'); selectedLeaveId=null; await loadLeaves(); toast(wasEdit?'تم تعديل الإجازة':'تم حفظ الإجازة');
}
window.editLeave=id=>openLeaveModal(id);
async function deleteLeave(id){
  if(authRole!=='manager')return toast('الحذف للمدير فقط');
  confirmBox('هل تريد حذف الإجازة المحددة؟',async()=>{const {error}=await db.from('advance_leaves').delete().eq('id',id);if(error)return toast('تعذر حذف الإجازة: '+error.message);await loadLeaves();toast('تم حذف الإجازة');});
}

let pushRegistrationPromise=null;
let pushSetupStarted=false;

function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return Promise.resolve(null);
  if(!pushRegistrationPromise){
    pushRegistrationPromise=navigator.serviceWorker.register("./sw.js").catch(err=>{
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
  $("monthTitle").textContent=`شهر ${monthLabel(d)}`;
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
  toast("تم حفظ السلفة بنجاح");
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
  clearForm(); await loadAdvances(); toast("تم تعديل السلفة");
}

async function deleteAdvance(){
  if(authRole!=="manager") return toast("هذه الصلاحية للمدير فقط");
  if(!selectedAdvanceId) return toast("حدد السلفة من الجدول أولاً");
  confirmBox("هل تريد حذف السلفة المحددة نهائياً؟",async()=>{
    const {error}=await db.from("advances").delete().eq("id",selectedAdvanceId);
    if(error) return toast("تعذر الحذف: "+error.message);
    selectedAdvanceId=null; clearForm(); await loadAdvances(); toast("تم حذف السلفة");
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

function setMainView(view){
  const advances=view==='advances', leaves=view==='leaves';
  document.querySelectorAll('.advances-part').forEach(el=>el.classList.toggle('hidden-view',!advances));
  document.querySelectorAll('.leaves-part').forEach(el=>el.classList.toggle('hidden-view',!leaves));
  $('advancesActions')?.classList.toggle('show-actions',advances);
  document.querySelectorAll('.main-nav').forEach(b=>b.classList.remove('active'));
  if(view==='advances') $('advancesNav')?.classList.add('active');
  if(view==='leaves') {$('leavesNav')?.classList.add('active'); loadLeaves();}
  if(view==='penalties') $('penaltiesNav')?.classList.add('active');
  if(view==='rewards') $('rewardsNav')?.classList.add('active');
}
function openPasswordModal(forgot=false){
  const value=$("loginNameSelect")?.value||"";
  if(!value || !value.startsWith('giver:')) return setAuthError('اختر اسم المانح أولاً');
  $('passwordModalTitle').textContent=forgot?'نسيت كلمة المرور':'تغيير كلمة المرور';
  $('passwordChangeFields')?.classList.toggle('hidden',forgot);
  $('forgotPasswordNote')?.classList.toggle('hidden',!forgot);
  $('oldPassword').value=''; $('newPassword').value=''; $('confirmPassword').value='';
  $('passwordModal').classList.add('show');
}
async function savePasswordChange(){
  const value=$("loginNameSelect")?.value||"";
  const id=value.replace(/^giver:/,'');
  if(!value.startsWith('giver:')) return toast('اختر اسم المانح أولاً');
  if($('passwordChangeFields').classList.contains('hidden')) return toast('إعادة التعيين تحتاج اعتماد المدير');
  const old=$('oldPassword').value, p1=$('newPassword').value, p2=$('confirmPassword').value;
  if(!old)return toast('أدخل كلمة المرور الحالية');
  if(p1.length<6)return toast('كلمة المرور يجب أن تكون 6 أحرف أو أكثر');
  if(p1!==p2)return toast('كلمتا المرور غير متطابقتين');
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
  else{showAuthScreen();loadGiverLoginList();}
}
$("loginBtn").onclick=unifiedLogin;
$("loginNameSelect").onchange=updateUnifiedLoginMode;
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
$('closeLeave')?.addEventListener('click',()=>{selectedLeaveId=null;$('leaveModal')?.classList.remove('show');});
$('leaveType')?.addEventListener('change',toggleLeaveFields);
$('saveLeave')?.addEventListener('click',saveLeave);
$('advancesNav')?.addEventListener('click',()=>setMainView('advances'));
$('leavesNav')?.addEventListener('click',()=>setMainView('leaves'));
$('penaltiesNav')?.addEventListener('click',()=>{setMainView('penalties');toast('قسم العقوبات سيتم تفعيله في المرحلة القادمة');});
$('rewardsNav')?.addEventListener('click',()=>{setMainView('rewards');toast('قسم المكافئات سيتم تفعيله في المرحلة القادمة');});
$('addEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('add'));
$('deleteEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('delete'));
$('changePasswordBtn')?.addEventListener('click',()=>openPasswordModal(false));
$('forgotPasswordBtn')?.addEventListener('click',()=>openPasswordModal(true));
$('closePassword')?.addEventListener('click',()=>$('passwordModal')?.classList.remove('show'));
$('savePassword')?.addEventListener('click',savePasswordChange);
initCustomSelects();

document.addEventListener("keydown",e=>{
  if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();addAdvance();}
});
init();
