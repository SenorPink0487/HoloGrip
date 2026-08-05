import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameScheduler } from '../src/frameBudget.js';
import { createFrameCoordinator } from '../src/runtime/frameCoordinator.js';

test('background drain pauses when render exceeds 16.7 ms', () => {
  const events = [];
  let now = 0;
  const coordinator = createFrameCoordinator({
    now: () => now,
    onRender: () => {
      // Simulate a 20 ms present.
      now += 20;
      events.push('render');
    },
  });
  coordinator.enqueue({
    id: 'bg',
    step: () => { events.push('task'); },
  });
  now = 0;
  const result = coordinator.frame(0);
  assert.ok(result.renderMs > 16.7);
  assert.deepEqual(events, ['render']);
  assert.equal(coordinator.pending, 1);
});

test('background drain runs when render is within budget', () => {
  const events = [];
  let now = 0;
  const coordinator = createFrameCoordinator({
    now: () => now,
    onRender: () => {
      now += 4;
      events.push('render');
    },
  });
  coordinator.enqueue({
    id: 'bg',
    step: () => { events.push('task'); },
  });
  now = 0;
  coordinator.frame(0);
  assert.deepEqual(events, ['render', 'task']);
  assert.equal(coordinator.pending, 0);
});

test('frame scheduler records job timing and respects 2 ms default budget', () => {
  const timed = [];
  const scheduler = createFrameScheduler({
    budgetMs: 2,
    maxJobsPerPulse: 1,
    onJobTimed: (id, dt) => timed.push({ id, dt }),
  });
  let ran = 0;
  scheduler.schedule('exp:test', () => { ran += 1; }, { priority: 10 });
  assert.equal(scheduler.drain(2), 1);
  assert.equal(ran, 1);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].id, 'exp:test');
});
