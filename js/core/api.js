function parseGitHubUrl(input) {
  const url = new URL(input);
  if (url.hostname !== "github.com") {
    throw new Error("Only github.com URLs are supported.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Use a GitHub URL: /owner/repo or /owner/repo/tree/branch/path");
  }

  const [owner, repo] = parts;
  if (parts.length >= 4 && parts[2] === "tree") {
    const branch = parts[3];
    const rootPath = parts.slice(4).join("/");
    return { owner, repo, branch, rootPath };
  }

  return { owner, repo, branch: null, rootPath: "" };
}

const GITHUB_ACCEPT_HEADER = { Accept: "application/vnd.github+json" };

function getCache() {
  if (!window.PortalCache || typeof window.PortalCache.fetchCached !== "function") {
    throw new Error("PortalCache is required but was not loaded.");
  }
  return window.PortalCache.fetchCached;
}

async function resolveSource(input) {
  const parsed = parseGitHubUrl(input);
  if (parsed.branch) {
    return parsed;
  }

  const endpoint = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const fetchCached = getCache();
  let data;
  try {
    const result = await fetchCached(endpoint, {
      cacheKey: `repo-meta:${parsed.owner}/${parsed.repo}`,
      headers: GITHUB_ACCEPT_HEADER,
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
    throw new Error(`GitHub repo lookup error (${status}): ${msg}`);
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

async function fetchTree(source) {
  const { owner, repo, branch } = source;
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const fetchCached = getCache();
  let data;
  try {
    const result = await fetchCached(endpoint, {
      cacheKey: `repo-tree:${owner}/${repo}@${branch}`,
      headers: GITHUB_ACCEPT_HEADER,
      responseType: "json",
      ttlMs: 20 * 60 * 1000,
      negativeTtlMs: 2 * 60 * 1000,
      minRequestIntervalMs: 15 * 1000,
      staleWhileRevalidate: true,
    });
    data = result.data;
  } catch (err) {
    const status = typeof err.status === "number" ? err.status : "unknown";
    const msg = typeof err.body === "string" ? err.body : err.message;
    throw new Error(`GitHub API error (${status}): ${msg}`);
  }

  if (!Array.isArray(data.tree)) {
    throw new Error("Unexpected GitHub tree response.");
  }

  return { tree: data.tree, truncated: Boolean(data.truncated) };
}

function toRawUrl(source, path) {
  const { owner, repo, branch, rootPath } = source;
  const fullPath = rootPath ? `${rootPath}/${path}` : path;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${fullPath}`;
}

async function fetchRawFile(source, path) {
  const rawUrl = toRawUrl(source, path);
  const fetchCached = getCache();
  const result = await fetchCached(rawUrl, {
    cacheKey: `raw-file:${source.owner}/${source.repo}@${source.branch}:${path}`,
    responseType: "text",
    ttlMs: 15 * 60 * 1000,
    negativeTtlMs: 60 * 1000,
    minRequestIntervalMs: 5 * 1000,
    staleWhileRevalidate: true,
  });
  return result;
}

window.PortalApi = {
  parseGitHubUrl,
  resolveSource,
  fetchTree,
  fetchRawFile,
  toRawUrl,
};
