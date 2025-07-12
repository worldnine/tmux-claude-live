import { describe, expect, test } from 'vitest'
import { TimeFormatter } from '../../../src/formatters/TimeFormatter'

describe('TimeFormatter', () => {
  describe('format', () => {
    test('should format minutes in compact format', () => {
      const testCases = [
        { minutes: 0, expected: '0m' },
        { minutes: 1, expected: '1m' },
        { minutes: 59, expected: '59m' },
        { minutes: 60, expected: '1h0m' },
        { minutes: 65, expected: '1h5m' },
        { minutes: 120, expected: '2h0m' },
        { minutes: 135, expected: '2h15m' },
        { minutes: 300, expected: '5h0m' },
        { minutes: 1440, expected: '24h0m' }
      ]

      testCases.forEach(({ minutes, expected }) => {
        expect(TimeFormatter.format(minutes, 'compact')).toBe(expected)
      })
    })

    test('should format minutes in verbose format', () => {
      const testCases = [
        { minutes: 0, expected: '0 minutes' },
        { minutes: 1, expected: '1 minute' },
        { minutes: 2, expected: '2 minutes' },
        { minutes: 60, expected: '1 hour 0 minutes' },
        { minutes: 61, expected: '1 hour 1 minute' },
        { minutes: 65, expected: '1 hour 5 minutes' },
        { minutes: 120, expected: '2 hours 0 minutes' },
        { minutes: 135, expected: '2 hours 15 minutes' }
      ]

      testCases.forEach(({ minutes, expected }) => {
        expect(TimeFormatter.format(minutes, 'verbose')).toBe(expected)
      })
    })

    test('should format minutes in short format', () => {
      const testCases = [
        { minutes: 0, expected: '0m' },
        { minutes: 30, expected: '30m' },
        { minutes: 60, expected: '1h' },
        { minutes: 90, expected: '2h' },  // rounds up
        { minutes: 120, expected: '2h' },
        { minutes: 135, expected: '2h' },
        { minutes: 150, expected: '3h' }, // rounds up
        { minutes: 240, expected: '4h' }
      ]

      testCases.forEach(({ minutes, expected }) => {
        expect(TimeFormatter.format(minutes, 'short')).toBe(expected)
      })
    })

    test('should default to compact format when no format specified', () => {
      expect(TimeFormatter.format(135)).toBe('2h15m')
    })

    test('should handle negative values', () => {
      expect(TimeFormatter.format(-10, 'compact')).toBe('0m')
      expect(TimeFormatter.format(-10, 'verbose')).toBe('0 minutes')
      expect(TimeFormatter.format(-10, 'short')).toBe('0m')
    })
  })

  describe('formatSeconds', () => {
    test('should format seconds to minutes and format', () => {
      const testCases = [
        { seconds: 0, expected: '0m' },
        { seconds: 60, expected: '1m' },
        { seconds: 3600, expected: '1h0m' },
        { seconds: 3900, expected: '1h5m' }
      ]

      testCases.forEach(({ seconds, expected }) => {
        expect(TimeFormatter.formatSeconds(seconds)).toBe(expected)
      })
    })

    test('should round seconds properly', () => {
      expect(TimeFormatter.formatSeconds(30)).toBe('1m')  // rounds up
      expect(TimeFormatter.formatSeconds(29)).toBe('0m')  // rounds down
      expect(TimeFormatter.formatSeconds(90)).toBe('2m')  // rounds up
    })
  })

  describe('parseHoursAndMinutes', () => {
    test('should parse time strings back to minutes', () => {
      const testCases = [
        { timeString: '2h15m', expected: 135 },
        { timeString: '1h0m', expected: 60 },
        { timeString: '0m', expected: 0 },
        { timeString: '5h30m', expected: 330 }
      ]

      testCases.forEach(({ timeString, expected }) => {
        expect(TimeFormatter.parseHoursAndMinutes(timeString)).toBe(expected)
      })
    })

    test('should handle invalid time strings', () => {
      expect(TimeFormatter.parseHoursAndMinutes('invalid')).toBe(0)
      expect(TimeFormatter.parseHoursAndMinutes('')).toBe(0)
      expect(TimeFormatter.parseHoursAndMinutes('1h')).toBe(60)
      expect(TimeFormatter.parseHoursAndMinutes('30m')).toBe(30)
    })
  })
})