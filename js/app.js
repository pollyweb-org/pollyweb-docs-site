(function bootstrapPortal() {
  const STATIC_SOURCE_URL = "https://github.com/pollyweb-org/pollyweb-docs";
  const state = window.PortalState;
  const dom = window.PortalDom;
  const { escapeHtml, isMarkdown } = window.PortalUtils;
  const { fetchTree, resolveSource, fetchRawFile, toRawUrl } = window.PortalApi;
  const setStatus = window.setPortalStatus;
  const workspaceEl = document.getElementById("workspace");
  const treePanelEl = document.getElementById("treePanel");
  const dividerEl = document.getElementById("panelDivider");

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
    toRawUrl,
    renderTree: tree.renderTree,
  });

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
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
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

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function extractGitHubErrorInfo(error) {
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

    const payloadMessage =
      payload && typeof payload.message === "string" ? payload.message : "";
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

  function shouldRetryGitHubLoad(error) {
    const info = extractGitHubErrorInfo(error);
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
        <h3>GitHub is under heavy load</h3>
        <p>We're retrying in the background with exponential backoff.</p>
        <p class="muted">Target: ${escapeHtml(owner)}/${escapeHtml(repo)}@${escapeHtml(branchLabel)} | Retry ${retryLabel} in ${nextSeconds}s.</p>
        <p class="muted">Reason: ${escapeHtml(reason)}</p>
      </div>
    `;
  }

  function renderFinalLoadError(error) {
    const info = extractGitHubErrorInfo(error);
    const isRateLimitLike = info.isRateLimit || info.status === 429;
    if (isRateLimitLike) {
      dom.viewerEl.innerHTML = `
        <div class="viewer-load-state load-error">
          <div class="hourglass" aria-hidden="true">⌛</div>
          <h3>GitHub is temporarily overloaded</h3>
          <p>We retried automatically with exponential backoff, but GitHub is still rate-limiting requests.</p>
          <p class="muted">Please wait a bit and reload. Authenticated GitHub requests also raise the limit.</p>
        </div>
      `;
      setStatus("GitHub rate-limited this request. Retries were exhausted.", true);
      return;
    }

    dom.viewerEl.innerHTML = `<p class="hint">${escapeHtml(error.message)}</p>`;
    setStatus(error.message, true);
  }

  async function loadSourceWithRetry() {
    const parsed = window.PortalApi.parseGitHubUrl(STATIC_SOURCE_URL);
    const owner = parsed.owner;
    const repo = parsed.repo;
    const maxRetries = 4;
    const baseDelayMs = 1000;

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const source = await resolveSource(STATIC_SOURCE_URL);
        setStatus(`Fetching tree for ${source.owner}/${source.repo}@${source.branch} ...`);
        const treeResult = await fetchTree(source);
        return { source, treeResult };
      } catch (error) {
        if (!shouldRetryGitHubLoad(error) || attempt === maxRetries) {
          throw error;
        }

        const delayMs = baseDelayMs * (2 ** attempt);
        const reason = extractGitHubErrorInfo(error).message || "Temporary GitHub API failure";
        const branch = state.source && state.source.branch ? state.source.branch : parsed.branch;
        renderRetryState(owner, repo, branch, attempt + 1, maxRetries, delayMs, reason);
        setStatus(`GitHub is busy. Retrying ${attempt + 1}/${maxRetries} in ${Math.ceil(delayMs / 1000)}s ...`, true);
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
      dom.metaEl.textContent = "No file selected.";
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

      if (initialDoc) {
        viewer.openFile(initialDoc, state.initialAnchor);
      } else if (firstDoc) {
        viewer.openFile(firstDoc);
      }
    } catch (err) {
      dom.treeEl.innerHTML = "";
      dom.metaEl.textContent = "Load failed.";
      renderFinalLoadError(err);
    }
  }

  dom.treeSearchEl.addEventListener("input", (event) => {
    state.treeSearch = event.target.value;
    tree.renderTree(viewer.openFile);
  });

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
