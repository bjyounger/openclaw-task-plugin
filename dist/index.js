"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AccessControl: () => AccessControl,
  AuditLogger: () => AuditLogger,
  DataEncryptor: () => DataEncryptor,
  EnhancedTaskError: () => EnhancedTaskError,
  OPENCLAW_MIN_VERSION: () => OPENCLAW_MIN_VERSION,
  OpenClawBridge: () => OpenClawBridge,
  SecurityManager: () => SecurityManager,
  SessionTaskManager: () => SessionTaskManager,
  SessionTaskManagerError: () => SessionTaskManagerError,
  TaskOperationError: () => TaskOperationError,
  VERSION: () => VERSION,
  checkOpenClawVersion: () => checkOpenClawVersion,
  createBridge: () => createBridge,
  isTaskRuntime: () => isTaskRuntime,
  isTaskStatus: () => isTaskStatus
});
module.exports = __toCommonJS(index_exports);

// src/core/types.ts
var TaskOperationError = class extends Error {
  constructor(code, message, context) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = "TaskOperationError";
  }
};
var EnhancedTaskError = class extends TaskOperationError {
  constructor(code, message, timestamp, stackTrace, relatedErrors, context) {
    super(code, message, context);
    this.timestamp = timestamp;
    this.stackTrace = stackTrace;
    this.relatedErrors = relatedErrors;
    this.name = "EnhancedTaskError";
  }
  getUserMessage() {
    return `${this.message} (Code: ${this.code})`;
  }
};

// src/core/bridge.ts
var OpenClawBridge = class _OpenClawBridge {
  constructor(config) {
    // 绑定后的运行时实例
    this.boundTaskFlow = null;
    this.boundTaskRuns = null;
    this.api = config.api;
    this.sessionKey = config.sessionKey;
    this.deliveryContext = config.deliveryContext;
  }
  /**
   * 从工具上下文创建Bridge实例
   * 
   * ✅ 正确的会话绑定方式
   */
  static fromToolContext(ctx) {
    return new _OpenClawBridge({
      api: ctx.api,
      sessionKey: ctx.sessionKey,
      deliveryContext: ctx.deliveryContext
    });
  }
  /**
   * 显式绑定会话
   */
  bindSession(sessionKey, deliveryContext) {
    this.sessionKey = sessionKey;
    this.deliveryContext = deliveryContext;
    this.boundTaskFlow = null;
    this.boundTaskRuns = null;
  }
  /**
   * 获取绑定的TaskFlow运行时
   * 
   * ✅ 使用正确的API路径：runtime.taskFlow
   */
  getBoundTaskFlow() {
    if (!this.boundTaskFlow) {
      this.boundTaskFlow = this.api.runtime.taskFlow.fromToolContext({
        sessionKey: this.sessionKey,
        deliveryContext: this.deliveryContext,
        api: this.api
      });
    }
    return this.boundTaskFlow;
  }
  /**
   * 获取绑定的TaskRuns运行时
   * 
   * ✅ 使用 runtime.tasks.runs
   */
  getBoundTaskRuns() {
    if (!this.boundTaskRuns) {
      this.boundTaskRuns = this.api.runtime.tasks.runs.fromToolContext({
        sessionKey: this.sessionKey,
        deliveryContext: this.deliveryContext,
        api: this.api
      });
    }
    return this.boundTaskRuns;
  }
  // ==================== Task Operations ====================
  /**
   * 创建任务
   */
  async createTask(params) {
    try {
      const taskFlow = this.getBoundTaskFlow();
      const flow = await taskFlow.create({
        name: params.title,
        tasks: [params],
        metadata: params.metadata
      });
      const tasks = await taskFlow.get(flow.flowId);
      if (!tasks || !tasks.tasks || tasks.tasks.length === 0) {
        throw new TaskOperationError(
          "TASK_CREATION_FAILED",
          "Failed to create task"
        );
      }
      return {
        taskId: tasks.tasks[0].taskId,
        flowId: flow.flowId,
        status: tasks.tasks[0].status,
        createdAt: tasks.tasks[0].createdAt
      };
    } catch (error) {
      throw new TaskOperationError(
        "TASK_CREATION_ERROR",
        `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        { params, originalError: error }
      );
    }
  }
  /**
   * 获取任务详情
   */
  async getTask(taskId) {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.get(taskId);
    } catch (error) {
      throw new TaskOperationError(
        "TASK_GET_ERROR",
        `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
        { taskId }
      );
    }
  }
  /**
   * 查询任务列表
   * 
   * ✅ 正确实现：list()不接受filter参数
   */
  async listTasks() {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.list();
    } catch (error) {
      throw new TaskOperationError(
        "TASK_LIST_ERROR",
        `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
        { sessionKey: this.sessionKey }
      );
    }
  }
  /**
   * 查询任务（客户端过滤）
   * 
   * 由于OpenClaw API的list()不接受filter参数，
   * 我们在客户端实现过滤功能
   */
  async queryTasks(filter) {
    const allTasks = await this.listTasks();
    let filtered = allTasks;
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter((task) => statuses.includes(task.status));
    }
    if (filter?.runtime) {
      const runtimes = Array.isArray(filter.runtime) ? filter.runtime : [filter.runtime];
      filtered = filtered.filter((task) => runtimes.includes(task.runtime));
    }
    if (filter?.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    return filtered;
  }
  /**
   * 取消任务
   */
  async cancelTask(taskId, reason) {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.cancel(taskId, reason);
    } catch (error) {
      throw new TaskOperationError(
        "TASK_CANCEL_ERROR",
        `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
        { taskId, reason }
      );
    }
  }
  /**
   * 查找最新任务
   */
  async findLatestTask() {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.findLatest();
    } catch (error) {
      throw new TaskOperationError(
        "TASK_FIND_LATEST_ERROR",
        `Failed to find latest task: ${error instanceof Error ? error.message : String(error)}`,
        { sessionKey: this.sessionKey }
      );
    }
  }
  // ==================== TaskFlow Operations ====================
  /**
   * 创建任务流
   */
  async createTaskFlow(definition) {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.create(definition);
    } catch (error) {
      throw new TaskOperationError(
        "TASKFLOW_CREATION_ERROR",
        `Failed to create task flow: ${error instanceof Error ? error.message : String(error)}`,
        { definition }
      );
    }
  }
  /**
   * 获取任务流详情
   */
  async getTaskFlow(flowId) {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.get(flowId);
    } catch (error) {
      throw new TaskOperationError(
        "TASKFLOW_GET_ERROR",
        `Failed to get task flow: ${error instanceof Error ? error.message : String(error)}`,
        { flowId }
      );
    }
  }
  /**
   * 查询任务流列表
   */
  async listTaskFlows() {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.list();
    } catch (error) {
      throw new TaskOperationError(
        "TASKFLOW_LIST_ERROR",
        `Failed to list task flows: ${error instanceof Error ? error.message : String(error)}`,
        { sessionKey: this.sessionKey }
      );
    }
  }
  /**
   * 取消任务流
   */
  async cancelTaskFlow(flowId, reason) {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.cancel(flowId, reason);
    } catch (error) {
      throw new TaskOperationError(
        "TASKFLOW_CANCEL_ERROR",
        `Failed to cancel task flow: ${error instanceof Error ? error.message : String(error)}`,
        { flowId, reason }
      );
    }
  }
  // ==================== Utility Methods ====================
  /**
   * 检查API可用性
   */
  checkApiAvailability() {
    return {
      taskFlow: !!this.api.runtime?.taskFlow?.fromToolContext,
      tasks: !!this.api.runtime?.tasks?.runs?.fromToolContext,
      events: !!this.api.runtime?.events,
      subagent: !!this.api.runtime?.subagent
    };
  }
  /**
   * 获取会话信息
   */
  getSessionInfo() {
    return {
      sessionKey: this.sessionKey,
      deliveryContext: this.deliveryContext
    };
  }
};

// src/core/managers/types.ts
var SessionTaskManagerError = class extends TaskOperationError {
  constructor(code, message, context) {
    super(code, message, context);
    this.name = "SessionTaskManagerError";
  }
  /**
   * 获取用户友好消息
   */
  getUserMessage() {
    const messages = {
      NOT_INITIALIZED: "\u7BA1\u7406\u5668\u672A\u521D\u59CB\u5316",
      ALREADY_INITIALIZED: "\u7BA1\u7406\u5668\u5DF2\u521D\u59CB\u5316",
      DESTROYED: "\u7BA1\u7406\u5668\u5DF2\u9500\u6BC1",
      API_NOT_AVAILABLE: "API\u4E0D\u53EF\u7528",
      TASK_NOT_FOUND: "\u4EFB\u52A1\u4E0D\u5B58\u5728",
      FLOW_NOT_FOUND: "\u4EFB\u52A1\u6D41\u4E0D\u5B58\u5728",
      PARENT_FLOW_NOT_FOUND: "\u7236\u4EFB\u52A1\u6D41\u4E0D\u5B58\u5728",
      TASK_CREATION_FAILED: "\u4EFB\u52A1\u521B\u5EFA\u5931\u8D25",
      CANCEL_FAILED: "\u4EFB\u52A1\u53D6\u6D88\u5931\u8D25",
      INVALID_PARAMS: "\u53C2\u6570\u65E0\u6548",
      WORKFLOW_NOT_INITIALIZED: "\u5DE5\u4F5C\u6D41\u5F15\u64CE\u672A\u521D\u59CB\u5316",
      WORKFLOW_EXECUTION_FAILED: "\u5DE5\u4F5C\u6D41\u6267\u884C\u5931\u8D25",
      DEPENDENCY_NOT_INITIALIZED: "\u4F9D\u8D56\u7BA1\u7406\u5668\u672A\u521D\u59CB\u5316",
      DEPENDENCY_CYCLE_DETECTED: "\u68C0\u6D4B\u5230\u5FAA\u73AF\u4F9D\u8D56",
      DEPENDENCY_REGISTER_FAILED: "\u4F9D\u8D56\u6CE8\u518C\u5931\u8D25"
    };
    return messages[this.code] || this.message;
  }
};
function isTaskStatus(value) {
  const validStatuses = [
    "pending",
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
    "lost"
  ];
  return validStatuses.includes(value);
}
function isTaskRuntime(value) {
  const validRuntimes = ["subagent", "acp", "agent"];
  return validRuntimes.includes(value);
}

// src/core/managers/event-emitter.ts
var EventEmitter = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  /**
   * 订阅事件
   * @returns 取消订阅函数
   */
  on(eventType, listener) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, /* @__PURE__ */ new Set());
    }
    this.listeners.get(eventType).add(listener);
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }
  /**
   * 订阅一次性事件
   */
  once(eventType, listener) {
    const onceListener = (payload) => {
      listener(payload);
      this.off(eventType, onceListener);
    };
    return this.on(eventType, onceListener);
  }
  /**
   * 取消订阅
   */
  off(eventType, listener) {
    this.listeners.get(eventType)?.delete(listener);
  }
  /**
   * 发射事件
   */
  emit(eventType, payload) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
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
  clearAll() {
    this.listeners.clear();
  }
  /**
   * 获取事件监听器数量
   */
  listenerCount(eventType) {
    return this.listeners.get(eventType)?.size || 0;
  }
};

// src/core/workflow/topological-sorter.ts
var CycleDetectedError = class extends Error {
  constructor(cycles) {
    super(`Workflow contains ${cycles.length} cycle(s). DAG required.`);
    this.cycles = cycles;
    this.name = "CycleDetectedError";
  }
};
var TopologicalSorter = class {
  /**
   * 拓扑排序（Kahn 算法）
   * 返回节点的执行顺序
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 拓扑排序后的节点 ID 数组
   * @throws CycleDetectedError 如果存在环
   */
  sort(nodes, connections) {
    const graph = /* @__PURE__ */ new Map();
    const inDegree = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      graph.set(node.id, []);
      inDegree.set(node.id, 0);
    }
    for (const conn of connections) {
      const neighbors = graph.get(conn.source);
      if (neighbors) {
        neighbors.push(conn.target);
      }
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
    }
    const queue = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    const result = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      result.push(nodeId);
      for (const neighbor of graph.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
    if (result.length !== nodes.length) {
      const cycle = this.detectCycle(nodes, connections);
      throw new CycleDetectedError(cycle);
    }
    return result;
  }
  /**
   * 获取可并行执行的节点层级
   * 返回二维数组，每一层可以并行执行
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 层级数组，每层包含可并行执行的节点 ID
   * @throws CycleDetectedError 如果存在环
   */
  getExecutionLevels(nodes, connections) {
    const levels = [];
    const completed = /* @__PURE__ */ new Set();
    const remaining = new Set(nodes.map((n) => n.id));
    const dependencies = this.buildDependencyMap(connections);
    while (remaining.size > 0) {
      const readyNodes = [];
      for (const nodeId of remaining) {
        const deps = dependencies.get(nodeId) || [];
        if (deps.every((d) => completed.has(d))) {
          readyNodes.push(nodeId);
        }
      }
      if (readyNodes.length === 0) {
        const cycle = this.detectCycle(nodes, connections);
        throw new CycleDetectedError(cycle);
      }
      levels.push(readyNodes);
      readyNodes.forEach((n) => {
        completed.add(n);
        remaining.delete(n);
      });
    }
    return levels;
  }
  /**
   * DFS 检测环
   * 返回所有检测到的环路径
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 环路径数组
   */
  detectCycle(nodes, connections) {
    const graph = this.buildGraph(nodes, connections);
    const visited = /* @__PURE__ */ new Set();
    const recursionStack = /* @__PURE__ */ new Set();
    const cycles = [];
    const dfs = (nodeId, path3) => {
      if (recursionStack.has(nodeId)) {
        const cycleStart = path3.indexOf(nodeId);
        if (cycleStart >= 0) {
          cycles.push(path3.slice(cycleStart));
        }
        return true;
      }
      if (visited.has(nodeId)) {
        return false;
      }
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path3.push(nodeId);
      for (const neighbor of graph.get(nodeId) || []) {
        dfs(neighbor, [...path3]);
      }
      recursionStack.delete(nodeId);
      return false;
    };
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }
    return cycles;
  }
  /**
   * 构建邻接表
   */
  buildGraph(nodes, connections) {
    const graph = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      graph.set(node.id, []);
    }
    for (const conn of connections) {
      const neighbors = graph.get(conn.source);
      if (neighbors) {
        neighbors.push(conn.target);
      }
    }
    return graph;
  }
  /**
   * 构建依赖映射（反向图）
   * 返回每个节点的所有依赖节点
   */
  buildDependencyMap(connections) {
    const dependencies = /* @__PURE__ */ new Map();
    for (const conn of connections) {
      if (!dependencies.has(conn.target)) {
        dependencies.set(conn.target, []);
      }
      dependencies.get(conn.target).push(conn.source);
    }
    return dependencies;
  }
  /**
   * 获取节点的直接依赖
   *
   * @param nodeId 节点 ID
   * @param connections 连接列表
   * @returns 依赖节点 ID 数组
   */
  getDependencies(nodeId, connections) {
    const dependencies = [];
    for (const conn of connections) {
      if (conn.target === nodeId) {
        dependencies.push(conn.source);
      }
    }
    return dependencies;
  }
  /**
   * 获取节点的直接后继
   *
   * @param nodeId 节点 ID
   * @param connections 连接列表
   * @returns 后继节点 ID 数组
   */
  getSuccessors(nodeId, connections) {
    const successors = [];
    for (const conn of connections) {
      if (conn.source === nodeId) {
        successors.push(conn.target);
      }
    }
    return successors;
  }
  /**
   * 验证工作流是否为 DAG
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 是否为 DAG
   */
  isDAG(nodes, connections) {
    try {
      this.sort(nodes, connections);
      return true;
    } catch (error) {
      if (error instanceof CycleDetectedError) {
        return false;
      }
      throw error;
    }
  }
  /**
   * 获取所有起始节点（入度为 0）
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 起始节点 ID 数组
   */
  getStartNodes(nodes, connections) {
    const inDegree = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      inDegree.set(node.id, 0);
    }
    for (const conn of connections) {
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
    }
    const startNodes = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        startNodes.push(nodeId);
      }
    }
    return startNodes;
  }
  /**
   * 获取所有终止节点（出度为 0）
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 终止节点 ID 数组
   */
  getEndNodes(nodes, connections) {
    const outDegree = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      outDegree.set(node.id, 0);
    }
    for (const conn of connections) {
      outDegree.set(conn.source, (outDegree.get(conn.source) || 0) + 1);
    }
    const endNodes = [];
    for (const [nodeId, degree] of outDegree) {
      if (degree === 0) {
        endNodes.push(nodeId);
      }
    }
    return endNodes;
  }
};

