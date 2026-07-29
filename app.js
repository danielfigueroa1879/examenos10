// CONFIGURATION & STATE
const PIN_ADMIN = "8979";

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

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// Reemplaza estos valores con las credenciales de tu proyecto de Supabase
// ==========================================
const SUPABASE_URL = "https://ixsylxfjuljznqkomyw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4c3lseGZqdWxqempucWtvbXl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjkwNTksImV4cCI6MjEwMDkwNTA1OX0.GSz79HJRGX00DxLMY3iubsNVM82_csd2w077glN_XCo";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// LOAD FROM LOCAL STORAGE & SUPABASE ON START
async function loadState() {
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

  // Cargar datos desde Supabase si el cliente está configurado
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('os10_sync')
        .select('state')
        .eq('id', 1)
        .single();
        
      if (!error && data && data.state) {
        state.guards = data.state.guards || [];
        state.computers = data.state.computers || state.computers;
        
        localStorage.setItem("os10_guards", JSON.stringify(state.guards));
        localStorage.setItem("os10_computers", JSON.stringify(state.computers));
        
        renderAll();
      }
    } catch (err) {
      console.log("Error de conexión inicial con Supabase:", err);
    }
  }
}

// SAVE TO LOCAL STORAGE & SUPABASE
async function saveState() {
  localStorage.setItem("os10_guards", JSON.stringify(state.guards));
  localStorage.setItem("os10_computers", JSON.stringify(state.computers));
  
  if (supabaseClient) {
    try {
      await supabaseClient
        .from('os10_sync')
        .update({ state: { guards: state.guards, computers: state.computers } })
        .eq('id', 1);
    } catch (err) {
      console.log("Error al guardar en Supabase:", err);
    }
  }
}

// SINCRONIZACIÓN EN TIEMPO REAL DESDE SUPABASE
function initSupabaseSync() {
  if (!supabaseClient) return;
  
  supabaseClient
    .channel('os10-realtime-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'os10_sync', filter: 'id=eq.1' }, payload => {
      const newState = payload.new.state;
      if (newState) {
        state.guards = newState.guards || [];
        state.computers = newState.computers || state.computers;
        
        localStorage.setItem("os10_guards", JSON.stringify(state.guards));
        localStorage.setItem("os10_computers", JSON.stringify(state.computers));
        
        renderAll();
      }
    })
    .subscribe();
}

