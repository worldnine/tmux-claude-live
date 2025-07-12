import { describe, expect, test, beforeEach } from 'vitest'
import { StatusUpdater } from '../../src/tmux/StatusUpdater'
import { CcusageClient } from '../../src/core/CcusageClient'
import { DataProcessor } from '../../src/core/DataProcessor'
import { ConfigManager } from '../../src/core/ConfigManager'
import { VariableManager } from '../../src/tmux/VariableManager'
import { MockCommandExecutor } from '../../src/utils/CommandExecutor'

describe('StatusUpdater Integration', () => {
  let statusUpdater: StatusUpdater
  let mockExecutor: MockCommandExecutor

  beforeEach(() => {
    mockExecutor = new MockCommandExecutor()
    
    // 各コンポーネントに同じmockExecutorを注入
    const ccusageClient = new CcusageClient(mockExecutor)
    const configManager = new ConfigManager(mockExecutor)
    const dataProcessor = new DataProcessor()
    const variableManager = new VariableManager(mockExecutor)
    
    statusUpdater = new StatusUpdater(ccusageClient, dataProcessor, configManager, variableManager)
  })

  test('should update variables with real ccusage data flow', async () => {
    // Arrange - 実際のccusageレスポンスをモック
    const mockCcusageResponse = {
      blocks: [
        {
          isActive: true,
          totalTokens: 25000,
          costUSD: 15.75,
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          projection: {
            remainingMinutes: 180
          },
          burnRate: {
            tokensPerMinute: 138.89
          },
          tokenCounts: {
            inputTokens: 5000,
            outputTokens: 20000
          },
          models: ['claude-sonnet-4-20250514'],
          entries: 45
        }
      ]
    }
    
    mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))
    mockExecutor.setResponse('tmux show-option', '') // デフォルト設定を使用

    // Act - 全体的な更新プロセスを実行
    await statusUpdater.updateOnce()

    // Assert - 各種変数が適切に設定されたかチェック
    expect(mockExecutor.wasCommandExecuted('ccusage blocks --active --json')).toBe(true)
    expect(mockExecutor.wasCommandExecuted('tmux set-option')).toBe(true)
    
    // 複数のtmux set-optionコマンドが実行されたことを確認
    const executedCommands = mockExecutor.getExecutedCommands()
    const tmuxSetCommands = executedCommands.filter(cmd => cmd.includes('tmux set-option'))
    expect(tmuxSetCommands.length).toBeGreaterThan(5) // 最低5つの変数は設定される
    
    // 重要な変数が設定されていることを確認
    expect(executedCommands.some(cmd => cmd.includes('@ccusage_is_active'))).toBe(true)
    expect(executedCommands.some(cmd => cmd.includes('@ccusage_total_tokens'))).toBe(true)
    expect(executedCommands.some(cmd => cmd.includes('@ccusage_usage_percent'))).toBe(true)
    expect(executedCommands.some(cmd => cmd.includes('@ccusage_warning_color'))).toBe(true)
  })

  test('should handle ccusage command failure gracefully', async () => {
    // Arrange
    mockExecutor.setError('ccusage blocks --active --json', new Error('ccusage not found'))

    // Act
    await statusUpdater.updateOnce()

    // Assert - エラー時でもtmux変数設定は試行される（デフォルト値で）
    expect(mockExecutor.wasCommandExecuted('ccusage blocks --active --json')).toBe(true)
    expect(mockExecutor.wasCommandExecuted('tmux set-option')).toBe(true)
  })

  test('should integrate all components with custom configuration', async () => {
    // Arrange - カスタム設定をモック
    mockExecutor.setResponse('@ccusage_token_limit', '100000')
    mockExecutor.setResponse('@ccusage_update_interval', '10')
    mockExecutor.setResponse('@ccusage_time_format', 'verbose')
    
    const mockCcusageResponse = {
      blocks: [
        {
          isActive: true,
          totalTokens: 75000,
          costUSD: 25.50,
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          projection: {
            remainingMinutes: 60
          },
          burnRate: {
            tokensPerMinute: 500
          }
        }
      ]
    }
    
    mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

    // Act
    await statusUpdater.updateOnce()

    // Assert - カスタム設定が反映されているか確認
    const executedCommands = mockExecutor.getExecutedCommands()
    
    // トークン制限のカスタム値（100000）に基づく使用率計算
    // 75000 / 100000 = 75% になることを確認
    const usagePercentCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_usage_percent') && cmd.includes('75.00%')
    )
    expect(usagePercentCommand).toBeDefined()
  })

  test('should calculate warning levels correctly', async () => {
    // Arrange - 警告レベルが発生する状況を設定
    const mockCcusageResponse = {
      blocks: [
        {
          isActive: true,
          totalTokens: 130000, // 140k中130k = 92.86% (危険レベル)
          costUSD: 45.50,
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          projection: {
            remainingMinutes: 25 // 25分残り (危険レベル)
          },
          burnRate: {
            tokensPerMinute: 800
          }
        }
      ]
    }
    
    mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

    // Act
    await statusUpdater.updateOnce()

    // Assert - 危険レベルの警告色が設定されているか確認
    const executedCommands = mockExecutor.getExecutedCommands()
    const warningColorCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_warning_color') && cmd.includes('colour1') // 赤色
    )
    expect(warningColorCommand).toBeDefined()
    
    const warningLevelCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_warning_level') && cmd.includes('danger')
    )
    expect(warningLevelCommand).toBeDefined()
  })

  test('should handle session time calculation', async () => {
    // Arrange - セッション情報を含むレスポンス
    const now = new Date()
    const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2時間後
    
    const mockCcusageResponse = {
      blocks: [
        {
          isActive: true,
          totalTokens: 50000,
          costUSD: 20.00,
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
          projection: {
            remainingMinutes: 90
          },
          burnRate: {
            tokensPerMinute: 300
          }
        }
      ]
    }
    
    mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

    // Act
    await statusUpdater.updateOnce()

    // Assert - セッション残り時間が設定されているか確認
    const executedCommands = mockExecutor.getExecutedCommands()
    const sessionTimeCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_session_time_remaining')
    )
    expect(sessionTimeCommand).toBeDefined()
    
    // 約2時間の残り時間が設定されているはず
    const sessionSecondsCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_session_remaining_seconds')
    )
    expect(sessionSecondsCommand).toBeDefined()
  })

  test('should use ccusage tokenLimitStatus for warning levels', async () => {
    // Arrange - ccusageのstatusフィールドを含むレスポンス
    const mockCcusageResponse = {
      blocks: [
        {
          isActive: true,
          totalTokens: 130000,
          costUSD: 45.50,
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          projection: {
            remainingMinutes: 25
          },
          burnRate: {
            tokensPerMinute: 800
          },
          tokenLimitStatus: {
            limit: 140000,
            projectedUsage: 130000,
            percentUsed: 92.86,
            status: 'exceeds'
          }
        }
      ]
    }
    
    mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify(mockCcusageResponse))
    // 制限値を明示的に設定（ccusageにtoken-limitオプションを渡すため）
    mockExecutor.setResponse('tmux show-option -gqv "@ccusage_token_limit"', '140000')

    // Act
    await statusUpdater.updateOnce()

    // Assert - ccusageのstatusフィールドに基づく警告色が設定されているか確認
    const executedCommands = mockExecutor.getExecutedCommands()
    const warningColorCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_warning_color') && cmd.includes('colour1') // 赤色（danger）
    )
    expect(warningColorCommand).toBeDefined()
    
    const warningLevelCommand = executedCommands.find(cmd => 
      cmd.includes('@ccusage_warning_level') && cmd.includes('danger')
    )
    expect(warningLevelCommand).toBeDefined()
    
    // token-limitオプション付きでccusageが実行されたことを確認
    expect(mockExecutor.wasCommandExecuted('ccusage blocks --active --json --token-limit 140000')).toBe(true)
  })
})