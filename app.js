// CONFIGURATION & STATE
const PIN_ADMIN = "1234";

let state = {
  guards: [], // Array of objects: { id, orderNum, nombres, apellidos, rut, empresa, time, status, pcAssigned }
  computers: {
    1: { status: "Disponible", guardId: null },
    2: { status: "Disponible", guardId: null },
    3: { status: "Disponible", guardId: null },
    4: { status: "Disponible", guardId: null }
  },
  isAdminAuthenticated: false
};

// LOAD FROM LOCAL STORAGE ON START
function loadState() {
  const savedGuards = localStorage.getItem("os10_guards");
  const savedPcs = localStorage.getItem("os10_computers");
  const savedAuth = sessionStorage.getItem("os10_admin_auth");

  if (savedGuards) {
    state.guards = JSON.parse(savedGuards);
  } else {
    state.guards = [];
  }
  
  if (savedPcs) {
    state.computers = JSON.parse(savedPcs);
  } else {
    state.computers = {
      1: { status: "Disponible", guardId: null },
      2: { status: "Disponible", guardId: null },
      3: { status: "Disponible", guardId: null },
      4: { status: "Disponible", guardId: null }
    };
  }
  
  if (savedAuth === "true") {
    state.isAdminAuthenticated = true;
  } else {
    state.isAdminAuthenticated = false;
  }
}

// SAVE TO LOCAL STORAGE
function saveState() {
  localStorage.setItem("os10_guards", JSON.stringify(state.guards));
  localStorage.setItem("os10_computers", JSON.stringify(state.computers));
}

// DOM ELEMENTS (Check if they exist before using them)
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const registroForm = document.getElementById("registro-form");
const rutInput = document.getElementById("rut");
const nombresInput = document.getElementById("nombres");
const apellidosInput = document.getElementById("apellidos");
const empresaInput = document.getElementById("empresa");

const successOverlay = document.getElementById("success-overlay");
const closeSuccessBtn = document.getElementById("close-success-btn");
const ticketNumber = document.getElementById("ticket-number");
const ticketName = document.getElementById("ticket-name");
const ticketTime = document.getElementById("ticket-time");

const publicQueueTbody = document.getElementById("public-queue-tbody");
const adminQueueTbody = document.getElementById("admin-queue-tbody");
const listCounter = document.getElementById("list-counter");

// Stats elements
const statEsperando = document.getElementById("stat-esperando");
const statRindio = document.getElementById("stat-rindió");
const statTotal = document.getElementById("stat-total");

// Admin elements
const adminAuth = document.getElementById("admin-auth");
const adminDashboard = document.getElementById("admin-dashboard");
const adminLoginForm = document.getElementById("admin-login-form");
const adminPinInput = document.getElementById("admin-pin");
const pinError = document.getElementById("pin-error");
const btnLogout = document.getElementById("btn-logout");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnResetQueue = document.getElementById("btn-reset-queue");

// Assignment modal elements
const assignModal = document.getElementById("assign-modal");
const assignGuardName = document.getElementById("assign-guard-name");
const btnCancelAssign = document.getElementById("btn-cancel-assign");
const assignmentButtons = document.querySelectorAll(".btn-assignment");

let activeGuardForAssignment = null;

// INITIALIZE APP
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initTabs();
  initRutFormatter();
  initFormValidation();
  initAdminAuth();
  
  // Real-time synchronization between browser tabs using the storage event API
  window.addEventListener("storage", (e) => {
    if (e.key === "os10_guards" || e.key === "os10_computers") {
      loadState();
      renderAll();
    }
  });

  renderAll();
});

// TAB SYSTEM (for index.html tabs)
function initTabs() {
  if (tabButtons.length === 0) return;
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      tabContents.forEach(c => c.classList.remove("active"));
      const targetContent = document.getElementById(`tab-${tabId}`);
      if (targetContent) {
        targetContent.classList.add("active");
      }
    });
  });
}

// CHILEAN RUT FORMATTER & VALIDATOR
function cleanRut(rut) {
  return typeof rut === 'string' 
    ? rut.replace(/[^0-9kK]/g, '').toUpperCase() 
    : '';
}

function validateChileanRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  let sum = 0;
  let multiplier = 2;
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const expectedDvVal = 11 - (sum % 11);
  let expectedDv = '';
  if (expectedDvVal === 11) expectedDv = '0';
  else if (expectedDvVal === 10) expectedDv = 'K';
  else expectedDv = expectedDvVal.toString();
  
  return dv === expectedDv;
}

function formatRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  let formatted = '';
  for (let i = body.length - 1, j = 0; i >= 0; i--, j++) {
    if (j > 0 && j % 3 === 0) {
      formatted = '.' + formatted;
    }
    formatted = body[i] + formatted;
  }
  
  return formatted + '-' + dv;
}

function initRutFormatter() {
  if (!rutInput) return;
  rutInput.addEventListener("input", (e) => {
    const rawVal = e.target.value;
    const formatted = formatRut(rawVal);
    e.target.value = formatted;
    
    const errorMsg = document.getElementById("rut-error");
    const successMsg = document.getElementById("rut-success");
    
    if (rawVal.trim() === "") {
      rutInput.classList.remove("invalid", "valid");
      if (errorMsg) errorMsg.style.display = "none";
      if (successMsg) successMsg.style.display = "none";
    } else if (validateChileanRut(formatted)) {
      rutInput.classList.remove("invalid");
      rutInput.classList.add("valid");
      if (errorMsg) errorMsg.style.display = "none";
      if (successMsg) successMsg.style.display = "block";
    } else {
      rutInput.classList.remove("valid");
      rutInput.classList.add("invalid");
      if (errorMsg) errorMsg.style.display = "block";
      if (successMsg) successMsg.style.display = "none";
    }
  });
}

function initFormValidation() {
  if (!nombresInput || !apellidosInput) return;
  [nombresInput, apellidosInput].forEach(input => {
    input.addEventListener("input", () => {
      if (input.value.trim() !== "") {
        input.classList.remove("invalid");
        input.classList.add("valid");
      } else {
        input.classList.remove("valid");
      }
    });
  });
}

// FORM SUBMISSION (index.html)
if (registroForm) {
  registroForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const rutVal = rutInput.value.trim();
    const nombresVal = nombresInput.value.trim();
    const apellidosVal = apellidosInput.value.trim();
    const empresaVal = empresaInput.value.trim();
    
    let hasErrors = false;
    
    if (!validateChileanRut(rutVal)) {
      rutInput.classList.add("invalid");
      const err = document.getElementById("rut-error");
      if (err) err.style.display = "block";
      hasErrors = true;
    }
    
    if (nombresVal === "") {
      nombresInput.classList.add("invalid");
      hasErrors = true;
    }
    
    if (apellidosVal === "") {
      apellidosInput.classList.add("invalid");
      hasErrors = true;
    }
    
    if (hasErrors) return;
    
    const today = new Date();
    const timeStr = today.toTimeString().split(' ')[0];
    
    // Auto-incremental order number
    const nextOrderNum = state.guards.length + 1;
    const formattedOrder = String(nextOrderNum).padStart(3, '0');
    
    const newGuard = {
      id: 'g_' + Date.now(),
      orderNum: formattedOrder,
      nombres: nombresVal,
      apellidos: apellidosVal,
      rut: rutVal,
      empresa: empresaVal || "Particular",
      time: timeStr,
      status: "En Espera",
      pcAssigned: null
    };
    
    state.guards.push(newGuard);
    saveState();
    
    // Reset Form
    registroForm.reset();
    rutInput.classList.remove("valid");
    nombresInput.classList.remove("valid");
    apellidosInput.classList.remove("valid");
    const succ = document.getElementById("rut-success");
    if (succ) succ.style.display = "none";
    
    renderAll();
    
    // Show overlay modal
    if (successOverlay) {
      if (ticketNumber) ticketNumber.innerText = `#${formattedOrder}`;
      if (ticketName) ticketName.innerText = `${nombresVal} ${apellidosVal}`;
      if (ticketTime) ticketTime.innerText = `Ingreso: ${timeStr}`;
      successOverlay.classList.remove("hidden");
    }
  });
}

if (closeSuccessBtn) {
  closeSuccessBtn.addEventListener("click", () => {
    if (successOverlay) successOverlay.classList.add("hidden");
  });
}

// RENDERING
function renderAll() {
  renderStats();
  renderPublicQueue();
  renderPublicPcs();
  renderAdminQueue();
  renderAdminPcs();
}

