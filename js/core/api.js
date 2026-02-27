function parseSourceUrl(input) {
  const url = new URL(input);
  if (url.hostname !== "github.com") {
    throw new Error("Only repository source URLs from the configured host are supported.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Use a source URL: /owner/repo or /owner/repo/tree/branch/path");
  }

  const [owner, repo] = parts;
  if (parts.length >= 4 && parts[2] === "tree") {
    const branch = parts[3];
    const rootPath = parts.slice(4).join("/");
    return { owner, repo, branch, rootPath };
  }

  return { owner, repo, branch: null, rootPath: "" };
}

const SOURCE_ACCEPT_HEADER = { Accept: "application/vnd.github+json" };
const DOCS_PAGE_API_URL = "https://api.pollyweb.org/docs/page";

function getCache() {
  if (!window.PortalCache || typeof window.PortalCache.fetchCached !== "function") {
    throw new Error("PortalCache is required but was not loaded.");
  }
  return window.PortalCache.fetchCached;
}

function getCacheController() {
  if (!window.PortalCache || typeof window.PortalCache.deleteCached !== "function") {
    throw new Error("PortalCache.deleteCached is required but was not loaded.");
  }
  return window.PortalCache;
}

async function resolveSource(input) {
  const parsed = parseSourceUrl(input);
  if (parsed.branch) {
    return parsed;
  }

  const endpoint = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const fetchCached = getCache();
  let data;
  try {
    const result = await fetchCached(endpoint, {
      cacheKey: `repo-meta:${parsed.owner}/${parsed.repo}`,
      headers: SOURCE_ACCEPT_HEADER,
      responseType: "json",
      ttlMs: 30 * 60 * 1000,
      negativeTtlMs: 2 * 60 * 1000,
      minRequestIntervalMs: 15 * 1000,
      staleWhileRevalidate: true,
    });
    data = result.data;
  } catch (err) {
    const status = typeof err.status === "number" ? err.status : "unknown";
    const msg = typeof err.body === "string" ? err.body : err.message;
    throw new Error(`Source repo lookup error (${status}): ${msg}`);
  }

  if (!data.default_branch) {
    throw new Error("Could not resolve repository default branch.");
  }

  return {
    owner: parsed.owner,
    repo: parsed.repo,
    branch: data.default_branch,
    rootPath: "",
  };
}

async function fetchTree(source, options = {}) {
  const { owner, repo, branch } = source;
  const { forceRefresh = false } = options;
  const cacheBust = forceRefresh ? Date.now() : 0;
  const endpoint = forceRefresh
    ? `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1&refresh=${cacheBust}`
    : `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const fetchCached = getCache();
  let data;
  try {
    const result = await fetchCached(endpoint, {
      cacheKey: forceRefresh
        ? `repo-tree-force:${owner}/${repo}@${branch}:${cacheBust}`
        : `repo-tree:${owner}/${repo}@${branch}`,
      headers: SOURCE_ACCEPT_HEADER,
      responseType: "json",
      ttlMs: 15 * 60 * 1000,
      negativeTtlMs: 2 * 60 * 1000,
      minRequestIntervalMs: 15 * 1000,
      staleWhileRevalidate: !forceRefresh,
      persistent: !forceRefresh,
    });
    data = result.data;
  } catch (err) {
    const status = typeof err.status === "number" ? err.status : "unknown";
    const msg = typeof err.body === "string" ? err.body : err.message;
    throw new Error(`Source API error (${status}): ${msg}`);
  }

  if (!Array.isArray(data.tree)) {
    throw new Error("Unexpected source tree response.");
  }

  return { tree: data.tree, truncated: Boolean(data.truncated) };
}

function toRawUrl(source, path) {
  const { owner, repo, branch, rootPath } = source;
  const fullPath = rootPath ? `${rootPath}/${path}` : path;
  const encodedPath = String(fullPath || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`;
}

function parseApiErrorMessage(body, fallback = "Request failed") {
  if (typeof body !== "string" || !body.trim()) return fallback;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
    return body;
  } catch {
    return body;
  }
}

function isForcedPageErrorTestMode() {
  const testMode = new URLSearchParams(window.location.search).get("test") || "";
  return testMode === "force-page-error";
}

async function fetchPageViaPollywebApi(source, path) {
  if (isForcedPageErrorTestMode()) {
    throw new Error("Docs API page error (unknown): Failed to fetch (forced test mode).");
  }

  const fetchCached = getCache();
  const params = new URLSearchParams();
  params.set("owner", source.owner);
  params.set("repo", source.repo);
  if (source.branch) params.set("branch", source.branch);
  if (source.rootPath) params.set("root_path", source.rootPath);
  params.set("path", path);

  const endpoint = `${DOCS_PAGE_API_URL}?${params.toString()}`;
  const cacheKey = getDocsPageCacheKey(source, path);
  let result;
  try {
    result = await fetchCached(endpoint, {
      cacheKey,
      responseType: "json",
      ttlMs: 15 * 60 * 1000,
      negativeTtlMs: 90 * 1000,
      minRequestIntervalMs: 5 * 1000,
      staleWhileRevalidate: true,
    });
  } catch (err) {
    const status = typeof err.status === "number" ? err.status : "unknown";
    const msg = parseApiErrorMessage(err.body, err.message);
    throw new Error(`Docs API page error (${status}): ${msg}`);
  }

  const payload = result && result.data ? result.data : null;
  if (!payload || typeof payload.content !== "string") {
    throw new Error("Docs API page error (invalid response): missing content.");
  }

  return {
    ...result,
    data: payload.content,
    page: payload,
  };
}

function getDocsPageCacheKey(source, path) {
  return `docs-page:${source.owner}/${source.repo}@${source.branch || "default"}:${source.rootPath || ""}:${path}`;
}

function clearPageCache(source, path) {
  const cache = getCacheController();
  cache.deleteCached(getDocsPageCacheKey(source, path));
}

function clearTreeCache(source) {
  if (!source || !source.owner || !source.repo || !source.branch) return;
  const cache = getCacheController();
  cache.deleteCached(`repo-tree:${source.owner}/${source.repo}@${source.branch}`);
}

async function fetchRawFile(source, path) {
  return fetchPageViaPollywebApi(source, path);
}

window.PortalApi = {
  parseSourceUrl,
  resolveSource,
  fetchTree,
  fetchRawFile,
  fetchPageViaPollywebApi,
  clearPageCache,
  clearTreeCache,
  toRawUrl,
};
