/* ============================================================
   Cloud News — client app
   Loads news.json, renders cards, and wires up source filters.
   ============================================================ */

const NEWS_URL = "news.json";
const ALL_SOURCES = "__all__";

const els = {
  grid: document.getElementById("news-grid"),
  status: document.getElementById("status"),
  filters: document.getElementById("filters"),
  filtersList: document.getElementById("filters-list"),
  filtersCount: document.getElementById("filters-count"),
  lastUpdated: document.getElementById("last-updated"),
  lastUpdatedValue: document.getElementById("last-updated-value"),
  footerCount: document.getElementById("footer-count"),
};

const state = {
  items: [],
  activeSource: ALL_SOURCES,
};

/* ---------- Formatting helpers ---------- */

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const RELATIVE_UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

function toRelativeTime(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";

  const deltaSeconds = Math.round((time - Date.now()) / 1000);

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (Math.abs(deltaSeconds) >= secondsInUnit || unit === "second") {
      return relativeFormatter.format(
        Math.round(deltaSeconds / secondsInUnit),
        unit
      );
    }
  }

  return "";
}

function toAbsoluteDate(iso) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : dateFormatter.format(new Date(time));
}

/* ---------- Status helpers ---------- */

function showStatus(message, variant) {
  els.status.hidden = false;
  els.status.className = variant ? `status status--${variant}` : "status";
  els.status.innerHTML =
    variant === "loading"
      ? '<div class="spinner" aria-hidden="true"></div>'
      : "";

  const text = document.createElement("p");
  text.className = "status__text";
  text.textContent = message;
  els.status.appendChild(text);
}

function hideStatus() {
  els.status.hidden = true;
  els.status.innerHTML = "";
}

/* ---------- Rendering ---------- */

const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function createCard(item, index) {
  const card = document.createElement("article");
  card.className = "card";
  // Stagger the entrance animation, capped so later cards are not slow.
  card.style.animationDelay = `${Math.min(index, 12) * 0.05}s`;

  const source = document.createElement("span");
  source.className = "card__source";
  source.textContent = item.source || "News";

  const title = document.createElement("h2");
  title.className = "card__title";

  const link = document.createElement("a");
  link.href = item.link;
  link.textContent = item.title;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  title.appendChild(link);

  const footer = document.createElement("div");
  footer.className = "card__footer";

  const dateWrap = document.createElement("span");
  dateWrap.className = "card__date";

  const relative = toRelativeTime(item.pubDate);
  const absolute = toAbsoluteDate(item.pubDate);

  if (relative || absolute) {
    const relativeEl = document.createElement("time");
    relativeEl.className = "card__date-relative";
    relativeEl.dateTime = item.pubDate || "";
    relativeEl.textContent = relative || absolute;
    dateWrap.appendChild(relativeEl);

    if (relative && absolute) {
      const absoluteEl = document.createElement("span");
      absoluteEl.className = "card__date-absolute";
      absoluteEl.textContent = absolute;
      dateWrap.appendChild(absoluteEl);
    }
  }

  const cta = document.createElement("span");
  cta.className = "card__cta";
  cta.setAttribute("aria-hidden", "true");
  cta.innerHTML = `Read ${ARROW_SVG}`;

  footer.append(dateWrap, cta);
  card.append(source, title, footer);

  return card;
}

function getVisibleItems() {
  if (state.activeSource === ALL_SOURCES) return state.items;
  return state.items.filter((item) => item.source === state.activeSource);
}

function renderGrid() {
  const visible = getVisibleItems();

  els.grid.setAttribute("aria-busy", "false");
  els.grid.replaceChildren(
    ...visible.map((item, index) => createCard(item, index))
  );

  const noun = visible.length === 1 ? "story" : "stories";
  els.filtersCount.textContent = `${visible.length} ${noun}`;

  if (visible.length === 0) {
    showStatus("No stories found for this source.", "empty");
  } else {
    hideStatus();
  }
}

function renderFilters() {
  const sources = [...new Set(state.items.map((item) => item.source))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  // Only surface the filter bar when there is something to choose between.
  if (sources.length === 0) {
    els.filters.hidden = true;
    return;
  }

  const tabs = [{ id: ALL_SOURCES, label: "All sources" }].concat(
    sources.map((source) => ({ id: source, label: source }))
  );

  els.filtersList.replaceChildren(
    ...tabs.map(({ id, label }) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "filter-tab";
      tab.textContent = label;
      tab.dataset.source = id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(id === state.activeSource));
      tab.addEventListener("click", () => setActiveSource(id));
      return tab;
    })
  );

  els.filters.hidden = false;
}

function setActiveSource(source) {
  if (source === state.activeSource) return;
  state.activeSource = source;

  for (const tab of els.filtersList.querySelectorAll(".filter-tab")) {
    tab.setAttribute(
      "aria-selected",
      String(tab.dataset.source === source)
    );
  }

  renderGrid();
}

function renderLastUpdated(iso) {
  const absolute = toAbsoluteDate(iso);
  if (!absolute) return;

  els.lastUpdated.hidden = false;
  els.lastUpdatedValue.dateTime = iso;
  els.lastUpdatedValue.textContent = absolute;
}

function renderFooterCount() {
  const total = state.items.length;
  if (!total) return;
  const noun = total === 1 ? "story" : "stories";
  els.footerCount.textContent = `${total} ${noun} tracked`;
}

/* ---------- Bootstrap ---------- */

async function loadNews() {
  showStatus("Loading the latest cloud news…", "loading");

  let data;
  try {
    const response = await fetch(NEWS_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    data = await response.json();
  } catch (error) {
    console.error("Failed to load news.json:", error);
    showStatus(
      "Could not load the news feed. Generate it by running `npm install` then `npm run update-news`, and serve the folder over HTTP.",
      "error"
    );
    return;
  }

  state.items = Array.isArray(data.items) ? data.items : [];

  if (state.items.length === 0) {
    showStatus(
      "No news items yet. Run `npm run update-news` to fetch the latest stories.",
      "empty"
    );
    return;
  }

  renderLastUpdated(data.lastUpdated);
  renderFilters();
  renderGrid();
  renderFooterCount();
}

loadNews();
