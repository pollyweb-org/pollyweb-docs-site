function isMarkdown(path) {
  return /\.mdx?$|\.markdown$/i.test(path);
}

function normalizePath(path) {
  const parts = path.split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function dirname(path) {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function splitRef(rawRef) {
  const qIdx = rawRef.indexOf("?");
  const hIdx = rawRef.indexOf("#");
  const cut = qIdx === -1 ? hIdx : hIdx === -1 ? qIdx : Math.min(qIdx, hIdx);
  if (cut === -1) {
    return { path: rawRef, suffix: "" };
  }
  return { path: rawRef.slice(0, cut), suffix: rawRef.slice(cut) };
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.PortalUtils = {
  isMarkdown,
  normalizePath,
  dirname,
  splitRef,
  escapeHtml,
};
