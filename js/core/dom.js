window.PortalDom = {
  statusEl: document.getElementById("status"),
  treeEl: document.getElementById("tree"),
  treeSearchEl: document.getElementById("treeSearch"),
  viewerEl: document.getElementById("viewer"),
  viewerTitleEl: document.getElementById("viewerTitle"),
  metaEl: document.getElementById("meta"),
  repoUrlEl: document.getElementById("repoUrl"),
  loadBtnEl: document.getElementById("loadBtn"),
};

window.setPortalStatus = function setPortalStatus(message, isError = false) {
  window.PortalDom.statusEl.textContent = message;
  window.PortalDom.statusEl.style.color = isError ? "#b00020" : "var(--muted)";
};
