/* =========================================================
   HR Calendar - Google Sheet Powered Calendar
   ضع رابط Apps Script هنا فقط عند الحاجة للتغيير
========================================================= */

const API_URL = "https://script.google.com/macros/s/AKfycbxwUvyuamXqQsYgyRKlzSed5T12ub3jg2cDXTXoMLgolCsFzB0KiPYINXCueYxIcdt9/exec";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/12Bvm-qdnFeJPbuvEo2ZgZHeBlokirDWwnoO5t9uqmVA/edit?usp=sharing";

const TYPE_CONFIG = {
  evaluations: { label: "التقييمات", color: "#7db7ff", group: "main" },
  followups: { label: "المتابعات", color: "#f8b84e", group: "main" },
  employeeOccasions: { label: "مناسبات الموظفين", color: "#78d99b", group: "main" },
  publicHolidays: { label: "مناسبات عامة", color: "#6ee7b7", group: "other" },
  birthdays: { label: "أعياد الميلاد", color: "#78d99b", group: "main" },
  tasks: { label: "المهام", color: "#88a8ff", group: "main" },
  general: { label: "عام", color: "#c4b5fd", group: "main" }
};

const monthNamesAr = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"
];

const els = {
  calendarGrid: document.getElementById("calendarGrid"),
  miniCalendar: document.getElementById("miniCalendar"),
  monthTitle: document.getElementById("monthTitle"),
  miniMonthTitle: document.getElementById("miniMonthTitle"),
  totalEvents: document.getElementById("totalEvents"),
  monthEvents: document.getElementById("monthEvents"),
  nearestEvent: document.getElementById("nearestEvent"),
  mainFilters: document.getElementById("mainFilters"),
  otherFilters: document.getElementById("otherFilters"),
  searchInput: document.getElementById("searchInput"),
  connectionStatus: document.getElementById("connectionStatus"),
  connectionDot: document.getElementById("connectionDot"),
  eventModal: document.getElementById("eventModal"),
  overlay: document.getElementById("overlay"),
  modalColor: document.getElementById("modalColor"),
  modalTitle: document.getElementById("modalTitle"),
  modalDate: document.getElementById("modalDate"),
  modalType: document.getElementById("modalType"),
  modalDescription: document.getElementById("modalDescription"),
  sidebar: document.getElementById("sidebar")
};

let currentDate = new Date();
let miniDate = new Date();
let allEvents = [];
let activeTypes = new Set(loadActiveTypes());
let selectedEvent = null;

init();

function init() {
  bindActions();
  renderFilters();
  loadEvents();
}

function bindActions() {
  document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => changeMonth(1));
  document.getElementById("todayBtn").addEventListener("click", goToday);
  document.getElementById("miniPrev").addEventListener("click", () => changeMiniMonth(-1));
  document.getElementById("miniNext").addEventListener("click", () => changeMiniMonth(1));
  document.getElementById("refreshBtn").addEventListener("click", loadEvents);
  document.getElementById("openSheetBtn").addEventListener("click", openSheet);
  document.getElementById("modalSheetBtn").addEventListener("click", openSheet);
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("copyEventBtn").addEventListener("click", copySelectedEvent);
  document.getElementById("openSidebar").addEventListener("click", openSidebar);
  document.getElementById("closeSidebar").addEventListener("click", closeSidebar);
  els.overlay.addEventListener("click", () => { closeModal(); closeSidebar(); });
  els.searchInput.addEventListener("input", renderAll);

  document.querySelectorAll(".collapse-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      target.hidden = !target.hidden;
      btn.textContent = target.hidden ? "⌄" : "⌃";
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeModal();
      closeSidebar();
    }
  });
}

async function loadEvents() {
  setConnection("waiting", "جاري الاتصال بالشيت...");

  try {
    const data = await fetchWithFallback(API_URL);
    const rawEvents = Array.isArray(data) ? data : (data.events || []);

    allEvents = rawEvents
      .map(normalizeEvent)
      .filter(event => event.title && event.date && isValidDateString(event.date));

    ensureDynamicTypes(allEvents);
    renderFilters();
    setConnection("connected", `متصل بنجاح - تم جلب ${allEvents.length} حدث`);
    renderAll();
  } catch (error) {
    console.error(error);
    allEvents = [];
    setConnection("error", "فشل الاتصال. تأكد من نشر Apps Script للعامة");
    renderAll();
  }
}

