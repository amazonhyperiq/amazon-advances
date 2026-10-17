const SUPABASE_URL = "https://vvexorzjkpwduykinwsw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RoMHq19grLJWNu95uPSwug_XwiKt2bB";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PUSH_VAPID_PUBLIC_KEY = "BKr8bAqliSKJYef6L974YhlnjPzWUqBI4tw9zw4fpihhv0E6Aw-pI5iN2ZLIv-P7klAvkVTJRXYldnd1hQfPzsg";

let authRole = null;
let authToken = null;
let authName = null;
let giverLoginList = [];
let adminLoginUnlocked = localStorage.getItem("advance_manager_device") === "1";

function setAuthError(msg){const el=\$("authError");if(el)el.textContent=msg||"";}
function setAuthBusy(id,busy,label){const b=\$(id);if(!b)return;b.disabled=busy;if(label&&!b.dataset.originalLabel)b.dataset.originalLabel=b.textContent;b.textContent=busy?"جارٍ الدخول...":(label||b.dataset.originalLabel||b.textContent);}
function showAuthScreen(){\$("authScreen")?.classList.remove("hidden");document.body.classList.remove("giver-mode");}
function hideAuthScreen(){\$("authScreen")?.classList.add("hidden");}
function applyRoleUI(){const giverMode=authRole==='giver';document.body.classList.toggle("giver-mode",giverMode);\$("currentUserName").textContent=authName||"";const ro=\$("giverReadonly");if(ro){ro.textContent=giverMode?`✓ ${authName}`:"";ro.style.display=giverMode?'block':'none';}if(giverMode){\$("giverSelect").value="";refreshCustomSelect("giverSelect","اختر الاسم");}}
function saveAuth(role,token,name){authRole=role;authToken=token;authName=name;localStorage.setItem("advance_auth",JSON.stringify({role,token,name}));hideAuthScreen();applyRoleUI(); requestBrowserNotificationPermission();}
function clearAuth(){authRole=null;authToken=null;authName=null;localStorage.removeItem("advance_auth");sessionStorage.removeItem("advance_auth");}
function restoreAuth(){try{const raw=localStorage.getItem("advance_auth")||sessionStorage.getItem("advance_auth");const x=JSON.parse(raw||"null");if(x?.role&&x?.token&&x?.name){authRole=x.role;authToken=x.token;authName=x.name;localStorage.setItem("advance_auth",JSON.stringify({role:x.role,token:x.token,name:x.name}));sessionStorage.removeItem("advance_auth");return true;}}catch{}return false;}

function requestBrowserNotificationPermission() {
  if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission().catch(() => {});
  }
}

function showBrowserNotification(title, bodyText) {
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body: bodyText, icon: "logo.jpg" }); } catch (e) {}
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
  }
  giverLoginList=(data||[]).map(g=>({...g,password_set:null}));
  const s=\$("loginNameSelect");
  if(s){
    s.innerHTML='<option value="">اختر الاسم</option>';
    giverLoginList.forEach(g=>s.insertAdjacentHTML("beforeend",`<option value="giver:${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`));
    s.insertAdjacentHTML("beforeend",'<option value="admin">عمر اسماعيل</option>');
  }
  updateUnifiedLoginMode();
}

function revealAdminLogin(){
  if(adminLoginUnlocked)return;
  adminLoginUnlocked=true;
  const s=\$("loginNameSelect");
  if(s && ![...s.options].some(o=>o.value==='admin')) s.insertAdjacentHTML("beforeend",'<option value="admin">عمر اسماعيل</option>');
  setAuthError("تم إظهار اسم المدير على هذا الجهاز");
  setTimeout(()=>setAuthError(""),1800);
}

function updateUnifiedLoginMode(){
  const value=\$("loginNameSelect")?.value||"";
  const pass=\$("loginPassword");
  const firstBtn=\$("showFirstSetupBtn");
  const existing=\$("loginExisting");
  const setup=\$("giverFirstSetup");
  setup?.classList.add("hidden");
  existing?.classList.remove("hidden");
  firstBtn?.classList.toggle("hidden",!value.startsWith("giver:"));
  if(pass){pass.value="";pass.placeholder=value==='admin'?"كلمة مرور المدير":"أدخل كلمة المرور";}
}

