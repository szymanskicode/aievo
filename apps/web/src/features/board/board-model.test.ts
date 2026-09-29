import { describe, expect, it } from 'vitest';

import { taskFixture } from '@/test/fixtures';

import { groupByStatus, moveTask, positionBetween, resolveDrop } from './board-model';

const a = taskFixture({ title: 'a', status: 'draft', position: 1 });
const b = taskFixture({ title: 'b', status: 'draft', position: 2 });
const c = taskFixture({ title: 'c', status: 'draft', position: 3 });
const r = taskFixture({ title: 'r', status: 'ready', position: 5 });
const tasks = [c, r, a, b];

function titles(list: { title: string }[]): string[] {
  return list.map((task) => task.title);
}

describe('groupByStatus', () => {
  it('puts every task in its status column, in board order', () => {
    const columns = groupByStatus(tasks);

    expect(titles(columns.draft)).toEqual(['a', 'b', 'c']);
    expect(titles(columns.ready)).toEqual(['r']);
    expect(columns.done).toEqual([]);
  });

  it('orders equal positions by creation time', () => {
    const older = taskFixture({
      title: 'older',
      position: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = taskFixture({
      title: 'newer',
      position: 1,
      createdAt: '2026-02-01T00:00:00.000Z',
    });

    expect(titles(groupByStatus([newer, older]).draft)).toEqual(['older', 'newer']);
  });
});

describe('positionBetween', () => {
  it('puts a card in an empty column at 1', () => {
    expect(positionBetween(undefined, undefined)).toBe(1);
  });

  it('puts a card before the first, after the last, or halfway between two', () => {
    expect(positionBetween(undefined, 3)).toBe(2);
    expect(positionBetween(3, undefined)).toBe(4);
    expect(positionBetween(1, 2)).toBe(1.5);
  });
});

describe('moveTask', () => {
  it('moves a task to another column and computes its position', () => {
    const move = moveTask(tasks, a.id, 'ready', 0);

    expect(move?.patch).toEqual({ status: 'ready', position: 4 });
    const columns = groupByStatus(move?.tasks ?? []);
    expect(titles(columns.ready)).toEqual(['a', 'r']);
    expect(titles(columns.draft)).toEqual(['b', 'c']);
  });

  it('reorders within a column', () => {
    const move = moveTask(tasks, a.id, 'draft', 1);

    expect(move?.patch).toEqual({ status: 'draft', position: 2.5 });
    expect(titles(groupByStatus(move?.tasks ?? []).draft)).toEqual(['b', 'a', 'c']);
  });

  it('moves a task to the end of an empty column', () => {
    expect(moveTask(tasks, c.id, 'done', 0)?.patch).toEqual({ status: 'done', position: 1 });
  });

  it('clamps the index to the column', () => {
    expect(moveTask(tasks, a.id, 'ready', 99)?.patch).toEqual({ status: 'ready', position: 6 });
  });

  it('returns null when the task stays in place or does not exist', () => {
    expect(moveTask(tasks, b.id, 'draft', 1)).toBeNull();
    expect(moveTask(tasks, 'missing', 'draft', 0)).toBeNull();
  });

  it('does not change the input', () => {
    moveTask(tasks, a.id, 'ready', 0);

    expect(a.status).toBe('draft');
  });
});

describe('resolveDrop', () => {
  it('drops on a column at its end', () => {
    expect(resolveDrop(tasks, a.id, { kind: 'column', status: 'ready' })).toEqual({
      status: 'ready',
      index: 1,
    });
    expect(resolveDrop(tasks, a.id, { kind: 'column', status: 'draft' })).toEqual({
      status: 'draft',
      index: 2,
    });
  });

  it('takes the place of a card in the same column', () => {
    expect(resolveDrop(tasks, a.id, { kind: 'task', taskId: c.id, placeAfter: false })).toEqual({
      status: 'draft',
      index: 2,
    });
  });

  it('goes above or below a card in another column', () => {
    expect(resolveDrop(tasks, r.id, { kind: 'task', taskId: b.id, placeAfter: false })).toEqual({
      status: 'draft',
      index: 1,
    });
    expect(resolveDrop(tasks, r.id, { kind: 'task', taskId: b.id, placeAfter: true })).toEqual({
      status: 'draft',
      index: 2,
    });
  });
});
