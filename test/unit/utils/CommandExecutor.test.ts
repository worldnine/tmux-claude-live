import { describe, expect, test, beforeEach } from 'vitest'
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
})

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
})