/**
 * 事件发射器 - 简化实现
 * 
 * 提供类型安全的事件订阅和发射功能
 * 
 * @version 3.0.0
 */

/**
 * 事件监听器类型
 */
type EventListener<T = any> = (payload: T) => void;

/**
 * 事件映射类型
 */
type EventMap = Record<string, any>;

/**
 * 事件发射器
 */
export class EventEmitter<TEvents extends EventMap = EventMap> {
  private listeners: Map<keyof TEvents, Set<EventListener>> = new Map();

  /**
   * 订阅事件
   * @returns 取消订阅函数
   */
  on<K extends keyof TEvents>(
    eventType: K,
    listener: EventListener<TEvents[K]>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add(listener);
    
    // 返回取消订阅函数
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * 订阅一次性事件
   */
  once<K extends keyof TEvents>(
    eventType: K,
    listener: EventListener<TEvents[K]>
  ): () => void {
    const onceListener: EventListener<TEvents[K]> = (payload) => {
      listener(payload);
      this.off(eventType, onceListener);
    };
    
    return this.on(eventType, onceListener);
  }

  /**
   * 取消订阅
   */
  off<K extends keyof TEvents>(
    eventType: K,
    listener: EventListener<TEvents[K]>
  ): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /**
   * 发射事件
   */
  emit<K extends keyof TEvents>(
    eventType: K,
    payload: TEvents[K]
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(payload);
        } catch (error) {
          console.error(`Error in event listener for ${String(eventType)}:`, error);
        }
      });
    }
  }

  /**
   * 清除所有监听器
   */
  clearAll(): void {
    this.listeners.clear();
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(eventType: keyof TEvents): number {
    return this.listeners.get(eventType)?.size || 0;
  }
}
