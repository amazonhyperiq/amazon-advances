const SUPABASE_URL = "https://vvexorzjkpwduykinwsw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RoMHq19grLJWNu95uPSwug_XwiKt2bB";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
function saveAuth(role,token,name){authRole=role;authToken=token;authName=name;localStorage.setItem("advance_auth",JSON.stringify({role,token,name}));hideAuthScreen();applyRoleUI(); requestBrowserNotificationPermission();}
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

// --- نظام إشعارات المتصفح الداخلية ---
function requestBrowserNotificationPermission() {
  if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission().catch(() => {});
  }
}

function showBrowserNotification(title, bodyText) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: bodyText,
        icon: "logo.jpg"
      });
    } catch (e) {
      console.warn("Notification display failed", e);
    }
  }
}

async function loadGiverLoginList(){
  setAuthError("");
  let {data,error}=await db.rpc("get_active_givers_for_login");
  if(error){
    const fallback=await db.from("advance_givers").select("id,name,is_active").eq("is_active",true).order("name");
    data=fallback.data; error=fallback.error;
  }
  if(error){setAuthError("تعذر تحميل أسماء المانحين: "+error.message);return;}
  if(!error && (!data || data.length===0)) {
    const direct=await db.from("advance_givers").select("id,name,is_active").eq("is_active",true).order("name",{ascending:true});
    if(!direct.error && Array.isArray(direct.data) && direct.data.length) data=direct.data;
    else if(direct.error) error=direct.error;
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
  const giver_id = authRole==='giver' ? currentGiverId() : ($('leaveGiver')?.value || null);
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
  
  showBrowserNotification(wasEdit ? "تعديل إجازة" : "إضافة إجازة", wasEdit ? "تم تعديل إجازة في نظام أمازون" : "تمت إضافة إجازة جديدة بنجاح");
  toast(wasEdit?'تم تعديل الإجازة بنجاح':'تمت إضافة الإجازة بنجاح'); openLeavesMenu();
}
window.editLeave=id=>openLeaveModal(id);
async function deleteLeave(id){
  if(authRole!=='manager')return toast('الحذف للمدير فقط');
  confirmBox('هل تريد حذف الإجازة المحددة؟',async()=>{
    const {error}=await db.from('advance_leaves').delete().eq('id',id);
    if(error)return toast('تعذر حذف الإجازة: '+error.message);
    await loadLeaves();
    showBrowserNotification("حذف إجازة", "تم حذف إجازة من النظام");
    toast('تم حذف الإجازة بنجاح');
  });
}

function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"}).catch(()=>null);
}

async function startApp(){
  applyRoleUI();
  try{
    registerServiceWorker();
    await loadPeople();
    await loadAdvances();
    await loadLeaves();
    await loadSalaries();
    await loadPenalties();
    setMainView('home');
    requestBrowserNotificationPermission();
  }catch(e){
    console.error(e);
    toast("تعذر تحميل البيانات: "+(e.message||e));
  }
}

const $ = id => document.getElementById(id);
const money = n => { const v=Number(n||0); return Number.isFinite(v) ? v.toLocaleString("en-US",{useGrouping:true,maximumFractionDigits:3}) : "0"; };
const isoToday = () => new Date().toISOString().slice(0,10);
const currentMonthKey = () => isoToday().slice(0,7);
const arDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-GB") : "";
const monthLabel = d => {
  const x = d ? new Date(d+"T00:00:00") : new Date();
  return `${x.getMonth()+1} / ${x.getFullYear()}`;
};
function toast(msg){ const t=$("toast"); if(!t)return; t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2500); }

function setMonthHeader(){
  const d=isoToday();
  const monthTitleEl=$("monthTitle"); if(monthTitleEl) monthTitleEl.textContent=`شهر ${monthLabel(d)}`;
  const sm=$("summaryMonth"); if(sm) sm.textContent=monthLabel(d);
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
  const s=$(id); if(!s)return;
  s.innerHTML=`<option value="">${escapeHtml(placeholder)}</option>`;
  data.filter(x=>x.is_active).forEach(x=>s.insertAdjacentHTML("beforeend",`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`));
  refreshCustomSelect(id, placeholder);
}

function refreshCustomSelect(id, placeholder){
  const select=$(id); if(!select) return;
  const picker=select.closest('.custom-select'); if(!picker) return;
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
    if(!select || !display) return;
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
  const selectWithNames=`
    id,operation_no,employee_id,giver_id,amount,advance_date,notes,
    employees:employee_id(name),
    advance_givers:giver_id(name)
  `;
  let result=await db.from("advances").select(selectWithNames).order("advance_date",{ascending:false}).order("created_at",{ascending:false});
  if(result.error){
    const fallback=await db.from("advances").select("id,operation_no,employee_id,giver_id,amount,advance_date,notes").order("advance_date",{ascending:false});
    if(fallback.error) throw fallback.error;
    const employeeMap=new Map(employees.map(e=>[e.id,e]));
    const giverMap=new Map(givers.map(g=>[g.id,g]));
    advances=(fallback.data||[]).map(a=>({...a,employees:employeeMap.get(a.employee_id)||null,advance_givers:giverMap.get(a.giver_id)||null}));
  }else{
    advances=result.data||[];
  }
  renderAdvances();
}

const PERSON_COLORS = ["#e8f5e9", "#e3f2fd", "#fff3e0", "#f3e5f5", "#e0f7fa", "#fff8e1", "#fce4ec", "#ede7f6", "#e8eaf6", "#f1f8e9", "#fbe9e7", "#e0f2f1"];
function personColor(name){
  const text=String(name||"");
  let hash=0;
  for(let i=0;i<text.length;i++) hash=((hash<<5)-hash)+text.charCodeAt(i)|0;
  return PERSON_COLORS[Math.abs(hash)%PERSON_COLORS.length];
}
function colorStyle(name){ return `background:${personColor(name)};`; }