// DOM ELEMENTS (Check if they exist before using them)
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const registroForm = document.getElementById("registro-form");
const rutInput = document.getElementById("rut");
const nombresInput = document.getElementById("nombres");
const apellidosInput = document.getElementById("apellidos");
const empresaSelect = document.getElementById("empresa-select");
const empresaOtroGroup = document.getElementById("empresa-otro-group");
const empresaOtroInput = document.getElementById("empresa-otro");
const telefonoInput = document.getElementById("telefono");

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
  loadState(); // Carga en segundo plano sin bloquear la página
  initTabs();
  initRutFormatter();
  initFormValidation();
  initAdminAuth(); // Registra el formulario de PIN inmediatamente
  initSupabaseSync(); // Iniciar sincronización de datos en la nube
  
  // Real-time synchronization fallback (local tabs)
  window.addEventListener("storage", (e) => {
    if (e.key === "os10_guards" || e.key === "os10_computers") {
      loadState();
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
  if (nombresInput && apellidosInput) {
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

  // Event listener for training company select
  if (empresaSelect && empresaOtroGroup && empresaOtroInput) {
    empresaSelect.addEventListener("change", (e) => {
      if (e.target.value === "") {
        empresaSelect.classList.remove("valid");
        empresaSelect.classList.add("invalid");
      } else {
        empresaSelect.classList.remove("invalid");
        empresaSelect.classList.add("valid");
      }

      if (e.target.value === "Otro") {
        empresaOtroGroup.classList.remove("hidden");
        empresaOtroInput.setAttribute("required", "true");
        empresaOtroInput.focus();
      } else {
        empresaOtroGroup.classList.add("hidden");
        empresaOtroInput.removeAttribute("required");
        empresaOtroInput.value = "";
        empresaOtroInput.classList.remove("invalid", "valid");
      }
    });

    empresaOtroInput.addEventListener("input", () => {
      if (empresaOtroInput.value.trim() !== "") {
        empresaOtroInput.classList.remove("invalid");
        empresaOtroInput.classList.add("valid");
      } else {
        empresaOtroInput.classList.remove("valid");
      }
    });
  }

  // Event listener and validation for phone numbers
  if (telefonoInput) {
    telefonoInput.addEventListener("input", () => {
      // Force digit-only input
      const cleaned = telefonoInput.value.replace(/[^0-9]/g, '');
      telefonoInput.value = cleaned;
      
      const errorMsg = document.getElementById("telefono-error");
      if (cleaned.length === 9) {
        telefonoInput.classList.remove("invalid");
        telefonoInput.classList.add("valid");
        if (errorMsg) errorMsg.style.display = "none";
      } else {
        telefonoInput.classList.remove("valid");
        if (cleaned.length > 0) {
          telefonoInput.classList.add("invalid");
          if (errorMsg) errorMsg.style.display = "block";
        } else {
          telefonoInput.classList.remove("invalid");
          if (errorMsg) errorMsg.style.display = "none";
        }
      }
    });
  }
}

// FORM SUBMISSION (index.html)
if (registroForm) {
  registroForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const rutVal = rutInput.value.trim();
    const nombresVal = nombresInput.value.trim();
    const apellidosVal = apellidosInput.value.trim();
    const telefonoVal = telefonoInput ? telefonoInput.value.trim() : "";
    
    // Obtener valor de la empresa seleccionada
    let empresaVal = "";
    if (empresaSelect) {
      if (empresaSelect.value === "Otro" && empresaOtroInput) {
        empresaVal = empresaOtroInput.value.trim();
      } else if (empresaSelect.value !== "") {
        empresaVal = empresaSelect.value;
      }
    }
    
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

    // Validar teléfono de contacto (9 dígitos)
    if (telefonoInput && (telefonoVal === "" || !/^[0-9]{9}$/.test(telefonoVal))) {
      telefonoInput.classList.add("invalid");
      const err = document.getElementById("telefono-error");
      if (err) err.style.display = "block";
      hasErrors = true;
    }

    // Validar si no seleccionó ninguna empresa
    if (empresaSelect && empresaSelect.value === "") {
      empresaSelect.classList.add("invalid");
      hasErrors = true;
    }

    // Validar si seleccionó 'Otro' pero lo dejó vacío
    if (empresaSelect && empresaSelect.value === "Otro" && empresaOtroInput && empresaOtroInput.value.trim() === "") {
      empresaOtroInput.classList.add("invalid");
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
      telefono: telefonoVal,
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
    if (empresaSelect) {
      empresaSelect.classList.remove("valid", "invalid");
    }
    if (empresaOtroInput) {
      empresaOtroInput.classList.remove("valid", "invalid");
    }
    if (empresaOtroGroup) {
      empresaOtroGroup.classList.add("hidden");
    }
    if (telefonoInput) {
      telefonoInput.classList.remove("valid", "invalid");
      const err = document.getElementById("telefono-error");
      if (err) err.style.display = "none";
    }
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
        <td colspan="7" class="text-center text-muted">No hay personas esperando en la fila.</td>
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
      <td>${guard.telefono || 'N/A'}</td>
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

// EXPORTAR A EXCEL (Con formato de colores verde #146314, texto blanco y celdas centradas)
if (btnExportCsv) {
  btnExportCsv.addEventListener("click", () => {
    if (state.guards.length === 0) {
      alert("No hay registros para exportar.");
      return;
    }
    
    // Ordenar guardias por número de orden correlativo
    const sortedGuards = [...state.guards].sort((a, b) => a.orderNum.localeCompare(b.orderNum));
    
    // Generar filas de la tabla
    let tableRows = "";
    sortedGuards.forEach(g => {
      tableRows += `
        <tr>
          <td>${g.orderNum}</td>
          <td>${g.nombres}</td>
          <td>${g.apellidos}</td>
          <td>${g.rut}</td>
          <td>${g.telefono || 'N/A'}</td>
          <td>${g.empresa}</td>
          <td>${g.time}</td>
          <td>${g.status}</td>
          <td>${g.pcAssigned || 'N/A'}</td>
          <td>${g.score || 'N/A'}</td>
          <td>${g.result || 'N/A'}</td>
          <td>${g.notes || 'Ninguna'}</td>
        </tr>
      `;
    });
    
    // Plantilla XML/HTML de Excel para forzar estilos (verde #146314 y alineación centrada)
    const excelTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Exámenes OS10</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table {
            border-collapse: collapse;
          }
          th {
            background-color: #146314 !important;
            color: #ffffff !important;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 11pt;
            font-weight: bold;
            text-align: center;
            border: 1px solid #999999;
            padding: 10px;
          }
          td {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 10pt;
            text-align: center;
            border: 1px solid #cccccc;
            padding: 8px;
          }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th>N° Orden</th>
              <th>Nombres</th>
              <th>Apellidos</th>
              <th>RUT</th>
              <th>Teléfono</th>
              <th>Empresa</th>
              <th>Hora Llegada</th>
              <th>Estado</th>
              <th>PC Asignado</th>
              <th>Puntaje</th>
              <th>Resultado</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([excelTemplate], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const today = new Date().toISOString().slice(0,10);
    link.setAttribute("download", `Reporte_Examenes_OS10_${today}.xls`);
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
