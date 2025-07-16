#!/usr/bin/env bun
import { StatusUpdater } from './tmux/StatusUpdater'
import { ProcessManager } from './utils/HotReloader'

const statusUpdater = new StatusUpdater()
const processManager = ProcessManager.getInstance()

// コマンドライン引数の処理
const args = process.argv.slice(2)
const command = args[0]
const intervalArg = args[1]

// 開発モードの判定（明示的な--devフラグのみ。一般ユーザー保護のため）
const isDevelopment = args.includes('--dev')

async function main() {
  switch (command) {
    case 'once':
    case 'update':
      // 一回限りの更新
      console.log('Updating tmux variables once...')
      await statusUpdater.updateOnce()
      console.log('Update completed.')
      break
      
    case 'start':
    case 'daemon':
      // デーモンとして開始
      const interval = intervalArg ? parseInt(intervalArg) : undefined
      
      if (isDevelopment) {
        console.log('[DEV] Starting in development mode with hot reload...')
        
        // ホットリロードの設定
        processManager.enableHotReload(true, ['src'])
        processManager.setRestartCallback(() => {
          console.log('[DEV] Restarting daemon due to file changes...')
          statusUpdater.stopDaemon()
          
          // 少し待ってから再起動
          setTimeout(() => {
            statusUpdater.startDaemon(interval)
          }, 1000)
        })
      }
      
      console.log(`Starting daemon with ${interval || 'default'} interval...`)
      statusUpdater.startDaemon(interval)
      
      // プロセスの終了時にデーモンを停止
      const cleanup = () => {
        console.log('Stopping daemon...')
        statusUpdater.stopDaemon()
        processManager.cleanup()
        process.exit(0)
      }
      
      process.on('SIGTERM', cleanup)
      process.on('SIGINT', cleanup)
      process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error)
        cleanup()
      })
      
      // デーモンを継続実行
      if (isDevelopment) {
        console.log('Daemon started in development mode. File changes will trigger auto-restart.')
      } else {
        console.log('Daemon started. Press Ctrl+C to stop.')
      }
      break
      
    case 'stop':
      // デーモンを停止（実際にはこのプロセスでは他のプロセスを停止できないため、メッセージのみ）
      console.log('To stop the daemon, send SIGTERM or SIGINT to the daemon process.')
      break
      
    case 'status':
      // 状態確認
      const status = statusUpdater.getStatus()
      console.log('Status:', JSON.stringify(status, null, 2))
      break
      
    case 'clear':
      // 変数をクリア
      console.log('Clearing all tmux variables...')
      statusUpdater.clearAllVariables()
      console.log('Variables cleared.')
      break
      
    default:
      console.log(`
tmux-claude-live daemon

Usage:
  bun run daemon.ts <command> [options]

Commands:
  once, update          Update tmux variables once
  start, daemon [ms]    Start daemon with optional interval in milliseconds
  stop                  Stop daemon (manual process termination required)
  status                Show current status
  clear                 Clear all tmux variables

Examples:
  bun run daemon.ts once
  bun run daemon.ts start 5000
  bun run daemon.ts status
  bun run daemon.ts clear
`)
      process.exit(1)
  }
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})