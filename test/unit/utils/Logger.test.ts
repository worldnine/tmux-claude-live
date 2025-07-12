import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { Logger, LogLevel } from '../../../src/utils/Logger'

describe('Logger', () => {
  let logger: Logger
  let originalConsoleLog: any
  let originalConsoleError: any
  let logOutput: string[]
  let errorOutput: string[]

  beforeEach(() => {
    logger = Logger.getInstance()
    logger.clearLogs()
    
    // コンソール出力をキャプチャ
    logOutput = []
    errorOutput = []
    
    originalConsoleLog = console.log
    originalConsoleError = console.error
    
    console.log = (...args: any[]) => {
      logOutput.push(args.join(' '))
    }
    
    console.error = (...args: any[]) => {
      errorOutput.push(args.join(' '))
    }
  })

  afterEach(() => {
    console.log = originalConsoleLog
    console.error = originalConsoleError
  })

  describe('basic logging', () => {
    test('should log debug messages', () => {
      // Arrange
      logger.setLevel(LogLevel.DEBUG)
      
      // Act
      logger.debug('Debug message', { key: 'value' })
      
      // Assert
      const logs = logger.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe(LogLevel.DEBUG)
      expect(logs[0].message).toBe('Debug message')
      expect(logs[0].context).toEqual({ key: 'value' })
    })

    test('should log info messages', () => {
      // Act
      logger.info('Info message')
      
      // Assert
      const logs = logger.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe(LogLevel.INFO)
      expect(logs[0].message).toBe('Info message')
    })

    test('should log warning messages', () => {
      // Act
      logger.warn('Warning message')
      
      // Assert
      const logs = logger.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe(LogLevel.WARN)
      expect(logs[0].message).toBe('Warning message')
    })

    test('should log error messages with error object', () => {
      // Arrange
      const error = new Error('Test error')
      
      // Act
      logger.error('Error message', error, { context: 'test' })
      
      // Assert
      const logs = logger.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe(LogLevel.ERROR)
      expect(logs[0].message).toBe('Error message')
      expect(logs[0].error).toBe(error)
      expect(logs[0].context).toEqual({ context: 'test' })
    })
  })

  describe('log levels', () => {
    test('should respect log level filtering', () => {
      // Arrange
      logger.setLevel(LogLevel.WARN)
      
      // Act
      logger.debug('Debug message') // Should be filtered out
      logger.info('Info message')   // Should be filtered out
      logger.warn('Warning message') // Should be logged
      logger.error('Error message')  // Should be logged
      
      // Assert
      const logs = logger.getLogs()
      expect(logs).toHaveLength(2)
      expect(logs[0].level).toBe(LogLevel.WARN)
      expect(logs[1].level).toBe(LogLevel.ERROR)
    })

    test('should filter logs by level in getLogs', () => {
      // Arrange
      logger.setLevel(LogLevel.DEBUG)
      
      // Act
      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warning message')
      logger.error('Error message')
      
      // Assert
      const allLogs = logger.getLogs()
      expect(allLogs).toHaveLength(4)
      
      const errorLogs = logger.getLogs(LogLevel.ERROR)
      expect(errorLogs).toHaveLength(1)
      expect(errorLogs[0].level).toBe(LogLevel.ERROR)
      
      const warnAndAbove = logger.getLogs(LogLevel.WARN)
      expect(warnAndAbove).toHaveLength(2)
    })
  })

  describe('console output', () => {
    test('should output to console.log for info and debug', () => {
      // Arrange
      logger.setLevel(LogLevel.DEBUG)
      
      // Act
      logger.debug('Debug message')
      logger.info('Info message')
      
      // Assert
      expect(logOutput).toHaveLength(2)
      expect(logOutput[0]).toContain('DEBUG: Debug message')
      expect(logOutput[1]).toContain('INFO: Info message')
    })

    test('should output to console.error for warn and error', () => {
      // Act
      logger.warn('Warning message')
      logger.error('Error message')
      
      // Assert
      expect(errorOutput).toHaveLength(2)
      expect(errorOutput[0]).toContain('WARN: Warning message')
      expect(errorOutput[1]).toContain('ERROR: Error message')
    })
  })

  describe('buffer management', () => {
    test('should maintain buffer size limit', () => {
      // Arrange
      logger.setLevel(LogLevel.DEBUG)
      
      // Act - Generate more logs than buffer size
      for (let i = 0; i < 150; i++) {
        logger.info(`Message ${i}`)
      }
      
      // Assert - Buffer should be limited to 100 entries
      const logs = logger.getLogs()
      expect(logs).toHaveLength(100)
      
      // The oldest logs should be removed
      expect(logs[0].message).toBe('Message 50')
      expect(logs[99].message).toBe('Message 149')
    })

    test('should clear logs', () => {
      // Arrange
      logger.info('Message 1')
      logger.info('Message 2')
      
      // Act
      logger.clearLogs()
      
      // Assert
      const logs = logger.getLogs()
      expect(logs).toHaveLength(0)
    })
  })

  describe('log statistics', () => {
    test('should provide log statistics', () => {
      // Arrange
      logger.setLevel(LogLevel.DEBUG)
      
      // Act
      logger.debug('Debug 1')
      logger.debug('Debug 2')
      logger.info('Info 1')
      logger.warn('Warning 1')
      logger.error('Error 1')
      logger.error('Error 2')
      
      // Assert
      const stats = logger.getLogStats()
      expect(stats.total).toBe(6)
      expect(stats.byLevel.DEBUG).toBe(2)
      expect(stats.byLevel.INFO).toBe(1)
      expect(stats.byLevel.WARN).toBe(1)
      expect(stats.byLevel.ERROR).toBe(2)
    })
  })
})