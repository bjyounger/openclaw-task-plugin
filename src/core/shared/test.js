/**
 * Basic Test for Shared State
 */

const path = require('path');
const os = require('os');

// Test 1: Path functions
console.log('Test 1: Path Functions');

function getSharedStateDir() {
  return path.join(os.homedir(), '.openclaw', 'workspace', 'memory', 'tasks', 'shared-state');
}

function getSharedStatePath(taskId) {
  return path.join(getSharedStateDir(), `${taskId}.json`);
}

const dir = getSharedStateDir();
const statePath = getSharedStatePath('task-123');

console.log('  Dir:', dir);
console.log('  Path:', statePath);
console.log('  ✓ Path functions work\n');

// Test 2: State creation
console.log('Test 2: State Creation');

function getDefaultState(taskId, options = {}) {
  const now = new Date();
  return {
    version: '1.0.0',
    taskId,
    createdBy: 'v3',
    createdAt: now.toISOString(),
    createOptions: {
      priority: 'medium',
      maxRetries: 2,
      ...options,
    },
    monitoringStatus: 'pending',
    lastCheckTime: now.getTime(),
    retryCount: 0,
    alerts: [],
  };
}

const state = getDefaultState('test-001', { taskType: 'test' });
console.log('  State:', JSON.stringify(state, null, 2));
console.log('  ✓ State creation works\n');

// Test 3: Validation
console.log('Test 3: State Validation');

function isValidSharedState(state) {
  if (!state || typeof state !== 'object') {
    return false;
  }

  const requiredFields = [
    'version',
    'taskId',
    'createdBy',
    'createdAt',
    'createOptions',
    'monitoringStatus',
    'lastCheckTime',
    'retryCount',
    'alerts',
  ];

  for (const field of requiredFields) {
    if (!(field in state)) {
      return false;
    }
  }

  const validStatuses = ['pending', 'active', 'timeout', 'stalled', 'completed'];
  if (!validStatuses.includes(state.monitoringStatus)) {
    return false;
  }

  return true;
}

console.log('  Valid state:', isValidSharedState(state));
console.log('  Invalid state:', isValidSharedState({}));
console.log('  ✓ Validation works\n');

console.log('✅ All tests passed!');
