/**
 * Shared State Utility Functions
 * 
 * This module provides utility functions for working with shared task state
 * between task-plugin-v3 and task-monitor-v14.
 * 
 * @module task-plugin-v3/core/shared/utils
 */

import * as path from 'path';
import * as os from 'os';
import {
  SharedTaskState,
  TaskCreateOptions,
  MonitoringStatus,
  AlertRecord,
  StateFileMetadata,
} from './types';

/**
 * Get the base directory for shared state files
 * 
 * @returns Absolute path to shared state directory
 * 
 * @example
 * ```typescript
 * const dir = getSharedStateDir();
 * // Returns: /home/user/.openclaw/workspace/memory/tasks/shared-state
 * ```
 */
export function getSharedStateDir(): string {
  const homeDir = os.homedir();
  return path.join(
    homeDir,
    '.openclaw',
    'workspace',
    'memory',
    'tasks',
    'shared-state'
  );
}

/**
 * Get the full path to a task's shared state file
 * 
 * @param taskId - Unique task identifier
 * @returns Absolute path to the state file
 * 
 * @example
 * ```typescript
 * const statePath = getSharedStatePath('task-123');
 * // Returns: /home/user/.openclaw/workspace/memory/tasks/shared-state/task-123.json
 * ```
 */
export function getSharedStatePath(taskId: string): string {
  const baseDir = getSharedStateDir();
  const sanitizedTaskId = sanitizeTaskId(taskId);
  return path.join(baseDir, `${sanitizedTaskId}.json`);
}

/**
 * Create a default shared state object
 * 
 * @param taskId - Unique task identifier
 * @param options - Task creation options
 * @returns Default shared state object
 * 
 * @example
 * ```typescript
 * const state = getDefaultState('task-123', {
 *   taskType: 'data-processing',
 *   priority: 'high',
 * });
 * ```
 */
export function getDefaultState(
  taskId: string,
  options: TaskCreateOptions = {}
): SharedTaskState {
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
    monitoringStatus: 'pending' as MonitoringStatus,
    lastCheckTime: now.getTime(),
    retryCount: 0,
    alerts: [],
  };
}

/**
 * Sanitize task ID to ensure it's safe for file names
 * 
 * @param taskId - Raw task identifier
 * @returns Sanitized task identifier
 */
export function sanitizeTaskId(taskId: string): string {
  // Remove or replace unsafe characters
  return taskId
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .substring(0, 255); // Limit length for file system compatibility
}

/**
 * Validate a shared state object
 * 
 * @param state - State object to validate
 * @returns True if valid, false otherwise
 */
export function isValidSharedState(state: any): state is SharedTaskState {
  if (!state || typeof state !== 'object') {
    return false;
  }

  // Check required fields
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

  // Validate version format
  if (typeof state.version !== 'string' || !state.version.match(/^\d+\.\d+\.\d+$/)) {
    return false;
  }

  // Validate monitoring status
  const validStatuses: MonitoringStatus[] = [
    'pending',
    'active',
    'timeout',
    'stalled',
    'completed',
  ];
  if (!validStatuses.includes(state.monitoringStatus)) {
    return false;
  }

  // Validate timestamps
  if (typeof state.lastCheckTime !== 'number' || state.lastCheckTime < 0) {
    return false;
  }

  // Validate retry count
  if (typeof state.retryCount !== 'number' || state.retryCount < 0) {
    return false;
  }

  // Validate alerts array
  if (!Array.isArray(state.alerts)) {
    return false;
  }

  return true;
}

/**
 * Create an alert record
 * 
 * @param type - Alert type
 * @param message - Alert message
 * @param details - Optional additional details
 * @returns Alert record object
 */
export function createAlert(
  type: AlertRecord['type'],
  message: string,
  details?: Record<string, any>
): AlertRecord {
  return {
    timestamp: Date.now(),
    type,
    message,
    details,
  };
}

/**
 * Update monitoring status
 * 
 * @param state - Current state
 * @param newStatus - New monitoring status
 * @param alert - Optional alert to add
 * @returns Updated state object
 */
export function updateMonitoringStatus(
  state: SharedTaskState,
  newStatus: MonitoringStatus,
  alert?: AlertRecord
): SharedTaskState {
  return {
    ...state,
    monitoringStatus: newStatus,
    lastCheckTime: Date.now(),
    alerts: alert ? [...state.alerts, alert] : state.alerts,
  };
}

/**
 * Increment retry count
 * 
 * @param state - Current state
 * @returns Updated state object with incremented retry count
 */
export function incrementRetryCount(state: SharedTaskState): SharedTaskState {
  return {
    ...state,
    retryCount: state.retryCount + 1,
    lastCheckTime: Date.now(),
  };
}

/**
 * Get state file metadata
 * 
 * @param taskId - Task identifier
 * @returns Metadata about the state file
 */
export function getStateFileMetadata(taskId: string): StateFileMetadata {
  const statePath = getSharedStatePath(taskId);
  
  return {
    path: statePath,
    exists: false, // Will be set by actual file system check
  };
}

/**
 * Migrate state from an older version to current version
 * 
 * @param state - State from older version
 * @returns Migrated state
 */
export function migrateState(state: any): SharedTaskState {
  // Version 1.0.0 - no migration needed yet
  // Future versions will handle migrations here
  
  if (state.version === '1.0.0') {
    return state as SharedTaskState;
  }

  // Handle future version migrations
  // Example:
  // if (state.version === '1.0.0') {
  //   state.version = '1.1.0';
  //   state.newField = 'default';
  // }

  throw new Error(`Unknown state version: ${state.version}`);
}