// src/core/workflow/node-registry.ts
var BUILT_IN_NODE_TYPES = {
  TASK: "task",
  CONDITION: "condition",
  PARALLEL: "parallel",
  SUBFLOW: "subflow"
};
var taskNodeFactory = (node) => {
  return async (input, context) => {
    const startTime = (/* @__PURE__ */ new Date()).toISOString();
    try {
      context.log("info", `Executing task node: ${node.name}`, { nodeId: node.id });
      const output = {
        nodeId: node.id,
        executionId: context.executionId,
        data: input.data || {},
        status: "success",
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
      return output;
    } catch (error) {
      const nodeError = {
        code: "TASK_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : void 0,
        retryable: true
      };
      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: "failure",
        error: nodeError,
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
    }
  };
};
var conditionNodeFactory = (node) => {
  return async (input, context) => {
    const startTime = (/* @__PURE__ */ new Date()).toISOString();
    try {
      context.log("info", `Evaluating condition node: ${node.name}`, { nodeId: node.id });
      const condition = node.condition;
      let result = true;
      if (condition) {
        switch (condition.type) {
          case "javascript":
            result = true;
            break;
          case "jsonata":
            result = true;
            break;
          case "simple":
            result = true;
            break;
        }
      }
      const output = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { conditionResult: result },
        status: "success",
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
      return output;
    } catch (error) {
      const nodeError = {
        code: "CONDITION_EVALUATION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : void 0,
        retryable: false
      };
      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: "failure",
        error: nodeError,
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
    }
  };
};
var parallelNodeFactory = (node) => {
  return async (input, context) => {
    const startTime = (/* @__PURE__ */ new Date()).toISOString();
    try {
      context.log("info", `Executing parallel node: ${node.name}`, { nodeId: node.id });
      const output = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { parallelResults: [] },
        status: "success",
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
      return output;
    } catch (error) {
      const nodeError = {
        code: "PARALLEL_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : void 0,
        retryable: true
      };
      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: "failure",
        error: nodeError,
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
    }
  };
};
var subflowNodeFactory = (node) => {
  return async (input, context) => {
    const startTime = (/* @__PURE__ */ new Date()).toISOString();
    try {
      context.log("info", `Executing subflow node: ${node.name}`, { nodeId: node.id });
      const output = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { subflowResult: {} },
        status: "success",
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
      return output;
    } catch (error) {
      const nodeError = {
        code: "SUBFLOW_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : void 0,
        retryable: true
      };
      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: "failure",
        error: nodeError,
        startTime,
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - new Date(startTime).getTime()
      };
    }
  };
};
var NodeRegistry = class {
  /**
   * 创建节点注册中心实例
   * @param logger - 日志函数（可选）
   */
  constructor(logger) {
    this.registry = /* @__PURE__ */ new Map();
    this.logger = logger || ((level, message, data) => {
      console.log(`[${level.toUpperCase()}] ${message}`, data || "");
    });
    this.registerBuiltInNodes();
  }
  /**
   * 注册内置节点类型
   */
  registerBuiltInNodes() {
    this.register(BUILT_IN_NODE_TYPES.TASK, taskNodeFactory);
    this.register(BUILT_IN_NODE_TYPES.CONDITION, conditionNodeFactory);
    this.register(BUILT_IN_NODE_TYPES.PARALLEL, parallelNodeFactory);
    this.register(BUILT_IN_NODE_TYPES.SUBFLOW, subflowNodeFactory);
    this.updateInfo(BUILT_IN_NODE_TYPES.TASK, {
      displayName: "Task",
      description: "\u6267\u884C\u5355\u4E2A\u4EFB\u52A1",
      category: "action",
      builtIn: true
    });
    this.updateInfo(BUILT_IN_NODE_TYPES.CONDITION, {
      displayName: "Condition",
      description: "\u6839\u636E\u6761\u4EF6\u9009\u62E9\u5206\u652F",
      category: "logic",
      builtIn: true
    });
    this.updateInfo(BUILT_IN_NODE_TYPES.PARALLEL, {
      displayName: "Parallel",
      description: "\u5E76\u884C\u6267\u884C\u591A\u4E2A\u4EFB\u52A1",
      category: "logic",
      builtIn: true
    });
    this.updateInfo(BUILT_IN_NODE_TYPES.SUBFLOW, {
      displayName: "Subflow",
      description: "\u6267\u884C\u5D4C\u5957\u5DE5\u4F5C\u6D41",
      category: "logic",
      builtIn: true
    });
  }
  /**
   * 注册节点类型
   *
   * @param type - 节点类型标识
   * @param factory - 节点工厂函数
   * @throws {Error} 如果类型标识为空或工厂不是函数
   */
  register(type, factory) {
    if (!type || type.trim() === "") {
      throw new Error("Node type cannot be empty");
    }
    if (typeof factory !== "function") {
      throw new Error("Node factory must be a function");
    }
    if (this.registry.has(type)) {
      this.logger("warn", `Node type "${type}" is already registered, overwriting`, { type });
    }
    const info = {
      type,
      displayName: type,
      builtIn: false
    };
    this.registry.set(type, { factory, info });
    this.logger("info", `Node type "${type}" registered successfully`, { type });
  }
  /**
   * 获取节点工厂
   *
   * @param type - 节点类型标识
   * @returns 节点工厂函数，如果不存在则返回 undefined
   */
  get(type) {
    const entry = this.registry.get(type);
    return entry?.factory;
  }
  /**
   * 列出所有已注册的节点类型
   *
   * @returns 节点类型信息数组
   */
  list() {
    return Array.from(this.registry.values()).map((entry) => entry.info);
  }
  /**
   * 检查节点类型是否已注册
   *
   * @param type - 节点类型标识
   * @returns 是否已注册
   */
  has(type) {
    return this.registry.has(type);
  }
  /**
   * 注销节点类型
   *
   * @param type - 节点类型标识
   * @returns 是否成功注销
   */
  unregister(type) {
    if (!this.registry.has(type)) {
      return false;
    }
    const deleted = this.registry.delete(type);
    if (deleted) {
      this.logger("info", `Node type "${type}" unregistered successfully`, { type });
    }
    return deleted;
  }
  /**
   * 获取节点类型信息
   *
   * @param type - 节点类型标识
   * @returns 节点类型信息，如果不存在则返回 undefined
   */
  getInfo(type) {
    const entry = this.registry.get(type);
    return entry?.info;
  }
  /**
   * 更新节点类型信息
   *
   * @param type - 节点类型标识
   * @param info - 部分节点类型信息
   * @returns 是否成功更新
   */
  updateInfo(type, info) {
    const entry = this.registry.get(type);
    if (!entry) {
      return false;
    }
    entry.info = { ...entry.info, ...info };
    this.logger("info", `Node type "${type}" info updated`, { type, info });
    return true;
  }
  /**
   * 清空所有注册的节点类型
   */
  clear() {
    this.registry.clear();
    this.logger("info", "All node types cleared");
  }
  /**
   * 获取已注册节点类型数量
   */
  get size() {
    return this.registry.size;
  }
};
var globalRegistry;
function getNodeRegistry() {
  if (!globalRegistry) {
    globalRegistry = new NodeRegistry();
  }
  return globalRegistry;
}

