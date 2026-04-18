/**
 * Shared State Module Index
 * 
 * Export all types and utilities for convenient imports.
 * 
 * @example
 * ```typescript
 * import { 
 *   SharedTaskState, 
 *   getDefaultState,
 *   getSharedStatePath 
 * } from './core/shared';
 * ```
 */

// Export types
export {
  SharedTaskState,
  TaskCreateOptions,
  MonitoringStatus,
  AlertType,
  AlertRecord,
  StateTransitionResult,
  MonitoringConfig,
  StateFileMetadata,
} from './types';

// Export utilities
export {
  getSharedStateDir,
  getSharedStatePath,
  getDefaultState,
  sanitizeTaskId,
  isValidSharedState,
  createAlert,
  updateMonitoringStatus,
  incrementRetryCount,
  getStateFileMetadata,
  migrateState,
} from './utils';

// Export examples (for documentation/testing)
export {
  example1_createTaskState,
  example2_readState,
  example3_updateStatus,
  example4_handleTimeout,
  example5_taskCompletion,
  example6_validation,
  example7_paths,
  runAllExamples,
} from './examples';
