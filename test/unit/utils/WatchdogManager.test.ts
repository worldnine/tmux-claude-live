import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

// Bunのモッキング機能を使用
const mockExec = mock(async (command: string) => {
  // モックの戻り値はテスト内で設定
  throw new Error('Mock not configured');
});

// child_processをモック
mock.module('child_process', () => ({
  exec: mockExec
}));

mock.module('util', () => ({
  promisify: () => mockExec
}));

import { WatchdogManager } from '../../../src/utils/WatchdogManager';

describe('WatchdogManager', () => {
  let watchdog: WatchdogManager;

  beforeEach(() => {
    watchdog = new WatchdogManager();
    mockExec.mockClear();
  });

  describe('isProcessAlive', () => {
    test('should return true when process is alive', async () => {
      // Arrange
      const pid = 12345;
      mockExec.mockResolvedValue({ stdout: '12345' });

      // Act
      const isAlive = await watchdog.isProcessAlive(pid);

      // Assert
      expect(isAlive).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(`kill -0 ${pid}`);
    });

    test('should return false when process is dead', async () => {
      // Arrange
      const pid = 12345;
      mockExec.mockRejectedValue(new Error('No such process'));

      // Act
      const isAlive = await watchdog.isProcessAlive(pid);

      // Assert
      expect(isAlive).toBe(false);
    });
  });

  describe('getDaemonPid', () => {
    test('should return stored daemon PID from tmux variable', async () => {
      // Arrange
      mockExec.mockResolvedValue({ stdout: '47830\n' });

      // Act
      const pid = await watchdog.getDaemonPid();

      // Assert
      expect(pid).toBe(47830);
    });

    test('should return null when no PID is stored', async () => {
      // Arrange
      mockExec.mockRejectedValue(new Error('No such option'));

      // Act
      const pid = await watchdog.getDaemonPid();

      // Assert
      expect(pid).toBeNull();
    });
  });

  describe('isDaemonHealthy', () => {
    test('should return true when daemon is alive and responsive', async () => {
      // Arrange
      mockExec
        .mockResolvedValueOnce({ stdout: '12345\n' })  // PID取得成功
        .mockResolvedValueOnce({ stdout: '12345' });   // プロセス存在確認成功

      // Act
      const isHealthy = await watchdog.isDaemonHealthy();

      // Assert
      expect(isHealthy).toBe(true);
    });

    test('should return false when daemon PID not found', async () => {
      // Arrange
      mockExec.mockRejectedValue(new Error('No such option'));

      // Act
      const isHealthy = await watchdog.isDaemonHealthy();

      // Assert
      expect(isHealthy).toBe(false);
    });

    test('should return false when daemon process is dead', async () => {
      // Arrange
      mockExec
        .mockResolvedValueOnce({ stdout: '12345\n' })    // PID取得成功
        .mockRejectedValueOnce(new Error('No such process')); // プロセス存在確認失敗

      // Act
      const isHealthy = await watchdog.isDaemonHealthy();

      // Assert
      expect(isHealthy).toBe(false);
    });
  });

  describe('restartDaemon', () => {
    test('should successfully restart daemon', async () => {
      // Arrange
      mockExec
        .mockResolvedValueOnce({ stdout: '' })        // stop daemon
        .mockResolvedValueOnce({ stdout: '' })        // cleanup lock files
        .mockResolvedValueOnce({ stdout: 'Started' }) // start daemon
        .mockResolvedValueOnce({ stdout: '54321\n' }) // get PID
        .mockResolvedValueOnce({ stdout: '54321' });  // check process alive

      // Act
      const result = await watchdog.restartDaemon();

      // Assert
      expect(result).toBe(true);
    });

    test('should return false when restart fails', async () => {
      // Arrange
      mockExec.mockRejectedValue(new Error('Failed to start daemon'));

      // Act
      const result = await watchdog.restartDaemon();

      // Assert
      expect(result).toBe(false);
    });
  });
});