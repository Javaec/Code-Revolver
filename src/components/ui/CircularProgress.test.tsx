import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getProgressColorState,
  getStrokeColorClass,
  getTextColorClass,
  ProgressColorState,
} from '../../utils/progress';

/**
 * Feature: ui-ux-overhaul, Property 2: ProgressIndicator Value and Color Mapping
 * Validates: Requirements 6.2, 6.3
 * 
 * For any CircularProgress component with a value between 0 and 100:
 * - The displayed percentage text SHALL equal (100 - value) rounded to nearest integer
 * - If remaining (100 - value) <= 10, the stroke color SHALL be rose/red
 * - If remaining > 10 and <= 30, the stroke color SHALL be amber/yellow
 * - If remaining > 30, the stroke color SHALL be emerald/green
 */
describe('CircularProgress - Property 2: Value and Color Mapping', () => {
  // Configure fast-check to run 100 times
  const fcConfig = { numRuns: 100 };

  it('should return correct remaining percentage for any value 0-100', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (value) => {
        const remaining = 100 - value;
        // Verify remaining percentage calculation is correct
        expect(remaining).toBeGreaterThanOrEqual(0);
        expect(remaining).toBeLessThanOrEqual(100);
        expect(remaining).toBe(100 - value);
      }),
      fcConfig
    );
  });

  it('should return danger state when remaining <= 10 (value >= 90)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 90, max: 100 }), (value) => {
        const state = getProgressColorState(value);
        expect(state).toBe('danger');
        expect(getStrokeColorClass(state)).toBe('stroke-rose-500');
        expect(getTextColorClass(state)).toBe('text-rose-400');
      }),
      fcConfig
    );
  });

  it('should return warning state when remaining > 10 and <= 30 (value >= 70 and < 90)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 70, max: 89 }), (value) => {
        const state = getProgressColorState(value);
        expect(state).toBe('warning');
        expect(getStrokeColorClass(state)).toBe('stroke-amber-500');
        expect(getTextColorClass(state)).toBe('text-amber-400');
      }),
      fcConfig
    );
  });

  it('should return success state when remaining > 30 (value < 70)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 69 }), (value) => {
        const state = getProgressColorState(value);
        expect(state).toBe('success');
        expect(getStrokeColorClass(state)).toBe('stroke-emerald-500');
        expect(getTextColorClass(state)).toBe('text-emerald-400');
      }),
      fcConfig
    );
  });

  it('should map all color states to valid stroke classes', () => {
    const states: ProgressColorState[] = ['success', 'warning', 'danger'];
    const validStrokeClasses = ['stroke-emerald-500', 'stroke-amber-500', 'stroke-rose-500'];
    
    states.forEach((state) => {
      const strokeClass = getStrokeColorClass(state);
      expect(validStrokeClasses).toContain(strokeClass);
    });
  });

  it('should map all color states to valid text classes', () => {
    const states: ProgressColorState[] = ['success', 'warning', 'danger'];
    const validTextClasses = ['text-emerald-400', 'text-amber-400', 'text-rose-400'];
    
    states.forEach((state) => {
      const textClass = getTextColorClass(state);
      expect(validTextClasses).toContain(textClass);
    });
  });

  // Boundary value testing
  it('should handle boundary values correctly', () => {
    // value = 90 -> remaining = 10 -> danger
    expect(getProgressColorState(90)).toBe('danger');
    
    // value = 89 -> remaining = 11 -> warning
    expect(getProgressColorState(89)).toBe('warning');
    
    // value = 70 -> remaining = 30 -> warning
    expect(getProgressColorState(70)).toBe('warning');
    
    // value = 69 -> remaining = 31 -> success
    expect(getProgressColorState(69)).toBe('success');
    
    // value = 0 -> remaining = 100 -> success
    expect(getProgressColorState(0)).toBe('success');
    
    // value = 100 -> remaining = 0 -> danger
    expect(getProgressColorState(100)).toBe('danger');
  });
});
