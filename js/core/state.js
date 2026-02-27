const initialParams = new URLSearchParams(window.location.search);

window.PortalState = {
  source: null,
  files: [],
  activePath: null,
  treeSearch: "",
  initialPage: initialParams.get("page") || "",
  initialAnchor: decodeURIComponent(window.location.hash.replace(/^#/, "")),
  pageTokenByPath: new Map(),
  pagePathByToken: new Map(),
  collapsedPaths: new Set(),
};