function showFirstPasswordSetup(){
  const value=\$("loginNameSelect")?.value||"";
  if(!value.startsWith("giver:")) return setAuthError("اختر اسم المانح أولاً");
  \$("loginExisting")?.classList.add("hidden");
  \$("giverFirstSetup")?.classList.remove("hidden");
  setAuthError("");
}

async function unifiedLogin(){
  setAuthError("");
  const value=\$("loginNameSelect").value;
  const password=\$("loginPassword").value;
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
    return setAuthError("بيانات الدخول غير صحيحة. استخدم خيار إعداد كلمة المرور إذا كان هذا أول دخول.");
  }
  saveAuth("giver",data.token,data.giver_name);
  await startApp();
}

async function giverFirstPassword(){
  setAuthError("");
  const value=\$("loginNameSelect").value;
  const id=value.replace(/^giver:/,'');
  const p1=$("giverNewPassword").value,p2=$("giverConfirmPassword").value;
  if(!value.startsWith('giver:'))return setAuthError("اختر اسم المانح أولاً");
  if(p1!==p2)return setAuthError("كلمتا المرور غير متطابقتين");
  setAuthBusy("giverSetupBtn",true,"حفظ");
  const {error:setError}=await db.rpc("advance_giver_set_first_password",{p_giver_id:id,p_password:p1});
  if(setError){setAuthBusy("giverSetupBtn",false,"حفظ");return setAuthError("تعذر إعداد كلمة المرور");}
  const {data,error}=await db.rpc("advance_giver_login",{p_giver_id:id,p_password:p1});
  setAuthBusy("giverSetupBtn",false,"حفظ");
  if(error)return setAuthError("تعذر تسجيل الدخول");
  saveAuth("giver",data.token,data.giver_name);
  await startApp();
}

function logout(){clearAuth();location.reload();}

let employees=[], givers=[], advances=[], leaves=[];
let selectedAdvanceId=null, selectedLeaveId=null;

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
  const {data}=await db.from('advance_leaves').select('id,employee_id,giver_id,leave_type,leave_date,start_date,end_date,start_time,end_time,notes,created_at,employees:employee_id(name),advance_givers:giver_id(name)').order('created_at',{ascending:false});
  leaves=data||[];
  const body=\$('leavesTable')?.querySelector('tbody');
  if(body){
    body.innerHTML=leaves.map((l,i)=>{
      const en=l.employees?.name||'غير محدد', gn=l.advance_givers?.name||'غير محدد';
      const actions=authRole==='manager' ? `<button class="mini-edit" onclick="editLeave('${l.id}')">تعديل</button><button class="mini-danger" onclick="deleteLeave('${l.id}')">حذف</button>` : '—';
      return `<tr><td>${i+1}</td><td>${escapeHtml(en)}</td><td>${leaveTypeLabel(l.leave_type)}</td><td>${escapeHtml(leaveRangeLabel(l))}</td><td>${escapeHtml(gn)}</td><td>${escapeHtml(l.notes||'')}</td><td>${actions}</td></tr>`;
    }).join('') || `<tr><td colspan="7" class="empty-cell">لا توجد إجازات مسجلة</td></tr>`;
  }
}
function toggleLeaveFields(){
  const type=\$('leaveType')?.value;
  $('dayLeaveFields')?.classList.toggle('hidden',type!=='day');$('timeLeaveFields')?.classList.toggle('hidden',type!=='time');
}
function openLeaveModal(id=null){
  if(!authRole) return toast('سجل الدخول أولاً');
  selectedLeaveId=id||null;
  \$('leaveModalTitle').textContent=id?'تعديل الإجازة':'إضافة إجازة';
  \$('leaveEmployee').innerHTML='<option value="">اختر الموظف</option>'+employees.filter(x=>x.is_active).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
  \$('leaveGiver').innerHTML='<option value="">اختر الاسم</option>'+givers.filter(x=>x.is_active).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
  $('leaveGiverWrap').style.display=authRole==='giver'?'none':'';$('leaveModal')?.classList.add('show');
}
async function saveLeave(){
  const employee_id=\$('leaveEmployee').value,leave_type=$('leaveType').value,notes=$('leaveNotes').value.trim()||null;
  if(!employee_id)return toast('اختر الموظف');
  const giver_id = authRole==='giver' ? currentGiverId() : (\$('leaveGiver')?.value || null);
  let row={employee_id,giver_id,leave_type,notes};
  if(leave_type==='time'){
    row.leave_date=\$('leaveDate').value; row.start_time=$('leaveStart').value; row.end_time=$('leaveEnd').value;
  }else{
    row.start_date=$('leaveStartDate').value; row.end_date=$('leaveEndDate').value;
  }
  const result = selectedLeaveId ? await db.from('advance_leaves').update(row).eq('id',selectedLeaveId) : await db.from('advance_leaves').insert(row);
  if(result.error)return toast('تعذر حفظ الإجازة');
  \$('leaveModal')?.classList.remove('show');
  await loadLeaves();
  showBrowserNotification("إجازة", "تم حفظ الإجازة بنجاح");
  toast('تمت الإضافة بنجاح');
}
window.editLeave=id=>openLeaveModal(id);
async function deleteLeave(id){
  await db.from('advance_leaves').delete().eq('id',id);
  await loadLeaves();
  toast('تم الحذف');
}

