import { describe, expect, test, beforeEach } from 'bun:test'
import { HealthChecker } from '../../../src/utils/HealthChecker'

describe('HealthChecker', () => {
  let healthChecker: HealthChecker

  beforeEach(() => {
    healthChecker = new HealthChecker()
  })

  describe('checkBurnRate', () => {
    test('should return true for normal burn rate', () => {
      expect(healthChecker.checkBurnRate(100)).toBe(true)
      expect(healthChecker.checkBurnRate(0)).toBe(true)
      expect(healthChecker.checkBurnRate(4999)).toBe(true)
    })

    test('should return false for abnormal burn rate', () => {
      expect(healthChecker.checkBurnRate(-1)).toBe(false)
      expect(healthChecker.checkBurnRate(10001)).toBe(false)
      expect(healthChecker.checkBurnRate(33537.3)).toBe(false)
    })

    test('should return false for NaN', () => {
      expect(healthChecker.checkBurnRate(NaN)).toBe(false)
    })

    test('should return false for Infinity', () => {
      expect(healthChecker.checkBurnRate(Infinity)).toBe(false)
      expect(healthChecker.checkBurnRate(-Infinity)).toBe(false)
    })
  })

  describe('checkProcessUptime', () => {
    test('should return true for healthy uptime', () => {
      const now = Date.now()
      expect(healthChecker.checkProcessUptime(now)).toBe(true) // 0 hours
      expect(healthChecker.checkProcessUptime(now - 1000 * 60 * 60)).toBe(true) // 1 hour
      expect(healthChecker.checkProcessUptime(now - 1000 * 60 * 60 * 47)).toBe(true) // 47 hours
    })

    test('should return false for unhealthy uptime', () => {
      const now = Date.now()
      expect(healthChecker.checkProcessUptime(now - 1000 * 60 * 60 * 73)).toBe(false) // 73 hours
      expect(healthChecker.checkProcessUptime(now - 1000 * 60 * 60 * 24 * 7)).toBe(false) // 1 week
    })

    test('should handle invalid timestamps', () => {
      expect(healthChecker.checkProcessUptime(0)).toBe(false)
      expect(healthChecker.checkProcessUptime(-1)).toBe(false)
      expect(healthChecker.checkProcessUptime(NaN)).toBe(false)
    })
  })

  describe('checkErrorRate', () => {
    test('should return true for acceptable error rate', () => {
      expect(healthChecker.checkErrorRate(0, 100)).toBe(true) // 0%
      expect(healthChecker.checkErrorRate(2, 100)).toBe(true) // 2%
      expect(healthChecker.checkErrorRate(4, 100)).toBe(true) // 4%
    })

    test('should return false for high error rate', () => {
      expect(healthChecker.checkErrorRate(11, 100)).toBe(false) // 11%
      expect(healthChecker.checkErrorRate(50, 100)).toBe(false) // 50%
      expect(healthChecker.checkErrorRate(100, 100)).toBe(false) // 100%
    })

    test('should handle edge cases', () => {
      expect(healthChecker.checkErrorRate(0, 0)).toBe(true) // No requests
      expect(healthChecker.checkErrorRate(1, 0)).toBe(false) // Division by zero
      expect(healthChecker.checkErrorRate(-1, 100)).toBe(false) // Negative errors
      expect(healthChecker.checkErrorRate(10, -100)).toBe(false) // Negative total
    })
  })

  describe('checkMemoryUsage', () => {
    test('should return true for normal memory usage', () => {
      const originalMemoryUsage = process.memoryUsage
      process.memoryUsage = () => ({
        rss: 30 * 1024 * 1024, // 30MB
        heapTotal: 20 * 1024 * 1024,
        heapUsed: 15 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0
      })

      expect(healthChecker.checkMemoryUsage()).toBe(true)

      process.memoryUsage = originalMemoryUsage
    })

    test('should return false for high memory usage', () => {
      const originalMemoryUsage = process.memoryUsage
      process.memoryUsage = () => ({
        rss: 120 * 1024 * 1024, // 120MB
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 90 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0
      })

      expect(healthChecker.checkMemoryUsage()).toBe(false)

      process.memoryUsage = originalMemoryUsage
    })
  })

  describe('performHealthCheck', () => {
    test('should return healthy status when all checks pass', () => {
      const result = healthChecker.performHealthCheck({
        startTime: Date.now() - 1000 * 60 * 60, // 1 hour ago
        errorCount: 2,
        totalRequests: 100,
        currentBurnRate: 150
      })

      expect(result.isHealthy).toBe(true)
      expect(result.status).toBe('healthy')
      expect(result.issues).toHaveLength(0)
      expect(result.metrics.uptimeHours).toBeCloseTo(1, 1)
      expect(result.metrics.errorRate).toBe(2)
    })

    test('should return degraded status for warning conditions', () => {
      const result = healthChecker.performHealthCheck({
        startTime: Date.now() - 1000 * 60 * 60 * 50, // 50 hours ago
        errorCount: 7,
        totalRequests: 100,
        currentBurnRate: 6000 // Warning range
      })

      expect(result.isHealthy).toBe(false)
      expect(result.status).toBe('degraded')
      expect(result.issues).toContain('Process uptime exceeds recommended limit (50.0 hours)')
      expect(result.issues).toContain('Burn rate is in warning range: 6000')
    })

    test('should return unhealthy status for critical conditions', () => {
      const result = healthChecker.performHealthCheck({
        startTime: Date.now() - 1000 * 60 * 60 * 75, // 75 hours ago
        errorCount: 15,
        totalRequests: 100,
        currentBurnRate: 33537.3 // The actual error value we saw
      })

      expect(result.isHealthy).toBe(false)
      expect(result.status).toBe('unhealthy')
      expect(result.issues).toContain('Process uptime is critical (75.0 hours)')
      expect(result.issues).toContain('Error rate too high: 15.00%')
      expect(result.issues).toContain('Burn rate is abnormal: 33537.3')
    })

    test('should handle missing data gracefully', () => {
      const result = healthChecker.performHealthCheck({
        startTime: 0,
        errorCount: 0,
        totalRequests: 0,
        currentBurnRate: 0
      })

      expect(result.isHealthy).toBe(false)
      expect(result.status).toBe('unhealthy')
      expect(result.issues).toContain('Invalid process start time')
    })
  })

  describe('getUptimeStatus', () => {
    test('should categorize uptime correctly', () => {
      expect(healthChecker.getUptimeStatus(10)).toBe('healthy')
      expect(healthChecker.getUptimeStatus(47)).toBe('healthy')
      expect(healthChecker.getUptimeStatus(50)).toBe('degraded')
      expect(healthChecker.getUptimeStatus(71)).toBe('degraded')
      expect(healthChecker.getUptimeStatus(73)).toBe('unhealthy')
      expect(healthChecker.getUptimeStatus(100)).toBe('unhealthy')
    })
  })

  describe('getBurnRateStatus', () => {
    test('should categorize burn rate correctly', () => {
      expect(healthChecker.getBurnRateStatus(100)).toBe('healthy')
      expect(healthChecker.getBurnRateStatus(4999)).toBe('healthy')
      expect(healthChecker.getBurnRateStatus(5000)).toBe('degraded')
      expect(healthChecker.getBurnRateStatus(9999)).toBe('degraded')
      expect(healthChecker.getBurnRateStatus(10000)).toBe('unhealthy')
      expect(healthChecker.getBurnRateStatus(33537.3)).toBe('unhealthy')
    })
  })
})