function renderStats() {
  const waitingCount = state.guards.filter(g => g.status === "En Espera").length;
  const finishedCount = state.guards.filter(g => g.status === "Finalizado").length;
  const totalCount = state.guards.length;
  
  if (statEsperando) statEsperando.innerText = waitingCount;
  if (statRindio) statRindio.innerText = finishedCount;
  if (statTotal) statTotal.innerText = totalCount;
  if (listCounter) listCounter.innerText = `${waitingCount} Persona${waitingCount !== 1 ? 's' : ''}`;
}

function renderPublicQueue() {
  if (!publicQueueTbody) return;
  publicQueueTbody.innerHTML = "";
  
  const waitingOrActive = state.guards.filter(g => g.status === "En Espera" || g.status === "En Examen");
  
  if (waitingOrActive.length === 0) {
    publicQueueTbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">No hay personas esperando en este momento.</td>
      </tr>
    `;
    return;
  }
  
  waitingOrActive.forEach(guard => {
    let statusBadge = "";
    if (guard.status === "En Espera") {
      statusBadge = `<span class="badge badge-primary">En Espera</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning">En PC ${guard.pcAssigned}</span>`;
    }
    
    // Mask RUT for public privacy protection
    const parts = guard.rut.split('-');
    const body = parts[0];
    const dv = parts[1];
    let maskedBody = body;
    if (body.length > 4) {
      maskedBody = body.substring(0, 2) + '.' + 'xxx.xxx';
    }
    const maskedRut = maskedBody + '-' + dv;
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="font-bold text-center">#${guard.orderNum}</td>
      <td class="font-medium">${guard.nombres} ${guard.apellidos}</td>
      <td class="text-muted">${maskedRut}</td>
      <td>${guard.time}</td>
      <td>${statusBadge}</td>
    `;
    publicQueueTbody.appendChild(row);
  });
}

function renderPublicPcs() {
  for (let i = 1; i <= 4; i++) {
    const pcCard = document.getElementById(`pc-${i}`);
    if (!pcCard) continue;
    
    const statusBadge = pcCard.querySelector(".pc-status");
    const userDiv = pcCard.querySelector(".pc-user");
    const config = state.computers[i];
    
    if (config.status === "Ocupado") {
      pcCard.className = "pc-card occupied";
      if (statusBadge) statusBadge.innerText = "En Examen";
      
      const assignedGuard = state.guards.find(g => g.id === config.guardId);
      if (assignedGuard && userDiv) {
        userDiv.innerText = `${assignedGuard.nombres} ${assignedGuard.apellidos.split(' ')[0]}`;
      } else if (userDiv) {
        userDiv.innerText = "Asignado";
      }
    } else {
      pcCard.className = "pc-card available";
      if (statusBadge) statusBadge.innerText = "Disponible";
      if (userDiv) userDiv.innerText = "Sin asignar";
    }
  }
}

// ADMIN AUTHENTICATION
function initAdminAuth() {
  if (!adminLoginForm) {
    // If we are on index.html and have session auth active, it's irrelevant. But check if we are on admin.html:
    if (adminDashboard && state.isAdminAuthenticated) {
      showAdminDashboard();
    }
    return;
  }
  
  if (state.isAdminAuthenticated) {
    showAdminDashboard();
  } else {
    showAdminLoginForm();
  }

  adminLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = adminPinInput.value;
    
    if (pin === PIN_ADMIN) {
      state.isAdminAuthenticated = true;
      sessionStorage.setItem("os10_admin_auth", "true");
      adminPinInput.value = "";
      if (pinError) pinError.style.display = "none";
      showAdminDashboard();
    } else {
      if (pinError) pinError.style.display = "block";
      adminPinInput.focus();
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      state.isAdminAuthenticated = false;
      sessionStorage.removeItem("os10_admin_auth");
      showAdminLoginForm();
    });
  }
}

function showAdminDashboard() {
  if (adminAuth) adminAuth.classList.add("hidden");
  if (adminDashboard) adminDashboard.classList.remove("hidden");
  renderAdminQueue();
  renderAdminPcs();
}

function showAdminLoginForm() {
  if (adminDashboard) adminDashboard.classList.add("hidden");
  if (adminAuth) adminAuth.classList.remove("hidden");
}

function renderAdminQueue() {
  if (!adminQueueTbody) return;
  adminQueueTbody.innerHTML = "";
  
  const waitingGuards = state.guards.filter(g => g.status === "En Espera");
  
  if (waitingGuards.length === 0) {
    adminQueueTbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted">No hay personas esperando en la fila.</td>
      </tr>
    `;
    return;
  }
  
  waitingGuards.forEach(guard => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="font-bold text-center">#${guard.orderNum}</td>
      <td class="font-medium">${guard.nombres} ${guard.apellidos}</td>
      <td>${guard.rut}</td>
      <td class="text-muted">${guard.empresa}</td>
      <td>${guard.time}</td>
      <td>
        <button class="btn btn-primary btn-sm btn-llamar-pc" data-id="${guard.id}">
          Asignar Examen
        </button>
      </td>
    `;
    
    row.querySelector(".btn-llamar-pc").addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-id");
      openAssignmentModal(id);
    });
    
    adminQueueTbody.appendChild(row);
  });
}

function renderAdminPcs() {
  for (let i = 1; i <= 4; i++) {
    const monitorItem = document.getElementById(`admin-pc-monitor-${i}`);
    if (!monitorItem) continue;
    
    const indicator = monitorItem.querySelector(".pc-indicator");
    const userP = monitorItem.querySelector(".admin-pc-user");
    const btnLiberar = monitorItem.querySelector(".btn-liberar");
    const config = state.computers[i];
    
    if (config.status === "Ocupado") {
      if (indicator) indicator.className = "pc-indicator bg-occupied";
      
      const assignedGuard = state.guards.find(g => g.id === config.guardId);
      if (assignedGuard && userP) {
        userP.innerHTML = `Rindiendo: <strong>${assignedGuard.nombres} ${assignedGuard.apellidos}</strong><br><small>Rut: ${assignedGuard.rut}</small>`;
      } else if (userP) {
        userP.innerText = "Ocupado";
      }
      if (btnLiberar) btnLiberar.classList.remove("hidden");
    } else {
      if (indicator) indicator.className = "pc-indicator bg-available";
      if (userP) userP.innerText = "Disponible";
      if (btnLiberar) btnLiberar.classList.add("hidden");
    }
  }
}

// Liberar PC event listeners (Muestra modal de ingreso de puntaje)
let activePcForFinishing = null;
let activeGuardForFinishing = null;

document.querySelectorAll(".btn-liberar").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const pcNum = e.target.getAttribute("data-pc");
    openFinishExamModal(pcNum);
  });
});

function openFinishExamModal(pcNum) {
  const config = state.computers[pcNum];
  if (config.status !== "Ocupado") return;
  
  const guard = state.guards.find(g => g.id === config.guardId);
  if (!guard) return;
  
  activePcForFinishing = pcNum;
  activeGuardForFinishing = guard;
  
  const nameLabel = document.getElementById("finish-guard-name");
  if (nameLabel) nameLabel.innerText = `${guard.nombres} ${guard.apellidos}`;
  
  const scoreInput = document.getElementById("exam-score");
  const resultSelect = document.getElementById("exam-result");
  const notesInput = document.getElementById("exam-notes");
  
  if (scoreInput) scoreInput.value = "";
  if (resultSelect) resultSelect.value = "";
  if (notesInput) notesInput.value = "";
  
  const modal = document.getElementById("finish-exam-modal");
  if (modal) modal.classList.remove("hidden");
}

const finishExamForm = document.getElementById("finish-exam-form");
const btnCancelFinish = document.getElementById("btn-cancel-finish");

if (finishExamForm) {
  finishExamForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    if (!activeGuardForFinishing || !activePcForFinishing) return;
    
    const scoreVal = document.getElementById("exam-score").value;
    const resultVal = document.getElementById("exam-result").value;
    const notesVal = document.getElementById("exam-notes").value;
    
    // Guardar datos en el objeto del guardia
    activeGuardForFinishing.status = "Finalizado";
    activeGuardForFinishing.score = scoreVal + "%";
    activeGuardForFinishing.result = resultVal;
    activeGuardForFinishing.notes = notesVal || "Ninguna";
    
    // Liberar Computador
    const config = state.computers[activePcForFinishing];
    config.status = "Disponible";
    config.guardId = null;
    
    saveState();
    renderAll();
    
    // Cerrar modal
    const modal = document.getElementById("finish-exam-modal");
    if (modal) modal.classList.add("hidden");
    
    activePcForFinishing = null;
    activeGuardForFinishing = null;
    
    // Sincronizar pestañas
    localStorage.setItem("os10_sync_trigger", Date.now());
  });
}

if (btnCancelFinish) {
  btnCancelFinish.addEventListener("click", () => {
    const modal = document.getElementById("finish-exam-modal");
    if (modal) modal.classList.add("hidden");
    activePcForFinishing = null;
    activeGuardForFinishing = null;
  });
}

// ASSIGNMENT MODAL FLOW
function openAssignmentModal(guardId) {
  const guard = state.guards.find(g => g.id === guardId);
  if (!guard) return;
  
  activeGuardForAssignment = guard;
  if (assignGuardName) assignGuardName.innerText = `${guard.nombres} ${guard.apellidos}`;
  
  assignmentButtons.forEach(btn => {
    const pcNum = btn.getAttribute("data-pc");
    const config = state.computers[pcNum];
    const indicatorText = btn.querySelector(".pc-assign-state");
    
    if (config.status === "Ocupado") {
      btn.classList.add("disabled");
      if (indicatorText) indicatorText.innerText = "Ocupado";
    } else {
      btn.classList.remove("disabled");
      if (indicatorText) indicatorText.innerText = "Disponible";
    }
  });
  
  if (assignModal) assignModal.classList.remove("hidden");
}

if (btnCancelAssign) {
  btnCancelAssign.addEventListener("click", () => {
    if (assignModal) assignModal.classList.add("hidden");
    activeGuardForAssignment = null;
  });
}

assignmentButtons.forEach(btn => {
  btn.addEventListener("click", (e) => {
    const btnElem = e.currentTarget;
    if (btnElem.classList.contains("disabled")) return;
    
    const pcNum = btnElem.getAttribute("data-pc");
    assignGuardToPc(activeGuardForAssignment.id, pcNum);
  });
});

function assignGuardToPc(guardId, pcNum) {
  const guard = state.guards.find(g => g.id === guardId);
  const pc = state.computers[pcNum];
  
  if (!guard || !pc || pc.status === "Ocupado") return;
  
  // Update Guard
  guard.status = "En Examen";
  guard.pcAssigned = pcNum;
  
  // Update PC
  pc.status = "Ocupado";
  pc.guardId = guardId;
  
  saveState();
  renderAll();
  
  // Close Modal
  if (assignModal) assignModal.classList.add("hidden");
  activeGuardForAssignment = null;
  
  // Notify other tabs
  localStorage.setItem("os10_sync_trigger", Date.now());
}

// CSV EXPORT (Ordenado y con datos de examen)
if (btnExportCsv) {
  btnExportCsv.addEventListener("click", () => {
    if (state.guards.length === 0) {
      alert("No hay registros para exportar.");
      return;
    }
    
    let csvContent = "\uFEFF"; // BOM for UTF-8 compatibility with Excel (Spanish characters)
    csvContent += "N° Orden,Nombres,Apellidos,RUT,Empresa,Hora de Llegada,Estado,PC Asignado,Puntaje,Resultado,Observaciones\n";
    
    // Sort guards by order number (arrival order)
    const sortedGuards = [...state.guards].sort((a, b) => a.orderNum.localeCompare(b.orderNum));
    
    sortedGuards.forEach(g => {
      const row = [
        `"${g.orderNum}"`,
        `"${g.nombres}"`,
        `"${g.apellidos}"`,
        `"${g.rut}"`,
        `"${g.empresa}"`,
        `"${g.time}"`,
        `"${g.status}"`,
        `"${g.pcAssigned || 'N/A'}"`,
        `"${g.score || 'N/A'}"`,
        `"${g.result || 'N/A'}"`,
        `"${g.notes || 'N/A'}"`
      ].join(",");
      csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const today = new Date().toISOString().slice(0,10);
    link.setAttribute("download", `Reporte_Examenes_OS10_${today}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// RESET QUEUE FOR THE DAY
if (btnResetQueue) {
  btnResetQueue.addEventListener("click", () => {
    const confirmReset = confirm("¿Está seguro de reiniciar la cola de hoy? Esto borrará permanentemente todos los registros y liberará todos los computadores.");
    if (confirmReset) {
      state.guards = [];
      state.computers = {
        1: { status: "Disponible", guardId: null },
        2: { status: "Disponible", guardId: null },
        3: { status: "Disponible", guardId: null },
        4: { status: "Disponible", guardId: null }
      };
      saveState();
      renderAll();
      
      // Notify other tabs
      localStorage.setItem("os10_sync_trigger", Date.now());
    }
  });
}
