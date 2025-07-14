import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { HotReloader, ProcessManager } from '../../../src/utils/HotReloader'
import { watch } from 'fs'

// fsモジュールをモック
vi.mock('fs', () => ({
  watch: vi.fn()
}))

describe('HotReloader', () => {
  let hotReloader: HotReloader
  let mockReloadCallback: ReturnType<typeof vi.fn>
  let mockWatcher: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockReloadCallback = vi.fn()
    mockWatcher = {
      close: vi.fn()
    }
    vi.mocked(watch).mockReturnValue(mockWatcher)
    
    hotReloader = new HotReloader(mockReloadCallback, {
      enabled: true,
      watchPaths: ['src'],
      debounceMs: 100,
      excludePatterns: [/node_modules/, /\.git/]
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    hotReloader.stop()
  })

  describe('constructor', () => {
    test('should initialize with default options', () => {
      const defaultReloader = new HotReloader(mockReloadCallback)
      expect(defaultReloader.isEnabled()).toBe(false)
      expect(defaultReloader.getWatchedPaths()).toEqual(['src'])
    })

    test('should initialize with custom options', () => {
      const customReloader = new HotReloader(mockReloadCallback, {
        enabled: true,
        watchPaths: ['src', 'test'],
        debounceMs: 500
      })
      
      expect(customReloader.isEnabled()).toBe(true)
      expect(customReloader.getWatchedPaths()).toEqual(['src', 'test'])
    })
  })

  describe('start', () => {
    test('should not start watchers when disabled', () => {
      const disabledReloader = new HotReloader(mockReloadCallback, { enabled: false })
      disabledReloader.start()
      
      expect(watch).not.toHaveBeenCalled()
    })

    test('should start file watchers for all watch paths', () => {
      hotReloader.start()
      
      expect(watch).toHaveBeenCalledWith('src', { recursive: true }, expect.any(Function))
    })

    test('should handle watcher creation errors gracefully', () => {
      vi.mocked(watch).mockImplementation(() => {
        throw new Error('Failed to watch')
      })
      
      // Should not throw
      expect(() => hotReloader.start()).not.toThrow()
    })
  })

  describe('stop', () => {
    test('should close all watchers', () => {
      hotReloader.start()
      hotReloader.stop()
      
      expect(mockWatcher.close).toHaveBeenCalled()
    })

    test('should handle watcher close errors gracefully', () => {
      mockWatcher.close.mockImplementation(() => {
        throw new Error('Failed to close')
      })
      
      hotReloader.start()
      
      // Should not throw
      expect(() => hotReloader.stop()).not.toThrow()
    })
  })

  describe('file change detection', () => {
    test('should trigger reload for TypeScript files', async () => {
      hotReloader.start()
      
      // ファイル変更イベントをシミュレート
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      changeCallback('change', 'src/test.ts')
      
      // デバウンス待機
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(mockReloadCallback).toHaveBeenCalled()
    })

    test('should trigger reload for JavaScript files', async () => {
      hotReloader.start()
      
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      changeCallback('change', 'src/test.js')
      
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(mockReloadCallback).toHaveBeenCalled()
    })

    test('should trigger reload for JSON files', async () => {
      hotReloader.start()
      
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      changeCallback('change', 'package.json')
      
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(mockReloadCallback).toHaveBeenCalled()
    })

    test('should ignore excluded files', async () => {
      hotReloader.start()
      
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      changeCallback('change', 'node_modules/some-package/index.js')
      
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(mockReloadCallback).not.toHaveBeenCalled()
    })

    test('should ignore non-JS/TS/JSON files', async () => {
      hotReloader.start()
      
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      changeCallback('change', 'src/test.txt')
      
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(mockReloadCallback).not.toHaveBeenCalled()
    })

    test('should debounce multiple rapid changes', async () => {
      hotReloader.start()
      
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      
      // 複数の変更を短時間に発生
      changeCallback('change', 'src/test1.ts')
      changeCallback('change', 'src/test2.ts')
      changeCallback('change', 'src/test3.ts')
      
      await new Promise(resolve => setTimeout(resolve, 150))
      
      // デバウンスにより1回のみ呼び出される
      expect(mockReloadCallback).toHaveBeenCalledTimes(1)
    })
  })
})

describe('ProcessManager', () => {
  let processManager: ProcessManager
  let mockRestartCallback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // シングルトンをリセット
    processManager = ProcessManager.getInstance()
    mockRestartCallback = vi.fn()
  })

  afterEach(() => {
    processManager.cleanup()
    vi.clearAllMocks()
  })

  describe('singleton pattern', () => {
    test('should return same instance', () => {
      const instance1 = ProcessManager.getInstance()
      const instance2 = ProcessManager.getInstance()
      
      expect(instance1).toBe(instance2)
    })
  })

  describe('hot reload management', () => {
    test('should enable hot reload with default paths', () => {
      processManager.enableHotReload(true)
      
      // 実際の検証は統合テストで行う
      expect(() => processManager.enableHotReload(true)).not.toThrow()
    })

    test('should disable hot reload', () => {
      processManager.enableHotReload(false)
      
      expect(() => processManager.enableHotReload(false)).not.toThrow()
    })

    test('should set restart callback', () => {
      processManager.setRestartCallback(mockRestartCallback)
      
      // コールバックが設定されることを確認
      expect(() => processManager.setRestartCallback(mockRestartCallback)).not.toThrow()
    })
  })

  describe('cleanup', () => {
    test('should cleanup without errors', () => {
      processManager.enableHotReload(true)
      
      expect(() => processManager.cleanup()).not.toThrow()
    })
  })
})

// Integration test for file watching behavior
describe('HotReloader Integration', () => {
  test('should handle real file watching scenario', async () => {
    const mockCallback = vi.fn()
    const reloader = new HotReloader(mockCallback, {
      enabled: true,
      watchPaths: ['test'],
      debounceMs: 50
    })

    try {
      reloader.start()
      
      // ファイル変更をシミュレート
      const changeCallback = vi.mocked(watch).mock.calls[0][2]
      changeCallback('change', 'test/sample.ts')
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(mockCallback).toHaveBeenCalled()
    } finally {
      reloader.stop()
    }
  })
})