import { CcusageClient } from '../core/CcusageClient'
import { DataProcessor } from '../core/DataProcessor'
import { VariableManager } from './VariableManager'
import { ConfigManager } from '../core/ConfigManager'
import { logger } from '../utils/Logger'
import { errorHandler } from '../utils/ErrorHandler'
import type { ProcessedData } from '../core/DataProcessor'
import type { Config } from '../core/ConfigManager'

export interface StatusInfo {
  isRunning: boolean
  updateCount: number
  lastUpdateTime: number | null
  interval: number
  nextUpdateTime?: number
  cacheHits: number
  cacheMisses: number
  errorCount: number
  lastErrorTime: number | null
  recoveryCount: number
}

interface CacheEntry {
  config: Config
  processedData: ProcessedData
  variableMap: Record<string, string>
  timestamp: number
  configHash: string
  dataHash: string
}

export class StatusUpdater {
  private ccusageClient: CcusageClient
  private dataProcessor: DataProcessor
  private variableManager: VariableManager
  private configManager: ConfigManager
  
  private intervalId: NodeJS.Timeout | null = null
  private updateCount: number = 0
  private lastUpdateTime: number | null = null
  
  // パフォーマンス最適化: キャッシュとメトリクス
  private cache: CacheEntry | null = null
  private cacheHits: number = 0
  private cacheMisses: number = 0
  private readonly CACHE_TTL = 30000 // 30秒間キャッシュを保持
  
  // エラーハンドリング: エラー統計とリトライ
  private errorCount: number = 0
  private lastErrorTime: number | null = null
  private recoveryCount: number = 0

  constructor(
    ccusageClient?: CcusageClient,
    dataProcessor?: DataProcessor,
    configManager?: ConfigManager,
    variableManager?: VariableManager
  ) {
    this.ccusageClient = ccusageClient || new CcusageClient()
    this.dataProcessor = dataProcessor || new DataProcessor()
    this.variableManager = variableManager || new VariableManager()
    this.configManager = configManager || new ConfigManager()
  }

  async updateOnce(): Promise<void> {
    const startTime = Date.now()
    logger.debug('Starting update cycle', { updateCount: this.updateCount + 1 })
    
    try {
      this.updateCount++
      
      const config = await this.loadConfigWithRetry()
      const blockData = await this.getBlockDataWithRetry()
      
      // キャッシュチェック
      const configHash = this.hashConfig(config)
      const dataHash = this.hashBlockData(blockData)
      
      if (this.cache && 
          this.cache.configHash === configHash &&
          this.cache.dataHash === dataHash &&
          (Date.now() - this.cache.timestamp) < this.CACHE_TTL) {
        // キャッシュヒット
        this.cacheHits++
        logger.debug('Cache hit - using cached variables')
        await this.setBulkVariablesWithRetry(this.cache.variableMap)
        this.lastUpdateTime = Date.now()
        
        const duration = Date.now() - startTime
        logger.debug('Update cycle completed (cached)', { duration, cacheHits: this.cacheHits })
        return
      }
      
      // キャッシュミス - 新しいデータを処理
      this.cacheMisses++
      logger.debug('Cache miss - processing new data')
      
      const processedData = this.dataProcessor.processBlockData(blockData, config.tokenLimit)
      const variableMap = this.variableManager.generateVariableMap(processedData, config)
      
      // キャッシュを更新
      this.cache = {
        config,
        processedData,
        variableMap,
        timestamp: Date.now(),
        configHash,
        dataHash
      }
      
      await this.setBulkVariablesWithRetry(variableMap)
      this.lastUpdateTime = Date.now()
      
      const duration = Date.now() - startTime
      logger.info('Update cycle completed', { 
        duration, 
        totalVariables: Object.keys(variableMap).length,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses
      })
      
    } catch (error) {
      this.errorCount++
      this.lastErrorTime = Date.now()
      
      const duration = Date.now() - startTime
      logger.error('Update cycle failed', error, { 
        duration, 
        updateCount: this.updateCount,
        errorCount: this.errorCount
      })
      
      // エラーハンドリングを実行
      const recovered = await errorHandler.handleError(error, {
        command: 'updateOnce',
        attemptCount: 1
      })
      
      if (recovered) {
        this.recoveryCount++
        logger.info('Error recovery successful', { recoveryCount: this.recoveryCount })
      }
      
      // エラーでも統計は更新
      this.lastUpdateTime = Date.now()
    }
  }

  async updateAll(): Promise<void> {
    // updateOnce()のエイリアス
    await this.updateOnce()
  }

  startDaemon(interval?: number): NodeJS.Timeout {
    logger.info('Starting daemon', { interval })
    
    // 既存のデーモンを停止
    this.stopDaemon()
    
    // 間隔の決定
    const config = this.configManager.loadConfig()
    const updateInterval = interval || config.updateInterval * 1000
    
    // 初回実行
    this.updateOnce()
    
    // 定期実行の設定
    this.intervalId = setInterval(() => {
      this.updateOnce()
    }, updateInterval)
    
    logger.info('Daemon started successfully', { 
      interval: updateInterval,
      nextUpdate: new Date(Date.now() + updateInterval)
    })
    
    return this.intervalId
  }

  stopDaemon(): void {
    if (this.intervalId) {
      logger.info('Stopping daemon')
      clearInterval(this.intervalId)
      this.intervalId = null
      logger.info('Daemon stopped successfully')
    }
  }

  isDaemonRunning(): boolean {
    return this.intervalId !== null
  }

