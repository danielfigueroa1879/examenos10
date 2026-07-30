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
  allGuards: [], // Master historical record of all registered guards
  isAdminAuthenticated: false
};

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// Reemplaza estos valores con las credenciales de tu proyecto de Supabase
// ==========================================
const SUPABASE_URL = "https://ixsylxfjuljzjnqkomyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cdpre--X_RNNmk-7f-6J4w_ueSpJp2c";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

//// HELPER FOR LOCAL DATE STRING YYYY-MM-DD
function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// FORMAT DATE TO SUPABASE INT ID (YYYYMMDD)
function getSupabaseId(dateStr) {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

// GET DATE OF REGISTRATION FOR A GUARD (EXTRACT FROM ID IF NOT SPECIFIED)
function getGuardDate(guard) {
  if (guard.date) return guard.date;
  
  if (guard.id && guard.id.startsWith('g_')) {
    const ts = parseInt(guard.id.replace('g_', ''), 10);
    if (!isNaN(ts)) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return selectedDate;
}

// CHILEAN GRADE SCALING (1.0 to 7.0, 60% requirement)
function calculateChileanGrade(percent) {
  if (isNaN(percent) || percent === null) return "N/A";
  const roundedP = Math.round(percent);
  let grade;
  if (roundedP < 60) {
    grade = 1.0 + (roundedP / 60) * 3.0;
  } else {
    grade = 4.0 + ((roundedP - 60) / 40) * 3.0;
  }
  // Ensure the grade is at least 1.0 and at most 7.0
  grade = Math.max(1.0, Math.min(7.0, grade));
  return grade.toFixed(1).replace('.', ',');
}

// UPSERT GUARD TO CONSOLIDATED LIST
function upsertToAllGuards(guard) {
  if (!state.allGuards) state.allGuards = [];
  const index = state.allGuards.findIndex(g => g.id === guard.id);
  
  // Clone to avoid mutation side effects
  const guardCopy = JSON.parse(JSON.stringify(guard));
  
  if (index !== -1) {
    state.allGuards[index] = { ...state.allGuards[index], ...guardCopy };
  } else {
    state.allGuards.push(guardCopy);
  }
}

let selectedDate = getLocalDateString();

// LOAD FROM LOCAL STORAGE & SUPABASE ON START
async function loadState() {
  const today = getLocalDateString();
  const lastStoredDate = localStorage.getItem("os10_last_date");
  
  // Automatical reset/initialization for new day
  if (lastStoredDate && lastStoredDate !== today) {
    localStorage.setItem(`os10_guards_${today}`, JSON.stringify([]));
    localStorage.setItem(`os10_computers_${today}`, JSON.stringify({
      1: { status: "Disponible", guardId: null },
      2: { status: "Disponible", guardId: null },
      3: { status: "Disponible", guardId: null },
      4: { status: "Disponible", guardId: null }
    }));
    localStorage.setItem("os10_last_date", today);
    selectedDate = today;
  } else if (!lastStoredDate) {
    localStorage.setItem("os10_last_date", today);
  }

  // Set the admin date picker value if it exists
  const datePicker = document.getElementById("admin-date-picker");
  if (datePicker && !datePicker.value) {
    datePicker.value = selectedDate;
  }

  let savedGuards = localStorage.getItem(`os10_guards_${selectedDate}`);
  let savedPcs = localStorage.getItem(`os10_computers_${selectedDate}`);
  const savedAuth = sessionStorage.getItem("os10_admin_auth");
  const savedAllGuards = localStorage.getItem("os10_all_guards");

  // Load consolidated list
  if (savedAllGuards) {
    state.allGuards = JSON.parse(savedAllGuards);
  } else {
    state.allGuards = [];
  }

  // Fallback to legacy LocalStorage keys (without suffix) for backward compatibility
  if (!savedGuards && selectedDate === today) {
    savedGuards = localStorage.getItem("os10_guards");
    if (savedGuards) {
      localStorage.setItem(`os10_guards_${selectedDate}`, savedGuards);
    }
  }
  if (!savedPcs && selectedDate === today) {
    savedPcs = localStorage.getItem("os10_computers");
    if (savedPcs) {
      localStorage.setItem(`os10_computers_${selectedDate}`, savedPcs);
    }
  }

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

  // Hide reset button if looking at a past day
  const btnResetQueue = document.getElementById("btn-reset-queue");
  if (btnResetQueue) {
    if (selectedDate !== today) {
      btnResetQueue.style.display = "none";
    } else {
      btnResetQueue.style.display = "inline-flex";
    }
  }

  // Cargar datos desde Supabase si el cliente está configurado
  if (supabaseClient) {
    try {
      // Cargar lista consolidada histórica (id = 99999999)
      const { data: allData, error: allErr } = await supabaseClient
        .from('os10_sync')
        .select('state')
        .eq('id', 99999999)
        .single();
      if (!allErr && allData && allData.state && allData.state.allGuards) {
        state.allGuards = allData.state.allGuards;
        localStorage.setItem("os10_all_guards", JSON.stringify(state.allGuards));
      }

      let { data, error } = await supabaseClient
        .from('os10_sync')
        .select('state')
        .eq('id', getSupabaseId(selectedDate))
        .single();
      
      // Fallback/migración: Si no hay datos para hoy, intentar cargar la fila heredada (id = 1)
      if ((error || !data || !data.state) && selectedDate === today) {
        const legacyRes = await supabaseClient
          .from('os10_sync')
          .select('state')
          .eq('id', 1)
          .single();
        if (!legacyRes.error && legacyRes.data && legacyRes.data.state) {
          data = legacyRes.data;
          error = null;
          // Guardar inmediatamente en la base de datos con el nuevo ID del día para migrar
          await supabaseClient
            .from('os10_sync')
            .upsert({ id: getSupabaseId(selectedDate), state: data.state });
        }
      }
        
      if (!error && data && data.state) {
        state.guards = data.state.guards || [];
        state.computers = data.state.computers || state.computers;
        
        localStorage.setItem(`os10_guards_${selectedDate}`, JSON.stringify(state.guards));
        localStorage.setItem(`os10_computers_${selectedDate}`, JSON.stringify(state.computers));
        
        renderAll();
      }
    } catch (err) {
      console.log("Error de conexión inicial con Supabase:", err);
    }
  }
}

// SAVE TO LOCAL STORAGE & SUPABASE
async function saveState() {
  localStorage.setItem(`os10_guards_${selectedDate}`, JSON.stringify(state.guards));
  localStorage.setItem(`os10_computers_${selectedDate}`, JSON.stringify(state.computers));
  localStorage.setItem("os10_all_guards", JSON.stringify(state.allGuards || []));
  
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('os10_sync')
        .upsert({ id: getSupabaseId(selectedDate), state: { guards: state.guards, computers: state.computers } });
      if (error) console.log("Error al guardar en Supabase:", error);

      // Guardar lista consolidada (id = 99999999)
      const { error: errorAll } = await supabaseClient
        .from('os10_sync')
        .upsert({ id: 99999999, state: { allGuards: state.allGuards } });
      if (errorAll) console.log("Error al guardar lista consolidada en Supabase:", errorAll);
    } catch (err) {
      console.log("Error al guardar en Supabase:", err);
    }
  }
}

