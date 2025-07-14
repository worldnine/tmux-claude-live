import { watch } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export interface HotReloadOptions {
  enabled: boolean
  watchPaths: string[]
  debounceMs: number
  excludePatterns: RegExp[]
}

export class HotReloader {
  private watchers: any[] = []
  private reloadCallback: () => void
  private debounceTimer: NodeJS.Timeout | null = null
  private options: HotReloadOptions

  constructor(reloadCallback: () => void, options: Partial<HotReloadOptions> = {}) {
    this.reloadCallback = reloadCallback
    this.options = {
      enabled: false,
      watchPaths: ['src'],
      debounceMs: 500,
      excludePatterns: [
        /node_modules/,
        /\.git/,
        /dist/,
        /build/,
        /\.log$/,
        /\.tmp$/
      ],
      ...options
    }
  }

  start(): void {
    if (!this.options.enabled) {
      return
    }

    console.log('[HotReload] Starting file watcher...')
    
    for (const watchPath of this.options.watchPaths) {
      try {
        const watcher = watch(watchPath, { recursive: true }, (eventType, filename) => {
          if (filename && this.shouldReload(filename)) {
            this.scheduleReload(filename)
          }
        })
        
        this.watchers.push(watcher)
        console.log(`[HotReload] Watching: ${watchPath}`)
      } catch (error) {
        console.warn(`[HotReload] Failed to watch ${watchPath}:`, error)
      }
    }
  }

  stop(): void {
    console.log('[HotReload] Stopping file watcher...')
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    for (const watcher of this.watchers) {
      try {
        watcher.close()
      } catch (error) {
        console.warn('[HotReload] Error closing watcher:', error)
      }
    }
    
    this.watchers = []
  }

  private shouldReload(filename: string): boolean {
    // 除外パターンチェック
    for (const pattern of this.options.excludePatterns) {
      if (pattern.test(filename)) {
        return false
      }
    }

    // TypeScript/JavaScriptファイルのみを対象
    return /\.(ts|js|json)$/.test(filename)
  }

  private scheduleReload(filename: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      console.log(`[HotReload] File changed: ${filename}`)
      console.log('[HotReload] Triggering reload...')
      this.reloadCallback()
    }, this.options.debounceMs)
  }

  isEnabled(): boolean {
    return this.options.enabled
  }

  getWatchedPaths(): string[] {
    return this.options.watchPaths
  }
}

export class ProcessManager {
  private static instance: ProcessManager
  private hotReloader: HotReloader
  private restartCallback: (() => void) | null = null

  private constructor() {
    this.hotReloader = new HotReloader(() => this.handleReload())
  }

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager()
    }
    return ProcessManager.instance
  }

  enableHotReload(enabled: boolean, watchPaths?: string[]): void {
    this.hotReloader.stop()
    
    if (enabled) {
      this.hotReloader = new HotReloader(() => this.handleReload(), {
        enabled: true,
        watchPaths: watchPaths || ['src'],
        debounceMs: 500
      })
      this.hotReloader.start()
    }
  }

  setRestartCallback(callback: () => void): void {
    this.restartCallback = callback
  }

  private handleReload(): void {
    if (this.restartCallback) {
      this.restartCallback()
    } else {
      console.log('[HotReload] No restart callback set, exiting process...')
      process.exit(0)
    }
  }

  cleanup(): void {
    this.hotReloader.stop()
  }
}