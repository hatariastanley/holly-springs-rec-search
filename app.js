const $ = (selector) => document.querySelector(selector);

const state = {
  selectedMonths: new Set(),
  types: new Set(),
  locations: new Set(),
  days: new Set(),
  statuses: new Set(),
  ages: [""],
  ageMode: "all",
  keyword: "",
  spots: 0,
  results: [],
  meta: null,
  filters: null,
};

let options = null;
let snapshot = null;
let allSections = [];
let presets = [];
let shortlist = [];
let compareMode = false;

const STORAGE_PRESETS = "hsRecPresets";
const STORAGE_SHORTLIST = "hsRecShortlist";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function keyFor(sec) {
  return sec.id || sec.fmid || `${sec.activityNumber || ""}|${sec.beginDate || ""}|${sec.description || ""}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function loadShortlist() {
  shortlist = loadJSON(STORAGE_SHORTLIST, []);
  if (!Array.isArray(shortlist)) shortlist = [];
  shortlist = shortlist.filter((s) => s && typeof s === "object");
}

function persistShortlist() {
  saveJSON(STORAGE_SHORTLIST, shortlist);
  updateShortlistUI();
}

function isShortlisted(key) {
  return shortlist.some((s) => keyFor(s) === key);
}

function toggleShortlist(sec) {
  const key = keyFor(sec);
  const idx = shortlist.findIndex((s) => keyFor(s) === key);
  if (idx >= 0) shortlist.splice(idx, 1);
  else shortlist.push({ ...sec, _key: key });
  persistShortlist();
  if (!$("#modal").hidden) renderModalBody();
}

function updateShortlistUI() {
  $("#shortlistCount").textContent = String(shortlist.length);
  $("#compareBtn").disabled = shortlist.length < 2;
  document.querySelectorAll(".star-btn").forEach((btn) => {
    const active = isShortlisted(btn.dataset.key);
    btn.classList.toggle("active", active);
    btn.textContent = active ? "★" : "☆";
    btn.setAttribute("aria-label", active ? "Remove from shortlist" : "Add to shortlist");
  });
}

function loadPresets() {
  presets = loadJSON(STORAGE_PRESETS, []);
  if (!Array.isArray(presets)) presets = [];
  renderPresets();
}

function persistPresets() {
  saveJSON(STORAGE_PRESETS, presets);
  renderPresets();
}

function snapshotState() {
  return {
    months: Array.from(state.selectedMonths).sort(),
    types: Array.from(state.types).sort(),
    locations: Array.from(state.locations).sort(),
    days: Array.from(state.days).sort(),
    statuses: Array.from(state.statuses).sort(),
    ages: state.ages.map((a) => String(a || "").trim()).filter(Boolean),
    ageMode: state.ageMode,
    keyword: state.keyword,
    spots: state.spots,
  };
}

function renderPresets() {
  const select = $("#presetSelect");
  select.innerHTML = presets.length
    ? `<option value="">Select preset…</option>${presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("")}`
    : `<option value="">No saved presets</option>`;
}

function renderMonthOptions() {
  const start = $("#rangeStart");
  const end = $("#rangeEnd");
  const html = options.months.map((m) => `<option value="${m.value}">${esc(m.label)}</option>`).join("");
  start.innerHTML = html;
  end.innerHTML = html;
  if (options.months.length) {
    start.value = options.months[0].value;
    end.value = options.months[Math.min(2, options.months.length - 1)].value;
  }
}

function setDefaultMonths() {
  state.selectedMonths = new Set(options.months.slice(0, 3).map((m) => m.value));
  renderMonthChips();
}

function renderMonthChips() {
  $("#monthChips").innerHTML = options.months
    .map((m) => `<button type="button" class="month-chip ${state.selectedMonths.has(m.value) ? "active" : ""}" data-month="${m.value}">${esc(m.label)}</button>`)
    .join("");
}

function renderChecks(containerId, items, selectedSet, valueFn, labelFn) {
  const container = $(containerId);
  container.innerHTML = items
    .map((item) => {
      const value = valueFn(item);
      const label = labelFn(item);
      return `<label><input type="checkbox" value="${esc(value)}" ${selectedSet.has(value) ? "checked" : ""}> <span>${esc(label)}</span></label>`;
    })
    .join("");
}

function renderAllControls() {
  renderChecks("#typeFilters", options.types, state.types, (v) => v, (v) => v);
  renderChecks("#locationFilters", options.locations, state.locations, (v) => v.value, (v) => v.label);
  renderChecks("#dayFilters", options.days, state.days, (v) => v, (v) => v);
  renderChecks("#statusFilters", options.statuses, state.statuses, (v) => v, (v) => v[0].toUpperCase() + v.slice(1));
  $("#ageMode").value = state.ageMode;
  $("#keyword").value = state.keyword;
  $("#spots").value = String(state.spots);
  renderAges();
}

function renderAges() {
  const wrap = $("#ageRows");
  wrap.innerHTML = "";
  state.ages.forEach((age, idx) => {
    const row = document.createElement("div");
    row.className = "age-row";
    row.innerHTML = `
      <input type="text" inputmode="numeric" placeholder="Age (e.g. 7, 10, Adult)" value="${esc(age)}" data-age-index="${idx}">
      <button type="button" class="btn ghost small" data-remove-age="${idx}" ${state.ages.length <= 1 ? "disabled" : ""}>Remove</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("input[data-age-index]").forEach((input) => {
    input.addEventListener("input", () => {
      state.ages[Number(input.dataset.ageIndex)] = input.value;
    });
  });
  wrap.querySelectorAll("[data-remove-age]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.ages.splice(Number(btn.dataset.removeAge), 1);
      if (!state.ages.length) state.ages.push("");
      renderAges();
    });
  });
}