// SINCRONIZACIÓN EN TIEMPO REAL DESDE SUPABASE
function applyRemoteState(newState) {
  if (!newState) return;
  const newGuardsJson = JSON.stringify(newState.guards || []);
  const newComputersJson = JSON.stringify(newState.computers || state.computers);
  const currentGuardsJson = JSON.stringify(state.guards);
  const currentComputersJson = JSON.stringify(state.computers);

  if (newGuardsJson === currentGuardsJson && newComputersJson === currentComputersJson) {
    return;
  }

  state.guards = JSON.parse(newGuardsJson);
  state.computers = JSON.parse(newComputersJson);
  localStorage.setItem(`os10_guards_${selectedDate}`, newGuardsJson);
  localStorage.setItem(`os10_computers_${selectedDate}`, newComputersJson);
  renderAll();
}

async function pollRemoteState() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('os10_sync')
      .select('state')
      .eq('id', getSupabaseId(selectedDate))
      .single();
    if (!error && data && data.state) {
      applyRemoteState(data.state);
    }
  } catch (err) {
    console.log("Error en polling:", err);
  }
}

function initSupabaseSync() {
  if (!supabaseClient) return;

  supabaseClient
    .channel('os10-realtime-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'os10_sync' }, payload => {
      if (payload.new && payload.new.id === getSupabaseId(selectedDate) && payload.new.state) {
        applyRemoteState(payload.new.state);
      }
    })
    .subscribe((status) => {
      console.log('Supabase realtime status:', status);
    });

  // Respaldo por polling: garantiza sincronización aunque el WebSocket falle
  // (redes móviles, wifi restrictiva, proxies, etc.)
  setInterval(pollRemoteState, 5000);
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
const btnExportConsolidated = document.getElementById("btn-export-consolidated");
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
    if (e.key === `os10_guards_${selectedDate}` || e.key === `os10_computers_${selectedDate}`) {
      loadState();
    }
  });

  // Admin date picker event listener
  const datePicker = document.getElementById("admin-date-picker");
  if (datePicker) {
    datePicker.value = selectedDate;
    datePicker.addEventListener("change", (e) => {
      selectedDate = e.target.value;
      loadState();
      renderAll();
    });
  }

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
      date: getLocalDateString(),
      status: "En Espera",
      pcAssigned: null
    };
    
    state.guards.push(newGuard);
    upsertToAllGuards(newGuard);
    saveState();
    localStorage.setItem("my_registered_guard_id", newGuard.id);
    
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
  checkMyTicketStatus();
}

