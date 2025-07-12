import { describe, expect, test } from 'vitest'
import { ColorResolver } from '../../../src/tmux/ColorResolver'

describe('ColorResolver', () => {
  describe('resolveWarningColor', () => {
    test('should return normal color for low usage', () => {
      expect(ColorResolver.resolveWarningColor('normal')).toBe('colour2')
    })

    test('should return warning color for medium usage', () => {
      expect(ColorResolver.resolveWarningColor('warning')).toBe('colour3')
    })

    test('should return danger color for high usage', () => {
      expect(ColorResolver.resolveWarningColor('danger')).toBe('colour1')
    })

    test('should default to normal color for unknown level', () => {
      expect(ColorResolver.resolveWarningColor('unknown' as any)).toBe('colour2')
    })
  })

  describe('resolveColorFromUsage', () => {
    test('should return normal color for usage below 70%', () => {
      expect(ColorResolver.resolveColorFromUsage(50)).toBe('colour2')
      expect(ColorResolver.resolveColorFromUsage(69)).toBe('colour2')
      expect(ColorResolver.resolveColorFromUsage(0)).toBe('colour2')
    })

    test('should return warning color for usage between 70-90%', () => {
      expect(ColorResolver.resolveColorFromUsage(70)).toBe('colour3')
      expect(ColorResolver.resolveColorFromUsage(80)).toBe('colour3')
      expect(ColorResolver.resolveColorFromUsage(89)).toBe('colour3')
    })

    test('should return danger color for usage above 90%', () => {
      expect(ColorResolver.resolveColorFromUsage(90)).toBe('colour1')
      expect(ColorResolver.resolveColorFromUsage(100)).toBe('colour1')
      expect(ColorResolver.resolveColorFromUsage(150)).toBe('colour1')
    })
  })

  describe('resolveColorFromTimeRemaining', () => {
    test('should return normal color for time above 60 minutes', () => {
      expect(ColorResolver.resolveColorFromTimeRemaining(61)).toBe('colour2')
      expect(ColorResolver.resolveColorFromTimeRemaining(120)).toBe('colour2')
      expect(ColorResolver.resolveColorFromTimeRemaining(300)).toBe('colour2')
    })

    test('should return warning color for time between 30-60 minutes', () => {
      expect(ColorResolver.resolveColorFromTimeRemaining(60)).toBe('colour3')
      expect(ColorResolver.resolveColorFromTimeRemaining(45)).toBe('colour3')
      expect(ColorResolver.resolveColorFromTimeRemaining(31)).toBe('colour3')
    })

    test('should return danger color for time below 30 minutes', () => {
      expect(ColorResolver.resolveColorFromTimeRemaining(30)).toBe('colour1')
      expect(ColorResolver.resolveColorFromTimeRemaining(15)).toBe('colour1')
      expect(ColorResolver.resolveColorFromTimeRemaining(0)).toBe('colour1')
    })
  })

  describe('resolveColorFromCombinedFactors', () => {
    test('should return most severe color from multiple factors', () => {
      // Normal usage, normal time -> normal
      expect(ColorResolver.resolveColorFromCombinedFactors(50, 90)).toBe('colour2')
      
      // Warning usage, normal time -> warning
      expect(ColorResolver.resolveColorFromCombinedFactors(75, 90)).toBe('colour3')
      
      // Normal usage, warning time -> warning
      expect(ColorResolver.resolveColorFromCombinedFactors(50, 45)).toBe('colour3')
      
      // Warning usage, warning time -> warning
      expect(ColorResolver.resolveColorFromCombinedFactors(75, 45)).toBe('colour3')
      
      // Danger usage, normal time -> danger
      expect(ColorResolver.resolveColorFromCombinedFactors(95, 90)).toBe('colour1')
      
      // Normal usage, danger time -> danger
      expect(ColorResolver.resolveColorFromCombinedFactors(50, 15)).toBe('colour1')
      
      // Danger usage, danger time -> danger
      expect(ColorResolver.resolveColorFromCombinedFactors(95, 15)).toBe('colour1')
    })
  })

  describe('resolveColorFromProcessedData', () => {
    test('should use warningLevel from processed data', () => {
      const processedData = {
        warningLevel: 'normal' as const,
        usagePercent: 50,
        remainingMinutes: 90,
        isActive: true,
        totalTokens: 70000,
        costUSD: 1.5,
        remainingSeconds: 5400,
        tokensRemaining: 70000,
        blockProgress: 25,
        burnRate: 100,
        costPerHour: 0.9
      }
      
      expect(ColorResolver.resolveColorFromProcessedData(processedData)).toBe('colour2')
    })

    test('should handle inactive state', () => {
      const processedData = {
        warningLevel: 'normal' as const,
        usagePercent: 0,
        remainingMinutes: 0,
        isActive: false,
        totalTokens: 0,
        costUSD: 0,
        remainingSeconds: 0,
        tokensRemaining: 140000,
        blockProgress: 0,
        burnRate: 0,
        costPerHour: 0
      }
      
      expect(ColorResolver.resolveColorFromProcessedData(processedData)).toBe('colour8')
    })
  })

  describe('getColorName', () => {
    test('should return color names for tmux color codes', () => {
      expect(ColorResolver.getColorName('colour1')).toBe('red')
      expect(ColorResolver.getColorName('colour2')).toBe('green')
      expect(ColorResolver.getColorName('colour3')).toBe('yellow')
      expect(ColorResolver.getColorName('colour8')).toBe('grey')
    })

    test('should return default for unknown color codes', () => {
      expect(ColorResolver.getColorName('colour999')).toBe('default')
      expect(ColorResolver.getColorName('invalid')).toBe('default')
    })
  })

  describe('resolveCustomColor', () => {
    test('should use custom color if provided', () => {
      const customColors = {
        normal: 'colour10',
        warning: 'colour11',
        danger: 'colour12',
        inactive: 'colour13'
      }
      
      expect(ColorResolver.resolveCustomColor('normal', customColors)).toBe('colour10')
      expect(ColorResolver.resolveCustomColor('warning', customColors)).toBe('colour11')
      expect(ColorResolver.resolveCustomColor('danger', customColors)).toBe('colour12')
      expect(ColorResolver.resolveCustomColor('inactive', customColors)).toBe('colour13')
    })

    test('should fall back to default if custom color not provided', () => {
      const customColors = {
        normal: 'colour10'
      }
      
      expect(ColorResolver.resolveCustomColor('normal', customColors)).toBe('colour10')
      expect(ColorResolver.resolveCustomColor('warning', customColors)).toBe('colour3')
      expect(ColorResolver.resolveCustomColor('danger', customColors)).toBe('colour1')
      expect(ColorResolver.resolveCustomColor('inactive', customColors)).toBe('colour8')
    })
  })

  describe('isValidTmuxColor', () => {
    test('should validate tmux color formats', () => {
      // Valid formats
      expect(ColorResolver.isValidTmuxColor('red')).toBe(true)
      expect(ColorResolver.isValidTmuxColor('green')).toBe(true)
      expect(ColorResolver.isValidTmuxColor('colour1')).toBe(true)
      expect(ColorResolver.isValidTmuxColor('colour255')).toBe(true)
      expect(ColorResolver.isValidTmuxColor('#ff0000')).toBe(true)
      expect(ColorResolver.isValidTmuxColor('#abc')).toBe(true)
      
      // Invalid formats
      expect(ColorResolver.isValidTmuxColor('invalid')).toBe(false)
      expect(ColorResolver.isValidTmuxColor('')).toBe(false)
      expect(ColorResolver.isValidTmuxColor('colour256')).toBe(false)
      expect(ColorResolver.isValidTmuxColor('#gg0000')).toBe(false)
    })
  })
})