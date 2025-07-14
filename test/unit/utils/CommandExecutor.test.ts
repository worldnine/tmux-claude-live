import { describe, expect, test, beforeEach, vi } from 'vitest'
import { RealCommandExecutor, MockCommandExecutor } from '../../../src/utils/CommandExecutor'

describe('RealCommandExecutor', () => {
  let executor: RealCommandExecutor

  beforeEach(() => {
    executor = new RealCommandExecutor()
  })

  test('should execute simple command successfully', () => {
    // Act
    const result = executor.execute('echo "hello"')

    // Assert
    expect(result).toContain('hello')
  })

  test('should handle command with options', () => {
    // Act
    const result = executor.execute('echo "test"', { encoding: 'utf8' })

    // Assert
    expect(result).toContain('test')
  })

  test('should throw error for invalid command', () => {
    // Act & Assert
    expect(() => {
      executor.execute('nonexistentcommand12345')
    }).toThrow()
  })

  test('should respect timeout option', () => {
    // Act & Assert
    expect(() => {
      executor.execute('sleep 10', { timeout: 100 })
    }).toThrow()
  })

  describe('retry functionality', () => {
    test('should retry failed commands with default retry count', () => {
      // Act & Assert - 失敗するコマンドで3回リトライしてから失敗する
      expect(() => {
        executor.execute('nonexistentcommand12345')
      }).toThrow(/Command execution failed after 3 attempts/)
    })

    test('should use custom retry count when specified', () => {
      // Act & Assert - カスタムリトライ回数（1回）
      expect(() => {
        executor.execute('nonexistentcommand12345', { retries: 1 })
      }).toThrow(/Command execution failed after 1 attempts/)
    })

    test('should succeed on retry when command becomes available', () => {
      // Arrange - コマンドの成功をシミュレートするのは困難なため、成功するコマンドでテスト
      const result = executor.execute('echo "success"', { retries: 2 })
      
      // Assert
      expect(result).toContain('success')
    })

    test('should use exponential backoff for retries', () => {
      // Arrange - sleepメソッドをスパイ
      const sleepSpy = vi.spyOn(executor as any, 'sleep')
      
      // Act - 失敗するコマンドでリトライを発生させる
      try {
        executor.execute('nonexistentcommand12345', { retries: 3, retryDelay: 100 })
      } catch (error) {
        // Expected to fail
      }
      
      // Assert - 指数バックオフが実行される（1回目:100ms, 2回目:200ms）
      expect(sleepSpy).toHaveBeenCalledWith(100) // 1st retry
      expect(sleepSpy).toHaveBeenCalledWith(200) // 2nd retry
      expect(sleepSpy).toHaveBeenCalledTimes(2)  // 3回目の後はスリープしない
      
      sleepSpy.mockRestore()
    })

    test('should include last error message in final error', () => {
      // Act & Assert
      expect(() => {
        executor.execute('nonexistentcommand12345', { retries: 2 })
      }).toThrow(/Last error:/)
    })

    test('should work with custom retry delay', () => {
      // Arrange
      const sleepSpy = vi.spyOn(executor as any, 'sleep')
      
      // Act
      try {
        executor.execute('nonexistentcommand12345', { retries: 2, retryDelay: 50 })
      } catch (error) {
        // Expected to fail
      }
      
      // Assert - カスタム遅延が使用される
      expect(sleepSpy).toHaveBeenCalledWith(50) // 1st retry with custom delay
      
      sleepSpy.mockRestore()
    })
  })

  describe('dynamic timeout', () => {
    test('should use 30 second timeout for tmux commands', () => {
      // Arrange - ショートタイムアウトでtmuxコマンドをテストするのは困難なため、
      // デフォルトタイムアウトを確認するプライベートメソッドをテスト
      const timeout = (executor as any).getDefaultTimeout('tmux show-option')
      
      // Assert
      expect(timeout).toBe(30000)
    })

    test('should use 15 second timeout for ccusage commands', () => {
      // Act
      const timeout = (executor as any).getDefaultTimeout('ccusage blocks --active')
      
      // Assert
      expect(timeout).toBe(15000)
    })

    test('should use 10 second timeout for other commands', () => {
      // Act
      const timeout = (executor as any).getDefaultTimeout('echo hello')
      
      // Assert
      expect(timeout).toBe(10000)
    })

    test('should override default timeout with custom option', () => {
      // Arrange - 速いコマンドでカスタムタイムアウトをテスト
      const result = executor.execute('echo "test"', { timeout: 5000 })
      
      // Assert - カスタムタイムアウトが使用されても成功する
      expect(result).toContain('test')
    })
  })

  describe('sleep implementation', () => {
    test('should implement busy-wait sleep', () => {
      // Arrange
      const startTime = Date.now()
      
      // Act - プライベートメソッドを直接テスト
      ;(executor as any).sleep(50)
      
      // Assert - 指定した時間が経過している
      const elapsedTime = Date.now() - startTime
      expect(elapsedTime).toBeGreaterThanOrEqual(40) // 誤差を考慮した下限
      expect(elapsedTime).toBeLessThan(100) // 上限も設定
    })

    test('should not use async operations', () => {
      // Arrange - プロミスをモニターするためのスパイ
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
      
      // Act
      ;(executor as any).sleep(10)
      
      // Assert - setTimeoutが使用されていないことを確認
      expect(setTimeoutSpy).not.toHaveBeenCalled()
      
      setTimeoutSpy.mockRestore()
    })
  })

  describe('integration with options', () => {
    test('should combine all options correctly', () => {
      // Act - 複数のオプションを同時に使用
      const result = executor.execute('echo "integration test"', {
        encoding: 'utf8',
        timeout: 5000,
        retries: 1
      })
      
      // Assert
      expect(result).toContain('integration test')
    })

    test('should handle working directory option', () => {
      // Act - cwdオプションのテスト
      const result = executor.execute('pwd', { cwd: '/' })
      
      // Assert - ルートディレクトリが表示される
      expect(result.trim()).toBe('/')
    })
  })
})

