(function bootstrapPortal() {
  const STATIC_SOURCE_URL = "https://github.com/pollyweb-org/pollyweb-docs";
  const REPO_HOME_URL = "https://github.com/pollyweb-org/pollyweb-docs-site";
  const state = window.PortalState;
  const dom = window.PortalDom;
  const { escapeHtml, isMarkdown } = window.PortalUtils;
  const { fetchTree, resolveSource, fetchRawFile, clearPageCache, toRawUrl } = window.PortalApi;
  const setStatus = window.setPortalStatus;
  const workspaceEl = document.getElementById("workspace");
  const treePanelEl = document.getElementById("treePanel");
  const dividerEl = document.getElementById("panelDivider");
  const repoHomeBtnEl = document.getElementById("repoHomeBtn");
  let isTreePanelCollapsed = false;
  let isContentExpanded = false;

  if (!window.marked) {
    throw new Error("Marked is required but was not loaded.");
  }

  window.marked.setOptions({
    gfm: true,
    breaks: false,
  });

  const tree = window.createTreeComponent(state, dom.treeEl);
  const viewer = window.createViewerComponent({
    state,
    viewerEl: dom.viewerEl,
    viewerTitleEl: dom.viewerTitleEl,
    tocNavEl: dom.tocNavEl,
    metaEl: dom.metaEl,
    setStatus,
    fetchRawFile,
    clearPageCache,
    toRawUrl,
    renderTree: tree.renderTree,
  });

  const HIDE_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3.25 5.5 8l5 4.75" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SHOW_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.25 10.5 8l-5 4.75" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const EXPAND_CONTENT_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.75H2.75V6M10 2.75h3.25V6M6 13.25H2.75V10M10 13.25h3.25V10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const RESTORE_CONTENT_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6h3V3M9.5 3h3v3M3.5 10h3v3M9.5 13h3v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  if (repoHomeBtnEl) {
    repoHomeBtnEl.href = REPO_HOME_URL;
  }

  function getContentExpandBtnEl() {
    return document.getElementById("contentExpandBtn");
  }

  function setTreePanelCollapsed(collapsed) {
    if (!workspaceEl) return;
    isTreePanelCollapsed = collapsed;
    workspaceEl.classList.toggle("tree-collapsed", collapsed);
    if (dom.treePanelToggleBtnEl) {
      const label = collapsed ? "Show navigation" : "Hide navigation";
      dom.treePanelToggleBtnEl.innerHTML = collapsed ? SHOW_ICON : HIDE_ICON;
      dom.treePanelToggleBtnEl.setAttribute("aria-label", label);
      dom.treePanelToggleBtnEl.setAttribute("data-tooltip", label);
    }
  }

  function setContentExpanded(expanded) {
    if (!workspaceEl) return;
    isContentExpanded = expanded;
    workspaceEl.classList.toggle("content-expanded", expanded);
    const contentExpandBtnEl = getContentExpandBtnEl();
    if (contentExpandBtnEl) {
      const label = expanded ? "Return to normal view" : "Expand content";
      contentExpandBtnEl.innerHTML = expanded ? RESTORE_CONTENT_ICON : EXPAND_CONTENT_ICON;
      contentExpandBtnEl.setAttribute("aria-label", label);
      contentExpandBtnEl.setAttribute("data-tooltip", label);
    }
  }

  function initPanelResize() {
    if (!workspaceEl || !treePanelEl || !dividerEl) return;

    const MIN_TREE_WIDTH = 160;
    const MIN_CONTENT_WIDTH = 520;
    const KEYBOARD_STEP = 24;
    let isDragging = false;

    function applyTreeWidth(width) {
      const workspaceRect = workspaceEl.getBoundingClientRect();
      const dividerWidth = dividerEl.getBoundingClientRect().width || 10;
      const maxTreeWidth = Math.max(MIN_TREE_WIDTH, workspaceRect.width - MIN_CONTENT_WIDTH - dividerWidth);
      const clamped = Math.min(Math.max(width, MIN_TREE_WIDTH), maxTreeWidth);
      workspaceEl.style.setProperty("--tree-width", `${clamped}px`);
    }

    function updateFromPointer(clientX) {
      const workspaceRect = workspaceEl.getBoundingClientRect();
      const nextWidth = clientX - workspaceRect.left;
      applyTreeWidth(nextWidth);
    }

    dividerEl.addEventListener("pointerdown", (event) => {
      if (isTreePanelCollapsed || isContentExpanded) return;
      if (window.matchMedia("(max-width: 900px)").matches) return;
      isDragging = true;
      dividerEl.setPointerCapture(event.pointerId);
      document.body.classList.add("resizing-panels");
      updateFromPointer(event.clientX);
    });

    dividerEl.addEventListener("pointermove", (event) => {
      if (!isDragging) return;
      updateFromPointer(event.clientX);
    });

    function stopDragging() {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove("resizing-panels");
    }

    dividerEl.addEventListener("pointerup", stopDragging);
    dividerEl.addEventListener("pointercancel", stopDragging);

    dividerEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setTreePanelCollapsed(!isTreePanelCollapsed);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isTreePanelCollapsed || isContentExpanded) return;
      event.preventDefault();
      const currentWidth = treePanelEl.getBoundingClientRect().width;
      const delta = event.key === "ArrowLeft" ? -KEYBOARD_STEP : KEYBOARD_STEP;
      applyTreeWidth(currentWidth + delta);
    });
  }

  function getDefaultDocPath() {
    return (
      state.files.find((p) => p.toLowerCase() === "readme.md") ||
      state.files.find((p) => p.toLowerCase().endsWith("/readme.md")) ||
      state.files[0] ||
      ""
    );
  }

  function getTestMode() {
    return new URLSearchParams(window.location.search).get("test") || "";
  }

  function getTestPage() {
    const testMode = getTestMode();
    return testMode === "load-failure" ? "__test__/missing-file.md" : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function extractLoadErrorInfo(error) {
    const raw = error && error.message ? String(error.message) : "";
    const statusMatch = raw.match(/\((\d{3})\)/);
    const status = statusMatch ? Number(statusMatch[1]) : null;

    let payload = null;
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const jsonPart = raw.slice(jsonStart);
      try {
        payload = JSON.parse(jsonPart);
      } catch {
        payload = null;
      }
    }

    const payloadMessage = payload && typeof payload.message === "string"
      ? payload.message
      : payload && typeof payload.error === "string"
        ? payload.error
        : "";
    const combined = `${raw} ${payloadMessage}`.toLowerCase();

    return {
      status,
      payload,
      message: payloadMessage || raw,
      isRateLimit:
        combined.includes("api rate limit exceeded") ||
        combined.includes("secondary rate limit") ||
        combined.includes("rate limit"),
    };
  }

  function shouldRetrySourceLoad(error) {
    const info = extractLoadErrorInfo(error);
    if (info.isRateLimit) return true;
    if (info.status === 429) return true;
    if (typeof info.status === "number" && info.status >= 500 && info.status <= 599) return true;
    return false;
  }

  function renderRetryState(owner, repo, branch, attempt, maxRetries, nextDelayMs, reason) {
    const retryLabel = `${attempt}/${maxRetries}`;
    const nextSeconds = Math.ceil(nextDelayMs / 1000);
    const branchLabel = branch || "default-branch";
    dom.viewerEl.innerHTML = `
        <div class="viewer-load-state" role="status" aria-live="polite">
        <div class="hourglass" aria-hidden="true">⌛</div>
        <h3>Docs API is under heavy load</h3>
        <p>We're retrying in the background with exponential backoff.</p>
        <p class="muted">Target: ${escapeHtml(owner)}/${escapeHtml(repo)}@${escapeHtml(branchLabel)} | Retry ${retryLabel} in ${nextSeconds}s.</p>
        <p class="muted">Reason: ${escapeHtml(reason)}</p>
      </div>
    `;
  }

  function renderFinalLoadError(error) {
    const info = extractLoadErrorInfo(error);
    const isRateLimitLike = info.isRateLimit || info.status === 429;
    if (isRateLimitLike) {
      dom.viewerEl.innerHTML = `
        <div class="viewer-load-state load-error">
          <div class="hourglass" aria-hidden="true">⌛</div>
          <h3>Docs API is temporarily overloaded</h3>
          <p>We retried automatically with exponential backoff, but the docs API is still rate-limiting requests.</p>
          <p class="muted">Please wait a bit and reload.</p>
        </div>
      `;
      setStatus("The docs API rate-limited this request. Retries were exhausted.", true);
      return;
    }

    const safeMessage = escapeHtml(error && error.message ? String(error.message) : "Unknown error.");
    dom.viewerEl.innerHTML = `
      <section class="viewer-error-state" role="alert" aria-live="assertive">
        <div class="viewer-error-head">
          <span class="viewer-error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 14.2a1.2 1.2 0 1 1-1.2 1.2A1.2 1.2 0 0 1 12 16.2zm1-3.7h-2V6.8h2z" fill="currentColor"/></svg>
          </span>
          <p class="viewer-error-kicker">Connection Problem</p>
          <h3>Couldn&rsquo;t load the docs content</h3>
          <p class="viewer-error-copy">The docs backend did not respond successfully. Reload to try again.</p>
        </div>
        <div class="viewer-error-actions">
          <a class="viewer-error-btn primary" href="${window.location.href}">Reload</a>
        </div>
        <details class="viewer-error-details">
          <summary>Technical details</summary>
          <pre>${safeMessage}</pre>
        </details>
      </section>
    `;
    setStatus(error.message, true);
  }

  async function loadSourceWithRetry() {
    if (getTestMode() === "force-source-error") {
      throw new Error("Source API error (unknown): Failed to fetch (forced test mode).");
    }

    const parsed = window.PortalApi.parseSourceUrl(STATIC_SOURCE_URL);
    const owner = parsed.owner;
    const repo = parsed.repo;
    const maxRetries = 4;
    const baseDelayMs = 4000;

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const source = await resolveSource(STATIC_SOURCE_URL);
        setStatus(`Fetching tree for ${source.owner}/${source.repo}@${source.branch} ...`);
        const treeResult = await fetchTree(source);
        return { source, treeResult };
      } catch (error) {
        if (!shouldRetrySourceLoad(error) || attempt === maxRetries) {
          throw error;
        }

        const delayMs = baseDelayMs * (2 ** attempt);
        const reason = extractLoadErrorInfo(error).message || "Temporary docs API failure";
        const branch = state.source && state.source.branch ? state.source.branch : parsed.branch;
        renderRetryState(owner, repo, branch, attempt + 1, maxRetries, delayMs, reason);
        setStatus(`Docs API is busy. Retrying ${attempt + 1}/${maxRetries} in ${Math.ceil(delayMs / 1000)}s ...`, true);
        await sleep(delayMs);
        attempt += 1;
      }
    }

    throw new Error("Repository load retries exhausted.");
  }

  async function loadRepository() {
    try {
      dom.viewerEl.innerHTML = '<p class="hint">Loading document tree...</p>';
      const { source, treeResult } = await loadSourceWithRetry();
      state.source = source;
      state.files = [];
      state.activePath = null;
      state.treeSearch = "";
      dom.treeSearchEl.value = "";
      dom.metaEl.textContent = "";
      const { tree: fullTree, truncated } = treeResult;
      const prefix = source.rootPath ? `${source.rootPath}/` : "";

      const files = fullTree
        .filter((entry) => entry.type === "blob")
        .map((entry) => entry.path)
        .filter((path) => !prefix || path === source.rootPath || path.startsWith(prefix))
        .map((path) => (prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path))
        .filter((path) => !path.split("/").slice(0, -1).some((segment) => segment.startsWith(".")))
        .filter((path) => isMarkdown(path))
        .filter(Boolean);

      state.files = files.sort((a, b) => a.localeCompare(b));
      state.collapsedPaths.clear();
      for (const filePath of state.files) {
        const parts = filePath.split("/");
        let current = "";
        for (let i = 0; i < parts.length - 1; i += 1) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          state.collapsedPaths.add(current);
        }
      }

      if (state.initialPage && state.files.includes(state.initialPage)) {
        const parts = state.initialPage.split("/");
        let current = "";
        for (let i = 0; i < parts.length - 1; i += 1) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          state.collapsedPaths.delete(current);
        }
      }
      tree.renderTree(viewer.openFile);

      if (truncated) {
        setStatus("Loaded with truncated tree; some files may be missing.", true);
      } else {
        setStatus(`Loaded ${state.files.length} Markdown files.`);
      }

      const firstDoc = getDefaultDocPath();

      const initialDoc = state.initialPage && state.files.includes(state.initialPage) ? state.initialPage : "";

      const testDoc = getTestPage();
      if (testDoc) {
        viewer.openFile(testDoc);
      } else if (initialDoc) {
        viewer.openFile(initialDoc, state.initialAnchor);
      } else if (firstDoc) {
        viewer.openFile(firstDoc);
      }
    } catch (err) {
      dom.treeEl.innerHTML = "";
      dom.metaEl.textContent = "";
      renderFinalLoadError(err);
    }
  }

  dom.treeSearchEl.addEventListener("input", (event) => {
    state.treeSearch = event.target.value;
    tree.renderTree(viewer.openFile);
  });

  if (dom.treePanelToggleBtnEl) {
    dom.treePanelToggleBtnEl.addEventListener("click", () => {
      setTreePanelCollapsed(!isTreePanelCollapsed);
    });
  }

  if (dom.metaEl) {
    dom.metaEl.addEventListener("click", (event) => {
      const target = event.target && typeof event.target.closest === "function"
        ? event.target.closest("#contentExpandBtn")
        : null;
      if (!target) return;
      setContentExpanded(!isContentExpanded);
    });
  }

  window.addEventListener("popstate", () => {
    if (!state.files.length) return;

    const params = new URLSearchParams(window.location.search);
    const page = params.get("page") || "";
    const anchor = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    const targetPath = page && state.files.includes(page) ? page : getDefaultDocPath();

    if (!targetPath) return;
    if (targetPath === state.activePath && !anchor) return;
    viewer.openFile(targetPath, anchor, { historyMode: "skip" });
  });

  initPanelResize();
  loadRepository();
})();
