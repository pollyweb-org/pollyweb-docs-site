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

function createCaret(collapsed) {
  const span = document.createElement("span");
  span.className = `tree-caret${collapsed ? " collapsed" : ""}`;
  span.innerHTML =
    '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.25 5 6.25l3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return span;
}

function stripFileExtension(name) {
  return name.replace(/\.[^/.]+$/, "");
}

function stripLeadingNumber(name) {
  return name.replace(/^\d+\s*[-_.:)]*\s*/, "");
}

function formatFileLabel(name) {
  return stripLeadingNumber(stripFileExtension(name));
}

function formatFolderLabel(name) {
  return stripLeadingNumber(name);
}

function isReadmeFile(name) {
  return /^readme(\.[^/.]+)?$/i.test(name);
}

function isTopLevelReadme(path) {
  if (!path || path.includes("/")) return false;
  return isReadmeFile(path);
}

function createHomeIcon() {
  const span = document.createElement("span");
  span.className = "tree-icon";
  span.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 7.1 8 2.5l5.8 4.6v6.2a.7.7 0 0 1-.7.7h-3.3V9.5H6.2V14H2.9a.7.7 0 0 1-.7-.7V7.1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  return span;
}

window.createTreeComponent = function createTreeComponent(state, treeEl) {
  function createFileButton(fullPath, onOpenFile) {
    const btn = document.createElement("button");
    btn.className = "tree-btn tree-file";
    btn.type = "button";
    btn.dataset.path = fullPath;

    const spacer = document.createElement("span");
    spacer.className = "tree-caret";
    spacer.style.opacity = "0";
    const label = document.createElement("span");
    const fileName = fullPath.split("/").pop() || fullPath;
    const isHome = isTopLevelReadme(fullPath);
    label.textContent = isHome ? "Home" : formatFileLabel(fileName);

    btn.appendChild(spacer);
    if (isHome) {
      btn.appendChild(createHomeIcon());
    }
    btn.appendChild(label);

    if (state.activePath === fullPath) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => onOpenFile(fullPath));
    return btn;
  }

  function renderTreeNode(node, parentPath, onOpenFile) {
    const ul = document.createElement("ul");
    const keys = Object.keys(node).sort((a, b) => {
      const aHome = !parentPath && node[a] === null && isReadmeFile(a);
      const bHome = !parentPath && node[b] === null && isReadmeFile(b);
      if (aHome !== bHome) return aHome ? -1 : 1;

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
        if (name === "$") {
          const lifted = renderTreeNode(node[name], fullPath, onOpenFile);
          for (const child of Array.from(lifted.children)) {
            ul.appendChild(child);
          }
          continue;
        }

        const isCollapsed = !state.treeSearch && state.collapsedPaths.has(fullPath);
        const dirBtn = document.createElement("button");
        dirBtn.className = "tree-btn";
        dirBtn.type = "button";

        const caret = createCaret(isCollapsed);
        const label = document.createElement("span");
        label.textContent = formatFolderLabel(name);
        label.style.color = "var(--muted)";

        dirBtn.appendChild(caret);
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
        li.appendChild(createFileButton(fullPath, onOpenFile));
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

    const query = state.treeSearch.trim().toLowerCase();
    const visibleFiles = query
      ? state.files.filter((path) => path.toLowerCase().includes(query))
      : state.files;

    if (!visibleFiles.length) {
      treeEl.innerHTML = '<p class="hint">No documents match your search.</p>';
      return;
    }

    const structure = buildNodes(visibleFiles);
    treeEl.appendChild(renderTreeNode(structure, "", onOpenFile));
  }

  return {
    renderTree,
  };
};
