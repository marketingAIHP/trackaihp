export async function registerPlatformRuntime() {
  if (typeof document !== 'undefined' && !document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/manifest.json';
    document.head.appendChild(manifestLink);
  }

  if (typeof document !== 'undefined' && !document.querySelector('meta[name="theme-color"]')) {
    const themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    themeMeta.content = '#0f172a';
    document.head.appendChild(themeMeta);
  }

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {
        // Removing stale caches is best-effort on web.
      });
  });
}
