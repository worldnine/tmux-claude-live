import { describe, expect, test } from 'vitest'
import { CostFormatter } from '../../../src/formatters/CostFormatter'

describe('CostFormatter', () => {
  describe('format', () => {
    test('should format cost in currency format', () => {
      const testCases = [
        { cost: 0, expected: '$0.00' },
        { cost: 0.5, expected: '$0.50' },
        { cost: 1.85, expected: '$1.85' },
        { cost: 10.123, expected: '$10.12' },
        { cost: 100.999, expected: '$101.00' },
        { cost: 1000, expected: '$1000.00' },
        { cost: 0.001, expected: '$0.00' },
        { cost: 0.005, expected: '$0.01' }
      ]

      testCases.forEach(({ cost, expected }) => {
        expect(CostFormatter.format(cost, 'currency')).toBe(expected)
      })
    })

    test('should format cost in number format', () => {
      const testCases = [
        { cost: 0, expected: '0.00' },
        { cost: 0.5, expected: '0.50' },
        { cost: 1.85, expected: '1.85' },
        { cost: 10.123, expected: '10.12' },
        { cost: 100.999, expected: '101.00' },
        { cost: 1000, expected: '1000.00' },
        { cost: 0.001, expected: '0.00' },
        { cost: 0.005, expected: '0.01' }
      ]

      testCases.forEach(({ cost, expected }) => {
        expect(CostFormatter.format(cost, 'number')).toBe(expected)
      })
    })

    test('should format cost in compact format', () => {
      const testCases = [
        { cost: 0, expected: '0$' },
        { cost: 0.5, expected: '0.5$' },
        { cost: 1.85, expected: '1.85$' },
        { cost: 10.123, expected: '10.12$' },
        { cost: 100.999, expected: '101$' },
        { cost: 1000, expected: '1000$' },
        { cost: 0.001, expected: '0$' },
        { cost: 0.005, expected: '0.01$' }
      ]

      testCases.forEach(({ cost, expected }) => {
        expect(CostFormatter.format(cost, 'compact')).toBe(expected)
      })
    })

    test('should default to currency format when no format specified', () => {
      expect(CostFormatter.format(1.85)).toBe('$1.85')
    })

    test('should handle negative values', () => {
      expect(CostFormatter.format(-1.85, 'currency')).toBe('$0.00')
      expect(CostFormatter.format(-1.85, 'number')).toBe('0.00')
      expect(CostFormatter.format(-1.85, 'compact')).toBe('0$')
    })

    test('should handle very large values', () => {
      expect(CostFormatter.format(999999.99, 'currency')).toBe('$999999.99')
      expect(CostFormatter.format(999999.99, 'number')).toBe('999999.99')
      expect(CostFormatter.format(999999.99, 'compact')).toBe('999999.99$')
    })
  })

  describe('formatWithPrecision', () => {
    test('should format cost with specified precision', () => {
      expect(CostFormatter.formatWithPrecision(1.23456, 0)).toBe('$1')
      expect(CostFormatter.formatWithPrecision(1.23456, 1)).toBe('$1.2')
      expect(CostFormatter.formatWithPrecision(1.23456, 2)).toBe('$1.23')
      expect(CostFormatter.formatWithPrecision(1.23456, 3)).toBe('$1.235')
      expect(CostFormatter.formatWithPrecision(1.23456, 4)).toBe('$1.2346')
    })

    test('should handle zero precision', () => {
      expect(CostFormatter.formatWithPrecision(1.99, 0)).toBe('$2')
      expect(CostFormatter.formatWithPrecision(0.99, 0)).toBe('$1')
    })
  })

  describe('parseCostString', () => {
    test('should parse currency strings back to numbers', () => {
      const testCases = [
        { costString: '$1.85', expected: 1.85 },
        { costString: '$0.00', expected: 0 },
        { costString: '$100.50', expected: 100.50 },
        { costString: '1.85', expected: 1.85 },
        { costString: '1.85$', expected: 1.85 }
      ]

      testCases.forEach(({ costString, expected }) => {
        expect(CostFormatter.parseCostString(costString)).toBeCloseTo(expected, 2)
      })
    })

    test('should handle invalid cost strings', () => {
      expect(CostFormatter.parseCostString('invalid')).toBe(0)
      expect(CostFormatter.parseCostString('')).toBe(0)
      expect(CostFormatter.parseCostString('abc')).toBe(0)
    })
  })

  describe('formatPerHour', () => {
    test('should format cost per hour', () => {
      expect(CostFormatter.formatPerHour(2.5)).toBe('$2.50/h')
      expect(CostFormatter.formatPerHour(0.75)).toBe('$0.75/h')
      expect(CostFormatter.formatPerHour(0)).toBe('$0.00/h')
    })

    test('should handle custom format for per hour', () => {
      expect(CostFormatter.formatPerHour(2.5, 'number')).toBe('2.50/h')
      expect(CostFormatter.formatPerHour(2.5, 'compact')).toBe('2.5$/h')
    })
  })

  describe('formatRange', () => {
    test('should format cost range', () => {
      expect(CostFormatter.formatRange(1.50, 2.50)).toBe('$1.50-$2.50')
      expect(CostFormatter.formatRange(0, 5)).toBe('$0.00-$5.00')
    })

    test('should handle same min and max', () => {
      expect(CostFormatter.formatRange(1.85, 1.85)).toBe('$1.85')
    })

    test('should handle custom format for range', () => {
      expect(CostFormatter.formatRange(1.50, 2.50, 'number')).toBe('1.50-2.50')
      expect(CostFormatter.formatRange(1.50, 2.50, 'compact')).toBe('1.5$-2.5$')
    })
  })

  describe('getCostLevel', () => {
    test('should categorize cost levels', () => {
      expect(CostFormatter.getCostLevel(0)).toBe('free')
      expect(CostFormatter.getCostLevel(0.50)).toBe('low')
      expect(CostFormatter.getCostLevel(5.00)).toBe('medium')
      expect(CostFormatter.getCostLevel(15.00)).toBe('high')
      expect(CostFormatter.getCostLevel(50.00)).toBe('very-high')
    })
  })

  describe('formatSavings', () => {
    test('should format savings amount', () => {
      expect(CostFormatter.formatSavings(2.50)).toBe('Save $2.50')
      expect(CostFormatter.formatSavings(0)).toBe('No savings')
      expect(CostFormatter.formatSavings(-1.50)).toBe('Additional $1.50')
    })
  })
})