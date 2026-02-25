window.createViewerComponent = function createViewerComponent(options) {
  const { state, viewerEl, viewerTitleEl, metaEl, setStatus, toRawUrl, renderTree } = options;
  const { dirname, escapeHtml, normalizePath, splitRef } = window.PortalUtils;

  function findFileForDirectory(dirPath) {
    const prefix = dirPath ? `${dirPath}/` : "";
    const candidates = state.files.filter((filePath) => !prefix || filePath.startsWith(prefix));
    if (!candidates.length) return null;

    const readmePath = dirPath ? `${dirPath}/readme.md` : "readme.md";
    const directReadme = candidates.find((filePath) => filePath.toLowerCase() === readmePath);
    if (directReadme) return directReadme;

    return candidates[0];
  }

  function formatBreadcrumbLabel(segment, isFile = false) {
    const cleaned = segment.replace(/^\d+[-_.\s]*/, "");
    if (!isFile) {
      return cleaned || segment;
    }
    const withoutExtension = cleaned.replace(/\.[^/.]+$/, "");
    return withoutExtension || cleaned || segment;
  }

  function normalizeBreadcrumbLabel(label) {
    return label
      .normalize("NFKC")
      .replace(/[\uFE0E\uFE0F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getVisibleFiles() {
    const query = state.treeSearch.trim().toLowerCase();
    if (!query) return state.files;
    return state.files.filter((filePath) => filePath.toLowerCase().includes(query));
  }

  function shouldHideParentFolder(path) {
    const parts = path.split("/");
    if (parts.length < 2) return false;

    const folderPath = parts.slice(0, -1).join("/");
    const visibleInFolder = getVisibleFiles().filter((filePath) => dirname(filePath) === folderPath);
    return visibleInFolder.length === 1 && visibleInFolder[0] === path;
  }

  function shouldHideParentBecauseSameName(path) {
    const parts = path.split("/");
    if (parts.length < 2) return false;

    const parentLabel = normalizeBreadcrumbLabel(formatBreadcrumbLabel(parts[parts.length - 2], false));
    const fileLabel = normalizeBreadcrumbLabel(formatBreadcrumbLabel(parts[parts.length - 1], true));
    return parentLabel && fileLabel && parentLabel === fileLabel;
  }

  function renderBreadcrumb(path, onOpenFile) {
    viewerTitleEl.textContent = "";
    const parts = path.split("/");
    const crumbs = [];
    const hideParentFolder = shouldHideParentFolder(path) || shouldHideParentBecauseSameName(path);

    crumbs.push({
      label: "home",
      targetPath: findFileForDirectory(""),
    });

    for (let i = 0; i < parts.length; i += 1) {
      if (hideParentFolder && i === parts.length - 2) {
        continue;
      }
      const currentPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      crumbs.push({
        label: formatBreadcrumbLabel(parts[i], isFile),
        targetPath: isFile ? currentPath : findFileForDirectory(currentPath),
      });
    }

    if (crumbs.length >= 3) {
      const parentIdx = crumbs.length - 2;
      const fileIdx = crumbs.length - 1;
      const parentLabel = normalizeBreadcrumbLabel(crumbs[parentIdx].label);
      const fileLabel = normalizeBreadcrumbLabel(crumbs[fileIdx].label);
      if (parentLabel && fileLabel && parentLabel === fileLabel) {
        crumbs.splice(parentIdx, 1);
      }
    }

    crumbs.forEach((crumb, idx) => {
      if (idx > 0) {
        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "/";
        viewerTitleEl.appendChild(separator);
      }

      if (crumb.targetPath) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "breadcrumb-btn";
        button.textContent = crumb.label;
        if (crumb.targetPath === path) {
          button.classList.add("active");
        }
        button.addEventListener("click", () => onOpenFile(crumb.targetPath));
        viewerTitleEl.appendChild(button);
      } else {
        const text = document.createElement("span");
        text.className = "breadcrumb-text";
        text.textContent = crumb.label;
        viewerTitleEl.appendChild(text);
      }
    });
  }

  function getRepoPathForVisiblePath(path) {
    if (!state.source || !state.source.rootPath) {
      return path;
    }
    return `${state.source.rootPath}/${path}`;
  }

  function getVisiblePathForRepoPath(repoPath) {
    const root = state.source && state.source.rootPath ? state.source.rootPath : "";
    if (!root) return repoPath;
    const prefix = `${root}/`;
    if (repoPath === root) return "";
    if (repoPath.startsWith(prefix)) return repoPath.slice(prefix.length);
    return repoPath;
  }

  function resolveVisibleDocPath(visiblePath) {
    if (!visiblePath) return null;

    const normalized = normalizePath(visiblePath);
    const fileSet = new Set(state.files);
    if (fileSet.has(normalized)) return normalized;

    const lowerToPath = new Map(state.files.map((filePath) => [filePath.toLowerCase(), filePath]));
    const candidates = [
      normalized,
      `${normalized}.md`,
      `${normalized}.mdx`,
      `${normalized}.markdown`,
      `${normalized}/readme.md`,
      `${normalized}/readme.mdx`,
      `${normalized}/readme.markdown`,
    ];

    for (const candidate of candidates) {
      const resolved = lowerToPath.get(candidate.toLowerCase());
      if (resolved) return resolved;
    }

    return null;
  }

  function resolveRepoPath(currentVisiblePath, refPath) {
    const currentRepoPath = getRepoPathForVisiblePath(currentVisiblePath);
    if (refPath.startsWith("/")) {
      return normalizePath(refPath.slice(1));
    }
    return normalizePath(`${dirname(currentRepoPath)}/${refPath}`);
  }

  function scrollToAnchor(anchor) {
    if (!anchor) return;
    const targetById = document.getElementById(anchor);
    const namedAnchors = viewerEl.querySelectorAll("a[name]");
    let targetByName = null;
    for (const candidate of namedAnchors) {
      if (candidate.getAttribute("name") === anchor) {
        targetByName = candidate;
        break;
      }
    }
    const target = targetById && viewerEl.contains(targetById) ? targetById : targetByName;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateLocation(path, anchor = "") {
    const url = new URL(window.location.href);
    if (path) {
      url.searchParams.set("page", path);
    } else {
      url.searchParams.delete("page");
    }
    url.hash = anchor ? `#${encodeURIComponent(anchor)}` : "";
    history.replaceState(null, "", url);
  }

  function processRenderedContent(currentVisiblePath, onOpenFile) {
    if (!state.source) return;
    const { source } = state;

    const images = viewerEl.querySelectorAll("img[src]");
    for (const img of images) {
      const src = (img.getAttribute("src") || "").trim();
      if (!src) continue;
      if (/^(https?:|data:|blob:|\/\/)/i.test(src)) continue;

      const { path: refPath, suffix } = splitRef(src);
      const repoPath = resolveRepoPath(currentVisiblePath, refPath);
      const visiblePath = getVisiblePathForRepoPath(repoPath);
      img.src = `${toRawUrl(source, visiblePath)}${suffix}`;
    }

    const links = viewerEl.querySelectorAll("a[href]");
    for (const link of links) {
      const href = (link.getAttribute("href") || "").trim();
      if (!href) continue;

      if (href.startsWith("#")) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const anchor = decodeURIComponent(href.slice(1));
          scrollToAnchor(anchor);
          updateLocation(state.activePath || currentVisiblePath, anchor);
        });
        continue;
      }

      if (/^(https?:|mailto:|data:|blob:|\/\/)/i.test(href)) {
        continue;
      }

      const { path: refPath, suffix } = splitRef(href);
      const repoPath = resolveRepoPath(currentVisiblePath, refPath);
      const visiblePath = getVisiblePathForRepoPath(repoPath);
      const docPath = resolveVisibleDocPath(visiblePath);

      if (docPath) {
        link.href = `?page=${encodeURIComponent(docPath)}${suffix}`;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const anchor = suffix.startsWith("#") ? decodeURIComponent(suffix.slice(1)) : "";
          onOpenFile(docPath, anchor);
        });
      } else {
        link.href = `${toRawUrl(source, visiblePath)}${suffix}`;
        link.target = "_blank";
        link.rel = "noreferrer";
      }
    }
  }

  async function openFile(path, anchor = "") {
    state.activePath = path;
    renderTree(openFile);

    const { source } = state;
    if (!source) return;

    const rawUrl = toRawUrl(source, path);
    setStatus(`Loading ${path} ...`);
    renderBreadcrumb(path, openFile);

    try {
      const response = await fetch(rawUrl);
      if (!response.ok) {
        throw new Error(`Raw file request failed (${response.status}).`);
      }

      const text = await response.text();

      viewerEl.innerHTML = window.marked.parse(text);
      processRenderedContent(path, openFile);
      scrollToAnchor(anchor || state.initialAnchor);
      const activeAnchor = anchor || state.initialAnchor;
      updateLocation(path, activeAnchor);
      state.initialAnchor = "";

      metaEl.innerHTML = `Source: <a href="${rawUrl}" target="_blank" rel="noreferrer">raw file</a>`;
      setStatus(`Loaded ${path}`);
    } catch (err) {
      viewerEl.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      metaEl.textContent = "Failed to load file.";
      setStatus(`Failed to load ${path}`, true);
    }
  }

  return {
    openFile,
  };
};
