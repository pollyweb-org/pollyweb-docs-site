(function bootstrapPortal() {
  const state = window.PortalState;
  const dom = window.PortalDom;
  const { escapeHtml, isMarkdown } = window.PortalUtils;
  const { fetchTree, resolveSource, toRawUrl } = window.PortalApi;
  const setStatus = window.setPortalStatus;

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

  async function loadRepository() {
    const input = dom.repoUrlEl.value.trim();

    try {
      const source = await resolveSource(input);
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

  dom.loadBtnEl.addEventListener("click", loadRepository);
  dom.treeSearchEl.addEventListener("input", (event) => {
    state.treeSearch = event.target.value;
    tree.renderTree(viewer.openFile);
  });
  dom.repoUrlEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadRepository();
    }
  });

  loadRepository();
})();
