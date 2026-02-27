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

function hash53(input, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function toPageToken(path) {
  const normalized = normalizePath(String(path || ""));
  if (!normalized) return "";
  return hash53(normalized).toString(36);
}

function extractPageToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const slashIdx = raw.indexOf("/");
  return slashIdx >= 0 ? raw.slice(0, slashIdx) : raw;
}

function toSafeSlug(value) {
  const raw = String(value || "").trim();
  if (!raw) return "page";

  let text = raw;
  try {
    text = text.replace(/\p{Extended_Pictographic}/gu, " ");
  } catch {
    text = text.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ");
  }

  const ascii = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return ascii || "page";
}

function buildPageTokenMaps(paths) {
  const groups = new Map();
  for (const path of paths) {
    const token = toPageToken(path);
    if (!token) continue;
    if (!groups.has(token)) groups.set(token, []);
    groups.get(token).push(path);
  }

  const tokenByPath = new Map();
  const pathByToken = new Map();
  for (const [token, group] of groups.entries()) {
    if (group.length === 1) {
      const path = group[0];
      tokenByPath.set(path, token);
      pathByToken.set(token, path);
      continue;
    }

    const sorted = [...group].sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < sorted.length; i += 1) {
      const suffix = i === 0 ? "" : `~${i.toString(36)}`;
      const uniqueToken = `${token}${suffix}`;
      const path = sorted[i];
      tokenByPath.set(path, uniqueToken);
      pathByToken.set(uniqueToken, path);
    }
  }

  return { tokenByPath, pathByToken };
}

window.PortalUtils = {
  isMarkdown,
  normalizePath,
  dirname,
  splitRef,
  escapeHtml,
  toPageToken,
  extractPageToken,
  toSafeSlug,
  buildPageTokenMaps,
};
