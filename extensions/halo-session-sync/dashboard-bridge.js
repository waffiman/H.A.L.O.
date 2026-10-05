document.documentElement.dataset.haloSessionSync = '1';
document.dispatchEvent(new CustomEvent('halo-session-sync-ready'));
