function buildNodes(paths) {
  const root = {};

  for (const fullPath of paths) {
    const parts = fullPath.split("/");
    let cursor = root;

    parts.forEach((name, idx) => {
      const isLeaf = idx === parts.length - 1;
      if (!cursor[name]) {
        cursor[name] = isLeaf ? null : {};
      }
      if (!isLeaf) {
        cursor = cursor[name];
      }
    });
  }

  return root;
}

function createTreeIcon(kind) {
  const span = document.createElement("span");
  span.className = "tree-icon";
  if (kind === "folder") {
    span.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 2h4.1l1.2 1.4h7.2c.96 0 1.75.79 1.75 1.75v6.6c0 .96-.79 1.75-1.75 1.75H1.75C.79 13.5 0 12.71 0 11.75v-8C0 2.79.79 2 1.75 2Z"/></svg>';
  } else {
    span.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.75 1h5.8c.46 0 .9.18 1.22.5l1.73 1.73c.32.32.5.76.5 1.22v9.8c0 .96-.79 1.75-1.75 1.75h-7.5C2.79 16 2 15.21 2 14.25v-11.5C2 1.79 2.79 1 3.75 1Zm5.5 1.5v2.1c0 .78.62 1.4 1.4 1.4h2.1"/></svg>';
  }
  return span;
}

function createCaret(collapsed) {
  const span = document.createElement("span");
  span.className = `tree-caret${collapsed ? " collapsed" : ""}`;
  span.innerHTML =
    '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.25 5 6.25l3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return span;
}

window.createTreeComponent = function createTreeComponent(state, treeEl) {
  function renderTreeNode(node, parentPath, onOpenFile) {
    const ul = document.createElement("ul");
    const keys = Object.keys(node).sort((a, b) => {
      const aDir = node[a] !== null;
      const bDir = node[b] !== null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.localeCompare(b);
    });

    for (const name of keys) {
      const li = document.createElement("li");
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      const isDir = node[name] !== null;

      if (isDir) {
        const isCollapsed = state.collapsedPaths.has(fullPath);
        const dirBtn = document.createElement("button");
        dirBtn.className = "tree-btn";
        dirBtn.type = "button";

        const caret = createCaret(isCollapsed);
        const icon = createTreeIcon("folder");
        const label = document.createElement("span");
        label.textContent = name;
        label.style.color = "var(--muted)";

        dirBtn.appendChild(caret);
        dirBtn.appendChild(icon);
        dirBtn.appendChild(label);
        dirBtn.addEventListener("click", () => {
          if (state.collapsedPaths.has(fullPath)) {
            state.collapsedPaths.delete(fullPath);
          } else {
            state.collapsedPaths.add(fullPath);
          }
          renderTree(onOpenFile);
        });
        li.appendChild(dirBtn);

        if (!isCollapsed) {
          li.appendChild(renderTreeNode(node[name], fullPath, onOpenFile));
        }
      } else {
        const btn = document.createElement("button");
        btn.className = "tree-btn";
        btn.type = "button";
        btn.dataset.path = fullPath;

        const spacer = document.createElement("span");
        spacer.className = "tree-caret";
        spacer.style.opacity = "0";
        const icon = createTreeIcon("file");
        const label = document.createElement("span");
        label.textContent = name;

        btn.appendChild(spacer);
        btn.appendChild(icon);
        btn.appendChild(label);

        if (state.activePath === fullPath) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", () => onOpenFile(fullPath));
        li.appendChild(btn);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  function renderTree(onOpenFile) {
    treeEl.innerHTML = "";
    if (!state.files.length) {
      treeEl.innerHTML = '<p class="hint">No Markdown files found for this path.</p>';
      return;
    }

    const structure = buildNodes(state.files);
    treeEl.appendChild(renderTreeNode(structure, "", onOpenFile));
  }

  return {
    renderTree,
  };
};
