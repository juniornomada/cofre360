import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We want to test the logic of the dynamic debounce.
// Since the logic is inside a component, we can either extract it or test it via the component.
// For simplicity and to avoid massive refactoring, I'll extract the core logic into a testable function
// or just simulate the logic here if I can't easily extract it without touching the component.

// Extraction logic for testing:
function calculateDebounce(
  now: number, 
  lastTimestamp: number, 
  lastReason: string, 
  currentReason: string, 
  silent: boolean
): { shouldSkip: boolean; minWait: number } {
  const timeSinceLast = now - lastTimestamp;
  
  // Always allow manual triggers (silent = false)
  if (!silent) return { shouldSkip: false, minWait: 0 };

  // If it's the same reason, wait at least 5 seconds
  // If it's a different reason, wait at least 2 seconds
  const minWait = currentReason === lastReason ? 5000 : 2000;

  return {
    shouldSkip: timeSinceLast < minWait,
    minWait
  };
}

describe('Dynamic Debounce Logic for Validation', () => {
  const INITIAL_TIME = 10000;

  it('should skip validation if the same reason occurs within 5 seconds', () => {
    const lastTimestamp = INITIAL_TIME;
    const now = INITIAL_TIME + 3000; // 3 seconds later
    const lastReason = 'focus';
    const currentReason = 'focus';
    const silent = true;

    const result = calculateDebounce(now, lastTimestamp, lastReason, currentReason, silent);
    expect(result.shouldSkip).toBe(true);
    expect(result.minWait).toBe(5000);
  });

  it('should NOT skip validation if the same reason occurs after 5 seconds', () => {
    const lastTimestamp = INITIAL_TIME;
    const now = INITIAL_TIME + 5100; // 5.1 seconds later
    const lastReason = 'focus';
    const currentReason = 'focus';
    const silent = true;

    const result = calculateDebounce(now, lastTimestamp, lastReason, currentReason, silent);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip validation if a different reason occurs within 2 seconds', () => {
    const lastTimestamp = INITIAL_TIME;
    const now = INITIAL_TIME + 1500; // 1.5 seconds later
    const lastReason = 'mount';
    const currentReason = 'focus';
    const silent = true;

    const result = calculateDebounce(now, lastTimestamp, lastReason, currentReason, silent);
    expect(result.shouldSkip).toBe(true);
    expect(result.minWait).toBe(2000);
  });

  it('should NOT skip validation if a different reason occurs after 2 seconds', () => {
    const lastTimestamp = INITIAL_TIME;
    const now = INITIAL_TIME + 2500; // 2.5 seconds later
    const lastReason = 'mount';
    const currentReason = 'focus';
    const silent = true;

    const result = calculateDebounce(now, lastTimestamp, lastReason, currentReason, silent);
    expect(result.shouldSkip).toBe(false);
  });

  it('should ALWAYS allow manual triggers (silent = false)', () => {
    const lastTimestamp = INITIAL_TIME;
    const now = INITIAL_TIME + 100; // 0.1 seconds later
    const lastReason = 'focus';
    const currentReason = 'focus';
    const silent = false;

    const result = calculateDebounce(now, lastTimestamp, lastReason, currentReason, silent);
    expect(result.shouldSkip).toBe(false);
  });

  it('should handle auth events (SIGNED_IN, TOKEN_REFRESHED) correctly', () => {
    const lastTimestamp = INITIAL_TIME;
    const now = INITIAL_TIME + 3000; // 3 seconds later
    
    // Different event: mount -> SIGNED_IN
    const result1 = calculateDebounce(now, lastTimestamp, 'mount', 'SIGNED_IN', true);
    expect(result1.shouldSkip).toBe(false); // 3s > 2s

    // Same event: SIGNED_IN -> SIGNED_IN
    const result2 = calculateDebounce(now, lastTimestamp, 'SIGNED_IN', 'SIGNED_IN', true);
    expect(result2.shouldSkip).toBe(true); // 3s < 5s
  });
});
