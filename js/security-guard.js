(() => {
  if (window.self === window.top) return;
  document.documentElement.hidden = true;
  try {
    window.top.location = window.self.location;
  } catch {
    // GitHub Pages cannot set frame-ancestors response headers. Keep the app
    // hidden in a frame when the browser blocks top-level navigation.
  }
})();
