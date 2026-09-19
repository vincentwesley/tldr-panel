// Service-worker wiring, separated from the chrome global so it can be unit tested with a stub.
export const ACTIVATED = 'tldr:activated';

/**
 * A real toolbar click (or the _execute_action shortcut) fires action.onClicked and grants activeTab for
 * that tab. openPanelOnActionClick does NOT grant activeTab (verified in Chrome 153), so we open the panel
 * ourselves. sidePanel.open() needs a user gesture, so it must be the first thing the listener does.
 */
export function registerBackground(chromeApi) {
  // Persisted browser-side: make sure an older install that enabled it does not swallow onClicked.
  Promise.resolve(chromeApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })).catch(() => {});

  chromeApi.action.onClicked.addListener((tab) => {
    // No await before open(): the user gesture would be lost.
    const opened = chromeApi.sidePanel.open({ tabId: tab.id });
    const notify = () => {
      // If a panel is already open it re-summarizes this tab; if not, nobody receives it (fine).
      try {
        const p = chromeApi.runtime.sendMessage({ type: ACTIVATED, tabId: tab.id });
        Promise.resolve(p).catch(() => {});
      } catch {
        /* no receiver */
      }
    };
    Promise.resolve(opened).then(notify, notify);
  });
}