async function fetchWithFallback(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (fetchError) {
    return fetchJsonp(url);
  }
}

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "hrCalendarCallback_" + Date.now();
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";

    window[callbackName] = data => {
      resolve(data);
      cleanup();
    };

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    script.src = `${url}${sep}callback=${callbackName}&v=${Date.now()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    document.body.appendChild(script);
    setTimeout(() => {
      if (window[callbackName]) {
        cleanup();
        reject(new Error("Request timeout"));
      }
    }, 15000);
  });
}

function normalizeEvent(item) {
  const title = pick(item, ["title", "Title", "eventName", "name", "المناسبة", "العنوان"]);
  const dateValue = pick(item, ["date", "Date", "eventDate", "nextDate", "nextEvaluationDate", "التاريخ"]);
  const type = String(pick(item, ["type", "Type", "category", "نوع", "النوع"]) || "general").trim();
  const typeKey = normalizeTypeKey(type);
  const config = TYPE_CONFIG[typeKey] || TYPE_CONFIG.general;

  return {
    title: String(title || "بدون عنوان").trim(),
    date: formatDateValue(dateValue),
    type: typeKey,
    typeName: pick(item, ["typeName", "TypeName", "نوع الحدث"]) || config.label || type,
    color: pick(item, ["color", "Color", "لون"]) || config.color,
    description: pick(item, ["description", "Description", "details", "تفاصيل", "الوصف"]) || buildDescription(item),
    raw: item
  };
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return "";
}

function normalizeTypeKey(type) {
  const value = String(type || "general").trim();
  const lower = value.toLowerCase();

  if (["evaluation", "evaluations", "تقييم", "التقييمات"].includes(lower)) return "evaluations";
  if (["followup", "followups", "متابعة", "المتابعات"].includes(lower)) return "followups";
  if (["employeeoccasions", "employee occasions", "birthday", "birthdays", "anniversary", "مناسبات الموظفين", "عيد ميلاد", "ذكرى عمل"].includes(lower)) return "employeeOccasions";
  if (["publicholidays", "public holidays", "holiday", "holidays", "مناسبات عامة", "عطلة", "عطل"].includes(lower)) return "publicHolidays";
  if (["task", "tasks", "مهام", "المهام"].includes(lower)) return "tasks";

  return value.replace(/\s+/g, "_") || "general";
}

function buildDescription(item) {
  if (!item || typeof item !== "object") return "لا توجد تفاصيل إضافية";

  return Object.entries(item)
    .filter(([_, value]) => value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${formatAnyValue(value)}`)
    .join("\n") || "لا توجد تفاصيل إضافية";
}

function formatAnyValue(value) {
  if (value instanceof Date) return formatDate(value);
  return String(value);
}

function formatDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);

  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const slashMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const d = slashMatch[1].padStart(2, "0");
    const m = slashMatch[2].padStart(2, "0");
    const y = slashMatch[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed)) return formatDate(parsed);

  return str;
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value + "T00:00:00"));
}

function ensureDynamicTypes(events) {
  events.forEach(event => {
    if (!TYPE_CONFIG[event.type]) {
      TYPE_CONFIG[event.type] = {
        label: event.typeName || event.type,
        color: event.color || "#c4b5fd",
        group: "main"
      };
    }
  });

  const allKeys = Object.keys(TYPE_CONFIG);
  if (!localStorage.getItem("hrCalendarActiveTypes")) {
    activeTypes = new Set(allKeys);
  }
}