// src/core/workflow/execution-context.ts
var NodeContext = class {
  /**
   * 创建节点上下文实例
   */
  constructor(nodeId, executionId, workflowId, input, config, previousOutput, emitEvent, logFn) {
    this.nodeId = nodeId;
    this.executionId = executionId;
    this.workflowId = workflowId;
    this.input = input;
    this.config = config;
    this.previousOutput = previousOutput;
    this.emitEvent = emitEvent;
    this.logFn = logFn;
  }
  /**
   * 获取节点配置
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * 获取输入数据
   */
  getInput() {
    return this.input;
  }
  /**
   * 获取前一个节点的输出
   */
  getPreviousOutput() {
    return this.previousOutput;
  }
  /**
   * 记录日志
   */
  log(level, message, data) {
    this.logFn(level, message, {
      nodeId: this.nodeId,
      executionId: this.executionId,
      ...data
    });
  }
  /**
   * 发送事件
   */
  emit(event, data) {
    this.emitEvent(event, {
      nodeId: this.nodeId,
      executionId: this.executionId,
      ...data
    });
  }
};
var ExecutionContext = class {
  /**
   * 创建执行上下文实例
   */
  constructor(config) {
    this.executionId = config.executionId;
    this.workflowId = config.workflowId;
    this.input = config.input || {};
    this.timeout = config.timeout || 4 * 60 * 60 * 1e3;
    this.eventListener = config.eventListener;
    this.logger = config.logger || ((level, message, data) => {
      console.log(`[${level.toUpperCase()}] ${message}`, data || "");
    });
    this.startTime = Date.now();
    this.cancelled = false;
    this.nodeOutputs = /* @__PURE__ */ new Map();
    this.nodeExecutions = /* @__PURE__ */ new Map();
    this.state = {
      executionId: config.executionId,
      workflowId: config.workflowId,
      status: "pending",
      completedNodes: [],
      failedNodes: [],
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      variables: config.variables || {}
    };
  }
  /**
   * 获取执行状态
   */
  getState() {
    return { ...this.state };
  }
  /**
   * 更新执行状态
   */
  updateState(status, currentNodeId) {
    this.state.status = status;
    this.state.currentNodeId = currentNodeId;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      this.state.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    this.emit("workflow:state:changed", { status, currentNodeId });
    this.logger("info", `Workflow state updated`, { status, currentNodeId });
  }
  /**
   * 发送事件
   */
  emit(event, data) {
    if (this.eventListener) {
      this.eventListener(event, data);
    }
  }
  /**
   * 获取工作流输入
   */
  getInput() {
    return { ...this.input };
  }
  /**
   * 获取节点输出
   */
  getNodeOutput(nodeId) {
    return this.nodeOutputs.get(nodeId);
  }
  /**
   * 设置节点输出
   */
  setNodeOutput(nodeId, output) {
    this.nodeOutputs.set(nodeId, output);
    if (output.status === "success") {
      if (!this.state.completedNodes.includes(nodeId)) {
        this.state.completedNodes.push(nodeId);
      }
    } else if (output.status === "failure") {
      if (!this.state.failedNodes.includes(nodeId)) {
        this.state.failedNodes.push(nodeId);
      }
    }
    this.emit("node:output:created", { nodeId, output });
    this.logger("debug", `Node output set`, { nodeId, status: output.status });
  }
  /**
   * 获取节点执行状态
   */
  getNodeExecution(nodeId) {
    return this.nodeExecutions.get(nodeId);
  }
  /**
   * 更新节点执行状态
   */
  updateNodeExecution(nodeId, execution) {
    const existing = this.nodeExecutions.get(nodeId);
    if (existing) {
      this.nodeExecutions.set(nodeId, { ...existing, ...execution });
    } else {
      this.nodeExecutions.set(nodeId, {
        nodeId,
        status: execution.status || "pending",
        ...execution
      });
    }
    this.emit("node:state:changed", { nodeId, execution });
  }
  /**
   * 创建节点上下文
   */
  createNodeContext(nodeId, input, config) {
    const previousNodeId = this.getPreviousNodeId(nodeId);
    const previousOutput = previousNodeId ? this.nodeOutputs.get(previousNodeId) : void 0;
    return new NodeContext(
      nodeId,
      this.executionId,
      this.workflowId,
      input,
      config || {},
      previousOutput,
      this.emit.bind(this),
      this.logger
    );
  }
  /**
   * 获取前一个节点 ID
   * 简化实现：返回最后一个完成的节点
   */
  getPreviousNodeId(nodeId) {
    const completedCount = this.state.completedNodes.length;
    if (completedCount === 0) {
      return void 0;
    }
    return this.state.completedNodes[completedCount - 1];
  }
  /**
   * 检查是否已取消
   */
  isCancelled() {
    return this.cancelled;
  }
  /**
   * 取消执行
   */
  cancel(reason) {
    this.cancelled = true;
    this.cancelReason = reason || "User cancelled";
    this.updateState("cancelled");
    this.emit("workflow:cancelled", { reason: this.cancelReason });
    this.logger("warn", `Workflow cancelled`, { reason: this.cancelReason });
  }
  /**
   * 获取取消原因
   */
  getCancelReason() {
    return this.cancelReason;
  }
  /**
   * 检查是否超时
   */
  isTimeout() {
    return Date.now() - this.startTime > this.timeout;
  }
  /**
   * 获取剩余时间（毫秒）
   */
  getRemainingTime() {
    return Math.max(0, this.timeout - (Date.now() - this.startTime));
  }
  /**
   * 设置变量
   */
  setVariable(key, value) {
    this.state.variables[key] = value;
    this.emit("variable:changed", { key, value });
  }
  /**
   * 获取变量
   */
  getVariable(key) {
    return this.state.variables[key];
  }
  /**
   * 获取所有变量
   */
  getVariables() {
    return { ...this.state.variables };
  }
  /**
   * 设置元数据
   */
  setMetadata(key, value) {
    if (!this.state.metadata) {
      this.state.metadata = {};
    }
    this.state.metadata[key] = value;
  }
  /**
   * 获取元数据
   */
  getMetadata(key) {
    return this.state.metadata?.[key];
  }
  /**
   * 序列化状态（用于持久化）
   */
  serialize() {
    const nodeStates = {};
    this.nodeExecutions.forEach((execution, nodeId) => {
      nodeStates[nodeId] = {
        status: execution.status,
        output: execution.output?.data,
        error: execution.error?.message,
        retryCount: execution.retryCount
      };
    });
    return {
      executionId: this.executionId,
      workflowId: this.workflowId,
      status: this.state.status,
      serializedState: {
        nodeStates,
        variables: this.state.variables,
        checkpoint: (/* @__PURE__ */ new Date()).toISOString()
      },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * 从序列化状态恢复
   */
  deserialize(state) {
    if (state.executionId !== this.executionId) {
      throw new Error(`Execution ID mismatch: expected ${this.executionId}, got ${state.executionId}`);
    }
    if (state.workflowId !== this.workflowId) {
      throw new Error(`Workflow ID mismatch: expected ${this.workflowId}, got ${state.workflowId}`);
    }
    this.state.status = state.status;
    this.state.variables = state.serializedState.variables;
    const nodeStates = state.serializedState.nodeStates;
    Object.entries(nodeStates).forEach(([nodeId, nodeState]) => {
      this.nodeExecutions.set(nodeId, {
        nodeId,
        status: nodeState.status,
        output: nodeState.output ? {
          nodeId,
          executionId: this.executionId,
          data: nodeState.output,
          status: nodeState.status === "success" ? "success" : "failure",
          startTime: state.updatedAt,
          endTime: state.updatedAt,
          duration: 0
        } : void 0,
        error: nodeState.error ? {
          code: "RESTORED_ERROR",
          message: nodeState.error,
          retryable: false
        } : void 0,
        retryCount: nodeState.retryCount
      });
      if (nodeState.status === "success") {
        this.state.completedNodes.push(nodeId);
      } else if (nodeState.status === "failure") {
        this.state.failedNodes.push(nodeId);
      }
    });
    this.emit("workflow:restored", { state });
    this.logger("info", `Workflow state restored`, { executionId: this.executionId });
  }
  /**
   * 记录错误
   */
  recordError(error) {
    this.state.status = "failed";
    this.state.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.emit("workflow:failed", { error });
    this.logger("error", `Workflow failed`, { error });
  }
  /**
   * 获取所有节点输出
   */
  getAllNodeOutputs() {
    return new Map(this.nodeOutputs);
  }
  /**
   * 获取执行统计信息
   */
  getStats() {
    return {
      totalNodes: this.nodeExecutions.size,
      completedNodes: this.state.completedNodes.length,
      failedNodes: this.state.failedNodes.length,
      pendingNodes: this.nodeExecutions.size - this.state.completedNodes.length - this.state.failedNodes.length,
      duration: Date.now() - this.startTime
    };
  }
};

// src/core/workflow/workflow-executor.ts
var WorkflowExecutor = class {
  /**
   * 创建工作流执行器实例
   *
   * @param nodeRegistry - 节点注册中心
   * @param topologicalSorter - 拓扑排序器
   */
  constructor(nodeRegistry, topologicalSorter) {
    this.nodeRegistry = nodeRegistry;
    this.topologicalSorter = topologicalSorter;
    this.runningExecutions = /* @__PURE__ */ new Map();
  }
  /**
   * 执行工作流
   *
   * 1. 使用 TopologicalSorter 获取执行层级
   * 2. BFS 按层级分组，同层节点并行执行
   * 3. 处理错误、超时、取消
   *
   * @param definition - 工作流定义
   * @param context - 执行上下文
   * @returns 工作流执行结果
   */
  async execute(definition, context) {
    const { nodes, connections } = definition;
    const abortController = new AbortController();
    this.runningExecutions.set(context.executionId, {
      context,
      abortController
    });
    try {
      const levels = this.topologicalSorter.getExecutionLevels(nodes, connections);
      const nodeMap = /* @__PURE__ */ new Map();
      for (const node of nodes) {
        nodeMap.set(node.id, node);
      }
      const connectionMap = this.buildConnectionMap(connections);
      context.updateState("running");
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        if (context.isCancelled()) {
          return this.buildCancelledResult(context);
        }
        if (context.isTimeout()) {
          context.updateState("timeout");
          return this.buildTimeoutResult(context);
        }
        const level = levels[levelIndex];
        const levelResults = await this.executeLevel(
          level,
          nodeMap,
          connectionMap,
          context,
          abortController
        );
        if (context.isTimeout()) {
          context.updateState("timeout");
          return this.buildTimeoutResult(context);
        }
        let shouldStop = false;
        for (const result of levelResults) {
          context.setNodeOutput(result.nodeId, result.output);
          if (result.output.status === "failure" && result.error) {
            const node = nodeMap.get(result.nodeId);
            const action = this.resolveErrorAction(node.onError, result.error);
            if (action === "stopWorkflow") {
              shouldStop = true;
              break;
            }
          }
        }
        if (shouldStop) {
          context.updateState("failed");
          return this.buildFailedResult(context, "Workflow stopped due to node error");
        }
      }
      context.updateState("completed");
      return this.buildSuccessResult(context);
    } finally {
      this.runningExecutions.delete(context.executionId);
    }
  }
  /**
   * 暂停执行
   *
   * @param executionId - 执行 ID
   */
  pause(executionId) {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (execution.pauseState && !execution.pauseState.resumed) {
      throw new Error(`Execution already paused: ${executionId}`);
    }
    execution.pauseState = {
      levelIndex: 0,
      completedInLevel: /* @__PURE__ */ new Set(),
      resumed: false,
      resolveResume: void 0
    };
    execution.context.updateState("paused");
  }
  /**
   * 恢复执行
   *
   * @param executionId - 执行 ID
   * @returns 工作流执行结果
   */
  async resume(executionId) {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (!execution.pauseState || execution.pauseState.resumed) {
      throw new Error(`Execution not paused: ${executionId}`);
    }
    execution.pauseState.resumed = true;
    execution.context.updateState("running");
    if (execution.pauseState.resolveResume) {
      execution.pauseState.resolveResume();
    }
    return this.buildSuccessResult(execution.context);
  }
  /**
   * 取消执行
   *
   * @param executionId - 执行 ID
   */
  cancel(executionId) {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    execution.context.cancel("User cancelled");
    if (execution.abortController) {
      execution.abortController.abort();
    }
    if (execution.pauseState && !execution.pauseState.resumed) {
      execution.pauseState.resumed = true;
      if (execution.pauseState.resolveResume) {
        execution.pauseState.resolveResume();
      }
    }
  }
  // ==================== Private Methods ====================
  /**
   * 执行一个层级的所有节点（并行）
   */
  async executeLevel(levelNodeIds, nodeMap, connectionMap, context, abortController) {
    await this.checkPause(context);
    const tasks = levelNodeIds.map(async (nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) {
        return this.createErrorResult(nodeId, context.executionId, "NODE_NOT_FOUND", `Node not found: ${nodeId}`);
      }
      if (context.isCancelled()) {
        return this.createSkippedResult(nodeId, context.executionId, "Execution cancelled");
      }
      if (context.isTimeout()) {
        return this.createSkippedResult(nodeId, context.executionId, "Execution timeout");
      }
      return this.executeNode(node, connectionMap, context, abortController);
    });
    const settled = await Promise.allSettled(tasks);
    const results = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        const error = result.reason;
        results.push({
          nodeId: "unknown",
          output: {
            nodeId: "unknown",
            executionId: context.executionId,
            data: {},
            status: "failure",
            error: {
              code: "UNHANDLED_ERROR",
              message: error.message,
              retryable: false
            },
            startTime: (/* @__PURE__ */ new Date()).toISOString(),
            endTime: (/* @__PURE__ */ new Date()).toISOString(),
            duration: 0
          },
          error
        });
      }
    }
    return results;
  }
  /**
   * 执行单个节点
   */
  async executeNode(node, connectionMap, context, abortController) {
    const startTime = /* @__PURE__ */ new Date();
    const factory = this.nodeRegistry.get(node.type);
    if (!factory) {
      return this.createErrorResult(
        node.id,
        context.executionId,
        "NODE_TYPE_NOT_REGISTERED",
        `Node type not registered: ${node.type}`
      );
    }
    const input = this.buildNodeInput(node.id, connectionMap, context);
    const nodeContext = context.createNodeContext(node.id, input, node.config);
    const handler = factory(node);
    try {
      const output = await this.executeWithRetry(
        node,
        handler,
        input,
        nodeContext,
        abortController
      );
      return { nodeId: node.id, output };
    } catch (error) {
      const err = error;
      const nodeError = {
        code: "NODE_EXECUTION_ERROR",
        message: err.message,
        stack: err.stack,
        retryable: true
      };
      const action = this.resolveErrorAction(node.onError, err);
      if (action === "continueErrorOutput") {
        const errorOutput = {
          nodeId: node.id,
          executionId: context.executionId,
          data: {},
          status: "failure",
          error: nodeError,
          startTime: startTime.toISOString(),
          endTime: (/* @__PURE__ */ new Date()).toISOString(),
          duration: Date.now() - startTime.getTime()
        };
        return { nodeId: node.id, output: errorOutput, error: err };
      }
      if (action === "continueRegularOutput") {
        const previousOutput = context.getNodeOutput(node.id);
        const regularOutput = {
          nodeId: node.id,
          executionId: context.executionId,
          data: previousOutput?.data || {},
          status: "success",
          startTime: startTime.toISOString(),
          endTime: (/* @__PURE__ */ new Date()).toISOString(),
          duration: Date.now() - startTime.getTime()
        };
        return { nodeId: node.id, output: regularOutput, error: err };
      }
      const stopOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: "failure",
        error: nodeError,
        startTime: startTime.toISOString(),
        endTime: (/* @__PURE__ */ new Date()).toISOString(),
        duration: Date.now() - startTime.getTime()
      };
      return { nodeId: node.id, output: stopOutput, error: err };
    }
  }
  /**
   * 带重试机制的节点执行
   */
  async executeWithRetry(node, handler, input, nodeContext, abortController) {
    const retryPolicy = node.retry || node.onError;
    const maxAttempts = this.getMaxAttempts(retryPolicy);
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (abortController.signal.aborted) {
        throw new Error("Execution aborted");
      }
      try {
        const output = await this.executeWithTimeout(
          handler,
          input,
          nodeContext,
          node.timeout
        );
        return output;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          const delay = this.calculateRetryDelay(retryPolicy, attempt);
          await this.sleep(delay);
        }
      }
    }
    throw lastError || new Error("Node execution failed after retries");
  }
  /**
   * 带超时的节点执行
   */
  async executeWithTimeout(handler, input, nodeContext, timeout) {
    if (!timeout) {
      return handler(input, nodeContext);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Node execution timeout after ${timeout}ms`));
      }, timeout);
      handler(input, nodeContext).then((output) => {
        clearTimeout(timer);
        resolve(output);
      }).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
  /**
   * 检查暂停状态，如果暂停则等待恢复
   */
  async checkPause(context) {
    const execution = this.runningExecutions.get(context.executionId);
    if (!execution || !execution.pauseState || execution.pauseState.resumed) {
      return;
    }
    await new Promise((resolve) => {
      if (execution.pauseState) {
        execution.pauseState.resolveResume = resolve;
      }
    });
  }
  /**
   * 构建连接映射（source → targets）
   */
  buildConnectionMap(connections) {
    const map = /* @__PURE__ */ new Map();
    for (const conn of connections) {
      const existing = map.get(conn.source) || [];
      existing.push(conn);
      map.set(conn.source, existing);
    }
    return map;
  }
  /**
   * 构建节点输入数据
   * 合并所有上游节点的输出作为当前节点的输入
   */
  buildNodeInput(nodeId, connectionMap, context) {
    const mergedData = {};
    let sourceNodeId;
    for (const [, conns] of connectionMap) {
      for (const conn of conns) {
        if (conn.target === nodeId) {
          const sourceOutput = context.getNodeOutput(conn.source);
          if (sourceOutput) {
            Object.assign(mergedData, sourceOutput.data);
            sourceNodeId = conn.source;
          }
        }
      }
    }
    if (Object.keys(mergedData).length === 0) {
      Object.assign(mergedData, context.getInput());
    }
    return {
      data: mergedData,
      sourceNodeId
    };
  }
  /**
   * 解析错误处理动作
   *
   * 将 ErrorHandlerConfig.strategy 映射到 n8n 风格的执行动作
   */
  resolveErrorAction(onError, error) {
    if (!onError) {
      return "stopWorkflow";
    }
    switch (onError.strategy) {
      case "skip":
        return "continueErrorOutput";
      case "fallback":
        return "continueRegularOutput";
      case "retry":
        return "stopWorkflow";
      case "abort":
      default:
        return "stopWorkflow";
    }
  }
  /**
   * 获取最大重试次数
   */
  getMaxAttempts(retryPolicy) {
    if (!retryPolicy) {
      return 1;
    }
    if ("maxAttempts" in retryPolicy) {
      return retryPolicy.maxAttempts;
    }
    if ("maxRetries" in retryPolicy && retryPolicy.maxRetries !== void 0) {
      return retryPolicy.maxRetries + 1;
    }
    return 1;
  }
  /**
   * 计算重试延迟
   */
  calculateRetryDelay(retryPolicy, attempt) {
    if (!retryPolicy || !("backoff" in retryPolicy)) {
      return 1e3;
    }
    const policy = retryPolicy;
    const initialDelay = policy.initialDelay || 1e3;
    switch (policy.backoff) {
      case "fixed":
        return initialDelay;
      case "linear":
        return initialDelay * attempt;
      case "exponential": {
        const multiplier = policy.multiplier || 2;
        const delay = initialDelay * Math.pow(multiplier, attempt - 1);
        return policy.maxDelay ? Math.min(delay, policy.maxDelay) : delay;
      }
      default:
        return initialDelay;
    }
  }
  /**
   * 创建错误结果
   */
  createErrorResult(nodeId, executionId, code, message) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const error = {
      code,
      message,
      retryable: false
    };
    return {
      nodeId,
      output: {
        nodeId,
        executionId,
        data: {},
        status: "failure",
        error,
        startTime: now,
        endTime: now,
        duration: 0
      },
      error: new Error(message)
    };
  }
  /**
   * 创建跳过结果
   */
  createSkippedResult(nodeId, executionId, reason) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      nodeId,
      output: {
        nodeId,
        executionId,
        data: {},
        status: "skipped",
        error: {
          code: "SKIPPED",
          message: reason,
          retryable: false
        },
        startTime: now,
        endTime: now,
        duration: 0
      }
    };
  }
  /**
   * 构建成功结果
   */
  buildSuccessResult(context) {
    return {
      status: "completed",
      results: context.getAllNodeOutputs(),
      errors: {}
    };
  }
  /**
   * 构建失败结果
   */
  buildFailedResult(context, message) {
    const errors = {};
    const outputs = context.getAllNodeOutputs();
    for (const [nodeId, output] of outputs) {
      if (output.status === "failure" && output.error) {
        errors[nodeId] = new Error(output.error.message);
      }
    }
    return {
      status: "failed",
      results: outputs,
      errors
    };
  }
  /**
   * 构建取消结果
   */
  buildCancelledResult(context) {
    return {
      status: "failed",
      results: context.getAllNodeOutputs(),
      errors: { _cancelled: new Error("Execution cancelled") }
    };
  }
  /**
   * 构建超时结果
   */
  buildTimeoutResult(context) {
    return {
      status: "failed",
      results: context.getAllNodeOutputs(),
      errors: { _timeout: new Error("Execution timeout") }
    };
  }
  /**
   * 休眠
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/core/workflow/workflow-integration.ts
var WorkflowIntegration = class {
  /**
   * 创建工作流集成服务实例
   */
  constructor(executor, memoryManager, eventManager, config) {
    this.executor = executor;
    this.memoryManager = memoryManager;
    this.eventManager = eventManager;
    this.nodeRegistry = config?.nodeRegistry || getNodeRegistry();
    this.topologicalSorter = new TopologicalSorter();
    this.config = {
      enableMemory: config?.enableMemory ?? true,
      enableEvents: config?.enableEvents ?? true,
      executionTimeout: config?.executionTimeout ?? 4 * 60 * 60 * 1e3,
      // 4小时
      queryKnowledgeBeforeExecution: config?.queryKnowledgeBeforeExecution ?? true,
      memoryPriority: config?.memoryPriority ?? "medium",
      nodeRegistry: this.nodeRegistry
    };
  }
  /**
   * 创建并执行工作流（完整流程）
   *
   * 流程：
   * 1. 触发 workflow:created 事件
   * 2. 查询相关知识（如果启用）
   * 3. 触发 workflow:started 事件
   * 4. 执行工作流
   * 5. 触发 workflow:completed 或 workflow:failed 事件
   * 6. 记录到记忆（如果启用）
   *
   * @param definition - 工作流定义
   * @param context - 执行上下文
   * @returns 工作流执行结果
   */
  async createAndExecute(definition, context) {
    const startTime = Date.now();
    this.emitLifecycleEvent("workflow:created", {
      workflowId: definition.id,
      workflowName: definition.name,
      timestamp: startTime,
      userId: context.userId,
      sessionId: context.sessionId
    });
    try {
      let relatedKnowledge = [];
      if (this.config.queryKnowledgeBeforeExecution && this.memoryManager) {
        relatedKnowledge = await this.queryKnowledge(definition.name);
        context.relatedKnowledge = relatedKnowledge;
      }
      this.emitLifecycleEvent("workflow:started", {
        workflowId: definition.id,
        workflowName: definition.name,
        timestamp: Date.now(),
        nodeCount: definition.nodes.length,
        relatedKnowledgeCount: relatedKnowledge.length
      });
      const result = await this.executor.execute(
        definition,
        context.executionContext
      );
      const outputs = result.results;
      let completedNodes = 0;
      let failedNodes = 0;
      let skippedNodes = 0;
      outputs.forEach((output) => {
        switch (output.status) {
          case "success":
            completedNodes++;
            break;
          case "failure":
            failedNodes++;
            break;
          case "skipped":
            skippedNodes++;
            break;
        }
      });
      const duration = Date.now() - startTime;
      const executionResult = {
        ...result,
        executionId: context.executionContext.executionId,
        workflowId: definition.id,
        workflowName: definition.name,
        duration,
        relatedKnowledgeIds: relatedKnowledge.map((k) => k.knowledgeId),
        stats: {
          totalNodes: definition.nodes.length,
          completedNodes,
          failedNodes,
          skippedNodes
        }
      };
      if (result.status === "completed") {
        this.emitLifecycleEvent("workflow:completed", {
          workflowId: definition.id,
          workflowName: definition.name,
          duration,
          stats: executionResult.stats,
          timestamp: Date.now()
        });
      } else {
        this.emitLifecycleEvent("workflow:failed", {
          workflowId: definition.id,
          workflowName: definition.name,
          duration,
          errors: result.errors,
          stats: executionResult.stats,
          timestamp: Date.now()
        });
      }
      if (this.config.enableMemory && this.memoryManager) {
        const memoryId = await this.recordToMemory(executionResult);
        executionResult.memoryId = memoryId;
      }
      return executionResult;
    } catch (error) {
      const err = error;
      const duration = Date.now() - startTime;
      this.emitLifecycleEvent("workflow:failed", {
        workflowId: definition.id,
        workflowName: definition.name,
        duration,
        error: {
          message: err.message,
          stack: err.stack
        },
        timestamp: Date.now()
      });
      if (this.config.enableMemory && this.memoryManager) {
        await this.recordToMemory({
          status: "failed",
          executionId: context.executionContext.executionId,
          workflowId: definition.id,
          workflowName: definition.name,
          duration,
          results: /* @__PURE__ */ new Map(),
          errors: { _error: err },
          stats: {
            totalNodes: definition.nodes.length,
            completedNodes: 0,
            failedNodes: definition.nodes.length,
            skippedNodes: 0
          }
        });
      }
      throw error;
    }
  }
  // ==================== Private Methods ====================
  /**
   * 工作流完成后记录记忆
   */
  async recordToMemory(result) {
    if (!this.memoryManager) {
      throw new Error("MemoryManager not configured");
    }
    const summary = this.buildMemorySummary(result);
    const tags = this.extractTags(result);
    const memory = await this.memoryManager.createEpisodicMemory({
      source: "task_completion",
      priority: this.config.memoryPriority,
      title: `\u5DE5\u4F5C\u6D41\u6267\u884C: ${result.workflowName}`,
      summary,
      content: {
        workflowId: result.workflowId,
        workflowName: result.workflowName,
        executionId: result.executionId,
        status: result.status,
        duration: result.duration,
        stats: result.stats,
        nodeOutputs: Array.from(result.results.entries()).map(([nodeId, output]) => ({
          nodeId,
          status: output.status,
          data: output.data
        }))
      },
      tags,
      relatedTaskIds: [result.executionId],
      metadata: {
        relatedKnowledgeIds: result.relatedKnowledgeIds
      }
    });
    return memory.memoryId;
  }
  /**
   * 工作流执行前查询相关知识
   */
  async queryKnowledge(workflowName) {
    if (!this.memoryManager) {
      return [];
    }
    try {
      const keywords = this.extractKeywords(workflowName);
      const knowledge = await this.memoryManager.queryKnowledge({
        keywords,
        limit: 5
      });
      return knowledge;
    } catch (error) {
      console.error("Failed to query knowledge:", error);
      return [];
    }
  }
  /**
   * 触发工作流生命周期事件
   */
  emitLifecycleEvent(event, data) {
    if (!this.config.enableEvents || !this.eventManager) {
      return;
    }
    try {
      this.eventManager.emit(event, data);
    } catch (error) {
      console.error(`Failed to emit event ${event}:`, error);
    }
  }
  /**
   * 构建记忆摘要
   */
  buildMemorySummary(result) {
    const statusText = result.status === "completed" ? "\u6210\u529F\u5B8C\u6210" : "\u6267\u884C\u5931\u8D25";
    const durationText = this.formatDuration(result.duration);
    const parts = [
      `\u5DE5\u4F5C\u6D41 "${result.workflowName}" ${statusText}`,
      `\u6267\u884C\u65F6\u957F: ${durationText}`,
      `\u8282\u70B9\u7EDF\u8BA1: ${result.stats.completedNodes}/${result.stats.totalNodes} \u6210\u529F`
    ];
    if (result.stats.failedNodes > 0) {
      parts.push(`\u5931\u8D25\u8282\u70B9: ${result.stats.failedNodes}`);
    }
    return parts.join("\u3002");
  }
  /**
   * 提取标签
   */
  extractTags(result) {
    const tags = [
      "workflow",
      result.status,
      result.workflowName.toLowerCase().replace(/\s+/g, "-")
    ];
    if (result.status === "completed") {
      tags.push("success");
    } else {
      tags.push("failed");
    }
    if (result.duration < 1e3) {
      tags.push("fast");
    } else if (result.duration > 6e4) {
      tags.push("slow");
    }
    return tags;
  }
  /**
   * 从工作流名称提取关键词
   */
  extractKeywords(workflowName) {
    const words = workflowName.split(/[\s\-_\/]+/);
    const stopWords = /* @__PURE__ */ new Set(["the", "a", "an", "of", "in", "to", "for", "and", "or"]);
    const keywords = words.filter((word) => word.length > 2 && !stopWords.has(word.toLowerCase())).map((word) => word.toLowerCase());
    return [...new Set(keywords)];
  }
  /**
   * 格式化时长
   */
  formatDuration(ms) {
    if (ms < 1e3) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1e3);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
};

// src/core/dependency-manager/types.ts
var CycleDetectedError2 = class extends Error {
  constructor(cycles) {
    super(`Circular dependency detected: ${cycles.map((c) => c.join(" \u2192 ")).join(", ")}`);
    this.cycles = cycles;
    this.name = "CycleDetectedError";
  }
};

// src/core/dependency-manager/dependency-store.ts
var InMemoryDependencyStore = class {
  constructor() {
    this.dependencies = /* @__PURE__ */ new Map();
    this.states = /* @__PURE__ */ new Map();
    this.history = /* @__PURE__ */ new Map();
    // 索引（加速查询）
    this.downstreamIndex = /* @__PURE__ */ new Map();
    this.upstreamIndex = /* @__PURE__ */ new Map();
  }
  // ==================== 依赖定义 CRUD ====================
  /**
   * 保存依赖定义
   */
  async save(dependency) {
    for (const depId of dependency.dependsOn) {
      if (!this.downstreamIndex.has(depId)) {
        this.downstreamIndex.set(depId, /* @__PURE__ */ new Set());
      }
      this.downstreamIndex.get(depId).add(dependency.taskId);
      if (!this.upstreamIndex.has(dependency.taskId)) {
        this.upstreamIndex.set(dependency.taskId, /* @__PURE__ */ new Set());
      }
      this.upstreamIndex.get(dependency.taskId).add(depId);
    }
    this.dependencies.set(dependency.taskId, dependency);
  }
  /**
   * 批量保存依赖定义
   */
  async saveBatch(dependencies) {
    for (const dep of dependencies) {
      await this.save(dep);
    }
  }
  /**
   * 获取依赖定义
   */
  async get(taskId) {
    return this.dependencies.get(taskId);
  }
  /**
   * 获取所有依赖定义
   */
  async getAll() {
    return Array.from(this.dependencies.values());
  }
  /**
   * 删除依赖定义
   */
  async delete(taskId) {
    const dependency = this.dependencies.get(taskId);
    if (!dependency) return;
    for (const depId of dependency.dependsOn) {
      this.downstreamIndex.get(depId)?.delete(taskId);
      this.upstreamIndex.get(taskId)?.delete(depId);
    }
    this.dependencies.delete(taskId);
    this.states.delete(taskId);
  }
  /**
   * 批量删除依赖定义
   */
  async deleteBatch(taskIds) {
    for (const taskId of taskIds) {
      await this.delete(taskId);
    }
  }
  // ==================== 依赖状态管理 ====================
  /**
   * 获取依赖状态
   */
  async getState(taskId) {
    return this.states.get(taskId);
  }
  /**
   * 保存依赖状态
   */
  async saveState(state) {
    this.states.set(state.taskId, state);
  }
  /**
   * 更新单个依赖项状态
   */
  async updateDependencyItemStatus(taskId, dependsOnTaskId, status, details) {
    const state = this.states.get(taskId);
    if (!state) return;
    const detail = state.dependencyDetails.get(dependsOnTaskId);
    if (!detail) return;
    Object.assign(detail, details, { status });
    state.dependencyDetails.set(dependsOnTaskId, detail);
    state.dependencyStatus.set(dependsOnTaskId, status);
    this.states.set(taskId, state);
  }
  // ==================== 依赖历史记录 ====================
  /**
   * 添加历史记录
   */
  async addHistoryEntry(entry) {
    if (!this.history.has(entry.taskId)) {
      this.history.set(entry.taskId, []);
    }
    this.history.get(entry.taskId).push(entry);
  }
  /**
   * 获取依赖历史
   */
  async getDependencyHistory(taskId, options) {
    let entries = this.history.get(taskId) || [];
    if (options?.eventTypes) {
      entries = entries.filter((e) => options.eventTypes.includes(e.eventType));
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return entries.slice(offset, offset + limit);
  }
  // ==================== 查询接口 ====================
  /**
   * 查询任务的下游依赖
   * 返回依赖此任务的所有任务定义
   */
  async getDownstreamDependencies(taskId) {
    const taskIds = this.downstreamIndex.get(taskId) || /* @__PURE__ */ new Set();
    const result = [];
    for (const id of taskIds) {
      const dep = this.dependencies.get(id);
      if (dep) {
        result.push(dep);
      }
    }
    return result;
  }
  /**
   * 查询任务的上游依赖
   * 返回此任务依赖的所有任务定义
   */
  async getUpstreamDependencies(taskId) {
    const taskIds = this.upstreamIndex.get(taskId) || /* @__PURE__ */ new Set();
    const result = [];
    for (const id of taskIds) {
      const dep = this.dependencies.get(id);
      if (dep) {
        result.push(dep);
      }
    }
    return result;
  }
  /**
   * 获取所有阻塞的任务
   */
  async getBlockedTasks() {
    const result = [];
    for (const [taskId, state] of this.states) {
      if (!state.ready && state.blockedBy && state.blockedBy.length > 0) {
        result.push(taskId);
      }
    }
    return result;
  }
  // ==================== 生命周期 ====================
  /**
   * 清空所有数据
   */
  async clear() {
    this.dependencies.clear();
    this.states.clear();
    this.history.clear();
    this.downstreamIndex.clear();
    this.upstreamIndex.clear();
  }
};

// src/core/dependency-manager/dependency-manager.ts
var DependencyResolver = class {
  /**
   * 解析依赖状态
   *
   * @param state 当前依赖状态
   * @param dependency 依赖定义
   * @returns 解析结果
   */
  resolve(state, dependency) {
    const satisfiedDeps = [];
    const blockedDeps = [];
    const failedDeps = [];
    for (const depTaskId of dependency.dependsOn) {
      const detail = state.dependencyDetails.get(depTaskId);
      if (!detail) continue;
      switch (detail.status) {
        case "satisfied":
          satisfiedDeps.push(depTaskId);
          break;
        case "failed":
        case "timeout":
          failedDeps.push(depTaskId);
          break;
        case "pending":
          blockedDeps.push(depTaskId);
          break;
      }
    }
    let ready = false;
    let blockedBy = [];
    let reason = "";
    if (dependency.condition === "all") {
      if (satisfiedDeps.length === dependency.dependsOn.length) {
        ready = true;
        reason = "All dependencies satisfied";
      } else if (failedDeps.length > 0) {
        blockedBy = failedDeps;
        reason = "Some dependencies failed";
      } else {
        blockedBy = blockedDeps;
        reason = "Waiting for dependencies";
      }
    } else {
      if (satisfiedDeps.length > 0) {
        ready = true;
        reason = "At least one dependency satisfied";
      } else if (failedDeps.length === dependency.dependsOn.length) {
        blockedBy = failedDeps;
        reason = "All dependencies failed";
      } else {
        blockedBy = blockedDeps;
        reason = "Waiting for dependencies";
      }
    }
    return { ready, blockedBy, reason };
  }
  /**
   * 构建依赖图
   *
   * @param dependencies 依赖定义列表
   * @param states 依赖状态映射
   * @returns 依赖图
   */
  buildGraph(dependencies, states) {
    const nodeMap = /* @__PURE__ */ new Map();
    const edges = [];
    for (const dep of dependencies) {
      const state = states.get(dep.taskId);
      let status = "pending";
      if (state) {
        if (state.ready) {
          status = "ready";
        } else if (state.blockedBy && state.blockedBy.length > 0) {
          status = "pending";
        }
      }
      nodeMap.set(dep.taskId, {
        taskId: dep.taskId,
        status
      });
      for (const depId of dep.dependsOn) {
        if (!nodeMap.has(depId)) {
          nodeMap.set(depId, {
            taskId: depId,
            status: "pending"
          });
        }
      }
    }
    for (const dep of dependencies) {
      for (const depId of dep.dependsOn) {
        edges.push({
          from: depId,
          to: dep.taskId,
          type: dep.type
        });
      }
    }
    return {
      nodes: Array.from(nodeMap.values()),
      edges
    };
  }
};
var TimeoutRegistry = class {
  constructor() {
    this.timers = /* @__PURE__ */ new Map();
  }
  /**
   * 设置超时定时器
   *
   * @param taskId 任务 ID
   * @param timeout 超时时间（毫秒）
   * @param callback 超时回调
   */
  set(taskId, timeout, callback) {
    this.clear(taskId);
    const timer = setTimeout(() => {
      this.timers.delete(taskId);
      callback();
    }, timeout);
    this.timers.set(taskId, timer);
  }
  /**
   * 清除指定任务的超时定时器
   */
  clear(taskId) {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }
  /**
   * 清除所有超时定时器
   */
  clearAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
  /**
   * 获取活跃定时器数量
   */
  get size() {
    return this.timers.size;
  }
};
var DependencyManager = class {
  /**
   * 创建依赖管理器
   *
   * @param store 依赖存储（默认使用内存存储）
   * @param eventEmitter 事件发射器（默认创建新实例）
   */
  constructor(store, eventEmitter) {
    // 并发控制（debounce）
    this.pendingChecks = /* @__PURE__ */ new Set();
    this.checkScheduled = false;
    this.store = store || new InMemoryDependencyStore();
    this.eventEmitter = eventEmitter || new EventEmitter();
    this.resolver = new DependencyResolver();
    this.timeoutRegistry = new TimeoutRegistry();
    this.topologicalSorter = new TopologicalSorter();
  }
  // ==================== 生命周期管理 ====================
  /**
   * 初始化依赖管理器
   * 恢复未完成依赖的超时定时器
   */
  async initialize() {
    const dependencies = await this.store.getAll();
    for (const dep of dependencies) {
      if (dep.timeout > 0) {
        const state = await this.store.getState(dep.taskId);
        if (state && !state.ready) {
          this.scheduleTimeout(dep);
        }
      }
    }
  }
  /**
   * 销毁依赖管理器
   * 清理所有超时定时器和事件监听
   */
  async destroy() {
    this.timeoutRegistry.clearAll();
    this.eventEmitter.clearAll();
  }
  // ==================== 依赖注册 ====================
  /**
   * 注册依赖
   *
   * 步骤：
   * 1. 循环依赖检测
   * 2. 保存依赖定义
   * 3. 初始化依赖状态
   * 4. 设置超时定时器
   * 5. 触发注册事件
   * 6. 检查就绪状态
   *
   * @param dependency 依赖定义
   * @throws CycleDetectedError 如果检测到循环依赖
   */
  async register(dependency) {
    await this.detectCycle(dependency);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.store.save({
      ...dependency,
      createdAt: dependency.createdAt || now,
      updatedAt: now
    });
    const state = this.createInitialState(dependency);
    await this.store.saveState(state);
    if (dependency.timeout > 0) {
      this.scheduleTimeout(dependency);
    }
    this.eventEmitter.emit("dependency:registered", {
      taskId: dependency.taskId,
      dependsOn: dependency.dependsOn,
      timestamp: Date.now()
    });
    await this.checkReadiness(dependency.taskId);
  }
  /**
   * 注销依赖
   *
   * @param taskId 任务 ID
   */
  async unregister(taskId) {
    this.timeoutRegistry.clear(taskId);
    await this.store.delete(taskId);
    this.eventEmitter.emit("dependency:unregistered", {
      taskId,
      timestamp: Date.now()
    });
  }
  // ==================== 依赖查询 ====================
  /**
   * 查询任务的上游依赖
   *
   * @param taskId 任务 ID
   * @returns 上游依赖定义列表
   */
  async getUpstreamDependencies(taskId) {
    return this.store.getUpstreamDependencies(taskId);
  }
  /**
   * 查询任务的下游依赖
   *
   * @param taskId 任务 ID
   * @returns 下游依赖定义列表
   */
  async getDownstreamDependencies(taskId) {
    return this.store.getDownstreamDependencies(taskId);
  }
  /**
   * 获取依赖状态
   *
   * @param taskId 任务 ID
   * @returns 依赖状态
   */
  async getDependencyState(taskId) {
    return this.store.getState(taskId);
  }
  /**
   * 检查任务是否就绪
   *
   * @param taskId 任务 ID
   * @returns 是否就绪
   */
  async isReady(taskId) {
    const state = await this.store.getState(taskId);
    return state?.ready ?? false;
  }
  /**
   * 获取所有阻塞的任务
   *
   * @returns 阻塞的任务 ID 列表
   */
  async getBlockedTasks() {
    return this.store.getBlockedTasks();
  }
  /**
   * 获取依赖图
   *
   * @returns 依赖图
   */
  async getDependencyGraph() {
    const dependencies = await this.store.getAll();
    const states = /* @__PURE__ */ new Map();
    for (const dep of dependencies) {
      const state = await this.store.getState(dep.taskId);
      if (state) {
        states.set(dep.taskId, state);
      }
    }
    return this.resolver.buildGraph(dependencies, states);
  }
  // ==================== 依赖历史查询 ====================
  /**
   * 获取依赖历史
   *
   * @param taskId 任务 ID
   * @param options 查询选项
   * @returns 历史记录列表
   */
  async getDependencyHistory(taskId, options) {
    return this.store.getDependencyHistory(taskId, options);
  }
  // ==================== 强制解析 ====================
  /**
   * 强制解析依赖
   *
   * 用于：
   * 1. 跳过长时间阻塞的依赖
   * 2. 紧急情况下手动触发任务
   *
   * @param taskId 任务 ID
   * @param options 强制解析选项
   */
  async forceResolve(taskId, options) {
    const dependency = await this.store.get(taskId);
    if (!dependency) {
      throw new Error(`Dependency not found: ${taskId}`);
    }
    const state = await this.store.getState(taskId);
    if (!state) {
      throw new Error(`Dependency state not found: ${taskId}`);
    }
    const skipSet = new Set(options.skipDependsOn || []);
    const now = Date.now();
    for (const [depTaskId, detail] of state.dependencyDetails) {
      if (skipSet.has(depTaskId) || options.strategy === "force_ready") {
        detail.status = "satisfied";
        detail.satisfiedTime = now;
        detail.skipReason = options.reason;
        await this.store.updateDependencyItemStatus(
          taskId,
          depTaskId,
          "satisfied",
          detail
        );
      }
    }
    await this.store.addHistoryEntry({
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: "dependency:ready",
      timestamp: now,
      details: {
        forced: true,
        reason: options.reason,
        strategy: options.strategy
      }
    });
    await this.checkReadiness(taskId);
  }
  // ==================== 状态更新 ====================
  /**
   * 更新依赖状态（内部方法）
   *
   * 当依赖项的状态发生变化时调用。更新存储中的状态，
   * 记录历史，触发相应的依赖事件，并调度就绪检查。
   *
   * @param taskId 任务 ID
   * @param dependsOnTaskId 依赖任务 ID
   * @param status 新状态
   * @param error 错误信息（失败时）
   * @param skipReason 跳过原因（用于 skip/fallback 策略，如任务取消时）
   */
  async updateDependencyStatus(taskId, dependsOnTaskId, status, error, skipReason) {
    const state = await this.store.getState(taskId);
    if (!state) return;
    const detail = state.dependencyDetails.get(dependsOnTaskId);
    if (!detail) return;
    const now = Date.now();
    detail.status = status;
    if (status === "satisfied") {
      detail.satisfiedTime = now;
    }
    if (error) {
      detail.error = error;
    }
    if (skipReason) {
      detail.skipReason = skipReason;
    }
    await this.store.updateDependencyItemStatus(
      taskId,
      dependsOnTaskId,
      status,
      detail
    );
    await this.store.addHistoryEntry({
      id: `history-${now}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: status === "satisfied" ? "dependency:resolved" : "dependency:failed",
      timestamp: now,
      relatedTaskId: dependsOnTaskId,
      details: { status, error }
    });
    if (status === "satisfied") {
      this.eventEmitter.emit("dependency:resolved", {
        taskId,
        resolvedTaskId: dependsOnTaskId,
        satisfiedTime: now,
        timestamp: now
      });
    } else if (status === "failed") {
      this.eventEmitter.emit("dependency:failed", {
        taskId,
        failedTaskId: dependsOnTaskId,
        error,
        skipReason,
        timestamp: now
      });
    }
    this.scheduleReadinessCheck(taskId);
  }
  /**
   * 获取事件发射器（供外部监听事件）
   */
  getEventEmitter() {
    return this.eventEmitter;
  }
  // ==================== 私有方法 ====================
  /**
   * 创建初始依赖状态
   *
   * @param dependency 依赖定义
   * @returns 初始依赖状态
   */
  createInitialState(dependency) {
    const details = /* @__PURE__ */ new Map();
    const statusMap = /* @__PURE__ */ new Map();
    for (const depTaskId of dependency.dependsOn) {
      details.set(depTaskId, {
        dependsOnTaskId: depTaskId,
        status: "pending"
      });
      statusMap.set(depTaskId, "pending");
    }
    return {
      taskId: dependency.taskId,
      dependencyDetails: details,
      dependencyStatus: statusMap,
      ready: false,
      blockedBy: dependency.dependsOn.length > 0 ? [...dependency.dependsOn] : void 0
    };
  }
  /**
   * 循环依赖检测
   *
   * Phase 0 修复：正确映射到 WorkflowNode/WorkflowConnection 类型
   * 将依赖图转换为 TopologicalSorter 需要的格式
   *
   * @param dependency 新注册的依赖
   * @throws CycleDetectedError 如果检测到循环依赖
   */
  async detectCycle(dependency) {
    const dependencies = await this.store.getAll();
    const nodeIds = /* @__PURE__ */ new Set();
    nodeIds.add(dependency.taskId);
    for (const dep of dependencies) {
      nodeIds.add(dep.taskId);
      for (const depId of dep.dependsOn) {
        nodeIds.add(depId);
      }
    }
    for (const depId of dependency.dependsOn) {
      nodeIds.add(depId);
    }
    const nodes = Array.from(nodeIds).map((id) => ({
      id,
      type: "task",
      name: id,
      config: {}
    }));
    const connections = [];
    for (const depId of dependency.dependsOn) {
      connections.push({
        source: depId,
        target: dependency.taskId
      });
    }
    for (const dep of dependencies) {
      for (const depId of dep.dependsOn) {
        connections.push({
          source: depId,
          target: dep.taskId
        });
      }
    }
    const cycles = this.topologicalSorter.detectCycle(nodes, connections);
    if (cycles.length > 0) {
      throw new CycleDetectedError2(cycles);
    }
  }
  /**
   * 调度就绪检查（debounce）
   *
   * 使用 queueMicrotask 实现批量检查，避免多次快速状态更新导致的重复检查
   *
   * @param taskId 任务 ID
   */
  scheduleReadinessCheck(taskId) {
    this.pendingChecks.add(taskId);
    if (!this.checkScheduled) {
      this.checkScheduled = true;
      queueMicrotask(() => {
        const tasksToCheck = Array.from(this.pendingChecks);
        this.pendingChecks.clear();
        this.checkScheduled = false;
        for (const id of tasksToCheck) {
          this.checkReadiness(id);
        }
      });
    }
  }
  /**
   * 检查就绪状态
   *
   * @param taskId 任务 ID
   */
  async checkReadiness(taskId) {
    const dependency = await this.store.get(taskId);
    const state = await this.store.getState(taskId);
    if (!dependency || !state) return;
    const result = this.resolver.resolve(state, dependency);
    if (result.ready && !state.ready) {
      state.ready = true;
      state.readyTime = Date.now();
      state.blockedBy = void 0;
      await this.store.saveState(state);
      this.timeoutRegistry.clear(taskId);
      this.eventEmitter.emit("dependency:ready", {
        taskId,
        readyTime: state.readyTime,
        timestamp: Date.now()
      });
    } else if (!result.ready && state.ready) {
      state.ready = false;
      state.blockedBy = result.blockedBy;
      await this.store.saveState(state);
      this.eventEmitter.emit("dependency:blocked", {
        taskId,
        blockedBy: result.blockedBy,
        reason: result.reason,
        timestamp: Date.now()
      });
    } else if (!result.ready && !state.ready) {
      if (JSON.stringify(state.blockedBy) !== JSON.stringify(result.blockedBy)) {
        state.blockedBy = result.blockedBy;
        await this.store.saveState(state);
      }
    }
  }
  /**
   * 调度超时定时器
   *
   * Phase 0 修复：明确为同步调度模式
   * - 定时器设置是同步操作
   * - 超时回调是异步操作
   * - 不需要 await 来设置定时器
   *
   * @param dependency 依赖定义
   */
  scheduleTimeout(dependency) {
    this.timeoutRegistry.set(
      dependency.taskId,
      dependency.timeout,
      () => this.handleTimeout(dependency.taskId)
    );
    const timeoutAt = Date.now() + dependency.timeout;
    this.store.getState(dependency.taskId).then((state) => {
      if (state) {
        state.timeoutAt = timeoutAt;
        this.store.saveState(state);
      }
    });
  }
  /**
   * 处理超时
   *
   * @param taskId 任务 ID
   */
  async handleTimeout(taskId) {
    const dependency = await this.store.get(taskId);
    const state = await this.store.getState(taskId);
    if (!dependency || !state || state.ready) return;
    for (const [depTaskId, detail] of state.dependencyDetails) {
      if (detail.status === "pending") {
        detail.status = "timeout";
        detail.timeoutAt = Date.now();
        await this.store.updateDependencyItemStatus(
          taskId,
          depTaskId,
          "timeout",
          detail
        );
      }
    }
    await this.store.addHistoryEntry({
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: "dependency:timeout",
      timestamp: Date.now(),
      details: { timeoutAt: state.timeoutAt }
    });
    this.eventEmitter.emit("dependency:timeout", {
      taskId,
      timeoutTaskId: taskId,
      timestamp: Date.now()
    });
    await this.handleFailureStrategy(dependency, "timeout");
  }
  /**
   * 处理失败策略
   *
   * @param dependency 依赖定义
   * @param failureType 失败类型
   */
  async handleFailureStrategy(dependency, failureType) {
    switch (dependency.onFailure) {
      case "block":
        this.eventEmitter.emit("dependency:blocked", {
          taskId: dependency.taskId,
          blockedBy: [],
          reason: `Dependency ${failureType}, task blocked`,
          timestamp: Date.now()
        });
        break;
      case "skip":
        this.eventEmitter.emit("dependency:blocked", {
          taskId: dependency.taskId,
          blockedBy: [],
          reason: `Dependency ${failureType}, task skipped`,
          timestamp: Date.now()
        });
        break;
      case "fallback":
        this.eventEmitter.emit("dependency:blocked", {
          taskId: dependency.taskId,
          blockedBy: [],
          reason: dependency.fallbackTaskId ? `Dependency ${failureType}, fallback to ${dependency.fallbackTaskId}` : `Dependency ${failureType}, no fallback task configured`,
          timestamp: Date.now()
        });
        break;
    }
  }
};

