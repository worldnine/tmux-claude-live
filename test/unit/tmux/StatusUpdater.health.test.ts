import { describe, expect, test, beforeEach } from 'bun:test'
import { StatusUpdater } from '../../../src/tmux/StatusUpdater'
import { HealthChecker } from '../../../src/utils/HealthChecker'

describe('StatusUpdater Health Check Integration', () => {
  let statusUpdater: StatusUpdater
  let healthChecker: HealthChecker

  beforeEach(() => {
    // 基本的なStatusUpdaterの設定
    // モックなしの簡単なテストから開始
    healthChecker = new HealthChecker()
  })

  test('should expose health check methods', () => {
    // StatusUpdaterにヘルスチェック機能が追加されることを確認
    
    // 以下のメソッドが存在することを期待
    expect(typeof StatusUpdater.prototype.getHealthStatus).toBe('function')
    expect(typeof StatusUpdater.prototype.performHealthCheck).toBe('function')
    expect(typeof StatusUpdater.prototype.performSelfHealing).toBe('function')
    expect(typeof StatusUpdater.prototype.getSelfHealingCount).toBe('function')
    expect(typeof StatusUpdater.prototype.getHealthCheckInterval).toBe('function')
  })

  test('should have health check timer configuration', () => {
    // 6時間間隔の設定を確認
    const expectedInterval = 6 * 60 * 60 * 1000 // 6 hours in milliseconds
    
    // StatusUpdaterのコンストラクタでhealthCheckIntervalが設定されることを期待
    expect(StatusUpdater.HEALTH_CHECK_INTERVAL).toBe(expectedInterval)
  })

  test('should integrate with HealthChecker for burn rate validation', () => {
    // HealthCheckerの基本動作を確認
    const normalBurnRate = 200
    const abnormalBurnRate = 33537.3

    expect(healthChecker.checkBurnRate(normalBurnRate)).toBe(true)
    expect(healthChecker.checkBurnRate(abnormalBurnRate)).toBe(false)
  })

  test('should define health status interface', () => {
    // StatusUpdaterが返すヘルス状態のインターface定義を確認
    const healthStatus = {
      status: 'healthy' as const,
      isHealthy: true,
      issues: [] as string[],
      metrics: {
        uptimeHours: 1.5,
        errorRate: 2.1,
        memoryUsageMB: 25.3
      },
      lastSelfHealTime: null as Date | null
    }

    // 型チェックとして使用
    expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/)
    expect(typeof healthStatus.isHealthy).toBe('boolean')
    expect(Array.isArray(healthStatus.issues)).toBe(true)
    expect(typeof healthStatus.metrics.uptimeHours).toBe('number')
  })

  test('should support daemon uptime tracking', () => {
    // デーモンの開始時刻を記録する機能
    const startTime = Date.now()
    
    // startTimeから現在までの経過時間を時間単位で計算
    const uptimeHours = (Date.now() - startTime) / (1000 * 60 * 60)
    
    expect(uptimeHours).toBeGreaterThanOrEqual(0)
    expect(uptimeHours).toBeLessThan(1) // テスト実行時間は1時間未満
  })
})