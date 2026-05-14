import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getLevelStepAlpha } from './level-system'

describe('getLevelStepAlpha', () => {
  test('clamps large frame deltas so level interpolation cannot overshoot', () => {
    assert.equal(getLevelStepAlpha(10), 1)
  })

  test('preserves normal frame deltas for smooth level animation', () => {
    assert.equal(getLevelStepAlpha(1 / 60), 0.2)
  })
})
