const SUPABASE_URL = "https://vvexorzjkpwduykinwsw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RoMHq19grLJWNu95uPSwug_XwiKt2bB";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PUSH_VAPID_PUBLIC_KEY = "BKr8bAqliSKJYef6L974YhlnjPzWUqBI4tw9zw4fpihhv0E6Aw-pI5iN2ZLIv-P7klAvkVTJRXYldnd1hQfPzsg";

let authRole = null;
let authToken = null;
let authName = null;
let giverLoginList = [];
let adminLoginUnlocked = localStorage.getItem("advance_manager_device") === "1";

function setAuthError(msg){const el=document.getElementById("authError");if(el)el.textContent=msg||"";}
function setAuthBusy(id,busy,label){const b=document.getElementById(id);if(!b)return;b.disabled=busy;if(label&&!b.dataset.originalLabel)b.dataset.originalLabel=b.textContent;b.textContent=busy?"جارٍ الدخول...":(label||b.dataset.originalLabel||b.textContent);}
function showAuthScreen(){document.getElementById("authScreen")?.classList.remove("hidden");document.body.classList.remove("giver-mode");}
function hideAuthScreen(){document.getElementById("authScreen")?.classList.add("hidden");}
function applyRoleUI(){const giverMode=authRole==='giver';document.body.classList.toggle("giver-mode",giverMode);document.getElementById("currentUserName").textContent=authName||"";const ro=document.getElementById("giverReadonly");if(ro){ro.textContent=giverMode?`✓ ${authName}`:"";ro.style.display=giverMode?'block':'none';}if(giverMode){document.getElementById("giverSelect").value="";}}
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
    data=fallback.data;
  }
  giverLoginList=(data||[]).map(g=>({...g,password_set:null}));
  const s=document.getElementById("loginNameSelect");
  if(s){
    s.innerHTML='<option value="">اختر الاسم</option>';
    giverLoginList.forEach(g=>s.insertAdjacentHTML("beforeend",`<option value="giver:${g.id}">${g.name}</option>`));
    s.insertAdjacentHTML("beforeend",'<option value="admin">عمر اسماعيل</option>');
  }
}

function revealAdminLogin(){
  if(adminLoginUnlocked)return;
  adminLoginUnlocked=true;
  const s=document.getElementById("loginNameSelect");
  if(s && ![...s.options].some(o=>o.value==='admin')) s.insertAdjacentHTML("beforeend",'<option value="admin">عمر اسماعيل</option>');
  setAuthError("تم إظهار اسم المدير على هذا الجهاز");
  setTimeout(()=>setAuthError(""),1800);
}

function updateUnifiedLoginMode(){
  const value=document.getElementById("loginNameSelect")?.value||"";
  const pass=document.getElementById("loginPassword");
  const firstBtn=document.getElementById("showFirstSetupBtn");
  const existing=document.getElementById("loginExisting");
  const setup=document.getElementById("giverFirstSetup");
  setup?.classList.add("hidden");
  existing?.classList.remove("hidden");
  firstBtn?.classList.toggle("hidden",!value.startsWith("giver:"));
  if(pass){pass.value="";pass.placeholder=value==='admin'?"كلمة مرور المدير":"أدخل كلمة المرور";}
}

async function unifiedLogin(){
  setAuthError("");
  const value=document.getElementById("loginNameSelect").value;
  const password=document.getElementById("loginPassword").value;
  if(!value)return setAuthError("اختر اسمك أولاً");
  if(value==='admin'){
    if(!password)return setAuthError("أدخل كلمة مرور المدير");
    setAuthBusy("loginBtn",true,"دخول");
    const {data,error}=await db.rpc("advance_manager_login",{p_username:"admin",p_password:password});
    setAuthBusy("loginBtn",false,"دخول");
    if(error)return setAuthError("بيانات الدخول غير صحيحة");
    localStorage.setItem("advance_manager_device","1");
    saveAuth("manager",data.token,"عمر اسماعيل");
    location.reload();
    return;
  }
  const giverId=value.replace(/^giver:/,'');
  if(!password)return setAuthError("أدخل كلمة المرور");
  setAuthBusy("loginBtn",true,"دخول");
  const {data,error}=await db.rpc("advance_giver_login",{p_giver_id:giverId,p_password:password});
  setAuthBusy("loginBtn",false,"دخول");
  if(error)return setAuthError("بيانات الدخول غير صحيحة");
  saveAuth("giver",data.token,data.giver_name);
  location.reload();
}

function logout(){clearAuth();location.reload();}

let employees=[], givers=[], advances=[], leaves=[];

async function init(){
  if(document.getElementById("today")) document.getElementById("today").textContent=new Date().toLocaleDateString("en-GB");
  if(restoreAuth()){hideAuthScreen();}
  else{showAuthScreen();await loadGiverLoginList();}
}

document.getElementById("loginBtn")?.addEventListener("click",unifiedLogin);
document.getElementById("loginNameSelect")?.addEventListener("change",updateUnifiedLoginMode);
document.getElementById("logoutBtn")?.addEventListener("click",logout);

let logoTapCount=0, logoTapTimer=null;
document.querySelector(".auth-brand img")?.addEventListener("click",()=>{
  logoTapCount++;
  clearTimeout(logoTapTimer);
  logoTapTimer=setTimeout(()=>{logoTapCount=0;},1800);
  if(logoTapCount>=5){logoTapCount=0;revealAdminLogin();}
});

init();
