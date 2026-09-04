export type SelectionPoolSide = 'promise' | 'observable';

export interface SelectionBackendTaskView {
  id: number;
  workflowId: number;
  person: string;
  stage: string;
}

export interface SelectionBackendPoolSnapshot {
  side: SelectionPoolSide;
  capacity: number;
  active: SelectionBackendTaskView[];
  queued: SelectionBackendTaskView[];
  cancelled: SelectionBackendTaskView[];
}

export interface SelectionBackendTaskHooks {
  queued?: () => void;
  executing?: () => void;
  completed?: () => void;
  cancelled?: (location: 'active' | 'queued') => void;
}

export interface SelectionBackendTaskHandle {
  readonly completed: Promise<void>;
  cancel(): void;
}

interface SelectionBackendTask extends SelectionBackendTaskView {
  durationMs: number;
  hooks: SelectionBackendTaskHooks;
  timer?: number;
  resolve: () => void;
  reject: (error: DOMException) => void;
  settled: boolean;
}

export class SelectionBackendPool {
  private activeTasks: SelectionBackendTask[] = [];
  private queuedTasks: SelectionBackendTask[] = [];
  private cancelledTasks: SelectionBackendTaskView[] = [];
  private taskId = 0;

  constructor(
    readonly side: SelectionPoolSide,
    readonly capacity: number,
    private readonly onChange: (snapshot: SelectionBackendPoolSnapshot) => void
  ) {}

  get snapshot(): SelectionBackendPoolSnapshot {
    return {
      side: this.side,
      capacity: this.capacity,
      active: this.activeTasks.map((task) => this.view(task)),
      queued: this.queuedTasks.map((task) => this.view(task)),
      cancelled: [...this.cancelledTasks]
    };
  }

  enqueue(
    workflowId: number,
    person: string,
    stage: string,
    durationMs: number,
    hooks: SelectionBackendTaskHooks = {}
  ): SelectionBackendTaskHandle {
    let resolve!: () => void;
    let reject!: (error: DOMException) => void;
    const completed = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const task: SelectionBackendTask = {
      id: ++this.taskId, workflowId, person, stage, durationMs, hooks,
      resolve, reject, settled: false
    };

    if (this.activeTasks.length < this.capacity) this.start(task);
    else {
      this.queuedTasks.push(task);
      task.hooks.queued?.();
      this.emit();
    }

    return { completed, cancel: () => this.cancelTask(task) };
  }

  reset(): void {
    const tasks = [...this.activeTasks, ...this.queuedTasks];
    this.activeTasks = [];
    this.queuedTasks = [];
    this.cancelledTasks = [];
    for (const task of tasks) {
      if (task.timer !== undefined) window.clearTimeout(task.timer);
      if (!task.settled) {
        task.settled = true;
        task.reject(new DOMException('Backend pool reset', 'AbortError'));
      }
    }
    this.taskId = 0;
    this.emit();
  }

  private start(task: SelectionBackendTask): void {
    if (task.settled) return;
    this.activeTasks.push(task);
    task.hooks.executing?.();
    task.timer = window.setTimeout(() => this.completeTask(task), task.durationMs);
    this.emit();
  }

  private completeTask(task: SelectionBackendTask): void {
    if (task.settled) return;
    task.settled = true;
    this.activeTasks = this.activeTasks.filter((active) => active !== task);
    task.hooks.completed?.();
    task.resolve();
    this.emit();
    this.drain();
  }

  private cancelTask(task: SelectionBackendTask): void {
    if (task.settled) return;
    const wasActive = this.activeTasks.includes(task);
    const wasQueued = this.queuedTasks.includes(task);
    if (!wasActive && !wasQueued) return;
    task.settled = true;
    if (task.timer !== undefined) window.clearTimeout(task.timer);
    this.activeTasks = this.activeTasks.filter((active) => active !== task);
    this.queuedTasks = this.queuedTasks.filter((queued) => queued !== task);
    this.cancelledTasks = [this.view(task), ...this.cancelledTasks].slice(0, 5);
    task.hooks.cancelled?.(wasActive ? 'active' : 'queued');
    task.reject(new DOMException('Backend task cancelled', 'AbortError'));
    this.emit();
    if (wasActive) this.drain();
  }

  private drain(): void {
    while (this.activeTasks.length < this.capacity && this.queuedTasks.length) {
      this.start(this.queuedTasks.shift()!);
    }
  }

  private emit(): void { this.onChange(this.snapshot); }
  private view(task: SelectionBackendTask): SelectionBackendTaskView {
    return { id: task.id, workflowId: task.workflowId, person: task.person, stage: task.stage };
  }
}
