import { describe, it, expect, vi } from 'vitest';
import { registerBackground, ACTIVATED } from '../../src/lib/background-wiring.js';
import { createActivationListener } from '../../src/lib/activation.js';

function makeChrome({ openImpl, sendImpl } = {}) {
  const order = [];
  let listener;
  return {
    order,
    sidePanel: {
      setPanelBehavior: vi.fn(async () => {}),
      open: vi.fn((o) => (order.push('open'), openImpl ? openImpl(o) : Promise.resolve())),
    },
    action: { onClicked: { addListener: (fn) => (listener = fn) } },
    runtime: { sendMessage: vi.fn((m) => (order.push('send'), sendImpl ? sendImpl(m) : Promise.resolve())) },
    click: (tab) => listener(tab),
  };
}

describe('background wiring', () => {
  it('never enables openPanelOnActionClick (it does not grant activeTab)', () => {
    const c = makeChrome();
    registerBackground(c);
    expect(c.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
    expect(c.sidePanel.setPanelBehavior).not.toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });
  it('opens the panel synchronously inside the click listener (user gesture), then notifies', async () => {
    const c = makeChrome();
    registerBackground(c);
    c.click({ id: 42 });
    expect(c.sidePanel.open).toHaveBeenCalledTimes(1); // called before the listener returned: no await before it
    expect(c.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
    await new Promise((r) => setTimeout(r, 0));
    expect(c.runtime.sendMessage).toHaveBeenCalledWith({ type: ACTIVATED, tabId: 42 });
    expect(c.order).toEqual(['open', 'send']);
  });
  it('swallows "no receiver" (rejection and sync throw) and open() failures', async () => {
    const rejected = makeChrome({ sendImpl: () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')) });
    registerBackground(rejected);
    rejected.click({ id: 1 });
    const thrown = makeChrome({
      sendImpl: () => {
        throw new Error('boom');
      },
    });
    registerBackground(thrown);
    thrown.click({ id: 2 });
    const openFails = makeChrome({ openImpl: () => Promise.reject(new Error('gesture')) });
    registerBackground(openFails);
    openFails.click({ id: 3 });
    await new Promise((r) => setTimeout(r, 10)); // an unhandled rejection would fail the run
    expect(rejected.runtime.sendMessage).toHaveBeenCalled();
    expect(thrown.runtime.sendMessage).toHaveBeenCalled();
  });
});

describe('activation listener (panel side)', () => {
  const make = () => {
    const onActivated = vi.fn();
    return { onActivated, listen: createActivationListener({ runtimeId: 'me', onActivated }) };
  };
  it('accepts our own tldr:activated message', () => {
    const { listen, onActivated } = make();
    listen({ type: 'tldr:activated', tabId: 7 }, { id: 'me' });
    expect(onActivated).toHaveBeenCalledWith(7);
  });
  it('ignores other senders, missing sender ids, wrong types and bad tab ids', () => {
    const { listen, onActivated } = make();
    listen({ type: 'tldr:activated', tabId: 7 }, { id: 'evil-extension' });
    listen({ type: 'tldr:activated', tabId: 7 }, {});
    listen({ type: 'tldr:activated', tabId: 7 }, undefined);
    listen({ type: 'other', tabId: 7 }, { id: 'me' });
    listen({ type: 'tldr:activated', tabId: '7' }, { id: 'me' });
    listen({ type: 'tldr:activated', tabId: 7.5 }, { id: 'me' });
    listen({ type: 'tldr:activated' }, { id: 'me' });
    listen(null, { id: 'me' });
    expect(onActivated).not.toHaveBeenCalled();
  });
});
