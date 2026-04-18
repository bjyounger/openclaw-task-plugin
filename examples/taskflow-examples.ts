/**
 * OpenClawBridge 任务流示例
 * 
 * 本示例展示了任务流（TaskFlow）的使用：
 * - 创建任务流
 * - 查询任务流
 * - 管理任务流
 * - 监控任务流执行
 * 
 * @version 3.0.0
 */

import {
  OpenClawBridge,
  TaskOperationError,
  TaskFlowDetail,
  ToolContext,
} from '../src';

/**
 * 示例1: 创建简单的任务流
 */
export async function example1_createSimpleFlow(ctx: ToolContext) {
  console.log('=== 示例1: 创建简单任务流 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  try {
    // 创建包含3个任务的任务流
    const flow = await bridge.createTaskFlow({
      name: '数据处理流水线',
      description: '收集、处理、分析的完整流程',
      tasks: [
        {
          title: '数据收集',
          runtime: 'subagent',
          metadata: { step: 1, type: 'collect' },
        },
        {
          title: '数据处理',
          runtime: 'subagent',
          metadata: { step: 2, type: 'process' },
        },
        {
          title: '数据分析',
          runtime: 'subagent',
          metadata: { step: 3, type: 'analyze' },
        },
      ],
    });
    
    console.log('任务流已创建:', flow);
    console.log('Flow ID:', flow.flowId);
    console.log('名称:', flow.name);
    console.log('状态:', flow.status);
    
    return flow;
  } catch (error) {
    if (error instanceof TaskOperationError) {
      console.error('创建任务流失败:', error.code, error.message);
    }
    throw error;
  }
}

/**
 * 示例2: 创建ETL任务流
 */
export async function example2_createETLFlow(ctx: ToolContext) {
  console.log('=== 示例2: 创建ETL任务流 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const flow = await bridge.createTaskFlow({
    name: 'ETL流水线',
    description: '数据 Extract-Transform-Load 完整流程',
    tasks: [
      {
        title: 'Extract: 数据提取',
        runtime: 'subagent',
        timeout: 600000, // 10分钟
        metadata: {
          stage: 'extract',
          source: 'database',
        },
      },
      {
        title: 'Transform: 数据转换',
        runtime: 'subagent',
        timeout: 900000, // 15分钟
        metadata: {
          stage: 'transform',
          rules: ['normalize', 'validate'],
        },
      },
      {
        title: 'Load: 数据加载',
        runtime: 'subagent',
        timeout: 600000,
        metadata: {
          stage: 'load',
          target: 'data-warehouse',
          mode: 'append',
        },
      },
    ],
    metadata: {
      project: 'data-pipeline',
      environment: 'production',
      scheduledBy: 'user-request',
    },
  });
  
  console.log('ETL任务流已创建:', flow.flowId);
  
  return flow;
}

/**
 * 示例3: 获取任务流详情
 */
export async function example3_getFlowDetail(ctx: ToolContext, flowId: string) {
  console.log('=== 示例3: 获取任务流详情 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const flow = await bridge.getTaskFlow(flowId);
  
  if (flow) {
    console.log('任务流详情:');
    console.log('  ID:', flow.flowId);
    console.log('  名称:', flow.name);
    console.log('  状态:', flow.status);
    console.log('  描述:', flow.description);
    console.log('  创建时间:', flow.createdAt);
    console.log('  任务数量:', flow.tasks.length);
    
    console.log('\n任务列表:');
    flow.tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.title} (${task.status})`);
    });
    
    if (flow.metadata) {
      console.log('\n元数据:', flow.metadata);
    }
  } else {
    console.log('任务流不存在');
  }
  
  return flow;
}

/**
 * 示例4: 列出所有任务流
 */
export async function example4_listTaskFlows(ctx: ToolContext) {
  console.log('=== 示例4: 列出所有任务流 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const flows = await bridge.listTaskFlows();
  
  console.log(`共 ${flows.length} 个任务流\n`);
  
  flows.forEach((flow, index) => {
    console.log(`${index + 1}. ${flow.name}`);
    console.log(`   ID: ${flow.flowId}`);
    console.log(`   状态: ${flow.status}`);
    console.log(`   创建时间: ${flow.createdAt}`);
    console.log('');
  });
  
  return flows;
}

/**
 * 示例5: 监控任务流执行
 */
export async function example5_monitorFlow(ctx: ToolContext, flowId: string) {
  console.log('=== 示例5: 监控任务流执行 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const POLL_INTERVAL = 10000; // 10秒
  
  let flow: TaskFlowDetail | undefined;
  let previousStatus: string | undefined;
  
  console.log('开始监控任务流:', flowId);
  console.log('');
  
  while (true) {
    flow = await bridge.getTaskFlow(flowId);
    
    if (!flow) {
      console.log('任务流不存在');
      return;
    }
    
    // 只在状态变化时输出
    if (flow.status !== previousStatus) {
      console.log(`[${new Date().toISOString()}] 状态: ${flow.status}`);
      previousStatus = flow.status;
    }
    
    // 检查是否完成
    if (['completed', 'failed', 'cancelled'].includes(flow.status)) {
      console.log('\n任务流已结束');
      
      // 显示每个任务的状态
      console.log('\n任务执行结果:');
      flow.tasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.title}: ${task.status}`);
      });
      
      break;
    }
    
    // 等待后继续轮询
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  return flow;
}

