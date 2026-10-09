(function () {
  "use strict";

  const CONFIG = {
    appName: "", // set in loadCreatorConfig() from ZOHO.CREATOR.UTIL.getInitParams()
    formName: "Train_Tracking",
    reportName: "Train_Tracking_Report",
    accountName: "", // set in loadCreatorConfig(), see above
    fields: {
      trainNumber: "train_number",
      trainName: "train_name",
      routeName: "Route_Name",
      movementHistory: "Movement_History",
      currentStation: "Current_Station",
      latitude: "Latitude",
      longitude: "Longitude",
      movementDateTime: "Movement_Date_Time",
      currentStatus: "Current_Status",
      remarks: "Remarks",
    },
    maxRecords: 1000,
  };

  const MONTH_ABBREVIATIONS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const STATUS_OPTIONS = [
    { value: "Start", label: "Start" },
    { value: "Completed", label: "Completed" },
    { value: "End", label: "End" },
  ];

  const STATUS_OPTIONS_WITHOUT_START = STATUS_OPTIONS.filter((o) => o.value !== "Start");

  const state = {
    trains: [],
    isLoadingTrains: true,
    listLoadError: "",
    view: "list",
    trainId: null,
    step: 1,
    hasPrefilledDetails: false,
    trainDetails: { trainNumber: "", trainName: "", routeName: "" },
    movementRows: [],
    isSaving: false,
    isLoadingTrain: false,
    loadError: "",
    saveMessage: "",
    saveError: "",
    detailsError: "",
    nextRowId: 1,
  };

  const stations = Array.isArray(window.RAILWAY_STATIONS) ? window.RAILWAY_STATIONS : [];
  const STATION_LOOKUP = new Map(
    stations.map((station) => [String(station.name || "").trim().toLowerCase(), station]),
  );
  const STATION_NAMES = stations.map((station) => station.name).filter(Boolean);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function hasZohoSdk() {
    return typeof ZOHO !== "undefined" && ZOHO.CREATOR && ZOHO.CREATOR.DATA;
  }

  function isSdkSuccess(response) {
    if (!response) return false;
    const code = response.code;
    return code === 3000 || code === "3000" || code === 0 || code === "0";
  }

  function sdkErrorMessage(response, fallback) {
    if (!response) return fallback;
    if (typeof response.message === "string" && response.message) return response.message;
    if (response.error && typeof response.error === "object") {
      return Object.values(response.error).join(" ") || fallback;
    }
    return fallback;
  }

  // Zoho answers a genuinely empty report with a rejected promise (code 9220,
  // "No records exist in this report."), not a resolved, empty response -
  // that is a normal zero-record result, not a fetch failure to surface.
  function isEmptyReportError(err) {
    if (!err) return false;
    if (Number(err.code) === 9220) return true;
    if (err.data && Number(err.data.code) === 9220) return true;
    if (/no records exist/i.test(String(err.message || ""))) return true;
    try {
      return /no records exist/i.test(JSON.stringify(err));
    } catch (e) {
      return false;
    }
  }

  function formatZohoDateTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || "");
    if (!match) return value;
    const [, year, month, day, hours, minutes, seconds = "00"] = match;
    const monthAbbreviation = MONTH_ABBREVIATIONS[Number(month) - 1];
    return `${day}-${monthAbbreviation}-${year} ${hours}:${minutes}:${seconds}`;
  }

  function formatNowAsMovementDateTime() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(now.getDate())}-${MONTH_ABBREVIATIONS[now.getMonth()]}-${now.getFullYear()} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  function roundCoordinate(value) {
    return Number(Number(value).toFixed(6));
  }

  function formatCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(5) : value;
  }

  function statusBadgeClass(status) {
    switch (status) {
      case "Start":
        return "miso-status-badge miso-status-start";
      case "Completed":
        return "miso-status-badge miso-status-completed";
      case "End":
        return "miso-status-badge miso-status-end";
      default:
        return "miso-status-badge miso-status-default";
    }
  }

  // The first and last movement rows are always the origin/destination, so
  // their status is derived from position rather than trusted from stored
  // data - this self-heals older records saved before that was enforced
  // (e.g. a destination row stuck showing "Planned" instead of "End").
  function getEffectiveStatus(currentStatus, index, total) {
    if (index === 0) return "Start";
    if (index === total - 1) return "End";
    return currentStatus;
  }

  function createBlankRow(id) {
    return {
      id: id || state.nextRowId++,
      currentStation: "",
      latitude: "",
      longitude: "",
      movementDateTime: "",
      currentStatus: "",
      remarks: "",
      isEditing: true,
      isExisting: false,
      checked: false,
      errors: {},
    };
  }

  function mapSubformRow(row) {
    if (!row || typeof row !== "object") {
      return {
        currentStation: "",
        latitude: "",
        longitude: "",
        movementDateTime: "",
        currentStatus: "",
        remarks: "",
      };
    }

    const f = CONFIG.fields;
    if (
      row[f.currentStation] != null ||
      row.Current_Station != null ||
      row.currentStation != null
    ) {
      return {
        currentStation: row[f.currentStation] || row.Current_Station || row.currentStation || "",
        latitude: row[f.latitude] ?? row.Latitude ?? row.latitude ?? "",
        longitude: row[f.longitude] ?? row.Longitude ?? row.longitude ?? "",
        movementDateTime:
          row[f.movementDateTime] || row.Movement_Date_Time || row.movementDateTime || "",
        currentStatus: row[f.currentStatus] || row.Current_Status || row.currentStatus || "",
        remarks: row[f.remarks] || row.Remarks || row.remarks || "",
      };
    }

    const parts = String(row.display_value || "").split(",").map((part) => part.trim());
    if (parts.length < 6) {
      return {
        currentStation: "",
        latitude: "",
        longitude: "",
        movementDateTime: "",
        currentStatus: "",
        remarks: "",
      };
    }

    const [currentStation, latitude, longitude, currentStatus, movementDateTime] = parts;
    const remarks = parts.slice(6, -1).join(", ");
    return { currentStation, latitude, longitude, movementDateTime, currentStatus, remarks };
  }

  function mapZohoRecord(record) {
    if (!record) return null;
    const f = CONFIG.fields;
    const historyRaw = record[f.movementHistory] || record.Movement_History || [];
    const history = Array.isArray(historyRaw) ? historyRaw : [];
    return {
      id: record.ID || record.id,
      trainNumber: record[f.trainNumber] || record.train_number || "",
      trainName: record[f.trainName] || record.train_name || "",
      routeName: record[f.routeName] || record.Route_Name || "",
      movementHistory: history.map(mapSubformRow),
    };
  }

  function toMovementPayload(rows) {
    const f = CONFIG.fields;
    return rows.map((row, index) => ({
      [f.currentStation]: row.currentStation,
      [f.latitude]: roundCoordinate(row.latitude),
      [f.longitude]: roundCoordinate(row.longitude),
      [f.movementDateTime]:
        row.movementDateTime && row.movementDateTime.includes("T")
          ? formatZohoDateTime(row.movementDateTime)
          : row.movementDateTime || "",
      [f.currentStatus]: getEffectiveStatus(row.currentStatus, index, rows.length) || "",
      [f.remarks]: row.remarks || "",
    }));
  }

  /* -------------------------------------------------------------------------- */
  /* Fuzzy autocomplete                                                         */
  /* -------------------------------------------------------------------------- */

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j += 1) prev[j] = j;
    for (let i = 1; i <= m; i += 1) {
      curr[0] = i;
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[n];
  }

  function fuzzyMatch(options, rawQuery, limit) {
    const query = String(rawQuery || "").trim().toLowerCase();
    const max = limit || 8;
    if (!query) return options.slice(0, max);

    const threshold = Math.max(2, Math.floor(query.length * 0.3));
    const scored = [];

    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      if (!option) continue;
      const lower = String(option).toLowerCase();
      if (lower.startsWith(query)) {
        scored.push([option, 0]);
        continue;
      }
      if (lower.includes(query)) {
        scored.push([option, 1]);
        continue;
      }
      if (Math.abs(lower.length - query.length) <= threshold + 2) {
        const distance = levenshtein(query, lower);
        if (distance <= threshold) scored.push([option, 10 + distance]);
      }
    }

    scored.sort((a, b) => a[1] - b[1]);
    return scored.slice(0, max).map((pair) => pair[0]);
  }

  let activeListEl = null;
  let activeInputEl = null;

  function closeAutocomplete() {
    if (activeListEl && activeListEl.parentNode) {
      activeListEl.parentNode.removeChild(activeListEl);
    }
    activeListEl = null;
    activeInputEl = null;
  }

  function positionAutocomplete(input, listEl) {
    const rect = input.getBoundingClientRect();
    listEl.style.top = `${rect.bottom + window.scrollY + 4}px`;
    listEl.style.left = `${rect.left + window.scrollX}px`;
    listEl.style.width = `${rect.width}px`;
  }

  function openAutocomplete(input, options, onSelect) {
    closeAutocomplete();
    const filtered = fuzzyMatch(options, input.value);
    if (!filtered.length) return;

    const listEl = document.createElement("ul");
    listEl.className = "miso-autocomplete-list";
    filtered.forEach((option) => {
      const li = document.createElement("li");
      li.textContent = option;
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        onSelect(option);
        closeAutocomplete();
      });
      listEl.appendChild(li);
    });

    positionAutocomplete(input, listEl);
    document.body.appendChild(listEl);
    activeListEl = listEl;
    activeInputEl = input;
  }

  function bindAutocomplete(input, getOptions, onSelect) {
    if (!input) return;

    input.addEventListener("focus", () => {
      openAutocomplete(input, getOptions(), onSelect || ((value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }));
    });

    input.addEventListener("input", () => {
      openAutocomplete(input, getOptions(), onSelect || ((value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }));
    });
  }

  document.addEventListener("mousedown", (event) => {
    if (!activeListEl) return;
    const clickedList = event.target.closest && event.target.closest(".miso-autocomplete-list");
    if (clickedList) return;
    if (activeInputEl && activeInputEl.contains(event.target)) return;
    closeAutocomplete();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (activeListEl && activeInputEl) positionAutocomplete(activeInputEl, activeListEl);
    },
    true,
  );

  window.addEventListener("resize", () => {
    if (activeListEl && activeInputEl) positionAutocomplete(activeInputEl, activeListEl);
  });

  /* -------------------------------------------------------------------------- */
  /* API                                                                        */
  /* -------------------------------------------------------------------------- */

  function extractRecordCursor(response) {
    if (!response || typeof response !== "object") return "";
    return (
      response.record_cursor ||
      response.recordCursor ||
      (response.header && (response.header.record_cursor || response.header.recordCursor)) ||
      (response.headers && (response.headers.record_cursor || response.headers.recordCursor)) ||
      ""
    );
  }

  async function getRecords() {
    if (!hasZohoSdk()) {
      console.warn("ZOHO Creator Widget SDK not available; returning empty train list.");
      return [];
    }

    const allRows = [];
    let recordCursor = "";
    let pageGuard = 0;

    // Paginate with record_cursor until Zoho stops returning a next-batch key.
    // max_records allows 200 / 500 / 1000 per request (docs default 1000).
    while (pageGuard < 50) {
      pageGuard += 1;

      const config = {
        app_name: CONFIG.appName,
        report_name: CONFIG.reportName,
        max_records: CONFIG.maxRecords,
        field_config: "all",
      };
      if (recordCursor) {
        config.record_cursor = recordCursor;
      }

      let response;
      try {
        response = await ZOHO.CREATOR.DATA.getRecords(config);
      } catch (err) {
        if (isEmptyReportError(err)) break;
        throw err;
      }

      if (!isSdkSuccess(response)) {
        if (isEmptyReportError(response)) break;
        throw new Error(sdkErrorMessage(response, "Unable to load trains."));
      }

      const rows = Array.isArray(response.data) ? response.data : [];
      allRows.push(...rows);

      const nextCursor = extractRecordCursor(response);
      if (!nextCursor || nextCursor === recordCursor || rows.length === 0) {
        break;
      }
      recordCursor = nextCursor;
    }

    return allRows.map(mapZohoRecord).filter(Boolean);
  }

  async function getRecordById(id) {
    if (!hasZohoSdk()) {
      throw new Error("ZOHO Creator Widget SDK is not available in this environment.");
    }

    const response = await ZOHO.CREATOR.DATA.getRecordById({
      app_name: CONFIG.appName,
      report_name: CONFIG.reportName,
      id: String(id),
      field_config: "all",
    });

    if (!isSdkSuccess(response)) {
      throw new Error(sdkErrorMessage(response, "Unable to load this train."));
    }

    const record = Array.isArray(response.data) ? response.data[0] : response.data;
    const mapped = mapZohoRecord(record);
    if (!mapped) throw new Error("Train record not found.");
    return mapped;
  }

  async function addRecord(payload) {
    if (!hasZohoSdk()) {
      throw new Error("ZOHO Creator Widget SDK is not available in this environment.");
    }

    const response = await ZOHO.CREATOR.DATA.addRecords({
      app_name: CONFIG.appName,
      form_name: CONFIG.formName,
      payload,
    });

    if (!isSdkSuccess(response)) {
      throw new Error(sdkErrorMessage(response, "Unable to save the train movement data."));
    }

    return response;
  }

  async function updateRecord(id, payload) {
    if (!hasZohoSdk()) {
      throw new Error("ZOHO Creator Widget SDK is not available in this environment.");
    }

    const response = await ZOHO.CREATOR.DATA.updateRecordById({
      app_name: CONFIG.appName,
      report_name: CONFIG.reportName,
      id: String(id),
      payload,
    });

    if (!isSdkSuccess(response)) {
      throw new Error(sdkErrorMessage(response, "Unable to update the movement history."));
    }

    return response;
  }

  /* -------------------------------------------------------------------------- */
  /* View helpers                                                               */
  /* -------------------------------------------------------------------------- */

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function showMessage(el, text) {
    if (!el) return;
    if (text) {
      el.textContent = text;
      setHidden(el, false);
    } else {
      el.textContent = "";
      setHidden(el, true);
    }
  }

  function showListView() {
    state.view = "list";
    setHidden($("#list-view"), false);
    setHidden($("#movement-view"), true);
    closeAutocomplete();
  }

  function showMovementView() {
    state.view = "movement";
    setHidden($("#list-view"), true);
    setHidden($("#movement-view"), false);
    closeAutocomplete();
  }

  function findTrainBy(field, value) {
    const query = String(value || "").trim().toLowerCase();
    if (!query) return null;
    return (
      state.trains.find((train) => String(train[field] || "").trim().toLowerCase() === query) || null
    );
  }

  /* -------------------------------------------------------------------------- */
  /* List view                                                                  */
  /* -------------------------------------------------------------------------- */

  function renderTrainsTable() {
    const body = $("#trains-body");
    const wrap = $("#list-table-wrap");
    const loading = $("#list-loading");

    setHidden(loading, !state.isLoadingTrains);
    setHidden(wrap, state.isLoadingTrains || Boolean(state.listLoadError));

    if (!body) return;

    if (!state.trains.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="miso-subtitle">No trains found.</td></tr>';
      return;
    }

    body.innerHTML = state.trains
      .map(
        (train) => `
        <tr class="miso-row-clickable" data-train-id="${escapeAttr(train.id)}">
          <td>${escapeHtml(train.trainNumber)}</td>
          <td>${escapeHtml(train.trainName)}</td>
          <td>${escapeHtml(train.routeName)}</td>
          <td>${train.movementHistory.length}</td>
        </tr>`,
      )
      .join("");
  }

  async function loadTrains() {
    state.isLoadingTrains = true;
    state.listLoadError = "";
    showMessage($("#list-load-error"), "");
    renderTrainsTable();

    try {
      state.trains = await getRecords();
    } catch (error) {
      state.listLoadError = error.message || "Unable to load trains.";
      showMessage($("#list-load-error"), state.listLoadError);
      state.trains = [];
    } finally {
      state.isLoadingTrains = false;
      renderTrainsTable();
    }
  }

  function handleListSubmit(event) {
    event.preventDefault();
    const trainNumber = $("#list-train-number").value.trim();
    const trainName = $("#list-train-name").value.trim();
    const routeName = $("#list-route-name").value.trim();

    if (!trainNumber || !trainName || !routeName) {
      showMessage(
        $("#list-form-error"),
        "Train Number, Train Name, and Route Name are all required.",
      );
      return;
    }

    if (state.isLoadingTrains) {
      showMessage($("#list-form-error"), "Still loading trains, please try again in a moment.");
      return;
    }

    showMessage($("#list-form-error"), "");

    const existing = state.trains.find(
      (train) => String(train.trainNumber || "").trim().toLowerCase() === trainNumber.toLowerCase(),
    );

    if (existing) {
      openExistingTrain(existing.id);
      return;
    }

    openNewTrain({ trainNumber, trainName, routeName });
  }

  function syncListCrossFill(field) {
    const trainNumberInput = $("#list-train-number");
    const trainNameInput = $("#list-train-name");
    const routeNameInput = $("#list-route-name");
    const value = field === "trainNumber" ? trainNumberInput.value : trainNameInput.value;
    const match = findTrainBy(field, value);
    if (!match) return;
    trainNumberInput.value = match.trainNumber;
    trainNameInput.value = match.trainName;
    routeNameInput.value = match.routeName;
  }

  /* -------------------------------------------------------------------------- */
  /* Movement view                                                              */
  /* -------------------------------------------------------------------------- */

  function openNewTrain(prefill) {
    state.trainId = null;
    state.hasPrefilledDetails = Boolean(prefill);
    state.step = prefill ? 2 : 1;
    state.trainDetails = {
      trainNumber: (prefill && prefill.trainNumber) || "",
      trainName: (prefill && prefill.trainName) || "",
      routeName: (prefill && prefill.routeName) || "",
    };
    state.movementRows = [createBlankRow()];
    state.loadError = "";
    state.saveMessage = "";
    state.saveError = "";
    state.detailsError = "";
    state.isLoadingTrain = false;
    showMovementView();
    renderMovementView();
  }

  async function openExistingTrain(id) {
    state.trainId = id;
    state.hasPrefilledDetails = false;
    state.step = 2;
    state.movementRows = [];
    state.loadError = "";
    state.saveMessage = "";
    state.saveError = "";
    state.detailsError = "";
    state.isLoadingTrain = true;
    showMovementView();
    renderMovementView();
    await loadExistingTrain();
  }

  async function loadExistingTrain() {
    if (!state.trainId) return;

    state.isLoadingTrain = true;
    state.loadError = "";
    renderMovementView();

    try {
      const train = await getRecordById(state.trainId);
      state.trainDetails = {
        trainNumber: train.trainNumber || "",
        trainName: train.trainName || "",
        routeName: train.routeName || "",
      };
      const history = train.movementHistory || [];
      state.movementRows = history.map((row, index) => {
        const effectiveStatus = getEffectiveStatus(row.currentStatus, index, history.length);
        const isBoundaryRow = effectiveStatus === "Start" || effectiveStatus === "End";
        // Reflects whether a movement date was actually captured, not just
        // the status label - a record can carry Status "Start" from the
        // native Zoho form with no date filled in yet. Non-boundary rows
        // still key off the Completed/Planned flip.
        const checked = isBoundaryRow
          ? Boolean(String(row.movementDateTime || "").trim())
          : effectiveStatus === "Completed";

        return {
          id: `existing-${index}`,
          ...row,
          currentStatus: effectiveStatus,
          isEditing: false,
          isExisting: true,
          checked,
          // A row already saved as checked can never be unticked again;
          // only the still-unchecked rows stay interactive after reload.
          locked: checked,
          errors: {},
        };
      });
    } catch (error) {
      state.loadError = error.message || "Unable to load this train.";
      state.movementRows = [];
    } finally {
      state.isLoadingTrain = false;
      renderMovementView();
    }
  }

  function validateRow(row) {
    const errors = {};
    if (!String(row.currentStation || "").trim()) {
      errors.currentStation = "Current Station is required.";
    }
    if (!String(row.latitude ?? "").trim()) {
      errors.latitude = "Latitude is required.";
    }
    if (!String(row.longitude ?? "").trim()) {
      errors.longitude = "Longitude is required.";
    }
    if (!String(row.movementDateTime || "").trim()) {
      errors.movementDateTime = "Movement Date & Time is required.";
    }
    return errors;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function statusOptionsHtml(selected, includeStart) {
    const options = includeStart ? STATUS_OPTIONS : STATUS_OPTIONS_WITHOUT_START;
    return (
      `<option value="">Select status</option>` +
      options
        .map(
          (opt) =>
            `<option value="${escapeAttr(opt.value)}"${
              selected === opt.value ? " selected" : ""
            }>${escapeHtml(opt.label)}</option>`,
        )
        .join("")
    );
  }

  function renderMovementRows() {
    const body = $("#movement-body");
    if (!body) return;

    if (!state.movementRows.length) {
      body.innerHTML =
        '<tr><td colspan="8" class="miso-subtitle">No movement records yet.</td></tr>';
      return;
    }

    body.innerHTML = state.movementRows
      .map((row, index) => {
        if (row.isExisting) {
          return `
            <tr data-row-id="${escapeAttr(row.id)}">
              <td>${escapeHtml(row.currentStation)}</td>
              <td>${escapeHtml(formatCoordinate(row.latitude))}</td>
              <td>${escapeHtml(formatCoordinate(row.longitude))}</td>
              <td>${
                row.currentStatus
                  ? `<span class="${statusBadgeClass(row.currentStatus)}">${escapeHtml(
                      row.currentStatus,
                    )}</span>`
                  : ""
              }</td>
              <td style="text-align:center">
                <input
                  type="checkbox"
                  class="miso-select-checkbox"
                  data-action="toggle-status"
                  ${row.checked ? "checked" : ""}
                  ${row.locked ? "disabled" : ""}
                />
              </td>
              <td>${escapeHtml(row.movementDateTime)}</td>
              <td>${escapeHtml(row.remarks)}</td>
              <td><span class="miso-tag-recorded">Recorded</span></td>
            </tr>`;
        }

        const disabled = row.isEditing ? "" : "disabled";
        const err = row.errors || {};
        return `
          <tr data-row-id="${escapeAttr(row.id)}">
            <td>
              <div class="miso-field miso-field-compact">
                <span class="miso-field-label">Current Station</span>
                <input
                  class="miso-input${err.currentStation ? " miso-input-error" : ""}"
                  type="text"
                  data-field="currentStation"
                  data-autocomplete-station="1"
                  value="${escapeAttr(row.currentStation)}"
                  placeholder="Enter station"
                  autocomplete="off"
                  ${disabled}
                />
                ${
                  err.currentStation
                    ? `<span class="miso-field-error">${escapeHtml(err.currentStation)}</span>`
                    : ""
                }
              </div>
            </td>
            <td>
              <div class="miso-field miso-field-compact">
                <input
                  class="miso-input${err.latitude ? " miso-input-error" : ""}"
                  type="number"
                  data-field="latitude"
                  value="${escapeAttr(row.latitude)}"
                  placeholder="0.0000"
                  min="-90"
                  max="90"
                  step="0.0001"
                  ${disabled}
                />
                ${
                  err.latitude
                    ? `<span class="miso-field-error">${escapeHtml(err.latitude)}</span>`
                    : ""
                }
              </div>
            </td>
            <td>
              <div class="miso-field miso-field-compact">
                <input
                  class="miso-input${err.longitude ? " miso-input-error" : ""}"
                  type="number"
                  data-field="longitude"
                  value="${escapeAttr(row.longitude)}"
                  placeholder="0.0000"
                  min="-180"
                  max="180"
                  step="0.0001"
                  ${disabled}
                />
                ${
                  err.longitude
                    ? `<span class="miso-field-error">${escapeHtml(err.longitude)}</span>`
                    : ""
                }
              </div>
            </td>
            <td>
              <div class="miso-field miso-field-compact">
                <select class="miso-input" data-field="currentStatus" ${disabled}>
                  ${statusOptionsHtml(row.currentStatus, index === 0)}
                </select>
              </div>
            </td>
            <td></td>
            <td>
              <div class="miso-field miso-field-compact">
                <input
                  class="miso-input${err.movementDateTime ? " miso-input-error" : ""}"
                  type="datetime-local"
                  data-field="movementDateTime"
                  value="${escapeAttr(row.movementDateTime)}"
                  ${disabled}
                />
                ${
                  err.movementDateTime
                    ? `<span class="miso-field-error">${escapeHtml(err.movementDateTime)}</span>`
                    : ""
                }
              </div>
            </td>
            <td>
              <div class="miso-field miso-field-compact">
                <textarea
                  class="miso-input"
                  data-field="remarks"
                  rows="3"
                  placeholder="Add notes"
                  ${disabled}
                >${escapeHtml(row.remarks)}</textarea>
              </div>
            </td>
            <td>
              <div class="miso-actions">
                <button type="button" class="miso-btn-action" data-action="edit-row">Edit</button>
                <button type="button" class="miso-btn-action miso-btn-action-danger" data-action="delete-row">Delete</button>
              </div>
            </td>
          </tr>`;
      })
      .join("");
  }

  function openStationAutocomplete(input) {
    openAutocomplete(input, STATION_NAMES, (option) => {
      input.value = option;
      updateRowFromInput(input);
    });
  }

  function renderMovementView() {
    const isExisting = Boolean(state.trainId);
    const showDetailsStep = !isExisting && state.step === 1;
    const showMovementStep = isExisting || state.step === 2;

    setText(
      $("#movement-subtitle"),
      showDetailsStep ? "Step 1: Enter the train details." : "Movement history for this train.",
    );

    setHidden($("#movement-loading"), !state.isLoadingTrain);
    showMessage($("#movement-load-error"), state.loadError);

    const hideContent = state.isLoadingTrain || Boolean(state.loadError);
    setHidden($("#details-step-card"), hideContent || !showDetailsStep);
    setHidden(
      $("#readonly-details-card"),
      hideContent || !(isExisting || (state.hasPrefilledDetails && showMovementStep)),
    );
    setHidden($("#movement-step-card"), hideContent || !showMovementStep);

    if (!hideContent) {
      if (showDetailsStep) {
        $("#mv-train-number").value = state.trainDetails.trainNumber;
        $("#mv-train-name").value = state.trainDetails.trainName;
        $("#mv-route-name").value = state.trainDetails.routeName;
        showMessage($("#details-step-error"), state.detailsError);
      }

      if (isExisting || (state.hasPrefilledDetails && showMovementStep)) {
        $("#ro-train-number").value = state.trainDetails.trainNumber;
        $("#ro-train-name").value = state.trainDetails.trainName;
        $("#ro-route-name").value = state.trainDetails.routeName;
      }

      if (showMovementStep) {
        renderMovementRows();
        setText($("#movement-count"), `${state.movementRows.length} movement record(s)`);
        setHidden($("#btn-mv-back"), isExisting);
        setHidden($("#btn-add-movement"), isExisting);
        const saveBtn = $("#btn-mv-save");
        if (isExisting) {
          saveBtn.textContent = state.isSaving ? "Updating..." : "Update";
        } else {
          saveBtn.textContent = state.isSaving ? "Saving..." : "Save Train Details";
        }
        saveBtn.disabled = state.isSaving;
        showMessage($("#movement-save-message"), state.saveMessage);
        showMessage($("#movement-save-error"), state.saveError);
      }
    }

    if (state.loadError) {
      setHidden($("#btn-back-list"), false);
    }
  }

  function getRowById(rowId) {
    return state.movementRows.find((row) => String(row.id) === String(rowId));
  }

  function updateRowFromInput(input) {
    const tr = input.closest("tr");
    if (!tr) return;
    const rowId = tr.getAttribute("data-row-id");
    const field = input.getAttribute("data-field");
    const row = getRowById(rowId);
    if (!row || !field) return;

    let value = input.value;
    if (field === "latitude" || field === "longitude") {
      value = value === "" ? "" : value;
    }

    row[field] = value;

    if (field === "currentStation") {
      const station = STATION_LOOKUP.get(String(value).trim().toLowerCase());
      if (station) {
        row.latitude = station.latitude;
        row.longitude = station.longitude;
        const latInput = tr.querySelector('[data-field="latitude"]');
        const lngInput = tr.querySelector('[data-field="longitude"]');
        if (latInput) latInput.value = station.latitude;
        if (lngInput) lngInput.value = station.longitude;
      }
    }

    row.errors = validateRow(row);
    if (row.errors[field]) {
      input.classList.add("miso-input-error");
    } else {
      input.classList.remove("miso-input-error");
    }
  }

  // Ticking/unticking here only changes local state - nothing is sent to
  // Zoho until the Update button is pressed. A row that's already locked
  // (its checked state survived a previous Update) can no longer be toggled.
  function toggleRowChecked(rowId) {
    const total = state.movementRows.length;
    state.movementRows = state.movementRows.map((row, index) => {
      if (String(row.id) !== String(rowId) || row.locked) return row;
      const nextChecked = !row.checked;
      const effectiveStatus = getEffectiveStatus(row.currentStatus, index, total);
      const hasFixedStatus = effectiveStatus === "Start" || effectiveStatus === "End";
      if (nextChecked) {
        return {
          ...row,
          checked: nextChecked,
          currentStatus: hasFixedStatus ? effectiveStatus : "Completed",
          movementDateTime: formatNowAsMovementDateTime(),
        };
      }
      return {
        ...row,
        checked: nextChecked,
        currentStatus: hasFixedStatus ? effectiveStatus : "Planned",
        movementDateTime: "",
      };
    });

    state.saveMessage = "";
    state.saveError = "";
    renderMovementRows();
    showMessage($("#movement-save-message"), "");
    showMessage($("#movement-save-error"), "");
  }

  async function handleSaveNewTrain() {
    const nextRows = state.movementRows.map((row) => ({
      ...row,
      errors: validateRow(row),
      isEditing: false,
    }));

    if (!state.movementRows.length) {
      state.saveError = "Add at least one movement record before saving.";
      state.saveMessage = "";
      renderMovementView();
      return;
    }

    const hasInvalid = nextRows.some((row) => Object.keys(row.errors).length > 0);
    if (hasInvalid) {
      state.movementRows = nextRows;
      state.saveError = "Please complete all required fields before saving movement history.";
      state.saveMessage = "";
      renderMovementView();
      return;
    }

    try {
      state.isSaving = true;
      state.saveError = "";
      state.saveMessage = "";
      renderMovementView();

      const f = CONFIG.fields;
      await addRecord({
        data: {
          [f.trainNumber]: state.trainDetails.trainNumber,
          [f.trainName]: state.trainDetails.trainName,
          [f.routeName]: state.trainDetails.routeName,
          [f.movementHistory]: toMovementPayload(nextRows),
        },
      });

      state.movementRows = nextRows;
      state.saveMessage = "Train details and movement history saved successfully.";
      await loadTrains();
    } catch (error) {
      state.saveError = error.message || "Unable to save the train movement data.";
      state.saveMessage = "";
    } finally {
      state.isSaving = false;
      renderMovementView();
    }
  }

  async function handleUpdateMovements() {
    try {
      state.isSaving = true;
      state.saveError = "";
      state.saveMessage = "";
      renderMovementView();

      const f = CONFIG.fields;
      await updateRecord(state.trainId, {
        data: {
          [f.movementHistory]: toMovementPayload(state.movementRows),
        },
      });

      state.saveMessage = "Movement history updated successfully.";
      await loadExistingTrain();
      showMessage($("#movement-save-message"), state.saveMessage);
    } catch (error) {
      state.saveError = error.message || "Unable to update the movement history.";
      state.saveMessage = "";
      renderMovementView();
    } finally {
      state.isSaving = false;
      const saveBtn = $("#btn-mv-save");
      if (saveBtn) {
        saveBtn.textContent = "Update";
        saveBtn.disabled = false;
      }
    }
  }

  function handleCancelMovement() {
    if (state.trainId) {
      loadExistingTrain().then(() => {
        state.saveMessage = "Changes discarded.";
        state.saveError = "";
        showMessage($("#movement-save-message"), state.saveMessage);
        showMessage($("#movement-save-error"), "");
      });
      return;
    }

    state.trainDetails = { trainNumber: "", trainName: "", routeName: "" };
    state.movementRows = [createBlankRow()];
    state.step = state.hasPrefilledDetails ? 2 : 1;
    state.detailsError = "";
    state.saveMessage = "Form reset to its initial state.";
    state.saveError = "";
    renderMovementView();
  }

  /* -------------------------------------------------------------------------- */
  /* Events                                                                     */
  /* -------------------------------------------------------------------------- */

  function bindEvents() {
    $("#list-details-form").addEventListener("submit", handleListSubmit);

    bindAutocomplete($("#list-train-number"), () =>
      state.trains.map((t) => t.trainNumber).filter(Boolean),
    );
    bindAutocomplete($("#list-train-name"), () =>
      state.trains.map((t) => t.trainName).filter(Boolean),
    );

    $("#list-train-number").addEventListener("input", () => syncListCrossFill("trainNumber"));
    $("#list-train-name").addEventListener("input", () => syncListCrossFill("trainName"));
    $("#list-train-number").addEventListener("change", () => syncListCrossFill("trainNumber"));
    $("#list-train-name").addEventListener("change", () => syncListCrossFill("trainName"));

    $("#trains-body").addEventListener("click", (event) => {
      const tr = event.target.closest("tr[data-train-id]");
      if (!tr) return;
      openExistingTrain(tr.getAttribute("data-train-id"));
    });

    $("#btn-back-list").addEventListener("click", () => {
      showListView();
      loadTrains();
    });

    $("#btn-details-next").addEventListener("click", () => {
      const trainNumber = $("#mv-train-number").value.trim();
      const trainName = $("#mv-train-name").value.trim();
      const routeName = $("#mv-route-name").value.trim();
      if (!trainNumber || !trainName || !routeName) {
        state.detailsError = "Train Number, Train Name, and Route Name are all required.";
        showMessage($("#details-step-error"), state.detailsError);
        return;
      }
      state.trainDetails = { trainNumber, trainName, routeName };
      state.detailsError = "";
      state.step = 2;
      state.hasPrefilledDetails = true;
      renderMovementView();
    });

    $("#btn-details-cancel").addEventListener("click", handleCancelMovement);

    $("#btn-mv-back").addEventListener("click", () => {
      state.step = 1;
      state.hasPrefilledDetails = false;
      renderMovementView();
    });

    $("#btn-add-movement").addEventListener("click", () => {
      state.movementRows.push(createBlankRow());
      state.saveMessage = "";
      renderMovementView();
    });

    $("#btn-mv-cancel").addEventListener("click", handleCancelMovement);

    $("#btn-mv-save").addEventListener("click", () => {
      if (state.trainId) handleUpdateMovements();
      else handleSaveNewTrain();
    });

    $("#movement-body").addEventListener("focusin", (event) => {
      const input = event.target;
      if (input.getAttribute("data-autocomplete-station") === "1") {
        openStationAutocomplete(input);
      }
    });

    $("#movement-body").addEventListener("input", (event) => {
      const input = event.target;
      if (!input.getAttribute("data-field")) return;
      updateRowFromInput(input);
      if (input.getAttribute("data-autocomplete-station") === "1") {
        openStationAutocomplete(input);
      }
    });

    $("#movement-body").addEventListener("change", (event) => {
      const input = event.target;
      if (input.getAttribute("data-action") === "toggle-status") {
        const tr = input.closest("tr");
        if (!tr) return;
        toggleRowChecked(tr.getAttribute("data-row-id"));
        return;
      }
      if (!input.getAttribute("data-field")) return;
      updateRowFromInput(input);
    });

    $("#movement-body").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      const tr = btn.closest("tr");
      if (!tr) return;
      const rowId = tr.getAttribute("data-row-id");
      const action = btn.getAttribute("data-action");

      if (action === "edit-row") {
        const row = getRowById(rowId);
        if (row) {
          row.isEditing = true;
          renderMovementRows();
        }
      } else if (action === "delete-row") {
        state.movementRows = state.movementRows.filter((row) => String(row.id) !== String(rowId));
        state.saveMessage = "";
        renderMovementView();
      }
    });
  }

  async function loadCreatorConfig() {
    try {
      if (ZOHO && ZOHO.CREATOR && ZOHO.CREATOR.UTIL && ZOHO.CREATOR.UTIL.getInitParams) {
        const params = await ZOHO.CREATOR.UTIL.getInitParams();
        if (params && params.appLinkName) CONFIG.appName = params.appLinkName;
        if (params && params.scope) CONFIG.accountName = params.scope;
      }
    } catch (e) {
      console.warn("getInitParams:", e);
    }
  }

  async function boot() {
    await loadCreatorConfig();
    bindEvents();
    showListView();
    loadTrains();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
