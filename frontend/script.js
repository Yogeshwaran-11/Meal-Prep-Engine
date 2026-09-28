/**
 * Interactive Recipe & Meal-Prep Engine
 * Frontend Controller & API Client
 */

const TOKEN_KEY = "mealprep_token";

const state = {
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  pantry: [],
  alerts: [],
  recipes: [],
  catalog: [],
  shopping: [],
  favorites: [],
  history: [],
  dashboard: null,
  reports: null,
  currentRecipe: null,
  servings: 2,
  completedSteps: new Set(),
  timerSeconds: 300,
  timerRunning: false,
  timerInterval: null,
  pantryQuery: "",
  pantrySearchTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============================================================================
// Toast & Sound Feedback
// ============================================================================

function showToast(message) {
  const toast = $("#toast");
  const msgEl = $("#toastMsg");
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function playTimerChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    // Pleasant two-tone chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.setValueAtTime(880, now + 0.15); // A5

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(659.25, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.8);
    osc2.stop(now + 0.8);
  } catch {
    // AudioContext blocked or unsupported - fail silently
  }
}

// ============================================================================
// Helpers & Formatting
// ============================================================================

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function statusLabel(status) {
  if (status === "expired") return "Expired";
  if (status === "expiring") return "Expiring Soon";
  return "Fresh / In Date";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function errorDetail(data, fallback) {
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || item).join(" ");
  }
  return typeof detail === "string" ? detail : fallback;
}

// ============================================================================
// API Client
// ============================================================================

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (response.status === 401 && !path.includes("/api/auth/login")) {
    forceLogout(errorDetail(data, "Session expired after 30 minutes of inactivity. Please sign in again."));
  }

  if (!response.ok) {
    const error = new Error(errorDetail(data, "Request failed."));
    error.status = response.status;
    throw error;
  }

  return data;
}

function forceLogout(message) {
  state.token = null;
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  $("#appShell").classList.add("hidden");
  $("#loginOverlay").classList.remove("hidden");
  if (message) showToast(message);
}

function setUser(user) {
  state.user = user;
  $("#profileName").textContent = user.display_name || user.username;
  $("#profileRole").textContent = user.role;
  $("#sidebarName").textContent = user.display_name || user.username;
  $("#sidebarRole").textContent = user.role;
  const initial = (user.display_name || user.username || "U").charAt(0).toUpperCase();
  $("#avatar").textContent = initial;
  $("#sidebarAvatar").textContent = initial;
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", user.role !== "Admin"));
}

function closeSidebar() {
  $("#sidebar")?.classList.remove("open");
  $("#sidebarBackdrop")?.classList.remove("open");
}

function navigate(sectionId) {
  if (!document.getElementById(sectionId)) return;
  if (sectionId === "admin" && state.user?.role !== "Admin") return;

  $$(".page-section").forEach((sec) => sec.classList.remove("active"));
  $(`#${sectionId}`).classList.add("active");

  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === sectionId);
  });

  const activeBtn = $(`.nav-item[data-section="${sectionId}"]`);
  $("#breadcrumb").textContent = activeBtn ? activeBtn.querySelector("span")?.textContent.trim() : "Dashboard";

  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================================
// Modal Dialog Utility
// ============================================================================