function renderFilters() {
  els.mainFilters.innerHTML = "";
  els.otherFilters.innerHTML = "";

  Object.entries(TYPE_CONFIG).forEach(([key, config]) => {
    const label = document.createElement("label");
    label.className = "filter-item";
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(key)}" ${activeTypes.has(key) ? "checked" : ""}>
      <span class="check-box" style="background:${config.color}; color:${config.color}"></span>
      <span class="filter-label">${escapeHtml(config.label)}</span>
    `;

    label.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) activeTypes.add(key);
      else activeTypes.delete(key);
      saveActiveTypes();
      renderAll();
    });

    const target = config.group === "other" ? els.otherFilters : els.mainFilters;
    target.appendChild(label);
  });
}

function renderAll() {
  renderCalendar();
  renderMiniCalendar();
  renderStats();
  renderUpcoming();
}

function renderCalendar() {
  els.calendarGrid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  els.monthTitle.textContent = `${monthNamesAr[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  for (let i = 0; i < 42; i++) {
    let dayNumber;
    let cellDate;
    let otherMonth = false;

    if (i < startOffset) {
      dayNumber = prevMonthLastDay - startOffset + i + 1;
      cellDate = new Date(year, month - 1, dayNumber);
      otherMonth = true;
    } else if (i >= startOffset + daysInMonth) {
      dayNumber = i - (startOffset + daysInMonth) + 1;
      cellDate = new Date(year, month + 1, dayNumber);
      otherMonth = true;
    } else {
      dayNumber = i - startOffset + 1;
      cellDate = new Date(year, month, dayNumber);
    }

    const dateKey = formatDate(cellDate);
    const dayEvents = getVisibleEvents().filter(event => event.date === dateKey);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (otherMonth) cell.classList.add("other-month");
    if (isToday(cellDate)) cell.classList.add("today");

    const visibleChips = dayEvents.slice(0, 3).map(event => `
      <button class="event-chip" style="background:${event.color}" data-date="${event.date}" data-title="${escapeHtml(event.title)}">
        <span>${escapeHtml(event.title)}</span>
      </button>
    `).join("");

    cell.innerHTML = `
      <div class="day-top">
        <div class="day-number">${dayNumber}</div>
        ${dayEvents.length ? `<div class="day-count">${dayEvents.length}</div>` : ""}
      </div>
      <div class="events-stack">
        ${visibleChips}
        ${dayEvents.length > 3 ? `<div class="more-events">+${dayEvents.length - 3} أخرى</div>` : ""}
      </div>
    `;

    cell.querySelectorAll(".event-chip").forEach((btn, idx) => {
      btn.addEventListener("click", event => {
        event.stopPropagation();
        openModal(dayEvents[idx]);
      });
    });

    els.calendarGrid.appendChild(cell);
  }
}

function renderMiniCalendar() {
  els.miniCalendar.innerHTML = "";

  const year = miniDate.getFullYear();
  const month = miniDate.getMonth();
  els.miniMonthTitle.textContent = `${monthNamesAr[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const visibleDateSet = new Set(getVisibleEvents().map(event => event.date));

  for (let i = 0; i < 42; i++) {
    let dayNumber;
    let cellDate;
    let other = false;

    if (i < startOffset) {
      dayNumber = prevMonthLastDay - startOffset + i + 1;
      cellDate = new Date(year, month - 1, dayNumber);
      other = true;
    } else if (i >= startOffset + daysInMonth) {
      dayNumber = i - (startOffset + daysInMonth) + 1;
      cellDate = new Date(year, month + 1, dayNumber);
      other = true;
    } else {
      dayNumber = i - startOffset + 1;
      cellDate = new Date(year, month, dayNumber);
    }

    const key = formatDate(cellDate);
    const day = document.createElement("button");
    day.type = "button";
    day.className = "mini-day";
    day.textContent = dayNumber;
    if (other) day.classList.add("other");
    if (isToday(cellDate)) day.classList.add("today");
    if (visibleDateSet.has(key)) day.classList.add("has-event");
    day.addEventListener("click", () => {
      currentDate = new Date(cellDate);
      renderAll();
    });
    els.miniCalendar.appendChild(day);
  }
}

function renderStats() {
  const visible = getVisibleEvents();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthCount = visible.filter(event => {
    const d = parseDate(event.date);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;

  const today = startOfDay(new Date());
  const next = visible
    .map(event => ({ ...event, d: parseDate(event.date) }))
    .filter(event => event.d >= today)
    .sort((a, b) => a.d - b.d)[0];

  els.totalEvents.textContent = visible.length;
  els.monthEvents.textContent = monthCount;
  els.nearestEvent.textContent = next ? formatArabicDate(next.date) : "-";
}

function renderUpcoming() {
  const today = startOfDay(new Date());
  const upcoming = getVisibleEvents()
    .map(event => ({ ...event, d: parseDate(event.date) }))
    .filter(event => event.d >= today)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  if (!upcoming.length) {
    els.upcomingList.innerHTML = `<div class="empty-state">لا توجد أحداث قادمة حسب الفلاتر الحالية</div>`;
    return;
  }

  els.upcomingList.innerHTML = upcoming.map((event, index) => `
    <article class="upcoming-item" data-index="${index}">
      <div class="upcoming-bar" style="background:${event.color}"></div>
      <div>
        <h4>${escapeHtml(event.title)}</h4>
        <p>${formatArabicDate(event.date)} • ${escapeHtml(event.typeName)}</p>
      </div>
    </article>
  `).join("");

  els.upcomingList.querySelectorAll(".upcoming-item").forEach(item => {
    item.addEventListener("click", () => openModal(upcoming[Number(item.dataset.index)]));
  });
}

function getVisibleEvents() {
  const q = els.searchInput.value.trim().toLowerCase();

  return allEvents.filter(event => {
    const active = activeTypes.has(event.type);
    if (!active) return false;
    if (!q) return true;

    const haystack = `${event.title} ${event.typeName} ${event.description}`.toLowerCase();
    return haystack.includes(q);
  });
}

function openModal(event) {
  selectedEvent = event;
  els.modalColor.style.background = event.color;
  els.modalTitle.textContent = event.title;
  els.modalDate.textContent = formatArabicDate(event.date);
  els.modalType.textContent = event.typeName;
  els.modalDescription.textContent = event.description || "لا توجد تفاصيل إضافية";
  els.eventModal.classList.add("show");
  els.overlay.classList.add("show");
  els.eventModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  els.eventModal.classList.remove("show");
  els.overlay.classList.remove("show");
  els.eventModal.setAttribute("aria-hidden", "true");
}

async function copySelectedEvent() {
  if (!selectedEvent) return;
  const text = `${selectedEvent.title}\n${formatArabicDate(selectedEvent.date)}\n${selectedEvent.typeName}\n\n${selectedEvent.description}`;
  await navigator.clipboard.writeText(text);
  document.getElementById("copyEventBtn").textContent = "تم النسخ ✓";
  setTimeout(() => document.getElementById("copyEventBtn").textContent = "نسخ التفاصيل", 1400);
}

function changeMonth(delta) {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
  miniDate = new Date(currentDate);
  renderAll();
}

function changeMiniMonth(delta) {
  miniDate = new Date(miniDate.getFullYear(), miniDate.getMonth() + delta, 1);
  renderMiniCalendar();
}

function goToday() {
  currentDate = new Date();
  miniDate = new Date();
  renderAll();
}

function openSheet() {
  window.open(SHEET_URL, "_blank", "noopener,noreferrer");
}

function openSidebar() {
  els.sidebar.classList.add("open");
  els.overlay.classList.add("show");
}

function closeSidebar() {
  els.sidebar.classList.remove("open");
  if (!els.eventModal.classList.contains("show")) els.overlay.classList.remove("show");
}

function setConnection(status, message) {
  els.connectionDot.className = `dot ${status}`;
  els.connectionStatus.textContent = message;
}

function saveActiveTypes() {
  localStorage.setItem("hrCalendarActiveTypes", JSON.stringify([...activeTypes]));
}

function loadActiveTypes() {
  try {
    const saved = JSON.parse(localStorage.getItem("hrCalendarActiveTypes") || "null");
    if (Array.isArray(saved)) return saved;
  } catch (_) {}
  return Object.keys(TYPE_CONFIG);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isToday(date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function formatArabicDate(dateString) {
  const date = parseDate(dateString);
  return date.toLocaleDateString("ar-IQ", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
