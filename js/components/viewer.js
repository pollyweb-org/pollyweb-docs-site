window.createViewerComponent = function createViewerComponent(options) {
  const { state, viewerEl, viewerTitleEl, tocNavEl, metaEl, setStatus, toRawUrl, fetchRawFile, clearPageCache, renderTree } = options;
  const { dirname, escapeHtml, normalizePath, splitRef } = window.PortalUtils;
  const tocPanelEl = tocNavEl ? tocNavEl.closest(".toc-panel") : null;
  let pendingLoads = 0;

  function setPageLoading(active) {
    const contentPanel = viewerEl.closest(".content-panel");
    if (!contentPanel) return;
    if (active) {
      contentPanel.classList.add("page-loading");
    } else {
      contentPanel.classList.remove("page-loading");
    }
  }

  function renderMetaActions(editUrl, path, anchor = "") {
    metaEl.innerHTML = [
      '<span class="meta-actions">',
      `<a href="${editUrl}" target="_blank" rel="noreferrer">Source</a>`,
      '<button type="button" class="meta-refresh-btn" aria-label="Refresh page content cache">',
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5.25V2.75h-2.5M3 10.75v2.5h2.5M12.2 7A4.75 4.75 0 0 0 4.8 4.4L3 5.9M3.8 9A4.75 4.75 0 0 0 11.2 11.6L13 10.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      "<span>Refresh</span>",
      "</button>",
      "</span>",
    ].join("");

    const refreshBtn = metaEl.querySelector(".meta-refresh-btn");
    if (!refreshBtn) return;

    refreshBtn.addEventListener("click", () => {
      const { source } = state;
      if (!source) return;
      clearPageCache(source, path);
      void openFile(path, anchor, { historyMode: "replace" });
    });
  }

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

  function decodeRefPath(path) {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }

  function extractRepoRelativePathFromAbsoluteUrl(rawHref) {
    if (!state.source) return null;

    let url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch {
      return null;
    }

    const sourceOwner = state.source.owner.toLowerCase();
    const sourceRepo = state.source.repo.toLowerCase();
    const sourceBranch = state.source.branch.toLowerCase();

    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 5) return null;
      const [owner, repo, mode, branch, ...rest] = parts;
      if (owner.toLowerCase() !== sourceOwner || repo.toLowerCase() !== sourceRepo) return null;
      if ((mode !== "blob" && mode !== "tree") || branch.toLowerCase() !== sourceBranch) return null;
      return decodeRefPath(rest.join("/"));
    }

    if (url.hostname === "raw.githubusercontent.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 4) return null;
      const [owner, repo, branch, ...rest] = parts;
      if (owner.toLowerCase() !== sourceOwner || repo.toLowerCase() !== sourceRepo) return null;
      if (branch.toLowerCase() !== sourceBranch) return null;
      return decodeRefPath(rest.join("/"));
    }

    return null;
  }

  function stripUrlDecoration(url) {
    return url.replace(/[?#].*$/, "");
  }

  function isVideoUrl(url) {
    return /\.(mp4|webm|ogg|mov|m4v)$/i.test(stripUrlDecoration(url));
  }

  function isRepoUserAttachmentUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return (
        parsed.hostname === "github.com" &&
        parsed.pathname.toLowerCase().startsWith("/user-attachments/assets/")
      );
    } catch {
      return false;
    }
  }

  function isLikelyVideoLink(linkEl, url) {
    if (isVideoUrl(url)) return true;

    const label = (linkEl.textContent || "").trim();
    if (isVideoUrl(label)) return true;

    if (isRepoUserAttachmentUrl(url) && isVideoUrl(label)) return true;

    return false;
  }

  function buildInlineVideo(url, label = "video") {
    const wrapper = document.createElement("div");
    wrapper.className = "inline-video";

    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;

    wrapper.appendChild(video);
    return wrapper;
  }

  function replaceLinkWithVideo(linkEl, url) {
    const label = (linkEl.textContent || "").trim() || "video";
    const video = buildInlineVideo(url, label);
    const parent = linkEl.parentElement;

    if (parent && parent.tagName === "P") {
      const text = (parent.textContent || "").replace(/\s+/g, "");
      const singleLink = parent.querySelectorAll("a").length === 1 && text === label.replace(/\s+/g, "");
      if (singleLink) {
        parent.replaceWith(video);
        return;
      }
    }

    linkEl.replaceWith(video);
  }

  function replaceImageWithVideo(imgEl, url) {
    const alt = (imgEl.getAttribute("alt") || "").trim() || "video";
    const video = buildInlineVideo(url, alt);
    imgEl.replaceWith(video);
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

  function toSlug(text) {
    return text
      .normalize("NFKD")
      .replace(/[\u0300-\u036F]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }

  function renderEmptyToc(message) {
    if (!tocNavEl) return;
    tocNavEl.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
  }

  function setTocPanelVisible(visible) {
    if (!tocPanelEl) return;
    tocPanelEl.hidden = !visible;
  }

  function updateTableOfContents(currentVisiblePath) {
    if (!tocNavEl) return;

    const headings = Array.from(viewerEl.querySelectorAll("h1, h2, h3, h4"));
    if (!headings.length) {
      setTocPanelVisible(false);
      renderEmptyToc("No headers available.");
      return;
    }

    const usedIds = new Set();
    const items = [];

    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      const title = (heading.textContent || "").trim();
      if (!title) continue;

      let id = heading.getAttribute("id") || toSlug(title) || `section-${items.length + 1}`;
      let candidate = id;
      let index = 2;
      while (usedIds.has(candidate) || (document.getElementById(candidate) && document.getElementById(candidate) !== heading)) {
        candidate = `${id}-${index}`;
        index += 1;
      }
      id = candidate;
      heading.id = id;
      usedIds.add(id);
      items.push({ id, title, level });
    }

    if (!items.length) {
      setTocPanelVisible(false);
      renderEmptyToc("No headers available.");
      return;
    }

    setTocPanelVisible(items.length > 1);

    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.className = `toc-link toc-depth-${item.level}`;
      link.href = `#${encodeURIComponent(item.id)}`;
      link.textContent = item.title;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        scrollToAnchor(item.id);
        updateLocation(state.activePath || currentVisiblePath, item.id);
      });
      li.appendChild(link);
      list.appendChild(li);
    }

    tocNavEl.innerHTML = "";
    tocNavEl.appendChild(list);
  }

  function updateLocation(path, anchor = "", options = {}) {
    const { historyMode = "replace" } = options;
    const url = new URL(window.location.href);
    if (path) {
      url.searchParams.set("page", path);
    } else {
      url.searchParams.delete("page");
    }
    url.hash = anchor ? `#${encodeURIComponent(anchor)}` : "";
    if (historyMode === "push") {
      history.pushState(null, "", url);
      return;
    }
    if (historyMode === "replace") {
      history.replaceState(null, "", url);
    }
  }

  function processRenderedContent(currentVisiblePath, onOpenFile) {
    if (!state.source) return;
    const { source } = state;

    const images = viewerEl.querySelectorAll("img[src]");
    for (const img of images) {
      const src = (img.getAttribute("src") || "").trim();
      if (!src) continue;
      if (/^(https?:|data:|blob:|\/\/)/i.test(src)) {
        if (isVideoUrl(src)) {
          replaceImageWithVideo(img, src);
        }
        continue;
      }

      const { path: refPath, suffix } = splitRef(src);
      const decodedRefPath = decodeRefPath(refPath);
      const repoPath = resolveRepoPath(currentVisiblePath, decodedRefPath);
      const visiblePath = getVisiblePathForRepoPath(repoPath);
      const resolvedUrl = `${toRawUrl(source, visiblePath)}${suffix}`;
      if (isVideoUrl(src) || isVideoUrl(resolvedUrl)) {
        replaceImageWithVideo(img, resolvedUrl);
      } else {
        img.src = resolvedUrl;
      }
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

      const absoluteRepoPath = extractRepoRelativePathFromAbsoluteUrl(href);
      if (absoluteRepoPath) {
        const visiblePath = getVisiblePathForRepoPath(normalizePath(absoluteRepoPath));
        const docPath = resolveVisibleDocPath(visiblePath);
        if (docPath) {
          const { suffix, anchor } = (() => {
            try {
              const parsed = new URL(href, window.location.href);
              return {
                suffix: `${parsed.search}${parsed.hash}`,
                anchor: parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : "",
              };
            } catch {
              return { suffix: "", anchor: "" };
            }
          })();

          link.href = `?page=${encodeURIComponent(docPath)}${suffix}`;
          link.addEventListener("click", (event) => {
            event.preventDefault();
            onOpenFile(docPath, anchor, { historyMode: "push" });
          });
          continue;
        }
      }

      if (/^(https?:|mailto:|data:|blob:|\/\/)/i.test(href)) {
        if (isLikelyVideoLink(link, href)) {
          replaceLinkWithVideo(link, href);
        }
        continue;
      }

      const { path: refPath, suffix } = splitRef(href);
      const decodedRefPath = decodeRefPath(refPath);
      const repoPath = resolveRepoPath(currentVisiblePath, decodedRefPath);
      const visiblePath = getVisiblePathForRepoPath(repoPath);
      const docPath = resolveVisibleDocPath(visiblePath);

      if (docPath) {
        link.href = `?page=${encodeURIComponent(docPath)}${suffix}`;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const anchor = suffix.startsWith("#") ? decodeURIComponent(suffix.slice(1)) : "";
          onOpenFile(docPath, anchor, { historyMode: "push" });
        });
      } else {
        const resolvedUrl = `${toRawUrl(source, visiblePath)}${suffix}`;
        if (isVideoUrl(href) || isVideoUrl(resolvedUrl)) {
          replaceLinkWithVideo(link, resolvedUrl);
          continue;
        }
        link.href = resolvedUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
      }
    }
  }

  async function openFile(path, anchor = "", options = {}) {
    const { historyMode = "replace" } = options;
    pendingLoads += 1;
    setPageLoading(true);

    state.activePath = path;
    renderTree(openFile);

    const { source } = state;
    if (!source) {
      pendingLoads = Math.max(0, pendingLoads - 1);
      if (pendingLoads === 0) {
        setPageLoading(false);
      }
      return;
    }

    const repoPath = getRepoPathForVisiblePath(path)
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const editUrl = `https://github.com/${source.owner}/${source.repo}/edit/${encodeURIComponent(source.branch)}/${repoPath}`;
    renderBreadcrumb(path, openFile);

    try {
      const { data: text, fromCache, stale } = await fetchRawFile(source, path);

      viewerEl.innerHTML = window.marked.parse(text);
      processRenderedContent(path, openFile);
      updateTableOfContents(path);
      scrollToAnchor(anchor || state.initialAnchor);
      const activeAnchor = anchor || state.initialAnchor;
      updateLocation(path, activeAnchor, { historyMode });
      state.initialAnchor = "";

      renderMetaActions(editUrl, path, anchor || state.initialAnchor);
      if (stale) {
        setStatus(`Loaded ${path} (stale cache, refreshing in background).`);
      } else if (fromCache) {
        setStatus(`Loaded ${path} (cache).`);
      } else {
        setStatus(`Loaded ${path}`);
      }
    } catch (err) {
      viewerEl.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      setTocPanelVisible(false);
      renderEmptyToc("No headers available.");
      metaEl.textContent = "Failed to load file.";
      setStatus(`Failed to load ${path}`, true);
    } finally {
      pendingLoads = Math.max(0, pendingLoads - 1);
      if (pendingLoads === 0) {
        setPageLoading(false);
      }
    }
  }

  setTocPanelVisible(false);

  return {
    openFile,
  };
};
