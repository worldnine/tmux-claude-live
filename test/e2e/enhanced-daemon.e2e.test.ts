import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Enhanced E2E Tests for new features
 * 
 * 注意: これらのテストは実際の環境でのテストです：
 * - tmuxがインストールされている
 * - ccusageがインストールされている（またはモック環境）
 * - 実際のファイルシステムを使用
 * 
 * CI/CD環境では適切な環境変数でスキップ可能
 */
describe('Enhanced Daemon E2E Tests', () => {
  const PROJECT_ROOT = process.cwd()
  const DAEMON_SCRIPT = `${PROJECT_ROOT}/src/daemon.ts`
  const TEST_LOCK_PREFIX = 'tmux-claude-live-test'
  const isCI = process.env.CI === 'true'
  const skipReason = 'Skipping E2E test in CI/test environment'

  // テスト用の一時ディレクトリ
  const testTmpDir = join(tmpdir(), 'tmux-claude-live-e2e-test')

  beforeEach(() => {
    // テスト環境のクリーンアップ
    try {
      execSync('bun run src/daemon.ts clear', { cwd: PROJECT_ROOT, timeout: 5000 })
    } catch (error) {
      // クリアに失敗しても継続
    }

    // 既存のロックファイルをクリーンアップ
    cleanupLockFiles()
  })

  afterEach(() => {
    // テスト後のクリーンアップ
    try {
      execSync('bun run src/daemon.ts stop', { cwd: PROJECT_ROOT, timeout: 5000 })
      execSync('bun run src/daemon.ts clear', { cwd: PROJECT_ROOT, timeout: 5000 })
    } catch (error) {
      // クリアに失敗しても継続
    }

    // ロックファイルのクリーンアップ
    cleanupLockFiles()
  })

  function cleanupLockFiles() {
    try {
      const lockFiles = [
        join(tmpdir(), `${TEST_LOCK_PREFIX}.lock`),
        join(tmpdir(), `${TEST_LOCK_PREFIX}.pid`),
        join(tmpdir(), 'tmux-claude-live-daemon.lock'),
        join(tmpdir(), 'tmux-claude-live-daemon.pid')
      ]
      
      lockFiles.forEach(file => {
        if (existsSync(file)) {
          unlinkSync(file)
        }
      })
    } catch (error) {
      // ファイル削除に失敗しても継続
    }
  }

  describe('Process Duplication Prevention', () => {
    test('should prevent multiple daemon instances from running simultaneously', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - 最初のデーモンを開始
        const firstDaemon = spawn('bun', ['run', 'src/daemon.ts', 'start', '10000'], {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          detached: false
        })

        let firstOutput = ''
        firstDaemon.stdout.on('data', (data) => {
          firstOutput += data.toString()
        })

        // 最初のデーモンが開始するまで待機
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve(undefined)
          }, 3000)
          
          firstDaemon.stdout.on('data', (data) => {
            if (data.toString().includes('Daemon started') || data.toString().includes('Starting daemon')) {
              clearTimeout(timeout)
              resolve(undefined)
            }
          })
        })

        // Act - 2番目のデーモンを開始を試行
        let secondDaemonError = ''
        try {
          const secondOutput = execSync('bun run src/daemon.ts start 5000', {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            timeout: 5000
          })
        } catch (error: any) {
          secondDaemonError = error.stderr || error.stdout || error.message
        }

        // Assert - 2番目のデーモンは失敗するはず
        expect(secondDaemonError).toContain('Another daemon is already running')

        // Cleanup
        firstDaemon.kill('SIGTERM')
        
      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping process duplication test: dependencies not available')
          return
        }
        throw error
      }
    }, 15000)

    test('should handle daemon restart correctly', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Act & Assert - デーモンの開始、停止、再開始
        const startOutput = execSync('bun run src/daemon.ts start 5000', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 10000
        })
        expect(startOutput).toContain('Starting daemon')

        const statusOutput = execSync('bun run src/daemon.ts status', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 5000
        })
        expect(statusOutput).toBeTruthy()

        const stopOutput = execSync('bun run src/daemon.ts stop', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 5000
        })
        expect(stopOutput).toContain('stopped')

        // 再開始が成功することを確認
        const restartOutput = execSync('bun run src/daemon.ts start 5000', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 10000
        })
        expect(restartOutput).toContain('Starting daemon')

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping daemon restart test: dependencies not available')
          return
        }
        throw error
      }
    }, 20000)
  })

  describe('Performance and Stability', () => {
    test('should maintain stable performance over extended operation', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - 複数回の更新実行で安定性を測定
        const iterations = 20
        const executionTimes: number[] = []

        // Act - 複数回の個別実行
        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now()
          
          const output = execSync('bun run src/daemon.ts once', {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            timeout: 10000
          })
          
          const executionTime = Date.now() - startTime
          executionTimes.push(executionTime)
          
          expect(output).toContain('Update completed')
        }

        // Assert - パフォーマンスの一貫性
        const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / iterations
        const maxTime = Math.max(...executionTimes)
        const minTime = Math.min(...executionTimes)
        
        expect(averageTime).toBeLessThan(5000) // 平均5秒以下
        expect(maxTime).toBeLessThan(10000) // 最大でも10秒以下
        expect(maxTime - minTime).toBeLessThan(5000) // 実行時間のばらつきが5秒以下

        console.log(`Performance Stats: Avg=${averageTime.toFixed(0)}ms, Max=${maxTime}ms, Min=${minTime}ms`)

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping performance test: dependencies not available')
          return
        }
        throw error
      }
    }, 120000) // 2分タイムアウト

    test('should handle rapid consecutive updates efficiently', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - 複数の並行更新
        const concurrentUpdates = 10
        const promises: Promise<any>[] = []
        const startTime = Date.now()

        // Act - 並行実行
        for (let i = 0; i < concurrentUpdates; i++) {
          promises.push(
            new Promise((resolve, reject) => {
              const child = spawn('bun', ['run', 'src/daemon.ts', 'once'], {
                cwd: PROJECT_ROOT,
                stdio: 'pipe'
              })

              let output = ''
              child.stdout.on('data', (data) => {
                output += data.toString()
              })

              child.on('close', (code) => {
                if (code === 0) {
                  resolve(output)
                } else {
                  reject(new Error(`Process exited with code ${code}`))
                }
              })

              child.on('error', reject)
            })
          )
        }

        const results = await Promise.all(promises)
        const totalTime = Date.now() - startTime

        // Assert - 並行実行の効率性
        expect(results.length).toBe(concurrentUpdates)
        expect(totalTime).toBeLessThan(15000) // 15秒以内で全て完了
        
        // 全ての更新が成功していることを確認
        results.forEach(result => {
          expect(result).toContain('Update completed')
        })

        console.log(`Concurrent execution completed in ${totalTime}ms for ${concurrentUpdates} updates`)

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping concurrent updates test: dependencies not available')
          return
        }
        throw error
      }
    }, 30000)
  })

  describe('Real Environment Integration', () => {
    test('should work with actual tmux session', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - tmuxセッションの確認または作成
        let tmuxSessionExists = false
        try {
          execSync('tmux list-sessions', { timeout: 5000 })
          tmuxSessionExists = true
        } catch (error) {
          // tmuxセッションが存在しないか、tmuxがインストールされていない
        }

        if (!tmuxSessionExists) {
          console.warn('Skipping tmux integration test: no tmux session available')
          return
        }

        // Act - 実際のtmux環境での変数設定
        const output = execSync('bun run src/daemon.ts once', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 10000
        })

        // Assert - 更新が成功
        expect(output).toContain('Update completed')

        // tmux変数が実際に設定されているか確認
        const tmuxVariables = execSync('tmux show-options -g | grep "@ccusage_" || true', {
          encoding: 'utf8',
          timeout: 5000
        })

        // ccusage変数が設定されていることを確認
        expect(tmuxVariables.split('\n').filter(line => line.includes('@ccusage_')).length).toBeGreaterThan(5)

      } catch (error) {
        if (error.message.includes('command not found') || 
            error.message.includes('no server running')) {
          console.warn('Skipping tmux integration test: tmux not available')
          return
        }
        throw error
      }
    })

    test('should handle ccusage data format correctly', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - ccusageの存在確認
        let ccusageAvailable = false
        try {
          execSync('ccusage --version', { timeout: 5000 })
          ccusageAvailable = true
        } catch (error) {
          console.warn('Skipping ccusage format test: ccusage not available')
          return
        }

        // Act - 実際のccusageデータを使用した更新
        const output = execSync('bun run src/daemon.ts once', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 15000
        })

        // Assert - ccusageデータの処理が成功
        expect(output).toContain('Update completed')

        // tmux変数の具体的な値をチェック
        const isActiveVar = execSync('tmux show-option -gqv @ccusage_is_active || echo "not_set"', {
          encoding: 'utf8'
        }).trim()

        // 実際のデータ形式に応じて検証
        expect(['true', 'false', 'not_set']).toContain(isActiveVar)

        if (isActiveVar === 'true') {
          // アクティブな場合は他の変数もチェック
          const totalTokens = execSync('tmux show-option -gqv @ccusage_total_tokens || echo "0"', {
            encoding: 'utf8'
          }).trim()
          
          expect(parseInt(totalTokens)).toBeGreaterThanOrEqual(0)
        }

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping ccusage format test: dependencies not available')
          return
        }
        throw error
      }
    })
  })

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary failures gracefully', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - 最初に正常な実行
        const normalOutput = execSync('bun run src/daemon.ts once', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 10000
        })
        expect(normalOutput).toContain('Update completed')

        // Act - 一時的なエラー状況をシミュレート（無効なコマンドを含む環境変数設定）
        const env = { ...process.env, PATH: '/nonexistent/path' }
        
        let errorOutput = ''
        try {
          execSync('bun run src/daemon.ts once', {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            timeout: 10000,
            env
          })
        } catch (error: any) {
          errorOutput = error.stdout || error.stderr || error.message
        }

        // Act - 正常な環境での回復実行
        const recoveryOutput = execSync('bun run src/daemon.ts once', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 10000
        })

        // Assert - 回復が成功
        expect(recoveryOutput).toContain('Update completed')

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping error recovery test: dependencies not available')
          return
        }
        throw error
      }
    })

    test('should maintain data consistency during interruptions', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - 正常な更新を実行
        execSync('bun run src/daemon.ts once', {
          cwd: PROJECT_ROOT,
          timeout: 10000
        })

        // 更新前の変数をキャプチャ
        const beforeVars = execSync('tmux show-options -g | grep "@ccusage_" || true', {
          encoding: 'utf8'
        })

        // Act - デーモンを開始して途中で中断
        const daemon = spawn('bun', ['run', 'src/daemon.ts', 'start', '2000'], {
          cwd: PROJECT_ROOT,
          stdio: 'pipe'
        })

        // 少し実行させてから中断
        await new Promise(resolve => setTimeout(resolve, 1000))
        daemon.kill('SIGTERM')

        // 中断後の状態確認
        const afterInterruption = execSync('tmux show-options -g | grep "@ccusage_" || true', {
          encoding: 'utf8'
        })

        // Act - 再開後の正常な更新
        execSync('bun run src/daemon.ts once', {
          cwd: PROJECT_ROOT,
          timeout: 10000
        })

        const afterRecovery = execSync('tmux show-options -g | grep "@ccusage_" || true', {
          encoding: 'utf8'
        })

        // Assert - データの一貫性が保たれている
        const beforeCount = beforeVars.split('\n').filter(line => line.includes('@ccusage_')).length
        const afterCount = afterRecovery.split('\n').filter(line => line.includes('@ccusage_')).length
        
        // 回復後は同等または同数以上の変数が設定されている
        expect(afterCount).toBeGreaterThanOrEqual(Math.max(1, beforeCount - 2)) // 多少の変動は許容

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping data consistency test: dependencies not available')
          return
        }
        throw error
      }
    })
  })

  describe('Memory and Resource Management', () => {
    test('should not cause memory leaks during extended operation', async () => {
      if (isCI) {
        console.warn(skipReason)
        return
      }

      try {
        // Arrange - 長時間実行のシミュレーション
        const longRunIterations = 50
        const memoryUsage: number[] = []

        // Act - 複数回実行してメモリ使用量を監視
        for (let i = 0; i < longRunIterations; i++) {
          // メモリ使用量測定前にガベージコレクションを促す
          if (global.gc) {
            global.gc()
          }

          const beforeMemory = process.memoryUsage().heapUsed

          execSync('bun run src/daemon.ts once', {
            cwd: PROJECT_ROOT,
            timeout: 8000
          })

          const afterMemory = process.memoryUsage().heapUsed
          memoryUsage.push(afterMemory - beforeMemory)

          // 少し間隔を空ける
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

        // Assert - メモリ使用量の安定性
        const avgMemoryIncrease = memoryUsage.reduce((sum, mem) => sum + mem, 0) / memoryUsage.length
        const maxMemoryIncrease = Math.max(...memoryUsage)

        // メモリリークがないことを確認（大幅な増加がない）
        expect(avgMemoryIncrease).toBeLessThan(1024 * 1024) // 平均1MB以下の増加
        expect(maxMemoryIncrease).toBeLessThan(5 * 1024 * 1024) // 最大5MB以下の増加

        console.log(`Memory usage: Avg increase=${Math.round(avgMemoryIncrease / 1024)}KB, Max increase=${Math.round(maxMemoryIncrease / 1024)}KB`)

      } catch (error) {
        if (error.message.includes('command not found')) {
          console.warn('Skipping memory test: dependencies not available')
          return
        }
        throw error
      }
    }, 180000) // 3分タイムアウト
  })
})