// CHECK REGISTERED TICKET STATUS AND SHOW ALERTS
function checkMyTicketStatus() {
  const alertContainer = document.getElementById("my-ticket-alert");
  if (!alertContainer) return;

  const myGuardId = localStorage.getItem("my_registered_guard_id");
  if (!myGuardId) {
    alertContainer.classList.add("hidden");
    return;
  }

  // Find the guard in active day guards
  const guard = state.guards.find(g => g.id === myGuardId);

  if (!guard) {
    // If not found in active list (perhaps a new day or deleted), clear from local storage
    localStorage.removeItem("my_registered_guard_id");
    alertContainer.classList.add("hidden");
    return;
  }

  // Calculate position if waiting
  if (guard.status === "En Espera") {
    const waitingGuards = state.guards.filter(g => g.status === "En Espera");
    const myIndex = waitingGuards.findIndex(g => g.id === myGuardId);

    if (myIndex === -1) {
      alertContainer.classList.add("hidden");
      return;
    }

    alertContainer.classList.remove("hidden");
    if (myIndex <= 1) {
      // 0 or 1 people ahead -> Next or second in line!
      const statusText = myIndex === 0 ? "¡SIGUIENTE EN LA FILA!" : "¡SEGUNDO EN LA FILA!";
      alertContainer.className = "ticket-alert-card"; // Pulse red animation
      alertContainer.innerHTML = `
        <div class="ticket-alert-content">
          <div class="ticket-alert-title">
            <span style="font-size: 1.25rem;">🔴</span> ${statusText}
          </div>
          <div class="ticket-alert-desc">
            Está a punto de ser llamado al examen. Por favor, prepárese y acérquese a la zona de computadores.
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div class="ticket-alert-number">#${guard.orderNum}</div>
        </div>
      `;
    } else {
      // Further back in queue
      alertContainer.className = "ticket-alert-card alert-waiting"; // Neutral style
      alertContainer.innerHTML = `
        <div class="ticket-alert-content">
          <div class="ticket-alert-title">
            <span>⏱️</span> Su Ticket está en Espera
          </div>
          <div class="ticket-alert-desc">
            Hay <strong>${myIndex}</strong> personas por delante de usted. Espere en la sala hasta ser llamado.
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div class="ticket-alert-number">#${guard.orderNum}</div>
          <button class="btn-clear-alert" onclick="clearMyTicketAlert()">Salir de Fila</button>
        </div>
      `;
    }
  } else if (guard.status === "En Examen") {
    // Assigned to a PC!
    alertContainer.classList.remove("hidden");
    alertContainer.className = "ticket-alert-card alert-assigned"; // Pulse green animation
    alertContainer.innerHTML = `
      <div class="ticket-alert-content">
        <div class="ticket-alert-title">
          <span style="font-size: 1.25rem;">🟢</span> ¡SU TURNO HA LLEGADO!
        </div>
        <div class="ticket-alert-desc">
          Por favor, diríjase de inmediato al <strong>Computador ${guard.pcAssigned}</strong> para rendir su examen.
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
        <div class="ticket-alert-number">#${guard.orderNum}</div>
      </div>
    `;
  } else if (guard.status === "Finalizado") {
    // Exam finished
    alertContainer.classList.remove("hidden");
    alertContainer.className = "ticket-alert-card alert-assigned";
    alertContainer.innerHTML = `
      <div class="ticket-alert-content">
        <div class="ticket-alert-title">
          <span>✅</span> Examen Finalizado
        </div>
        <div class="ticket-alert-desc">
          Su registro de examen ha finalizado con éxito. ¡Muchas gracias por su asistencia!
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
        <button class="btn btn-secondary btn-sm" onclick="clearMyTicketAlert()">Aceptar</button>
      </div>
    `;
  }
}

