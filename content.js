const EXPIRED_TERMS = [
  "verlopen",
  "niet meer beschikbaar",
  "niet meer actief",
  "niet meer te koop",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findArticles() {
  return Array.from(document.querySelectorAll("article.favorites-list-item"));
}

function isExpired(article) {
  const badges = article.querySelectorAll('[class*="Badge"]');
  for (const badge of badges) {
    const text = (badge.textContent || "").trim().toLowerCase();
    if (EXPIRED_TERMS.some((term) => text.includes(term))) {
      return true;
    }
  }
  return false;
}

function getTitle(article) {
  const titleEl = article.querySelector(".hz-StructuredListing-title");
  if (titleEl && titleEl.textContent.trim()) {
    return titleEl.textContent.trim();
  }
  const link = article.querySelector("a[aria-label]");
  return link ? link.getAttribute("aria-label") : "Onbekende advertentie";
}

function getRemoveButton(article) {
  const buttons = article.querySelectorAll("button[aria-label]");
  for (const btn of buttons) {
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (label.includes("verwijderen") && label.includes("favoriet")) {
      return btn;
    }
  }
  return null;
}

// ---- Favorieten opslaan voor de lijst in de extensie ----

const STORE_KEY = "mpFavorites";

function absoluteUrl(href) {
  try {
    return new URL(href, location.href).href;
  } catch (e) {
    return "";
  }
}

function getListingLink(article) {
  const link = article.querySelector('a[href*="/v/"]') || article.querySelector("a[href]");
  return link ? absoluteUrl(link.getAttribute("href")) : "";
}

function getPrice(article) {
  const priceEl = article.querySelector('[class*="price" i], [class*="Price"]');
  const fromEl = priceEl && priceEl.textContent.trim();
  if (fromEl) return fromEl;
  const match = (article.textContent || "").match(/€\s?[\d.,]+(?:,-)?|Gratis|Bieden|Zie omschrijving/i);
  return match ? match[0] : "";
}

function getImage(article) {
  const img = article.querySelector("img");
  if (!img) return "";
  const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
  if (src && !src.startsWith("data:")) return absoluteUrl(src);
  const srcset = img.getAttribute("srcset") || "";
  const first = srcset.split(",")[0].trim().split(" ")[0];
  return first ? absoluteUrl(first) : "";
}

function parseArticle(article) {
  const url = getListingLink(article);
  if (!url) return null;
  return {
    id: url.split("?")[0],
    title: getTitle(article),
    url,
    price: getPrice(article),
    image: getImage(article),
    expired: isExpired(article),
  };
}

function collectFavorites() {
  return findArticles().map(parseArticle).filter(Boolean);
}

async function readStore() {
  const res = await chrome.storage.local.get(STORE_KEY);
  return res[STORE_KEY] || { items: [], updatedAt: 0 };
}

// Voegt toe of werkt bij, zonder iets te verwijderen (de pagina laadt lazy).
async function mergeIntoStore(found) {
  if (!found.length) return;
  const store = await readStore();
  const byId = new Map(store.items.map((i) => [i.id, i]));
  const now = Date.now();
  for (const item of found) {
    const old = byId.get(item.id);
    byId.set(item.id, { ...item, savedAt: old ? old.savedAt : now });
  }
  await chrome.storage.local.set({ [STORE_KEY]: { items: Array.from(byId.values()), updatedAt: now } });
}

// Vervangt de opgeslagen lijst door wat er nu volledig op de pagina staat.
async function replaceStore(found) {
  const store = await readStore();
  const old = new Map(store.items.map((i) => [i.id, i]));
  const now = Date.now();
  const items = found.map((item) => ({ ...item, savedAt: old.has(item.id) ? old.get(item.id).savedAt : now }));
  await chrome.storage.local.set({ [STORE_KEY]: { items, updatedAt: now } });
}

async function removeFromStore(id) {
  const store = await readStore();
  const items = store.items.filter((i) => i.id !== id);
  await chrome.storage.local.set({ [STORE_KEY]: { items, updatedAt: Date.now() } });
}

let collectTimer = null;
function scheduleCollect() {
  clearTimeout(collectTimer);
  collectTimer = setTimeout(() => {
    mergeIntoStore(collectFavorites()).catch(() => {});
  }, 1000);
}

new MutationObserver(scheduleCollect).observe(document.body, { childList: true, subtree: true });
scheduleCollect();

async function runSync() {
  await loadAllFavorites();
  const found = collectFavorites();
  await replaceStore(found);
  chrome.runtime.sendMessage({ type: "SYNC_DONE", count: found.length });
}

async function loadAllFavorites() {
  let stableRounds = 0;
  let previousCount = -1;

  while (stableRounds < 3) {
    const count = findArticles().length;
    if (count === previousCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
      previousCount = count;
    }
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(700);
  }
}

function waitForRemoval(el, timeout = 6000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!document.body.contains(el)) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 200);
    };
    check();
  });
}

async function runCleanup() {
  await loadAllFavorites();

  const removed = [];
  const skipped = [];
  const skipSet = new WeakSet();

  while (true) {
    const target = findArticles().find((a) => isExpired(a) && !skipSet.has(a));
    if (!target) break;

    const title = getTitle(target);
    const btn = getRemoveButton(target);
    const targetUrl = getListingLink(target);

    if (!btn) {
      skipSet.add(target);
      skipped.push(title);
      continue;
    }

    chrome.runtime.sendMessage({ type: "PROGRESS", removed: removed.length, current: title });

    btn.click();
    const ok = await waitForRemoval(target);

    if (ok) {
      removed.push(title);
      if (targetUrl) await removeFromStore(targetUrl.split("?")[0]);
    } else {
      skipSet.add(target);
      skipped.push(title);
    }

    await sleep(300);
  }

  chrome.runtime.sendMessage({ type: "DONE", removed, skipped });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START_CLEANUP") {
    runCleanup().catch((err) => {
      chrome.runtime.sendMessage({ type: "ERROR", message: err.message });
    });
  } else if (msg.type === "START_SYNC") {
    runSync().catch((err) => {
      chrome.runtime.sendMessage({ type: "SYNC_ERROR", message: err.message });
    });
  }
});
