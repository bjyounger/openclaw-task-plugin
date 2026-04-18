/**
 * Shared Task State Types
 * 
 * This module defines the types for shared state between task-plugin-v3 and task-monitor-v14.
 * 
 * @module task-plugin-v3/core/shared/types
 * @version 1.0.0
 */

/**
 * Task creation options passed from v3
 */
export interface TaskCreateOptions {
  taskType?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  timeout?: number;
  maxRetries?: number;
  tags?: string[];
  context?: Record<string, any>;
  [key: string]: any; // Allow additional properties
}

/**
 * Monitoring status enum
 * - pending: Task created, monitoring not yet started
 * - active: Monitoring in progress
 * - timeout: Task exceeded timeout limit
 * - stalled: Task stalled (no progress for extended period)
 * - completed: Task completed (success or failure)
 */
export type MonitoringStatus =
  | 'pending'
  | 'active'
  | 'timeout'
  | 'stalled'
  | 'completed';

/**
 * Alert type enum
 */
export type AlertType =
  | 'timeout'
  | 'stalled'
  | 'error'
  | 'warning'
  | 'info';

/**
 * Alert record structure
 */
export interface AlertRecord {
  timestamp: number;
  type: AlertType;
  message: string;
  details?: Record<string, any>;
}

/**
 * Main shared task state interface
 * 
 * This is the primary data structure for coordination between
 * task-plugin-v3 and task-monitor-v14.
 * 
 * @example
 * ```typescript
 * const state: SharedTaskState = {
 *   version: '1.0.0',
 *   taskId: 'task-123',
 *   createdBy: 'v3',
 *   createdAt: new Date().toISOString(),
 *   createOptions: {
 *     taskType: 'data-processing',
 *     priority: 'high',
 *     timeout: 60000,
 *   },
 *   monitoringStatus: 'pending',
 *   lastCheckTime: Date.now(),
 *   retryCount: 0,
 *   alerts: [],
 *   metadata: {
 *     description: 'Process monthly reports',
 *   },
 * };
 * ```
 */
export interface SharedTaskState {
  /** Schema version for compatibility checks */
  version: string;
  
  /** Unique task identifier */
  taskId: string;
  
  /** Creator identifier ('v3', 'v14', or 'manual') */
  createdBy: 'v3' | 'v14' | 'manual';
  
  /** Task creation time in ISO 8601 format */
  createdAt: string;
  
  /** Options passed during task creation (v3 writes this) */
  createOptions: TaskCreateOptions;
  
  /** Current monitoring status */
  monitoringStatus: MonitoringStatus;
  
  /** Last monitoring check timestamp (Unix epoch in milliseconds) */
  lastCheckTime: number;
  
  /** Number of retry attempts */
  retryCount: number;
  
  /** Alert records from monitoring */
  alerts: AlertRecord[];
  
  /** Optional metadata for extensibility */
  metadata?: Record<string, any>;
}

/**
 * State transition result
 */
export interface StateTransitionResult {
  success: boolean;
  previousState?: MonitoringStatus;
  newState: MonitoringStatus;
  error?: string;
}

/**
 * Monitoring config for v14
 */
export interface MonitoringConfig {
  checkInterval?: number;
  staleThreshold?: number;
  timeoutThreshold?: number;
  maxRetries?: number;
  enableAlerts?: boolean;
}

/**
 * State file metadata
 */
export interface StateFileMetadata {
  path: string;
  exists: boolean;
  lastModified?: number;
  size?: number;
}
