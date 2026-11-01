/**
 * Browser kill switch for pre-prod. Load before anything else:
 *   NODE_OPTIONS=--import=/app/dryRunGuard.js  HALO_DRY_RUN=1
 *
 * Patches the shared browser objects, so every launch site (agent, one-shots,
 * repair workers, probes) throws instead of opening a session on the VPS IP.
 * No-op unless HALO_DRY_RUN=1.
 */
const BLOCKED_METHODS = ['launch', 'launchPersistentContext', 'launchServer', 'connect', 'connectOverCDP'];

function blockBrowserType(browserType, label) {
  if (!browserType) return;
  for (const method of BLOCKED_METHODS) {
    Object.defineProperty(browserType, method, {
      configurable: true,
      value() {
        throw new Error(`[dry-run] ${label}.${method} blocked: HALO_DRY_RUN=1 forbids opening a browser`);
      },
    });
  }
}

if (process.env.HALO_DRY_RUN === '1') {
  for (const pkg of ['playwright', 'playwright-extra']) {
    let mod;
    try {
      mod = await import(pkg);
    } catch (e) {
      // Absent package has no launch sites to guard; any other failure must stop the run.
      if (e?.code === 'ERR_MODULE_NOT_FOUND') continue;
      throw e;
    }
    for (const name of ['chromium', 'firefox', 'webkit']) {
      blockBrowserType(mod[name], `${pkg}.${name}`);
    }
  }
}
