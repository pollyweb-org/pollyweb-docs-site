window.PortalState = {
  source: null,
  files: [],
  activePath: null,
  treeSearch: "",
  initialPage: new URLSearchParams(window.location.search).get("page") || "",
  initialAnchor: decodeURIComponent(window.location.hash.replace(/^#/, "")),
  collapsedPaths: new Set(),
};