function registerServiceWorker(){
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

async function startApp(){
  applyRoleUI();
  registerServiceWorker();
  try{
    const [e,g]=await Promise.all([db.from("employees").select("*").order("name"),db.from("advance_givers").select("*").order("name")]);
    employees=e.data||[]; givers=g.data||[];
  }catch{}
  setMainView('home');
}

const \$ = id => document.getElementById(id);
const money = n => Number(n||0).toLocaleString("en-US");
const isoToday = () => new Date().toISOString().slice(0,10);
const currentMonthKey = () => isoToday().slice(0,7);
const arDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-GB") : "";
function toast(msg){ const t=\$("toast"); if(!t)return; t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2500); }
function setMonthHeader(){ const sm=\$("summaryMonth"); if(sm) sm.textContent=currentMonthKey(); }
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

async function addAdvance(){
  const employee_id=$("employeeSelect")?.value, amount=Number($("amount")?.value.replace(/,/g,"")||0);
  if(!employee_id) return toast("اختر الموظف");
  if(!amount) return toast("أدخل المبلغ");
  const res = await db.rpc("create_advance",{p_employee_id:employee_id,p_amount:amount,p_advance_date:isoToday(),p_giver_id:\$("giverSelect")?.value||null,p_cashier_id:null,p_notes:null});
  if(res.error) return toast("تعذر الحفظ");
  showBrowserNotification("سلفة جديدة", "تمت إضافة سلفة جديدة");
  toast("تمت الإضافة بنجاح");
}

function setMainView(view){
  ['homeDashboard','advancesMenu','leavesMenu','salaryMenu','penaltiesMenu'].forEach(id=>\$(id)?.classList.add('hidden-view'));
  if(view==='home')\$('homeDashboard')?.classList.remove('hidden-view');
  if(view==='advances')\$('advancesMenu')?.classList.remove('hidden-view');
  if(view==='leaves')\$('leavesMenu')?.classList.remove('hidden-view');
}

async function init(){
  registerServiceWorker();
  if($("today")) $("today").textContent=new Date().toLocaleDateString("en-GB");
  if(restoreAuth()){hideAuthScreen();await startApp();}
  else{showAuthScreen();await loadGiverLoginList();}
}

\$("loginBtn")?.addEventListener("click",unifiedLogin);
\$("loginNameSelect")?.addEventListener("change",updateUnifiedLoginMode);
\$("logoutBtn")?.addEventListener("click",logout);
\$("addBtn")?.addEventListener("click",addAdvance);
\$('saveLeave')?.addEventListener('click',saveLeave);
$('advancesNav')?.addEventListener('click',()=>setMainView('advances'));$('leavesNav')?.addEventListener('click',()=>setMainView('leaves'));
$('homeFromAdvancesBtn')?.addEventListener('click',()=>setMainView('home'));$('homeFromLeavesBtn')?.addEventListener('click',()=>setMainView('home'));

init();