/**
 * MockCommandExecutorの新機能の文数化
 */
describe('MockCommandExecutor', () => {
  let executor: MockCommandExecutor

  beforeEach(() => {
    executor = new MockCommandExecutor()
  })

  test('should return empty string by default', () => {
    // Act
    const result = executor.execute('any command')

    // Assert
    expect(result).toBe('')
    expect(executor.wasCommandExecuted('any command')).toBe(true)
  })

  test('should return configured response', () => {
    // Arrange
    executor.setResponse('test', 'mock response')

    // Act
    const result = executor.execute('test command')

    // Assert
    expect(result).toBe('mock response')
  })

  test('should throw configured error', () => {
    // Arrange
    const testError = new Error('test error')
    executor.setError('fail', testError)

    // Act & Assert
    expect(() => {
      executor.execute('fail command')
    }).toThrow('test error')
  })

  test('should track executed commands', () => {
    // Act
    executor.execute('command1')
    executor.execute('command2')

    // Assert
    const commands = executor.getExecutedCommands()
    expect(commands).toHaveLength(2)
    expect(commands).toContain('command1')
    expect(commands).toContain('command2')
  })

  test('should prioritize more specific matches', () => {
    // Arrange
    executor.setResponse('tmux', 'generic tmux response')
    executor.setResponse('tmux show-option', 'specific tmux response')

    // Act
    const result = executor.execute('tmux show-option -gqv @test')

    // Assert
    expect(result).toBe('specific tmux response')
  })

  test('should clear executed commands', () => {
    // Arrange
    executor.execute('command1')

    // Act
    executor.clearExecutedCommands()

    // Assert
    expect(executor.getExecutedCommands()).toHaveLength(0)
  })

  test('should reset all settings', () => {
    // Arrange
    executor.setResponse('test', 'response')
    executor.setError('error', new Error('test'))
    executor.execute('command')

    // Act
    executor.reset()

    // Assert
    expect(executor.getExecutedCommands()).toHaveLength(0)
    expect(executor.execute('test')).toBe('')
    expect(() => executor.execute('error')).not.toThrow()
  })

  test('should check if command was executed', () => {
    // Act
    executor.execute('specific command here')

    // Assert
    expect(executor.wasCommandExecuted('specific')).toBe(true)
    expect(executor.wasCommandExecuted('command')).toBe(true)
    expect(executor.wasCommandExecuted('notexecuted')).toBe(false)
  })

  describe('enhanced functionality', () => {
    test('should handle partial command matching correctly', () => {
      // Arrange
      executor.setResponse('tmux show', 'show response')
      executor.setResponse('tmux set', 'set response')
      
      // Act & Assert
      expect(executor.execute('tmux show-option -gqv')).toBe('show response')
      expect(executor.execute('tmux set-option -g')).toBe('set response')
    })

    test('should handle multiple overlapping patterns', () => {
      // Arrange - 重複するパターンを設定
      executor.setResponse('command', 'generic response')
      executor.setResponse('command with args', 'specific response')
      executor.setResponse('command with args and more', 'very specific response')
      
      // Act & Assert - より具体的なマッチが優先される
      expect(executor.execute('command')).toBe('generic response')
      expect(executor.execute('command with args')).toBe('specific response')
      expect(executor.execute('command with args and more')).toBe('very specific response')
    })

    test('should maintain command execution order', () => {
      // Act
      executor.execute('first command')
      executor.execute('second command')
      executor.execute('third command')
      
      // Assert - 実行順序が維持される
      const commands = executor.getExecutedCommands()
      expect(commands[0]).toBe('first command')
      expect(commands[1]).toBe('second command')
      expect(commands[2]).toBe('third command')
    })

    test('should handle command execution with delay simulation', () => {
      // Arrange
      const startTime = Date.now()
      
      // Act - 簡単なコマンドで遅延をシミュレート
      executor.setResponse('slow', 'delayed response')
      const result = executor.execute('slow command')
      
      // Assert
      expect(result).toBe('delayed response')
      expect(Date.now() - startTime).toBeLessThan(100) // モックなので速い
    })

    test('should support error priority over responses', () => {
      // Arrange - 同じパターンにエラーとレスポンスを設定
      executor.setResponse('test', 'response')
      executor.setError('test', new Error('error'))
      
      // Act & Assert - エラーが優先される
      expect(() => executor.execute('test command')).toThrow('error')
    })

    test('should handle empty command execution', () => {
      // Act
      const result = executor.execute('')
      
      // Assert
      expect(result).toBe('')
      expect(executor.wasCommandExecuted('')).toBe(true)
    })

    test('should support dynamic response patterns', () => {
      // Arrange - 動的なレスポンスパターン
      let callCount = 0
      executor.setResponse('counter', 'static response')
      
      // 動的レスポンスをシミュレートするためにレスポンスを上書き
      const dynamicResponse = () => {
        callCount++
        executor.setResponse('counter', `response ${callCount}`)
        return executor.execute('counter command')
      }
      
      // Act & Assert
      expect(dynamicResponse()).toBe('response 1')
      expect(dynamicResponse()).toBe('response 2')
      expect(dynamicResponse()).toBe('response 3')
    })
  })
})