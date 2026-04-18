/**
 * OpenClaw Task Plugin v3.0 - Events Module Index
 * 
 * 事件系统模块导出
 * 
 * @version 3.0.0
 */

// 导出事件管理器
export { EventManager } from './event-manager';
export type { EventListenerConfig, EventStats } from './event-manager';

// 导出事件类型定义
export {
  TaskCreatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  SubTaskCreatedEvent,
  SubTaskCompletedEvent,
  HealthCheckEvent,
  HealthIssueEvent,
  OperationErrorEvent,
  TimeoutErrorEvent,
  FailureAnalysis,
  HealthCheckResult,
  HealthIssue,
  TaskRunView,
  TaskManagerEvents,
  TaskManagerEventData,
  EventType,
  EventTypes,
} from './event-types';