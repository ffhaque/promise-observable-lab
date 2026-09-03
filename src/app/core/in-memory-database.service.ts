import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Subject } from 'rxjs';
import { ComparisonRunnerService } from './comparison-runner.service';

export type DatabaseLane = 'promise' | 'observable';

export interface DatabaseStats {
  developers: number;
  teams: number;
  projects: number;
  developerSkills: number;
  totalRows: number;
}

export interface DatabaseQueryResult {
  term: string;
  matches: number;
  megabytes: number;
  rowsScanned: number;
  duration: number;
}

export interface CancelledQueryWork {
  rowsScanned: number;
  rowsAvoided: number;
}

export interface DatabaseLaneSnapshot {
  active?: { id: number; term: string; progress: number; latest: boolean };
  queued: { id: number; term: string }[];
  cancelled: string[];
}

export interface DatabaseQueryLifecycle {
  queued?: () => void;
  executing?: () => void;
  cancelled?: (work: CancelledQueryWork) => void;
}

interface Developer { id: number; name: string; teamId: number; }
interface Team { id: number; name: string; }
interface Project { id: number; teamId: number; name: string; active: boolean; }
interface DeveloperSkill { developerId: number; skillId: number; }

interface QueryTask {
  id: number;
  term: string;
  cursor: number;
  matches: number;
  startedAt: number;
  settled: boolean;
  executing: boolean;
  resolve: (result: DatabaseQueryResult) => void;
  reject?: (error: DOMException) => void;
  lifecycle?: DatabaseQueryLifecycle;
}

interface LaneState { tasks: QueryTask[]; cancelled: string[]; latestTaskId?: number; timer?: number; }

@Injectable({ providedIn: 'root' })
export class InMemoryDatabaseService {
  private readonly chunkSize = 1_000;
  private readonly tickMs = 18;
  private readonly skills = ['Angular', 'RxJS', 'TypeScript', 'Node', 'Java', 'Postgres', 'Cloud', 'Testing', 'Signals', 'GraphQL', 'Python', 'Kotlin'];
  private developers: Developer[] = [];
  private teams: Team[] = [];
  private projectsByTeam: Project[][] = [];
  private skillsByDeveloper: number[][] = [];
  private taskId = 0;
  private initialized = false;
  private readonly lanes: Record<DatabaseLane, LaneState> = { promise: { tasks: [], cancelled: [] }, observable: { tasks: [], cancelled: [] } };
  readonly laneChanges = new Subject<void>();
  constructor(private readonly runner: ComparisonRunnerService) {}

  get stats(): DatabaseStats {
    this.initialize();
    const developerSkills = this.developers.length * 3;
    const projects = this.projectsByTeam.reduce((total, rows) => total + rows.length, 0);
    return { developers: this.developers.length, teams: this.teams.length, projects, developerSkills, totalRows: this.developers.length + this.teams.length + projects + developerSkills + this.skills.length };
  }

  queryPromise(term: string, lifecycle: DatabaseQueryLifecycle = {}): Promise<DatabaseQueryResult> {
    this.initialize();
    return new Promise<DatabaseQueryResult>((resolve, reject) => this.enqueue('promise', term, resolve, reject, lifecycle));
  }

  queryObservable(term: string, lifecycle: DatabaseQueryLifecycle = {}): Observable<DatabaseQueryResult> {
    this.initialize();
    return new Observable<DatabaseQueryResult>((subscriber) => {
      const task = this.enqueue('observable', term, (result) => { subscriber.next(result); subscriber.complete(); }, undefined, lifecycle);
      return () => { if (!task.settled) this.cancelTask('observable', task); };
    });
  }

  cancel(lane: DatabaseLane): void { this.cancelLane(lane); }
  cancelAll(): void { this.cancelLane('promise'); this.cancelLane('observable'); }
  resetHistory(): void { this.lanes.promise.cancelled = []; this.lanes.observable.cancelled = []; this.laneChanges.next(); }

