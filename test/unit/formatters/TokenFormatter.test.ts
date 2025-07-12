import { describe, expect, test } from 'vitest'
import { TokenFormatter } from '../../../src/formatters/TokenFormatter'

describe('TokenFormatter', () => {
  describe('format', () => {
    test('should format tokens in compact format', () => {
      const testCases = [
        { tokens: 0, expected: '0' },
        { tokens: 999, expected: '999' },
        { tokens: 1000, expected: '1.0k' },
        { tokens: 1500, expected: '1.5k' },
        { tokens: 12500, expected: '12.5k' },
        { tokens: 100000, expected: '100k' },
        { tokens: 1000000, expected: '1.0M' },
        { tokens: 1500000, expected: '1.5M' },
        { tokens: 1000000000, expected: '1.0B' }
      ]

      testCases.forEach(({ tokens, expected }) => {
        expect(TokenFormatter.format(tokens, 'compact')).toBe(expected)
      })
    })

    test('should format tokens in full format', () => {
      const testCases = [
        { tokens: 0, expected: '0' },
        { tokens: 1000, expected: '1,000' },
        { tokens: 12500, expected: '12,500' },
        { tokens: 100000, expected: '100,000' },
        { tokens: 1000000, expected: '1,000,000' },
        { tokens: 1234567, expected: '1,234,567' }
      ]

      testCases.forEach(({ tokens, expected }) => {
        expect(TokenFormatter.format(tokens, 'full')).toBe(expected)
      })
    })

    test('should format tokens in short format', () => {
      const testCases = [
        { tokens: 0, expected: '0' },
        { tokens: 999, expected: '999' },
        { tokens: 1000, expected: '1k' },
        { tokens: 1500, expected: '2k' },  // rounds up
        { tokens: 12500, expected: '13k' }, // rounds up
        { tokens: 100000, expected: '100k' },
        { tokens: 1000000, expected: '1M' },
        { tokens: 1500000, expected: '2M' } // rounds up
      ]

      testCases.forEach(({ tokens, expected }) => {
        expect(TokenFormatter.format(tokens, 'short')).toBe(expected)
      })
    })

    test('should default to compact format when no format specified', () => {
      expect(TokenFormatter.format(12500)).toBe('12.5k')
    })

    test('should handle negative values', () => {
      expect(TokenFormatter.format(-1000, 'compact')).toBe('0')
      expect(TokenFormatter.format(-1000, 'full')).toBe('0')
      expect(TokenFormatter.format(-1000, 'short')).toBe('0')
    })

    test('should handle decimal values', () => {
      expect(TokenFormatter.format(1500.7, 'compact')).toBe('1.5k')
      expect(TokenFormatter.format(1500.7, 'full')).toBe('1,501')
    })
  })

  describe('formatWithUnit', () => {
    test('should format tokens with specified unit', () => {
      expect(TokenFormatter.formatWithUnit(12500, 'tokens')).toBe('12.5k tokens')
      expect(TokenFormatter.formatWithUnit(1, 'token')).toBe('1 token')
      expect(TokenFormatter.formatWithUnit(0, 'tokens')).toBe('0 tokens')
    })

    test('should handle singular vs plural units', () => {
      expect(TokenFormatter.formatWithUnit(1, 'token', 'tokens')).toBe('1 token')
      expect(TokenFormatter.formatWithUnit(2, 'token', 'tokens')).toBe('2 tokens')
      expect(TokenFormatter.formatWithUnit(1000, 'token', 'tokens')).toBe('1.0k tokens')
    })
  })

  describe('parseTokenString', () => {
    test('should parse token strings back to numbers', () => {
      const testCases = [
        { tokenString: '12.5k', expected: 12500 },
        { tokenString: '1.0M', expected: 1000000 },
        { tokenString: '100k', expected: 100000 },
        { tokenString: '1,234,567', expected: 1234567 },
        { tokenString: '999', expected: 999 }
      ]

      testCases.forEach(({ tokenString, expected }) => {
        expect(TokenFormatter.parseTokenString(tokenString)).toBe(expected)
      })
    })

    test('should handle invalid token strings', () => {
      expect(TokenFormatter.parseTokenString('invalid')).toBe(0)
      expect(TokenFormatter.parseTokenString('')).toBe(0)
      expect(TokenFormatter.parseTokenString('abc')).toBe(0)
    })

    test('should handle token strings with units', () => {
      expect(TokenFormatter.parseTokenString('12.5k tokens')).toBe(12500)
      expect(TokenFormatter.parseTokenString('1 token')).toBe(1)
    })
  })

  describe('getUsageDescription', () => {
    test('should provide usage descriptions', () => {
      const testCases = [
        { tokens: 1000, limit: 140000, expected: 'Light usage' },
        { tokens: 50000, limit: 140000, expected: 'Moderate usage' },
        { tokens: 100000, limit: 140000, expected: 'Heavy usage' },
        { tokens: 140000, limit: 140000, expected: 'At limit' },
        { tokens: 150000, limit: 140000, expected: 'Over limit' }
      ]

      testCases.forEach(({ tokens, limit, expected }) => {
        expect(TokenFormatter.getUsageDescription(tokens, limit)).toBe(expected)
      })
    })
  })
})