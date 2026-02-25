window.PortalDom = {
  statusEl: document.getElementById("status"),
  treeEl: document.getElementById("tree"),
  treeSearchEl: document.getElementById("treeSearch"),
  treePanelToggleBtnEl: document.getElementById("treePanelToggleBtn"),
  contentExpandBtnEl: document.getElementById("contentExpandBtn"),
  viewerEl: document.getElementById("viewer"),
  viewerTitleEl: document.getElementById("viewerTitle"),
  tocNavEl: document.getElementById("tocNav"),
  metaEl: document.getElementById("meta"),
};

window.setPortalStatus = function setPortalStatus(message, isError = false) {
  if (!window.PortalDom.statusEl) return;
  window.PortalDom.statusEl.textContent = message;
  window.PortalDom.statusEl.style.color = isError ? "#b00020" : "var(--muted)";
};
