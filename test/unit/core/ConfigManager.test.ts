import { describe, expect, test, beforeEach } from 'vitest'
import { ConfigManager } from '../../../src/core/ConfigManager'
import type { Config } from '../../../src/core/ConfigManager'
import { MockCommandExecutor } from '../../../src/utils/CommandExecutor'

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let mockExecutor: MockCommandExecutor

  beforeEach(() => {
    mockExecutor = new MockCommandExecutor()
    configManager = new ConfigManager(mockExecutor)
    // デフォルトではエラーを返すように設定
    mockExecutor.setError('tmux show-option', new Error('unknown option'))
  })

  describe('loadConfig', () => {
    test('should return default config when no custom settings', () => {
      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config).toBeDefined()
      expect(config.updateInterval).toBe(5)
      expect(config.tokenLimit).toBe(140000)
      expect(config.warningThresholds.usage).toEqual([70, 90])
      expect(config.warningThresholds.time).toEqual([60, 30])
      expect(config.displayFormats.time).toBe('compact')
      expect(config.displayFormats.cost).toBe('currency')
      expect(config.displayFormats.token).toBe('compact')
    })

    test('should load custom update interval from tmux', () => {
      // Arrange
      mockExecutor.reset()
      mockExecutor.setResponse('"@ccusage_update_interval"', '10\n')

      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config.updateInterval).toBe(10)
    })

    test('should load custom token limit from tmux', () => {
      // Arrange
      mockExecutor.reset()
      mockExecutor.setResponse('"@ccusage_token_limit"', '100000\n')

      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config.tokenLimit).toBe(100000)
    })

    test('should load custom warning thresholds from tmux', () => {
      // Arrange
      mockExecutor.reset()
      mockExecutor.setResponse('"@ccusage_warning_threshold_1"', '60\n')
      mockExecutor.setResponse('"@ccusage_warning_threshold_2"', '80\n')
      mockExecutor.setResponse('"@ccusage_time_warning_1"', '90\n')
      mockExecutor.setResponse('"@ccusage_time_warning_2"', '45\n')

      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config.warningThresholds.usage).toEqual([60, 80])
      expect(config.warningThresholds.time).toEqual([90, 45])
    })

    test('should load custom display formats from tmux', () => {
      // Arrange
      mockExecutor.reset()
      mockExecutor.setResponse('"@ccusage_time_format"', 'verbose\n')
      mockExecutor.setResponse('"@ccusage_cost_format"', 'number\n')
      mockExecutor.setResponse('"@ccusage_token_format"', 'full\n')

      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config.displayFormats.time).toBe('verbose')
      expect(config.displayFormats.cost).toBe('number')
      expect(config.displayFormats.token).toBe('full')
    })

    test('should handle invalid values gracefully', () => {
      // Arrange
      mockExecutor.setResponse('"@ccusage_update_interval"', 'invalid\n')
      mockExecutor.setResponse('"@ccusage_token_limit"', '-1000\n')
      mockExecutor.setResponse('"@ccusage_time_format"', 'invalid_format\n')

      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config.updateInterval).toBe(5)  // Default
      expect(config.tokenLimit).toBe(140000)  // Default (negative values rejected)
      expect(config.displayFormats.time).toBe('compact')  // Default (invalid format rejected)
    })

    test('should handle empty values gracefully', () => {
      // Arrange
      mockExecutor.setResponse('"@ccusage_update_interval"', '\n')
      mockExecutor.setResponse('"@ccusage_token_limit"', '   \n')

      // Act
      const config = configManager.loadConfig()

      // Assert
      expect(config.updateInterval).toBe(5)  // Default
      expect(config.tokenLimit).toBe(140000)  // Default
    })
  })

  describe('getDefault', () => {
    test('should return default configuration', () => {
      // Act
      const config = configManager.getDefault()

      // Assert
      expect(config).toEqual({
        updateInterval: 5,
        tokenLimit: 140000,
        warningThresholds: {
          usage: [70, 90],
          time: [60, 30]
        },
        displayFormats: {
          time: 'compact',
          cost: 'currency',
          token: 'compact'
        }
      })
    })
  })

  describe('validateConfig', () => {
    test('should validate valid configuration', () => {
      // Arrange
      const config: Config = {
        updateInterval: 10,
        tokenLimit: 100000,
        warningThresholds: {
          usage: [60, 80],
          time: [90, 45]
        },
        displayFormats: {
          time: 'verbose',
          cost: 'number',
          token: 'full'
        }
      }

      // Act
      const isValid = configManager.validateConfig(config)

      // Assert
      expect(isValid).toBe(true)
    })

    test('should reject invalid update interval', () => {
      // Arrange
      const config: Config = {
        updateInterval: -5,
        tokenLimit: 140000,
        warningThresholds: {
          usage: [70, 90],
          time: [60, 30]
        },
        displayFormats: {
          time: 'compact',
          cost: 'currency',
          token: 'compact'
        }
      }

      // Act
      const isValid = configManager.validateConfig(config)

      // Assert
      expect(isValid).toBe(false)
    })

    test('should reject invalid display format', () => {
      // Arrange
      const config: Config = {
        updateInterval: 5,
        tokenLimit: 140000,
        warningThresholds: {
          usage: [70, 90],
          time: [60, 30]
        },
        displayFormats: {
          time: 'invalid' as any,
          cost: 'currency',
          token: 'compact'
        }
      }

      // Act
      const isValid = configManager.validateConfig(config)

      // Assert
      expect(isValid).toBe(false)
    })
  })
})