// Function to clear alert/ticket association
window.clearMyTicketAlert = function() {
  if (confirm("¿Está seguro que desea quitar este ticket de su pantalla? Esto no cancelará su lugar en la fila del servidor.")) {
    localStorage.removeItem("my_registered_guard_id");
    const alertContainer = document.getElementById("my-ticket-alert");
    if (alertContainer) alertContainer.classList.add("hidden");
  }
};

function renderStats() {
  const waitingCount = state.guards.filter(g => g.status === "En Espera" && getGuardDate(g) === selectedDate).length;
  const finishedCount = state.guards.filter(g => g.status === "Finalizado" && getGuardDate(g) === selectedDate).length;
  const totalCount = state.guards.filter(g => getGuardDate(g) === selectedDate).length;
  
  if (statEsperando) statEsperando.innerText = waitingCount;
  if (statRindio) statRindio.innerText = finishedCount;
  if (statTotal) statTotal.innerText = totalCount;
  if (listCounter) listCounter.innerText = `${waitingCount} Persona${waitingCount !== 1 ? 's' : ''}`;
}

function renderPublicQueue() {
  if (!publicQueueTbody) return;
  publicQueueTbody.innerHTML = "";
  
  const waitingOrActive = state.guards.filter(g => 
    (g.status === "En Espera" || g.status === "En Examen") && 
    getGuardDate(g) === selectedDate
  );
  
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
  
  const waitingGuards = state.guards.filter(g => g.status === "En Espera" && getGuardDate(g) === selectedDate);
  
  if (waitingGuards.length === 0) {
    adminQueueTbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">No hay personas esperando en la fila.</td>
      </tr>
    `;
    return;
  }
  
  const isToday = (selectedDate === getLocalDateString());
  
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
        ${isToday ? `
        <button class="btn btn-primary btn-sm btn-llamar-pc" data-id="${guard.id}">
          Asignar Examen
        </button>
        ` : `<span class="text-muted">-</span>`}
      </td>
    `;
    
    if (isToday) {
      row.querySelector(".btn-llamar-pc").addEventListener("click", (e) => {
        const id = e.target.getAttribute("data-id");
        openAssignmentModal(id);
      });
    }
    
    adminQueueTbody.appendChild(row);
  });
}

function renderAdminPcs() {
  const isToday = (selectedDate === getLocalDateString());
  for (let i = 1; i <= 4; i++) {
    const monitorItem = document.getElementById(`admin-pc-monitor-${i}`);
    if (!monitorItem) continue;
    
    const indicatorEl = monitorItem.querySelector(".pc-indicator");
    const userP = monitorItem.querySelector(".admin-pc-user");
    const btnLiberar = monitorItem.querySelector(".btn-liberar");
    const config = state.computers[i];
    
    if (config.status === "Ocupado") {
      if (indicatorEl) indicatorEl.className = "pc-indicator bg-occupied";
      
      const assignedGuard = state.guards.find(g => g.id === config.guardId);
      if (assignedGuard && userP) {
        userP.innerHTML = `Rindiendo: <strong>${assignedGuard.nombres} ${assignedGuard.apellidos}</strong><br><small>Rut: ${assignedGuard.rut}</small>`;
      } else if (userP) {
        userP.innerText = "Ocupado";
      }
      if (btnLiberar) {
        if (isToday) {
          btnLiberar.classList.remove("hidden");
        } else {
          btnLiberar.classList.add("hidden");
        }
      }
    } else {
      if (indicatorEl) indicatorEl.className = "pc-indicator bg-available";
      if (userP) userP.innerText = "Disponible";
      if (btnLiberar) btnLiberar.classList.add("hidden");
    }
  }
}

// Liberar PC event listeners (Muestra modal de ingreso de puntaje)
let activePcForFinishing = null;
let activeGuardForFinishing = null;

// Delegación en document: sobrevive a re-renders y clicks en hijos del botón
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-liberar");
  if (!btn) return;
  const pcNum = btn.getAttribute("data-pc");
  if (pcNum) openFinishExamModal(pcNum);
});

