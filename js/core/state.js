window.PortalState = {
  source: null,
  files: [],
  activePath: null,
  initialAnchor: decodeURIComponent(window.location.hash.replace(/^#/, "")),
  collapsedPaths: new Set(),
};