function applySnapshot(snap) {
  state.selectedMonths = new Set(snap.months || []);
  state.types = new Set(snap.types || []);
  state.locations = new Set(snap.locations || []);
  state.days = new Set(snap.days || []);
  state.statuses = new Set(snap.statuses && snap.statuses.length ? snap.statuses : options.defaultStatuses);
  state.ages = Array.isArray(snap.ages) && snap.ages.length ? snap.ages.map(String) : [""];
  state.ageMode = snap.ageMode || "all";
  state.keyword = snap.keyword || "";
  state.spots = Number(snap.spots || 0);
  renderMonthChips();
  renderAllControls();
}

function monthEndISO(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

function sectionOverlapsMonths(sec, months) {
  let begin = sec.beginDate || "";
  let end = sec.endDate || begin;
  if (!begin) return false;
  if (end < begin) {
    const tmp = begin;
    begin = end;
    end = tmp;
  }
  return months.some((ym) => begin <= monthEndISO(ym) && end >= `${ym}-01`);
}

function sectionText(sec) {
  return [
    sec.programName,
    sec.programDescription,
    sec.description,
    sec.activityNumber,
    sec.location,
    sec.daysDisplay,
    sec.agesDisplay,
    sec.costDisplay,
    sec.statusLabel,
  ].join(" ").toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(sec, keyword) {
  const terms = String(keyword || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = sectionText(sec);
  return terms.every((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`).test(text));
}

function personAgeValue(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return null;
  if (text === "adult" || text === "adults") return 18;
  if (text === "senior" || text === "seniors") return 60;
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function matchesAges(sec, ages, mode) {
  if (!ages.length) return true;
  const aminRaw = sec.ageMin;
  const amaxRaw = sec.ageMax;
  if (aminRaw == null && amaxRaw == null) return true;
  const amin = aminRaw == null ? 0 : Number(aminRaw);
  const amax = amaxRaw == null ? 200 : Number(amaxRaw);
  const ok = [];
  for (const age of ages) {
    const value = personAgeValue(age);
    if (value == null) continue;
    ok.push(amin - 1e-6 <= value && value <= amax + 1e-6);
  }
  if (!ok.length) return true;
  return mode === "all" ? ok.every(Boolean) : ok.some(Boolean);
}

function selectedLocationValues() {
  return Array.from(state.locations);
}

function matchesLocations(sec) {
  if (!state.locations.size) return true;
  const selected = selectedLocationValues();
  const labels = (options.locations || [])
    .filter((loc) => selected.includes(loc.value))
    .map((loc) => loc.label);
  const needles = selected.concat(labels);
  const loc = String(sec.location || "").trim();
  const lower = loc.toLowerCase();
  return needles.some((needle) => {
    const value = String(needle || "");
    return value === loc || value.toLowerCase() === lower;
  });
}

function sortSections(a, b) {
  const aBegin = a.beginDate || "9999-99-99";
  const bBegin = b.beginDate || "9999-99-99";
  if (aBegin !== bBegin) return aBegin < bBegin ? -1 : 1;
  const aTime = a.startMinutes == null ? 9999 : a.startMinutes;
  const bTime = b.startMinutes == null ? 9999 : b.startMinutes;
  if (aTime !== bTime) return aTime - bTime;
  const aName = (a.programName || "").toLowerCase();
  const bName = (b.programName || "").toLowerCase();
  if (aName !== bName) return aName < bName ? -1 : 1;
  const aDesc = (a.description || "").toLowerCase();
  const bDesc = (b.description || "").toLowerCase();
  if (aDesc !== bDesc) return aDesc < bDesc ? -1 : 1;
  return 0;
}

function filterSections(months) {
  const selectedMonths = Array.isArray(months) ? months.slice().sort() : Array.from(state.selectedMonths).sort();
  const defaultStatuses = new Set(options.defaultStatuses || []);
  const statuses = state.statuses.size ? state.statuses : defaultStatuses;
  const types = Array.from(state.types);
  const days = Array.from(state.days);
  const ages = state.ages.map((a) => String(a || "").trim()).filter(Boolean);
  const keyword = state.keyword.trim();
  const spots = Number(state.spots || 0);

  return allSections.filter((sec) => {
    if (!sectionOverlapsMonths(sec, selectedMonths)) return false;

    const status = String(sec.status || "unknown").toLowerCase();
    if (statuses.size && !statuses.has(status)) return false;

    if (types.length) {
      const secTypes = Array.isArray(sec.types) ? sec.types : [];
      if (!secTypes.some((type) => types.includes(type))) return false;
    }

    if (!matchesLocations(sec)) return false;

    if (days.length) {
      const secDays = new Set(sec.days || []);
      if (!secDays.size) return false;
      if (!days.some((day) => secDays.has(day))) return false;
    }

    if (!matchesAges(sec, ages, state.ageMode)) return false;
    if (keyword && !matchesKeyword(sec, keyword)) return false;

    if (spots > 0) {
      const available = sec.spotsAvailable;
      if (typeof available !== "number" || available < spots) return false;
    }

    return true;
  }).sort(sortSections);
}

function search() {
  if (!state.selectedMonths.size) {
    $("#errorBox").hidden = false;
    $("#errorBox").textContent = "Select at least one month.";
    $("#statusLine").textContent = "";
    state.results = [];
    state.filters = null;
    renderResults();
    return;
  }
  const months = Array.from(state.selectedMonths).sort();
  state.results = filterSections(months);
  state.filters = { months };
  state.meta = { snapshot: true, generatedAt: snapshot && snapshot.generatedAt };
  renderResults();
  $("#statusLine").textContent = `Showing ${state.results.length} of ${allSections.length} snapshot sections.`;
  $("#errorBox").hidden = true;
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(sec) {
  const begin = sec.beginDate;
  const end = sec.endDate || sec.beginDate;
  if (!begin) return sec.datesDisplay || "—";
  if (!end || end === begin) return formatDate(begin);
  return `${formatDate(begin)} – ${formatDate(end)}`;
}

function statusBadge(status) {
  const value = (status || "unknown").toLowerCase();
  return `<span class="badge ${esc(value)}">${esc(value === "open" ? "Open" : value)}</span>`;
}

function moneyNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatCost(sec) {
  const display = String(sec.costDisplay || "").trim();
  if (!display) return "—";
  const parts = display.split("/");
  const likeForLike = parts.length === 2 && parts.every((part) => /^\$\d[\d,]*(?:\.\d+)?$/.test(part.trim()));
  const displayNums = likeForLike ? parts.map((part) => Number(part.trim().replace(/[$,]/g, ""))) : [];
  const values = Array.isArray(sec.costValues) && sec.costValues.length === 2 ? sec.costValues.map(moneyNumber) : [null, null];
  const aligned = values[0] != null && values[1] != null && displayNums.length === 2 &&
    Math.abs(values[0] - displayNums[0]) < 0.011 && Math.abs(values[1] - displayNums[1]) < 0.011;
  if (!likeForLike || !aligned) return esc(display);

  const resident = values[0];
  const nonresident = values[1];
  const feeLine = `<span class="cost-fees">Resident ${esc(parts[0].trim())} · Non-resident ${esc(parts[1].trim())}</span>`;
  if (resident > 0 && nonresident > 0 && nonresident >= resident) {
    const pct = ((nonresident - resident) / resident) * 100;
    const rounded = Math.round(pct * 10) / 10;
    const pctText = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${feeLine} <span class="cost-premium">non-resident premium +${esc(pctText)}%</span>`;
  }
  return feeLine;
}

function renderResults() {
  const body = $("#resultsBody");
  const count = state.results.length;
  $("#resultTitle").textContent = count === 1 ? "1 section" : `${count} sections`;
  const months = state.filters && state.filters.months ? state.filters.months.join(", ") : "";
  $("#resultMeta").textContent = months ? `Months: ${months}` : "";
  $("#emptyState").hidden = count !== 0;

  const rows = state.results.map((sec) => {
    const key = keyFor(sec);
    const active = isShortlisted(key);
    const desc = sec.description || sec.programDescription || "";
    const activity = sec.activityNumber ? `<div class="activity-no">Activity # ${esc(sec.activityNumber)}</div>` : "";
    return `<tr>
      <td><button type="button" class="star-btn ${active ? "active" : ""}" data-key="${esc(key)}" aria-label="${active ? "Remove from shortlist" : "Add to shortlist"}">${active ? "★" : "☆"}</button></td>
      <td>${statusBadge(sec.status)}</td>
      <td>
        <div class="program-name">${esc(sec.programName || "Untitled program")}</div>
        ${desc ? `<div class="section-desc">${esc(desc)}</div>` : ""}
        ${activity}
      </td>
      <td>${esc(formatDateRange(sec))}</td>
      <td>${esc(sec.timesDisplay || "—")}</td>
      <td>${esc(sec.daysDisplay || (sec.days || []).join(", ") || "—")}</td>
      <td>${esc(sec.location || "—")}</td>
      <td>${esc(sec.agesDisplay || "—")}</td>
      <td>${formatCost(sec)}</td>
      <td>${sec.infoUrl ? `<a class="info-link" href="${esc(sec.infoUrl)}" target="_blank" rel="noopener">Details</a>` : "—"}</td>
    </tr>`;
  });
  body.innerHTML = rows.join("");
  updateShortlistUI();
}

function openModal(title) {
  $("#modalTitle").textContent = title;
  $("#modal").hidden = false;
}

function closeModal() {
  $("#modal").hidden = true;
}

function renderModalBody() {
  if (compareMode) renderCompare();
  else renderShortlist();
}

function renderShortlist() {
  compareMode = false;
  const body = $("#modalBody");
  if (!shortlist.length) {
    body.innerHTML = `<p class="muted">No sections shortlisted yet. Use the star column in results to add sessions.</p>`;
    return;
  }
  const items = shortlist.map((sec) => {
    const key = keyFor(sec);
    return `<div class="shortlist-item">
      <div>
        <div class="program-name">${esc(sec.programName || "Untitled program")}</div>
        <div class="section-desc">${esc(sec.description || "")}</div>
        <div class="meta">${esc(formatDateRange(sec))} · ${esc(sec.timesDisplay || "—")} · ${esc(sec.location || "—")} · ${statusBadge(sec.status)}</div>
      </div>
      <button type="button" class="btn ghost small" data-remove-key="${esc(key)}">Remove</button>
    </div>`;
  }).join("");
  body.innerHTML = `<div class="shortlist-list">${items}</div>
    <div class="modal-actions">
      <button type="button" id="compareFromShortlist" class="btn primary" ${shortlist.length < 2 ? "disabled" : ""}>Compare (${shortlist.length})</button>
      <button type="button" id="clearShortlist" class="btn ghost danger">Clear shortlist</button>
    </div>`;
  body.querySelectorAll("[data-remove-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      shortlist = shortlist.filter((s) => keyFor(s) !== btn.dataset.removeKey);
      persistShortlist();
      renderModalBody();
    });
  });
  const compareBtn = body.querySelector("#compareFromShortlist");
  if (compareBtn) compareBtn.addEventListener("click", () => { compareMode = true; renderModalBody(); });
  body.querySelector("#clearShortlist").addEventListener("click", () => {
    shortlist = [];
    persistShortlist();
    renderModalBody();
  });
}

function renderCompare() {
  compareMode = true;
  const body = $("#modalBody");
  if (shortlist.length < 2) {
    body.innerHTML = `<p class="muted">Add at least two sections to compare.</p>`;
    return;
  }
  const items = shortlist.slice(0, 6);
  const note = shortlist.length > 6 ? `<p class="hint">Showing first 6 of ${shortlist.length} shortlisted sections.</p>` : "";
  const fields = [
    ["Status", (s) => statusBadge(s.status)],
    ["Dates", (s) => esc(formatDateRange(s))],
    ["Times", (s) => esc(s.timesDisplay || "—")],
    ["Days", (s) => esc(s.daysDisplay || (s.days || []).join(", ") || "—")],
    ["Location", (s) => esc(s.location || "—")],
    ["Ages", (s) => esc(s.agesDisplay || "—")],
    ["Cost", (s) => formatCost(s)],
    ["Program", (s) => esc(s.programName || "—")],
    ["Section", (s) => esc(s.description || "—")],
    ["Info", (s) => s.infoUrl ? `<a class="info-link" href="${esc(s.infoUrl)}" target="_blank" rel="noopener">Portal details</a>` : "—"],
  ];
  const header = items.map((s) => `<th>
    <div class="program-name">${esc(s.programName || "Untitled program")}</div>
    <div class="activity-no">${esc(s.activityNumber || "")}</div>
  </th>`).join("");
  const rows = fields.map(([label, fn]) => `<tr><td>${esc(label)}</td>${items.map((s) => `<td>${fn(s)}</td>`).join("")}</tr>`).join("");
  body.innerHTML = `${note}<div class="table-wrap" style="max-height:none"><table class="compare-table"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="modal-actions"><button type="button" id="backToShortlist" class="btn ghost">Back to shortlist</button></div>`;
  body.querySelector("#backToShortlist").addEventListener("click", () => { compareMode = false; renderModalBody(); });
}

function openShortlist() {
  compareMode = false;
  renderModalBody();
  openModal("Shortlist");
}

function openCompare() {
  if (shortlist.length < 2) return;
  compareMode = true;
  renderModalBody();
  openModal("Compare sections");
}

function resetControls() {
  setDefaultMonths();
  state.types.clear();
  state.locations.clear();
  state.days.clear();
  state.statuses = new Set(options.defaultStatuses);
  state.ages = [""];
  state.ageMode = "all";
  state.keyword = "";
  state.spots = 0;
  renderMonthChips();
  renderAllControls();
}

function bindEvents() {
  $("#monthChips").addEventListener("click", (e) => {
    const btn = e.target.closest(".month-chip");
    if (!btn) return;
    const month = btn.dataset.month;
    if (state.selectedMonths.has(month)) state.selectedMonths.delete(month);
    else state.selectedMonths.add(month);
    renderMonthChips();
  });
  $("#applyRange").addEventListener("click", () => {
    const months = options.months.map((m) => m.value);
    const a = months.indexOf($("#rangeStart").value);
    const b = months.indexOf($("#rangeEnd").value);
    if (a < 0 || b < 0) return;
    const [start, end] = a <= b ? [a, b] : [b, a];
    state.selectedMonths = new Set(months.slice(start, end + 1));
    renderMonthChips();
  });
  $("#clearMonths").addEventListener("click", () => {
    state.selectedMonths.clear();
    renderMonthChips();
  });

  ["#typeFilters", "#locationFilters", "#dayFilters", "#statusFilters"].forEach((selector) => {
    $(selector).addEventListener("change", (e) => {
      const input = e.target.closest("input[type=checkbox]");
      if (!input) return;
      let targetSet;
      if (selector === "#typeFilters") targetSet = state.types;
      else if (selector === "#locationFilters") targetSet = state.locations;
      else if (selector === "#dayFilters") targetSet = state.days;
      else targetSet = state.statuses;
      if (input.checked) targetSet.add(input.value);
      else targetSet.delete(input.value);
    });
  });

  $("#keyword").addEventListener("input", (e) => { state.keyword = e.target.value; });
  $("#keyword").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
  $("#spots").addEventListener("change", (e) => { state.spots = Number(e.target.value || 0); });
  $("#ageMode").addEventListener("change", (e) => { state.ageMode = e.target.value; });
  $("#addAge").addEventListener("click", () => { state.ages.push(""); renderAges(); });

  $("#searchBtn").addEventListener("click", search);
  $("#clearFilters").addEventListener("click", () => { resetControls(); search(); });

  $("#resultsBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".star-btn");
    if (!btn) return;
    const sec = state.results.find((s) => keyFor(s) === btn.dataset.key);
    if (sec) toggleShortlist(sec);
  });

  $("#shortlistBtn").addEventListener("click", openShortlist);
  $("#compareBtn").addEventListener("click", openCompare);
  $("#modalClose").addEventListener("click", closeModal);
  document.querySelector(".modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  $("#savePreset").addEventListener("click", () => {
    const name = $("#presetName").value.trim();
    if (!name) return;
    presets = presets.filter((p) => p.name !== name);
    presets.push({ name, ...snapshotState() });
    persistPresets();
    $("#presetName").value = "";
  });
  $("#loadPreset").addEventListener("click", () => {
    const idx = Number($("#presetSelect").value);
    const preset = presets[idx];
    if (!preset) return;
    applySnapshot(preset);
    search();
  });
  $("#deletePreset").addEventListener("click", () => {
    const idx = Number($("#presetSelect").value);
    if (!Number.isInteger(idx) || idx < 0 || idx >= presets.length) return;
    presets.splice(idx, 1);
    persistPresets();
  });
}

function formatGeneratedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function setFreshness() {
  const el = $("#dataFreshness");
  const label = formatGeneratedAt(snapshot && snapshot.generatedAt);
  if (!label) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `Data current as of ${label} · ${allSections.length} sections · read-only snapshot of the public WebTrac search`;
}

async function loadData() {
  const res = await fetch("data.json");
  if (!res.ok) throw new Error(`Could not load data.json (HTTP ${res.status})`);
  const data = await res.json();
  snapshot = data;
  options = data;
  allSections = Array.isArray(data.sections) ? data.sections : [];
  $("#portalLink").href = data.portalUrl || "#";
  state.statuses = new Set(data.defaultStatuses || []);
  setFreshness();
  renderMonthOptions();
  renderAllControls();
  setDefaultMonths();
  renderPresets();
  loadShortlist();
  updateShortlistUI();
}

async function init() {
  bindEvents();
  loadPresets();
  try {
    await loadData();
    search();
  } catch (err) {
    $("#errorBox").hidden = false;
    $("#errorBox").textContent = err.message || String(err);
  }
}

init();
