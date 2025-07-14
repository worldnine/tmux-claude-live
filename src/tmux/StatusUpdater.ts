import { CcusageClient } from '../core/CcusageClient'
import { DataProcessor } from '../core/DataProcessor'
import { VariableManager } from './VariableManager'
import { ConfigManager } from '../core/ConfigManager'
import { LockManager } from '../utils/LockManager'
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
  hitCount: number
  lastAccessTime: number
}

interface CacheMetrics {
  totalHits: number
  totalMisses: number
  averageComputeTime: number
  dataChangeFrequency: number
  adaptiveTTL: number
}

export class StatusUpdater {
  private ccusageClient: CcusageClient
  private dataProcessor: DataProcessor
  private variableManager: VariableManager
  private configManager: ConfigManager
  private lockManager: LockManager
  
  private intervalId: NodeJS.Timeout | null = null
  private updateCount: number = 0
  private lastUpdateTime: number | null = null
  
  // パフォーマンス最適化: キャッシュとメトリクス
  private cache: CacheEntry | null = null
  private cacheHits: number = 0
  private cacheMisses: number = 0
  private readonly BASE_CACHE_TTL = 30000 // ベースキャッシュTTL
  private adaptiveTTL: number = 30000 // 適応的TTL
  private lastDataHashes: string[] = [] // データ変化パターン追跡
  private computeTimes: number[] = [] // 計算時間の履歴
  
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
    this.lockManager = new LockManager('tmux-claude-live-daemon')
  }

  async updateOnce(): Promise<void> {
    const startTime = Date.now()
    logger.debug('Starting update cycle', { updateCount: this.updateCount + 1 })
    
    try {
      this.updateCount++
      
      const config = await this.loadConfigWithRetry()
      const blockData = await this.getBlockDataWithRetry(config.tokenLimit)
      
      // キャッシュチェック
      const configHash = this.hashConfig(config)
      const dataHash = this.hashBlockData(blockData)
      
      if (this.cache && 
          this.cache.configHash === configHash &&
          this.cache.dataHash === dataHash &&
          (Date.now() - this.cache.timestamp) < this.adaptiveTTL) {
        // キャッシュヒット
        this.cacheHits++
        this.cache.hitCount++
        this.cache.lastAccessTime = Date.now()
        
        logger.debug('Cache hit - using cached variables')
        await this.setBulkVariablesWithRetry(this.cache.variableMap)
        this.lastUpdateTime = Date.now()
        
        const duration = Date.now() - startTime
        logger.debug('Update cycle completed (cached)', { 
          duration, 
          cacheHits: this.cacheHits,
          adaptiveTTL: this.adaptiveTTL 
        })
        return
      }
      
      // キャッシュミス - 新しいデータを処理
      this.cacheMisses++
      logger.debug('Cache miss - processing new data')
      
      const processedData = this.dataProcessor.processBlockData(blockData, config.tokenLimit)
      const variableMap = this.variableManager.generateVariableMap(processedData, config)
      
      // 計算時間を記録
      const computeTime = Date.now() - startTime
      this.recordComputeTime(computeTime)
      
      // データ変化パターンを記録
      this.recordDataChange(dataHash)
      
      // 適応的TTLを更新
      this.updateAdaptiveTTL()
      
      // キャッシュを更新
      this.cache = {
        config,
        processedData,
        variableMap,
        timestamp: Date.now(),
        configHash,
        dataHash,
        hitCount: 0,
        lastAccessTime: Date.now()
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
    
    // ロックを取得（他のプロセスが動いていないかチェック）
    if (!this.lockManager.acquire()) {
      const lockInfo = this.lockManager.getLockInfo()
      throw new Error(`Another daemon is already running (PID: ${lockInfo?.pid})`)
    }
    
    // プロセス終了時の自動クリーンアップを設定
    this.lockManager.setupAutoRelease()
    
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
      nextUpdate: new Date(Date.now() + updateInterval),
      pid: process.pid
    })
    
    return this.intervalId
  }

  stopDaemon(): void {
    if (this.intervalId) {
      logger.info('Stopping daemon')
      clearInterval(this.intervalId)
      this.intervalId = null
      this.lockManager.release()
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
   * BlockDataのスマートハッシュ値を生成
   * 主要データのみを使用し、微細な変化は無視してキャッシュ効率を向上
   */
  private hashBlockData(blockData: any): string {
    if (!blockData) {
      return 'null'
    }
    
    // 重要度の高いデータのみでハッシュ計算
    const coreData = {
      isActive: blockData.isActive,
      // totalTokensを100単位で丸める（小さな変化を無視）
      totalTokens: Math.floor(blockData.totalTokens / 100) * 100,
      // 制限値情報（重要）
      tokenLimit: blockData.tokenLimitStatus?.limit,
      // セッション時間（重要）
      startTime: blockData.startTime,
      endTime: blockData.endTime
    }
    
    // 安定性重視：微細な変化を無視する項目
    // - costUSD: 微細に変化するため除外
    // - burnRate: 計算値なので除外
    // - remainingMinutes: 常に変化するため除外
    // - percentUsed: 計算値なので除外
    
    return JSON.stringify(coreData)
  }
  
  /**
   * より詳細なハッシュ（パフォーマンス重視でない場合）
   */
  private hashBlockDataDetailed(blockData: any): string {
    if (!blockData) {
      return 'null'
    }
    
    const detailedData = {
      isActive: blockData.isActive,
      totalTokens: blockData.totalTokens,
      // 5分単位で丸める
      remainingMinutes: Math.floor((blockData.projection?.remainingMinutes || 0) / 5) * 5,
      tokenLimit: blockData.tokenLimitStatus?.limit,
      startTime: blockData.startTime,
      endTime: blockData.endTime
    }
    
    return JSON.stringify(detailedData)
  }

  /**
   * 計算時間を記録
   */
  private recordComputeTime(computeTime: number): void {
    this.computeTimes.push(computeTime)
    
    // 最新10回分のみ保持
    if (this.computeTimes.length > 10) {
      this.computeTimes.shift()
    }
  }

  /**
   * データ変化パターンを記録
   */
  private recordDataChange(dataHash: string): void {
    this.lastDataHashes.push(dataHash)
    
    // 最新20回分のみ保持
    if (this.lastDataHashes.length > 20) {
      this.lastDataHashes.shift()
    }
  }

  /**
   * 適応的TTLを更新
   */
  private updateAdaptiveTTL(): void {
    // データ変化頻度を計算
    const changeFrequency = this.calculateDataChangeFrequency()
    
    // 平均計算時間を計算
    const avgComputeTime = this.calculateAverageComputeTime()
    
    // キャッシュヒット率を計算
    const hitRate = this.cacheHits / Math.max(1, this.cacheHits + this.cacheMisses)
    
    // 適応的TTL計算
    let newTTL = this.BASE_CACHE_TTL
    
    // データ変化が少ない場合はTTLを延長
    if (changeFrequency < 0.3) {
      newTTL *= 2 // 最大2倍
    } else if (changeFrequency > 0.8) {
      newTTL *= 0.5 // 最小0.5倍
    }
    
    // 計算時間が長い場合はTTLを延長
    if (avgComputeTime > 1000) {
      newTTL *= 1.5
    }
    
    // キャッシュヒット率が低い場合はTTLを短縮
    if (hitRate < 0.2) {
      newTTL *= 0.7
    }
    
    // 最小5秒、最大120秒の範囲に制限
    this.adaptiveTTL = Math.max(5000, Math.min(120000, newTTL))
  }

  /**
   * データ変化頻度を計算（0-1の範囲）
   */
  private calculateDataChangeFrequency(): number {
    if (this.lastDataHashes.length < 2) {
      return 1.0 // 不明な場合は高頻度とみなす
    }
    
    let changes = 0
    for (let i = 1; i < this.lastDataHashes.length; i++) {
      if (this.lastDataHashes[i] !== this.lastDataHashes[i - 1]) {
        changes++
      }
    }
    
    return changes / (this.lastDataHashes.length - 1)
  }

  /**
   * 平均計算時間を計算
   */
  private calculateAverageComputeTime(): number {
    if (this.computeTimes.length === 0) {
      return 0
    }
    
    return this.computeTimes.reduce((sum, time) => sum + time, 0) / this.computeTimes.length
  }

  /**
   * キャッシュメトリクスを取得
   */
  getCacheMetrics(): CacheMetrics {
    return {
      totalHits: this.cacheHits,
      totalMisses: this.cacheMisses,
      averageComputeTime: this.calculateAverageComputeTime(),
      dataChangeFrequency: this.calculateDataChangeFrequency(),
      adaptiveTTL: this.adaptiveTTL
    }
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
  private async getBlockDataWithRetry(tokenLimit?: number | null, maxAttempts: number = 2): Promise<any> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(`Getting block data (attempt ${attempt}/${maxAttempts})`, { tokenLimit })
        const blockData = await this.ccusageClient.getActiveBlock(tokenLimit || undefined)
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