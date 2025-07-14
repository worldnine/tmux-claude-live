import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { LockManager } from '../../../src/utils/LockManager'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// fsモジュールをモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn()
}))

// pathモジュールをモック
vi.mock('path', () => ({
  join: vi.fn()
}))

// osモジュールをモック
vi.mock('os', () => ({
  tmpdir: vi.fn(),
  hostname: vi.fn()
}))

describe('LockManager', () => {
  let lockManager: LockManager
  let mockTmpdir: string
  let mockLockFile: string
  let mockPidFile: string
  let originalPid: number
  let originalProcessKill: typeof process.kill

  beforeEach(() => {
    // プロセス関連のバックアップと設定
    originalPid = process.pid
    originalProcessKill = process.kill
    
    // モックの設定
    mockTmpdir = '/tmp'
    mockLockFile = '/tmp/test-lock.lock'
    mockPidFile = '/tmp/test-lock.pid'
    
    vi.mocked(tmpdir).mockReturnValue(mockTmpdir)
    vi.mocked(join).mockImplementation((dir, file) => `${dir}/${file}`)
    vi.mocked(require('os').hostname).mockReturnValue('test-host')
    
    // LockManagerインスタンスを作成
    lockManager = new LockManager('test-lock', 30000)
    
    // プロセスPIDを固定値に設定
    Object.defineProperty(process, 'pid', { value: 12345, writable: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
    
    // プロセス関連の復元
    Object.defineProperty(process, 'pid', { value: originalPid, writable: true })
    process.kill = originalProcessKill
  })

  describe('constructor', () => {
    test('should initialize with default parameters', () => {
      const defaultLockManager = new LockManager()
      
      expect(tmpdir).toHaveBeenCalled()
      expect(join).toHaveBeenCalledWith(mockTmpdir, 'tmux-claude-live.lock')
      expect(join).toHaveBeenCalledWith(mockTmpdir, 'tmux-claude-live.pid')
    })

    test('should initialize with custom parameters', () => {
      const customLockManager = new LockManager('custom-lock', 60000)
      
      expect(join).toHaveBeenCalledWith(mockTmpdir, 'custom-lock.lock')
      expect(join).toHaveBeenCalledWith(mockTmpdir, 'custom-lock.pid')
    })
  })

  describe('acquire', () => {
    test('should acquire lock when no lock file exists', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(true)
      expect(existsSync).toHaveBeenCalledWith(mockLockFile)
      expect(writeFileSync).toHaveBeenCalledWith(
        mockLockFile,
        expect.stringContaining('"pid": 12345')
      )
      expect(writeFileSync).toHaveBeenCalledWith(mockPidFile, '12345')
    })

    test('should write correct lock data format', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)
      const mockNow = 1625097600000
      const originalDateNow = Date.now
      Date.now = vi.fn(() => mockNow)

      // Act
      lockManager.acquire()

      // Assert
      const expectedLockData = JSON.stringify({
        pid: 12345,
        timestamp: mockNow,
        hostname: 'test-host'
      }, null, 2)
      
      expect(writeFileSync).toHaveBeenCalledWith(mockLockFile, expectedLockData)
      
      // Cleanup
      Date.now = originalDateNow
    })

    test('should fail to acquire lock when valid lock exists', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: Date.now() - 10000, // 10秒前
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))
      
      // プロセスが存在することをシミュレート
      process.kill = vi.fn(() => true) as any

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(false)
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    test('should acquire lock when existing lock is invalid (process not found)', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: Date.now() - 10000,
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))
      
      // プロセスが存在しないことをシミュレート
      process.kill = vi.fn(() => {
        throw new Error('No such process')
      }) as any

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(true)
      expect(unlinkSync).toHaveBeenCalledWith(mockLockFile)
      expect(unlinkSync).toHaveBeenCalledWith(mockPidFile)
      expect(writeFileSync).toHaveBeenCalled()
    })

    test('should acquire lock when existing lock has timed out', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: Date.now() - 40000, // 40秒前（30秒のタイムアウトを超過）
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(true)
      expect(unlinkSync).toHaveBeenCalled() // forceRelease が呼ばれる
      expect(writeFileSync).toHaveBeenCalled()
    })

    test('should handle file system errors gracefully', () => {
      // Arrange
      vi.mocked(existsSync).mockImplementation(() => {
        throw new Error('File system error')
      })
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Failed to acquire lock:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })

    test('should handle corrupted lock file', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('invalid json')

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(true) // 無効なロックファイルなので取得成功
      expect(writeFileSync).toHaveBeenCalled()
    })
  })

  describe('release', () => {
    test('should release own lock successfully', () => {
      // Arrange
      const mockLockData = {
        pid: 12345, // 自分のPID
        timestamp: Date.now(),
        hostname: 'test-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))

      // Act
      lockManager.release()

      // Assert
      expect(unlinkSync).toHaveBeenCalledWith(mockLockFile)
      expect(unlinkSync).toHaveBeenCalledWith(mockPidFile)
    })

    test('should not release other process lock', () => {
      // Arrange
      const mockLockData = {
        pid: 54321, // 他のプロセスのPID
        timestamp: Date.now(),
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))

      // Act
      lockManager.release()

      // Assert
      expect(unlinkSync).not.toHaveBeenCalledWith(mockLockFile)
    })

    test('should handle missing lock file gracefully', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)

      // Act & Assert - should not throw
      expect(() => lockManager.release()).not.toThrow()
    })

    test('should handle file system errors gracefully', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('File system error')
      })
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act & Assert - should not throw
      expect(() => lockManager.release()).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith('Failed to release lock:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })

    test('should always clean up PID file', () => {
      // Arrange
      vi.mocked(existsSync).mockImplementation((path) => {
        if (path === mockPidFile) return true
        return false
      })

      // Act
      lockManager.release()

      // Assert
      expect(unlinkSync).toHaveBeenCalledWith(mockPidFile)
    })
  })

  describe('forceRelease', () => {
    test('should force release all lock files', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(true)

      // Act
      lockManager.forceRelease()

      // Assert
      expect(unlinkSync).toHaveBeenCalledWith(mockLockFile)
      expect(unlinkSync).toHaveBeenCalledWith(mockPidFile)
    })

    test('should handle missing files gracefully', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)

      // Act & Assert - should not throw
      expect(() => lockManager.forceRelease()).not.toThrow()
      expect(unlinkSync).not.toHaveBeenCalled()
    })

    test('should handle file system errors gracefully', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('File system error')
      })
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act & Assert - should not throw
      expect(() => lockManager.forceRelease()).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith('Failed to force release lock:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('isLocked', () => {
    test('should return false when no lock file exists', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)

      // Act
      const result = lockManager.isLocked()

      // Assert
      expect(result).toBe(false)
    })

    test('should return true for valid lock', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: Date.now() - 10000, // 10秒前
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))
      
      // プロセスが存在することをシミュレート
      process.kill = vi.fn(() => true) as any

      // Act
      const result = lockManager.isLocked()

      // Assert
      expect(result).toBe(true)
    })

    test('should return false for expired lock', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: Date.now() - 40000, // 40秒前（タイムアウト）
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))

      // Act
      const result = lockManager.isLocked()

      // Assert
      expect(result).toBe(false)
    })

    test('should return false when process does not exist', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: Date.now() - 10000,
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))
      
      // プロセスが存在しないことをシミュレート
      process.kill = vi.fn(() => {
        throw new Error('No such process')
      }) as any

      // Act
      const result = lockManager.isLocked()

      // Assert
      expect(result).toBe(false)
    })
  })

  describe('getLockInfo', () => {
    test('should return null when no lock file exists', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)

      // Act
      const result = lockManager.getLockInfo()

      // Assert
      expect(result).toBeNull()
    })

    test('should return lock data when file exists', () => {
      // Arrange
      const mockLockData = {
        pid: 54321,
        timestamp: 1625097600000,
        hostname: 'other-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))

      // Act
      const result = lockManager.getLockInfo()

      // Assert
      expect(result).toEqual(mockLockData)
    })

    test('should return null for corrupted lock file', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('invalid json')

      // Act
      const result = lockManager.getLockInfo()

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('setupAutoRelease', () => {
    let processOnSpy: ReturnType<typeof vi.spyOn>
    let processExitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      processOnSpy = vi.spyOn(process, 'on')
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
    })

    afterEach(() => {
      processOnSpy.mockRestore()
      processExitSpy.mockRestore()
    })

    test('should setup exit handler', () => {
      // Act
      lockManager.setupAutoRelease()

      // Assert
      expect(processOnSpy).toHaveBeenCalledWith('exit', expect.any(Function))
    })

    test('should setup SIGINT handler', () => {
      // Act
      lockManager.setupAutoRelease()

      // Assert
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    })

    test('should setup SIGTERM handler', () => {
      // Act
      lockManager.setupAutoRelease()

      // Assert
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    })

    test('should setup uncaughtException handler', () => {
      // Act
      lockManager.setupAutoRelease()

      // Assert
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function))
    })

    test('should call release on SIGINT', () => {
      // Arrange
      const releaseSpy = vi.spyOn(lockManager, 'release')
      lockManager.setupAutoRelease()

      // Act
      const sigintHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGINT')?.[1] as Function
      
      try {
        sigintHandler()
      } catch (error) {
        // process.exit が呼ばれることを期待
      }

      // Assert
      expect(releaseSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(0)
    })

    test('should call release on uncaughtException', () => {
      // Arrange
      const releaseSpy = vi.spyOn(lockManager, 'release')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      lockManager.setupAutoRelease()

      // Act
      const exceptionHandler = processOnSpy.mock.calls.find(call => call[0] === 'uncaughtException')?.[1] as Function
      const testError = new Error('Test error')
      
      try {
        exceptionHandler(testError)
      } catch (error) {
        // process.exit が呼ばれることを期待
      }

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('Uncaught exception:', testError)
      expect(releaseSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(1)
      
      consoleSpy.mockRestore()
    })
  })

  describe('integration scenarios', () => {
    test('should handle complete acquire-release cycle', () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false)

      // Act - Acquire
      const acquireResult = lockManager.acquire()
      
      // Assert - Acquire
      expect(acquireResult).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()

      // Setup for release
      const mockLockData = {
        pid: 12345,
        timestamp: Date.now(),
        hostname: 'test-host'
      }
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLockData))

      // Act - Release
      lockManager.release()

      // Assert - Release
      expect(unlinkSync).toHaveBeenCalledWith(mockLockFile)
      expect(unlinkSync).toHaveBeenCalledWith(mockPidFile)
    })

    test('should prevent concurrent access from multiple instances', () => {
      // Arrange
      const firstLockManager = new LockManager('concurrent-test')
      const secondLockManager = new LockManager('concurrent-test')
      
      // 最初のインスタンスがロックを取得
      vi.mocked(existsSync).mockReturnValue(false)
      const firstResult = firstLockManager.acquire()
      expect(firstResult).toBe(true)

      // 2番目のインスタンス用にロックファイルが存在することをシミュレート
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        pid: 12345,
        timestamp: Date.now(),
        hostname: 'test-host'
      }))
      process.kill = vi.fn(() => true) as any

      // Act
      const secondResult = secondLockManager.acquire()

      // Assert
      expect(secondResult).toBe(false)
    })

    test('should recover from stale lock files', () => {
      // Arrange - 古いロックファイルをシミュレート
      const staleLockData = {
        pid: 99999, // 存在しないPID
        timestamp: Date.now() - 50000, // 50秒前
        hostname: 'old-host'
      }
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(staleLockData))
      
      // プロセスが存在しないことをシミュレート
      process.kill = vi.fn(() => {
        throw new Error('No such process')
      }) as any

      // Act
      const result = lockManager.acquire()

      // Assert
      expect(result).toBe(true)
      expect(unlinkSync).toHaveBeenCalled() // 古いロックファイルがクリーンアップされる
      expect(writeFileSync).toHaveBeenCalled() // 新しいロックファイルが作成される
    })
  })
})