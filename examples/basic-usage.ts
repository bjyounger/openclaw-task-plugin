/**
 * OpenClawBridge 基本使用示例
 * 
 * 本示例展示了 OpenClawBridge 的基本功能：
 * - 创建任务
 * - 查询任务
 * - 获取任务详情
 * - 取消任务
 * 
 * @version 3.0.0
 */

import {
  OpenClawBridge,
  TaskOperationError,
  checkOpenClawVersion,
  ToolContext,
} from '../src';

/**
 * 示例1: 从工具上下文创建Bridge
 */
export async function example1_basicCreation(ctx: ToolContext) {
  console.log('=== 示例1: 基本创建 ===');
  
  // ✅ 推荐: 从工具上下文创建
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 检查API可用性
  const availability = bridge.checkApiAvailability();
  console.log('API可用性:', availability);
  
  // 获取会话信息
  const sessionInfo = bridge.getSessionInfo();
  console.log('当前会话:', sessionInfo);
  
  return bridge;
}

/**
 * 示例2: 创建任务
 */
export async function example2_createTask(ctx: ToolContext) {
  console.log('=== 示例2: 创建任务 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  try {
    // 创建简单任务
    const task = await bridge.createTask({
      title: '数据分析任务',
      runtime: 'subagent',
      scope: 'session',
    });
    
    console.log('任务已创建:', task);
    console.log('任务ID:', task.taskId);
    console.log('状态:', task.status);
    
    return task;
  } catch (error) {
    if (error instanceof TaskOperationError) {
      console.error('任务创建失败:', error.code);
      console.error('错误信息:', error.message);
      console.error('错误上下文:', error.context);
    }
    throw error;
  }
}

/**
 * 示例3: 查询任务列表
 */
export async function example3_listTasks(ctx: ToolContext) {
  console.log('=== 示例3: 查询任务列表 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 获取所有任务
  const allTasks = await bridge.listTasks();
  console.log(`共有 ${allTasks.length} 个任务`);
  
  // 使用客户端过滤
  const runningTasks = await bridge.queryTasks({
    status: 'running',
  });
  console.log(`运行中任务: ${runningTasks.length} 个`);
  
  // 多状态过滤
  const activeTasks = await bridge.queryTasks({
    status: ['pending', 'queued', 'running'],
    limit: 10,
  });
  console.log(`活跃任务(前10): ${activeTasks.length} 个`);
  
  // 按运行时过滤
  const subagentTasks = await bridge.queryTasks({
    runtime: 'subagent',
  });
  console.log(`子代理任务: ${subagentTasks.length} 个`);
  
  return {
    allTasks,
    runningTasks,
    activeTasks,
    subagentTasks,
  };
}

/**
 * 示例4: 获取任务详情
 */
export async function example4_getTaskDetail(ctx: ToolContext, taskId: string) {
  console.log('=== 示例4: 获取任务详情 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const task = await bridge.getTask(taskId);
  
  if (task) {
    console.log('任务详情:');
    console.log('  ID:', task.taskId);
    console.log('  标题:', task.title);
    console.log('  状态:', task.status);
    console.log('  运行时:', task.runtime);
    console.log('  作用域:', task.scope);
    console.log('  创建时间:', task.createdAt);
    
    if (task.result) {
      console.log('  结果:', task.result);
    }
    
    if (task.error) {
      console.log('  错误:', task.error);
    }
    
    if (task.metadata) {
      console.log('  元数据:', task.metadata);
    }
  } else {
    console.log('任务不存在');
  }
  
  return task;
}

/**
 * 示例5: 取消任务
 */
export async function example5_cancelTask(ctx: ToolContext, taskId: string) {
  console.log('=== 示例5: 取消任务 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  try {
    const result = await bridge.cancelTask(taskId, '用户请求取消');
    
    if (result.cancelled) {
      console.log('任务已取消:', result.taskId);
      console.log('取消原因:', result.reason);
    } else {
      console.log('取消失败');
    }
    
    return result;
  } catch (error) {
    if (error instanceof TaskOperationError) {
      console.error('取消任务失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例6: 查找最新任务
 */
export async function example6_findLatestTask(ctx: ToolContext) {
  console.log('=== 示例6: 查找最新任务 ===');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  const latestTask = await bridge.findLatestTask();
  
  if (latestTask) {
    console.log('最新任务:');
    console.log('  标题:', latestTask.title);
    console.log('  状态:', latestTask.status);
    console.log('  创建时间:', latestTask.createdAt);
  } else {
    console.log('没有任务');
  }
  
  return latestTask;
}

/**
 * 示例7: 版本兼容性检查
 */
export async function example7_versionCheck(ctx: ToolContext) {
  console.log('=== 示例7: 版本兼容性检查 ===');
  
  const result = checkOpenClawVersion(ctx.api);
  
  if (result.compatible) {
    console.log('✅ OpenClaw版本兼容');
  } else {
    console.log('❌ OpenClaw版本不兼容');
    console.log('原因:', result.reason);
  }
  
  return result;
}

/**
 * 运行所有基本示例
 */
export async function runBasicExamples(ctx: ToolContext) {
  console.log('\n========================================');
  console.log('OpenClawBridge 基本使用示例');
  console.log('========================================\n');
  
  // 1. 版本检查
  await example7_versionCheck(ctx);
  
  // 2. 创建Bridge
  const bridge = await example1_basicCreation(ctx);
  
  // 3. 创建任务
  const task = await example2_createTask(ctx);
  
  // 4. 查询任务列表
  await example3_listTasks(ctx);
  
  // 5. 获取任务详情
  await example4_getTaskDetail(ctx, task.taskId);
  
  // 6. 查找最新任务
  await example6_findLatestTask(ctx);
  
  // 7. 取消任务
  await example5_cancelTask(ctx, task.taskId);
  
  console.log('\n========================================');
  console.log('所有基本示例执行完成');
  console.log('========================================\n');
}

// 导出示例函数
export const basicExamples = {
  example1_basicCreation,
  example2_createTask,
  example3_listTasks,
  example4_getTaskDetail,
  example5_cancelTask,
  example6_findLatestTask,
  example7_versionCheck,
  runBasicExamples,
};