const STORE_KEY = "mpFavorites";
const FAVORITES_URL = "https://www.marktplaats.nl/my-account/favorites";

const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const minEl = document.getElementById("minPrice");
const maxEl = document.getElementById("maxPrice");
const statusRadios = Array.from(document.querySelectorAll('input[name="status"]'));
const syncBtn = document.getElementById("syncBtn");
const clearBtn = document.getElementById("clearBtn");
const cleanBtn = document.getElementById("cleanBtn");
const metaEl = document.getElementById("meta");
const emptyEl = document.getElementById("empty");
const activeSection = document.getElementById("activeSection");
const expiredSection = document.getElementById("expiredSection");
const activeGrid = document.getElementById("activeGrid");
const expiredGrid = document.getElementById("expiredGrid");
const activeCount = document.getElementById("activeCount");
const expiredCount = document.getElementById("expiredCount");

let store = { items: [], updatedAt: 0 };
let note = "";

function priceValue(text) {
  if (!text) return null;
  const m = text.match(/[\d.]+(?:,\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function selectedStatus() {
  const checked = statusRadios.find((r) => r.checked);
  return checked ? checked.value : "all";
}

// Zoekterm en prijsbereik gelden voor beide secties.
function matchesFilters(item) {
  const q = searchEl.value.trim().toLowerCase();
  if (q && !(item.title || "").toLowerCase().includes(q)) return false;

  const min = minEl.value === "" ? null : Number(minEl.value);
  const max = maxEl.value === "" ? null : Number(maxEl.value);
  if (min !== null || max !== null) {
    const p = priceValue(item.price);
    if (p === null) return false; // "Bieden" e.d. heeft geen bedrag
    if (min !== null && p < min) return false;
    if (max !== null && p > max) return false;
  }
  return true;
}

function sortItems(items) {
  const sort = sortEl.value;
  const byPrice = (a, b, dir) => {
    const pa = priceValue(a.price);
    const pb = priceValue(b.price);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  return items.slice().sort((a, b) => {
    if (sort === "oldest") return (a.savedAt || 0) - (b.savedAt || 0);
    if (sort === "title") return (a.title || "").localeCompare(b.title || "", "nl");
    if (sort === "priceAsc") return byPrice(a, b, 1);
    if (sort === "priceDesc") return byPrice(a, b, -1);
    return (b.savedAt || 0) - (a.savedAt || 0);
  });
}

function makeCard(item) {
  const a = document.createElement("a");
  a.className = "card" + (item.expired ? " expired" : "");
  a.href = item.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = "";
    img.loading = "lazy";
    thumb.appendChild(img);
  }
  if (item.expired) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Verlopen";
    thumb.appendChild(badge);
  }

  const body = document.createElement("div");
  body.className = "body";
  const price = document.createElement("div");
  price.className = "price";
  price.textContent = item.price || "Geen prijs";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item.title || "Onbekende advertentie";
  body.append(price, title);

  a.append(thumb, body);
  return a;
}

function render() {
  const status = selectedStatus();
  const all = store.items;
  const totalActive = all.filter((i) => !i.expired).length;
  const totalExpired = all.length - totalActive;

  // Tellers in de zijbalk
  document.getElementById("lblAll").textContent = `Alles (${all.length})`;
  document.getElementById("lblActive").textContent = `Actief (${totalActive})`;
  document.getElementById("lblExpired").textContent = `Verlopen (${totalExpired})`;
  statusRadios.forEach((r) => r.parentElement.classList.toggle("on", r.checked));

  const filtered = all.filter(matchesFilters);
  const active = sortItems(filtered.filter((i) => !i.expired));
  const expired = sortItems(filtered.filter((i) => i.expired));

  const showActive = status !== "expired";
  const showExpired = status !== "active";

  activeSection.hidden = !showActive || (active.length === 0 && all.length > 0);
  expiredSection.hidden = !showExpired || expired.length === 0;

  activeGrid.replaceChildren(...active.map(makeCard));
  expiredGrid.replaceChildren(...expired.map(makeCard));
  activeCount.textContent = String(active.length);
  expiredCount.textContent = String(expired.length);

  const shown = (showActive ? active.length : 0) + (showExpired ? expired.length : 0);
  const updated = store.updatedAt ? new Date(store.updatedAt).toLocaleString("nl-NL") : null;
  const parts = [`${shown} van ${all.length} favorieten`];
  if (updated) parts.push(`laatst bijgewerkt ${updated}`);
  if (note) parts.push(note);
  metaEl.textContent = parts.join(" · ");

  if (!all.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = "Nog geen favorieten opgeslagen. Open je Marktplaats favorietenpagina en klik op Synchroniseer.";
  } else if (!shown) {
    emptyEl.hidden = false;
    emptyEl.textContent = "Geen favorieten gevonden met deze zoekopdracht of deze filters.";
  } else {
    emptyEl.hidden = true;
  }
}

async function load() {
  const res = await chrome.storage.local.get(STORE_KEY);
  store = res[STORE_KEY] || { items: [], updatedAt: 0 };
  render();
}

async function findFavoritesTab() {
  const tabs = await chrome.tabs.query({ url: FAVORITES_URL + "*" });
  return tabs[0] || null;
}

async function startOnTab(messageType, busyText, failText) {
  note = "";
  const tab = await findFavoritesTab();
  if (!tab) {
    note = "Open eerst je favorietenpagina op Marktplaats";
    render();
    chrome.tabs.create({ url: FAVORITES_URL });
    return false;
  }
  syncBtn.disabled = true;
  cleanBtn.disabled = true;
  note = busyText;
  render();
  chrome.tabs.sendMessage(tab.id, { type: messageType }, () => {
    if (chrome.runtime.lastError) {
      syncBtn.disabled = false;
      cleanBtn.disabled = false;
      note = failText;
      render();
    }
  });
  return true;
}

syncBtn.addEventListener("click", () => {
  startOnTab("START_SYNC", "Bezig met synchroniseren...", "Kon niet starten. Herlaad de favorietenpagina en probeer opnieuw.");
});

cleanBtn.addEventListener("click", () => {
  const n = store.items.filter((i) => i.expired).length;
  if (!confirm(`${n} verlopen favoriet(en) verwijderen van Marktplaats? Dit kan niet ongedaan worden gemaakt.`)) return;
  startOnTab("START_CLEANUP", "Bezig met verwijderen...", "Kon niet starten. Herlaad de favorietenpagina en probeer opnieuw.");
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Weet je zeker dat je de opgeslagen lijst wilt wissen? Je favorieten op Marktplaats blijven bestaan.")) return;
  await chrome.storage.local.remove(STORE_KEY);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SYNC_DONE") {
    syncBtn.disabled = false;
    cleanBtn.disabled = false;
    note = `Gesynchroniseerd: ${msg.count} favorieten`;
    render();
  } else if (msg.type === "SYNC_ERROR" || msg.type === "ERROR") {
    syncBtn.disabled = false;
    cleanBtn.disabled = false;
    note = `Fout: ${msg.message}`;
    render();
  } else if (msg.type === "PROGRESS") {
    note = `Bezig... ${msg.removed} verwijderd`;
    render();
  } else if (msg.type === "DONE") {
    syncBtn.disabled = false;
    cleanBtn.disabled = false;
    note = `Klaar: ${msg.removed.length} verlopen favoriet(en) verwijderd`;
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORE_KEY]) {
    store = changes[STORE_KEY].newValue || { items: [], updatedAt: 0 };
    render();
  }
});

[searchEl, sortEl, minEl, maxEl].forEach((el) => el.addEventListener("input", render));
statusRadios.forEach((r) => r.addEventListener("change", render));
load();
