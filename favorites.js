const STORE_KEY = "mpFavorites";
const FAVORITES_URL = "https://www.marktplaats.nl/my-account/favorites";

const searchEl = document.getElementById("search");
const filterEl = document.getElementById("filter");
const sortEl = document.getElementById("sort");
const syncBtn = document.getElementById("syncBtn");
const clearBtn = document.getElementById("clearBtn");
const metaEl = document.getElementById("meta");
const gridEl = document.getElementById("grid");
const emptyEl = document.getElementById("empty");

let store = { items: [], updatedAt: 0 };
let syncNote = "";

function priceValue(text) {
  if (!text) return null;
  const m = text.match(/[\d.]+(?:,\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function visibleItems() {
  const q = searchEl.value.trim().toLowerCase();
  const filter = filterEl.value;
  let items = store.items.filter((i) => {
    if (filter === "active" && i.expired) return false;
    if (filter === "expired" && !i.expired) return false;
    return !q || (i.title || "").toLowerCase().includes(q);
  });

  const sort = sortEl.value;
  const byPrice = (a, b, dir) => {
    const pa = priceValue(a.price);
    const pb = priceValue(b.price);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  items = items.slice().sort((a, b) => {
    if (sort === "oldest") return (a.savedAt || 0) - (b.savedAt || 0);
    if (sort === "title") return (a.title || "").localeCompare(b.title || "", "nl");
    if (sort === "priceAsc") return byPrice(a, b, 1);
    if (sort === "priceDesc") return byPrice(a, b, -1);
    return (b.savedAt || 0) - (a.savedAt || 0);
  });
  return items;
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
  const items = visibleItems();
  gridEl.replaceChildren(...items.map(makeCard));

  const updated = store.updatedAt ? new Date(store.updatedAt).toLocaleString("nl-NL") : null;
  const parts = [`${items.length} van ${store.items.length} favorieten`];
  if (updated) parts.push(`laatst bijgewerkt ${updated}`);
  if (syncNote) parts.push(syncNote);
  metaEl.textContent = parts.join(" · ");

  if (!store.items.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = "Nog geen favorieten opgeslagen. Open je Marktplaats favorietenpagina en klik op Synchroniseer.";
  } else if (!items.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = "Geen favorieten gevonden met deze zoekopdracht of dit filter.";
  } else {
    emptyEl.hidden = true;
  }
}

async function load() {
  const res = await chrome.storage.local.get(STORE_KEY);
  store = res[STORE_KEY] || { items: [], updatedAt: 0 };
  render();
}

syncBtn.addEventListener("click", async () => {
  syncNote = "";
  const tabs = await chrome.tabs.query({ url: FAVORITES_URL + "*" });
  if (!tabs.length) {
    syncNote = "Open eerst je favorietenpagina op Marktplaats";
    render();
    chrome.tabs.create({ url: FAVORITES_URL });
    return;
  }
  syncBtn.disabled = true;
  syncNote = "Bezig met synchroniseren...";
  render();
  chrome.tabs.sendMessage(tabs[0].id, { type: "START_SYNC" }, () => {
    if (chrome.runtime.lastError) {
      syncBtn.disabled = false;
      syncNote = "Kon niet starten. Herlaad de favorietenpagina en probeer opnieuw.";
      render();
    }
  });
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Weet je zeker dat je de opgeslagen lijst wilt wissen? Je favorieten op Marktplaats blijven bestaan.")) return;
  await chrome.storage.local.remove(STORE_KEY);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SYNC_DONE") {
    syncBtn.disabled = false;
    syncNote = `Gesynchroniseerd: ${msg.count} favorieten`;
    render();
  } else if (msg.type === "SYNC_ERROR") {
    syncBtn.disabled = false;
    syncNote = `Fout: ${msg.message}`;
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORE_KEY]) {
    store = changes[STORE_KEY].newValue || { items: [], updatedAt: 0 };
    render();
  }
});

[searchEl, filterEl, sortEl].forEach((el) => el.addEventListener("input", render));
load();