function openModal(title, innerHtml, onSubmit) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn-modal-close" type="button" aria-label="Close modal">×</button>
      </div>
      ${innerHtml}
    </div>`;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".btn-modal-close").onclick = close;
  modal.querySelector(".cancel-modal")?.addEventListener("click", close);

  const form = modal.querySelector("form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await onSubmit(form, close);
      } catch (error) {
        showToast(error.message);
      }
    });
  }
  return modal;
}

function confirmAction(message) {
  return new Promise((resolve) => {
    const modal = openModal(
      "Please Confirm",
      `<p style="color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6;">${escapeHtml(message)}</p>
       <div class="form-actions-row">
         <button type="button" class="btn-outline cancel-modal">Cancel</button>
         <button type="button" class="btn-primary" id="confirmYes">Confirm</button>
       </div>`,
      async () => {}
    );
    modal.querySelector("#confirmYes").addEventListener("click", () => {
      modal.remove();
      resolve(true);
    });
    modal.querySelector(".cancel-modal").addEventListener("click", () => resolve(false));
    modal.querySelector(".btn-modal-close").addEventListener("click", () => resolve(false));
  });
}

// ============================================================================
// Data Loading & State Management
// ============================================================================

async function loadAll() {
  const search = $("#recipeSearch")?.value.trim() || "";
  const diet = $("#dietFilter")?.value || "all";
  const maxTime = $("#timeFilter")?.value || "";
  const difficulty = $("#difficultyFilter")?.value || "all";

  const recQuery = new URLSearchParams({ search, diet, difficulty });
  if (maxTime) recQuery.set("max_time", maxTime);

  const [dashboard, pantry, alerts, recipes, catalog, shopping, favorites, history, reports] = await Promise.all([
    api("/api/dashboard"),
    api(`/api/pantry?search=${encodeURIComponent(state.pantryQuery)}`),
    api("/api/pantry/alerts"),
    api(`/api/recipes/recommendations?${recQuery.toString()}`),
    api("/api/recipes"),
    api("/api/shopping"),
    api("/api/cooking/favorites"),
    api("/api/cooking/history"),
    api("/api/reports"),
  ]);

  state.dashboard = dashboard;
  state.pantry = pantry;
  state.alerts = alerts;
  state.recipes = recipes;
  state.catalog = catalog;
  state.shopping = shopping;
  state.favorites = favorites;
  state.history = history;
  state.reports = reports;

  renderAll();
}

function renderAll() {
  renderDashboard();
  renderPantry();
  renderExpiry();
  renderRecipes();
  renderShopping();
  renderCooking();
  renderLists();
  renderReports();
  renderAdmin();
  updateTimerDisplay();
}

// ============================================================================
// Renderers
// ============================================================================

function renderDashboard() {
  const counts = state.dashboard?.counts || {};
  $("#pantryCount").textContent = counts.pantry ?? 0;
  $("#expiryCount").textContent = counts.expiring ?? 0;
  $("#recCount").textContent = counts.recommendations ?? 0;
  $("#favCount").textContent = counts.favorites ?? 0;

  // Expiry badge on sidebar
  const badge = $("#navExpiryBadge");
  if (badge) {
    if (counts.expiring > 0) {
      badge.textContent = counts.expiring;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  const alerts = state.dashboard?.alerts || [];
  $("#dashboardAlerts").innerHTML = alerts.length
    ? alerts
        .map(
          (item) => `
      <div class="stack-item">
        <div class="stack-item-main">
          <span class="stack-item-title">${escapeHtml(item.name)}</span>
          <span class="stack-item-sub">${item.quantity} ${escapeHtml(item.unit)} · Exp: ${formatDate(item.expiry_date)}</span>
        </div>
        <span class="status-badge ${item.status}">
          ${item.days_remaining < 0 ? "Expired" : `${item.days_remaining}d left`}
        </span>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>No ingredients are approaching expiry. Pantry is in good health!</p></div>`;

  const recs = state.dashboard?.recommendations || [];
  $("#dashboardRecipes").innerHTML = recs.length
    ? recs
        .map(
          (recipe) => `
      <div class="stack-item">
        <div class="stack-item-main">
          <span class="stack-item-title">${escapeHtml(recipe.name)}</span>
          <span class="stack-item-sub">${recipe.match_count} matched · ${recipe.missing_count} missing · ${recipe.cooking_time} min</span>
        </div>
        <button class="btn-subtle" data-open-recipe="${recipe.id}" type="button">Cook This</button>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>Add ingredients to your pantry to see recipe recommendations.</p></div>`;
}

function renderPantry() {
  const countBadge = $("#pantryFilterCount");
  if (countBadge) {
    countBadge.textContent = `${state.pantry.length} item${state.pantry.length === 1 ? "" : "s"}`;
  }

  $("#pantryTable").innerHTML = state.pantry.length
    ? state.pantry
        .map(
          (item) => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${item.quantity} ${escapeHtml(item.unit)}</td>
        <td>${formatDate(item.expiry_date)}</td>
        <td><span class="status-badge ${item.status}">${statusLabel(item.status)}</span></td>
        <td class="text-right">
          <div class="stack-actions" style="justify-content: flex-end;">
            <button class="btn-action" data-edit-pantry="${item.id}" type="button">Edit</button>
            <button class="btn-action danger" data-delete-pantry="${item.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5"><div class="empty-state"><p>No pantry items found matching your search.</p></div></td></tr>`;
}

function renderExpiry() {
  const alerts = state.alerts || [];
  $("#expiryGrid").innerHTML = alerts.length
    ? alerts
        .map(
          (item) => `
      <article class="expiry-card ${item.status}">
        <div class="expiry-card-top">
          <span class="expiry-item-name">${escapeHtml(item.name)}</span>
          <span class="status-badge ${item.status}">${statusLabel(item.status)}</span>
        </div>
        <div class="expiry-quantity">Stock: ${item.quantity} ${escapeHtml(item.unit)}</div>
        <div class="expiry-meta">
          <strong>${item.days_remaining < 0 ? "Expired past date" : `${item.days_remaining} days remaining`}</strong> · Expiry: ${formatDate(item.expiry_date)}
        </div>
      </article>`
        )
        .join("")
    : `<div class="panel" style="grid-column: 1 / -1;"><div class="empty-state"><p>All pantry items are fresh and well within their expiration dates.</p></div></div>`;
}

function renderRecipes() {
  $("#recipeGrid").innerHTML = state.recipes.length
    ? state.recipes
        .map((recipe) => {
          const defaultImg = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";
          const imgSrc = recipe.image_url || defaultImg;
          return `
      <article class="recipe-card">
        <div class="recipe-media-wrap">
          <img class="recipe-card-img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(recipe.name)}" onerror="this.src='${defaultImg}'">
          <span class="recipe-diet-chip">${recipe.diet === "vegetarian" ? "Vegetarian" : "Non-Veg"}</span>
        </div>
        <div class="recipe-card-body">
          <h3 class="recipe-title">${escapeHtml(recipe.name)}</h3>
          <div class="recipe-chips-row">
            <span class="chip">⏱ ${recipe.cooking_time} mins</span>
            <span class="chip">★ ${escapeHtml(recipe.difficulty)}</span>
            <span class="chip">👥 ${recipe.base_servings} servings</span>
          </div>
          <div class="recipe-pantry-match">
            <div class="match-summary">
              <span>Pantry Match:</span>
              <span>${recipe.match_count} have / ${recipe.missing_count} need</span>
            </div>
            ${
              recipe.expiring_used.length
                ? `<span class="match-expiring-tag">⚡ Uses expiring: ${escapeHtml(recipe.expiring_used.join(", "))}</span>`
                : ""
            }
          </div>
          <div class="recipe-card-footer">
            <button class="btn-primary" data-open-recipe="${recipe.id}" type="button">Cook Recipe</button>
            <button class="btn-outline" data-shop-recipe="${recipe.id}" type="button">Missing Items</button>
          </div>
        </div>
      </article>`;
        })
        .join("")
    : `<div class="panel" style="grid-column: 1 / -1;"><div class="empty-state"><p>No recipes match the selected filters. Try broadening your filter criteria.</p></div></div>`;
}