  clearAllVariables(): void {
    logger.info('Clearing all variables')
    this.variableManager.clearAllVariables()
    // キャッシュもクリア
    this.cache = null
    logger.info('All variables cleared')
  }

  getStatus(): StatusInfo {
    const config = this.configManager.loadConfig()
    const interval = config.updateInterval * 1000
    
    const status: StatusInfo = {
      isRunning: this.isDaemonRunning(),
      updateCount: this.updateCount,
      lastUpdateTime: this.lastUpdateTime,
      interval: interval,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      errorCount: this.errorCount,
      lastErrorTime: this.lastErrorTime,
      recoveryCount: this.recoveryCount
    }

    if (this.isDaemonRunning() && this.lastUpdateTime) {
      status.nextUpdateTime = this.lastUpdateTime + interval
    }

    return status
  }

  getLastUpdateTime(): number | null {
    return this.lastUpdateTime
  }

  getUpdateCount(): number {
    return this.updateCount
  }

  /**
   * 設定オブジェクトのハッシュ値を生成
   * 設定の変更を検出してキャッシュを無効化するために使用
   */
  private hashConfig(config: Config): string {
    const configData = {
      tokenLimit: config.tokenLimit,
      updateInterval: config.updateInterval,
      warningThresholds: config.warningThresholds,
      displayFormats: config.displayFormats
    }
    return JSON.stringify(configData)
  }

  /**
   * BlockDataのハッシュ値を生成
   * ccusageデータの変更を検出してキャッシュを無効化するために使用
   */
  private hashBlockData(blockData: any): string {
    if (!blockData) {
      return 'null'
    }
    
    const relevantData = {
      isActive: blockData.isActive,
      totalTokens: blockData.totalTokens,
      costUSD: blockData.costUSD,
      remainingMinutes: blockData.projection?.remainingMinutes,
      tokensPerMinute: blockData.burnRate?.tokensPerMinute,
      startTime: blockData.startTime,
      endTime: blockData.endTime
    }
    
    return JSON.stringify(relevantData)
  }

  /**
   * リトライ機能付きconfig読み込み
   */
  private async loadConfigWithRetry(maxAttempts: number = 3): Promise<any> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(`Loading config (attempt ${attempt}/${maxAttempts})`)
        const config = this.configManager.loadConfig()
        logger.debug('Config loaded successfully')
        return config
      } catch (error) {
        lastError = error
        logger.warn(`Config load failed (attempt ${attempt}/${maxAttempts})`, error)
        
        if (attempt < maxAttempts) {
          await this.sleep(1000 * attempt) // 指数バックオフ
        }
      }
    }
    
    // 最終的に失敗した場合、エラーハンドリングを実行
    if (lastError) {
      const recovered = await errorHandler.handleError(lastError, {
        command: 'loadConfig',
        attemptCount: maxAttempts
      })
      
      if (recovered) {
        this.recoveryCount++
        // デフォルト設定を返す
        return {
          updateInterval: 5,
          tokenLimit: 140000,
          warningThresholds: { usage: [70, 90], time: [60, 30] },
          displayFormats: { time: 'compact', cost: 'currency', token: 'compact' }
        }
      }
    }
    
    throw lastError || new Error('Config loading failed after all attempts')
  }

  /**
   * リトライ機能付きccusageデータ取得
   */
  private async getBlockDataWithRetry(maxAttempts: number = 2): Promise<any> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(`Getting block data (attempt ${attempt}/${maxAttempts})`)
        const blockData = await this.ccusageClient.getActiveBlock()
        logger.debug('Block data retrieved successfully', { isActive: blockData?.isActive })
        return blockData
      } catch (error) {
        lastError = error
        logger.warn(`Block data retrieval failed (attempt ${attempt}/${maxAttempts})`, error)
        
        if (attempt < maxAttempts) {
          await this.sleep(2000 * attempt) // 指数バックオフ
        }
      }
    }
    
    // 最終的に失敗した場合、エラーハンドリングを実行
    if (lastError) {
      const recovered = await errorHandler.handleError(lastError, {
        command: 'getActiveBlock',
        attemptCount: maxAttempts
      })
      
      if (recovered) {
        this.recoveryCount++
        // デフォルトデータを返す
        return null
      }
    }
    
    throw lastError || new Error('Block data retrieval failed after all attempts')
  }

  /**
   * リトライ機能付きtmux変数設定
   */
  private async setBulkVariablesWithRetry(variableMap: Record<string, string>, maxAttempts: number = 2): Promise<void> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(`Setting bulk variables (attempt ${attempt}/${maxAttempts})`, { 
          variableCount: Object.keys(variableMap).length 
        })
        this.variableManager.setBulkVariables(variableMap)
        logger.debug('Variables set successfully')
        return
      } catch (error) {
        lastError = error
        logger.warn(`Variable setting failed (attempt ${attempt}/${maxAttempts})`, error)
        
        if (attempt < maxAttempts) {
          await this.sleep(500 * attempt) // 短いバックオフ
        }
      }
    }
    
    // 最終的に失敗した場合、エラーハンドリングを実行
    if (lastError) {
      const recovered = await errorHandler.handleError(lastError, {
        command: 'setBulkVariables',
        attemptCount: maxAttempts
      })
      
      if (recovered) {
        this.recoveryCount++
        return
      }
    }
    
    throw lastError || new Error('Variable setting failed after all attempts')
  }

  /**
   * sleep用のユーティリティメソッド
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}