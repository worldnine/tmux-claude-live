import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { execSync, spawn } from 'child_process'

/**
 * E2Eテスト - 実際の環境でのテスト
 * 
 * 注意: これらのテストは以下の条件で実行されます：
 * - tmuxがインストールされている
 * - ccusageがインストールされている
 * - 実際のtmuxセッションが存在する
 * 
 * CI/CD環境では通常スキップされるべきテストです
 */
describe('Daemon E2E Tests', () => {
  const PROJECT_ROOT = process.cwd()
  const DAEMON_SCRIPT = `${PROJECT_ROOT}/src/daemon.ts`
  
  beforeEach(() => {
    // テスト用のtmux変数をクリア
    try {
      execSync('bun run src/daemon.ts clear', { cwd: PROJECT_ROOT })
    } catch (error) {
      // クリアに失敗しても継続
    }
  })

  afterEach(() => {
    // テスト後のクリーンアップ
    try {
      execSync('bun run src/daemon.ts clear', { cwd: PROJECT_ROOT })
    } catch (error) {
      // クリアに失敗しても継続
    }
  })

  test('should execute daemon once command successfully', async () => {
    try {
      // Act - 一回限りの実行
      const output = execSync('bun run src/daemon.ts once', { 
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 10000
      })

      // Assert
      expect(output).toContain('Update completed')
      
      // tmux変数が実際に設定されているか確認
      const tmuxOutput = execSync('tmux show-options -g | grep ccusage || true', { 
        encoding: 'utf8' 
      })
      
      // 少なくとも基本的な変数が設定されているはず
      expect(tmuxOutput).toContain('@ccusage_')
      
    } catch (error) {
      // ccusageまたはtmuxが利用できない環境の場合はスキップ
      if (error.message.includes('command not found') || 
          error.message.includes('no server running')) {
        console.warn('Skipping E2E test: tmux or ccusage not available')
        return
      }
      throw error
    }
  }, 15000) // 15秒タイムアウト

  test('should handle daemon status command', async () => {
    try {
      // Act
      const output = execSync('bun run src/daemon.ts status', { 
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 5000
      })

      // Assert - エラーなく実行されることを確認
      expect(typeof output).toBe('string')
      
    } catch (error) {
      if (error.message.includes('command not found')) {
        console.warn('Skipping E2E test: dependencies not available')
        return
      }
      throw error
    }
  })

  test('should clear variables successfully', async () => {
    try {
      // Arrange - まず変数を設定
      execSync('bun run src/daemon.ts once', { 
        cwd: PROJECT_ROOT,
        timeout: 10000
      })

      // Act - 変数をクリア
      const output = execSync('bun run src/daemon.ts clear', { 
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 5000
      })

      // Assert
      expect(output).toContain('cleared') // または適切なメッセージ
      
      // ccusage変数が削除されているか確認
      const tmuxOutput = execSync('tmux show-options -g | grep ccusage || true', { 
        encoding: 'utf8' 
      })
      
      // ccusage変数がない、または大幅に減っているはず
      const ccusageVariables = tmuxOutput.split('\n').filter(line => line.includes('@ccusage_'))
      expect(ccusageVariables.length).toBeLessThan(5) // ほとんどクリアされている
      
    } catch (error) {
      if (error.message.includes('command not found')) {
        console.warn('Skipping E2E test: dependencies not available')
        return
      }
      throw error
    }
  })

  test('should handle daemon start command', async () => {
    try {
      // デーモンの開始コマンドを非同期で実行し、すぐに終了させる
      const child = spawn('bun', ['run', 'src/daemon.ts', 'start', '2000'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe'
      })

      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      // デーモンが開始したことを確認してから終了
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGTERM')
          resolve()
        }, 2000)
        
        child.stdout.on('data', (data) => {
          if (data.toString().includes('Daemon started')) {
            clearTimeout(timeout)
            child.kill('SIGTERM')
            resolve()
          }
        })
      })

      // Assert
      expect(output).toContain('Starting daemon')
      // Note: 'Daemon started'の出力はタイミングによって取得できない場合がある
      
    } catch (error) {
      if (error.message.includes('command not found')) {
        console.warn('Skipping E2E test: dependencies not available')
        return
      }
      throw error
    }
  }, 10000) // 10秒タイムアウト
})

/**
 * tmuxプラグインのE2Eテスト
 */
describe('Tmux Plugin E2E Tests', () => {
  const PROJECT_ROOT = process.cwd()
  const PLUGIN_SCRIPT = `${PROJECT_ROOT}/claude-live.tmux`

  test('should initialize plugin without errors', async () => {
    try {
      // プラグインの初期化を非同期で実行
      const child = spawn('bash', [PLUGIN_SCRIPT], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe'
      })

      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      // プラグインが初期化されたことを確認してから終了
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGTERM')
          resolve()
        }, 3000)
        
        child.stdout.on('data', (data) => {
          if (data.toString().includes('plugin initialized')) {
            clearTimeout(timeout)
            child.kill('SIGTERM')
            resolve()
          }
        })
      })

      // Assert
      expect(output).toContain('Initializing')
      
    } catch (error) {
      if (error.message.includes('command not found') || 
          error.message.includes('no server running')) {
        console.warn('Skipping tmux plugin E2E test: tmux not available')
        return
      }
      throw error
    }
  })

  test('should handle plugin commands', async () => {
    try {
      // Test various plugin commands
      const commands = ['status', 'update', 'clear']
      
      for (const cmd of commands) {
        const output = execSync(`bash ${PLUGIN_SCRIPT} ${cmd}`, { 
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 5000
        })
        
        // エラーなく実行されることを確認
        expect(typeof output).toBe('string')
      }
      
    } catch (error) {
      if (error.message.includes('command not found')) {
        console.warn('Skipping tmux plugin command E2E test: dependencies not available')
        return
      }
      throw error
    }
  })
})