import type { Active, Over } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';

import { taskFixture } from '@/test/fixtures';

import { boardAnnouncements } from './board-announcements';

const checkout = taskFixture({ title: 'Checkout', status: 'draft' });
const search = taskFixture({ title: 'Search', status: 'ready' });
const announce = boardAnnouncements([checkout, search]);

// Only the fields the announcements read; dnd-kit fills in the rest at runtime.
const active = { id: checkout.id, data: { current: { type: 'task' } } } as unknown as Active;
const overTask = { id: search.id, data: { current: { type: 'task' } } } as unknown as Over;
const overColumn = {
  id: 'column:done',
  data: { current: { type: 'column', status: 'done' } },
} as unknown as Over;

describe('boardAnnouncements', () => {
  it('names the task instead of its id', () => {
    const message = announce.onDragStart({ active });

    expect(message).toBe('Picked up task "Checkout".');
    expect(message).not.toContain(checkout.id);
  });

  it('names the column or the card the task is over', () => {
    expect(announce.onDragOver({ active, over: overColumn })).toBe(
      'Task "Checkout" is over the Done column.',
    );
    expect(announce.onDragOver({ active, over: overTask })).toBe(
      'Task "Checkout" is over task "Search" in Ready.',
    );
    expect(announce.onDragOver({ active, over: null })).toBe(
      'Task "Checkout" is no longer over a column.',
    );
  });

  it('says where the task was dropped', () => {
    expect(announce.onDragEnd({ active, over: overTask })).toBe(
      'Task "Checkout" was dropped in Ready.',
    );
    expect(announce.onDragEnd({ active, over: null })).toBe(
      'Task "Checkout" was dropped outside the board and did not move.',
    );
  });

  it('announces a cancelled drag', () => {
    expect(announce.onDragCancel({ active, over: null })).toBe(
      'Moving task "Checkout" was cancelled.',
    );
  });
});
