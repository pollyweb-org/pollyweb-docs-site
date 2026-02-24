window.createViewerComponent = function createViewerComponent(options) {
  const { state, viewerEl, viewerTitleEl, metaEl, setStatus, toRawUrl, renderTree } = options;
  const { dirname, escapeHtml, isMarkdown, normalizePath, splitRef } = window.PortalUtils;

  function findFileForDirectory(dirPath) {
    const prefix = dirPath ? `${dirPath}/` : "";
    const candidates = state.files.filter((filePath) => !prefix || filePath.startsWith(prefix));
    if (!candidates.length) return null;

    const readmePath = dirPath ? `${dirPath}/readme.md` : "readme.md";
    const directReadme = candidates.find((filePath) => filePath.toLowerCase() === readmePath);
    if (directReadme) return directReadme;

    return candidates[0];
  }

  function renderBreadcrumb(path, onOpenFile) {
    viewerTitleEl.textContent = "";
    const parts = path.split("/");
    const crumbs = [];

    crumbs.push({
      label: "home",
      targetPath: findFileForDirectory(""),
    });

    for (let i = 0; i < parts.length; i += 1) {
      const currentPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      crumbs.push({
        label: parts[i],
        targetPath: isFile ? currentPath : findFileForDirectory(currentPath),
      });
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
          history.replaceState(null, "", `#${encodeURIComponent(anchor)}`);
        });
        continue;
      }

      if (/^(https?:|mailto:|data:|blob:|\/\/)/i.test(href)) {
        continue;
      }

      const { path: refPath, suffix } = splitRef(href);
      const repoPath = resolveRepoPath(currentVisiblePath, refPath);
      const visiblePath = getVisiblePathForRepoPath(repoPath);

      if (isMarkdown(visiblePath) && state.files.includes(visiblePath)) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const anchor = suffix.startsWith("#") ? decodeURIComponent(suffix.slice(1)) : "";
          onOpenFile(visiblePath, anchor);
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
      if (anchor || state.initialAnchor) {
        const activeAnchor = anchor || state.initialAnchor;
        history.replaceState(null, "", `#${encodeURIComponent(activeAnchor)}`);
        state.initialAnchor = "";
      }

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
