export interface HealthCheckInput {
  startTime: number
  errorCount: number
  totalRequests: number
  currentBurnRate: number
}

export interface HealthCheckResult {
  isHealthy: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  issues: string[]
  metrics: {
    uptimeHours: number
    errorRate: number
    memoryUsageMB: number
  }
}

export class HealthChecker {
  // 閾値の定義
  private readonly BURN_RATE_NORMAL_MAX = 5000
  private readonly BURN_RATE_WARNING_MAX = 10000
  private readonly UPTIME_NORMAL_MAX_HOURS = 48
  private readonly UPTIME_WARNING_MAX_HOURS = 72
  private readonly ERROR_RATE_NORMAL_MAX = 5
  private readonly ERROR_RATE_WARNING_MAX = 10
  private readonly MEMORY_NORMAL_MAX_MB = 50
  private readonly MEMORY_WARNING_MAX_MB = 100

  /**
   * バーンレートの妥当性をチェック
   */
  checkBurnRate(burnRate: number): boolean {
    if (!Number.isFinite(burnRate)) {
      return false
    }
    return burnRate >= 0 && burnRate <= this.BURN_RATE_WARNING_MAX
  }

  /**
   * プロセスの稼働時間をチェック
   */
  checkProcessUptime(startTime: number): boolean {
    if (!Number.isFinite(startTime) || startTime <= 0) {
      return false
    }
    
    const now = Date.now()
    if (startTime > now) {
      return false
    }
    
    const uptimeHours = (now - startTime) / (1000 * 60 * 60)
    return uptimeHours < this.UPTIME_WARNING_MAX_HOURS
  }

  /**
   * エラー率をチェック
   */
  checkErrorRate(errorCount: number, totalRequests: number): boolean {
    if (!Number.isFinite(errorCount) || !Number.isFinite(totalRequests)) {
      return false
    }
    
    if (errorCount < 0 || totalRequests < 0) {
      return false
    }
    
    if (totalRequests === 0) {
      return errorCount === 0
    }
    
    const errorRate = (errorCount / totalRequests) * 100
    return errorRate < this.ERROR_RATE_WARNING_MAX
  }

  /**
   * メモリ使用量をチェック
   */
  checkMemoryUsage(): boolean {
    const memoryUsage = process.memoryUsage()
    const memoryUsageMB = memoryUsage.rss / (1024 * 1024)
    return memoryUsageMB < this.MEMORY_WARNING_MAX_MB
  }

  /**
   * 総合的な健康診断を実行
   */
  performHealthCheck(input: HealthCheckInput): HealthCheckResult {
    const issues: string[] = []
    let isHealthy = true
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    // メトリクスを計算
    const uptimeHours = input.startTime > 0 ? (Date.now() - input.startTime) / (1000 * 60 * 60) : 0
    const errorRate = input.totalRequests > 0 ? (input.errorCount / input.totalRequests) * 100 : 0
    const memoryUsageMB = process.memoryUsage().rss / (1024 * 1024)

    // 1. プロセス開始時刻のチェック
    if (input.startTime <= 0 || !Number.isFinite(input.startTime)) {
      issues.push('Invalid process start time')
      isHealthy = false
      status = 'unhealthy'
    } else {
      // 2. 稼働時間のチェック
      const uptimeStatus = this.getUptimeStatus(uptimeHours)
      if (uptimeStatus === 'degraded') {
        issues.push(`Process uptime exceeds recommended limit (${uptimeHours.toFixed(1)} hours)`)
        isHealthy = false
        status = 'degraded'
      } else if (uptimeStatus === 'unhealthy') {
        issues.push(`Process uptime is critical (${uptimeHours.toFixed(1)} hours)`)
        isHealthy = false
        status = 'unhealthy'
      }
    }

    // 3. エラー率のチェック
    if (!this.checkErrorRate(input.errorCount, input.totalRequests)) {
      if (errorRate >= this.ERROR_RATE_WARNING_MAX) {
        issues.push(`Error rate too high: ${errorRate.toFixed(2)}%`)
        isHealthy = false
        if (status !== 'unhealthy') status = 'degraded'
      }
    }

    // 4. バーンレートのチェック
    const burnRateStatus = this.getBurnRateStatus(input.currentBurnRate)
    if (burnRateStatus === 'degraded') {
      issues.push(`Burn rate is in warning range: ${input.currentBurnRate}`)
      isHealthy = false
      if (status === 'healthy') status = 'degraded'
    } else if (burnRateStatus === 'unhealthy') {
      issues.push(`Burn rate is abnormal: ${input.currentBurnRate}`)
      isHealthy = false
      status = 'unhealthy'
    }

    // 5. メモリ使用量のチェック
    if (!this.checkMemoryUsage()) {
      if (memoryUsageMB >= this.MEMORY_WARNING_MAX_MB) {
        issues.push(`Memory usage too high: ${memoryUsageMB.toFixed(1)}MB`)
        isHealthy = false
        if (status === 'healthy') status = 'degraded'
      }
    }

    return {
      isHealthy,
      status,
      issues,
      metrics: {
        uptimeHours: Number(uptimeHours.toFixed(1)),
        errorRate: Number(errorRate.toFixed(2)),
        memoryUsageMB: Number(memoryUsageMB.toFixed(1))
      }
    }
  }

  /**
   * 稼働時間のステータスを判定
   */
  getUptimeStatus(hours: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (hours < this.UPTIME_NORMAL_MAX_HOURS) {
      return 'healthy'
    } else if (hours < this.UPTIME_WARNING_MAX_HOURS) {
      return 'degraded'
    } else {
      return 'unhealthy'
    }
  }

  /**
   * バーンレートのステータスを判定
   */
  getBurnRateStatus(burnRate: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (!Number.isFinite(burnRate) || burnRate < 0) {
      return 'unhealthy'
    }
    
    if (burnRate < this.BURN_RATE_NORMAL_MAX) {
      return 'healthy'
    } else if (burnRate < this.BURN_RATE_WARNING_MAX) {
      return 'degraded'
    } else {
      return 'unhealthy'
    }
  }
}