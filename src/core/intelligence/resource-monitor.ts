/**
 * ResourceMonitor - 资源监控器
 *
 * 监控系统资源使用情况，为决策引擎提供资源状态数据
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import * as os from 'os';
import { SystemResources } from './types';

/**
 * 资源监控器
 *
 * 定期采集系统资源数据，包括 CPU 使用率、内存使用率等
 */
export class ResourceMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private currentResources: SystemResources;
  private lastCpuInfo: { idle: number; total: number } | null = null;

  /**
   * 创建资源监控器
   *
   * @param interval 采样间隔（毫秒），默认 5000
   */
  constructor(private interval: number = 5000) {
    this.currentResources = this.getInitialResources();
    this.start();
  }

  /**
   * 启动监控
   */
  private start(): void {
    // 立即更新一次
    this.updateResources();

    // 定期更新
    this.intervalId = setInterval(() => {
      this.updateResources();
    }, this.interval);
  }

  /**
   * 更新资源数据
   */
  private updateResources(): void {
    const cpuUsage = this.calculateCpuUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

    this.currentResources = {
      cpuUsage,
      memoryUsage,
      freeMemory,
      totalMemory,
      loadAverage: os.loadavg(),
    };
  }

  /**
   * 计算 CPU 使用率
   *
   * 使用两次采样之间的 CPU 时间差来计算
   */
  private calculateCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as Record<string, number>)[type];
      }
      totalIdle += cpu.times.idle;
    }

    if (!this.lastCpuInfo) {
      // 首次采样，使用负载均值估算
      this.lastCpuInfo = { idle: totalIdle, total: totalTick };
      const load = os.loadavg()[0];
      const cpuCount = cpus.length;
      return Math.min(100, Math.max(0, (load / cpuCount) * 100));
    }

    const idleDiff = totalIdle - this.lastCpuInfo.idle;
    const totalDiff = totalTick - this.lastCpuInfo.total;

    this.lastCpuInfo = { idle: totalIdle, total: totalTick };

    if (totalDiff === 0) {
      return 0;
    }

    const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
    return Math.min(100, Math.max(0, usage));
  }

  /**
   * 获取初始资源状态
   */
  private getInitialResources(): SystemResources {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      cpuUsage: 0,
      memoryUsage: ((totalMemory - freeMemory) / totalMemory) * 100,
      freeMemory,
      totalMemory,
      loadAverage: os.loadavg(),
    };
  }

  /**
   * 获取当前资源状态
   *
   * @returns 系统资源快照
   */
  getCurrentResources(): SystemResources {
    return { ...this.currentResources };
  }

  /**
   * 获取 CPU 核心数
   */
  getCpuCount(): number {
    return os.cpus().length;
  }

  /**
   * 检查资源是否充足
   *
   * @param thresholds 阈值配置
   * @returns 资源是否充足
   */
  isResourceAvailable(thresholds?: {
    maxCpuUsage?: number;
    maxMemoryUsage?: number;
  }): boolean {
    const { cpuUsage, memoryUsage } = this.currentResources;
    const maxCpu = thresholds?.maxCpuUsage ?? 90;
    const maxMemory = thresholds?.maxMemoryUsage ?? 90;

    return cpuUsage < maxCpu && memoryUsage < maxMemory;
  }

  /**
   * 获取资源摘要
   *
   * @returns 资源摘要字符串
   */
  getResourceSummary(): string {
    const { cpuUsage, memoryUsage, loadAverage } = this.currentResources;
    return `CPU: ${cpuUsage.toFixed(1)}%, Memory: ${memoryUsage.toFixed(1)}%, Load: ${loadAverage[0].toFixed(2)}`;
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.stop();
  }
}