function recipeCatalog() {
  return state.catalog.length ? state.catalog : state.recipes;
}

function renderShopping() {
  const select = $("#shoppingRecipe");
  const current = select.value;
  const catalog = recipeCatalog();

  select.innerHTML = catalog
    .map((r) => `<option value="${r.id}">${escapeHtml(r.name)} (${r.cooking_time}m · ${r.diet})</option>`)
    .join("");

  if (current && [...select.options].some((opt) => opt.value === current)) {
    select.value = current;
  } else if (state.currentRecipe) {
    select.value = String(state.currentRecipe.id);
  }

  const recipe = catalog.find((item) => String(item.id) === select.value);
  const missing = recipe?.missing_ingredients || [];

  $("#missingList").innerHTML = recipe
    ? missing.length
      ? missing
          .map(
            (name) => `
        <div class="stack-item">
          <span class="stack-item-title">${escapeHtml(name)}</span>
          <span class="status-badge warning">Missing from pantry</span>
        </div>`
          )
          .join("")
      : `<div class="empty-state"><p>All ingredients for ${escapeHtml(recipe.name)} are currently in your pantry!</p></div>`
    : `<div class="empty-state"><p>No recipes available.</p></div>`;

  $("#shoppingList").innerHTML = state.shopping.length
    ? state.shopping
        .map(
          (item) => `
      <div class="shopping-item-row ${item.purchased ? "purchased" : ""}">
        <div class="shopping-item-left">
          <input type="checkbox" class="shopping-checkbox" data-toggle-shop="${item.id}" data-purchased="${item.purchased}" ${item.purchased ? "checked" : ""} aria-label="Mark ${escapeHtml(item.name)} as purchased">
          <div class="shopping-item-text">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${item.quantity} ${escapeHtml(item.unit)}${item.recipe_name ? ` · For ${escapeHtml(item.recipe_name)}` : ""}</span>
          </div>
        </div>
        <button class="btn-action danger" data-delete-shop="${item.id}" type="button" title="Remove item">Remove</button>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>Your shopping list is clear.</p></div>`;
}

function renderCooking() {
  const recipe = state.currentRecipe;
  const box = $("#cookingDetail");
  if (!recipe) {
    box.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><path d="M12 2a5 5 0 0 0-5 5v3H4a2 2 0 0 0-2 2v2a8 8 0 0 0 16 0v-2a2 2 0 0 0-2-2h-3V7a5 5 0 0 0-5-5z"></path></svg>
        <h3>No Recipe Selected</h3>
        <p>Choose a recipe from Recommendations to begin cooking with live serving adjustments and timers.</p>
      </div>`;
    return;
  }

  const isFav = recipe.favorite;
  const defaultImg = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80";

  box.innerHTML = `
    <div class="recipe-banner">
      <img class="recipe-banner-bg" src="${escapeHtml(recipe.image_url || defaultImg)}" alt="" onerror="this.src='${defaultImg}'">
      <div class="recipe-banner-overlay">
        <span class="chip" style="background: rgba(255,255,255,0.2); color:#fff; border-color: rgba(255,255,255,0.3);">${recipe.diet === "vegetarian" ? "Vegetarian" : "Non-Vegetarian"} · ${recipe.difficulty}</span>
        <h2>${escapeHtml(recipe.name)}</h2>
        <p>${escapeHtml(recipe.description || "Fresh pantry-first meal prep recipe.")}</p>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-top: 4px;">
      <div class="serving-stepper">
        <span class="serving-stepper-label">Servings:</span>
        <button class="stepper-btn" id="decreaseServing" type="button" aria-label="Decrease servings">−</button>
        <span class="serving-count" id="servingValue">${state.servings}</span>
        <button class="stepper-btn" id="increaseServing" type="button" aria-label="Increase servings">+</button>
      </div>
      <div class="stack-actions">
        <button class="btn-outline" id="favoriteBtn" type="button">
          ${isFav ? "★ Saved in Favorites" : "☆ Add to Favorites"}
        </button>
        <button class="btn-primary" id="cookedBtn" type="button">
          ✓ Mark as Cooked
        </button>
      </div>
    </div>

    <div>
      <h3 style="margin-bottom: 10px; font-size: 16px;">Required Ingredients (Scaled)</h3>
      <div class="ingredients-cluster">
        ${recipe.ingredients
          .map((ing) => {
            const isMissing = recipe.missing_ingredients?.some((m) => m.toLowerCase() === ing.name.toLowerCase());
            return `
            <span class="ingredient-badge ${isMissing ? "missing" : ""}">
              <strong>${escapeHtml(ing.name)}</strong>: ${ing.quantity} ${escapeHtml(ing.unit)}
              ${isMissing ? " <em>(Missing)</em>" : ""}
            </span>`;
          })
          .join("")}
      </div>
    </div>

    <div>
      <h3 style="margin-bottom: 12px; font-size: 16px;">Step-by-Step Cooking Guide</h3>
      <ol class="cooking-steps-list">
        ${recipe.steps
          .map((step, idx) => {
            const done = state.completedSteps.has(step.step_number);
            return `
          <li class="step-item ${done ? "completed" : ""}" data-step-row="${step.step_number}">
            <div class="step-number">${step.step_number}</div>
            <div class="step-content">
              <span>${escapeHtml(step.instruction)}</span>
              ${
                step.timer_minutes
                  ? `<button class="step-timer-btn" data-minutes="${step.timer_minutes}" type="button" title="Quick-set timer">
                      ⏱ Set Timer (${step.timer_minutes}m)
                    </button>`
                  : ""
              }
            </div>
            <button class="btn-action" data-toggle-step="${step.step_number}" type="button">
              ${done ? "Undo" : "Done"}
            </button>
          </li>`;
          })
          .join("")}
      </ol>
    </div>`;
}

function renderLists() {
  $("#favoritesList").innerHTML = state.favorites.length
    ? state.favorites
        .map(
          (recipe) => `
      <div class="stack-item">
        <div class="stack-item-main">
          <span class="stack-item-title">${escapeHtml(recipe.name)}</span>
          <span class="stack-item-sub">${recipe.cooking_time} min · ${recipe.diet}</span>
        </div>
        <button class="btn-subtle" data-open-recipe="${recipe.id}" type="button">Cook</button>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>No favorite recipes saved yet. Star any recipe to pin it here.</p></div>`;

  $("#historyList").innerHTML = state.history.length
    ? state.history
        .map(
          (row) => `
      <div class="stack-item">
        <div class="stack-item-main">
          <span class="stack-item-title">${escapeHtml(row.recipe_name)}</span>
          <span class="stack-item-sub">${new Date(row.cooked_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${row.servings} servings</span>
        </div>
        <button class="btn-subtle" data-open-recipe="${row.recipe_id}" type="button">Cook Again</button>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>No cooking sessions recorded yet.</p></div>`;
}

function renderReports() {
  const reports = state.reports;
  if (!reports) return;

  const groups = reports.expiry.groups;
  const total = groups.ok + groups.expiring + groups.expired || 1;
  const pctOk = Math.round((groups.ok / total) * 100);
  const pctExpiring = Math.round((groups.expiring / total) * 100);
  const pctExpired = 100 - pctOk - pctExpiring;

  $("#reportSummary").innerHTML = `
    <article class="metric-card">
      <div class="metric-icon-box bg-green-subtle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <div class="metric-body">
        <span class="metric-label">In-Date Pantry</span>
        <strong class="metric-value">${groups.ok}</strong>
        <span class="metric-sub">${pctOk}% of inventory</span>
      </div>
    </article>

    <article class="metric-card border-warning">
      <div class="metric-icon-box bg-amber-subtle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      </div>
      <div class="metric-body">
        <span class="metric-label">Expiring Soon</span>
        <strong class="metric-value text-amber">${groups.expiring}</strong>
        <span class="metric-sub">Within ${reports.expiry.window_days} days</span>
      </div>
    </article>

    <article class="metric-card">
      <div class="metric-icon-box bg-coral-subtle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
      <div class="metric-body">
        <span class="metric-label">Expired</span>
        <strong class="metric-value" style="color: var(--status-danger);">${groups.expired}</strong>
        <span class="metric-sub">Action required</span>
      </div>
    </article>

    <article class="metric-card">
      <div class="metric-icon-box bg-teal-subtle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2"><path d="M12 2a5 5 0 0 0-5 5v3H4a2 2 0 0 0-2 2v2a8 8 0 0 0 16 0v-2a2 2 0 0 0-2-2h-3V7a5 5 0 0 0-5-5z"></path></svg>
      </div>
      <div class="metric-body">
        <span class="metric-label">Cooking Sessions</span>
        <strong class="metric-value">${reports.cooking.total_sessions}</strong>
        <span class="metric-sub">Meals prepared</span>
      </div>
    </article>`;

  const barContainer = $("#reportExpiryBar");
  if (barContainer) {
    barContainer.innerHTML = `
      <div class="multi-progress-track">
        <div class="progress-segment ok" style="width: ${pctOk}%;" title="In Date: ${pctOk}%"></div>
        <div class="progress-segment expiring" style="width: ${pctExpiring}%;" title="Expiring: ${pctExpiring}%"></div>
        <div class="progress-segment expired" style="width: ${pctExpired}%;" title="Expired: ${pctExpired}%"></div>
      </div>
      <div class="progress-legend">
        <div class="legend-item"><span class="legend-dot" style="background: var(--status-ok);"></span> In Date (${groups.ok})</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--status-warning);"></span> Expiring Soon (${groups.expiring})</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--status-danger);"></span> Expired (${groups.expired})</div>
      </div>`;
  }

  $("#reportExpiry").innerHTML = reports.expiry.items.length
    ? reports.expiry.items
        .map(
          (item) => `
      <div class="stack-item">
        <div class="stack-item-main">
          <span class="stack-item-title">${escapeHtml(item.name)}</span>
          <span class="stack-item-sub">${item.quantity} ${escapeHtml(item.unit)} · ${formatDate(item.expiry_date)}</span>
        </div>
        <span class="status-badge ${item.status}">${statusLabel(item.status)}</span>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>No items currently require expiry action.</p></div>`;

  $("#reportPopular").innerHTML = reports.cooking.popular_recipes.length
    ? reports.cooking.popular_recipes
        .map(
          (row) => `
      <div class="stack-item">
        <span class="stack-item-title">${escapeHtml(row.name)}</span>
        <span class="status-badge ok">${row.times_cooked} meal${row.times_cooked === 1 ? "" : "s"} prepared</span>
      </div>`
        )
        .join("")
    : `<div class="empty-state"><p>Cook and log recipes to see your popularity ranking.</p></div>`;

  if (reports.admin) {
    $("#adminReportPanel").classList.remove("hidden");
    $("#adminReport").innerHTML = `
      <div class="stack-item"><strong>Registered Accounts</strong><span>${reports.admin.users}</span></div>
      <div class="stack-item"><strong>System Recipes</strong><span>${reports.admin.recipes}</span></div>
      <div class="stack-item"><strong>Total Pantry Ingredients Tracked</strong><span>${reports.admin.pantry_items}</span></div>
      <div class="stack-item"><strong>Global Cooking Sessions</strong><span>${reports.admin.cooking_sessions}</span></div>
      <div style="margin-top: 14px;">
        <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px;">User Directory</h4>
        <div class="item-stack">
          ${reports.admin.accounts
            .map(
              (acc) => `
            <div class="stack-item">
              <div><strong>${escapeHtml(acc.display_name)}</strong> <span style="font-size: 12px; color: var(--text-secondary);">(@${escapeHtml(acc.username)})</span></div>
              <span class="status-badge ${acc.role === "Admin" ? "warning" : "ok"}">${escapeHtml(acc.role)}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
  }
}

function renderAdmin() {
  if (state.user?.role !== "Admin") return;
  const recipes = recipeCatalog();
  $("#adminRecipeTable").innerHTML = recipes.length
    ? recipes
        .map(
          (recipe) => `
      <tr>
        <td><strong>${escapeHtml(recipe.name)}</strong></td>
        <td><span class="chip">${escapeHtml(recipe.diet)}</span></td>
        <td>${recipe.cooking_time} min</td>
        <td>${escapeHtml(recipe.difficulty)}</td>
        <td>${recipe.base_servings}</td>
        <td class="text-right">
          <div class="stack-actions" style="justify-content: flex-end;">
            <button class="btn-action" data-edit-recipe="${recipe.id}" type="button">Edit</button>
            <button class="btn-action danger" data-delete-recipe="${recipe.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6"><div class="empty-state"><p>No recipes in the database.</p></div></td></tr>`;
}

// ============================================================================
// Forms & Modals
// ============================================================================

function pantryForm(item) {
  const today = new Date().toISOString().split("T")[0];
  return `
    <form class="modal-form">
      <div class="form-group">
        <label>Ingredient Name *</label>
        <input name="name" class="form-input" required maxlength="120" value="${escapeHtml(item?.name || "")}" placeholder="e.g. Carrots, Rice, Spinach">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Quantity *</label>
          <input name="quantity" class="form-input" type="number" min="0.01" step="0.01" required value="${item?.quantity ?? ""}" placeholder="e.g. 2">
        </div>
        <div class="form-group">
          <label>Unit</label>
          <input name="unit" class="form-input" maxlength="40" value="${escapeHtml(item?.unit || "")}" placeholder="kg, pcs, g, cup, tbsp">
        </div>
      </div>
      <div class="form-group">
        <label>Expiry Date *</label>
        <input name="expiry_date" class="form-input" type="date" required value="${item?.expiry_date || today}">
      </div>
      <div class="form-actions-row">
        <button type="button" class="btn-outline cancel-modal">Cancel</button>
        <button type="submit" class="btn-primary">Save Ingredient</button>
      </div>
    </form>`;
}

function shoppingItemForm() {
  return `
    <form class="modal-form">
      <div class="form-group">
        <label>Item Name *</label>
        <input name="name" class="form-input" required maxlength="120" placeholder="e.g. Olive Oil, Garlic">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Quantity</label>
          <input name="quantity" class="form-input" type="number" min="0.01" step="0.01" value="1">
        </div>
        <div class="form-group">
          <label>Unit</label>
          <input name="unit" class="form-input" maxlength="40" placeholder="pcs, bottle, kg">
        </div>
      </div>
      <div class="form-group">
        <label>Note / Recipe Association</label>
        <input name="recipe_name" class="form-input" maxlength="160" placeholder="e.g. Weekly Pantry Restock">
      </div>
      <div class="form-actions-row">
        <button type="button" class="btn-outline cancel-modal">Cancel</button>
        <button type="submit" class="btn-primary">Add to List</button>
      </div>
    </form>`;
}

function recipeForm(recipe) {
  const ingredients = recipe?.ingredients?.map((i) => `${i.name}, ${i.quantity}, ${i.unit}`).join("\n") || "Rice, 1, cup\nOnion, 1, pcs";
  const steps = recipe?.steps?.map((s) => (s.timer_minutes ? `${s.instruction} | ${s.timer_minutes}` : s.instruction)).join("\n") || "Rinse ingredients.\nCook until tender. | 10";

  return `
    <form class="modal-form">
      <div class="form-group">
        <label>Recipe Name *</label>
        <input name="name" class="form-input" required maxlength="160" value="${escapeHtml(recipe?.name || "")}" placeholder="e.g. Spinach Dal Rice">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input name="description" class="form-input" maxlength="500" value="${escapeHtml(recipe?.description || "")}" placeholder="Brief description of the dish">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Dietary Category *</label>
          <select name="diet" class="select-input">
            <option value="vegetarian" ${recipe?.diet === "vegetarian" ? "selected" : ""}>Vegetarian</option>
            <option value="non-vegetarian" ${recipe?.diet === "non-vegetarian" ? "selected" : ""}>Non-Vegetarian</option>
          </select>
        </div>
        <div class="form-group">
          <label>Difficulty *</label>
          <select name="difficulty" class="select-input">
            <option ${recipe?.difficulty === "Easy" ? "selected" : ""}>Easy</option>
            <option ${recipe?.difficulty === "Medium" ? "selected" : ""}>Medium</option>
            <option ${recipe?.difficulty === "Hard" ? "selected" : ""}>Hard</option>
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Cooking Time (minutes) *</label>
          <input name="cooking_time" class="form-input" type="number" min="1" max="300" required value="${recipe?.cooking_time ?? 25}">
        </div>
        <div class="form-group">
          <label>Base Servings *</label>
          <input name="base_servings" class="form-input" type="number" min="1" max="20" required value="${recipe?.base_servings ?? 2}">
        </div>
      </div>
      <div class="form-group">
        <label>Image URL</label>
        <input name="image_url" class="form-input" maxlength="500" value="${escapeHtml(recipe?.image_url || "")}" placeholder="https://images.unsplash.com/photo-...">
      </div>
      <div class="form-group">
        <label>Ingredients (one per line: name, quantity, unit) *</label>
        <textarea name="ingredients" class="form-input" rows="4" required>${escapeHtml(ingredients)}</textarea>
      </div>
      <div class="form-group">
        <label>Steps (one per line, append " | minutes" for step timer) *</label>
        <textarea name="steps" class="form-input" rows="4" required>${escapeHtml(steps)}</textarea>
      </div>
      <div class="form-actions-row">
        <button type="button" class="btn-outline cancel-modal">Cancel</button>
        <button type="submit" class="btn-primary">Save Recipe</button>
      </div>
    </form>`;
}

function parseRecipeForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());

  const ingredients = data.ingredients
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const name = parts[0] || "";
      const quantity = Number(parts[1]);
      const unit = parts[2] || "";
      return { name, quantity, unit };
    });

  if (!ingredients.length || ingredients.some((i) => !i.name || isNaN(i.quantity) || i.quantity <= 0)) {
    throw new Error("Each ingredient must have a valid name and quantity greater than 0.");
  }

  const steps = data.steps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [instruction, timer] = line.split("|").map((p) => p.trim());
      return {
        step_number: idx + 1,
        instruction,
        timer_minutes: timer && !isNaN(Number(timer)) ? Number(timer) : null,
      };
    });

  if (!steps.length || steps.some((s) => !s.instruction)) {
    throw new Error("Please specify at least one valid step instruction.");
  }

  return {
    name: data.name.trim(),
    description: data.description.trim(),
    diet: data.diet,
    difficulty: data.difficulty,
    cooking_time: Number(data.cooking_time),
    base_servings: Number(data.base_servings),
    image_url: data.image_url.trim(),
    ingredients,
    steps,
  };
}

// ============================================================================
// Cooking & Recipe Interactions
// ============================================================================

async function openRecipe(id, navigateToCooking = true) {
  const recipe = await api(`/api/recipes/${id}?servings=${state.servings}`);
  state.currentRecipe = recipe;
  state.completedSteps.clear();
  renderCooking();
  renderLists();
  if (navigateToCooking) {
    navigate("cooking");
    showToast(`Loaded ${recipe.name} in Cooking Mode.`);
  }
}

// ============================================================================
// Cooking Timer
// ============================================================================

function updateTimerDisplay() {
  const minutes = Math.floor(state.timerSeconds / 60).toString().padStart(2, "0");
  const seconds = (state.timerSeconds % 60).toString().padStart(2, "0");
  const display = $("#timerDisplay");
  if (display) display.textContent = `${minutes}:${seconds}`;

  const status = $("#timerStatus");
  if (status) {
    status.textContent = state.timerRunning ? "Counting Down..." : state.timerSeconds === 0 ? "Completed!" : "Ready";
  }

  const card = $("#timerCard");
  if (card) {
    card.classList.toggle("running", state.timerRunning);
  }
}

function setTimer(minutes) {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerSeconds = minutes * 60;
  const startBtn = $("#startTimer");
  if (startBtn) startBtn.textContent = "Start";
  updateTimerDisplay();
}

function startTimer() {
  const startBtn = $("#startTimer");
  if (state.timerRunning) {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    if (startBtn) startBtn.textContent = "Start";
    updateTimerDisplay();
    return;
  }

  if (state.timerSeconds <= 0) {
    state.timerSeconds = 300; // default 5m
  }

  state.timerRunning = true;
  if (startBtn) startBtn.textContent = "Pause";
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    if (state.timerSeconds <= 1) {
      clearInterval(state.timerInterval);
      state.timerSeconds = 0;
      state.timerRunning = false;
      if (startBtn) startBtn.textContent = "Start";
      updateTimerDisplay();
      playTimerChime();
      showToast("🔔 Cooking timer has finished!");
      return;
    }
    state.timerSeconds -= 1;
    updateTimerDisplay();
  }, 1000);
}

// ============================================================================
// Authentication & Setup
// ============================================================================

async function afterLogin(token, user, message) {
  state.token = token;
  localStorage.setItem(TOKEN_KEY, token);
  setUser(user);
  $("#loginOverlay").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  await loadAll();
  showToast(message || `Welcome, ${user.display_name}!`);
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = $("#loginError");
  errorBox.classList.add("hidden");
  errorBox.textContent = "";

  const submitBtn = $("#loginSubmitBtn");
  submitBtn.disabled = true;

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#loginUser").value,
        password: $("#loginPass").value,
      }),
    });
    await afterLogin(data.token, data.user, data.message);
  } catch (error) {
    errorBox.classList.remove("hidden");
    errorBox.textContent = error.message;
  } finally {
    submitBtn.disabled = false;
  }
});

// Demo account quick fill
$("#demoUserBtn")?.addEventListener("click", () => {
  $("#loginUser").value = "user";
  $("#loginPass").value = "User@123";
  $("#loginError")?.classList.add("hidden");
});

$("#demoAdminBtn")?.addEventListener("click", () => {
  $("#loginUser").value = "admin";
  $("#loginPass").value = "Admin@123";
  $("#loginError")?.classList.add("hidden");
});

$("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Proceed with local logout
  }
  forceLogout("You have signed out.");
});

// Mobile menu toggle
$("#mobileMenu")?.addEventListener("click", () => {
  $("#sidebar")?.classList.toggle("open");
  $("#sidebarBackdrop")?.classList.toggle("open", $("#sidebar")?.classList.contains("open"));
});
$("#sidebarBackdrop")?.addEventListener("click", closeSidebar);

// Top-level Dashboard shortcut buttons
$("#dashAddPantryBtn")?.addEventListener("click", () => {
  navigate("pantry");
  $("#addIngredientBtn")?.click();
});
$("#dashViewExpiryBtn")?.addEventListener("click", () => navigate("expiry"));
$("#dashViewRecsBtn")?.addEventListener("click", () => navigate("recommendations"));

// Add ingredient
$("#addIngredientBtn")?.addEventListener("click", () => {
  openModal("Add Pantry Ingredient", pantryForm(), async (form, close) => {
    const data = Object.fromEntries(new FormData(form).entries());
    await api("/api/pantry", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        quantity: Number(data.quantity),
        unit: data.unit,
        expiry_date: data.expiry_date,
      }),
    });
    close();
    await loadAll();
    showToast(`Added ${data.name} to pantry.`);
  });
});

// Pantry search (debounced)
$("#pantrySearch")?.addEventListener("input", (event) => {
  state.pantryQuery = event.target.value;
  clearTimeout(state.pantrySearchTimer);
  state.pantrySearchTimer = setTimeout(async () => {
    try {
      state.pantry = await api(`/api/pantry?search=${encodeURIComponent(state.pantryQuery)}`);
      renderPantry();
    } catch (error) {
      showToast(error.message);
    }
  }, 220);
});

// Recipe filters
["#dietFilter", "#timeFilter", "#difficultyFilter"].forEach((sel) => {
  $(sel)?.addEventListener("change", () => loadAll().catch((err) => showToast(err.message)));
});
$("#recipeSearch")?.addEventListener("input", () => {
  clearTimeout($("#recipeSearch")._t);
  $("#recipeSearch")._t = setTimeout(() => loadAll().catch((err) => showToast(err.message)), 250);
});

// Shopping list interactions
$("#shoppingRecipe")?.addEventListener("change", renderShopping);

$("#generateShoppingBtn")?.addEventListener("click", async () => {
  try {
    const recipeId = Number($("#shoppingRecipe").value);
    if (!recipeId) return;
    await api("/api/shopping/generate", {
      method: "POST",
      body: JSON.stringify({ recipe_id: recipeId, servings: state.servings }),
    });
    await loadAll();
    showToast("Added missing ingredients to your shopping list.");
  } catch (error) {
    showToast(error.message);
  }
});

$("#addCustomShopBtn")?.addEventListener("click", () => {
  openModal("Add Shopping Item", shoppingItemForm(), async (form, close) => {
    const data = Object.fromEntries(new FormData(form).entries());
    await api("/api/shopping", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        quantity: Number(data.quantity) || 1,
        unit: data.unit,
        recipe_name: data.recipe_name,
      }),
    });
    close();
    await loadAll();
    showToast(`Added ${data.name} to shopping list.`);
  });
});

$("#clearShoppingBtn")?.addEventListener("click", async () => {
  try {
    const ok = await confirmAction("Are you sure you want to clear your entire shopping list?");
    if (!ok) return;
    await api("/api/shopping", { method: "DELETE" });
    await loadAll();
    showToast("Shopping list cleared.");
  } catch (error) {
    showToast(error.message);
  }
});

// Timer controls
$("#startTimer")?.addEventListener("click", startTimer);
$("#resetTimer")?.addEventListener("click", () => setTimer(5));
$$(".btn-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mins = Number(btn.dataset.minutes);
    setTimer(mins);
    showToast(`Timer set to ${mins} minutes.`);
  });
});

// Admin recipe creation
$("#addRecipeBtn")?.addEventListener("click", () => {
  openModal("Create New Recipe", recipeForm(), async (form, close) => {
    const payload = parseRecipeForm(form);
    await api("/api/recipes", { method: "POST", body: JSON.stringify(payload) });
    close();
    await loadAll();
    showToast(`Created recipe: ${payload.name}.`);
  });
});

// Global Event Delegation for Section Switching, Actions & Editing
document.addEventListener("click", async (event) => {
  try {
    // Navigation items
    const navBtn = event.target.closest("[data-section]");
    if (navBtn && navBtn.dataset.section) {
      if (navBtn.closest("nav") || navBtn.closest(".header-actions") || navBtn.id.startsWith("nav")) {
        navigate(navBtn.dataset.section);
      }
    }

    // Open recipe in Cooking mode
    const openId = event.target.closest("[data-open-recipe]")?.dataset.openRecipe;
    if (openId) {
      await openRecipe(openId);
      return;
    }

    // Shop missing items for recipe
    const shopId = event.target.closest("[data-shop-recipe]")?.dataset.shopRecipe;
    if (shopId) {
      navigate("shopping");
      const sel = $("#shoppingRecipe");
      if (sel) sel.value = shopId;
      renderShopping();
      return;
    }

    // Edit pantry item
    const editPantry = event.target.closest("[data-edit-pantry]")?.dataset.editPantry;
    if (editPantry) {
      const item = state.pantry.find((r) => String(r.id) === editPantry);
      openModal("Edit Pantry Ingredient", pantryForm(item), async (form, close) => {
        const data = Object.fromEntries(new FormData(form).entries());
        await api(`/api/pantry/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: data.name,
            quantity: Number(data.quantity),
            unit: data.unit,
            expiry_date: data.expiry_date,
          }),
        });
        close();
        await loadAll();
        showToast("Pantry item updated.");
      });
      return;
    }

    // Delete pantry item
    const deletePantry = event.target.closest("[data-delete-pantry]")?.dataset.deletePantry;
    if (deletePantry) {
      const ok = await confirmAction("Remove this ingredient from your pantry?");
      if (!ok) return;
      await api(`/api/pantry/${deletePantry}`, { method: "DELETE" });
      await loadAll();
      showToast("Ingredient removed from pantry.");
      return;
    }

    // Toggle shopping item purchased checkbox
    const toggleShop = event.target.closest("[data-toggle-shop]");
    if (toggleShop) {
      const isPurchased = toggleShop.dataset.purchased === "true";
      await api(`/api/shopping/${toggleShop.dataset.toggleShop}`, {
        method: "PUT",
        body: JSON.stringify({ purchased: !isPurchased }),
      });
      await loadAll();
      return;
    }

    // Delete shopping item
    const deleteShop = event.target.closest("[data-delete-shop]")?.dataset.deleteShop;
    if (deleteShop) {
      await api(`/api/shopping/${deleteShop}`, { method: "DELETE" });
      await loadAll();
      showToast("Item removed from shopping list.");
      return;
    }

    // Edit recipe (Admin)
    const editRecipe = event.target.closest("[data-edit-recipe]")?.dataset.editRecipe;
    if (editRecipe) {
      const recipe = recipeCatalog().find((r) => String(r.id) === editRecipe);
      openModal("Edit Recipe", recipeForm(recipe), async (form, close) => {
        const payload = parseRecipeForm(form);
        await api(`/api/recipes/${recipe.id}`, { method: "PUT", body: JSON.stringify(payload) });
        close();
        await loadAll();
        showToast(`Updated recipe: ${payload.name}.`);
      });
      return;
    }

    // Delete recipe (Admin)
    const deleteRecipe = event.target.closest("[data-delete-recipe]")?.dataset.deleteRecipe;
    if (deleteRecipe) {
      const ok = await confirmAction("Permanently delete this recipe from the system?");
      if (!ok) return;
      await api(`/api/recipes/${deleteRecipe}`, { method: "DELETE" });
      if (state.currentRecipe?.id === Number(deleteRecipe)) state.currentRecipe = null;
      await loadAll();
      showToast("Recipe deleted.");
      return;
    }

    // Serving controls
    if (event.target.id === "decreaseServing" && state.currentRecipe && state.servings > 1) {
      state.servings -= 1;
      await openRecipe(state.currentRecipe.id, false);
      showToast(`Servings set to ${state.servings}.`);
      return;
    }

    if (event.target.id === "increaseServing" && state.currentRecipe && state.servings < 20) {
      state.servings += 1;
      await openRecipe(state.currentRecipe.id, false);
      showToast(`Servings set to ${state.servings}.`);
      return;
    }

    // Favorite toggle
    if (event.target.id === "favoriteBtn" && state.currentRecipe) {
      const id = state.currentRecipe.id;
      if (state.currentRecipe.favorite) {
        await api(`/api/cooking/favorites/${id}`, { method: "DELETE" });
        showToast("Removed recipe from favorites.");
      } else {
        await api(`/api/cooking/favorites/${id}`, { method: "POST" });
        showToast("Saved recipe to favorites!");
      }
      await loadAll();
      await openRecipe(id, false);
      return;
    }

    // Mark as cooked
    if (event.target.id === "cookedBtn" && state.currentRecipe) {
      await api("/api/cooking/history", {
        method: "POST",
        body: JSON.stringify({ recipe_id: state.currentRecipe.id, servings: state.servings }),
      });
      await loadAll();
      showToast(`Marked ${state.currentRecipe.name} as cooked! Logged to history.`);
      return;
    }

    // Toggle step completion in cooking mode
    const stepBtn = event.target.closest("[data-toggle-step]");
    if (stepBtn) {
      const stepNum = Number(stepBtn.dataset.toggleStep);
      if (state.completedSteps.has(stepNum)) {
        state.completedSteps.delete(stepNum);
      } else {
        state.completedSteps.add(stepNum);
      }
      const row = document.querySelector(`[data-step-row="${stepNum}"]`);
      if (row) {
        row.classList.toggle("completed", state.completedSteps.has(stepNum));
        stepBtn.textContent = state.completedSteps.has(stepNum) ? "Undo" : "Done";
      }
      return;
    }

    // Step inline timer button
    const stepTimerBtn = event.target.closest(".step-timer-btn");
    if (stepTimerBtn && stepTimerBtn.dataset.minutes) {
      const mins = Number(stepTimerBtn.dataset.minutes);
      setTimer(mins);
      startTimer();
      showToast(`⏱ Timer started for ${mins} minutes!`);
      return;
    }
  } catch (error) {
    showToast(error.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message) showToast(event.reason.message);
});

// ============================================================================
// Bootstrapping
// ============================================================================

(async function boot() {
  if (!state.token) return;
  try {
    const user = await api("/api/auth/me");
    await afterLogin(state.token, user, `Welcome back, ${user.display_name}!`);
  } catch {
    forceLogout();
  }
})();
