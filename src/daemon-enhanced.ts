#!/usr/bin/env bun
/**
 * Enhanced Daemon with Reliability Watchdog Integration
 * 
 * This daemon integrates the Reliability Watchdog system to ensure
 * "always display correct information" by preventing stale data display.
 */

import { StatusUpdater } from './tmux/StatusUpdater'
import { ProcessManager } from './utils/HotReloader'
import { ReliabilityManager } from './utils/ReliabilityManager'

const statusUpdater = new StatusUpdater()
const processManager = ProcessManager.getInstance()

// Initialize Reliability Manager with production-ready settings
const reliabilityManager = new ReliabilityManager({
  // Watchdog settings
  daemonCheckIntervalMs: 30000,        // 30 seconds
  maxRestartAttempts: 3,
  restartCooldownMs: 5000,
  
  // Data freshness settings  
  freshThresholdSeconds: 30,           // Fresh within 30 seconds
  staleThresholdSeconds: 300,          // Stale after 5 minutes
  autoInvalidateExpired: true,
  
  // Integrated monitoring
  reliabilityCheckIntervalMs: 15000,   // Check every 15 seconds
  autoRecoveryEnabled: true,
  criticalAlertThreshold: 3
})

// コマンドライン引数の処理
const args = process.argv.slice(2)
const command = args[0]
const intervalArg = args[1]

// 開発モードの判定（明示的な--devフラグのみ。一般ユーザー保護のため）
const isDevelopment = args.includes('--dev')

// Enhanced data update function with reliability management
async function updateWithReliability() {
  try {
    // Get data from existing StatusUpdater
    await statusUpdater.updateOnce()
    
    // Store data safely through ReliabilityManager
    // This will add timestamps and ensure data freshness
    const currentData = {
      'ccusage_enhanced_system': 'active',
      'ccusage_last_enhanced_update': new Date().toISOString()
    }
    
    await reliabilityManager.storeDataSafely(currentData)
    
  } catch (error: any) {
    console.error('[Enhanced Daemon] Update error:', error.message)
    
    // Store error state through reliability manager
    const errorData = {
      'ccusage_enhanced_system': 'error',
      'ccusage_error_message': `Update failed: ${error.message}`,
      'ccusage_warning_color': 'colour1'
    }
    
    await reliabilityManager.storeDataSafely(errorData)
  }
}

