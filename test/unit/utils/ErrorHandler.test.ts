import { describe, expect, test, beforeEach } from 'vitest'
import { ErrorHandler, ErrorType } from '../../../src/utils/ErrorHandler'

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler

  beforeEach(() => {
    errorHandler = ErrorHandler.getInstance()
    errorHandler.clearErrorStats()
  })

  describe('error classification', () => {
    test('should classify ccusage not found error', () => {
      // Arrange
      const error = new Error('ccusage: command not found')
      const context = { command: 'ccusage blocks --active --json' }
      
      // Act
      const errorType = errorHandler.classifyError(error, context)
      
      // Assert
      expect(errorType).toBe(ErrorType.CCUSAGE_NOT_FOUND)
    })

    test('should classify ccusage timeout error', () => {
      // Arrange
      const error = new Error('Command timeout exceeded')
      const context = { command: 'ccusage blocks --active --json' }
      
      // Act
      const errorType = errorHandler.classifyError(error, context)
      
      // Assert
      expect(errorType).toBe(ErrorType.CCUSAGE_TIMEOUT)
    })

    test('should classify JSON parse error', () => {
      // Arrange
      const error = new Error('Unexpected token in JSON at position 0')
      
      // Act
      const errorType = errorHandler.classifyError(error)
      
      // Assert
      expect(errorType).toBe(ErrorType.CCUSAGE_PARSE_ERROR)
    })

    test('should classify tmux not found error', () => {
      // Arrange
      const error = new Error('tmux: command not found')
      const context = { command: 'tmux set-option -g @test "value"' }
      
      // Act
      const errorType = errorHandler.classifyError(error, context)
      
      // Assert
      expect(errorType).toBe(ErrorType.TMUX_NOT_FOUND)
    })

    test('should classify tmux no session error', () => {
      // Arrange
      const error = new Error('no server running on /tmp/tmux')
      
      // Act
      const errorType = errorHandler.classifyError(error)
      
      // Assert
      expect(errorType).toBe(ErrorType.TMUX_NO_SESSION)
    })

    test('should classify permission error', () => {
      // Arrange
      const error = new Error('Permission denied')
      
      // Act
      const errorType = errorHandler.classifyError(error)
      
      // Assert
      expect(errorType).toBe(ErrorType.TMUX_PERMISSION_ERROR)
    })

    test('should classify config error', () => {
      // Arrange
      const error = new Error('Invalid configuration setting')
      
      // Act
      const errorType = errorHandler.classifyError(error)
      
      // Assert
      expect(errorType).toBe(ErrorType.CONFIG_ERROR)
    })

    test('should classify unknown error', () => {
      // Arrange
      const error = new Error('Something went wrong')
      
      // Act
      const errorType = errorHandler.classifyError(error)
      
      // Assert
      expect(errorType).toBe(ErrorType.UNKNOWN_ERROR)
    })
  })

  describe('error handling', () => {
    test('should handle ccusage not found error with fallback', async () => {
      // Arrange
      const error = new Error('ccusage: command not found')
      const context = { 
        command: 'ccusage blocks --active --json',
        attemptCount: 3
      }
      
      // Act
      const recovered = await errorHandler.handleError(error, context)
      
      // Assert
      expect(recovered).toBe(true)
      
      const stats = errorHandler.getErrorStats()
      expect(stats.counts[ErrorType.CCUSAGE_NOT_FOUND]).toBe(1)
      expect(stats.lastOccurrence[ErrorType.CCUSAGE_NOT_FOUND]).toBeInstanceOf(Date)
    })

    test('should handle ccusage timeout with retry', async () => {
      // Arrange
      const error = new Error('Command timeout exceeded')
      const context = { 
        command: 'ccusage blocks --active --json',
        attemptCount: 1
      }
      
      // Act
      const recovered = await errorHandler.handleError(error, context)
      
      // Assert
      expect(recovered).toBe(false) // Should retry
      
      const stats = errorHandler.getErrorStats()
      expect(stats.counts[ErrorType.CCUSAGE_TIMEOUT]).toBe(1)
    })

    test('should handle tmux not found error', async () => {
      // Arrange
      const error = new Error('tmux: command not found')
      const context = { 
        command: 'tmux set-option -g @test "value"',
        attemptCount: 1
      }
      
      // Act
      const recovered = await errorHandler.handleError(error, context)
      
      // Assert
      expect(recovered).toBe(true)
      
      const stats = errorHandler.getErrorStats()
      expect(stats.counts[ErrorType.TMUX_NOT_FOUND]).toBe(1)
    })

    test('should handle config error with default values', async () => {
      // Arrange
      const error = new Error('Invalid configuration setting')
      const context = { 
        command: 'loadConfig',
        attemptCount: 1
      }
      
      // Act
      const recovered = await errorHandler.handleError(error, context)
      
      // Assert
      expect(recovered).toBe(true)
      
      const stats = errorHandler.getErrorStats()
      expect(stats.counts[ErrorType.CONFIG_ERROR]).toBe(1)
    })

    test('should handle unknown error', async () => {
      // Arrange
      const error = new Error('Something went wrong')
      const context = { 
        command: 'unknown',
        attemptCount: 1
      }
      
      // Act
      const recovered = await errorHandler.handleError(error, context)
      
      // Assert
      expect(recovered).toBe(true)
      
      const stats = errorHandler.getErrorStats()
      expect(stats.counts[ErrorType.UNKNOWN_ERROR]).toBe(1)
    })
  })

  describe('error statistics', () => {
    test('should track error counts', async () => {
      // Arrange
      const error1 = new Error('ccusage: command not found')
      const error2 = new Error('tmux: command not found')
      
      // Act
      await errorHandler.handleError(error1, { command: 'ccusage', attemptCount: 3 })
      await errorHandler.handleError(error1, { command: 'ccusage', attemptCount: 3 })
      await errorHandler.handleError(error2, { command: 'tmux', attemptCount: 1 })
      
      // Assert
      const stats = errorHandler.getErrorStats()
      expect(stats.counts[ErrorType.CCUSAGE_NOT_FOUND]).toBe(2)
      expect(stats.counts[ErrorType.TMUX_NOT_FOUND]).toBe(1)
    })

    test('should track last occurrence times', async () => {
      // Arrange
      const error = new Error('ccusage: command not found')
      const beforeTime = new Date()
      
      // Act
      await errorHandler.handleError(error, { command: 'ccusage', attemptCount: 3 })
      
      // Assert
      const afterTime = new Date()
      const stats = errorHandler.getErrorStats()
      const lastOccurrence = stats.lastOccurrence[ErrorType.CCUSAGE_NOT_FOUND]
      
      expect(lastOccurrence).toBeInstanceOf(Date)
      expect(lastOccurrence.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
      expect(lastOccurrence.getTime()).toBeLessThanOrEqual(afterTime.getTime())
    })

    test('should clear error statistics', async () => {
      // Arrange
      const error = new Error('ccusage: command not found')
      await errorHandler.handleError(error, { command: 'ccusage', attemptCount: 3 })
      
      // Act
      errorHandler.clearErrorStats()
      
      // Assert
      const stats = errorHandler.getErrorStats()
      expect(Object.keys(stats.counts)).toHaveLength(0)
      expect(Object.keys(stats.lastOccurrence)).toHaveLength(0)
    })
  })

  describe('custom recovery strategies', () => {
    test('should allow custom recovery strategies', async () => {
      // Arrange
      let customActionCalled = false
      const customStrategy = {
        maxAttempts: 1,
        backoffMs: 0,
        fallbackAction: async () => {
          customActionCalled = true
        }
      }
      
      errorHandler.setRecoveryStrategy(ErrorType.UNKNOWN_ERROR, customStrategy)
      
      const error = new Error('Custom error')
      
      // Act
      const recovered = await errorHandler.handleError(error, { attemptCount: 1 })
      
      // Assert
      expect(recovered).toBe(true)
      expect(customActionCalled).toBe(true)
    })
  })
})