function updateResultPreview(scoreVal) {
  const badge = document.getElementById("preview-badge");
  const scoreInput = document.getElementById("exam-score");
  if (!badge) return;

  const cleanVal = scoreVal.replace(',', '.');
  const score = parseFloat(cleanVal);

  if (isNaN(score) || scoreVal === "") {
    badge.textContent = "Ingrese puntaje";
    badge.className = "preview-badge";
    if (scoreInput) scoreInput.classList.remove("score-pass", "score-fail");
    return;
  }

  const roundedScore = Math.round(score);
  const grade = calculateChileanGrade(score);

  if (roundedScore >= 60) {
    badge.textContent = `APROBADO (${roundedScore}%) - Nota: ${grade}`;
    badge.className = "preview-badge pass";
    if (scoreInput) {
      scoreInput.classList.remove("score-fail");
      scoreInput.classList.add("score-pass");
    }
  } else {
    badge.textContent = `REPROBADO (${roundedScore}%) - Nota: ${grade}`;
    badge.className = "preview-badge fail";
    if (scoreInput) {
      scoreInput.classList.remove("score-pass");
      scoreInput.classList.add("score-fail");
    }
  }
}

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
  const notesInput = document.getElementById("exam-notes");

  if (scoreInput) {
    scoreInput.value = "";
    scoreInput.oninput = () => updateResultPreview(scoreInput.value);
  }
  if (notesInput) notesInput.value = "";
  updateResultPreview("");

  const modal = document.getElementById("finish-exam-modal");
  if (modal) modal.classList.remove("hidden");
}

const finishExamForm = document.getElementById("finish-exam-form");
const btnCancelFinish = document.getElementById("btn-cancel-finish");

if (finishExamForm) {
  finishExamForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    if (!activeGuardForFinishing || !activePcForFinishing) return;
    
    const scoreRaw = document.getElementById("exam-score").value;
    const scoreVal = scoreRaw.replace(',', '.');
    const scoreFloat = parseFloat(scoreVal);

    if (isNaN(scoreFloat) || scoreFloat < 0 || scoreFloat > 100) {
      alert("Ingrese un puntaje válido entre 0 y 100.");
      return;
    }

    const roundedScore = Math.round(scoreFloat);
    const resultVal = roundedScore >= 60 ? "Aprobado" : "Reprobado";

    // Guardar datos en el objeto del guardia
    activeGuardForFinishing.status = "Finalizado";
    activeGuardForFinishing.scoreVal = scoreFloat;
    activeGuardForFinishing.score = scoreVal.replace('.', ',') + "%";
    activeGuardForFinishing.result = resultVal;
    activeGuardForFinishing.notes = notesVal => notesVal.trim() !== "" ? notesVal : "Ninguna";
    
    const notesValInput = document.getElementById("exam-notes").value;
    activeGuardForFinishing.notes = notesValInput || "Ninguna";
    
    // Guardar hora de examen y nota chilena equivalente
    activeGuardForFinishing.examTime = new Date().toTimeString().split(' ')[0];
    activeGuardForFinishing.grade = calculateChileanGrade(scoreFloat);

    // Liberar Computador
    const config = state.computers[activePcForFinishing];
    config.status = "Disponible";
    config.guardId = null;
    
    upsertToAllGuards(activeGuardForFinishing);
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
  
  upsertToAllGuards(guard);
  saveState();
  renderAll();
  
  // Close Modal
  if (assignModal) assignModal.classList.add("hidden");
  activeGuardForAssignment = null;
  
  // Notify other tabs
  localStorage.setItem("os10_sync_trigger", Date.now());
}