async function main() {
  switch (command) {
    case 'once':
    case 'update':
      // Enhanced single update with reliability management
      console.log('Updating tmux variables with reliability management...')
      await updateWithReliability()
      console.log('Enhanced update completed.')
      break
      
    case 'start':
    case 'daemon':
      // Enhanced daemon mode with reliability monitoring
      const interval = intervalArg ? parseInt(intervalArg) : undefined
      
      console.log('🛡️ Starting Enhanced Daemon with Reliability Watchdog...')
      
      if (isDevelopment) {
        console.log('[DEV] Starting in development mode with hot reload...')
        
        // ホットリロードの設定
        processManager.enableHotReload(true, ['src'])
        processManager.setRestartCallback(() => {
          console.log('[DEV] Restarting daemon due to file changes...')
          statusUpdater.stopDaemon()
          reliabilityManager.stopReliabilityMonitoring()
          
          // 少し待ってから再起動
          setTimeout(() => {
            statusUpdater.startDaemon(interval)
            reliabilityManager.startReliabilityMonitoring()
          }, 1000)
        })
      }
      
      // Start traditional daemon
      console.log(`Starting traditional daemon with ${interval || 'default'} interval...`)
      statusUpdater.startDaemon(interval)
      
      // Start reliability monitoring
      console.log('🔍 Starting reliability monitoring system...')
      reliabilityManager.startReliabilityMonitoring()
      
      // Enhanced cleanup function
      const cleanup = () => {
        console.log('🛡️ Stopping Enhanced Daemon...')
        statusUpdater.stopDaemon()
        reliabilityManager.stopReliabilityMonitoring()
        processManager.cleanup()
        
        // Mark system as stopped
        console.log('📝 Marking system as stopped in tmux variables...')
        try {
          // This should be synchronous to ensure it executes before exit
          require('child_process').execSync('tmux set-option -g @ccusage_enhanced_system "stopped"')
          require('child_process').execSync('tmux set-option -g @ccusage_daemon_status "stopped"')
        } catch (error) {
          console.warn('Failed to mark system as stopped:', error)
        }
        
        process.exit(0)
      }
      
      // Process event handlers
      process.on('SIGTERM', cleanup)
      process.on('SIGINT', cleanup)
      process.on('uncaughtException', (error) => {
        console.error('🚨 Uncaught exception in Enhanced Daemon:', error)
        cleanup()
      })
      
      // Store current daemon PID for watchdog monitoring
      const pid = process.pid
      try {
        require('child_process').execSync(`tmux set-option -g @ccusage_daemon_pid "${pid}"`)
        console.log(`📝 Stored daemon PID: ${pid}`)
      } catch (error) {
        console.warn('Failed to store daemon PID:', error)
      }
      
      // Success message
      if (isDevelopment) {
        console.log('🎯 Enhanced Daemon started in development mode. File changes will trigger auto-restart.')
      } else {
        console.log('🎯 Enhanced Daemon started with Reliability Watchdog. Press Ctrl+C to stop.')
      }
      break
      
    case 'stop':
      // Enhanced stop with reliability cleanup
      console.log('🛡️ Stopping Enhanced Daemon with reliability cleanup...')
      
      // Try to mark system as stopped
      try {
        require('child_process').execSync('tmux set-option -g @ccusage_enhanced_system "stopped"')
        require('child_process').execSync('tmux set-option -g @ccusage_daemon_status "stopped"')
        console.log('✅ System marked as stopped.')
      } catch (error) {
        console.warn('⚠️ Failed to mark system as stopped:', error)
      }
      
      console.log('To completely stop the daemon, send SIGTERM or SIGINT to the daemon process.')
      break
      
    case 'status':
      // Enhanced status with reliability report
      console.log('🔍 Getting enhanced system status...')
      
      try {
        // Traditional status
        const status = statusUpdater.getStatus()
        console.log('Traditional Status:', JSON.stringify(status, null, 2))
        
        // Reliability report
        const reliabilityReport = await reliabilityManager.generateSystemReport()
        console.log('\\n🛡️ Reliability Report:')
        console.log('System Reliability:', reliabilityReport.reliability)
        console.log('Daemon Health:', reliabilityReport.daemonHealth.isHealthy ? '✅ Healthy' : '⚠️ Unhealthy')
        console.log('Data Freshness:', reliabilityReport.dataFreshness.freshness)
        console.log('Data Age:', `${reliabilityReport.dataFreshness.age.toFixed(1)}s`)
        
        if (reliabilityReport.criticalIssues.length > 0) {
          console.log('\\n🚨 Critical Issues:')
          reliabilityReport.criticalIssues.forEach(issue => console.log(`  - ${issue}`))
        }
        
        if (reliabilityReport.recommendations.length > 0) {
          console.log('\\n💡 Recommendations:')
          reliabilityReport.recommendations.forEach(rec => console.log(`  - ${rec}`))
        }
        
        // Statistics
        const stats = reliabilityManager.getStatistics()
        console.log('\\n📊 Statistics:')
        console.log('Consecutive Failures:', stats.consecutiveFailures)
        console.log('Last Reliability Check:', stats.lastReliabilityCheck?.toLocaleString() || 'Never')
        console.log('Monitoring Active:', stats.isMonitoring ? '✅ Yes' : '❌ No')
        
      } catch (error: any) {
        console.error('❌ Failed to get enhanced status:', error.message)
      }
      break
      
    case 'recover':
      // Force system recovery
      console.log('🚨 Forcing system recovery...')
      
      try {
        const recoveryReport = await reliabilityManager.forceSystemRecovery()
        console.log('\\n🛡️ Recovery Results:')
        console.log('Final Reliability:', recoveryReport.reliability)
        console.log('Actions Performed:', recoveryReport.autoActionsPerformed.length)
        
        if (recoveryReport.autoActionsPerformed.length > 0) {
          console.log('\\n🔧 Actions Performed:')
          recoveryReport.autoActionsPerformed.forEach(action => console.log(`  - ${action}`))
        }
        
      } catch (error: any) {
        console.error('❌ Force recovery failed:', error.message)
      }
      break
      
    case 'clear':
      // Enhanced clear with reliability cleanup
      console.log('🧹 Clearing all tmux variables with reliability cleanup...')
      statusUpdater.clearAllVariables()
      
      // Clear reliability-specific variables
      try {
        const reliabilityVars = [
          '@ccusage_enhanced_system',
          '@ccusage_daemon_status', 
          '@ccusage_last_update',
          '@ccusage_error_message',
          '@ccusage_warning_color',
          '@ccusage_data_freshness',
          '@ccusage_daemon_pid'
        ]
        
        for (const varName of reliabilityVars) {
          require('child_process').execSync(`tmux set-option -gu ${varName}`)
        }
        
        console.log('✅ Enhanced variables cleared.')
      } catch (error) {
        console.warn('⚠️ Some variables may not have been cleared:', error)
      }
      break
      
    default:
      console.log(`
🛡️ tmux-claude-live Enhanced Daemon with Reliability Watchdog

Usage:
  bun run daemon-enhanced.ts <command> [options]

Commands:
  once, update          Update tmux variables once with reliability management
  start, daemon [ms]    Start enhanced daemon (optionally with custom interval)
  stop                  Stop enhanced daemon with cleanup
  status                Show enhanced system status and reliability report
  recover               Force system recovery and health restoration
  clear                 Clear all tmux variables including reliability data
  
Options:
  --dev                 Enable development mode with hot reload

Enhanced Features:
  🛡️ Automatic data freshness validation
  🔍 Continuous system health monitoring  
  🚨 Automatic recovery from failures
  📊 Comprehensive reliability reporting
  ⚡ Real-time stale data prevention

Example:
  bun run daemon-enhanced.ts start 5000    # Start with 5-second interval
  bun run daemon-enhanced.ts start --dev   # Start in development mode
  bun run daemon-enhanced.ts status        # Get full system report
  bun run daemon-enhanced.ts recover       # Force recovery if needed
`)
      break
  }
}

// Error handling for the main function
main().catch((error) => {
  console.error('🚨 Enhanced Daemon error:', error)
  process.exit(1)
})