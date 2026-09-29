import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import '@/lib/zod-messages';
import { preloadPages } from '@/router';

import { server } from './server';

// Route pages are lazy chunks. Loading them here keeps that cost out of the first test of a
// file, whose `findBy*` would otherwise race a cold import while `pnpm test` runs every package
// in parallel.
await preloadPages();

// jsdom lacks APIs that Radix UI calls when opening dialogs, selects and menus.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
// The router restores scroll position on navigation; jsdom only logs "not implemented".
window.scrollTo = () => {};

// Any request without a handler fails the test instead of reaching the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
