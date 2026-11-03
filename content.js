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
  }
});
