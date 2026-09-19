// Injected with page.addInitScript(installFake, scenario). Must be self-contained (serialized).
export function installFake(scenario) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calls = { create: [], summarize: [], stream: [], destroyed: 0 };
  window.__fakeCalls = calls;
  if (scenario === 'missing') {
    delete globalThis.Summarizer;
    return;
  }
  const SUMMARY = ['**Main idea:** The city council approved a new bike-lane network.', '', '- Construction starts in spring and takes two years.', '- Funding comes from a regional transport grant.', '- Residents can comment until the end of the month.'].join('\n');
  let downloaded = scenario !== 'download';
  const quota = scenario === 'quota' ? 60 : 4000;
  const quotaErr = (requested) => Object.assign(new DOMException('too long', 'QuotaExceededError'), { requested, quota });

  class FakeSummarizer {
    constructor(opts) {
      this.opts = opts;
      this.inputQuota = quota;
    }
    static async availability() {
      if (scenario === 'unavailable') return 'unavailable';
      return downloaded ? 'available' : 'downloadable';
    }
    static async create(opts) {
      calls.create.push({ type: opts.type, length: opts.length, outputLanguage: opts.outputLanguage, activation: navigator.userActivation.isActive });
      if (!downloaded) {
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          opts.monitor?.({ addEventListener: (_n, cb) => setTimeout(() => cb({ loaded: f }), 0) });
          await sleep(120);
        }
        downloaded = true;
      }
      return new FakeSummarizer(opts);
    }
    async measureInputUsage(t) {
      return Math.ceil(t.length / 4);
    }
    async summarize(t) {
      calls.summarize.push({ len: t.length, type: this.opts.type });
      const tokens = Math.ceil(t.length / 4);
      if (tokens > quota) throw quotaErr(tokens);
      return '- chunk point';
    }
    summarizeStreaming(t, o = {}) {
      calls.stream.push({ len: t.length, type: this.opts.type, length: this.opts.length });
      const tokens = Math.ceil(t.length / 4);
      return new ReadableStream({
        async start(ctrl) {
          o.signal?.addEventListener('abort', () => { try { ctrl.error(new DOMException('Aborted', 'AbortError')); } catch { /* closed */ } });
          if (tokens > quota) return ctrl.error(quotaErr(tokens));
          if (scenario === 'error') {
            await sleep(50);
            return ctrl.error(new Error('The model crashed unexpectedly'));
          }
          if (scenario === 'slow') {
            ctrl.enqueue('Working');
            await sleep(60000);
          }
          const words = SUMMARY.split(/(?<= )/);
          for (const w of words) {
            ctrl.enqueue(w);
            await sleep(15);
          }
          ctrl.close();
        },
      });
    }
    destroy() {
      calls.destroyed++;
    }
  }
  // ReadableStream is async-iterable in Chrome 124+.
  globalThis.Summarizer = FakeSummarizer;
}
