import { fetchTree, resolveSource, toRawUrl } from "./core/api.js";
import { dom, setStatus } from "./core/dom.js";
import { state } from "./core/state.js";
import { escapeHtml, isMarkdown } from "./core/utils.js";
import { createTreeComponent } from "./components/tree.js";
import { createViewerComponent } from "./components/viewer.js";

if (!globalThis.marked) {
  throw new Error("Marked is required but was not loaded.");
}

globalThis.marked.setOptions({
  gfm: true,
  breaks: false,
});

const tree = createTreeComponent(state, dom.treeEl);
const viewer = createViewerComponent({
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
      .filter((path) => isMarkdown(path))
      .filter(Boolean);

    state.files = files.sort((a, b) => a.localeCompare(b));
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

    if (firstDoc) {
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
dom.repoUrlEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadRepository();
  }
});

loadRepository();