// src/core/dependency-manager/dependency-event-listener.ts
var DependencyEventListener = class {
  /**
   * 创建依赖事件监听器
   *
   * @param taskEventEmitter 任务管理器事件发射器
   * @param dependencyManager 依赖管理器
   * @param config 配置选项
   */
  constructor(taskEventEmitter, dependencyManager, config = {}) {
    /** 取消订阅函数列表 */
    this.unsubscribers = [];
    /** 是否正在监听 */
    this.listening = false;
    /** 事件转换记录（用于调试） */
    this.conversionRecords = [];
    /** 统计信息 */
    this.stats = {
      totalProcessed: 0,
      successfulConversions: 0,
      failedConversions: 0
    };
    this.taskEventEmitter = taskEventEmitter;
    this.dependencyManager = dependencyManager;
    this.config = {
      autoStart: config.autoStart ?? true,
      enableLogging: config.enableLogging ?? false,
      errorHandling: config.errorHandling ?? "log"
    };
    if (this.config.autoStart) {
      this.startListening();
    }
  }
  // ==================== 生命周期管理 ====================
  /**
   * 开始监听任务事件
   *
   * 订阅以下任务事件：
   * - task:completed → dependency:resolved
   * - task:failed → dependency:failed
   * - task:cancelled → dependency:failed
   *
   * @returns 取消监听函数
   */
  startListening() {
    if (this.listening) {
      this.log("Already listening, skip");
      return () => this.stopListening();
    }
    this.listening = true;
    this.log("Starting to listen for task events");
    const unsubCompleted = this.taskEventEmitter.on(
      "task:completed",
      (event) => this.handleTaskCompleted(event)
    );
    this.unsubscribers.push(unsubCompleted);
    const unsubFailed = this.taskEventEmitter.on(
      "task:failed",
      (event) => this.handleTaskFailed(event)
    );
    this.unsubscribers.push(unsubFailed);
    const unsubCancelled = this.taskEventEmitter.on(
      "task:cancelled",
      (event) => this.handleTaskCancelled(event)
    );
    this.unsubscribers.push(unsubCancelled);
    return () => this.stopListening();
  }
  /**
   * 停止监听任务事件
   *
   * 清除所有事件订阅
   */
  stopListening() {
    if (!this.listening) {
      return;
    }
    this.log("Stopping listening for task events");
    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        this.handleError("Failed to unsubscribe", error);
      }
    }
    this.unsubscribers = [];
    this.listening = false;
  }
  /**
   * 检查是否正在监听
   */
  isListening() {
    return this.listening;
  }
  // ==================== 事件处理 ====================
  /**
   * 处理任务完成事件
   *
   * @param event 任务完成事件
   */
  async handleTaskCompleted(event) {
    const startTime = Date.now();
    const taskId = event.flowId;
    this.log(`Task ${taskId} completed, converting to dependency:resolved`);
    try {
      await this.updateDownstreamDependencies(taskId, "satisfied");
      this.recordConversion({
        originalEvent: "task:completed",
        convertedEvent: "dependency:resolved",
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime
      });
      this.stats.successfulConversions++;
    } catch (error) {
      this.recordConversion({
        originalEvent: "task:completed",
        convertedEvent: "dependency:resolved",
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
      this.stats.failedConversions++;
      this.handleError(`Failed to handle task:completed for ${taskId}`, error);
    } finally {
      this.stats.totalProcessed++;
    }
  }
  /**
   * 处理任务失败事件
   *
   * @param event 任务失败事件
   */
  async handleTaskFailed(event) {
    const startTime = Date.now();
    const taskId = event.flowId;
    this.log(`Task ${taskId} failed: ${event.error}, converting to dependency:failed`);
    try {
      await this.updateDownstreamDependencies(taskId, "failed", event.error);
      this.recordConversion({
        originalEvent: "task:failed",
        convertedEvent: "dependency:failed",
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime
      });
      this.stats.successfulConversions++;
    } catch (error) {
      this.recordConversion({
        originalEvent: "task:failed",
        convertedEvent: "dependency:failed",
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
      this.stats.failedConversions++;
      this.handleError(`Failed to handle task:failed for ${taskId}`, error);
    } finally {
      this.stats.totalProcessed++;
    }
  }
  /**
   * 处理任务取消事件
   *
   * @param event 任务取消事件
   */
  async handleTaskCancelled(event) {
    const startTime = Date.now();
    const taskId = event.taskId;
    this.log(`Task ${taskId} cancelled: ${event.reason}, converting to dependency:failed`);
    try {
      await this.updateDownstreamDependencies(
        taskId,
        "failed",
        void 0,
        // No error for cancelled
        event.reason || "Task cancelled"
        // skipReason
      );
      this.recordConversion({
        originalEvent: "task:cancelled",
        convertedEvent: "dependency:failed",
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime
      });
      this.stats.successfulConversions++;
    } catch (error) {
      this.recordConversion({
        originalEvent: "task:cancelled",
        convertedEvent: "dependency:failed",
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
      this.stats.failedConversions++;
      this.handleError(`Failed to handle task:cancelled for ${taskId}`, error);
    } finally {
      this.stats.totalProcessed++;
    }
  }
  /**
   * 更新下游依赖状态
   *
   * 当一个任务完成/失败时，需要更新所有依赖它的任务的依赖状态
   *
   * @param taskId 任务 ID（触发者）
   * @param status 新的依赖状态
   * @param error 错误信息（失败时）
   * @param skipReason 跳过原因（取消时）
   */
  async updateDownstreamDependencies(taskId, status, error, skipReason) {
    const downstreamDeps = await this.dependencyManager.getDownstreamDependencies(taskId);
    this.log(`Found ${downstreamDeps.length} downstream dependencies for ${taskId}`);
    for (const dep of downstreamDeps) {
      try {
        await this.dependencyManager.updateDependencyStatus(
          dep.taskId,
          taskId,
          status,
          error,
          skipReason
        );
        this.log(`Updated ${dep.taskId}'s dependency on ${taskId} to ${status}`);
      } catch (err) {
        this.handleError(`Failed to update ${dep.taskId}'s dependency on ${taskId}`, err);
      }
    }
  }
  // ==================== 工具方法 ====================
  /**
   * 记录事件转换
   */
  recordConversion(record) {
    this.conversionRecords.push(record);
    if (this.conversionRecords.length > 1e3) {
      this.conversionRecords = this.conversionRecords.slice(-500);
    }
  }
  /**
   * 获取事件转换记录
   */
  getConversionRecords() {
    return [...this.conversionRecords];
  }
  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * 清除转换记录和统计
   */
  reset() {
    this.conversionRecords = [];
    this.stats = {
      totalProcessed: 0,
      successfulConversions: 0,
      failedConversions: 0
    };
  }
  /**
   * 日志输出
   */
  log(message) {
    if (this.config.enableLogging) {
      console.log(`[DependencyEventListener] ${message}`);
    }
  }
  /**
   * 错误处理
   */
  handleError(message, error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (this.config.errorHandling === "throw") {
      throw new Error(`${message}: ${errorMessage}`);
    } else {
      console.error(`[DependencyEventListener] ${message}:`, errorMessage);
    }
  }
  // ==================== 清理 ====================
  /**
   * 销毁监听器
   *
   * 停止监听并清理资源
   */
  destroy() {
    this.stopListening();
    this.reset();
  }
};

// src/core/managers/session-task-manager.ts
var SessionTaskManager = class {
  // ==================== 构造函数 ====================
  constructor(config) {
    // 记忆存储（简化版）
    this.memories = /* @__PURE__ */ new Map();
    // 活跃任务追踪
    this.activeFlows = /* @__PURE__ */ new Map();
    // 状态
    this.initialized = false;
    this.destroyed = false;
    this.config = {
      sessionKey: config.sessionKey,
      bridge: config.bridge,
      deliveryContext: config.deliveryContext,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 6e4,
      // 默认60秒
      timeoutThresholdMs: config.timeoutThresholdMs ?? 30 * 60 * 1e3,
      // 默认30分钟
      maxRetries: config.maxRetries ?? 3,
      enableEvents: config.enableEvents ?? true,
      enableMemory: config.enableMemory ?? true
    };
    this.bridge = config.bridge;
    this.sessionKey = config.sessionKey;
    this.deliveryContext = config.deliveryContext;
    this.eventEmitter = new EventEmitter();
  }
  // ==================== 生命周期管理 ====================
  /**
   * 初始化管理器
   * - 验证API可用性
   * - 注册事件监听
   * - 启动健康检查
   */
  async initialize() {
    if (this.initialized) {
      throw new SessionTaskManagerError(
        "ALREADY_INITIALIZED",
        "SessionTaskManager already initialized"
      );
    }
    try {
      this.verifyApiAvailability();
      this.startHealthCheck();
      this.initialized = true;
      this.emit("manager:initialized", {
        sessionKey: this.sessionKey,
        timestamp: Date.now()
      });
    } catch (error) {
      throw new SessionTaskManagerError(
        "API_NOT_AVAILABLE",
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }
  /**
   * 销毁管理器
   * - 停止健康检查
   * - 清理资源
   * - 清空事件监听
   */
  async destroy() {
    if (!this.initialized || this.destroyed) {
      return;
    }
    this.stopHealthCheck();
    if (this.dependencyEventListener) {
      this.dependencyEventListener.destroy();
      this.dependencyEventListener = void 0;
    }
    if (this.dependencyManager) {
      await this.dependencyManager.destroy();
      this.dependencyManager = void 0;
    }
    if (this.dependencyReadyHandler) {
      this.dependencyReadyHandler = void 0;
    }
    this.memories.clear();
    this.activeFlows.clear();
    this.destroyed = true;
    this.emit("manager:destroyed", {
      sessionKey: this.sessionKey,
      timestamp: Date.now()
    });
    this.eventEmitter.clearAll();
  }
  // ==================== 任务管理 ====================
  /**
   * 创建主任务（TaskFlow）
   * @param goal 任务目标
   * @param options 任务选项
   * @returns TaskFlow记录
   */
  async createMainTask(goal, options) {
    this.ensureInitialized();
    if (!goal || typeof goal !== "string") {
      throw new SessionTaskManagerError(
        "INVALID_PARAMS",
        "Goal must be a non-empty string"
      );
    }
    try {
      const flow = await this.bridge.createTaskFlow({
        name: options?.title || goal,
        description: options?.description,
        tasks: [{
          title: goal,
          runtime: options?.runtime || "acp",
          timeout: options?.timeout,
          metadata: options?.metadata
        }],
        metadata: {
          tags: options?.tags,
          priority: options?.priority,
          createdAt: Date.now()
        }
      });
      if (this.config.enableMemory) {
        const memory = {
          flowId: flow.flowId,
          goal,
          status: "pending",
          startTime: Date.now(),
          metadata: options?.metadata
        };
        this.memories.set(flow.flowId, memory);
      }
      this.activeFlows.set(flow.flowId, flow);
      const event = {
        flowId: flow.flowId,
        goal,
        timestamp: Date.now(),
        metadata: options?.metadata
      };
      this.emit("task:created", event);
      if (options?.dependsOn && options.dependsOn.length > 0) {
        await this.registerTaskDependency(flow.flowId, options);
      }
      return flow;
    } catch (error) {
      throw new SessionTaskManagerError(
        "TASK_CREATION_FAILED",
        `Failed to create main task: ${error instanceof Error ? error.message : String(error)}`,
        { goal, options, originalError: error }
      );
    }
  }
  /**
   * 创建子任务
   * @param params 子任务参数
   * @returns Task记录
   */
  async createSubTask(params) {
    this.ensureInitialized();
    if (!params.flowId || !params.childSessionKey || !params.task) {
      throw new SessionTaskManagerError(
        "INVALID_PARAMS",
        "flowId, childSessionKey, and task are required"
      );
    }
    try {
      const parentFlow = await this.bridge.getTaskFlow(params.flowId);
      if (!parentFlow) {
        throw new SessionTaskManagerError(
          "PARENT_FLOW_NOT_FOUND",
          `Parent flow not found: ${params.flowId}`
        );
      }
      const task = await this.bridge.createTask({
        title: params.task,
        runtime: params.runtime || "acp",
        timeout: params.timeout,
        parentFlowId: params.flowId,
        metadata: {
          childSessionKey: params.childSessionKey,
          label: params.label,
          ...params.metadata
        }
      });
      if (this.config.enableMemory) {
        const memory = this.memories.get(params.flowId);
        if (memory) {
          if (!memory.subtasks) {
            memory.subtasks = [];
          }
          memory.subtasks.push({
            taskId: task.taskId,
            title: params.task,
            status: "pending",
            startTime: Date.now()
          });
        }
      }
      const event = {
        flowId: params.flowId,
        taskId: task.taskId,
        task: params.task,
        timestamp: Date.now()
      };
      this.emit("subtask:created", event);
      const taskDetail = await this.bridge.getTask(task.taskId);
      if (!taskDetail) {
        throw new SessionTaskManagerError(
          "TASK_NOT_FOUND",
          `Created task not found: ${task.taskId}`
        );
      }
      return taskDetail;
    } catch (error) {
      if (error instanceof SessionTaskManagerError) {
        throw error;
      }
      throw new SessionTaskManagerError(
        "TASK_CREATION_FAILED",
        `Failed to create subtask: ${error instanceof Error ? error.message : String(error)}`,
        { params, originalError: error }
      );
    }
  }
  /**
   * 获取任务详情
   */
  async getTask(taskId) {
    this.ensureInitialized();
    return this.bridge.getTask(taskId);
  }
  /**
   * 获取TaskFlow详情
   */
  async getTaskFlow(flowId) {
    this.ensureInitialized();
    return this.bridge.getTaskFlow(flowId);
  }
  /**
   * 列出当前会话的任务
   */
  async listTasks() {
    this.ensureInitialized();
    return this.bridge.listTasks();
  }
  /**
   * 查询任务（支持过滤）
   * 
   * 实现客户端过滤，因为OpenClaw API的list()不支持参数
   */
  async queryTasks(filter) {
    this.ensureInitialized();
    let tasks = await this.bridge.listTasks();
    if (filter) {
      tasks = this.applyTaskFilter(tasks, filter);
    }
    return tasks;
  }
  /**
   * 取消任务
   */
  async cancelTask(taskId, reason) {
    this.ensureInitialized();
    try {
      const result = await this.bridge.cancelTask(taskId, reason);
      if (!result.cancelled) {
        throw new SessionTaskManagerError(
          "CANCEL_FAILED",
          `Failed to cancel task: ${result.reason}`
        );
      }
      const event = {
        taskId,
        reason,
        timestamp: Date.now()
      };
      this.emit("task:cancelled", event);
      if (this.config.enableMemory) {
        for (const [flowId, memory] of this.memories) {
          if (memory.subtasks) {
            const subtask = memory.subtasks.find((s) => s.taskId === taskId);
            if (subtask) {
              subtask.status = "cancelled";
              subtask.endTime = Date.now();
              break;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof SessionTaskManagerError) {
        throw error;
      }
      throw new SessionTaskManagerError(
        "CANCEL_FAILED",
        `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
        { taskId, reason, originalError: error }
      );
    }
  }
  /**
   * 完成任务
   */
  async completeTask(flowId, result) {
    this.ensureInitialized();
    try {
      const flow = await this.bridge.getTaskFlow(flowId);
      if (!flow) {
        throw new SessionTaskManagerError(
          "FLOW_NOT_FOUND",
          `TaskFlow not found: ${flowId}`
        );
      }
      if (this.config.enableMemory) {
        const memory = this.memories.get(flowId);
        if (memory) {
          memory.status = "succeeded";
          memory.endTime = Date.now();
          memory.duration = memory.endTime - memory.startTime;
          memory.result = result;
        }
      }
      const event = {
        flowId,
        goal: flow.name,
        duration: this.memories.get(flowId)?.duration || 0,
        result,
        timestamp: Date.now()
      };
      this.emit("task:completed", event);
      this.activeFlows.delete(flowId);
    } catch (error) {
      if (error instanceof SessionTaskManagerError) {
        throw error;
      }
      throw new SessionTaskManagerError(
        "TASK_NOT_FOUND",
        `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
        { flowId, originalError: error }
      );
    }
  }
  /**
   * 标记任务失败
   */
  async failTask(flowId, error) {
    this.ensureInitialized();
    try {
      const flow = await this.bridge.getTaskFlow(flowId);
      if (!flow) {
        throw new SessionTaskManagerError(
          "FLOW_NOT_FOUND",
          `TaskFlow not found: ${flowId}`
        );
      }
      if (this.config.enableMemory) {
        const memory = this.memories.get(flowId);
        if (memory) {
          memory.status = "failed";
          memory.endTime = Date.now();
          memory.duration = memory.endTime - memory.startTime;
          memory.error = error;
        }
      }
      const event = {
        flowId,
        goal: flow.name,
        error,
        timestamp: Date.now()
      };
      this.emit("task:failed", event);
      this.activeFlows.delete(flowId);
    } catch (err) {
      if (err instanceof SessionTaskManagerError) {
        throw err;
      }
      throw new SessionTaskManagerError(
        "FLOW_NOT_FOUND",
        `Failed to mark task as failed: ${err instanceof Error ? err.message : String(err)}`,
        { flowId, error, originalError: err }
      );
    }
  }
  // ==================== 工作流管理 ====================
  /**
   * 初始化工作流引擎
   * 
   * @param memoryManager 记忆管理器（可选）
   * @param eventManager 事件管理器（可选）
   */
  initializeWorkflowEngine(memoryManager, eventManager) {
    this.ensureInitialized();
    const nodeRegistry = getNodeRegistry();
    const topologicalSorter = new TopologicalSorter();
    this.workflowExecutor = new WorkflowExecutor(nodeRegistry, topologicalSorter);
    this.workflowIntegration = new WorkflowIntegration(
      this.workflowExecutor,
      memoryManager,
      eventManager,
      {
        enableMemory: !!memoryManager,
        enableEvents: !!eventManager
      }
    );
  }
  /**
   * 创建并执行工作流
   * 
   * @param definition 工作流定义
   * @param options 工作流执行选项
   * @returns 工作流执行结果
   */
  async createWorkflow(definition, options) {
    this.ensureInitialized();
    if (!this.workflowIntegration) {
      throw new SessionTaskManagerError(
        "WORKFLOW_NOT_INITIALIZED",
        "Workflow engine not initialized, call initializeWorkflowEngine() first"
      );
    }
    const executionContext = new ExecutionContext({
      executionId: `wf-exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflowId: definition.id,
      input: options?.input || {},
      timeout: definition.settings?.timeout
    });
    const workflowContext = {
      definition,
      executionContext,
      userId: options?.userId,
      sessionId: options?.sessionId || this.sessionKey,
      metadata: options?.metadata
    };
    try {
      const result = await this.workflowIntegration.createAndExecute(
        definition,
        workflowContext
      );
      this.emit("task:completed", {
        flowId: definition.id,
        goal: `\u5DE5\u4F5C\u6D41: ${definition.name}`,
        duration: result.duration,
        result,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      this.emit("task:failed", {
        flowId: definition.id,
        goal: `\u5DE5\u4F5C\u6D41: ${definition.name}`,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw new SessionTaskManagerError(
        "WORKFLOW_EXECUTION_FAILED",
        `Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`,
        { definition, originalError: error }
      );
    }
  }
  /**
   * 获取工作流执行器
   */
  getWorkflowExecutor() {
    return this.workflowExecutor;
  }
  /**
   * 获取工作流集成服务
   */
  getWorkflowIntegration() {
    return this.workflowIntegration;
  }
  // ==================== 事件管理 ====================
  /**
   * 注册事件监听器
   */
  on(eventType, listener) {
    return this.eventEmitter.on(eventType, listener);
  }
  /**
   * 触发事件
   */
  emit(eventType, payload) {
    this.eventEmitter.emit(eventType, payload);
  }
  // ==================== 记忆管理 ====================
  /**
   * 获取任务记忆
   */
  async getMemory(flowId) {
    this.ensureInitialized();
    return this.memories.get(flowId);
  }
  /**
   * 搜索相关记忆（简化版）
   */
  async searchMemories(query, limit) {
    this.ensureInitialized();
    const memories = [];
    let count = 0;
    const maxResults = limit ?? 10;
    for (const memory of this.memories.values()) {
      if (count >= maxResults) break;
      if (memory.goal.includes(query)) {
        memories.push(memory);
        count++;
      }
    }
    return memories;
  }
  /**
   * 刷新记忆到磁盘（简化版，暂不实现）
   */
  async flushMemory() {
    console.log("Memory flush not implemented yet");
  }
  // ==================== 健康检查 ====================
  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    this.ensureInitialized();
    const now = Date.now();
    const issues = [];
    const timeoutTasks = [];
    const errorTasks = [];
    try {
      const runningTasks = await this.queryTasks({ status: "running" });
      for (const task of runningTasks) {
        const lastEventAt = task.updatedAt || task.createdAt;
        const lastEventTime = new Date(lastEventAt).getTime();
        if (now - lastEventTime > this.config.timeoutThresholdMs) {
          timeoutTasks.push(task);
          issues.push({
            type: "timeout",
            message: `\u4EFB\u52A1\u8D85\u65F6: ${task.title || task.taskId}`,
            taskId: task.taskId,
            severity: "high",
            suggestedAction: "\u53D6\u6D88\u6216\u91CD\u8BD5\u4EFB\u52A1"
          });
        }
      }
      const failedTasks = await this.queryTasks({ status: "failed" });
      for (const task of failedTasks) {
        errorTasks.push(task);
        issues.push({
          type: "error",
          message: `\u4EFB\u52A1\u5931\u8D25: ${task.title || task.taskId}`,
          taskId: task.taskId,
          severity: "medium",
          suggestedAction: "\u5206\u6790\u5931\u8D25\u539F\u56E0\u5E76\u91CD\u8BD5"
        });
      }
      const result = {
        healthy: issues.length === 0,
        runningCount: runningTasks.length,
        timeoutTasks,
        errorTasks,
        checkedAt: now,
        issues
      };
      this.lastHealthCheck = result;
      const event = {
        result,
        timestamp: now
      };
      this.emit("health:check", event);
      if (issues.length > 0) {
        this.emit("health:issue", {
          issue: issues[0],
          taskId: issues[0].taskId,
          timestamp: now
        });
      }
      return result;
    } catch (error) {
      const errorEvent = {
        operation: "health_check",
        error: error instanceof Error ? error.message : String(error),
        timestamp: now
      };
      this.emit("error:operation", errorEvent);
      return {
        healthy: false,
        runningCount: 0,
        timeoutTasks: [],
        errorTasks: [],
        checkedAt: now,
        issues: [{
          type: "error",
          message: `\u5065\u5EB7\u68C0\u67E5\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`,
          severity: "high"
        }]
      };
    }
  }
  /**
   * 获取统计信息
   */
  getStats() {
    const memories = Array.from(this.memories.values());
    const completed = memories.filter((m) => m.status === "succeeded");
    const failed = memories.filter((m) => m.status === "failed");
    const running = memories.filter((m) => m.status === "running");
    const durations = completed.filter((m) => m.duration !== void 0).map((m) => m.duration);
    const averageDuration = durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
    const total = completed.length + failed.length;
    const successRate = total > 0 ? completed.length / total : 0;
    return {
      totalTasks: this.memories.size,
      runningTasks: running.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      averageDuration,
      successRate,
      activeTimers: this.healthCheckTimer ? 1 : 0
    };
  }
  // ==================== 私有方法 ====================
  /**
   * 确保已初始化
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new SessionTaskManagerError(
        "NOT_INITIALIZED",
        "SessionTaskManager not initialized, call initialize() first"
      );
    }
    if (this.destroyed) {
      throw new SessionTaskManagerError(
        "DESTROYED",
        "SessionTaskManager has been destroyed"
      );
    }
  }
  /**
   * 验证API可用性
   */
  verifyApiAvailability() {
    const availability = this.bridge.checkApiAvailability();
    if (!availability.taskFlow) {
      throw new SessionTaskManagerError(
        "API_NOT_AVAILABLE",
        "TaskFlow API not available"
      );
    }
    if (!availability.tasks) {
      throw new SessionTaskManagerError(
        "API_NOT_AVAILABLE",
        "Tasks API not available"
      );
    }
  }
  /**
   * 启动健康检查
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        console.error("Health check failed:", error);
      });
    }, this.config.healthCheckIntervalMs);
  }
  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = void 0;
    }
  }
  /**
   * 应用任务过滤器
   */
  applyTaskFilter(tasks, filter) {
    let filtered = tasks;
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter((task) => {
        const taskStatus = task.status;
        return statuses.some((s) => s === taskStatus);
      });
    }
    if (filter.runtime) {
      const runtimes = Array.isArray(filter.runtime) ? filter.runtime : [filter.runtime];
      filtered = filtered.filter((task) => {
        const taskRuntime = task.runtime;
        return runtimes.some((r) => r === taskRuntime);
      });
    }
    if (filter.label) {
      filtered = filtered.filter(
        (task) => task.title && task.title.includes(filter.label)
      );
    }
    if (filter.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    return filtered;
  }
  // ==================== 依赖管理 ====================
  /**
   * 初始化依赖管理器
   *
   * 创建 DependencyManager 和 DependencyEventListener 实例，
   * 并注册 dependency:ready 事件监听器，用于自动触发就绪任务
   *
   * @param options 依赖管理器配置选项
   */
  initializeDependencyManager(options) {
    this.ensureInitialized();
    if (this.dependencyManager) {
      throw new SessionTaskManagerError(
        "ALREADY_INITIALIZED",
        "DependencyManager already initialized"
      );
    }
    this.dependencyManager = new DependencyManager();
    this.dependencyEventListener = new DependencyEventListener(
      this.eventEmitter,
      this.dependencyManager,
      {
        autoStart: true,
        enableLogging: options?.enableLogging ?? false,
        errorHandling: options?.errorHandling ?? "log"
      }
    );
    this.dependencyReadyHandler = this.dependencyManager.getEventEmitter().on(
      "dependency:ready",
      (event) => {
        this.handleDependencyReady(event.taskId);
      }
    );
  }
  /**
   * 获取依赖管理器实例
   *
   * @returns DependencyManager 实例，未初始化时返回 undefined
   */
  getDependencyManager() {
    return this.dependencyManager;
  }
  /**
   * 获取任务的依赖状态
   *
   * @param taskId 任务 ID
   * @returns 依赖状态，未注册依赖时返回 undefined
   */
  async getTaskDependencyState(taskId) {
    this.ensureInitialized();
    if (!this.dependencyManager) {
      throw new SessionTaskManagerError(
        "DEPENDENCY_NOT_INITIALIZED",
        "DependencyManager not initialized, call initializeDependencyManager() first"
      );
    }
    return this.dependencyManager.getDependencyState(taskId);
  }
  /**
   * 获取所有被阻塞的任务
   *
   * @returns 被阻塞的任务 ID 列表
   */
  async getBlockedTasks() {
    this.ensureInitialized();
    if (!this.dependencyManager) {
      throw new SessionTaskManagerError(
        "DEPENDENCY_NOT_INITIALIZED",
        "DependencyManager not initialized, call initializeDependencyManager() first"
      );
    }
    return this.dependencyManager.getBlockedTasks();
  }
  /**
   * 获取依赖图
   *
   * @returns 依赖图结构
   */
  async getDependencyGraph() {
    this.ensureInitialized();
    if (!this.dependencyManager) {
      throw new SessionTaskManagerError(
        "DEPENDENCY_NOT_INITIALIZED",
        "DependencyManager not initialized, call initializeDependencyManager() first"
      );
    }
    return this.dependencyManager.getDependencyGraph();
  }
  /**
   * 动态添加依赖
   *
   * 在运行时为已存在的任务添加新的前置依赖
   *
   * @param taskId 任务 ID
   * @param dependsOn 新增的前置依赖任务 ID
   * @param options 依赖配置选项
   */
  async addDependency(taskId, dependsOn, options) {
    this.ensureInitialized();
    if (!this.dependencyManager) {
      throw new SessionTaskManagerError(
        "DEPENDENCY_NOT_INITIALIZED",
        "DependencyManager not initialized, call initializeDependencyManager() first"
      );
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const dependency = {
      taskId,
      dependsOn,
      type: options?.type ?? "hard",
      condition: options?.condition ?? "all",
      timeout: options?.timeout ?? 0,
      onFailure: options?.onFailure ?? "block",
      fallbackTaskId: options?.fallbackTaskId,
      createdAt: now,
      updatedAt: now
    };
    try {
      await this.dependencyManager.register(dependency);
    } catch (error) {
      if (error instanceof Error && error.name === "CycleDetectedError") {
        throw new SessionTaskManagerError(
          "DEPENDENCY_CYCLE_DETECTED",
          error.message,
          { taskId, dependsOn, originalError: error }
        );
      }
      throw new SessionTaskManagerError(
        "DEPENDENCY_REGISTER_FAILED",
        `Failed to register dependency: ${error instanceof Error ? error.message : String(error)}`,
        { taskId, dependsOn, originalError: error }
      );
    }
  }
  /**
   * 动态移除依赖
   *
   * @param taskId 任务 ID
   */
  async removeDependency(taskId) {
    this.ensureInitialized();
    if (!this.dependencyManager) {
      throw new SessionTaskManagerError(
        "DEPENDENCY_NOT_INITIALIZED",
        "DependencyManager not initialized, call initializeDependencyManager() first"
      );
    }
    await this.dependencyManager.unregister(taskId);
  }
  // ==================== 依赖管理私有方法 ====================
  /**
   * 注册任务依赖
   *
   * 在 createMainTask 中调用，将任务选项中的依赖配置注册到 DependencyManager
   *
   * @param taskId 任务 ID
   * @param options 任务创建选项（包含依赖配置）
   */
  async registerTaskDependency(taskId, options) {
    if (!this.dependencyManager) {
      this.initializeDependencyManager();
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const dependency = {
      taskId,
      dependsOn: options.dependsOn,
      type: options.dependencyType ?? "hard",
      condition: options.dependencyCondition ?? "all",
      timeout: options.dependencyTimeout ?? 0,
      onFailure: options.dependencyOnFailure ?? "block",
      fallbackTaskId: options.fallbackTaskId,
      createdAt: now,
      updatedAt: now
    };
    try {
      await this.dependencyManager.register(dependency);
    } catch (error) {
      if (error instanceof Error && error.name === "CycleDetectedError") {
        throw new SessionTaskManagerError(
          "DEPENDENCY_CYCLE_DETECTED",
          error.message,
          { taskId, dependsOn: options.dependsOn, originalError: error }
        );
      }
      throw new SessionTaskManagerError(
        "DEPENDENCY_REGISTER_FAILED",
        `Failed to register dependency: ${error instanceof Error ? error.message : String(error)}`,
        { taskId, dependsOn: options.dependsOn, originalError: error }
      );
    }
  }
  /**
   * 处理依赖就绪事件
   *
   * 当 dependency:ready 事件触发时，自动执行就绪任务
   *
   * @param taskId 就绪的任务 ID
   */
  async handleDependencyReady(taskId) {
    this.emit("task:started", {
      taskId,
      flowId: taskId,
      timestamp: Date.now()
    });
  }
};

// src/core/security/audit-logger.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var DEFAULT_CONFIG = {
  bufferSize: 100,
  flushIntervalMs: 5e3,
  // 5秒
  sensitiveFields: ["userId", "sessionKey", "parameters", "metadata"],
  enableIndex: true,
  retentionDays: 90
};
var AuditLogger = class {
  constructor(config) {
    /** 日志缓冲区 */
    this.buffer = [];
    /** 索引缓存 */
    this.indexCache = /* @__PURE__ */ new Map();
    const { encryptor, ...restConfig } = config;
    this.config = {
      ...DEFAULT_CONFIG,
      ...restConfig,
      encryptor
    };
    this.eventEmitter = new EventEmitter();
    this.stats = this.initStats();
  }
  /**
   * 初始化审计日志器
   */
  async initialize() {
    if (!this.config.enabled) {
      return;
    }
    if (!fs.existsSync(this.config.logDir)) {
      await fs.promises.mkdir(this.config.logDir, { recursive: true });
    }
    this.currentLogFile = this.getLogFilePath(/* @__PURE__ */ new Date());
    this.startFlushTimer();
    if (this.config.encryptor && !this.config.encryptor.isInitialized()) {
      await this.config.encryptor.initialize();
    }
  }
  /**
   * 记录审计日志
   */
  async log(operation, targetType, action, options) {
    if (!this.config.enabled) {
      return this.createEntry(operation, targetType, action, options || {});
    }
    const entry = this.createEntry(operation, targetType, action, options || {});
    if (this.config.encryptor && entry.parameters) {
      entry.parameters = await this.encryptSensitiveData(entry.parameters);
    }
    this.buffer.push(entry);
    this.updateStats(entry);
    if (this.config.enableIndex) {
      this.updateIndex(entry);
    }
    this.eventEmitter.emit("audit:logged", { entry });
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }
    return entry;
  }
  /**
   * 查询审计日志
   */
  async query(filter) {
    if (!this.config.enabled) {
      return [];
    }
    await this.flush();
    const logFiles = this.getLogFiles(filter?.startTime, filter?.endTime);
    const entries = [];
    for (const file of logFiles) {
      const fileEntries = await this.loadLogFile(file);
      const filtered = this.applyFilter(fileEntries, filter);
      entries.push(...filtered);
    }
    if (filter?.offset) {
      entries.splice(0, filter.offset);
    }
    if (filter?.limit && entries.length > filter.limit) {
      entries.splice(filter.limit);
    }
    if (this.config.encryptor) {
      for (const entry of entries) {
        if (entry.parameters) {
          try {
            entry.parameters = await this.decryptSensitiveData(entry.parameters);
          } catch {
          }
        }
      }
    }
    return entries;
  }
  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * 刷新统计信息（重新计算）
   */
  async refreshStats() {
    const entries = await this.query();
    this.stats = this.calculateStats(entries);
    return this.stats;
  }
  /**
   * 强制刷盘
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }
    const entriesToFlush = [...this.buffer];
    this.buffer = [];
    try {
      await this.writeToFile(entriesToFlush);
      this.eventEmitter.emit("audit:flushed", { count: entriesToFlush.length });
    } catch (error) {
      this.buffer.unshift(...entriesToFlush);
      this.eventEmitter.emit("audit:logged", {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  /**
   * 注册事件监听器
   */
  on(eventType, listener) {
    return this.eventEmitter.on(eventType, listener);
  }
  /**
   * 检查是否启用
   */
  isEnabled() {
    return this.config.enabled;
  }
  /**
   * 销毁审计日志器
   */
  async destroy() {
    this.stopFlushTimer();
    await this.flush();
    this.indexCache.clear();
    this.eventEmitter.clearAll();
  }
  // ==================== 私有方法 ====================
  /**
   * 创建日志条目
   */
  createEntry(operation, targetType, action, options) {
    return {
      id: crypto.randomBytes(16).toString("hex"),
      timestamp: Date.now(),
      sessionKey: options.sessionKey || "unknown",
      userId: options.userId,
      operation,
      targetType,
      targetId: options.targetId,
      action,
      parameters: options.parameters,
      result: options.result || "success",
      error: options.error,
      metadata: options.metadata,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      category: options.category || this.determineCategory(operation),
      severity: options.severity || this.determineSeverity(operation, options.result)
    };
  }
  /**
   * 确定日志分类
   */
  determineCategory(operation) {
    if (["login", "logout", "access"].includes(operation)) {
      return "security";
    }
    if (["encrypt", "decrypt", "key_rotate"].includes(operation)) {
      return "security";
    }
    if (["config"].includes(operation)) {
      return "access";
    }
    return "operation";
  }
  /**
   * 确定严重级别
   */
  determineSeverity(operation, result) {
    if (result === "failure") {
      return "error";
    }
    if (["login", "logout", "key_rotate", "encrypt", "decrypt"].includes(operation)) {
      return "warn";
    }
    if (["delete", "cancel"].includes(operation)) {
      return "warn";
    }
    return "info";
  }
  /**
   * 加密敏感数据
   */
  async encryptSensitiveData(data) {
    const encryptedData = {};
    for (const [key, value] of Object.entries(data)) {
      if (this.config.sensitiveFields.includes(key) && value !== void 0 && value !== null) {
        try {
          const encrypted = await this.config.encryptor.encrypt(
            typeof value === "object" ? JSON.stringify(value) : String(value)
          );
          encryptedData[key] = { _encrypted: true, data: encrypted };
        } catch {
          encryptedData[key] = value;
        }
      } else {
        encryptedData[key] = value;
      }
    }
    return encryptedData;
  }
  /**
   * 解密敏感数据
   */
  async decryptSensitiveData(data) {
    const decryptedData = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null && "_encrypted" in value) {
        try {
          const encryptedData = value.data;
          const decrypted = await this.config.encryptor.decryptToString(encryptedData);
          decryptedData[key] = decrypted;
        } catch {
          decryptedData[key] = value;
        }
      } else {
        decryptedData[key] = value;
      }
    }
    return decryptedData;
  }
  /**
   * 写入日志到文件
   */
  async writeToFile(entries) {
    if (!this.currentLogFile) {
      this.currentLogFile = this.getLogFilePath(/* @__PURE__ */ new Date());
    }
    const today = this.getLogFilePath(/* @__PURE__ */ new Date());
    if (today !== this.currentLogFile) {
      this.currentLogFile = today;
    }
    const lines = entries.map((entry) => JSON.stringify(entry));
    const content = lines.join("\n") + "\n";
    await fs.promises.appendFile(this.currentLogFile, content, "utf-8");
  }
  /**
   * 加载日志文件
   */
  async loadLogFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((entry) => entry !== null);
  }
  /**
   * 获取日志文件路径
   */
  getLogFilePath(date) {
    const dateStr = date.toISOString().split("T")[0];
    return path.join(this.config.logDir, `audit-${dateStr}.json`);
  }
  /**
   * 获取时间范围内的日志文件
   */
  getLogFiles(startTime, endTime) {
    const files = fs.readdirSync(this.config.logDir).filter((file) => file.startsWith("audit-") && file.endsWith(".json")).sort();
    if (!startTime && !endTime) {
      return files.map((file) => path.join(this.config.logDir, file));
    }
    const result = [];
    const now = Date.now();
    for (const file of files) {
      const dateStr = file.replace("audit-", "").replace(".json", "");
      const fileDate = new Date(dateStr).getTime();
      const fileEnd = fileDate + 24 * 60 * 60 * 1e3 - 1;
      if (startTime && fileEnd < startTime) continue;
      if (endTime && fileDate > endTime) continue;
      result.push(path.join(this.config.logDir, file));
    }
    return result;
  }
  /**
   * 应用过滤器
   */
  applyFilter(entries, filter) {
    if (!filter) return entries;
    let filtered = entries;
    if (filter.startTime) {
      filtered = filtered.filter((e) => e.timestamp >= filter.startTime);
    }
    if (filter.endTime) {
      filtered = filtered.filter((e) => e.timestamp <= filter.endTime);
    }
    if (filter.operation) {
      const ops = Array.isArray(filter.operation) ? filter.operation : [filter.operation];
      filtered = filtered.filter((e) => ops.includes(e.operation));
    }
    if (filter.targetType) {
      const types = Array.isArray(filter.targetType) ? filter.targetType : [filter.targetType];
      filtered = filtered.filter((e) => types.includes(e.targetType));
    }
    if (filter.result) {
      const results = Array.isArray(filter.result) ? filter.result : [filter.result];
      filtered = filtered.filter((e) => results.includes(e.result));
    }
    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      filtered = filtered.filter((e) => categories.includes(e.category));
    }
    if (filter.severity) {
      const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      filtered = filtered.filter((e) => severities.includes(e.severity));
    }
    if (filter.sessionKey) {
      filtered = filtered.filter((e) => e.sessionKey === filter.sessionKey);
    }
    if (filter.userId) {
      filtered = filtered.filter((e) => e.userId === filter.userId);
    }
    return filtered;
  }
  /**
   * 初始化统计信息
   */
  initStats() {
    return {
      totalEntries: 0,
      byCategory: {
        operation: 0,
        security: 0,
        performance: 0,
        access: 0
      },
      bySeverity: {
        info: 0,
        warn: 0,
        error: 0,
        critical: 0
      },
      byOperation: {},
      byResult: {
        success: 0,
        failure: 0,
        partial: 0
      },
      timeRange: {
        earliest: null,
        latest: null
      }
    };
  }
  /**
   * 更新统计信息
   */
  updateStats(entry) {
    this.stats.totalEntries++;
    this.stats.byCategory[entry.category]++;
    this.stats.bySeverity[entry.severity]++;
    this.stats.byResult[entry.result]++;
    const opCount = this.stats.byOperation[entry.operation] || 0;
    this.stats.byOperation[entry.operation] = opCount + 1;
    if (this.stats.timeRange.earliest === null || entry.timestamp < this.stats.timeRange.earliest) {
      this.stats.timeRange.earliest = entry.timestamp;
    }
    if (this.stats.timeRange.latest === null || entry.timestamp > this.stats.timeRange.latest) {
      this.stats.timeRange.latest = entry.timestamp;
    }
  }
  /**
   * 从日志条目计算统计信息
   */
  calculateStats(entries) {
    const stats = this.initStats();
    for (const entry of entries) {
      this.updateStatsToStats(stats, entry);
    }
    return stats;
  }
  /**
   * 更新统计信息到指定的 stats 对象
   */
  updateStatsToStats(stats, entry) {
    stats.totalEntries++;
    stats.byCategory[entry.category]++;
    stats.bySeverity[entry.severity]++;
    stats.byResult[entry.result]++;
    const opCount = stats.byOperation[entry.operation] || 0;
    stats.byOperation[entry.operation] = opCount + 1;
    if (stats.timeRange.earliest === null || entry.timestamp < stats.timeRange.earliest) {
      stats.timeRange.earliest = entry.timestamp;
    }
    if (stats.timeRange.latest === null || entry.timestamp > stats.timeRange.latest) {
      stats.timeRange.latest = entry.timestamp;
    }
  }
  /**
   * 更新索引
   */
  updateIndex(entry) {
    const sessionEntries = this.indexCache.get(entry.sessionKey) || [];
    sessionEntries.push(entry);
    if (sessionEntries.length > 1e3) {
      sessionEntries.shift();
    }
    this.indexCache.set(entry.sessionKey, sessionEntries);
    if (entry.userId) {
      const userEntries = this.indexCache.get(`user:${entry.userId}`) || [];
      userEntries.push(entry);
      if (userEntries.length > 1e3) {
        userEntries.shift();
      }
      this.indexCache.set(`user:${entry.userId}`, userEntries);
    }
  }
  /**
   * 启动刷盘定时器
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error("Audit log flush error:", error);
      });
    }, this.config.flushIntervalMs);
  }
  /**
   * 停止刷盘定时器
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = void 0;
    }
  }
  /**
   * 清理过期日志
   */
  async cleanup() {
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1e3;
    const cutoff = Date.now() - retentionMs;
    const files = fs.readdirSync(this.config.logDir).filter((file) => file.startsWith("audit-") && file.endsWith(".json"));
    for (const file of files) {
      const dateStr = file.replace("audit-", "").replace(".json", "");
      const fileDate = new Date(dateStr).getTime();
      if (fileDate < cutoff) {
        await fs.promises.unlink(path.join(this.config.logDir, file));
      }
    }
  }
};

// src/core/security/data-encryptor.ts
var crypto2 = __toESM(require("crypto"));
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var DEFAULT_CONFIG2 = {
  algorithm: "aes-256-gcm",
  envKeyName: "OPENCLAW_TASK_PLUGIN_KEY",
  rotationIntervalMs: 0,
  // 默认不自动轮换
  sensitiveFields: ["userId", "password", "token", "secret", "apiKey", "privateKey"]
};
var DataEncryptor = class {
  constructor(config = {}) {
    /** 当前密钥 */
    this.currentKey = null;
    /** 密钥信息 */
    this.keyInfo = null;
    /** 历史密钥（用于解密旧数据） */
    this.keyHistory = /* @__PURE__ */ new Map();
    this.config = {
      ...DEFAULT_CONFIG2,
      ...config
    };
  }
  /**
   * 初始化加密器
   * 
   * 优先级：环境变量 > 配置文件 > 主密钥参数 > 生成新密钥
   */
  async initialize() {
    if (this.config.envKeyName && process.env[this.config.envKeyName]) {
      const keyBase64 = process.env[this.config.envKeyName];
      this.currentKey = Buffer.from(keyBase64, "base64");
      this.keyInfo = this.createKeyInfo();
      return;
    }
    if (this.config.keyFilePath) {
      try {
        const keyData = await this.loadKeyFromFile(this.config.keyFilePath);
        if (keyData) {
          this.currentKey = keyData;
          this.keyInfo = this.createKeyInfo();
          return;
        }
      } catch (error) {
      }
    }
    if (this.config.masterKey) {
      this.currentKey = Buffer.from(this.config.masterKey, "base64");
      this.keyInfo = this.createKeyInfo();
      return;
    }
    this.currentKey = crypto2.randomBytes(32);
    this.keyInfo = this.createKeyInfo();
    if (this.config.keyFilePath) {
      await this.saveKeyToFile(this.config.keyFilePath);
    }
  }
  /**
   * 加密数据
   * 
   * @param data 要加密的数据
   * @returns 加密结果
   */
  async encrypt(data) {
    this.ensureInitialized();
    const plaintext = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), "utf-8");
    const iv = crypto2.randomBytes(12);
    const cipher = crypto2.createCipheriv(
      "aes-256-gcm",
      this.currentKey,
      iv
    );
    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      algorithm: this.config.algorithm,
      timestamp: Date.now()
    };
  }
  /**
   * 解密数据
   * 
   * @param encryptedData 加密数据
   * @returns 解密后的数据
   */
  async decrypt(encryptedData) {
    this.ensureInitialized();
    const { encrypted, iv, authTag } = encryptedData;
    const encryptedBuffer = Buffer.from(encrypted, "base64");
    const ivBuffer = Buffer.from(iv, "base64");
    const authTagBuffer = Buffer.from(authTag, "base64");
    try {
      return this.decryptWithKey(this.currentKey, encryptedBuffer, ivBuffer, authTagBuffer);
    } catch (error) {
      for (const [keyId, key] of this.keyHistory) {
        try {
          return this.decryptWithKey(key, encryptedBuffer, ivBuffer, authTagBuffer);
        } catch {
        }
      }
      throw new Error("Decryption failed: no valid key found");
    }
  }
  /**
   * 解密为字符串
   */
  async decryptToString(encryptedData) {
    const buffer = await this.decrypt(encryptedData);
    return buffer.toString("utf-8");
  }
  /**
   * 解密为 JSON 对象
   */
  async decryptToJson(encryptedData) {
    const json = await this.decryptToString(encryptedData);
    return JSON.parse(json);
  }
  /**
   * 加密对象中的敏感字段
   * 
   * @param obj 要处理的对象
   * @param fields 要加密的字段列表（可选，默认使用配置中的 sensitiveFields）
   * @returns 加密后的对象
   */
  async encryptSensitiveFields(obj, fields) {
    this.ensureInitialized();
    const fieldsToEncrypt = fields || this.config.sensitiveFields;
    const encryptedFields = [];
    const result = { ...obj };
    for (const field of fieldsToEncrypt) {
      if (field in obj && obj[field] !== void 0 && obj[field] !== null) {
        const value = obj[field];
        const encrypted = await this.encrypt(
          typeof value === "object" ? JSON.stringify(value) : String(value)
        );
        result[field] = JSON.stringify(encrypted);
        encryptedFields.push(field);
      }
    }
    if (encryptedFields.length > 0) {
      result._encryptedFields = encryptedFields;
    }
    return result;
  }
  /**
   * 解密对象中的敏感字段
   */
  async decryptSensitiveFields(obj) {
    this.ensureInitialized();
    const result = { ...obj };
    const encryptedFields = obj._encryptedFields || [];
    for (const field of encryptedFields) {
      if (field in obj) {
        const encryptedValue = obj[field];
        if (typeof encryptedValue === "string") {
          try {
            const encryptedData = JSON.parse(encryptedValue);
            const decrypted = await this.decryptToString(encryptedData);
            result[field] = decrypted;
          } catch {
          }
        }
      }
    }
    delete result["_encryptedFields"];
    return result;
  }
  /**
   * 轮换密钥
   */
  async rotateKey() {
    this.ensureInitialized();
    const oldKeyId = this.keyInfo.keyId;
    const oldKey = this.currentKey;
    try {
      const newKey = crypto2.randomBytes(32);
      this.keyHistory.set(oldKeyId, oldKey);
      this.currentKey = newKey;
      this.keyInfo = this.createKeyInfo();
      this.keyInfo.rotationCount++;
      this.keyInfo.lastRotatedAt = Date.now();
      if (this.config.keyFilePath) {
        await this.saveKeyToFile(this.config.keyFilePath);
      }
      return {
        oldKeyId,
        newKeyId: this.keyInfo.keyId,
        rotatedAt: Date.now(),
        success: true
      };
    } catch (error) {
      return {
        oldKeyId,
        newKeyId: oldKeyId,
        rotatedAt: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 获取密钥信息
   */
  getKeyInfo() {
    return this.keyInfo ? { ...this.keyInfo } : null;
  }
  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this.currentKey !== null && this.keyInfo !== null;
  }
  /**
   * 销毁加密器
   */
  destroy() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = void 0;
    }
    if (this.currentKey) {
      this.currentKey.fill(0);
      this.currentKey = null;
    }
    for (const key of this.keyHistory.values()) {
      key.fill(0);
    }
    this.keyHistory.clear();
    this.keyInfo = null;
  }
  // ==================== 私有方法 ====================
  /**
   * 确保已初始化
   */
  ensureInitialized() {
    if (!this.currentKey || !this.keyInfo) {
      throw new Error("DataEncryptor not initialized. Call initialize() first.");
    }
  }
  /**
   * 使用指定密钥解密
   */
  decryptWithKey(key, encrypted, iv, authTag) {
    const decipher = crypto2.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    return decrypted;
  }
  /**
   * 创建密钥信息
   */
  createKeyInfo() {
    return {
      keyId: crypto2.randomBytes(8).toString("hex"),
      createdAt: Date.now(),
      active: true,
      rotationCount: 0
    };
  }
  /**
   * 从文件加载密钥
   */
  async loadKeyFromFile(filePath) {
    if (!fs2.existsSync(filePath)) {
      return null;
    }
    const data = await fs2.promises.readFile(filePath, "utf-8");
    const keyData = JSON.parse(data);
    return Buffer.from(keyData.key, "base64");
  }
  /**
   * 保存密钥到文件
   */
  async saveKeyToFile(filePath) {
    const dir = path2.dirname(filePath);
    if (!fs2.existsSync(dir)) {
      await fs2.promises.mkdir(dir, { recursive: true });
    }
    const keyData = {
      keyId: this.keyInfo.keyId,
      key: this.currentKey.toString("base64"),
      createdAt: this.keyInfo.createdAt,
      rotationCount: this.keyInfo.rotationCount
    };
    await fs2.promises.writeFile(filePath, JSON.stringify(keyData, null, 2), {
      mode: 384
      // 仅所有者可读写
    });
  }
};

// src/core/security/access-control.ts
var DEFAULT_ROLE_PERMISSIONS = {
  admin: [
    "task:create",
    "task:read",
    "task:update",
    "task:delete",
    "task:cancel",
    "flow:create",
    "flow:read",
    "flow:update",
    "flow:delete",
    "flow:cancel",
    "memory:read",
    "memory:write",
    "config:read",
    "config:write",
    "audit:read",
    "audit:export",
    "key:manage"
  ],
  operator: [
    "task:create",
    "task:read",
    "task:update",
    "task:cancel",
    "flow:create",
    "flow:read",
    "flow:update",
    "flow:cancel",
    "memory:read",
    "memory:write",
    "config:read",
    "audit:read"
  ],
  viewer: [
    "task:read",
    "flow:read",
    "memory:read",
    "config:read",
    "audit:read"
  ],
  guest: [
    "task:read",
    "flow:read"
  ]
};
var AccessControl = class {
  constructor(config, auditLogger) {
    /** 访问规则列表 */
    this.rules = [];
    /** 用户角色映射 */
    this.userRoles = /* @__PURE__ */ new Map();
    /** 角色权限映射 */
    this.rolePermissions = /* @__PURE__ */ new Map();
    /** 访问日志 */
    this.accessLogs = [];
    /** 统计信息 */
    this.stats = {
      allowedCount: 0,
      deniedCount: 0
    };
    this.config = {
      defaultPolicy: config.defaultPolicy || "deny",
      rules: config.rules || [],
      rolePermissions: config.rolePermissions || DEFAULT_ROLE_PERMISSIONS,
      userRoles: config.userRoles || {}
    };
    this.auditLogger = auditLogger;
    this.eventEmitter = new EventEmitter();
    this.initRolePermissions();
    this.initUserRoles();
    this.initRules();
  }
  /**
   * 检查访问权限
   * 
   * @param userId 用户ID
   * @param operation 操作
   * @param resourceType 资源类型
   * @param resourceId 资源ID（可选）
   * @param context 上下文信息（可选）
   */
  async checkAccess(userId, operation, resourceType, resourceId, context) {
    const now = Date.now();
    const role = this.getUserRole(userId);
    const ruleResult = await this.checkRules(userId, operation, resourceType, resourceId);
    if (ruleResult.matched) {
      const entry2 = this.createAccessLog({
        userId,
        sessionKey: context?.sessionKey || "unknown",
        operation,
        resourceType,
        resourceId,
        allowed: ruleResult.allowed,
        reason: ruleResult.reason,
        matchedRuleId: ruleResult.ruleId,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent
      });
      await this.logAccess(entry2);
      return {
        allowed: ruleResult.allowed,
        matchedRule: ruleResult.rule,
        reason: ruleResult.reason,
        decidedAt: now
      };
    }
    const permission = this.getPermission(operation, resourceType);
    const hasPermission = this.checkRolePermission(role, permission);
    const allowed = hasPermission || this.config.defaultPolicy === "allow";
    const entry = this.createAccessLog({
      userId,
      sessionKey: context?.sessionKey || "unknown",
      operation,
      resourceType,
      resourceId,
      allowed,
      reason: allowed ? void 0 : `No permission: ${permission}`,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    });
    await this.logAccess(entry);
    return {
      allowed,
      reason: allowed ? void 0 : `No permission: ${permission}`,
      decidedAt: now
    };
  }
  /**
   * 添加访问规则
   */
  addRule(rule) {
    const newRule = {
      ...rule,
      id: this.generateRuleId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.rules.push(newRule);
    this.sortRules();
    return newRule;
  }
  /**
   * 更新访问规则
   */
  updateRule(ruleId, updates) {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return void 0;
    const rule = this.rules[index];
    this.rules[index] = {
      ...rule,
      ...updates,
      updatedAt: Date.now()
    };
    this.sortRules();
    return this.rules[index];
  }
  /**
   * 删除访问规则
   */
  removeRule(ruleId) {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return false;
    this.rules.splice(index, 1);
    return true;
  }
  /**
   * 获取所有规则
   */
  getRules() {
    return [...this.rules];
  }
  /**
   * 设置用户角色
   */
  setUserRole(userId, role) {
    this.userRoles.set(userId, role);
  }
  /**
   * 获取用户角色
   */
  getUserRole(userId) {
    if (!userId) return "guest";
    return this.userRoles.get(userId) || "guest";
  }
  /**
   * 移除用户角色
   */
  removeUserRole(userId) {
    this.userRoles.delete(userId);
  }
  /**
   * 设置角色权限
   */
  setRolePermissions(role, permissions) {
    this.rolePermissions.set(role, permissions);
  }
  /**
   * 获取角色权限
   */
  getRolePermissions(role) {
    return [...this.rolePermissions.get(role) || []];
  }
  /**
   * 获取访问日志
   */
  getAccessLogs(filter) {
    let logs = [...this.accessLogs];
    if (filter?.userId) {
      logs = logs.filter((l) => l.userId === filter.userId);
    }
    if (filter?.allowed !== void 0) {
      logs = logs.filter((l) => l.allowed === filter.allowed);
    }
    if (filter?.startTime) {
      logs = logs.filter((l) => l.timestamp >= filter.startTime);
    }
    if (filter?.endTime) {
      logs = logs.filter((l) => l.timestamp <= filter.endTime);
    }
    if (filter?.limit && logs.length > filter.limit) {
      logs = logs.slice(-filter.limit);
    }
    return logs;
  }
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      allowedCount: this.stats.allowedCount,
      deniedCount: this.stats.deniedCount,
      totalRules: this.rules.length,
      totalUsers: this.userRoles.size
    };
  }
  /**
   * 注册事件监听器
   */
  on(eventType, listener) {
    return this.eventEmitter.on(eventType, listener);
  }
  /**
   * 销毁访问控制模块
   */
  destroy() {
    this.rules = [];
    this.userRoles.clear();
    this.rolePermissions.clear();
    this.accessLogs = [];
    this.eventEmitter.clearAll();
  }
  // ==================== 私有方法 ====================
  /**
   * 初始化角色权限映射
   */
  initRolePermissions() {
    const mappings = this.config.rolePermissions || DEFAULT_ROLE_PERMISSIONS;
    for (const [role, permissions] of Object.entries(mappings)) {
      if (permissions) {
        this.rolePermissions.set(role, permissions);
      }
    }
  }
  /**
   * 初始化用户角色映射
   */
  initUserRoles() {
    for (const [userId, role] of Object.entries(this.config.userRoles || {})) {
      this.userRoles.set(userId, role);
    }
  }
  /**
   * 初始化访问规则
   */
  initRules() {
    for (const rule of this.config.rules || []) {
      this.rules.push({
        ...rule,
        id: rule.id || this.generateRuleId(),
        createdAt: rule.createdAt || Date.now(),
        updatedAt: rule.updatedAt || Date.now()
      });
    }
    this.sortRules();
  }
  /**
   * 排序规则（按优先级降序）
   */
  sortRules() {
    this.rules.sort((a, b) => b.priority - a.priority);
  }
  /**
   * 检查自定义规则
   */
  async checkRules(userId, operation, resourceType, resourceId) {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      const userRole = this.getUserRole(userId);
      if (rule.role !== userRole) continue;
      const permission = this.getPermission(operation, resourceType);
      if (!rule.permissions.includes(permission)) continue;
      if (rule.resourcePattern && resourceId) {
        if (!this.matchPattern(resourceId, rule.resourcePattern)) {
          continue;
        }
      }
      const permissionGranted = rule.permissions.some((p) => p === permission);
      return {
        matched: true,
        allowed: permissionGranted,
        reason: permissionGranted ? void 0 : `Rule denied: ${rule.name}`,
        ruleId: rule.id,
        rule
      };
    }
    return { matched: false, allowed: false };
  }
  /**
   * 检查角色权限
   */
  checkRolePermission(role, permission) {
    const permissions = this.rolePermissions.get(role) || [];
    return permissions.includes(permission);
  }
  /**
   * 获取权限字符串
   */
  getPermission(operation, resourceType) {
    const resourceMap = {
      task: "task",
      flow: "flow",
      subtask: "task",
      memory: "memory",
      config: "config",
      session: "flow",
      audit_log: "audit",
      key: "key",
      access_rule: "config"
    };
    const resource = resourceMap[resourceType] || resourceType;
    return `${resource}:${operation}`;
  }
  /**
   * 匹配模式（支持通配符）
   */
  matchPattern(value, pattern) {
    const regex = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${regex}$`).test(value);
  }
  /**
   * 创建访问日志条目
   */
  createAccessLog(options) {
    return {
      id: this.generateLogId(),
      timestamp: Date.now(),
      userId: options.userId,
      sessionKey: options.sessionKey,
      operation: options.operation,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      allowed: options.allowed,
      reason: options.reason,
      matchedRuleId: options.matchedRuleId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent
    };
  }
  /**
   * 记录访问日志
   */
  async logAccess(entry) {
    this.accessLogs.push(entry);
    if (this.accessLogs.length > 1e4) {
      this.accessLogs.shift();
    }
    if (entry.allowed) {
      this.stats.allowedCount++;
    } else {
      this.stats.deniedCount++;
    }
    this.eventEmitter.emit(
      entry.allowed ? "access:allowed" : "access:denied",
      { entry }
    );
    if (this.auditLogger) {
      await this.auditLogger.log(
        "access",
        "session",
        entry.allowed ? "access_granted" : "access_denied",
        {
          sessionKey: entry.sessionKey,
          userId: entry.userId,
          targetId: entry.resourceId,
          parameters: {
            operation: entry.operation,
            resourceType: entry.resourceType
          },
          result: entry.allowed ? "success" : "failure",
          category: "access",
          severity: entry.allowed ? "info" : "warn"
        }
      );
    }
  }
  /**
   * 生成规则ID
   */
  generateRuleId() {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  /**
   * 生成日志ID
   */
  generateLogId() {
    return `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

// src/core/security/security-manager.ts
var DEFAULT_CONFIG3 = {
  enabled: true
};
var SecurityManager = class {
  constructor(config, bridge) {
    /** 安全事件记录 */
    this.securityEvents = [];
    /** 是否已初始化 */
    this.initialized = false;
    this.config = {
      ...DEFAULT_CONFIG3,
      ...config
    };
    this.bridge = bridge;
    this.eventEmitter = new EventEmitter();
    this.auditLogger = new AuditLogger({
      ...config.audit,
      enabled: config.audit.enabled && (config.enabled ?? true)
    });
    this.encryptor = new DataEncryptor(config.encryption);
    this.accessControl = new AccessControl(
      config.accessControl,
      config.audit.enabled ? this.auditLogger : void 0
    );
  }
  // ==================== 生命周期管理 ====================
  /**
   * 初始化安全管理器
   */
  async initialize() {
    if (this.initialized) {
      throw new Error("SecurityManager already initialized");
    }
    if (!this.config.enabled) {
      this.initialized = true;
      return;
    }
    try {
      await this.encryptor.initialize();
      if (this.config.audit.enabled) {
        this.auditLogger = new AuditLogger({
          ...this.config.audit,
          encryptor: this.encryptor
        });
        await this.auditLogger.initialize();
      }
      await this.logSecurityEvent("suspicious_activity", "initialize", {
        message: "SecurityManager initialized"
      });
      this.initialized = true;
      this.eventEmitter.emit("security:initialized", {
        timestamp: Date.now()
      });
    } catch (error) {
      throw new Error(`Failed to initialize SecurityManager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * 销毁安全管理器
   */
  async destroy() {
    if (!this.initialized) return;
    await this.logSecurityEvent("suspicious_activity", "destroy", {
      message: "SecurityManager destroyed"
    });
    await this.auditLogger.destroy();
    this.encryptor.destroy();
    this.accessControl.destroy();
    this.eventEmitter.clearAll();
    this.securityEvents = [];
    this.initialized = false;
    this.eventEmitter.emit("security:destroyed", {
      timestamp: Date.now()
    });
  }
  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this.initialized;
  }
  /**
   * 检查是否启用
   */
  isEnabled() {
    return this.config.enabled;
  }
  // ==================== 审计日志接口 ====================
  /**
   * 记录操作日志
   */
  async logOperation(operation, targetType, action, options) {
    this.ensureInitialized();
    return this.auditLogger.log(
      operation,
      targetType,
      action,
      options
    );
  }
  /**
   * 查询审计日志
   */
  async queryAuditLogs(filter) {
    this.ensureInitialized();
    return this.auditLogger.query(filter);
  }
  /**
   * 获取审计日志统计
   */
  getAuditStats() {
    this.ensureInitialized();
    return this.auditLogger.getStats();
  }
  /**
   * 刷新审计日志缓冲区
   */
  async flushAuditLogs() {
    this.ensureInitialized();
    await this.auditLogger.flush();
  }
  // ==================== 数据加密接口 ====================
  /**
   * 加密数据
   */
  async encryptData(data) {
    this.ensureInitialized();
    return this.encryptor.encrypt(data);
  }
  /**
   * 解密数据
   */
  async decryptData(encryptedData) {
    this.ensureInitialized();
    return this.encryptor.decryptToString(encryptedData);
  }
  /**
   * 解密数据为 JSON
   */
  async decryptDataToJson(encryptedData) {
    this.ensureInitialized();
    return this.encryptor.decryptToJson(encryptedData);
  }
  /**
   * 加密对象中的敏感字段
   */
  async encryptSensitiveFields(obj, fields) {
    this.ensureInitialized();
    return this.encryptor.encryptSensitiveFields(obj, fields);
  }
  /**
   * 解密对象中的敏感字段
   */
  async decryptSensitiveFields(obj) {
    this.ensureInitialized();
    return this.encryptor.decryptSensitiveFields(obj);
  }
  /**
   * 轮换加密密钥
   */
  async rotateEncryptionKey() {
    this.ensureInitialized();
    const result = await this.encryptor.rotateKey();
    await this.logSecurityEvent("key_rotated", "rotate", {
      success: result.success,
      oldKeyId: result.oldKeyId,
      newKeyId: result.newKeyId,
      error: result.error
    });
    if (!result.success) {
      await this.logSecurityEvent("encryption_failed", "rotate_failed", {
        error: result.error
      }, "error");
    }
    return result;
  }
  /**
   * 获取密钥信息
   */
  getKeyInfo() {
    this.ensureInitialized();
    return this.encryptor.getKeyInfo();
  }
  // ==================== 访问控制接口 ====================
  /**
   * 检查访问权限
   */
  async checkAccess(userId, operation, resourceType, resourceId, context) {
    this.ensureInitialized();
    return this.accessControl.checkAccess(userId, operation, resourceType, resourceId, context);
  }
  /**
   * 添加访问规则
   */
  addAccessRule(rule) {
    this.ensureInitialized();
    return this.accessControl.addRule(rule);
  }
  /**
   * 更新访问规则
   */
  updateAccessRule(ruleId, updates) {
    this.ensureInitialized();
    return this.accessControl.updateRule(ruleId, updates);
  }
  /**
   * 删除访问规则
   */
  removeAccessRule(ruleId) {
    this.ensureInitialized();
    return this.accessControl.removeRule(ruleId);
  }
  /**
   * 获取所有访问规则
   */
  getAccessRules() {
    this.ensureInitialized();
    return this.accessControl.getRules();
  }
  /**
   * 设置用户角色
   */
  setUserRole(userId, role) {
    this.ensureInitialized();
    this.accessControl.setUserRole(userId, role);
  }
  /**
   * 获取用户角色
   */
  getUserRole(userId) {
    if (!this.initialized) return "guest";
    return this.accessControl.getUserRole(userId);
  }
  /**
   * 获取角色权限
   */
  getRolePermissions(role) {
    this.ensureInitialized();
    return this.accessControl.getRolePermissions(role);
  }
  // ==================== 安全事件接口 ====================
  /**
   * 记录安全事件
   */
  async logSecurityEvent(type, action, details, severity = "info") {
    const event = {
      type,
      timestamp: Date.now(),
      details: {
        action,
        ...details
      },
      severity
    };
    this.securityEvents.push(event);
    if (this.securityEvents.length > 1e4) {
      this.securityEvents.shift();
    }
    this.eventEmitter.emit("security:event", { event });
    if (this.auditLogger.isEnabled()) {
      await this.auditLogger.log(
        "config",
        "audit_log",
        `security_${type}_${action}`,
        {
          category: "security",
          severity,
          parameters: details
        }
      );
    }
  }
  /**
   * 获取安全事件
   */
  getSecurityEvents(filter) {
    let events = [...this.securityEvents];
    if (filter?.type) {
      events = events.filter((e) => e.type === filter.type);
    }
    if (filter?.severity) {
      events = events.filter((e) => e.severity === filter.severity);
    }
    if (filter?.startTime) {
      events = events.filter((e) => e.timestamp >= filter.startTime);
    }
    if (filter?.endTime) {
      events = events.filter((e) => e.timestamp <= filter.endTime);
    }
    if (filter?.limit && events.length > filter.limit) {
      events = events.slice(-filter.limit);
    }
    return events;
  }
  // ==================== 状态报告 ====================
  /**
   * 获取安全状态报告
   */
  async getSecurityStatus() {
    this.ensureInitialized();
    const auditStats = this.auditLogger.getStats();
    const accessStats = this.accessControl.getStats();
    const keyInfo = this.encryptor.getKeyInfo();
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1e3;
    const last7d = now - 7 * 24 * 60 * 60 * 1e3;
    const securityEvents24h = this.securityEvents.filter((e) => e.timestamp >= last24h).length;
    const securityEvents7d = this.securityEvents.filter((e) => e.timestamp >= last7d).length;
    let securityScore = 100;
    if (!auditStats.timeRange.earliest) {
      securityScore -= 10;
    }
    const recentFailures = auditStats.byResult.failure;
    if (recentFailures > 10) {
      securityScore -= Math.min(20, Math.floor(recentFailures / 10) * 5);
    }
    const recentDenied = accessStats.deniedCount;
    if (recentDenied > 5) {
      securityScore -= Math.min(15, Math.floor(recentDenied / 5) * 3);
    }
    if (securityEvents24h > 5) {
      securityScore -= Math.min(15, Math.floor(securityEvents24h / 5) * 5);
    }
    securityScore = Math.max(0, Math.min(100, securityScore));
    return {
      auditLogger: {
        enabled: this.auditLogger.isEnabled(),
        totalEntries: auditStats.totalEntries,
        lastEntryTime: auditStats.timeRange.latest
      },
      encryption: {
        enabled: true,
        activeKeyId: keyInfo?.keyId || "unknown",
        keyCreatedAt: keyInfo?.createdAt || 0,
        rotationCount: keyInfo?.rotationCount || 0
      },
      accessControl: {
        enabled: true,
        totalRules: accessStats.totalRules,
        deniedCount: accessStats.deniedCount
      },
      securityEvents: {
        last24h: securityEvents24h,
        last7d: securityEvents7d
      },
      securityScore
    };
  }
  // ==================== 事件监听 ====================
  /**
   * 注册事件监听器
   */
  on(eventType, listener) {
    return this.eventEmitter.on(eventType, listener);
  }
  // ==================== 私有方法 ====================
  /**
   * 确保已初始化
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error("SecurityManager not initialized. Call initialize() first.");
    }
  }
};

// src/index.ts
var VERSION = "3.0.0";
var OPENCLAW_MIN_VERSION = "2026.4.9";
function checkOpenClawVersion(api) {
  if (!api?.runtime?.taskFlow?.fromToolContext) {
    return {
      compatible: false,
      reason: "OpenClaw taskFlow API not available. Requires OpenClaw >= 2026.4.9"
    };
  }
  if (!api?.runtime?.tasks?.runs?.fromToolContext) {
    return {
      compatible: false,
      reason: "OpenClaw tasks.runs API not available. Requires OpenClaw >= 2026.4.9"
    };
  }
  return {
    compatible: true
  };
}
function createBridge(config) {
  return new OpenClawBridge(config);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AccessControl,
  AuditLogger,
  DataEncryptor,
  EnhancedTaskError,
  OPENCLAW_MIN_VERSION,
  OpenClawBridge,
  SecurityManager,
  SessionTaskManager,
  SessionTaskManagerError,
  TaskOperationError,
  VERSION,
  checkOpenClawVersion,
  createBridge,
  isTaskRuntime,
  isTaskStatus
});
//# sourceMappingURL=index.js.map