  snapshot(laneName: DatabaseLane): DatabaseLaneSnapshot {
    const lane = this.lanes[laneName]; const active = lane.tasks[0];
    return {
      ...(active ? { active: { id: active.id, term: active.term, progress: Math.round(active.cursor / this.developers.length * 100), latest: active.id === lane.latestTaskId } } : {}),
      queued: lane.tasks.slice(1).map((task) => ({ id: task.id, term: task.term })),
      cancelled: [...lane.cancelled]
    };
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    const teamNames = ['Platform', 'Analytics', 'Commerce', 'Developer Experience', 'Security', 'Data Engineering', 'Cloud Runtime', 'Customer Systems'];
    this.teams = Array.from({ length: 500 }, (_, id) => ({ id, name: `${teamNames[id % teamNames.length]} Team ${id + 1}` }));
    this.projectsByTeam = this.teams.map((team) => Array.from({ length: 3 }, (_, offset) => ({ id: team.id * 3 + offset, teamId: team.id, name: `${offset === 0 ? 'Angular' : offset === 1 ? 'Migration' : 'API'} Project ${team.id + 1}`, active: offset !== 1 })));
    const firstNames = ['Ana', 'Angel', 'Angela', 'Andrew', 'Anika', 'Taylor', 'Morgan', 'Jordan', 'Sam', 'Robin'];
    this.developers = Array.from({ length: 100_000 }, (_, id) => ({ id, name: `${firstNames[id % firstNames.length]} Developer ${id + 1}`, teamId: id % this.teams.length }));
    this.skillsByDeveloper = this.developers.map((developer) => [developer.id % this.skills.length, (developer.id + 3) % this.skills.length, (developer.id + 7) % this.skills.length]);
  }

  private enqueue(laneName: DatabaseLane, term: string, resolve: QueryTask['resolve'], reject?: QueryTask['reject'], lifecycle?: DatabaseQueryLifecycle): QueryTask {
    const lane = this.lanes[laneName];
    const task: QueryTask = { id: ++this.taskId, term: term.toLowerCase(), cursor: 0, matches: 0, startedAt: 0, settled: false, executing: false, resolve, ...(reject ? { reject } : {}), ...(lifecycle ? { lifecycle } : {}) };
    lane.tasks.push(task);
    lane.latestTaskId = task.id;
    if (lane.tasks.length > 1) lifecycle?.queued?.();
    this.laneChanges.next();
    this.schedule(laneName);
    return task;
  }

  private schedule(laneName: DatabaseLane): void {
    const lane = this.lanes[laneName];
    if (lane.timer !== undefined || lane.tasks.length === 0) return;
    lane.timer = window.setTimeout(() => {
      lane.timer = undefined;
      const task = lane.tasks[0];
      if (task && !task.settled) {
        if (!task.executing) {
          task.executing = true;
          task.startedAt = performance.now();
          task.lifecycle?.executing?.();
        }
        this.processChunk(task);
        if (task.settled) lane.tasks.shift();
        this.laneChanges.next();
      }
      this.schedule(laneName);
    }, this.runner.scale(this.tickMs));
  }

  private processChunk(task: QueryTask): void {
    const end = Math.min(this.developers.length, task.cursor + this.chunkSize);
    for (let index = task.cursor; index < end; index++) {
      const developer = this.developers[index]!;
      const team = this.teams[developer.teamId]!;
      const projects = this.projectsByTeam[developer.teamId]!;
      const skillNames = this.skillsByDeveloper[developer.id]!.map((skillId) => this.skills[skillId]!);
      const joinedRow = `${developer.name} ${team.name} ${projects[0]!.name} ${projects[1]!.name} ${projects[2]!.name} ${skillNames.join(' ')}`.toLowerCase();
      if (joinedRow.includes(task.term)) task.matches++;
    }
    task.cursor = end;
    if (task.cursor === this.developers.length) {
      task.settled = true;
      task.resolve({ term: task.term, matches: task.matches, megabytes: Math.max(8, Math.round(task.matches * 0.0018)), rowsScanned: this.joinRows(task.cursor), duration: Math.round(performance.now() - task.startedAt) });
    }
  }

  private cancelTask(laneName: DatabaseLane, task: QueryTask): void {
    task.settled = true;
    const lane = this.lanes[laneName];
    const wasActive = lane.tasks[0] === task;
    lane.tasks = lane.tasks.filter((candidate) => candidate !== task);
    lane.cancelled = [...lane.cancelled.slice(-4), task.term];
    task.lifecycle?.cancelled?.({ rowsScanned: this.joinRows(task.cursor), rowsAvoided: this.joinRows(this.developers.length - task.cursor) });
    if (wasActive && lane.timer !== undefined) {
      window.clearTimeout(lane.timer);
      lane.timer = undefined;
      this.schedule(laneName);
    }
    this.laneChanges.next();
  }

  private cancelLane(laneName: DatabaseLane): void {
    const lane = this.lanes[laneName];
    if (lane.timer !== undefined) window.clearTimeout(lane.timer);
    lane.timer = undefined;
    const tasks = [...lane.tasks]; lane.tasks = [];
    for (const task of tasks) {
      if (task.settled) continue;
      task.settled = true;
      task.lifecycle?.cancelled?.({ rowsScanned: this.joinRows(task.cursor), rowsAvoided: this.joinRows(this.developers.length - task.cursor) });
      task.reject?.(new DOMException('Database session cancelled', 'AbortError'));
    }
    this.laneChanges.next();
  }

  private joinRows(developers: number): number { return developers * 8; }
}
