const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const resultList = document.getElementById("resultList");

startBtn.addEventListener("click", async () => {
  resultList.innerHTML = "";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes("marktplaats.nl/my-account/favorites")) {
    statusEl.textContent = "Open eerst je Marktplaats favorietenpagina.";
    return;
  }

  startBtn.disabled = true;
  statusEl.textContent = "Bezig...";

  chrome.tabs.sendMessage(tab.id, { type: "START_CLEANUP" }, () => {
    if (chrome.runtime.lastError) {
      startBtn.disabled = false;
      statusEl.textContent = "Kon niet starten. Herlaad de favorietenpagina en probeer opnieuw.";
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PROGRESS") {
    statusEl.textContent = `Bezig... ${msg.removed} verwijderd (nu: "${msg.current}")`;
  } else if (msg.type === "DONE") {
    startBtn.disabled = false;
    statusEl.textContent = `Klaar: ${msg.removed.length} verlopen favoriet(en) verwijderd.`;

    msg.removed.forEach((title) => {
      const li = document.createElement("li");
      li.textContent = title;
      resultList.appendChild(li);
    });

    if (msg.skipped.length) {
      const li = document.createElement("li");
      li.textContent = `${msg.skipped.length} item(s) overgeslagen (verwijderknop niet gevonden)`;
      resultList.appendChild(li);
    }
  } else if (msg.type === "ERROR") {
    startBtn.disabled = false;
    statusEl.textContent = `Fout: ${msg.message}`;
  }
});
