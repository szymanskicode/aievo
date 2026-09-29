import { describe, expect, it } from 'vitest';

import { dropTargetOf } from './drop-target';
import type { DragEnd } from './drop-target';

/** A card of height 40 hovering over a target that spans 100–140 (middle at 120). */
function dragEnd(draggedTop: number | null, data?: unknown): DragEnd {
  return {
    active: {
      rect: {
        current: { translated: draggedTop === null ? null : { top: draggedTop, height: 40 } },
      },
    },
    over: { id: 'task-2', rect: { top: 100, height: 40 }, data: { current: data } },
  };
}

describe('dropTargetOf', () => {
  it('returns nothing when the card was dropped outside the board', () => {
    expect(dropTargetOf({ ...dragEnd(0), over: null })).toBeNull();
  });

  it('reads the status of a column', () => {
    expect(dropTargetOf(dragEnd(0, { type: 'column', status: 'ready' }))).toEqual({
      kind: 'column',
      status: 'ready',
    });
  });

  it('places the card before a task when its middle is above the task middle', () => {
    expect(dropTargetOf(dragEnd(70))).toEqual({
      kind: 'task',
      taskId: 'task-2',
      placeAfter: false,
    });
  });

  it('places the card after a task when its middle is below the task middle', () => {
    expect(dropTargetOf(dragEnd(110, { type: 'task' }))).toEqual({
      kind: 'task',
      taskId: 'task-2',
      placeAfter: true,
    });
  });

  it('places the card before a task when the dragged position is unknown', () => {
    expect(dropTargetOf(dragEnd(null))).toEqual({
      kind: 'task',
      taskId: 'task-2',
      placeAfter: false,
    });
  });
});