/**
 * 示例6: 取消任务流
 */
export async function example6_cancelFlow(ctx: ToolContext, flowId: string) {
  console.log('=== 示例6: 取消任务流 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  try {
    const result = await bridge.cancelTaskFlow(flowId, '业务需求变更');
    
    if (result.cancelled) {
      console.log('任务流已取消:', result.flowId);
      console.log('取消原因:', result.reason);
    } else {
      console.log('取消失败');
    }
    
    return result;
  } catch (error) {
    if (error instanceof TaskOperationError) {
      console.error('取消任务流失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例7: 创建带有复杂元数据的任务流
 */
export async function example7_createComplexFlow(ctx: ToolContext) {
  console.log('=== 示例7: 创建复杂任务流 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const flow = await bridge.createTaskFlow({
    name: '机器学习训练流程',
    description: '数据准备 → 特征工程 → 模型训练 → 模型评估',
    tasks: [
      {
        title: '数据准备',
        runtime: 'subagent',
        timeout: 1800000, // 30分钟
        metadata: {
          step: 1,
          department: 'data-team',
          priority: 'high',
          dependencies: [],
          config: {
            dataSource: 's3://data-bucket/raw/',
            format: 'parquet',
          },
        },
      },
      {
        title: '特征工程',
        runtime: 'subagent',
        timeout: 2400000, // 40分钟
        metadata: {
          step: 2,
          department: 'ml-team',
          priority: 'high',
          dependencies: ['数据准备'],
          config: {
            features: ['feature1', 'feature2', 'feature3'],
            normalization: 'standard',
          },
        },
      },
      {
        title: '模型训练',
        runtime: 'subagent',
        timeout: 3600000, // 60分钟
        metadata: {
          step: 3,
          department: 'ml-team',
          priority: 'critical',
          dependencies: ['特征工程'],
          config: {
            model: 'xgboost',
            hyperparameters: {
              max_depth: 6,
              learning_rate: 0.1,
              n_estimators: 100,
            },
          },
        },
      },
      {
        title: '模型评估',
        runtime: 'subagent',
        timeout: 1200000, // 20分钟
        metadata: {
          step: 4,
          department: 'ml-team',
          priority: 'medium',
          dependencies: ['模型训练'],
          config: {
            metrics: ['accuracy', 'precision', 'recall', 'f1'],
            validation: 'cross-validation',
          },
        },
      },
    ],
    metadata: {
      project: 'ml-pipeline',
      version: 'v1.0.0',
      owner: 'ml-team',
      environment: 'staging',
      tags: ['machine-learning', 'training', 'xgboost'],
      notifications: {
        onSuccess: ['slack:ml-team', 'email:ml-lead@example.com'],
        onFailure: ['slack:alerts', 'pagerduty:oncall'],
      },
    },
  });
  
  console.log('复杂任务流已创建:', flow.flowId);
  
  return flow;
}

/**
 * 运行所有任务流示例
 */
export async function runTaskFlowExamples(ctx: ToolContext) {
  console.log('\n========================================');
  console.log('OpenClawBridge 任务流示例');
  console.log('========================================\n');
  
  // 1. 创建简单任务流
  const simpleFlow = await example1_createSimpleFlow(ctx);
  
  // 2. 创建ETL任务流
  const etlFlow = await example2_createETLFlow(ctx);
  
  // 3. 列出所有任务流
  await example4_listTaskFlows(ctx);
  
  // 4. 获取任务流详情
  await example3_getFlowDetail(ctx, simpleFlow.flowId);
  
  // 5. 监控任务流（短时间）
  console.log('\n监控任务流5秒...');
  const monitorPromise = example5_monitorFlow(ctx, etlFlow.flowId);
  
  // 6秒后取消监控
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  // 6. 取消任务流
  await example6_cancelFlow(ctx, etlFlow.flowId);
  
  // 7. 创建复杂任务流
  const complexFlow = await example7_createComplexFlow(ctx);
  
  console.log('\n========================================');
  console.log('所有任务流示例执行完成');
  console.log('========================================\n');
  
  return {
    simpleFlow,
    etlFlow,
    complexFlow,
  };
}

// 导出示例函数
export const taskFlowExamples = {
  example1_createSimpleFlow,
  example2_createETLFlow,
  example3_getFlowDetail,
  example4_listTaskFlows,
  example5_monitorFlow,
  example6_cancelFlow,
  example7_createComplexFlow,
  runTaskFlowExamples,
};