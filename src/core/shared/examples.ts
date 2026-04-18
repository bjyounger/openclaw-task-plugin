/**
 * Shared State Usage Examples
 * 
 * This file demonstrates how to use the shared state types and utilities
 * for coordination between task-plugin-v3 and task-monitor-v14.
 */

import {
  SharedTaskState,
  TaskCreateOptions,
  MonitoringStatus,
  AlertRecord,
} from './types';

import {
  getSharedStateDir,
  getSharedStatePath,
  getDefaultState,
  createAlert,
  updateMonitoringStatus,
  incrementRetryCount,
  isValidSharedState,
} from './utils';

// ============================================
// Example 1: Creating a new shared state (v3)
// ============================================

function example1_createTaskState() {
  console.log('Example 1: Creating a new shared state\n');

  const taskId = 'task-2026-0417-001';
  const options: TaskCreateOptions = {
    taskType: 'data-processing',
    priority: 'high',
    timeout: 60000, // 60 seconds
    maxRetries: 3,
    tags: ['reports', 'monthly'],
    context: {
      source: 'api',
      userId: 'user-123',
    },
  };

  const state = getDefaultState(taskId, options);

  console.log('Task ID:', taskId);
  console.log('State Path:', getSharedStatePath(taskId));
  console.log('State:', JSON.stringify(state, null, 2));
  console.log('\n---\n');
}

// ============================================
// Example 2: Reading state by v14 (monitor)
// ============================================

async function example2_readState() {
  console.log('Example 2: Reading state (v14 monitor)\n');

  const taskId = 'task-2026-0417-001';
  const statePath = getSharedStatePath(taskId);

  console.log('Reading from:', statePath);
  
  // Simulated state (in real code, read from file)
  const state: SharedTaskState = getDefaultState(taskId, {
    taskType: 'data-processing',
  });

  console.log('Monitoring Status:', state.monitoringStatus);
  console.log('Created At:', state.createdAt);
  console.log('Last Check:', new Date(state.lastCheckTime).toISOString());
  console.log('\n---\n');
}

// ============================================
// Example 3: Updating monitoring status (v14)
// ============================================

function example3_updateStatus() {
  console.log('Example 3: Updating monitoring status\n');

  const taskId = 'task-2026-0417-002';
  
  // Initial state
  let state = getDefaultState(taskId, {
    taskType: 'api-sync',
    timeout: 30000,
  });

  console.log('Initial Status:', state.monitoringStatus);

  // v14 starts monitoring
  state = updateMonitoringStatus(state, 'active');
  console.log('After monitoring started:', state.monitoringStatus);

  // Add an alert
  const alert = createAlert('warning', 'Task taking longer than expected', {
    elapsed: 15000,
    threshold: 10000,
  });
  state = updateMonitoringStatus(state, 'active', alert);

  console.log('Alerts:', state.alerts.length);
  console.log('Last Alert:', state.alerts[state.alerts.length - 1]);
  console.log('\n---\n');
}

// ============================================
// Example 4: Handling timeout (v14)
// ============================================

function example4_handleTimeout() {
  console.log('Example 4: Handling timeout\n');

  const taskId = 'task-2026-0417-003';
  
  let state = getDefaultState(taskId, {
    taskType: 'batch-job',
    timeout: 5000,
    maxRetries: 2,
  });

  console.log('Max Retries:', state.createOptions.maxRetries);

  // Simulate timeout
  const timeoutAlert = createAlert('timeout', 'Task exceeded timeout limit', {
    elapsed: 5500,
    timeout: 5000,
  });

  state = updateMonitoringStatus(state, 'timeout', timeoutAlert);
  console.log('Status after timeout:', state.monitoringStatus);

  // Increment retry
  state = incrementRetryCount(state);
  console.log('Retry count:', state.retryCount);

  // Check if should retry
  if (state.retryCount <= (state.createOptions.maxRetries || 2)) {
    console.log('Will retry...');
    state = updateMonitoringStatus(state, 'pending');
  }
  console.log('\n---\n');
}

// ============================================
// Example 5: Task completion (v3)
// ============================================

function example5_taskCompletion() {
  console.log('Example 5: Task completion\n');

  const taskId = 'task-2026-0417-004';
  
  let state = getDefaultState(taskId, {
    taskType: 'report-generation',
  });

  // Simulate monitoring
  state = updateMonitoringStatus(state, 'active');

  // Task completes successfully
  const completionAlert = createAlert('info', 'Task completed successfully', {
    duration: 2500,
    result: 'success',
  });

  state = updateMonitoringStatus(state, 'completed', completionAlert);

  console.log('Final Status:', state.monitoringStatus);
  console.log('Total Alerts:', state.alerts.length);
  console.log('\n---\n');
}

// ============================================
// Example 6: State validation
// ============================================

function example6_validation() {
  console.log('Example 6: State validation\n');

  // Valid state
  const validState = getDefaultState('task-001', { taskType: 'test' });
  console.log('Valid state check:', isValidSharedState(validState));

  // Invalid state (missing fields)
  const invalidState = {
    version: '1.0.0',
    taskId: 'task-002',
    // Missing required fields
  };
  console.log('Invalid state check:', isValidSharedState(invalidState));

  // Invalid status
  const invalidStatus = {
    ...validState,
    monitoringStatus: 'invalid-status',
  };
  console.log('Invalid status check:', isValidSharedState(invalidStatus));
  console.log('\n---\n');
}

// ============================================
// Example 7: Path utilities
// ============================================

function example7_paths() {
  console.log('Example 7: Path utilities\n');

  console.log('Shared State Directory:', getSharedStateDir());
  console.log('Task State Path:', getSharedStatePath('task-123'));
  console.log('Another Task Path:', getSharedStatePath('batch-2026-0417'));
  console.log('\n---\n');
}

// ============================================
// Run all examples
// ============================================

function runAllExamples() {
  console.log('=== Shared State Usage Examples ===\n');

  example1_createTaskState();
  example2_readState();
  example3_updateStatus();
  example4_handleTimeout();
  example5_taskCompletion();
  example6_validation();
  example7_paths();

  console.log('=== All examples completed ===\n');
}

// Export for external use
export {
  example1_createTaskState,
  example2_readState,
  example3_updateStatus,
  example4_handleTimeout,
  example5_taskCompletion,
  example6_validation,
  example7_paths,
  runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}
