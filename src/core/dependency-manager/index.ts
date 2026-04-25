/**
 * DependencyManager - 模块入口
 *
 * 导出所有公开接口和类型
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

// 导出类型定义
export type {
  TaskDependency,
  DependencyState,
  DependencyItemStatus,
  DependencyItemDetail,
  DependencyEvents,
  DependencyEventType,
  DependencyHistoryEntry,
  DependencyGraph,
  DependencyGraphNode,
  DependencyGraphEdge,
  DependencyResolveResult,
  IDependencyStore,
  CycleDetectedError,
  DependencyRegisteredEvent,
  DependencyResolvedEvent,
  DependencyFailedEvent,
  DependencyTimeoutEvent,
  DependencyReadyEvent,
  DependencyBlockedEvent,
  DependencyUnregisteredEvent,
  DependencyTriggeredEvent,
} from './types';

// 导出核心类
export { DependencyManager, DependencyResolver, TimeoutRegistry } from './dependency-manager';

// 导出存储实现
export { InMemoryDependencyStore } from './dependency-store';

// 导出事件监听器
export {
  DependencyEventListener,
  DependencyEventListenerConfig,
  EventConversionRecord,
} from './dependency-event-listener';