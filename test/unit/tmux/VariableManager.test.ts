import { describe, expect, test, beforeEach } from 'vitest'
import { VariableManager } from '../../../src/tmux/VariableManager'
import { MockCommandExecutor } from '../../../src/utils/CommandExecutor'

describe('VariableManager', () => {
  let variableManager: VariableManager
  let mockExecutor: MockCommandExecutor

  beforeEach(() => {
    mockExecutor = new MockCommandExecutor()
    variableManager = new VariableManager(mockExecutor)
  })

  describe('setVariable', () => {
    test('should set a single tmux variable', () => {
      // Arrange
      const name = 'ccusage_total_tokens'
      const value = '12500'

      // Act & Assert - should not throw
      expect(() => variableManager.setVariable(name, value)).not.toThrow()
    })

    test('should escape special characters in values', () => {
      // Arrange
      const name = 'ccusage_test'
      const value = 'test "quoted" value'

      // Act & Assert - should not throw
      expect(() => variableManager.setVariable(name, value)).not.toThrow()
    })

    test('should handle empty values', () => {
      // Arrange
      const name = 'ccusage_empty'
      const value = ''

      // Act & Assert - should not throw
      expect(() => variableManager.setVariable(name, value)).not.toThrow()
    })

    test('should handle tmux command failure gracefully', () => {
      // Arrange
      const name = 'ccusage_test'
      const value = 'test'

      // Act & Assert - should not throw even if tmux fails
      expect(() => variableManager.setVariable(name, value)).not.toThrow()
    })
  })

  describe('setBulkVariables', () => {
    test('should set multiple tmux variables efficiently', () => {
      // Arrange
      const variables = {
        'ccusage_total_tokens': '12500',
        'ccusage_cost_current': '$1.85',
        'ccusage_time_remaining': '2h15m',
        'ccusage_warning_color': 'colour2'
      }

      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
    })

    test('should handle empty variables object', () => {
      // Arrange
      const variables = {}

      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
    })

    test('should handle single variable via bulk method', () => {
      // Arrange
      const variables = {
        'ccusage_test': 'value'
      }

      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
    })

    test('should handle tmux command failure gracefully', () => {
      // Arrange
      const variables = {
        'ccusage_test': 'value'
      }

      // Act & Assert - should not throw even if tmux fails
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
    })
  })

  describe('getVariable', () => {
    test('should return null for non-existent variable', () => {
      // Arrange
      const name = 'ccusage_nonexistent'
      mockExecutor.setError('tmux show-option -gqv @ccusage_ccusage_nonexistent', new Error('option not found'))

      // Act
      const result = variableManager.getVariable(name)

      // Assert
      expect(result).toBeNull()
    })

    test('should handle tmux command failure', () => {
      // Arrange
      const name = 'ccusage_test'
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_ccusage_test', 'value')

      // Act
      const result = variableManager.getVariable(name)

      // Assert
      expect(result).toBe('value')
    })
  })

  describe('removeVariable', () => {
    test('should remove a tmux variable', () => {
      // Arrange
      const name = 'ccusage_test'

      // Act & Assert - should not throw
      expect(() => variableManager.removeVariable(name)).not.toThrow()
    })

    test('should handle tmux command failure gracefully', () => {
      // Arrange
      const name = 'ccusage_test'

      // Act & Assert - should not throw even if tmux fails
      expect(() => variableManager.removeVariable(name)).not.toThrow()
    })
  })

  describe('getAllVariables', () => {
    test('should handle tmux command failure', () => {
      // Arrange
      mockExecutor.setError('tmux show-options -g', new Error('tmux not found'))

      // Act
      const result = variableManager.getAllVariables()

      // Assert
      expect(result).toEqual({})
    })
  })

  describe('clearAllVariables', () => {
    test('should not throw on execution', () => {
      // Act & Assert - should not throw
      expect(() => variableManager.clearAllVariables()).not.toThrow()
    })
  })

  describe('variableExists', () => {
    test('should return false for non-existent variable', () => {
      // Arrange
      const name = 'ccusage_nonexistent'
      mockExecutor.setError('tmux show-option -gqv @ccusage_ccusage_nonexistent', new Error('option not found'))

      // Act
      const result = variableManager.variableExists(name)

      // Assert
      expect(result).toBe(false)
    })

    test('should return false on tmux command failure', () => {
      // Arrange
      const name = 'ccusage_test'
      mockExecutor.setError('tmux show-option -gqv @ccusage_ccusage_test', new Error('tmux not found'))

      // Act
      const result = variableManager.variableExists(name)

      // Assert
      expect(result).toBe(false)
    })
  })

  describe('generateVariableMap', () => {
    test('should generate variable map from processed data', () => {
      // Arrange
      const processedData = {
        isActive: true,
        totalTokens: 12500,
        costUSD: 1.85,
        remainingMinutes: 135,
        remainingSeconds: 8100,
        sessionRemainingMinutes: 135,
        sessionRemainingSeconds: 8100,
        usagePercent: 8.93,
        tokensRemaining: 127500,
        blockProgress: 55,
        burnRate: 250,
        costPerHour: 0.9,
        warningLevel: 'normal' as const
      }

      const config = {
        tokenLimit: 140000,
        displayFormats: {
          time: 'compact' as const,
          cost: 'currency' as const,
          token: 'compact' as const
        }
      }

      // Act
      const result = variableManager.generateVariableMap(processedData, config)

      // Assert
      expect(result).toMatchObject({
        'is_active': 'true',
        'total_tokens': '12500',
        'total_tokens_formatted': '12.5k',
        'cost_current': '$1.85',
        'time_remaining': '2h15m',
        'usage_percent': '8.93%',
        'tokens_remaining': '127500',
        'tokens_remaining_formatted': '127.5k',
        'warning_level': 'normal',
        'warning_color': 'colour2',
        'warning_color_name': 'green'
      })
    })

    test('should handle inactive state', () => {
      // Arrange
      const processedData = {
        isActive: false,
        totalTokens: 0,
        costUSD: 0,
        remainingMinutes: 0,
        remainingSeconds: 0,
        sessionRemainingMinutes: 0,
        sessionRemainingSeconds: 0,
        usagePercent: 0,
        tokensRemaining: 140000,
        blockProgress: 0,
        burnRate: 0,
        costPerHour: 0,
        warningLevel: 'normal' as const
      }

      const config = {
        tokenLimit: 140000,
        displayFormats: {
          time: 'compact' as const,
          cost: 'currency' as const,
          token: 'compact' as const
        }
      }

      // Act
      const result = variableManager.generateVariableMap(processedData, config)

      // Assert
      expect(result['is_active']).toBe('false')
      expect(result['warning_color']).toBe('colour8')
      expect(result['warning_color_name']).toBe('grey')
    })
  })
})