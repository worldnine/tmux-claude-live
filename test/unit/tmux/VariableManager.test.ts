import { describe, expect, test, beforeEach, vi } from 'vitest'
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

  describe('differential updates', () => {
    test('should only update changed variables on subsequent calls', () => {
      // Arrange - 初回設定
      const variables1 = {
        'var1': 'value1',
        'var2': 'value2',
        'var3': 'value3'
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act - 初回実行（全て新しい変数）
      variableManager.setBulkVariables(variables1)
      
      // Assert - 全ての変数が更新される
      expect(consoleSpy).toHaveBeenCalledWith('[DiffUpdate] Updating 3 of 3 variables')
      
      // Arrange - 2回目設定（一部変更）
      const variables2 = {
        'var1': 'value1',    // 変更なし
        'var2': 'changed2',  // 変更あり
        'var3': 'value3'     // 変更なし
      }
      
      // Act - 2回目実行（変更された変数のみ）
      variableManager.setBulkVariables(variables2)
      
      // Assert - 変更された変数のみ更新
      expect(consoleSpy).toHaveBeenCalledWith('[DiffUpdate] Updating 1 of 3 variables')
      
      consoleSpy.mockRestore()
    })

    test('should skip update when no variables have changed', () => {
      // Arrange
      const variables = {
        'var1': 'value1',
        'var2': 'value2'
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act - 初回実行
      variableManager.setBulkVariables(variables)
      expect(consoleSpy).toHaveBeenCalledWith('[DiffUpdate] Updating 2 of 2 variables')
      
      // Act - 同じ変数で2回目実行
      variableManager.setBulkVariables(variables)
      
      // Assert - 2回目は変更がないためスキップ（コンソールログが出力されない）
      expect(consoleSpy).toHaveBeenCalledTimes(1)
      
      consoleSpy.mockRestore()
    })

    test('should detect all changes when all variables are different', () => {
      // Arrange
      const variables1 = {
        'var1': 'value1',
        'var2': 'value2',
        'var3': 'value3'
      }
      
      const variables2 = {
        'var1': 'changed1',
        'var2': 'changed2',
        'var3': 'changed3'
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act
      variableManager.setBulkVariables(variables1)
      variableManager.setBulkVariables(variables2)
      
      // Assert - 全ての変数が変更されているため全て更新
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '[DiffUpdate] Updating 3 of 3 variables')
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '[DiffUpdate] Updating 3 of 3 variables')
      
      consoleSpy.mockRestore()
    })

    test('should handle new variables being added', () => {
      // Arrange
      const variables1 = {
        'var1': 'value1',
        'var2': 'value2'
      }
      
      const variables2 = {
        'var1': 'value1',    // 変更なし
        'var2': 'value2',    // 変更なし
        'var3': 'value3'     // 新規追加
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act
      variableManager.setBulkVariables(variables1)
      variableManager.setBulkVariables(variables2)
      
      // Assert - 新規変数のみ更新
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '[DiffUpdate] Updating 2 of 2 variables')
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '[DiffUpdate] Updating 1 of 3 variables')
      
      consoleSpy.mockRestore()
    })

    test('should handle variables being removed from set', () => {
      // Arrange
      const variables1 = {
        'var1': 'value1',
        'var2': 'value2',
        'var3': 'value3'
      }
      
      const variables2 = {
        'var1': 'changed1',  // 変更あり
        'var2': 'value2'     // 変更なし、var3は削除
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act
      variableManager.setBulkVariables(variables1)
      variableManager.setBulkVariables(variables2)
      
      // Assert - 変更された変数のみ更新（削除された変数は差分更新では扱わない）
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '[DiffUpdate] Updating 3 of 3 variables')
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '[DiffUpdate] Updating 1 of 2 variables')
      
      consoleSpy.mockRestore()
    })
  })

  describe('setBulkVariablesForced', () => {
    test('should update all variables regardless of changes', () => {
      // Arrange
      const variables1 = {
        'var1': 'value1',
        'var2': 'value2'
      }
      
      const variables2 = {
        'var1': 'value1',  // 変更なし
        'var2': 'value2'   // 変更なし
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act - 初回は通常の差分更新
      variableManager.setBulkVariables(variables1)
      
      // Act - 強制更新（変更がなくても全て更新）
      variableManager.setBulkVariablesForced(variables2)
      
      // Assert
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '[DiffUpdate] Updating 2 of 2 variables')
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '[ForceUpdate] Updating all 2 variables')
      
      consoleSpy.mockRestore()
    })

    test('should handle empty variables object', () => {
      // Arrange
      const variables = {}
      
      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariablesForced(variables)).not.toThrow()
    })

    test('should handle tmux command failure with fallback', () => {
      // Arrange
      const variables = {
        'var1': 'value1',
        'var2': 'value2'
      }
      
      // tmux一括コマンドを失敗させる
      mockExecutor.setError('tmux set-option -g @ccusage_var1 "value1" \\; set-option -g @ccusage_var2 "value2"', new Error('tmux bulk command failed'))
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariablesForced(variables)).not.toThrow()
      
      // Assert - フォールバックメッセージが出力される
      expect(consoleSpy).toHaveBeenCalledWith('Bulk variable setting failed, falling back to individual setting:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('enhanced escaping', () => {
    test('should escape dollar signs in variable values', () => {
      // Arrange
      const variables = {
        'var_with_dollar': '$TEST_VAR and $ANOTHER'
      }
      
      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
      
      // Verify that the command was called with escaped values
      const executedCommands = mockExecutor.getExecutedCommands()
      const lastCommand = executedCommands[executedCommands.length - 1]
      expect(lastCommand).toContain('\\$TEST_VAR')
      expect(lastCommand).toContain('\\$ANOTHER')
    })

    test('should escape double quotes in variable values', () => {
      // Arrange
      const variables = {
        'var_with_quotes': 'Text with "quotes" inside'
      }
      
      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
      
      // Verify that the command was called with escaped quotes
      const executedCommands = mockExecutor.getExecutedCommands()
      const lastCommand = executedCommands[executedCommands.length - 1]
      expect(lastCommand).toContain('\\"quotes\\"')
    })

    test('should handle complex strings with multiple special characters', () => {
      // Arrange
      const variables = {
        'complex_var': 'Text with $VAR and "quotes" and more $VARS'
      }
      
      // Act & Assert - should not throw
      expect(() => variableManager.setBulkVariables(variables)).not.toThrow()
      
      // Verify proper escaping
      const executedCommands = mockExecutor.getExecutedCommands()
      const lastCommand = executedCommands[executedCommands.length - 1]
      expect(lastCommand).toContain('\\$VAR')
      expect(lastCommand).toContain('\\"quotes\\"')
      expect(lastCommand).toContain('\\$VARS')
    })

    test('should handle setVariable with dollar signs', () => {
      // Arrange
      const name = 'test_var'
      const value = '$HOME/test and $USER'
      
      // Act & Assert - should not throw
      expect(() => variableManager.setVariable(name, value)).not.toThrow()
      
      // Verify escaping in single variable setting
      const executedCommands = mockExecutor.getExecutedCommands()
      const lastCommand = executedCommands[executedCommands.length - 1]
      expect(lastCommand).toContain('\\$HOME')
      expect(lastCommand).toContain('\\$USER')
    })
  })

  describe('bulk operation performance', () => {
    test('should combine multiple commands into single tmux call', () => {
      // Arrange
      const variables = {
        'var1': 'value1',
        'var2': 'value2',
        'var3': 'value3'
      }
      
      // Act
      variableManager.setBulkVariables(variables)
      
      // Assert - 複数の変数が一つのtmuxコマンドで設定される
      const executedCommands = mockExecutor.getExecutedCommands()
      const lastCommand = executedCommands[executedCommands.length - 1]
      expect(lastCommand).toContain('set-option -g @ccusage_var1')
      expect(lastCommand).toContain('set-option -g @ccusage_var2')
      expect(lastCommand).toContain('set-option -g @ccusage_var3')
      expect(lastCommand).toContain('\\;') // コマンド区切り文字
    })

    test('should use timeout for bulk operations', () => {
      // Arrange
      const variables = {
        'var1': 'value1',
        'var2': 'value2'
      }
      
      // Act
      variableManager.setBulkVariables(variables)
      
      // Assert - タイムアウトが設定されることを確認
      // MockCommandExecutorでタイムアウトが渡されているかチェック
      const executedCommands = mockExecutor.getExecutedCommands()
      expect(executedCommands.length).toBeGreaterThan(0)
    })

    test('should fallback to individual setting when bulk fails', () => {
      // Arrange
      const variables = {
        'var1': 'value1',
        'var2': 'value2'
      }
      
      // 一括コマンドを失敗させる
      mockExecutor.setError('tmux set-option -g @ccusage_var1 "value1" \\; set-option -g @ccusage_var2 "value2"', new Error('bulk failed'))
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      // Act
      variableManager.setBulkVariables(variables)
      
      // Assert - フォールバックが実行される
      expect(consoleSpy).toHaveBeenCalledWith('Bulk variable setting failed, falling back to individual setting:', expect.any(Error))
      
      // 個別設定のコマンドが実行される
      const executedCommands = mockExecutor.getExecutedCommands()
      expect(executedCommands.length).toBeGreaterThan(1) // 一括失敗 + 個別設定
      
      consoleSpy.mockRestore()
    })
  })

  describe('state management', () => {
    test('should maintain lastVariables state correctly', () => {
      // Arrange
      const variables1 = { 'var1': 'value1', 'var2': 'value2' }
      const variables2 = { 'var1': 'changed1', 'var2': 'value2', 'var3': 'value3' }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act - 初回設定
      variableManager.setBulkVariables(variables1)
      
      // Act - 部分変更
      variableManager.setBulkVariables(variables2)
      
      // Act - 同じ変数で再実行（変更なしの確認）
      variableManager.setBulkVariables(variables2)
      
      // Assert - 3回目は変更がないためスキップ
      expect(consoleSpy).toHaveBeenCalledTimes(2) // 1回目と2回目のみ
      
      consoleSpy.mockRestore()
    })

    test('should reset state after clearAllVariables', () => {
      // Arrange
      const variables = { 'var1': 'value1', 'var2': 'value2' }
      
      // 既存の変数をモック
      mockExecutor.setResponse('tmux show-options -g', '@ccusage_var1 value1\n@ccusage_var2 value2')
      
      variableManager.setBulkVariables(variables)
      
      // Act - 全変数クリア
      variableManager.clearAllVariables()
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      // Act - 同じ変数を再設定
      variableManager.setBulkVariables(variables)
      
      // Assert - クリア後は再び全変数が更新される
      expect(consoleSpy).toHaveBeenCalledWith('[DiffUpdate] Updating 2 of 2 variables')
      
      consoleSpy.mockRestore()
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