// HELPER TO GENERATE EXCEL WITH INLINE STYLED HEADERS
function generateExcelBlob(guardsList, sheetName = "Reporte OS10") {
  // Sort guards by order number
  const sorted = [...guardsList].sort((a, b) => a.orderNum.localeCompare(b.orderNum));
  
  let tableRows = "";
  sorted.forEach(g => {
    const scoreNum = parseFloat(g.scoreVal || (g.score ? g.score.replace('%', '').replace(',', '.') : '0'));
    const isFail = !isNaN(scoreNum) && scoreNum < 60 && g.status === "Finalizado";
    const failStyle = isFail ? ' style="background-color:#FECACA;color:#B91C1C;font-weight:bold;font-family:\'Segoe UI\', Arial, sans-serif;font-size:10pt;text-align:center;border:1px solid #cccccc;padding:8px;"' : ' style="font-family:\'Segoe UI\', Arial, sans-serif;font-size:10pt;text-align:center;border:1px solid #cccccc;padding:8px;"';
    const cellStyle = ' style="font-family:\'Segoe UI\', Arial, sans-serif;font-size:10pt;text-align:center;border:1px solid #cccccc;padding:8px;"';
    
    tableRows += `
      <tr>
        <td${cellStyle}>${g.orderNum}</td>
        <td${cellStyle}>${g.nombres}</td>
        <td${cellStyle}>${g.apellidos}</td>
        <td${cellStyle}>${g.rut}</td>
        <td${cellStyle}>${g.telefono || 'N/A'}</td>
        <td${cellStyle}>${g.empresa}</td>
        <td${cellStyle}>${g.time}</td>
        <td${cellStyle}>${g.examTime || 'N/A'}</td>
        <td${cellStyle}>${g.status}</td>
        <td${cellStyle}>${g.pcAssigned || 'N/A'}</td>
        <td${failStyle}>${g.score || 'N/A'}</td>
        <td${failStyle}>${g.grade || 'N/A'}</td>
        <td${failStyle}>${g.result || 'N/A'}</td>
        <td${cellStyle}>${g.notes || 'Ninguna'}</td>
      </tr>
    `;
  });

  // Direct inline green background and white text for header columns
  const thStyle = ' style="background-color:#146314;color:#ffffff;font-family:\'Segoe UI\', Arial, sans-serif;font-size:11pt;font-weight:bold;text-align:center;border:1px solid #999999;padding:10px;text-transform:uppercase;"';

  const excelTemplate = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>${sheetName}</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
    </head>
    <body>
      <table>
        <thead>
          <tr>
            <th${thStyle}>N° Orden</th>
            <th${thStyle}>Nombres</th>
            <th${thStyle}>Apellidos</th>
            <th${thStyle}>RUT</th>
            <th${thStyle}>Teléfono</th>
            <th${thStyle}>Empresa</th>
            <th${thStyle}>Hora Llegada</th>
            <th${thStyle}>Hora Examen</th>
            <th${thStyle}>Estado</th>
            <th${thStyle}>PC Asignado</th>
            <th${thStyle}>Puntaje</th>
            <th${thStyle}>Nota</th>
            <th${thStyle}>Resultado</th>
            <th${thStyle}>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>
  `;
  return new Blob([excelTemplate], { type: "application/vnd.ms-excel;charset=utf-8;" });
}

// EXPORTAR EXCEL DIARIO (Solo los que realizaron examen en el día seleccionado)
if (btnExportCsv) {
  btnExportCsv.addEventListener("click", () => {
    // Filtrar para que solo se descarguen los guardias que finalizaron el examen en la fecha seleccionada
    const examGuards = state.guards.filter(g => g.status === "Finalizado" && getGuardDate(g) === selectedDate);
    
    if (examGuards.length === 0) {
      alert("No hay exámenes finalizados registrados para la fecha seleccionada.");
      return;
    }
    
    const blob = generateExcelBlob(examGuards, `Exámenes_${selectedDate}`);
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Examenes_OS10_${selectedDate}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// EXPORTAR BASE DE DATOS COMPLETA CONSOLIDADA
if (btnExportConsolidated) {
  btnExportConsolidated.addEventListener("click", () => {
    if (!state.allGuards || state.allGuards.length === 0) {
      alert("La base de datos consolidada no contiene registros.");
      return;
    }
    
    const blob = generateExcelBlob(state.allGuards, "BD Consolidada");
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Base_Datos_Consolidada_OS10.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// RESET QUEUE FOR THE DAY
// Limpia solo la fila activa (En Espera / En Examen) y libera los PCs.
// Los registros Finalizados se conservan como historial del día.
// Requiere el PIN de admin para ejecutarse.
if (btnResetQueue) {
  btnResetQueue.addEventListener("click", () => {
    const pin = prompt("Ingrese el PIN de administrador para reiniciar la fila del día.\n\nSe limpiarán los guardias En Espera / En Examen y se liberarán los PCs.\nLos registros Finalizados se conservarán como historial.");
    if (pin === null) return;
    if (pin !== PIN_ADMIN) {
      alert("PIN incorrecto. La fila no fue reiniciada.");
      return;
    }

    const confirmReset = confirm("¿Confirma reiniciar la fila del día? Los registros Finalizados se mantendrán como historial.");
    if (!confirmReset) return;

    state.guards = state.guards.filter(g => g.status === "Finalizado");
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
  });
}
