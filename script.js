// Design World — UI interactions.
//
// Discover and the "More to explore" demo events use static prototype data
// from data.js, clearly labeled as such. Everything under "Ask Design World"
// and the Pune workshops it returns comes from the real backend agent
// (server/agent/workshopResearchAgent.js) over HTTP + Server-Sent Events —
// nothing here fabricates a search result, a verification, or a submission.

(function () {
  "use strict";

  const SAVED_KEY = "designWorldSaved";
  const PROFILE_KEY = "designWorldProfile";
  const BLOCKED_KEY = "designWorldBlockedCalendar";
  const APPLICATIONS_KEY = "designWorldApplications";
  const ONBOARDING_KEY = "designWorldOnboardingComplete";
  const MAX_PORTFOLIO_FILE_BYTES = 3 * 1024 * 1024; // 3MB — this is stored as a data URL in localStorage, not uploaded to a server

  // Matches the real stage names server/agent/workshopResearchAgent.js emits,
  // in the actual order the backend executes them.
  const AGENT_STEPS = [
    { key: "perceive", label: "Understanding your request" },
    { key: "act_search", label: "Searching real sources" },
    { key: "observe_candidates", label: "Reviewing workshop results" },
    { key: "filter_pune", label: "Filtering for Pune" },
    { key: "verify", label: "Cross-checking workshop details" },
    { key: "shortlist", label: "Shortlisting workshops" },
  ];

  const state = {
    saved: loadSaved(),
    profile: loadProfile(),
    agentWorkshops: [], // real, agent-returned workshops (client-assigned ids)
    lastSearchClientIds: [], // ids from the most recent search, for the Ask Design World results view
    blockedCalendar: loadBlockedCalendar(), // [{ name, date, dayOfWeek, startTime, endTime, ics, filename }]
    applications: loadApplications(), // [{ clientId, workshop, application, status, preparedAt }]
    lastTrends: [], // real trend items from the most recent successful /api/trends load, so Search can search real data
    calendarViewDate: new Date(),
    calendarSelectedDay: null,
    eventsFilter: "all",
    nextClientId: 1,
    currentApplication: null, // { workshop, application } while the review modal is open
  };

  // ---------- storage ----------

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function persistSaved() {
    localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
  }
  function loadProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function persistProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
  }
  function loadBlockedCalendar() {
    try {
      return JSON.parse(localStorage.getItem(BLOCKED_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function persistBlockedCalendar() {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(state.blockedCalendar));
  }
  function loadApplications() {
    try {
      return JSON.parse(localStorage.getItem(APPLICATIONS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function persistApplications() {
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(state.applications));
  }

  // ---------- helpers ----------

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }
  function isUrl(str) {
    return typeof str === "string" && /^https?:\/\//.test(str);
  }
  function isKnown(value) {
    return value && !/^(not found|unknown|n\/a)$/i.test(String(value).trim());
  }
  function nextClientId() {
    return `w-${state.nextClientId++}`;
  }

  // Never send the raw portfolio file data (can be up to 3MB of base64) into
  // a Gemini prompt — pointless (Gemini can't meaningfully read a PDF/image
  // from base64 text) and wasteful. Only the filename is passed through, as
  // an honest signal that a real portfolio exists.
  function profileForSkill() {
    const { portfolioFileDataUrl, ...rest } = state.profile;
    if (state.profile.portfolioFileName && !rest.portfolio) {
      rest.portfolio = `Uploaded file: ${state.profile.portfolioFileName}`;
    }
    return rest;
  }

  function verificationBadge(status) {
    const map = {
      verified: { cls: "badge-verified", icon: "✓", label: "Verified" },
      conflicting: { cls: "badge-conflicting", icon: "⚠", label: "Conflicting" },
      unverified: { cls: "badge-unverified", icon: "✕", label: "Unverified" },
    };
    const entry = map[status] || map.unverified;
    return `<span class="badge ${entry.cls}">${entry.icon} ${entry.label}</span>`;
  }

  // ---------- Discover (demo) ----------

  // Real trend items (from /api/trends) carry {title, summary, category,
  // source, imageUrl}. Demo items carry {title, designer, location,
  // category}. Both render through the same template; only real items ever
  // get an <img> — the fallback placeholder sits behind it always, so a
  // failed image load just reveals the honest placeholder instead of a
  // broken-image icon or a layout break.
  function discoverCardTemplate(item) {
    const initials = (item.title.match(/[A-Za-z]/g) || []).slice(0, 2).join("");
    const hasImage = isUrl(item.imageUrl);
    const metaHtml = item.designer
      ? `<p class="discover-meta">${escapeHtml(item.designer)} · ${escapeHtml(item.location)}</p>`
      : `<p class="discover-meta">${escapeHtml(item.summary || "")}</p>`;
    const sourceHtml = isUrl(item.source)
      ? `<a class="source-link" href="${escapeHtml(item.source)}" target="_blank" rel="noopener">Source</a>`
      : "";
    return `
      <article class="discover-card">
        <div class="discover-visual-wrap">
          <div class="discover-visual" aria-hidden="true">${escapeHtml(initials || "Dw")}</div>
          ${hasImage ? `<img class="discover-img" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ""}
        </div>
        <div class="discover-body">
          <h3>${escapeHtml(item.title)}</h3>
          ${metaHtml}
          <span class="discover-tag">${escapeHtml(item.category || "")}</span>
          ${sourceHtml}
        </div>
      </article>
    `;
  }

  async function renderDiscover() {
    const label = document.getElementById("discover-demo-label");
    const status = document.getElementById("discover-trends-status");
    status.hidden = false;
    status.textContent = "Fetching real design trends…";

    try {
      const res = await fetch("/api/trends");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Trends request failed.");
      if (body.trends && body.trends.length) {
        state.lastTrends = body.trends;
        document.getElementById("discover-masonry").innerHTML = body.trends.map(discoverCardTemplate).join("");
        label.hidden = true;
        status.hidden = true;
        return;
      }
      throw new Error("No trends returned.");
    } catch (err) {
      // Honest fallback: real trends aren't available right now (e.g. Gemini
      // overloaded, or no keys configured) — show clearly-labeled demo
      // content instead of a broken page or a fake result.
      status.hidden = false;
      status.textContent = `Couldn't load live trends right now (${err.message}). Showing prototype content instead.`;
      label.hidden = false;
    }
    document.getElementById("discover-masonry").innerHTML = loadDemoDiscoverItems().map(discoverCardTemplate).join("");
  }

  // ---------- Events: demo cards ----------

  function demoEventCardTemplate(ev) {
    return `
      <article class="card">
        <div class="card-image">🗓️<span class="card-image-placeholder-label">Prototype content</span></div>
        <div class="card-body">
          <div class="card-top"><span class="tag">${escapeHtml(ev.type)}</span></div>
          <h3 class="card-title">${escapeHtml(ev.name)}</h3>
          <p class="card-organizer">${escapeHtml(ev.organizer)}</p>
          <div class="card-meta">
            <span>Venue: ${escapeHtml(ev.venue)}</span>
            <span>Date: ${escapeHtml(ev.date)}</span>
            <span>Eligibility: ${escapeHtml(ev.eligibility)}</span>
            <span>Price: ${escapeHtml(ev.price)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderDemoEvents() {
    const items = loadDemoEvents().filter((ev) => state.eventsFilter === "all" || ev.type === state.eventsFilter);
    document.getElementById("demo-events-grid").innerHTML = items.map(demoEventCardTemplate).join("");
  }

  // ---------- Events: real agent-sourced workshop cards ----------

  function isConfirmed(value) {
    return value && value !== "unconfirmed" && value !== "Not found";
  }

  function dateTimeSummary(w) {
    const dateLabel = isConfirmed(w.date)
      ? `${escapeHtml(w.date)}${isConfirmed(w.dayOfWeek) ? ` (${escapeHtml(w.dayOfWeek)})` : ""}`
      : "Date unconfirmed";
    const timeLabel = isConfirmed(w.startTime) && isConfirmed(w.endTime)
      ? `${escapeHtml(w.startTime)}–${escapeHtml(w.endTime)}`
      : "Time TBD";
    return `${dateLabel} · ${timeLabel}`;
  }

  function calendarActionsTemplate(w) {
    if (w.approvalState === "blocked") {
      return `
        <div class="calendar-block-confirm">
          ✓ On your calendar: ${escapeHtml(w.date)} (${escapeHtml(w.dayOfWeek)}), ${escapeHtml(w.startTime)}–${escapeHtml(w.endTime)}
          <button class="btn-icon download-ics-btn" data-client-id="${w.clientId}">Download .ics again</button>
        </div>
      `;
    }
    if (w.pendingTimeConfirm) {
      return `
        <div class="time-confirm-row" data-client-id="${w.clientId}">
          <p class="time-confirm-note">Confirm the exact date and time before blocking your calendar — Design World won't guess these.</p>
          <label>Date <input type="date" class="confirm-date" value="${isConfirmed(w.date) ? escapeHtml(w.date) : ""}" required /></label>
          <label>Start <input type="time" class="confirm-start-time" value="${isConfirmed(w.startTime) ? escapeHtml(w.startTime) : ""}" required /></label>
          <label>End <input type="time" class="confirm-end-time" value="${isConfirmed(w.endTime) ? escapeHtml(w.endTime) : ""}" required /></label>
          <button class="btn btn-accent confirm-block-btn" data-client-id="${w.clientId}">Confirm &amp; block</button>
        </div>
      `;
    }
    return `<button class="btn btn-secondary add-to-calendar-btn" data-client-id="${w.clientId}">Add to Calendar</button>`;
  }

  function workshopCardTemplate(w) {
    const saved = state.saved.includes(w.clientId);
    const hasImage = isUrl(w.imageUrl);
    return `
      <article class="card" data-client-id="${w.clientId}">
        <div class="card-image">
          🛠️
          <span class="card-image-placeholder-label">${hasImage ? "Loading real image…" : "No verified image — placeholder"}</span>
          ${hasImage ? `<img class="card-photo" src="${escapeHtml(w.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none';this.previousElementSibling.textContent='No verified image — placeholder';" />` : ""}
          <button class="card-save-icon save-btn" data-client-id="${w.clientId}" aria-pressed="${saved}" aria-label="${saved ? "Unsave" : "Save"} ${escapeHtml(w.name)}">${saved ? "★" : "☆"}</button>
        </div>
        <div class="card-body">
          <div class="card-top">
            <span class="tag">Workshop</span>
            ${verificationBadge(w.verificationStatus)}
          </div>
          <h3 class="card-title">${escapeHtml(w.name)}</h3>
          <p class="card-organizer">${escapeHtml(w.organizer)}</p>
          <div class="card-meta">
            <span>Venue: ${escapeHtml(w.venue)}</span>
            <span>Pune</span>
            <span>${dateTimeSummary(w)}</span>
            <span>Eligibility: ${escapeHtml(w.eligibility)}</span>
          </div>
          ${applicationStatusTemplate(w)}
          <div class="card-actions">
            <button class="btn btn-secondary view-workshop-btn" data-client-id="${w.clientId}">View details</button>
            ${!w.applicationStatus ? `<button class="btn btn-accent apply-btn" data-client-id="${w.clientId}">Apply</button>` : ""}
          </div>
          <div class="calendar-actions">${calendarActionsTemplate(w)}</div>
        </div>
      </article>
    `;
  }

  // Real status from the actual Workshop Application Preparation & Approval
  // skill run — never "Submitted" here, since no real form-submission path
  // exists in this prototype. "Needs your approval" / "Approved" are the two
  // honest end states; clicking either reopens the real review modal.
  function applicationStatusTemplate(w) {
    if (!w.applicationStatus) return "";
    const map = {
      preparing: { text: "Preparing your application…", cls: "status-preparing" },
      needs_approval: { text: "⚠ Needs your approval", cls: "status-needs-input" },
      approved: { text: "✓ Approved", cls: "status-ready" },
      error: { text: w.applicationError || "Application preparation failed", cls: "status-error" },
    };
    const entry = map[w.applicationStatus];
    const clickable = w.applicationStatus === "needs_approval" || w.applicationStatus === "approved";
    return `
      <button class="registration-status-btn ${entry.cls}" data-client-id="${w.clientId}" ${clickable ? "" : "disabled"}>
        ${entry.text}
      </button>
    `;
  }

  function renderAgentWorkshops() {
    const grid = document.getElementById("agent-workshops-grid");
    const empty = document.getElementById("agent-workshops-empty");
    const visible = state.agentWorkshops.filter((w) => w.approvalState !== "rejected");
    grid.innerHTML = visible.map(workshopCardTemplate).join("");
    empty.hidden = visible.length > 0;
  }

  // ---------- calendar block (independent of applying) ----------

  function handleAddToCalendar(clientId) {
    const w = findWorkshopByClientId(clientId);
    if (!w) return;
    if (isConfirmed(w.date) && isConfirmed(w.startTime) && isConfirmed(w.endTime)) {
      blockWorkshopCalendar(w);
    } else {
      w.pendingTimeConfirm = true;
      refreshAllWorkshopGrids();
    }
  }

  // ---------- apply (Workshop Application Preparation & Approval skill) ----------

  function upsertApplication(w, application, status) {
    const entry = {
      clientId: w.clientId,
      workshop: w,
      application,
      status,
      preparedAt: new Date().toISOString(),
    };
    const i = state.applications.findIndex((a) => a.clientId === w.clientId);
    if (i === -1) state.applications.unshift(entry);
    else state.applications[i] = entry;
    persistApplications();
  }

  async function handleApply(clientId) {
    const w = findWorkshopByClientId(clientId);
    if (!w) return;
    w.applicationStatus = "preparing";
    refreshAllWorkshopGrids();
    try {
      const res = await fetch("/api/workshops/application/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshop: w, userProfile: profileForSkill() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Application preparation failed.");
      w.applicationStatus = "needs_approval";
      // Every freshly prepared application lands in "Needs your approval" —
      // it never skips straight to approved; only an explicit click on
      // Approve & Submit in the review modal can move it there.
      upsertApplication(w, body.application, "needs_approval");
      refreshAllWorkshopGrids();
      renderApplicationsPage();
      state.currentApplication = { workshop: w, application: body.application };
      renderApplicationModal();
      document.getElementById("workshop-modal").hidden = true;
      document.getElementById("application-modal").hidden = false;
    } catch (err) {
      w.applicationStatus = "error";
      w.applicationError = err.message;
      refreshAllWorkshopGrids();
    }
  }

  function handleConfirmAndBlock(clientId, date, startTime, endTime) {
    const w = findWorkshopByClientId(clientId);
    if (!w) return;
    if (!date || !startTime || !endTime) return; // required attributes should prevent this, but never block on a guess
    w.date = date;
    w.dayOfWeek = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });
    w.startTime = startTime;
    w.endTime = endTime;
    w.pendingTimeConfirm = false;
    blockWorkshopCalendar(w);
  }

  function triggerIcsDownload(icsText, filename) {
    const blob = new Blob([icsText], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "workshop.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function blockWorkshopCalendar(w) {
    try {
      const res = await fetch("/api/workshops/calendar/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshop: w }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't block this time on your calendar.");

      w.approvalState = "blocked";
      w.icsContent = body.ics;
      w.icsFilename = body.filename;
      state.blockedCalendar.unshift({
        clientId: w.clientId,
        name: w.name,
        organizer: w.organizer,
        venue: w.venue,
        eligibility: w.eligibility,
        registrationUrl: w.registrationUrl,
        sourceUrls: w.sourceUrls || [],
        verificationStatus: w.verificationStatus,
        date: body.confirmed.date,
        dayOfWeek: body.confirmed.dayOfWeek,
        startTime: body.confirmed.startTime,
        endTime: body.confirmed.endTime,
        ics: body.ics,
        filename: body.filename,
      });
      persistBlockedCalendar();
      triggerIcsDownload(body.ics, body.filename);
      refreshAllWorkshopGrids();
      renderBlockedCalendar();
    } catch (err) {
      alert(err.message); // simple, honest surface for a real backend error — no fake success
    }
  }

  function downloadWorkshopIcs(clientId) {
    const w = findWorkshopByClientId(clientId);
    if (w && w.icsContent) triggerIcsDownload(w.icsContent, w.icsFilename);
  }

  function blockedCalendarItemTemplate(item) {
    return `
      <div class="blocked-calendar-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="discover-meta">${escapeHtml(item.date)} (${escapeHtml(item.dayOfWeek)}), ${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}</div>
        </div>
        <button class="btn-icon redownload-ics-btn" data-filename="${escapeHtml(item.filename)}">Download .ics</button>
      </div>
    `;
  }

  function renderBlockedCalendar() {
    const container = document.getElementById("blocked-calendar-list");
    const empty = document.getElementById("blocked-calendar-empty");
    if (!container) return;
    container.innerHTML = state.blockedCalendar.map(blockedCalendarItemTemplate).join("");
    if (empty) empty.hidden = state.blockedCalendar.length > 0;
  }

  // ---------- Applications page ----------

  function applicationItemTemplate(entry, actionLabel) {
    return `
      <div class="blocked-calendar-item">
        <div>
          <strong>${escapeHtml(entry.workshop.name)}</strong>
          <div class="discover-meta">${escapeHtml(entry.workshop.organizer || "")}</div>
        </div>
        <button class="btn-icon reopen-application-btn" data-client-id="${escapeHtml(entry.clientId)}">${actionLabel}</button>
      </div>
    `;
  }

  function renderApplicationsPage() {
    const needsApproval = state.applications.filter((a) => a.status === "needs_approval");
    const approved = state.applications.filter((a) => a.status === "approved");
    // "Draft" has no real source in this prototype yet — no application-saving
    // flow exists that isn't already either prepared (needs_approval) or
    // approved, so this stays honestly empty rather than showing invented
    // placeholder drafts.
    const draft = [];

    const fill = (listId, emptyId, items, label) => {
      const list = document.getElementById(listId);
      const empty = document.getElementById(emptyId);
      if (!list) return;
      list.innerHTML = items.map((e) => applicationItemTemplate(e, label)).join("");
      if (empty) empty.hidden = items.length > 0;
    };

    fill("applications-needs-approval-list", "applications-needs-approval-empty", needsApproval, "Review");
    fill("applications-approved-list", "applications-approved-empty", approved, "View");
    fill("applications-draft-list", "applications-draft-empty", draft, "Continue");
  }

  // ---------- Calendar tab (in-app, built from state.blockedCalendar) ----------

  const CAL_MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function renderCalendarPage() {
    const year = state.calendarViewDate.getFullYear();
    const month = state.calendarViewDate.getMonth();
    document.getElementById("cal-month-label").textContent = `${CAL_MONTH_NAMES[month]} ${year}`;

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById("calendar-grid");
    let html = "";

    for (let i = 0; i < firstWeekday; i++) html += `<div class="cal-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayItems = state.blockedCalendar.filter((item) => item.date === iso);
      const selected = state.calendarSelectedDay === iso;
      html += `
        <div class="cal-day ${dayItems.length ? "has-entries" : ""} ${selected ? "selected" : ""}" data-date="${iso}">
          <span>${day}</span>
          ${dayItems.length ? `<span class="dots"><span class="dot dot-event"></span></span>` : ""}
        </div>
      `;
    }
    grid.innerHTML = html;
    renderCalendarDayPanel();
  }

  function renderCalendarDayPanel() {
    const panel = document.getElementById("calendar-day-panel");
    if (!state.calendarSelectedDay) {
      panel.innerHTML = `<h3>Select a date</h3><p class="empty-state">Click a highlighted day to see what's blocked.</p>`;
      return;
    }
    const items = state.blockedCalendar.filter((item) => item.date === state.calendarSelectedDay);
    if (!items.length) {
      panel.innerHTML = `<h3>${escapeHtml(state.calendarSelectedDay)}</h3><p class="empty-state">Nothing blocked on this day.</p>`;
      return;
    }
    panel.innerHTML = `
      <h3>${escapeHtml(state.calendarSelectedDay)}</h3>
      ${items
        .map(
          (item) => `
        <div class="day-panel-item" data-filename="${escapeHtml(item.filename)}">
          <h4>${escapeHtml(item.name)}</h4>
          <p>${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)} · ${escapeHtml(item.venue || "")}</p>
        </div>
      `
        )
        .join("")}
    `;
  }

  function openBlockedItemDetail(filename) {
    const item = state.blockedCalendar.find((b) => b.filename === filename);
    if (!item) return;
    const sources = (item.sourceUrls || []).filter(isUrl);
    document.getElementById("workshop-modal-body").innerHTML = `
      <div class="card-top">
        <span class="tag">Workshop</span>
        ${verificationBadge(item.verificationStatus)}
      </div>
      <h2>${escapeHtml(item.name)}</h2>
      <dl>
        <div class="modal-detail-row"><dt>Organizer</dt><dd>${escapeHtml(item.organizer || "Not found")}</dd></div>
        <div class="modal-detail-row"><dt>Venue</dt><dd>${escapeHtml(item.venue || "Not found")}</dd></div>
        <div class="modal-detail-row"><dt>Date</dt><dd>${escapeHtml(item.date)} (${escapeHtml(item.dayOfWeek)})</dd></div>
        <div class="modal-detail-row"><dt>Time</dt><dd>${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}</dd></div>
        <div class="modal-detail-row"><dt>Eligibility</dt><dd>${escapeHtml(item.eligibility || "Not found")}</dd></div>
        <div class="modal-detail-row"><dt>Registration</dt><dd>${isUrl(item.registrationUrl) ? `<a href="${escapeHtml(item.registrationUrl)}" target="_blank" rel="noopener">Official page</a>` : "Not found"}</dd></div>
      </dl>
      ${sources.length ? `<p><strong>Sources:</strong> ${sources.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`).join(", ")}</p>` : ""}
      <div class="modal-actions">
        <button class="btn-icon redownload-ics-btn" data-filename="${escapeHtml(item.filename)}">Download .ics again</button>
      </div>
    `;
    document.getElementById("workshop-modal").hidden = false;
  }

  // ---------- Saved ----------

  function findWorkshopByClientId(clientId) {
    return state.agentWorkshops.find((w) => w.clientId === clientId);
  }

  function renderSaved() {
    const items = state.saved.map(findWorkshopByClientId).filter(Boolean);
    document.getElementById("saved-grid").innerHTML = items.map(workshopCardTemplate).join("");
    document.getElementById("saved-empty").hidden = items.length > 0;
  }

  function toggleSaved(clientId) {
    const i = state.saved.indexOf(clientId);
    if (i === -1) state.saved.push(clientId);
    else state.saved.splice(i, 1);
    persistSaved();
    renderAgentWorkshops();
    renderSaved();
  }

  // ---------- Search (real loaded data first, demo content as extra context) ----------

  let lastSearchQuery = "";

  function renderSearch(query) {
    lastSearchQuery = query;
    const grid = document.getElementById("search-results-grid");
    const empty = document.getElementById("search-empty");
    const agentCta = document.getElementById("search-agent-cta");
    if (!query) {
      grid.innerHTML = "";
      empty.hidden = true;
      agentCta.hidden = true;
      return;
    }
    const q = query.toLowerCase();

    // Real data first: actual agent-verified workshops and actual loaded trends.
    const realWorkshopMatches = state.agentWorkshops.filter(
      (w) => w.approvalState !== "rejected" && `${w.name} ${w.organizer} ${w.venue}`.toLowerCase().includes(q)
    );
    const realTrendMatches = state.lastTrends.filter((t) => `${t.title} ${t.summary} ${t.category}`.toLowerCase().includes(q));

    // Labeled demo content, so Search still feels populated before any real
    // agent/trends call has happened this session — never presented as real.
    const discoverMatches = loadDemoDiscoverItems().filter((i) => `${i.title} ${i.designer} ${i.category}`.toLowerCase().includes(q));
    const eventMatches = loadDemoEvents().filter((e) => `${e.name} ${e.organizer}`.toLowerCase().includes(q));

    grid.innerHTML =
      realWorkshopMatches.map(workshopCardTemplate).join("") +
      realTrendMatches.map(discoverCardTemplate).join("") +
      discoverMatches.map(discoverCardTemplate).join("") +
      eventMatches.map(demoEventCardTemplate).join("");

    const totalMatches = realWorkshopMatches.length + realTrendMatches.length + discoverMatches.length + eventMatches.length;
    empty.hidden = totalMatches > 0;
    agentCta.hidden = false; // always offer a live search, since what's loaded is necessarily incomplete
  }

  // ---------- Profile ----------

  function renderProfileFields() {
    const form = document.getElementById("profile-form");
    ["name", "email", "phone", "college", "course", "year", "portfolio"].forEach((key) => {
      const input = form.elements[key];
      if (input) input.value = state.profile[key] || "";
    });
    // File inputs can't be set programmatically — just show what's already attached.
    const note = document.getElementById("profile-file-note");
    if (state.profile.portfolioFileName) {
      note.hidden = false;
      note.classList.remove("agent-status-error");
      note.textContent = `"${state.profile.portfolioFileName}" is attached to your profile.`;
    }
  }

  function renderInterestTilesInto(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const interests = state.profile.interests || [];
    container.innerHTML = DESIGN_INTERESTS.map(
      (item) => `
        <button type="button" class="tile ${interests.includes(item.id) ? "selected" : ""}" data-id="${item.id}">${escapeHtml(item.label)}</button>
      `
    ).join("");
  }

  function toggleProfileInterest(id) {
    const interests = state.profile.interests || [];
    const i = interests.indexOf(id);
    if (i === -1) interests.push(id);
    else interests.splice(i, 1);
    state.profile.interests = interests;
    persistProfile();
    renderInterestTilesInto("profile-interest-tiles");
    renderInterestTilesInto("onboarding-interest-tiles");
  }

  function renderProfileInterestTiles() {
    renderInterestTilesInto("profile-interest-tiles");
  }

  // Only called once, on init — must never be called after the form has
  // unsaved user input (e.g. from a tile click), or it will silently wipe
  // whatever the user just typed but hadn't submitted yet.
  function renderProfileForm() {
    renderProfileFields();
    renderProfileInterestTiles();
  }

  // ---------- workshop detail modal ----------

  function openWorkshopModal(clientId) {
    const w = findWorkshopByClientId(clientId);
    if (!w) return;
    const saved = state.saved.includes(clientId);
    const sources = (w.sourceUrls || []).filter(isUrl);

    document.getElementById("workshop-modal-body").innerHTML = `
      <div class="card-top">
        <span class="tag">Workshop</span>
        ${verificationBadge(w.verificationStatus)}
      </div>
      <h2>${escapeHtml(w.name)}</h2>
      <dl>
        <div class="modal-detail-row"><dt>Organizer</dt><dd>${escapeHtml(w.organizer)}</dd></div>
        <div class="modal-detail-row"><dt>Venue</dt><dd>${escapeHtml(w.venue)}</dd></div>
        <div class="modal-detail-row"><dt>Location</dt><dd>Pune</dd></div>
        <div class="modal-detail-row"><dt>Date</dt><dd>${escapeHtml(w.date)}</dd></div>
        <div class="modal-detail-row"><dt>Time</dt><dd>${escapeHtml(w.time)}</dd></div>
        <div class="modal-detail-row"><dt>Eligibility</dt><dd>${escapeHtml(w.eligibility)}</dd></div>
        <div class="modal-detail-row"><dt>Price</dt><dd>${escapeHtml(w.price)}</dd></div>
        <div class="modal-detail-row"><dt>Registration deadline</dt><dd>${escapeHtml(w.registrationDeadline)}</dd></div>
        <div class="modal-detail-row"><dt>Registration</dt><dd>${isUrl(w.registrationUrl) ? `<a href="${escapeHtml(w.registrationUrl)}" target="_blank" rel="noopener">Official page</a>` : "Not found"}</dd></div>
      </dl>
      ${sources.length ? `<p><strong>Sources:</strong> ${sources.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`).join(", ")}</p>` : ""}
      ${w.verificationNotes ? `<p><strong>Verification notes:</strong> ${escapeHtml(w.verificationNotes)}</p>` : ""}
      ${w.checkedAt ? `<p class="last-checked-note">Last checked: ${new Date(w.checkedAt).toLocaleString()}</p>` : ""}
      <div class="modal-actions">
        <button class="btn-icon save-btn" data-client-id="${w.clientId}" aria-pressed="${saved}">${saved ? "★ Saved" : "☆ Save"}</button>
        <button class="btn btn-secondary add-to-calendar-btn" data-client-id="${w.clientId}">Add to Calendar</button>
        ${!w.applicationStatus ? `<button class="btn btn-accent apply-btn" data-client-id="${w.clientId}">Apply</button>` : applicationStatusTemplate(w)}
      </div>
    `;
    document.getElementById("workshop-modal").hidden = false;
  }

  // ---------- application review + approval gate ----------

  function fieldRowTemplate(field) {
    const isFilled = field.status === "filled";
    const chip = isFilled
      ? `<span class="field-status-chip filled">✓ Filled</span>`
      : `<span class="field-status-chip needs-input">Needs your input</span>`;
    const valueHtml = isFilled
      ? escapeHtml(field.value || "")
      : `<input type="text" data-field-key="${field.key}" placeholder="Enter ${escapeHtml(field.label.toLowerCase())}" />`;
    return `
      <div class="application-field-row" data-field-key="${field.key}">
        <span class="field-label">${escapeHtml(field.label)}</span>
        <span class="field-value">${valueHtml}${chip}</span>
      </div>
    `;
  }

  function renderApplicationModal() {
    const { workshop, application } = state.currentApplication;
    const hasMissing = application.fields.some((f) => f.status === "needs_input");

    const manualBanner = application.requiresManualAction
      ? `<div class="manual-action-banner">
           <strong>Your action is required to continue.</strong>
           <p style="margin:6px 0 0;">This registration involves something Design World won't automate:</p>
           <ul>${application.manualActionReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
           <p style="margin:8px 0 0;">Please complete this step yourself at the
             ${isUrl(workshop.registrationUrl) ? `<a href="${escapeHtml(workshop.registrationUrl)}" target="_blank" rel="noopener">official registration page</a>` : "official registration page"}.</p>
         </div>`
      : "";

    document.getElementById("application-modal-body").innerHTML = `
      <h2>Application review</h2>
      <p class="section-sub">Workshop: <strong>${escapeHtml(workshop.name)}</strong></p>
      ${manualBanner}
      <div id="application-fields">${application.fields.map(fieldRowTemplate).join("")}</div>
      ${!application.requiresManualAction ? `
        <div class="approval-confirm" id="approval-confirm" hidden>
          Review your application before submission. This cannot be undone once you click Approve &amp; Submit.
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="application-edit-btn">Edit</button>
          <button class="btn btn-accent" id="application-approve-btn" ${hasMissing ? "disabled" : ""}>Approve &amp; Submit</button>
        </div>
        ${hasMissing ? `<p class="agent-status" style="margin-top:12px;">Fill in the fields marked "Needs your input" above to enable submission.</p>` : ""}
      ` : ""}
      <p class="agent-status" id="application-result" hidden></p>
    `;

    document.querySelectorAll("#application-fields input[data-field-key]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const key = e.target.dataset.fieldKey;
        const field = application.fields.find((f) => f.key === key);
        field.value = e.target.value;
        field.status = e.target.value.trim() ? "filled" : "needs_input";
        field.source = e.target.value.trim() ? "user_provided_now" : null;
        renderApplicationModal();
      });
    });

    const approveBtn = document.getElementById("application-approve-btn");
    if (approveBtn) {
      approveBtn.addEventListener("click", () => {
        document.getElementById("approval-confirm").hidden = false;
        approveBtn.textContent = "Confirm Approve & Submit";
        approveBtn.onclick = submitApplication;
      });
    }
  }

  // Reopens an application that was already prepared (from the card's status
  // button, or the Applications page) using the stored snapshot — never
  // re-calls the Skill/Gemini just to redisplay something already prepared.
  function reopenApplication(clientId) {
    const entry = state.applications.find((a) => a.clientId === clientId);
    if (!entry) return handleApply(clientId); // nothing stored yet — prepare it for real
    document.getElementById("workshop-modal").hidden = true;
    state.currentApplication = { workshop: entry.workshop, application: entry.application };
    renderApplicationModal();
    document.getElementById("application-modal").hidden = false;
  }

  async function submitApplication() {
    const { workshop, application } = state.currentApplication;
    const resultEl = document.getElementById("application-result");
    try {
      const res = await fetch("/api/workshops/application/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshop, approved: true }),
      });
      const body = await res.json();
      resultEl.hidden = false;
      if (!res.ok) {
        resultEl.classList.add("agent-status-error");
        resultEl.textContent = body.error || "Submission could not be completed.";
        return;
      }
      resultEl.textContent = `${body.message} Registration link: ${body.registrationUrl}`;

      // Honest state transition: "approved" means the user approved and the
      // registration link is ready — not that an external form was actually
      // submitted, since no real submission mechanism exists here.
      const liveWorkshop = findWorkshopByClientId(workshop.clientId);
      if (liveWorkshop) liveWorkshop.applicationStatus = "approved";
      upsertApplication(workshop, application, "approved");
      refreshAllWorkshopGrids();
      renderApplicationsPage();
    } catch (err) {
      resultEl.hidden = false;
      resultEl.classList.add("agent-status-error");
      resultEl.textContent = "Couldn't reach the server to submit.";
    }
  }

  // ---------- Ask Design World ----------

  function renderAgentSteps() {
    document.getElementById("agent-steps").innerHTML = AGENT_STEPS.map(
      (s) => `<div class="agent-step" data-step-key="${s.key}"><span class="step-dot"></span><span class="step-label">${escapeHtml(s.label)}</span></div>`
    ).join("");
  }
  function updateAgentStep(key, status) {
    const el = document.querySelector(`.agent-step[data-step-key="${key}"]`);
    if (!el) return;
    el.classList.remove("in-progress", "completed");
    if (status === "in_progress") el.classList.add("in-progress");
    if (status === "completed") el.classList.add("completed");
  }
  function setAskStatus(message, isError) {
    const el = document.getElementById("ask-status");
    el.hidden = !message;
    el.textContent = message || "";
    el.classList.toggle("agent-status-error", Boolean(isError));
  }
  function setAskSubmitting(submitting) {
    document.querySelector("#ask-form button[type='submit']").disabled = submitting;
    document.getElementById("ask-input").disabled = submitting;
  }

  function openAskModal(prefill) {
    document.getElementById("ask-modal").hidden = false;
    setAskStatus("");
    document.getElementById("ask-results").hidden = true;
    document.getElementById("ask-input").value = prefill || "";
    renderAgentSteps();
  }
  function closeAskModal() {
    document.getElementById("ask-modal").hidden = true;
  }

  function handleAgentEvent(evt) {
    if (evt.type === "agent_step") {
      updateAgentStep(evt.stage, evt.status);
      if (evt.message) setAskStatus(evt.message);
      return;
    }
    if (evt.type === "mcp_call") {
      console.log("[design-world] mcp_call", evt);
      return;
    }
    if (evt.type === "error") {
      setAskStatus(evt.message, true);
      setAskSubmitting(false);
      return;
    }
    if (evt.type === "result") {
      setAskSubmitting(false);
      if (evt.status === "no_results" || !evt.workshops.length) {
        setAskStatus(evt.message || "No verified Pune workshops were found for this request.", true);
        return;
      }
      const withIds = evt.workshops.map((w) => ({ ...w, clientId: nextClientId() }));
      state.agentWorkshops = withIds.concat(state.agentWorkshops);
      state.lastSearchClientIds = withIds.map((w) => w.clientId);
      renderAgentWorkshops();
      renderAskResultsGrid();
      setAskStatus(`Ready — ${withIds.length} verified Pune workshop(s) found.`);
      document.getElementById("ask-results").hidden = false;
    }
  }

  function renderAskResultsGrid() {
    const grid = document.getElementById("ask-results-grid");
    if (!grid || !state.lastSearchClientIds.length) return;
    const items = state.lastSearchClientIds.map(findWorkshopByClientId).filter((w) => w && w.approvalState !== "rejected");
    grid.innerHTML = items.map(workshopCardTemplate).join("");
  }

  // Re-renders every grid that might contain workshop cards, after any
  // approve/reject/calendar-block action changes shared state.
  function refreshAllWorkshopGrids() {
    renderAgentWorkshops();
    renderAskResultsGrid();
    renderSaved();
    renderBlockedCalendar();
    renderCalendarPage();
  }

  async function submitAskRequest(query) {
    setAskSubmitting(true);
    setAskStatus("");
    renderAgentSteps();

    let res;
    try {
      res = await fetch("/api/workshops/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    } catch (err) {
      setAskStatus("Couldn't reach the Design World agent backend. Is the server running (npm start)?", true);
      setAskSubmitting(false);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAskStatus(body.error || "The agent backend rejected this request.", true);
      setAskSubmitting(false);
      return;
    }
    const { id } = await res.json();
    const source = new EventSource(`/api/workshops/search/${id}/events`);
    source.onmessage = (msg) => {
      const evt = JSON.parse(msg.data);
      handleAgentEvent(evt);
      if (evt.type === "result" || evt.type === "error") source.close();
    };
    source.onerror = () => source.close();
  }

  // ---------- navigation ----------

  function showSection(name) {
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === name));
    document.querySelectorAll(".nav-link").forEach((btn) => btn.classList.toggle("active", btn.dataset.section === name));
  }

  // ---------- events ----------

  function attachEvents() {
    document.getElementById("main-nav").addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (btn) showSection(btn.dataset.section);
    });

    document.getElementById("ask-header-btn").addEventListener("click", () => openAskModal());
    document.getElementById("ask-modal-close").addEventListener("click", closeAskModal);
    document.getElementById("ask-modal").addEventListener("click", (e) => {
      if (e.target.id === "ask-modal") closeAskModal();
    });
    document.querySelectorAll(".suggested-prompt").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("ask-input").value = btn.textContent;
      });
    });
    document.getElementById("ask-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const query = document.getElementById("ask-input").value.trim();
      if (query) submitAskRequest(query);
    });

    document.getElementById("events-filters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.eventsFilter = chip.dataset.filter;
      document.querySelectorAll("#events-filters .chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderDemoEvents();
    });

    document.getElementById("global-search-input").addEventListener("input", (e) => renderSearch(e.target.value.trim()));
    document.getElementById("search-ask-agent-btn").addEventListener("click", () => {
      openAskModal(lastSearchQuery);
    });

    document.body.addEventListener("click", (e) => {
      const saveBtn = e.target.closest(".save-btn");
      if (saveBtn) {
        toggleSaved(saveBtn.dataset.clientId);
        return;
      }
      const viewBtn = e.target.closest(".view-workshop-btn");
      if (viewBtn) {
        openWorkshopModal(viewBtn.dataset.clientId);
        return;
      }
      const applyBtn = e.target.closest(".apply-btn");
      if (applyBtn) {
        handleApply(applyBtn.dataset.clientId);
        return;
      }
      const regStatusBtn = e.target.closest(".registration-status-btn:not([disabled])");
      if (regStatusBtn) {
        reopenApplication(regStatusBtn.dataset.clientId);
        return;
      }
      const addToCalendarBtn = e.target.closest(".add-to-calendar-btn");
      if (addToCalendarBtn) {
        handleAddToCalendar(addToCalendarBtn.dataset.clientId);
        return;
      }
      const confirmBlockBtn = e.target.closest(".confirm-block-btn");
      if (confirmBlockBtn) {
        const row = confirmBlockBtn.closest(".time-confirm-row");
        const date = row.querySelector(".confirm-date").value;
        const startTime = row.querySelector(".confirm-start-time").value;
        const endTime = row.querySelector(".confirm-end-time").value;
        handleConfirmAndBlock(confirmBlockBtn.dataset.clientId, date, startTime, endTime);
        return;
      }
      const downloadBtn = e.target.closest(".download-ics-btn");
      if (downloadBtn) {
        downloadWorkshopIcs(downloadBtn.dataset.clientId);
        return;
      }
      const reopenAppBtn = e.target.closest(".reopen-application-btn");
      if (reopenAppBtn) {
        reopenApplication(reopenAppBtn.dataset.clientId);
        return;
      }
      const redownloadBtn = e.target.closest(".redownload-ics-btn");
      if (redownloadBtn) {
        const item = state.blockedCalendar.find((b) => b.filename === redownloadBtn.dataset.filename);
        if (item) triggerIcsDownload(item.ics, item.filename);
        return;
      }
      const calDay = e.target.closest("#calendar-grid .cal-day.has-entries");
      if (calDay) {
        state.calendarSelectedDay = calDay.dataset.date;
        renderCalendarPage();
        return;
      }
      const calDayPanelItem = e.target.closest("#calendar-day-panel .day-panel-item");
      if (calDayPanelItem) {
        openBlockedItemDetail(calDayPanelItem.dataset.filename);
        return;
      }
    });

    document.getElementById("cal-prev").addEventListener("click", () => {
      state.calendarViewDate.setMonth(state.calendarViewDate.getMonth() - 1);
      state.calendarSelectedDay = null;
      renderCalendarPage();
    });
    document.getElementById("cal-next").addEventListener("click", () => {
      state.calendarViewDate.setMonth(state.calendarViewDate.getMonth() + 1);
      state.calendarSelectedDay = null;
      renderCalendarPage();
    });

    document.getElementById("workshop-modal-close").addEventListener("click", () => {
      document.getElementById("workshop-modal").hidden = true;
    });
    document.getElementById("workshop-modal").addEventListener("click", (e) => {
      if (e.target.id === "workshop-modal") document.getElementById("workshop-modal").hidden = true;
    });
    document.getElementById("application-modal-close").addEventListener("click", () => {
      document.getElementById("application-modal").hidden = true;
    });
    document.getElementById("application-modal").addEventListener("click", (e) => {
      if (e.target.id === "application-modal") document.getElementById("application-modal").hidden = true;
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closeAskModal();
      document.getElementById("workshop-modal").hidden = true;
      document.getElementById("application-modal").hidden = true;
    });

    document.getElementById("profile-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      ["name", "email", "phone", "college", "course", "year", "portfolio"].forEach((key) => {
        state.profile[key] = form.elements[key].value.trim();
      });
      persistProfile();
      const note = document.getElementById("profile-saved-note");
      note.hidden = false;
      setTimeout(() => (note.hidden = true), 2000);
    });
    document.getElementById("profile-interest-tiles").addEventListener("click", (e) => {
      const tile = e.target.closest(".tile");
      if (tile) toggleProfileInterest(tile.dataset.id);
    });
    document.getElementById("onboarding-interest-tiles").addEventListener("click", (e) => {
      const tile = e.target.closest(".tile");
      if (tile) toggleProfileInterest(tile.dataset.id);
    });

    document.getElementById("profile-portfolio-file").addEventListener("change", (e) => handlePortfolioFile(e, "profile-file-note"));
    document.getElementById("onboarding-portfolio-file").addEventListener("change", (e) => handlePortfolioFile(e, "onboarding-file-note"));

    document.getElementById("onboarding-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      state.profile.name = form.elements.name.value.trim();
      state.profile.email = form.elements.email.value.trim();
      if (form.elements.portfolio.value.trim()) state.profile.portfolio = form.elements.portfolio.value.trim();
      persistProfile();
      completeOnboarding();
    });
    document.getElementById("onboarding-skip").addEventListener("click", () => {
      completeOnboarding();
    });
  }

  // ---------- onboarding ----------

  function completeOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    document.getElementById("onboarding-overlay").hidden = true;
    renderProfileForm(); // reflect whatever was captured during onboarding
  }

  function handlePortfolioFile(e, noteId) {
    const file = e.target.files[0];
    const note = document.getElementById(noteId);
    if (!file) return;
    if (file.size > MAX_PORTFOLIO_FILE_BYTES) {
      note.hidden = false;
      note.textContent = `"${file.name}" is too large to store locally (max 3MB). Use a Portfolio URL instead, or choose a smaller file.`;
      note.classList.add("agent-status-error");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.profile.portfolioFileName = file.name;
      state.profile.portfolioFileDataUrl = reader.result; // the user's actual file, stored locally in their browser only
      persistProfile();
      note.hidden = false;
      note.classList.remove("agent-status-error");
      note.textContent = `"${file.name}" attached to your profile (stored locally in your browser).`;
    };
    reader.onerror = () => {
      note.hidden = false;
      note.classList.add("agent-status-error");
      note.textContent = "Couldn't read that file. Try a different one, or use a Portfolio URL instead.";
    };
    reader.readAsDataURL(file);
  }

  // ---------- init ----------

  function init() {
    attachEvents();
    renderInterestTilesInto("onboarding-interest-tiles");
    if (localStorage.getItem(ONBOARDING_KEY) !== "true") {
      document.getElementById("onboarding-overlay").hidden = false;
    }
    renderDiscover();
    renderDemoEvents();
    renderAgentWorkshops();
    renderSaved();
    renderProfileForm();
    renderBlockedCalendar();
    renderCalendarPage();
    renderApplicationsPage();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
