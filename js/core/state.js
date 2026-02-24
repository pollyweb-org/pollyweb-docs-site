window.PortalState = {
  source: null,
  files: [],
  activePath: null,
  treeSearch: "",
  initialAnchor: decodeURIComponent(window.location.hash.replace(/^#/, "")),
  collapsedPaths: new Set(),
};
