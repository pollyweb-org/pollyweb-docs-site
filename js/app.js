(function bootstrapPortal() {
  const STATIC_SOURCE_URL = "https://github.com/pollyweb-org/pollyweb-docs";
  const state = window.PortalState;
  const dom = window.PortalDom;
  const { escapeHtml, isMarkdown } = window.PortalUtils;
  const { fetchTree, resolveSource, toRawUrl } = window.PortalApi;
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
    metaEl: dom.metaEl,
    setStatus,
    toRawUrl,
    renderTree: tree.renderTree,
  });

  function initPanelResize() {
    if (!workspaceEl || !treePanelEl || !dividerEl) return;

    const MIN_TREE_WIDTH = 160;
    const MIN_CONTENT_WIDTH = 320;
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

  async function loadRepository() {
    try {
      const source = await resolveSource(STATIC_SOURCE_URL);
      state.source = source;
      state.files = [];
      state.activePath = null;
      state.treeSearch = "";
      dom.treeSearchEl.value = "";
      dom.viewerEl.innerHTML = '<p class="hint">Loading document tree...</p>';
      dom.metaEl.textContent = "No file selected.";
      setStatus(`Fetching tree for ${source.owner}/${source.repo}@${source.branch} ...`);

      const { tree: fullTree, truncated } = await fetchTree(source);
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

      const firstDoc =
        state.files.find((p) => p.toLowerCase() === "readme.md") ||
        state.files.find((p) => p.toLowerCase().endsWith("/readme.md")) ||
        state.files[0];

      const initialDoc = state.initialPage && state.files.includes(state.initialPage) ? state.initialPage : "";

      if (initialDoc) {
        viewer.openFile(initialDoc, state.initialAnchor);
      } else if (firstDoc) {
        viewer.openFile(firstDoc);
      }
    } catch (err) {
      dom.treeEl.innerHTML = "";
      dom.viewerEl.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      dom.metaEl.textContent = "Load failed.";
      setStatus(err.message, true);
    }
  }

  dom.treeSearchEl.addEventListener("input", (event) => {
    state.treeSearch = event.target.value;
    tree.renderTree(viewer.openFile);
  });

  initPanelResize();
  loadRepository();
})();
