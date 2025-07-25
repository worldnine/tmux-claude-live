import { describe, expect, test, beforeEach } from 'bun:test'
import { VariableManager } from '../../../src/tmux/VariableManager'
import type { HealthStatus } from '../../../src/tmux/VariableManager'

describe('VariableManager Health Variables', () => {
  let variableManager: VariableManager

  beforeEach(() => {
    variableManager = new VariableManager()
  })

  test('should generate health variables correctly', () => {
    // Arrange
    const healthStatus: HealthStatus = {
      status: 'healthy',
      isHealthy: true,
      issues: [],
      metrics: {
        uptimeHours: 2.5,
        errorRate: 1.2,
        memoryUsageMB: 25.7
      },
      lastSelfHealTime: null
    }

    // Act
    const variables = variableManager.generateHealthVariables(healthStatus)

    // Assert
    expect(variables['daemon_health']).toBe('healthy')
    expect(variables['daemon_health_is_healthy']).toBe('true')
    expect(variables['daemon_uptime']).toBe('2h30m')
    expect(variables['daemon_uptime_hours']).toBe('2.5')
    expect(variables['error_rate']).toBe('1.2%')
    expect(variables['memory_usage']).toBe('25.7MB')
    expect(variables['last_self_heal']).toBe('Never')
    expect(variables['health_issues']).toBe('None')
  })

  test('should format self-heal time correctly', () => {
    // Arrange
    const healTime = new Date('2025-07-25T10:30:00Z')
    const healthStatus: HealthStatus = {
      status: 'degraded',
      isHealthy: false,
      issues: ['Process uptime exceeds recommended limit (50.0 hours)'],
      metrics: {
        uptimeHours: 50.0,
        errorRate: 3.5,
        memoryUsageMB: 45.2
      },
      lastSelfHealTime: healTime
    }

    // Act
    const variables = variableManager.generateHealthVariables(healthStatus)

    // Assert
    expect(variables['daemon_health']).toBe('degraded')
    expect(variables['daemon_health_is_healthy']).toBe('false')
    expect(variables['last_self_heal']).toBe('2025-07-25 10:30:00')
    expect(variables['health_issues']).toBe('Process uptime exceeds recommended limit (50.0 hours)')
  })

  test('should handle multiple issues correctly', () => {
    // Arrange
    const healthStatus: HealthStatus = {
      status: 'unhealthy',
      isHealthy: false,
      issues: [
        'Burn rate is abnormal: 33537.3',
        'Error rate too high: 15.00%',
        'Memory usage too high: 120.5MB',
        'Additional issue that should be truncated'
      ],
      metrics: {
        uptimeHours: 75.0,
        errorRate: 15.0,
        memoryUsageMB: 120.5
      },
      lastSelfHealTime: new Date()
    }

    // Act
    const variables = variableManager.generateHealthVariables(healthStatus)

    // Assert
    expect(variables['daemon_health']).toBe('unhealthy')
    expect(variables['health_issues']).toBe('Burn rate is abnormal: 33537.3; Error rate too high: 15.00%; Memory usage too high: 120.5MB')
  })

  test('should integrate health variables with regular variables', () => {
    // Arrange
    const processedData = {
      isActive: true,
      totalTokens: 25000,
      costUSD: 3.75,
      remainingMinutes: 120,
      remainingSeconds: 7200,
      sessionRemainingMinutes: 100,
      sessionRemainingSeconds: 6000,
      usagePercent: 17.86,
      tokensRemaining: 115000,
      blockProgress: 40,
      burnRate: 208.3,
      costPerHour: 1.87,
      warningLevel: 'normal' as const
    }

    const config = {
      tokenLimit: 140000,
      displayFormats: {
        time: 'compact' as const,
        cost: 'currency' as const,
        token: 'compact' as const
      }
    }

    const healthStatus: HealthStatus = {
      status: 'healthy',
      isHealthy: true,
      issues: [],
      metrics: {
        uptimeHours: 1.5,
        errorRate: 0.5,
        memoryUsageMB: 18.3
      },
      lastSelfHealTime: null
    }

    // Act
    const variables = variableManager.generateVariableMapWithHealth(processedData, config, healthStatus)

    // Assert - 通常の変数
    expect(variables['total_tokens']).toBe('25000')
    expect(variables['usage_percent']).toBe('17.86%')
    expect(variables['burn_rate']).toBe('208.3')
    
    // Assert - ヘルス変数
    expect(variables['daemon_health']).toBe('healthy')
    expect(variables['daemon_uptime']).toBe('1h30m')
    expect(variables['error_rate']).toBe('0.5%')
    expect(variables['memory_usage']).toBe('18.3MB')
  })
})