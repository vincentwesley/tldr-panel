import { ACTIVATED } from './background-wiring.js';

/**
 * runtime.onMessage listener factory. Only our own extension may trigger a re-summarize, and only with a
 * numeric tab id. Everything else is ignored (no response, no side effects).
 */
export function createActivationListener({ runtimeId, onActivated }) {
  return (message, sender) => {
    if (!sender || sender.id !== runtimeId) return false;
    if (!message || message.type !== ACTIVATED || !Number.isInteger(message.tabId)) return false;
    onActivated(message.tabId);
    return false;
  };
}
