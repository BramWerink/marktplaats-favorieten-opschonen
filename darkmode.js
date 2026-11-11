const DARK_KEY = "mpDarkMode";

function applyDark(enabled) {
  document.documentElement.classList.toggle("mp-dark", !!enabled);
}

chrome.storage.local.get(DARK_KEY, (res) => applyDark(res[DARK_KEY]));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[DARK_KEY]) {
    applyDark(changes[DARK_KEY].newValue);
  }
});
