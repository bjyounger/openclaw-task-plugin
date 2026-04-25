/**
 * KnowledgeIntegration - 知识整合适配层
 *
 * 适配 MemoryManager.refine() API，提供知识提炼功能
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import { MemoryManager } from '../memory/memory-manager';
import { RefinementInput, RefinementOutput } from './types';

/**
 * 知识整合适配层
 *
 * 核心职责：
 * 1. 封装 MemoryManager.refine() 调用（方案 A）
 * 2. 提供多格式输出支持
 * 3. 扩展知识提炼功能
 */
export class KnowledgeIntegration {
  /**
   * 创建知识整合适配层
   *
   * @param memoryManager 记忆管理器
   */
  constructor(private memoryManager: MemoryManager) {}

  /**
   * 执行知识提炼
   *
   * 方案 A：直接调用 MemoryManager.refine()
   *
   * @param input 提炼输入参数（可选）
   * @returns 提炼结果
   */
  async refine(input?: RefinementInput): Promise<RefinementOutput> {
    // 直接调用 MemoryManager.refine()
    const result = await this.memoryManager.refine();

    return {
      clusters: result.clusters.map(c => ({
        clusterId: c.clusterId,
        label: c.label,
        members: c.members,
        commonFeatures: c.commonFeatures,
      })),
      extractedKnowledge: result.extractedKnowledge,
      promotedMemories: result.promotedMemories,
    };
  }

  /**
   * 多格式输出 - JSON
   */
  async refineAsJson(input?: RefinementInput): Promise<string> {
    const result = await this.refine(input);
    return JSON.stringify(result, null, 2);
  }

  /**
   * 多格式输出 - YAML（简化实现）
   */
  async refineAsYaml(input?: RefinementInput): Promise<string> {
    const result = await this.refine(input);
    return this.toYaml(result);
  }

  /**
   * 多格式输出 - Markdown
   */
  async refineAsMarkdown(input?: RefinementInput): Promise<string> {
    const result = await this.refine(input);
    return this.toMarkdown(result);
  }

  /**
   * 转换为 YAML 格式
   */
  private toYaml(output: RefinementOutput): string {
    const lines: string[] = [];

    lines.push('clusters:');
    for (const cluster of output.clusters) {
      lines.push(`  - id: ${cluster.clusterId}`);
      lines.push(`    label: ${cluster.label}`);
      lines.push(`    members: ${cluster.members.length}`);
      lines.push(`    commonFeatures:`);
      for (const feature of cluster.commonFeatures) {
        lines.push(`      - ${feature}`);
      }
    }

    lines.push(`promotedMemories: ${output.promotedMemories}`);

    return lines.join('\n');
  }

  /**
   * 转换为 Markdown 格式
   */
  private toMarkdown(output: RefinementOutput): string {
    const lines: string[] = [];

    lines.push('# 知识提炼报告');
    lines.push('');

    // 聚类统计
    lines.push('## 聚类统计');
    lines.push(`- 聚类数量：${output.clusters.length}`);
    lines.push(`- 提升记忆数：${output.promotedMemories}`);
    lines.push('');

    // 聚类详情
    if (output.clusters.length > 0) {
      lines.push('## 聚类详情');
      lines.push('');

      for (const cluster of output.clusters) {
        lines.push(`### ${cluster.label}`);
        lines.push(`- 成员数：${cluster.members.length}`);
        lines.push(`- 共同特征：${cluster.commonFeatures.join(', ')}`);
        lines.push('');
      }
    }

    // 提取的知识
    if (output.extractedKnowledge.extractedKnowledge.length > 0) {
      lines.push('## 提取的知识点');
      lines.push('');

      for (const knowledge of output.extractedKnowledge.extractedKnowledge) {
        lines.push(`- ${knowledge}`);
      }
      lines.push('');
    }

    // 识别的模式
    if (output.extractedKnowledge.patterns.length > 0) {
      lines.push('## 识别的模式');
      lines.push('');

      for (const pattern of output.extractedKnowledge.patterns) {
        lines.push(`- **${pattern.pattern}** (出现 ${pattern.occurrences} 次)`);
      }
    }

    return lines.join('\n');
  }
}
