window.createViewerComponent = function createViewerComponent(options) {
  const { state, viewerEl, viewerTitleEl, tocNavEl, metaEl, setStatus, toRawUrl, fetchRawFile, clearPageCache, renderTree } = options;
  const { dirname, escapeHtml, normalizePath, splitRef, extractPageToken, toSafeSlug } = window.PortalUtils;
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
    const isExpanded = Boolean(document.getElementById("workspace")?.classList.contains("content-expanded"));
    const expandLabel = isExpanded ? "Show side panels" : "Focus on content (hide side panels)";
    const expandIcon = isExpanded
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6h3V3M9.5 3h3v3M3.5 10h3v3M9.5 13h3v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.75H2.75V6M10 2.75h3.25V6M6 13.25H2.75V10M10 13.25h3.25V10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const safeEditUrl = escapeHtml(editUrl);
    metaEl.innerHTML = [
      '<span class="meta-actions">',
      `<button id="contentExpandBtn" type="button" class="meta-expand-btn" aria-controls="treePanel tocPanel" aria-label="${expandLabel}" data-tooltip="${expandLabel}">`,
      expandIcon,
      "</button>",
      `<a href="${safeEditUrl}" target="_blank" rel="noreferrer" class="meta-edit-btn" aria-label="Suggest edits to this page on GitHub" data-tooltip="Suggest edits to this page on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17.25 9.81-9.81 3.75 3.75L6.75 21H3zM20.71 7.04a1 1 0 0 0 0-1.42L18.37 3.3a1 1 0 0 0-1.42 0l-1.67 1.67 3.75 3.75z" fill="currentColor"/></svg></a>`,
      '<button type="button" class="meta-refresh-btn" aria-label="Reload this page from GitHub" data-tooltip="Reload this page from GitHub">',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.146 4.854l-1.489 1.489A8 8 0 1 0 12 20a8.094 8.094 0 0 0 7.371-4.886 1 1 0 1 0-1.842-.779A6.071 6.071 0 0 1 12 18a6 6 0 1 1 4.243-10.243l-1.39 1.39a.5.5 0 0 0 .354.854H19.5A.5.5 0 0 0 20 9.5V5.207a.5.5 0 0 0-.854-.353z" fill="currentColor"/></svg>',
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

  function isReadmeFile(name) {
    return /^readme(\.[^/.]+)?$/i.test(name);
  }

  function getPageTitle(path) {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1] || path;
    if (parts.length === 1 && isReadmeFile(fileName)) {
      return "Home";
    }
    if (isReadmeFile(fileName) && parts.length > 1) {
      const parent = parts[parts.length - 2] || "";
      return formatBreadcrumbLabel(parent, false);
    }
    return formatBreadcrumbLabel(fileName, true);
  }

  function createHomeIcon() {
    const span = document.createElement("span");
    span.className = "breadcrumb-home-icon";
    span.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 7.1 8 2.5l5.8 4.6v6.2a.7.7 0 0 1-.7.7h-3.3V9.5H6.2V14H2.9a.7.7 0 0 1-.7-.7V7.1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    return span;
  }

  async function copyTextToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall back to execCommand path below.
      }
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  function updateCopyPathButtonTooltip(button, tooltip) {
    button.setAttribute("data-tooltip", tooltip);
    button.setAttribute("aria-label", tooltip);
  }

  function showCopyConfirmation(button, copied) {
    const titleEl = button.closest("#viewerTitle");
    if (!titleEl) return;

    let note = titleEl.querySelector(".copy-confirmation");
    if (!note) {
      note = document.createElement("span");
      note.className = "copy-confirmation";
      note.setAttribute("role", "status");
      note.setAttribute("aria-live", "polite");
      titleEl.appendChild(note);
    }

    note.textContent = copied ? "Copied." : "Copy failed.";
    note.classList.toggle("error", !copied);
    note.style.left = `${button.offsetLeft + button.offsetWidth + 8}px`;
    note.style.top = `${button.offsetTop + (button.offsetHeight / 2)}px`;
    note.classList.add("visible");
    window.clearTimeout(note._hideTimer);
    note._hideTimer = window.setTimeout(() => {
      note.classList.remove("visible");
    }, copied ? 1500 : 2200);
  }

  async function handleCopyPath(path, button) {
    const repoPath = getRepoPathForVisiblePath(path);
    const copied = await copyTextToClipboard(repoPath);
    updateCopyPathButtonTooltip(button, copied ? "Copied!" : "Copy failed");
    button.classList.toggle("copied", copied);
    button.classList.toggle("copy-failed", !copied);
    showCopyConfirmation(button, copied);
    window.clearTimeout(button._copyResetTimer);
    button._copyResetTimer = window.setTimeout(() => {
      button.classList.remove("copied", "copy-failed");
      updateCopyPathButtonTooltip(button, "Copy file path");
    }, copied ? 1500 : 2000);
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
    const isTopLevelReadmePath = parts.length === 1 && isReadmeFile(parts[0] || "");
    const hideParentFolder = shouldHideParentFolder(path) || shouldHideParentBecauseSameName(path);

    crumbs.push({
      label: "Home",
      targetPath: findFileForDirectory(""),
      isHome: true,
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "meta-copy-btn title-copy-btn";
    updateCopyPathButtonTooltip(copyBtn, "Copy file path");
    copyBtn.innerHTML = '<span class="breadcrumb-copy-icon"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="2.5" width="8" height="9" rx="1.6" ry="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2.5" y="5.5" width="8" height="8" rx="1.6" ry="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></span>';
    copyBtn.addEventListener("click", () => {
      void handleCopyPath(path, copyBtn);
    });
    viewerTitleEl.appendChild(copyBtn);

    for (let i = 0; i < parts.length; i += 1) {
      if (hideParentFolder && i === parts.length - 2) {
        continue;
      }
      const currentPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      const isTopLevelReadme = isFile && parts.length === 1 && isReadmeFile(parts[i]);
      if (isTopLevelReadme) {
        continue;
      }
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
        if (crumb.isHome) {
          button.appendChild(createHomeIcon());
          if (isTopLevelReadmePath) {
            const label = document.createElement("span");
            label.textContent = crumb.label;
            button.appendChild(label);
          } else {
            button.setAttribute("aria-label", "Home");
            button.setAttribute("data-tooltip", "Home");
          }
        } else {
          button.textContent = crumb.label;
        }
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

    const separator = document.createElement("span");
    separator.className = "breadcrumb-separator";
    separator.textContent = "/";
    viewerTitleEl.appendChild(separator);
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

    const canonicalizePath = (path) =>
      normalizePath(path)
        .normalize("NFKC")
        .replace(/[\uFE0E\uFE0F]/g, "")
        .toLowerCase();
    const canonicalToPath = new Map();
    for (const filePath of state.files) {
      const key = canonicalizePath(filePath);
      if (!canonicalToPath.has(key)) {
        canonicalToPath.set(key, filePath);
      }
    }
    for (const candidate of candidates) {
      const resolved = canonicalToPath.get(canonicalizePath(candidate));
      if (resolved) return resolved;
    }

    // If a link targets a folder, route to the first markdown file inside it.
    const normalizedPrefix = `${normalized}/`;
    const firstInFolder = state.files.find((filePath) => {
      const normalizedFilePath = normalizePath(filePath);
      return normalizedFilePath.startsWith(normalizedPrefix);
    });
    if (firstInFolder) return firstInFolder;

    const canonicalPrefix = `${canonicalizePath(normalized)}/`;
    const firstCanonicalInFolder = state.files.find((filePath) => {
      const canonicalFilePath = canonicalizePath(filePath);
      return canonicalFilePath.startsWith(canonicalPrefix);
    });
    if (firstCanonicalInFolder) return firstCanonicalInFolder;

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
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 5) return null;
      const [owner, repo, mode, branch, ...rest] = parts;
      if (owner.toLowerCase() !== sourceOwner || repo.toLowerCase() !== sourceRepo) return null;
      if (mode !== "blob" && mode !== "tree") return null;
      if (!branch) return null;
      return decodeRefPath(rest.join("/"));
    }

    if (url.hostname === "raw.githubusercontent.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 4) return null;
      const [owner, repo, branch, ...rest] = parts;
      if (owner.toLowerCase() !== sourceOwner || repo.toLowerCase() !== sourceRepo) return null;
      if (!branch) return null;
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

  function isRawGitHubUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.hostname === "raw.githubusercontent.com";
    } catch {
      return false;
    }
  }

  function resolvePortalDocPathFromHref(href) {
    try {
      const parsed = new URL(href, window.location.href);
      const page = parsed.searchParams.get("page");
      if (page) return decodeRefPath(page);

      const token = extractPageToken(parsed.searchParams.get("p"));
      if (!token || !state.pagePathByToken) return null;
      return state.pagePathByToken.get(token) || null;
    } catch {
      return null;
    }
  }

  function getPageHref(path, suffix = "") {
    const token = state.pageTokenByPath && typeof state.pageTokenByPath.get === "function"
      ? state.pageTokenByPath.get(path)
      : "";
    if (token) {
      const slug = toSafeSlug(getPageTitle(path));
      return `?p=${encodeURIComponent(token)}/${encodeURIComponent(slug)}${suffix}`;
    }
    return `?page=${encodeURIComponent(path)}${suffix}`;
  }

  function setPrettyPageTokenQuery(url, token, slug) {
    const params = new URLSearchParams(url.search);
    params.delete("page");
    params.set("p", token);

    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key === "p") {
        pairs.push(`p=${encodeURIComponent(token)}/${encodeURIComponent(slug)}`);
      } else {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }

    url.search = pairs.length ? `?${pairs.join("&")}` : "";
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
    if (isRepoUserAttachmentUrl(url)) return true;

    if (isVideoUrl(url)) return true;

    const label = (linkEl.textContent || "").trim();
    if (isVideoUrl(label)) return true;

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

  function renderLoadErrorState(path, editUrl, message, onRetry) {
    const safePath = escapeHtml(path);
    const safeMessage = escapeHtml(message || "Unknown error.");
    const safeEditUrl = escapeHtml(editUrl || "");
    const sourceAction = editUrl
      ? `<a class="viewer-error-btn ghost" href="${safeEditUrl}" target="_blank" rel="noreferrer">Open source</a>`
      : "";

    viewerEl.innerHTML = [
      '<section class="viewer-error-state" role="alert" aria-live="assertive">',
      '<div class="viewer-error-head">',
      '<span class="viewer-error-icon" aria-hidden="true">',
      '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 14.2a1.2 1.2 0 1 1-1.2 1.2A1.2 1.2 0 0 1 12 16.2zm1-3.7h-2V6.8h2z" fill="currentColor"/></svg>',
      "</span>",
      '<p class="viewer-error-kicker">Content Unavailable</p>',
      "<h3>Couldn&rsquo;t load this docs page</h3>",
      `<p class="viewer-error-copy">The docs API failed while fetching <code>${safePath}</code>.</p>`,
      "</div>",
      '<div class="viewer-error-actions">',
      '<button type="button" class="viewer-error-btn primary" data-viewer-error-action="retry">Try again</button>',
      sourceAction,
      "</div>",
      '<details class="viewer-error-details">',
      "<summary>Technical details</summary>",
      `<pre>${safeMessage}</pre>`,
      "</details>",
      "</section>",
    ].join("");

    const retryBtn = viewerEl.querySelector('[data-viewer-error-action="retry"]');
    if (retryBtn) {
      retryBtn.addEventListener("click", onRetry);
    }
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
    const scrollViewerToTop = () => {
      if (typeof viewerEl.scrollTo === "function") {
        viewerEl.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } else {
        viewerEl.scrollTop = 0;
        viewerEl.scrollLeft = 0;
      }
    };

    if (!anchor) {
      scrollViewerToTop();
      return;
    }
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
      return;
    }
    scrollViewerToTop();
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

  function renderEmptyToc(message = "") {
    if (!tocNavEl) return;
    tocNavEl.innerHTML = message ? `<p class="hint">${escapeHtml(message)}</p>` : "";
  }

  function setTocPanelVisible(visible) {
    if (!tocPanelEl) return;
    tocPanelEl.hidden = !visible;
  }

  function updateTocTooltips() {
    if (!tocNavEl) return;
    const links = tocNavEl.querySelectorAll(".toc-link");
    for (const link of links) {
      if (link.scrollWidth > link.clientWidth) {
        link.title = link.textContent || "";
      } else {
        link.removeAttribute("title");
      }
    }
  }

  if (tocNavEl && typeof ResizeObserver === "function") {
    const tocResizeObserver = new ResizeObserver(() => {
      updateTocTooltips();
    });
    tocResizeObserver.observe(tocNavEl);
  }

  function updateTableOfContents(currentVisiblePath) {
    if (!tocNavEl) return;

    const headings = Array.from(viewerEl.querySelectorAll("h1, h2, h3, h4"));
    if (!headings.length) {
      setTocPanelVisible(false);
      renderEmptyToc();
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
      renderEmptyToc();
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
    window.requestAnimationFrame(updateTocTooltips);
  }

  function updateLocation(path, anchor = "", options = {}) {
    const { historyMode = "replace" } = options;
    const url = new URL(window.location.href);
    if (path) {
      const token = state.pageTokenByPath && typeof state.pageTokenByPath.get === "function"
        ? state.pageTokenByPath.get(path)
        : "";
      if (token) {
        setPrettyPageTokenQuery(url, token, toSafeSlug(getPageTitle(path)));
      } else {
        url.searchParams.set("page", path);
        url.searchParams.delete("p");
      }
    } else {
      url.searchParams.delete("p");
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

  function trackSpaPageView() {
    if (!window.PollywebAnalytics) return;
    if (typeof window.PollywebAnalytics.trackPageView !== "function") return;
    window.PollywebAnalytics.trackPageView();
  }

  function isVisuallyEmptyTableRow(row) {
    const cells = Array.from(row.cells || []);
    if (!cells.length) return false;
    return cells.every((cell) => {
      if ((cell.textContent || "").trim()) return false;
      return !cell.querySelector("img, video, iframe, object, embed, input, textarea, select, button");
    });
  }

  function trimTrailingEmptyTableRows(rootEl) {
    const tables = rootEl.querySelectorAll("table");
    for (const table of tables) {
      const section = table.tBodies.length ? table.tBodies[table.tBodies.length - 1] : table;
      while (section.rows.length) {
        const lastRow = section.rows[section.rows.length - 1];
        if (!isVisuallyEmptyTableRow(lastRow)) break;
        lastRow.remove();
      }
    }
  }

  function suppressTableBottomBorderBeforeRule(rootEl) {
    const rules = rootEl.querySelectorAll("hr");
    for (const rule of rules) {
      const previous = rule.previousElementSibling;
      if (previous && previous.tagName === "TABLE") {
        previous.classList.add("table-no-bottom-border");
      }
    }
  }

  function highlightYamlCodeBlocks(rootEl) {
    const yamlBlocks = rootEl.querySelectorAll("pre > code.language-yaml, pre > code.language-yml");
    for (const block of yamlBlocks) {
      const source = block.textContent || "";
      const lines = source.split("\n");
      const highlighted = lines
        .map((line) => {
          if (/^\s*#/.test(line)) {
            return `<span class="yaml-comment">${escapeHtml(line)}</span>`;
          }

          const keyValueMatch = line.match(/^(\s*-?\s*)([^:#\n][^:\n]*)(\s*:\s*)(.*)$/);
          if (!keyValueMatch) {
            return escapeHtml(line);
          }

          const [, prefix, rawKey, separator, rawValue] = keyValueMatch;
          const key = rawKey.trimEnd();
          const keySuffix = rawKey.slice(key.length);
          const hasValue = rawValue.trim().length > 0;

          return [
            escapeHtml(prefix),
            `<span class="yaml-key">${escapeHtml(key)}</span>`,
            escapeHtml(keySuffix),
            escapeHtml(separator),
            hasValue ? `<span class="yaml-value">${escapeHtml(rawValue)}</span>` : "",
          ].join("");
        })
        .join("\n");

      block.innerHTML = highlighted;
    }
  }

  function normalizeCodeStyledLinkLabels(rootEl) {
    const links = rootEl.querySelectorAll("a");
    for (const link of links) {
      if (link.childNodes.length !== 1) continue;
      const onlyChild = link.firstElementChild;
      if (!onlyChild || onlyChild.tagName !== "CODE") continue;
      const label = onlyChild.textContent || "";
      link.textContent = label;
    }
  }

  function normalizeProtocolValue(value) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F\s]+/g, "")
      .toLowerCase();
  }

  function isSafeHref(value) {
    if (!value) return false;
    if (value.startsWith("#")) return true;
    if (value.startsWith("?")) return true;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    if (value.startsWith("./") || value.startsWith("../")) return true;

    const normalized = normalizeProtocolValue(value);
    if (
      normalized.startsWith("javascript:") ||
      normalized.startsWith("vbscript:") ||
      normalized.startsWith("data:") ||
      normalized.startsWith("file:")
    ) {
      return false;
    }

    try {
      const parsed = new URL(value, window.location.href);
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" || parsed.protocol === "tel:";
    } catch {
      return false;
    }
  }

  function isSafeSrc(value) {
    if (!value) return false;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    if (value.startsWith("./") || value.startsWith("../")) return true;

    const normalized = normalizeProtocolValue(value);
    if (
      normalized.startsWith("javascript:") ||
      normalized.startsWith("vbscript:") ||
      normalized.startsWith("file:") ||
      normalized.startsWith("data:text/html") ||
      normalized.startsWith("data:image/svg")
    ) {
      return false;
    }
    if (normalized.startsWith("data:")) {
      return /^data:image\/(png|gif|jpe?g|webp);/i.test(value);
    }

    try {
      const parsed = new URL(value, window.location.href);
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:";
    } catch {
      return false;
    }
  }

  function sanitizeRenderedHtml(rootEl) {
    const blocked = rootEl.querySelectorAll("script, iframe, object, embed, meta, base, form, input, textarea, select, button");
    for (const node of blocked) {
      node.remove();
    }

    const allElements = rootEl.querySelectorAll("*");
    for (const el of allElements) {
      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();
        const attrValue = attr.value || "";

        if (attrName.startsWith("on") || attrName === "srcdoc") {
          el.removeAttribute(attr.name);
          continue;
        }

        if ((attrName === "href" || attrName === "xlink:href") && !isSafeHref(attrValue)) {
          el.removeAttribute(attr.name);
          continue;
        }

        if ((attrName === "src" || attrName === "poster") && !isSafeSrc(attrValue)) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
        const currentRel = (el.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
        const relSet = new Set(currentRel.map((entry) => entry.toLowerCase()));
        relSet.add("noopener");
        relSet.add("noreferrer");
        el.setAttribute("rel", Array.from(relSet).join(" "));
      }
    }
  }

  function processRenderedContent(currentVisiblePath, onOpenFile) {
    if (!state.source) return;
    const { source } = state;
    trimTrailingEmptyTableRows(viewerEl);
    suppressTableBottomBorderBeforeRule(viewerEl);
    highlightYamlCodeBlocks(viewerEl);
    normalizeCodeStyledLinkLabels(viewerEl);

    const images = viewerEl.querySelectorAll("img[src]");
    for (const img of images) {
      const src = (img.getAttribute("src") || "").trim();
      if (!src) continue;
      if (/^(https?:|data:|blob:|\/\/)/i.test(src)) {
        if (isVideoUrl(src) || isRepoUserAttachmentUrl(src)) {
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
      if (!href) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
        });
        continue;
      }

      const portalDocPath = resolvePortalDocPathFromHref(href);
      if (portalDocPath) {
        const docPath = resolveVisibleDocPath(portalDocPath) || portalDocPath;
        const anchor = (() => {
          try {
            const parsed = new URL(href, window.location.href);
            return parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : "";
          } catch {
            return "";
          }
        })();
        link.href = getPageHref(docPath, anchor ? `#${encodeURIComponent(anchor)}` : "");
        link.addEventListener("click", (event) => {
          event.preventDefault();
          onOpenFile(docPath, anchor, { historyMode: "push" });
        });
        continue;
      }

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

          link.href = getPageHref(docPath, suffix);
          link.addEventListener("click", (event) => {
            event.preventDefault();
            onOpenFile(docPath, anchor, { historyMode: "push" });
          });
          continue;
        }
      }

      if (/^(https?:|mailto:|data:|blob:|\/\/)/i.test(href)) {
        if (isRawGitHubUrl(href)) {
          link.href = "#";
          link.addEventListener("click", (event) => {
            event.preventDefault();
          });
          continue;
        }
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
        link.href = getPageHref(docPath, suffix);
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const anchor = suffix.startsWith("#") ? decodeURIComponent(suffix.slice(1)) : "";
          onOpenFile(docPath, anchor, { historyMode: "push" });
        });
      } else {
        const resolvedUrl = `${toRawUrl(source, visiblePath)}${suffix}`;
        const resolvedRepoPath = extractRepoRelativePathFromAbsoluteUrl(resolvedUrl);
        if (resolvedRepoPath) {
          const internalVisiblePath = getVisiblePathForRepoPath(normalizePath(resolvedRepoPath));
          const internalDocPath = resolveVisibleDocPath(internalVisiblePath);
          if (internalDocPath) {
            link.href = getPageHref(internalDocPath, suffix);
            link.addEventListener("click", (event) => {
              event.preventDefault();
              const anchor = suffix.startsWith("#") ? decodeURIComponent(suffix.slice(1)) : "";
              onOpenFile(internalDocPath, anchor, { historyMode: "push" });
            });
            continue;
          }
        }
        if (isVideoUrl(href) || isVideoUrl(resolvedUrl)) {
          replaceLinkWithVideo(link, resolvedUrl);
          continue;
        }
        if (isRawGitHubUrl(resolvedUrl)) {
          link.href = "#";
          link.addEventListener("click", (event) => {
            event.preventDefault();
          });
          continue;
        }
        link.href = resolvedUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
      }
    }
  }

  function renderNextPageNav(currentPath, onOpenFile) {
    const files = state.files;
    const currentIndex = files.indexOf(currentPath);
    if (currentIndex < 0) return;
    const nextPath = files[currentIndex + 1];
    if (!nextPath) return;

    const nav = document.createElement("nav");
    nav.className = "viewer-next-nav";
    nav.setAttribute("aria-label", "Next page");
    if (contentEndsWithDivider(viewerEl)) {
      nav.classList.add("viewer-next-nav-no-divider");
    }

    const link = document.createElement("a");
    link.className = "viewer-next-link";
    link.href = getPageHref(nextPath);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      onOpenFile(nextPath, "", { historyMode: "push" });
    });

    const kicker = document.createElement("span");
    kicker.className = "viewer-next-kicker";
    kicker.textContent = "Next page";

    const title = document.createElement("span");
    title.className = "viewer-next-title";
    title.textContent = getPageTitle(nextPath);

    const arrow = document.createElement("span");
    arrow.className = "viewer-next-arrow";
    arrow.textContent = "→";

    link.appendChild(kicker);
    link.appendChild(title);
    link.appendChild(arrow);
    nav.appendChild(link);
    viewerEl.appendChild(nav);
  }

  function contentEndsWithDivider(rootEl) {
    const lastEl = rootEl.lastElementChild;
    if (!lastEl) return false;
    if (lastEl.tagName === "HR") return true;

    const style = window.getComputedStyle(lastEl);
    const borderBottomWidth = parseFloat(style.borderBottomWidth || "0");
    const hasBottomBorder =
      borderBottomWidth > 0 &&
      style.borderBottomStyle !== "none" &&
      style.borderBottomColor !== "transparent";

    return hasBottomBorder;
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
      sanitizeRenderedHtml(viewerEl);
      processRenderedContent(path, openFile);
      renderNextPageNav(path, openFile);
      updateTableOfContents(path);
      scrollToAnchor(anchor || state.initialAnchor);
      const activeAnchor = anchor || state.initialAnchor;
      updateLocation(path, activeAnchor, { historyMode });
      trackSpaPageView();
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
      renderLoadErrorState(path, editUrl, err.message, () => {
        void openFile(path, anchor, { historyMode: "replace" });
      });
      setTocPanelVisible(false);
      renderEmptyToc();
      metaEl.innerHTML = "";
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