function renderAdvances(){
  const month=currentMonthKey();
  const rows=advances.filter(a=>String(a.advance_date).slice(0,7)===month);
  const body=$("advancesTable")?.querySelector("tbody");
  if(!body) return;
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
  if($("employeeSelect")) $("employeeSelect").value=a.employee_id||"";
  if($("amount")) $("amount").value=formatMoneyInputValue(a.amount);
  if($("advanceDate")) $("advanceDate").value=a.advance_date;
  if($("giverSelect")) $("giverSelect").value=a.giver_id||"";
  if($("notes")) $("notes").value=a.notes||"";
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
  if($("giverSummary")) $("giverSummary").querySelector("tbody").innerHTML=Object.entries(byGiver).map(([n,v])=>`<tr><td>${escapeHtml(n)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد بيانات</td></tr>`;
  if($("employeeSummary")) $("employeeSummary").querySelector("tbody").innerHTML=Object.entries(byEmp).map(([n,v])=>`<tr style="background:${personColor(n)}"><td class="person-cell" style="background:${personColor(n)}">${escapeHtml(n)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد بيانات</td></tr>`;
  const total=rows.reduce((s,a)=>s+Number(a.amount),0);
  if($("opCount")) $("opCount").textContent=rows.length;
  if($("employeeCount")) $("employeeCount").textContent=new Set(rows.map(a=>a.employee_id)).size;
  if($("giverCount")) $("giverCount").textContent=new Set(rows.map(a=>a.giver_id).filter(Boolean)).size;
  if($("grandTotal")) $("grandTotal").textContent=`${money(total)} د.ع`;
  renderPrintDetails(rows);
}

function renderPrintDetails(rows){
  const body=$("printDetailsBody");
  if(!body) return;
  if($("detailsMonth")) $("detailsMonth").textContent=monthLabel(isoToday());
  if($("detailsCount")) $("detailsCount").textContent=rows.length;
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

function numericValue(value){
  const raw=String(value??"").replace(/,/g,"").trim();
  if(!raw)return 0;
  const n=Number(raw);
  return Number.isFinite(n)?n:0;
}

function formatMoneyInputValue(value){
  const digits=String(value??"").replace(/[^0-9]/g,"");
  if(!digits)return "";
  return Number(digits).toLocaleString("en-US");
}

function bindMoneyInput(id){
  const el=$(id);
  if(!el || el.dataset.moneyBound==="1") return;
  el.dataset.moneyBound="1";
  el.addEventListener("input",()=>{
    const start=el.selectionStart??el.value.length;
    const before=el.value.slice(0,start);
    const digitCount=(before.match(/\d/g)||[]).length;
    const formatted=formatMoneyInputValue(el.value);
    el.value=formatted;
    let pos=0,count=0;
    while(pos<formatted.length && count<digitCount){
      if(/\d/.test(formatted[pos])) count++;
      pos++;
    }
    try{el.setSelectionRange(pos,pos);}catch{}
  });
  el.addEventListener("change",()=>{ el.value=formatMoneyInputValue(el.value); });
  el.addEventListener("blur",()=>{ el.value=formatMoneyInputValue(el.value); });
}

async function addAdvance(){
  if(!authRole||!authToken) return toast("سجل الدخول أولاً");
  const currentMonth=currentMonthKey();
  const selectedDate=$("advanceDate")?.value||isoToday();
  if(selectedDate.slice(0,7)!==currentMonth){
    if($("advanceDate")) $("advanceDate").value=isoToday();
    setMonthHeader();
    return toast("لا يمكن إضافة سلفة خارج الشهر الحالي");
  }
  const employee_id=$("employeeSelect")?.value;
  const amount=numericValue($("amount")?.value);
  const date=selectedDate;
  const notes=$("notes")?.value.trim()||null;
  if(!employee_id) return toast("اختر الموظف أولاً");
  if(!amount||amount<=0) return toast("أدخل مبلغ السلفة");
  let result;
  try{
    if(authRole==='giver'){
      result=await db.rpc("create_advance_for_giver",{p_token:authToken,p_employee_id:employee_id,p_amount:amount,p_advance_date:date,p_notes:notes});
    }else{
      result=await db.rpc("create_advance",{p_employee_id:employee_id,p_amount:amount,p_advance_date:date,p_giver_id:$("giverSelect")?.value||null,p_cashier_id:null,p_notes:notes});
    }
  }catch(err){
    return toast("تعذر حفظ السلفة: "+(err?.message||"خطأ غير معروف"));
  }
  if(result?.error){
    const detail=result.error.hint||result.error.details||result.error.message||"خطأ غير معروف";
    return toast("تعذر حفظ السلفة: "+detail);
  }
  try{await loadAdvances();}catch(err){
    return toast("تمت إضافة السلفة، لكن تعذر تحديث الجدول: "+(err?.message||"خطأ غير معروف"));
  }
  clearForm();
  showBrowserNotification("سلفة جديدة", "تمت إضافة سلفة جديدة في نظام أمازون");
  toast("تمت إضافة السلفة بنجاح");
}

async function editAdvance(){
  if(authRole!=="manager") return toast("هذه الصلاحية للمدير فقط");
  if(!selectedAdvanceId) return toast("حدد السلفة من الجدول أولاً");
  if(!$("employeeSelect")?.value) return toast("اختر الموظف أولاً");
  const amount=numericValue($("amount")?.value);
  if(!amount || amount<=0) return toast("أدخل مبلغ السلفة");
  const {error}=await db.from("advances").update({
    employee_id:$("employeeSelect").value,
    amount:amount,
    advance_date:$("advanceDate").value,
    giver_id:$("giverSelect")?.value||null,
    cashier_id:null,
    notes:$("notes")?.value.trim()||null
  }).eq("id",selectedAdvanceId);
  if(error) return toast("تعذر التعديل: "+error.message);
  clearForm(); await loadAdvances();
  showBrowserNotification("تعديل سلفة", "تم تعديل سلفة في نظام أمازون");
  toast("تم تعديل السلفة بنجاح");
}

async function deleteAdvance(){
  if(authRole!=="manager") return toast("هذه الصلاحية للمدير فقط");
  if(!selectedAdvanceId) return toast("حدد السلفة من الجدول أولاً");
  confirmBox("هل تريد حذف السلفة المحددة نهائياً؟",async()=>{
    const {error}=await db.from("advances").delete().eq("id",selectedAdvanceId);
    if(error) return toast("تعذر الحذف: "+error.message);
    selectedAdvanceId=null; clearForm(); await loadAdvances();
    showBrowserNotification("حذف سلفة", "تم حذف سلفة من النظام");
    toast("تم حذف السلفة بنجاح");
  });
}

function clearForm(){
  selectedAdvanceId=null;
  if($("employeeSelect")) $("employeeSelect").value="";
  if($("amount")) $("amount").value="";
  if($("advanceDate")) $("advanceDate").value=isoToday();
  if($("giverSelect")) $("giverSelect").value="";
  if($("notes")) $("notes").value="";
  refreshCustomSelect("employeeSelect","اختر الموظف");
  refreshCustomSelect("giverSelect","اختر الاسم");
  setMonthHeader(); renderAdvances();
}

function confirmBox(text,yes){
  if($("confirmText")) $("confirmText").textContent=text;
  if($("confirmModal")) $("confirmModal").classList.add("show");
  if($("confirmYes")) $("confirmYes").onclick=()=>{ $("confirmModal")?.classList.remove("show"); yes(); };
  if($("confirmNo")) $("confirmNo").onclick=()=>$("confirmModal")?.classList.remove("show");
}

function openPeople(type){
  if(authRole!=="manager") return toast("إدارة الموظفين والمانحين للمدير فقط");
  document.querySelectorAll('.custom-select.open').forEach(closeCustomSelect);
  const title={employees:"إدارة الموظفين والعمال",givers:"إدارة مانحي السلف"}[type];
  if($("peopleTitle")) $("peopleTitle").textContent=title;
  if($("peopleModal")){
    $("peopleModal").classList.add("show");
    $("peopleModal").dataset.type=type;
  }
  if($("personName")) $("personName").value="";
  renderPeople(type);
}

function renderPeople(type){
  const arr={employees,givers}[type];
  if($("peopleList")){
    $("peopleList").innerHTML=arr.map(p=>`
      <div class="person-row">
        <span>${escapeHtml(p.name)} ${p.is_active?"":"(غير فعال)"}</span>
        <span>
          <button onclick="renamePerson('${type}','${p.id}')">✎ تعديل</button>
          <button onclick="removePerson('${type}','${p.id}')">🗑 حذف</button>
        </span>
      </div>`).join("") || "<p>لا توجد أسماء.</p>";
  }
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
  const type=$("peopleModal")?.dataset.type, name=$("personName")?.value.trim();
  if(!name)return toast("اكتب الاسم");
  const table={employees:"employees",givers:"advance_givers"}[type];
  const {error}=await db.from(table).insert({name});
  if(error)return toast("تعذر الإضافة: "+error.message);
  if($("personName")) $("personName").value="";
  await loadPeople(); renderPeople(type); toast("تمت إضافة الاسم");
}

async function savePeopleBulk(){
  const type=$("peopleModal")?.dataset.type;
  const raw=$("bulkPersonNames")?.value.trim();
  if(!raw)return toast("اكتب الأسماء، كل اسم في سطر");
  const names=[...new Set(raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  const table={employees:"employees",givers:"advance_givers"}[type];
  const {data:existing,error:readError}=await db.from(table).select("name");
  if(readError)return toast("تعذر قراءة الأسماء: "+readError.message);
  const existingSet=new Set((existing||[]).map(x=>x.name.trim()));
  const rows=names.filter(n=>!existingSet.has(n)).map(name=>({name}));
  if(!rows.length){ if($("bulkPersonNames")) $("bulkPersonNames").value=""; return toast("كل الأسماء موجودة مسبقاً"); }
  const {error}=await db.from(table).insert(rows);
  if(error)return toast("تعذر إضافة الأسماء: "+error.message);
  if($("bulkPersonNames")) $("bulkPersonNames").value="";
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

function monthKeyFromDate(value){ return String(value||'').slice(0,7); }

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

function updateDetailSelectDisplay(selectId, displayId){
  const s=$(selectId), d=$(displayId); if(!s||!d)return;
  const opt=s.options?.[s.selectedIndex];
  d.textContent=opt?String(opt.textContent||''):(s.value||'');
  d.classList.toggle('is-placeholder', !s.value);
}

function fillAdvanceDetailMonths(){
  const months=getAdvanceMonths();
  ['allAdvancesMonth','employeeAdvancesMonth'].forEach(id=>{
    const s=$(id); if(!s)return;
    const current=s.value||currentMonthKey();
    s.innerHTML='<option value="">جميع الأشهر</option>'+months.map(m=>`<option value="${m}">${monthOptionLabel(m)}</option>`).join('');
    s.value=months.includes(current)?current:'';
    s.style.color='#26352f'; s.style.webkitTextFillColor='#26352f'; s.style.fontWeight='700';
    updateDetailSelectDisplay(id, id+'Display');
  });
}

function renderAllAdvanceDetails(){
  const body=$('allAdvancesDetailsBody'); if(!body)return;
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
  const s=$('advanceDetailsEmployeeSelect'); if(!s)return;
  const current=s.value||'';
  s.innerHTML='<option value="">اختر الموظف / العامل</option>'+
    employees.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar')).map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join('');
  if(current)s.value=current;
  applyEmployeeSelectColor('advanceDetailsEmployeeSelect');
  updateDetailSelectDisplay('advanceDetailsEmployeeSelect','advanceDetailsEmployeeSelectDisplay');
}

function renderEmployeeAdvanceDetails(){
  const employeeId=$('advanceDetailsEmployeeSelect')?.value||'';
  const body=$('employeeAdvancesDetailsBody'); if(!body)return;
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
  $('leavesActions')?.classList.toggle('hidden-view',!['add','edit'].includes(mode));
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
  document.querySelectorAll('.advances-part,.leaves-part,.sub-toolbar').forEach(el=>{if(el.classList.contains('advances-part'))el.classList.toggle('hidden-view',!showMain);});
  document.querySelectorAll('.advance-report-only').forEach(el=>el.classList.toggle('hidden-view',!['print','pdf'].includes(mode)));
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
function fillMonthSelect(id,all=true){const s=$(id);if(!s)return;const old=s.value;const ms=[currentMonthKey()];s.innerHTML=(all?'<option value="">جميع الأشهر</option>':'<option value="">اختر الشهر</option>')+ms.map(m=>`<option value="${m}">${monthOptionLabel(m)}</option>`).join('');if(ms.includes(old))s.value=old;}
function updateSalaryMonthDisplay(id){const s=\$(id);if(!s)return;const label=monthOptionLabel(s.value||currentMonthKey());const map={salaryReportMonth:'salaryReportMonthTitle',salaryEmployeeMonth:'salaryEmployeeMonthTitle'};if(map[id]&&$(map[id]))$(map[id]).textContent=`الشهر: ${label}`;}
function applyEmployeeSelectColor(id){const s=\$(id);if(!s)return;const name=(employees||[]).find(e=>String(e.id)===String(s.value))?.name||'';if(name){const c=personColor(name);s.style.backgroundColor=c;s.style.fontWeight='800';s.style.color='#18382e';s.style.borderColor='#9bb9aa';}else{s.style.backgroundColor='';s.style.fontWeight='';s.style.color='';s.style.borderColor='';}}
function fillSalaryEmployeeSelects(){['salaryEmployeeInput','salaryEmployeeSelect','penaltyEmployee','penaltyEmployeeSelect'].forEach(id=>{const s=\$(id);if(!s)return;const cur=s.value;s.innerHTML='<option value="">اختر الموظف / العامل</option>'+(employees||[]).filter(x=>x.is_active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar')).map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');if(cur)s.value=cur;applyEmployeeSelectColor(id);});}

async function loadSalaries(){
  const sr=await db.from('employee_salaries').select('*');
  salaries=sr.data||[];
}

async function loadPenalties(){
  const r=await db.from('employee_penalties').select('id,employee_id,penalty_date,penalty_type,amount,currency,notes,created_at').order('penalty_date',{ascending:false});
  penalties=(r.data||[]).map(p=>({...p,employees:{name:employees.find(e=>String(e.id)===String(p.employee_id))?.name||''}}));
}

function penaltyLabel(t){return t==='absence1'?'غياب ×1':t==='absence2'?'غياب ×2':'خصم'}
function hoursForTimeLeave(l){if(!l?.start_time||!l?.end_time)return 0;const a=String(l.start_time).split(':').map(Number),b=String(l.end_time).split(':').map(Number);let x=(b[0]*60+b[1])-(a[0]*60+a[1]);if(x<0)x+=1440;return x/60;}
function salaryAttendance(s,month){const empId=s.employee_id;const official=Number(s.official_hours||8)||8;const dayLeaves=leaves.filter(l=>l.employee_id===empId&&l.leave_type==='day'&&leaveOverlapsMonth(l,month)).reduce((n,l)=>n+leaveDayCountForMonth(l,month),0);const timeHours=leaves.filter(l=>l.employee_id===empId&&l.leave_type==='time'&&monthKeyFromDate(l.leave_date)===month).reduce((n,l)=>n+hoursForTimeLeave(l),0);const penaltiesForMonth=penalties.filter(p=>p.employee_id===empId&&monthKeyFromDate(p.penalty_date)===month);const absenceDays=penaltiesForMonth.reduce((n,p)=>n+(p.penalty_type==='absence2'?2:p.penalty_type==='absence1'?1:0),0);const baseHours=official*30;const actual=Math.max(0,baseHours-(dayLeaves+absenceDays)*official-timeHours);return {official,baseHours,actual,dayLeaves,timeHours,absenceDays};}
function salaryAdvanceDue(s,month){const empId=s.employee_id;const current=advances.filter(a=>a.employee_id===empId&&monthKeyFromDate(a.advance_date)===month).reduce((n,a)=>n+Number(a.amount||0),0);return {current,carryDue:0,total:current};}
function salaryCalc(s,month){
  const currency=s.currency||'IQD';
  const nominal=Number(s.nominal_salary||0);
  const att=salaryAttendance(s,month);
  const storedOtDaily=Number(s.overtime_daily_hours||0);
  const otDaily=storedOtDaily>0?storedOtDaily:(Number(s.overtime_hours||0)/30);
  const otHours=otDaily*30;
  const overtime=otHours/30*50000;
  const empId=s.employee_id;
  const due=salaryAdvanceDue(s,month);
  const advanceDeduction=due.total;
  const dayBase=currency==='IQD'?(nominal+overtime)/30:nominal/30;
  const leaveDed=att.dayLeaves*dayBase;
  const timeDed=att.timeHours*(dayBase/att.official);
  const monthPen=penalties.filter(p=>p.employee_id===empId&&monthKeyFromDate(p.penalty_date)===month);
  const absenceDed=att.absenceDays*dayBase;
  const directPenalty=monthPen.filter(p=>p.penalty_type==='deduction'&&(p.currency||'IQD')===currency).reduce((n,p)=>n+Number(p.amount||0),0);
  const salaryNet=nominal+(currency==='IQD'?overtime:0)-leaveDed-timeDed-advanceDeduction-directPenalty-absenceDed;
  return {currency,nominal,overtime,adv:due.total,advanceDeduction,dayLeaves:att.dayLeaves,leaveDed,timeHours:att.timeHours,timeDed,absenceDays:att.absenceDays,absenceDed,directPenalty,salaryNet,workHours:att.actual};
}
function salaryStatus(s){return s.payment_status==='paid'?'تم التسليم':'لم يُسلّم';}
function paymentDateText(s){return s.payment_date?arDate(String(s.payment_date).slice(0,10)):'—';}
function salaryRowActions(s){return `<button class="mini-edit" onclick="event.stopPropagation();editSalary('${s.id}')">تعديل</button><button class="mini-danger" onclick="event.stopPropagation();deleteSalary('${s.id}')">حذف</button>`;}

function renderSalaryReport(){
  const month=$('salaryReportMonth')?.value\vert{}\vert{}currentMonthKey(),body=$('salaryReportBody');if(!body)return;
  updateSalaryMonthDisplay('salaryReportMonth');
  const rows=salaries.filter(s=>salaryMonthKey(s.salary_month)===month);
  body.innerHTML=rows.map(s=>{const e=employees.find(x=>String(x.id)===String(s.employee_id)),c=salaryCalc(s,month),u=c.currency==='USD'?'\$':'د.ع';const name=e?.name||'غير محدد';return `<tr data-employee-id="${s.employee_id}">
<td class="salary-name-cell" style="background:${personColor(name)}">${escapeHtml(name)}</td><td class="salary-nominal-cell"><strong>${money(c.nominal)} ${u}</strong></td><td class="salary-actual-hours-cell"><strong>${money(c.workHours)} س</strong><small>من 30 يوم</small></td><td class="salary-attendance-cell"><div>إجازات: ${c.dayLeaves} يوم</div><div>غياب: ${c.absenceDays} يوم</div><div>زمنيات: ${money(c.timeHours)} س</div></td><td class="salary-net-cell"><strong>${money(c.salaryNet)} ${u}</strong></td><td class="salary-status-cell"><span class="salary-status ${s.payment_status==='paid'?'paid':'pending'}">${salaryStatus(s)}</span><div class="salary-actions-inline">${s.payment_status==='paid'?'<span class="paid-mark">✓</span>':'<button class="mini-paid" onclick="event.stopPropagation();markSalaryPaid(\''+s.id+'\')">تم التسليم</button>'}${salaryRowActions(s)}</div></td></tr>`;}).join('')||'<tr><td colspan="6" class="empty-cell">لا توجد رواتب لهذا الشهر</td></tr>';
}

function setSalaryEmployeeSelection(id){const s=\$('salaryEmployeeSelect');if(s){s.value=id;applyEmployeeSelectColor('salaryEmployeeSelect');}const name=(employees||[]).find(e=>String(e.id)===String(id))?.name||'';if($('salaryEmployeeSearch'))$('salaryEmployeeSearch').value=name;}
function renderSalaryEmployeeReport(){const month=\$('salaryEmployeeMonth')?.value||currentMonthKey(),id=$('salaryEmployeeSelect')?.value,box=$('salaryEmployeeDetail');if(!box)return;const s=salaries.find(x=>String(x.employee_id)===String(id)&&salaryMonthKey(x.salary_month)===month),e=employees.find(x=>String(x.id)===String(id));if(!s){box.innerHTML='<div class="empty-cell">لا يوجد راتب مسجل لهذا الموظف</div>';return;}const c=salaryCalc(s,month),u=c.currency==='USD'?'\$':'د.ع';box.innerHTML=`<h3>كشف راتب: ${escapeHtml(e?.name||'')}</h3><div class="salary-detail-grid"><div class="salary-box net"><span>صافي الراتب</span><b>${money(c.salaryNet)} ${u}</b></div></div>`;}
async function loadSalaryFormRecord(){const employee_id=$('salaryEmployeeInput')?.value,month=$('salaryMonthInput')?.value;if(!employee_id||!month)return;const s=salaries.find(x=>String(x.employee_id)===String(employee_id)&&salaryMonthKey(x.salary_month)===month);if(!s){if($('salaryCurrency'))$('salaryCurrency').value='IQD';if($('salaryNominal'))$('salaryNominal').value='';if($('salaryOfficialHours'))$('salaryOfficialHours').value='8';return;}if($('salaryCurrency'))$('salaryCurrency').value=s.currency||'IQD';if($('salaryNominal'))$('salaryNominal').value=s.nominal_salary??0;if($('salaryOfficialHours'))$('salaryOfficialHours').value=s.official_hours??8;}

async function saveSalary(){
  if(authRole!=='manager')return toast('هذه الصلاحية للمدير فقط');
  const employee_id=$('salaryEmployeeInput')?.value,month=$('salaryMonthInput')?.value;
  if(!employee_id||!month)return toast('اختر الموظف والشهر');
  const row={employee_id,salary_month:month+'-01',currency:\$('salaryCurrency')?.value||'IQD',nominal_salary:Number($('salaryNominal')?.value\vert{}\vert{}0),official_hours:Number($('salaryOfficialHours')?.value||8)};
  const {error}=await db.from('employee_salaries').upsert(row,{onConflict:'employee_id,salary_month'});
  if(error)return toast('تعذر حفظ الراتب: '+error.message);
  await loadSalaries();
  showBrowserNotification("حفظ الراتب", "تم حفظ راتب الموظف بنجاح");
  toast('تم حفظ راتب الموظف بنجاح');
}

async function markSalaryPaid(id){if(authRole!=='manager')return toast('هذه الصلاحية للمدير فقط');const {error}=await db.from('employee_salaries').update({payment_status:'paid',payment_date:new Date().toISOString()}).eq('id',id);if(error)return toast('تعذر التسليم: '+error.message);await loadSalaries();renderSalaryReport();toast('تم التسليم بنجاح');}
window.markSalaryPaid=markSalaryPaid;
async function editSalary(id){const s=salaries.find(x=>x.id===id);if(!s)return;showSalaryMenu();await openSalaryEntry();setSalaryEmployeeSelection(s.employee_id);if($('salaryMonthInput'))$('salaryMonthInput').value=salaryMonthKey(s.salary_month);await loadSalaryFormRecord();}
window.editSalary=editSalary;
async function deleteSalary(id){if(authRole!=='manager')return toast('هذه الصلاحية للمدير فقط');confirmBox('هل تريد حذف الراتب؟',async()=>{await db.from('employee_salaries').delete().eq('id',id);await loadSalaries();renderSalaryReport();toast('تم الحذف');});}
window.deleteSalary=deleteSalary;

function showSalaryMenu(){hideAllNewPages();\$('salaryMenu')?.classList.remove('hidden-view');}
function showPenaltyMenu(){hideAllNewPages();\$('penaltiesMenu')?.classList.remove('hidden-view');}
function hideAllNewPages(){['salaryMenu','salaryEntryPage','salaryReport','salaryEmployeeReport','penaltiesMenu','penaltyEntryPage','penaltyAllReport','penaltyEmployeeReport'].forEach(id=>\$(id)?.classList.add('hidden-view'));}
async function openSalaryReport(){hideAllNewPages();await loadSalaries();fillMonthSelect('salaryReportMonth',false);\$('salaryReport')?.classList.remove('hidden-view');renderSalaryReport();}
async function openSalaryEmployee(){hideAllNewPages();await loadSalaries();fillMonthSelect('salaryEmployeeMonth',false);fillSalaryEmployeeSelects();\$('salaryEmployeeReport')?.classList.remove('hidden-view');}
async function openSalaryEntry(){hideAllNewPages();await loadSalaries();fillSalaryEmployeeSelects();if(\$('salaryMonthInput'))$('salaryMonthInput').value=currentMonthKey();$('salaryEntryPage')?.classList.remove('hidden-view');}
async function openPenaltyAll(){hideAllNewPages();await loadPenalties();fillMonthSelect('penaltyReportMonth',true);\$('penaltyAllReport')?.classList.remove('hidden-view');}
async function openPenaltyEmployee(){hideAllNewPages();await loadPenalties();fillMonthSelect('penaltyEmployeeMonth',true);fillSalaryEmployeeSelects();\$('penaltyEmployeeReport')?.classList.remove('hidden-view');}

function clearPenaltyForm(){
  selectedPenaltyId=null;
  if($('penaltyEmployee'))$('penaltyEmployee').value='';
  if($('penaltyDate'))$('penaltyDate').value=isoToday();
  if($('penaltyAmount'))$('penaltyAmount').value='';
}

function renderPenaltyEditList(){
  const body=\$('penaltyEditBody');if(!body)return;
  body.innerHTML=(penalties||[]).map(p=>`<tr><td>${escapeHtml(p.employees?.name||'')}</td><td>${arDate(p.penalty_date)}</td><td>${penaltyLabel(p.penalty_type)}</td><td>${p.amount}</td><td><button onclick="deletePenalty('${p.id}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="5">لا توجد عقوبات</td></tr>';
}

async function deletePenalty(id){
  if(authRole!=='manager')return toast('للمدير فقط');
  await db.from('employee_penalties').delete().eq('id',id);
  await loadPenalties(); renderPenaltyEditList(); toast('تم الحذف');
}
window.deletePenalty=deletePenalty;

async function savePenalty(){
  if(authRole!=='manager')return toast('للمدير فقط');
  const employee_id=\$('penaltyEmployee')?.value||'';
  const penalty_date=\$('penaltyDate')?.value||isoToday();
  const amount=Number(\$('penaltyAmount')?.value||0);
  if(!employee_id)return toast('اختر الموظف');
  const {error}=await db.from('employee_penalties').insert({employee_id,penalty_date,penalty_type:'deduction',amount,currency:'IQD'});
  if(error)return toast('تعذر الحفظ: '+error.message);
  await loadPenalties(); renderPenaltyEditList(); clearPenaltyForm();
  showBrowserNotification("عقوبة جديدة", "تم حفظ العقوبة بنجاح");
  toast('تم حفظ العقوبة بنجاح');
}

async function openPenaltyEntry(){hideAllNewPages();await loadPenalties();fillSalaryEmployeeSelects();clearPenaltyForm();renderPenaltyEditList();\$('penaltyEntryPage')?.classList.remove('hidden-view');}

function openPasswordModal(forgot=false){
  const value=\$("loginNameSelect")?.value||"";
  const isManager=authRole==='manager' || value==='admin';
  const target=\$('passwordTargetWrap');
  if(isManager){
    target?.classList.remove('hidden');
    if($('passwordModalTitle'))$('passwordModalTitle').textContent='إعادة تعيين كلمة مرور المانح';
  }else if(value.startsWith('giver:')){
    target?.classList.add('hidden');
    if($('passwordModalTitle'))$('passwordModalTitle').textContent=forgot?'إعادة تعيين كلمة المرور':'تغيير كلمة المرور';
  }else{
    return setAuthError('اختر اسم المانح أولاً');
  }
  \$('passwordModal')?.classList.add('show');
}

async function savePasswordChange(){
  const loginValue=\$("loginNameSelect")?.value||"";
  const isManager=authRole==='manager' || loginValue==='admin';
  const targetValue=isManager?(\$('passwordTargetGiver')?.value||''):loginValue;
  const id=targetValue.replace(/^giver:/,'');
  if(!targetValue.startsWith('giver:')) return toast('اختر الاسم');
  const p1=$('newPassword')?.value, p2=$('confirmPassword')?.value;
  if(p1!==p2)return toast('كلمتا المرور غير متطابقتين');
  const {error}=await db.rpc('advance_manager_reset_giver_password',{p_giver_id:id,p_manager_password:\$('forgotManagerPassword')?.value,p_new_password:p1});
  if(error)return toast(error.message||'تعذر التغيير');
  \$('passwordModal')?.classList.remove('show');
  toast('تم تغيير كلمة المرور بنجاح');
}

function openEmployeeManager(mode){
  if(authRole!=='manager') return toast('للمدير فقط');
  if(\$('peopleModal')){
    $('peopleModal').dataset.type='employees';$('peopleModal').dataset.mode=mode;
    \$('peopleModal').classList.add('show');
  }
  if($('peopleTitle'))$('peopleTitle').textContent=mode==='delete'?'حذف موظف':'إضافة موظف';
  if($('personName'))$('personName').value='';
  renderPeople('employees');
}

async function init(){
  registerServiceWorker();
  if($("today")) $("today").textContent=new Date().toLocaleDateString("en-GB");
  if($("advanceDate")) $("advanceDate").value=isoToday();
  setMonthHeader();
  if(restoreAuth()){hideAuthScreen();await startApp();}
  else{showAuthScreen();await loadGiverLoginList();}
}

if($("loginBtn")) $("loginBtn").onclick=unifiedLogin;
if($("loginNameSelect")) $("loginNameSelect").onchange=updateUnifiedLoginMode;
\$("showFirstSetupBtn")?.addEventListener("click",showFirstPasswordSetup);
\$("giverSetupBtn")?.addEventListener("click",giverFirstPassword);
\$("cancelFirstSetupBtn")?.addEventListener("click",()=>{
  \$("giverFirstSetup")?.classList.add("hidden");
  \$("loginExisting")?.classList.remove("hidden");
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

if($("logoutBtn")) $("logoutBtn").onclick=logout;
bindMoneyInput("amount");
if($("addBtn")) $("addBtn").onclick=addAdvance;
if($("editBtn")) $("editBtn").onclick=editAdvance;
\$("deleteBtn")?.addEventListener("click",deleteAdvance);
if($("printBtn")) $("printBtn").onclick=()=>window.print();
if($("exportBtn")) $("exportBtn").onclick=exportPDF;
if($("advanceDate")) $("advanceDate").onchange=()=>{
  if(\$("advanceDate").value.slice(0,7)!==currentMonthKey()){
    \$("advanceDate").value=isoToday();
    toast("الصفحة تعرض الشهر الحالي فقط");
  }
  setMonthHeader(); renderAdvances();
};
if($("savePeopleBulk")) $("savePeopleBulk").onclick=savePeopleBulk;
$("closePeople")?.addEventListener('click',()=>{$("peopleModal")?.classList.remove('show');});
if($("savePerson")) $("savePerson").onclick=savePerson;
\$('closeLeave')?.addEventListener('click',()=>{selectedLeaveId=null;$('leaveModal')?.classList.remove('show');openLeavesMenu();});$('leaveType')?.addEventListener('change',toggleLeaveFields);
$('saveLeave')?.addEventListener('click',saveLeave);$('homeFromAdvancesBtn')?.addEventListener('click',()=>setMainView('home'));
$('sectionFromAdvancesBtn')?.addEventListener('click',openAdvancesMenu);$('homeFromLeavesBtn')?.addEventListener('click',()=>setMainView('home'));
$('sectionFromLeavesBtn')?.addEventListener('click',openLeavesMenu);$('leaveWorkspaceHomeBtn')?.addEventListener('click',()=>setMainView('home'));
$('leaveWorkspaceSectionBtn')?.addEventListener('click',openLeavesMenu);$('leaveWorkspaceAddBtn')?.addEventListener('click',()=>openLeaveWorkspace('add'));
$('leaveWorkspaceEditBtn')?.addEventListener('click',()=>openLeaveWorkspace('edit'));$('advancesNav')?.addEventListener('click',()=>setMainView('advances'));
$('advanceMenuAddBtn')?.addEventListener('click',()=>openAdvanceWorkspace('add'));$('advanceMenuEditBtn')?.addEventListener('click',()=>openAdvanceWorkspace('edit'));
$('advanceMenuAddEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('add'));$('advanceMenuDeleteEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('delete'));
$('advanceMenuPrintBtn')?.addEventListener('click',()=>openAdvanceWorkspace('print'));$('advanceMenuPdfBtn')?.addEventListener('click',()=>openAdvanceWorkspace('pdf'));
$('advanceMenuAllDetailsBtn')?.addEventListener('click',()=>openAdvanceWorkspace('all'));$('advanceMenuEmployeeDetailsBtn')?.addEventListener('click',()=>openAdvanceWorkspace('employee'));
$('advanceMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('advanceDetailsEmployeeSelect')?.addEventListener('change',()=>{applyEmployeeSelectColor('advanceDetailsEmployeeSelect');updateDetailSelectDisplay('advanceDetailsEmployeeSelect','advanceDetailsEmployeeSelectDisplay');renderEmployeeAdvanceDetails();});
$('employeeAdvancesMonth')?.addEventListener('change',()=>{updateDetailSelectDisplay('employeeAdvancesMonth','employeeAdvancesMonthDisplay');renderEmployeeAdvanceDetails();});$('allAdvancesMonth')?.addEventListener('change',()=>{updateDetailSelectDisplay('allAdvancesMonth','allAdvancesMonthDisplay');renderAllAdvanceDetails();});

\$('backToAdvancesMenuBtn')?.addEventListener('click',openAdvancesMenu);
$('backToAdvancesMenuAllBtn')?.addEventListener('click',openAdvancesMenu);$('backToAdvancesMenuEmployeeBtn')?.addEventListener('click',openAdvancesMenu);
$('leavesNav')?.addEventListener('click',()=>setMainView('leaves'));$('leavesMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));
$('leaveMenuAddBtn')?.addEventListener('click',()=>openLeaveWorkspace('add'));$('leaveMenuEditBtn')?.addEventListener('click',()=>openLeaveWorkspace('edit'));
$('leaveMenuAllDetailsBtn')?.addEventListener('click',()=>openLeaveWorkspace('all'));$('leaveMenuEmployeeDetailsBtn')?.addEventListener('click',()=>openLeaveWorkspace('employee'));
$('leaveMenuPrintBtn')?.addEventListener('click',()=>openLeaveWorkspace('print'));$('leaveMenuPdfBtn')?.addEventListener('click',()=>openLeaveWorkspace('pdf'));
$('editLeaveBtn')?.addEventListener('click',()=>openLeaveWorkspace('edit'));$('leaveDetailsEmployeeSelect')?.addEventListener('change',()=>{applyEmployeeSelectColor('leaveDetailsEmployeeSelect');renderEmployeeLeaveReport();});
$('allLeavesMonth')?.addEventListener('change',renderAllLeaveDetails);$('employeeLeavesMonth')?.addEventListener('change',renderEmployeeLeaveReport);
$('backToLeavesMenuAllBtn')?.addEventListener('click',openLeavesMenu);$('backToLeavesMenuEmployeeBtn')?.addEventListener('click',openLeavesMenu);
$('penaltiesNav')?.addEventListener('click',()=>setMainView('penalties'));$('rewardsNav')?.addEventListener('click',()=>{setMainView('rewards');toast('قريباً');});
$('addLeaveBtn')?.addEventListener('click',()=>openLeaveModal());$('addEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('add'));
$('deleteEmployeeBtn')?.addEventListener('click',()=>openEmployeeManager('delete'));$('changePasswordBtn')?.addEventListener('click',()=>openPasswordModal(false));
$('forgotPasswordBtn')?.addEventListener('click',()=>openPasswordModal(true));$('closePassword')?.addEventListener('click',()=>$('passwordModal')?.classList.remove('show'));$('savePassword')?.addEventListener('click',savePasswordChange);
$('salaryNav')?.addEventListener('click',()=>setMainView('salary'));$('salaryMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));
$('salaryEntryBtn')?.addEventListener('click',openSalaryEntry);$('salaryReportBtn')?.addEventListener('click',openSalaryReport);
$('salaryEmployeeBtn')?.addEventListener('click',openSalaryEmployee);$('salaryEntryHomeBtn')?.addEventListener('click',showSalaryMenu);
$('salaryReportHomeBtn')?.addEventListener('click',showSalaryMenu);$('salaryEmployeeHomeBtn')?.addEventListener('click',showSalaryMenu);
$('salaryReportMonth')?.addEventListener('change',renderSalaryReport);$('salaryEmployeeMonth')?.addEventListener('change',renderSalaryEmployeeReport);
$('salaryEmployeeSelect')?.addEventListener('change',renderSalaryEmployeeReport);$('saveSalaryBtn')?.addEventListener('click',saveSalary);
$('salaryEmployeeInput')?.addEventListener('change',()=>{loadSalaryFormRecord();});$('salaryMonthInput')?.addEventListener('change',()=>{loadSalaryFormRecord();});
$('penaltiesMenuHomeBtn')?.addEventListener('click',()=>setMainView('home'));$('penaltyAddBtn')?.addEventListener('click',openPenaltyEntry);
$('penaltyEditBtn')?.addEventListener('click',openPenaltyEntry);$('penaltyAllReportBtn')?.addEventListener('click',openPenaltyAll);
$('penaltyEmployeeReportBtn')?.addEventListener('click',openPenaltyEmployee);$('penaltyEntryHomeBtn')?.addEventListener('click',showPenaltyMenu);
$('penaltyAllHomeBtn')?.addEventListener('click',showPenaltyMenu);$('penaltyEmployeeHomeBtn')?.addEventListener('click',showPenaltyMenu);
$('savePenaltyBtn')?.addEventListener('click',savePenalty);$('cancelPenaltyEditBtn')?.addEventListener('click',()=>{selectedPenaltyId=null;clearPenaltyForm();});

initCustomSelects();

document.addEventListener("keydown",e=>{
  if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();addAdvance();}
});

init();
