const SUPABASE_URL = "https://vvexorzjkpwduykinsw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RoMHq19grLJWNu95uPSwug_XwiKt2bB";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let employees=[], givers=[], advances=[];
let selectedAdvanceId=null;

const $ = id => document.getElementById(id);
const money = n => Number(n||0).toLocaleString("en-US");
const isoToday = () => new Date().toISOString().slice(0,10);
const arDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-GB") : "";
const monthLabel = d => {
  const x = d ? new Date(d+"T00:00:00") : new Date();
  return `${x.getMonth()+1} / ${x.getFullYear()}`;
};
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2500); }

function setMonthHeader(){
  const d=$("advanceDate").value || isoToday();
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
  const s=$(id); s.innerHTML=`<option value="">${placeholder}</option>`;
  data.filter(x=>x.is_active).forEach(x=>s.insertAdjacentHTML("beforeend",`<option value="${x.id}">${escapeHtml(x.name)}</option>`));
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

function renderAdvances(){
  const month=$("advanceDate").value.slice(0,7);
  const rows=advances.filter(a=>String(a.advance_date).slice(0,7)===month);
  const body=$("advancesTable").querySelector("tbody");
  body.innerHTML="";
  rows.forEach((a,i)=>{
    const tr=document.createElement("tr");
    if(a.id===selectedAdvanceId) tr.classList.add("selected");
    tr.dataset.id=a.id;
    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${escapeHtml(a.operation_no)}</td>
      <td>${arDate(a.advance_date)}</td>
      <td>${escapeHtml(a.employees?.name||"")}</td>
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
  $("employeeSummary").querySelector("tbody").innerHTML=Object.entries(byEmp).map(([n,v])=>`<tr><td>${escapeHtml(n)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد بيانات</td></tr>`;
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
  $("detailsMonth").textContent=monthLabel($("advanceDate").value);
  $("detailsCount").textContent=rows.length;
  body.innerHTML=rows.map((a,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${escapeHtml(a.operation_no)}</td>
      <td>${arDate(a.advance_date)}</td>
      <td>${escapeHtml(a.employees?.name||"")}</td>
      <td>${money(a.amount)}</td>
      <td>${escapeHtml(a.advance_givers?.name||"")}</td>
      <td>${escapeHtml(a.notes||"")}</td>
    </tr>`).join("") || `<tr><td colspan="7">لا توجد سلف مسجلة لهذا الشهر</td></tr>`;
}

async function addAdvance(){
  const employee_id=$("employeeSelect").value, amount=Number($("amount").value), date=$("advanceDate").value||isoToday();
  if(!employee_id) return toast("اختر الموظف أولاً");
  if(!amount || amount<=0) return toast("أدخل مبلغ السلفة");
  const {error}=await db.rpc("create_advance",{
    p_employee_id:employee_id,p_amount:amount,p_advance_date:date,
    p_giver_id:$("giverSelect").value||null,p_cashier_id:null,
    p_notes:$("notes").value.trim()||null
  });
  if(error) return toast("تعذر حفظ السلفة: "+error.message);
  clearForm(); await loadAdvances(); toast("تم حفظ السلفة بنجاح");
}

async function editAdvance(){
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
  setMonthHeader(); renderAdvances();
}

function confirmBox(text,yes){
  $("confirmText").textContent=text; $("confirmModal").classList.add("show");
  $("confirmYes").onclick=()=>{ $("confirmModal").classList.remove("show"); yes(); };
  $("confirmNo").onclick=()=>$("confirmModal").classList.remove("show");
}

function openPeople(type){
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
  $("personName").value=""; await loadPeople(); renderPeople(type); toast("تمت الإضافة");
}

async function exportPDF(){
  const month=$("advanceDate").value.slice(0,7);
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

async function init(){
  $("today").textContent=new Date().toLocaleDateString("en-GB");
  $("advanceDate").value=isoToday(); setMonthHeader();
  try{
    await loadPeople(); await loadAdvances();
  }catch(e){ console.error(e); toast("تحقق من اتصال Supabase وصلاحيات الجداول"); }
}
$("addBtn").onclick=addAdvance;
$("editBtn").onclick=editAdvance;
$("deleteBtn").onclick=deleteAdvance;
$("printBtn").onclick=()=>window.print();
$("exportBtn").onclick=exportPDF;
$("advanceDate").onchange=()=>{setMonthHeader();renderAdvances();};
$("closePeople").onclick=()=>$("peopleModal").classList.remove("show");
$("savePerson").onclick=savePerson;
$("employeeSelect").ondblclick=()=>openPeople("employees");
$("giverSelect").ondblclick=()=>openPeople("givers");

document.addEventListener("keydown",e=>{
  if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();addAdvance();}
});
init();
