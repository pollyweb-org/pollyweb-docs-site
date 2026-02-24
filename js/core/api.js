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

async function resolveSource(input) {
  const parsed = parseGitHubUrl(input);
  if (parsed.branch) {
    return parsed;
  }

  const endpoint = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`GitHub repo lookup error (${response.status}): ${msg}`);
  }

  const data = await response.json();
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
  const response = await fetch(endpoint, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${msg}`);
  }

  const data = await response.json();
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

window.PortalApi = {
  parseGitHubUrl,
  resolveSource,
  fetchTree,
  toRawUrl,
};
