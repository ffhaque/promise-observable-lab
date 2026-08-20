import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, Subscription, combineLatest, concatMap, debounce, distinctUntilChanged, finalize, from, map, of, switchMap, takeUntil, tap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AsyncDemoService } from './core/async-demo.service';
import { ComparisonRunnerService } from './core/comparison-runner.service';
import { DatabaseLaneSnapshot, InMemoryDatabaseService } from './core/in-memory-database.service';
import { DemoCategory, DemoState, DemoVerdict, PresentationSpeed, Side, emptyState } from './core/demo.models';
import { ComparisonPanelComponent } from './shared/comparison-panel/comparison-panel.component';
import { DatabaseLaneComponent } from './shared/database-lane/database-lane.component';
import { VerdictBadgeComponent } from './shared/verdict-badge/verdict-badge.component';
import { ExtendedDemoComponent, ExtendedScenarioId } from './demos/extended-demo/extended-demo.component';
import { PrimaryResultComponent } from './shared/primary-result/primary-result.component';

type CoreScenarioId = 'basic' | 'search' | 'selection' | 'events' | 'dashboard';
type ScenarioId = CoreScenarioId | ExtendedScenarioId;
interface Scenario { id: ScenarioId; number: string; name: string; result: string; learning: string[]; category: DemoCategory; verdict: DemoVerdict; }
type StageStatus = 'waiting' | 'running' | 'completed' | 'cancelled' | 'avoided';
interface WorkflowView { id: number; person: string; status: 'running' | 'completed' | 'cancelled' | 'stale'; startedAt: number; stages: { name: string; status: StageStatus }[]; }
interface DashboardView { cpu: number; users: number; errors: number; }

@Component({
  selector: 'app-root', standalone: true,
  imports: [FormsModule, ReactiveFormsModule, ComparisonPanelComponent, DatabaseLaneComponent, VerdictBadgeComponent, ExtendedDemoComponent, PrimaryResultComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss', './app.full-width.scss']
})
export class AppComponent {
  private readonly api = inject(AsyncDemoService);
  private readonly clock = inject(ComparisonRunnerService);
  private readonly database = inject(InMemoryDatabaseService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly scenarios: Scenario[] = [
    { id: 'basic', number: '01', name: 'Baseline Request', category: 'core', verdict: 'tie', result: 'RESULT: TIE', learning: ['For one request → one result, Promise is often the simpler and perfectly appropriate choice.', 'Both complete equivalent work in approximately two seconds.', 'Observable is not inherently faster than Promise.'] },
    { id: 'search', number: '02', name: 'Search Under Load', category: 'core', verdict: 'observable', result: 'OBSERVABLE CAPACITY ADVANTAGE', learning: ['Promise queries can start concurrently, but obsolete queries remain in the constrained database lane.', 'Request IDs protect the UI; they do not recover completed or queued Promise work.', 'switchMap teardown removes obsolete queries so the latest useful request receives capacity earlier.', 'The identical query is not faster—the useful query starts sooner because obsolete work was cancelled.'] },
    { id: 'selection', number: '03', name: 'Rapid Selection Workflow', category: 'core', verdict: 'observable', result: 'OBSERVABLE WORKFLOW ADVANTAGE', learning: ['Promise workflows protect the UI with a version ID, but obsolete multi-stage work continues.', 'switchMap disposes the entire previous workflow when selection context changes.', 'Cancellation propagates through the active stage and avoids every remaining stage.'] },
    { id: 'events', number: '04', name: 'High-Frequency Events', category: 'core', verdict: 'observable', result: 'OBSERVABLE EVENT-SHAPING ADVANTAGE', learning: ['A normal event handler starts one Promise calculation for every eligible event.', 'debounceTime shapes the raw stream before expensive work begins.', 'switchMap keeps only the current calculation and tears down stale work.'] },
    { id: 'dashboard', number: '05', name: 'Live Dashboard', category: 'core', verdict: 'different-shape', result: 'DIFFERENT USE CASES', learning: ['Promise.all is excellent for one coherent point-in-time snapshot.', 'combineLatest recomputes whenever any continuing source changes.', 'Choose a snapshot or a live synchronized view based on product behavior.'] },
    { id: 'dependent', number: '06', name: 'Dependent Request Chain', category: 'reactive', verdict: 'observable', result: 'OBSERVABLE CONTEXT ADVANTAGE', learning: [] },
    { id: 'progressive', number: '07', name: 'Progressive Loading', category: 'reactive', verdict: 'observable', result: 'OBSERVABLE DELIVERY ADVANTAGE', learning: [] },
    { id: 'timeout', number: '08', name: 'Timeout + Fallback', category: 'reactive', verdict: 'tie', result: 'RESULT: TIE', learning: [] },
    { id: 'live-stream', number: '09', name: 'Live Stream Control', category: 'reactive', verdict: 'different-shape', result: 'DIFFERENT ASYNC SHAPE', learning: [] },
    { id: 'lifecycle', number: '10', name: 'Component Cleanup', category: 'reactive', verdict: 'observable', result: 'OBSERVABLE LIFECYCLE ADVANTAGE', learning: [] },
    { id: 'save', number: '11', name: 'Simple Save', category: 'promise', verdict: 'promise', result: 'PROMISE SIMPLICITY ADVANTAGE', learning: [] },
    { id: 'sequential', number: '12', name: 'Sequential Workflow', category: 'promise', verdict: 'promise', result: 'PROMISE READABILITY ADVANTAGE', learning: [] },
    { id: 'parallel', number: '13', name: 'Parallel One-Time Requests', category: 'promise', verdict: 'tie', result: 'RESULT: TIE', learning: [] }
  ];

  activeId: ScenarioId = 'basic';
  promiseState = emptyState();
  observableState = emptyState();
  presentationMode = false;
  presentationSpeed: PresentationSpeed = 'normal';
  sharedRun = false;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly people = ['Sarah', 'John', 'Michael', 'David', 'Jessica'];
  promiseWorkflows: WorkflowView[] = [];
  observableWorkflows: WorkflowView[] = [];
  rawEventCount = 0;
  promiseDashboard?: DashboardView;
  observableDashboard?: DashboardView;
  observableDashboardHistory: DashboardView[] = [];
  snapshotAge = 0;

  private requestId = 0;
  private promiseLatest = 0;
  private latestSearchInputAt = 0;
  private promiseControllers = new Set<AbortController>();
  private observableSub?: Subscription;
  private searchInput = new Subject<string>();
  private searchCancel = new Subject<void>();
  private autoTypeTimers: number[] = [];
  private selectionInput = new Subject<string>();
  private selectionCancel = new Subject<void>();
  private eventInput = new Subject<number>();
  private eventCancel = new Subject<void>();
  private promiseSelectionLatest = 0;
  private promiseEventLatest = 0;
  private workflowId = 0;
  private eventRequestId = 0;
  private readonly workflowStages = ['Load User', 'Load Team', 'Load Projects', 'Load Permissions', 'Build Dashboard'];
  private readonly presentationPath: ScenarioId[] = ['basic', 'search', 'dependent', 'progressive', 'live-stream', 'save'];
  promiseLane: DatabaseLaneSnapshot = { queued: [], cancelled: [] };
  observableLane: DatabaseLaneSnapshot = { queued: [], cancelled: [] };

  constructor() {
    this.bindSearchPipeline();
    this.bindSelectionPipeline();
    this.bindEventPipeline();
    this.database.laneChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.promiseLane = this.database.snapshot('promise'); this.observableLane = this.database.snapshot('observable'); this.cdr.markForCheck();
    });
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  get scenario(): Scenario { return this.scenarios.find((item) => item.id === this.activeId)!; }
  get isRunning(): boolean { return this.promiseState.loading || this.observableState.loading; }
  get isCoreScenario(): boolean { return ['basic', 'search', 'selection', 'events', 'dashboard'].includes(this.activeId); }
  get extendedScenarioId(): ExtendedScenarioId { return this.activeId as ExtendedScenarioId; }
  get scenarioGroups() { return [
    { id: 'core', title: 'Core Comparisons', items: this.scenarios.filter((item) => item.category === 'core') },
    { id: 'reactive', title: 'More Reactive Patterns', items: this.scenarios.filter((item) => item.category === 'reactive') },
    { id: 'promise', title: 'When Promise Shines', items: this.scenarios.filter((item) => item.category === 'promise') }
  ]; }
  get isSearch(): boolean { return this.activeId === 'search'; }
  get showCancel(): boolean { return this.activeId === 'dashboard'; }
  get showProgress(): boolean { return false; }
  get promiseDescription(): string { return this.descriptions[this.activeId as CoreScenarioId].promise; }
  get observableDescription(): string { return this.descriptions[this.activeId as CoreScenarioId].observable; }
  get promiseCode(): string { return this.codes[this.activeId as CoreScenarioId].promise; }
  get observableCode(): string { return this.codes[this.activeId as CoreScenarioId].observable; }
  get databaseStats() { return this.database.stats; }
  get comparisonFocus(): string {
    return ({
      basic: 'Compare cleanup and readability. Runtime should be equal.',
      search: 'Watch the lanes: obsolete Promise queries queue; switchMap removes obsolete Observable work.',
      selection: 'Watch entire five-stage workflows continue or disappear when selection context changes.',
      events: 'Watch raw events become expensive operations before and after RxJS stream shaping.',
      dashboard: 'Watch snapshot age increase while three live sources keep the Observable view synchronized.'
    } satisfies Record<CoreScenarioId, string>)[this.activeId as CoreScenarioId];
  }
  get presentationPathIndex(): number { return this.presentationPath.indexOf(this.activeId); }
  get primaryResult(): { label: string; promise: string; observable: string; promiseDetail: string; observableDetail: string; note: string } {
    switch (this.activeId as CoreScenarioId) {
      case 'search': return { label: 'LATEST USEFUL RESULT', promise: this.duration(this.promiseState.metrics.latestLatency), observable: this.duration(this.observableState.metrics.latestLatency), promiseDetail: `${this.promiseLane.queued.length} queries queued`, observableDetail: `${this.observableState.metrics.cancelled} obsolete queries cancelled`, note: this.searchGain ? `Latest useful result arrived ${this.searchGain}% sooner because obsolete work released constrained capacity.` : 'Run Auto Type to compare the newest useful result under constrained capacity.' };
      case 'selection': return { label: 'OBSOLETE WORK', promise: `${this.workflowWasted('promise')} stages`, observable: `${this.workflowStagesAvoided('observable')} stages`, promiseDetail: 'completed after context changed', observableDetail: 'cancelled or avoided', note: 'Version IDs protect the Promise UI; switchMap releases the obsolete workflow.' };
      case 'events': return { label: 'EXPENSIVE CALCULATIONS', promise: `${this.promiseState.metrics.started}`, observable: `${this.observableState.metrics.started}`, promiseDetail: `${this.promiseState.metrics.stale} stale results`, observableDetail: `${this.observableState.metrics.cancelled} replaced`, note: 'The Observable pipeline shapes raw input before expensive work is allowed to accumulate.' };
      case 'dashboard': return { label: 'DATA FRESHNESS', promise: this.promiseDashboard ? `${this.snapshotAge}s old` : '—', observable: this.observableState.loading ? 'LIVE ●' : this.observableDashboard ? 'STOPPED' : '—', promiseDetail: 'point-in-time snapshot', observableDetail: `${this.observableState.metrics.completed} synchronized updates`, note: 'Promise.all answers once; combineLatest maintains a view while its sources continue.' };
      default: return { label: 'ONE REQUEST · ONE RESULT', promise: this.duration(this.promiseState.metrics.latestLatency), observable: this.duration(this.observableState.metrics.latestLatency), promiseDetail: 'async / await', observableDetail: 'cold stream', note: 'Equivalent work completes in equivalent time. Promise is often simpler for this shape.' };
    }
  }

  previousPresentationDemo(): void { const index = this.presentationPathIndex; if (index > 0) this.selectScenario(this.presentationPath[index - 1]!); }
  nextPresentationDemo(): void { const index = this.presentationPathIndex; if (index >= 0 && index < this.presentationPath.length - 1) this.selectScenario(this.presentationPath[index + 1]!); }

  setPresentationSpeed(speed: PresentationSpeed): void { this.presentationSpeed = speed; this.clock.setSpeed(speed); this.reset(); }

  renderToken(state: DemoState): string {
    const m = state.metrics;
    return [state.loading, state.result, state.progress, state.events.length, state.codeOpen,
      m.started, m.completed, m.cancelled, m.active, m.emitted, m.errors, m.retries, m.stale, m.rowsScanned, m.rowsAvoided, m.latestLatency,
      state.requests.map((request) => `${request.id}:${request.status}`).join('|')].join(':');
  }

  selectScenario(id: ScenarioId): void { if (id !== this.activeId) { this.reset(); this.activeId = id; this.cdr.markForCheck(); } }
  updateSearch(term: string): void {
    if (term.length >= 2) { this.latestSearchInputAt = this.clock.now(); void this.promiseSearch(term); }
    this.searchInput.next(term);
  }

  reset(): void {
    if (this.activeId === 'search') this.searchCancel.next();
    this.selectionCancel.next(); this.eventCancel.next();
    this.cleanup(); this.promiseState = emptyState(); this.observableState = emptyState(); this.requestId = 0;
    this.promiseLatest = 0; this.latestSearchInputAt = 0; this.promiseSelectionLatest = 0; this.promiseEventLatest = 0; this.sharedRun = false;
    this.promiseWorkflows = []; this.observableWorkflows = []; this.rawEventCount = 0; this.promiseDashboard = undefined; this.observableDashboard = undefined; this.observableDashboardHistory = []; this.snapshotAge = 0;
    this.database.resetHistory(); this.searchControl.setValue('', { emitEvent: false }); this.clock.restartClock(); this.cdr.markForCheck();
  }

  runBoth(): void {
    this.reset(); this.sharedRun = true; this.clock.restartClock();
    queueMicrotask(() => {
      switch (this.activeId) {
        case 'search': this.startAutoType(false); break;
        case 'selection': this.autoSelect(false); break;
        case 'events': this.autoGenerateEvents(false); break;
        default: this.runPromise(false); this.runObservable(false);
      }
      this.cdr.markForCheck();
    });
  }

  runPromise(resetClock = true): void {
    if (resetClock) { this.resetSide('promise'); this.clock.restartClock(); }
    switch (this.activeId) {
      case 'basic': void this.runPromiseBasic(); break;
      case 'search': { const term = this.searchControl.value || 'angular'; if (!this.searchControl.value) this.searchControl.setValue(term, { emitEvent: false }); void this.promiseSearch(term); break; }
      case 'selection': void this.runPromiseWorkflow('Jessica'); break;
      case 'events': this.emitHighFrequencyEvent(50, true, false); break;
      case 'dashboard': void this.runPromiseDashboard(); break;
    }
  }

  runObservable(resetClock = true): void {
    if (resetClock) { this.resetSide('observable'); this.clock.restartClock(); }
    switch (this.activeId) {
      case 'basic': this.runObservableBasic(); break;
      case 'search': { const term = this.searchControl.value || 'angular'; if (!this.searchControl.value) this.searchControl.setValue(term, { emitEvent: false }); this.searchInput.next(term); break; }
      case 'selection': this.selectionInput.next('Jessica'); break;
      case 'events': this.emitHighFrequencyEvent(50, false, true); break;
      case 'dashboard': this.runObservableDashboard(); break;
    }
  }

  cancel(side: Side): void {
    if (side === 'promise') {
      if (!this.promiseControllers.size) return;
      this.log(this.promiseState, 'info', 'Cancel clicked → AbortController.abort()');
      this.promiseControllers.forEach((controller) => controller.abort());
    } else {
      if (!this.observableSub || this.observableSub.closed) return;
      this.log(this.observableState, 'info', 'Cancel clicked → unsubscribe()'); this.observableSub.unsubscribe();
    }
    this.cdr.markForCheck();
  }
  cancelBoth(): void { this.cancel('promise'); this.cancel('observable'); }
  toggleCode(side: Side): void { this.state(side).codeOpen = !this.state(side).codeOpen; this.cdr.markForCheck(); }

  autoType(): void { this.startAutoType(true); }
  private startAutoType(resetFirst: boolean): void {
    if (resetFirst) { this.reset(); this.activeId = 'search'; this.sharedRun = true; this.clock.restartClock(); }
    const values = ['a', 'an', 'ang', 'angu', 'angul', 'angular'];
    values.forEach((value, index) => {
      const timer = window.setTimeout(() => {
        this.searchControl.setValue(value, { emitEvent: false });
        this.log(this.promiseState, 'info', `Input “${value}”`); this.log(this.observableState, 'info', `Input “${value}”`);
        if (value.length >= 2) { this.latestSearchInputAt = this.clock.now(); void this.promiseSearch(value); }
        this.searchInput.next(value); this.cdr.markForCheck();
      }, this.clock.scale(index * 340));
      this.autoTypeTimers.push(timer);
    });
  }

  selectPerson(person: string): void { void this.runPromiseWorkflow(person); this.selectionInput.next(person); }
  autoSelect(resetFirst = true): void {
    if (resetFirst) { this.reset(); this.activeId = 'selection'; this.sharedRun = true; this.clock.restartClock(); }
    this.people.forEach((person, index) => {
      const handle = window.setTimeout(() => { this.log(this.promiseState, 'info', `Selected ${person}`); this.log(this.observableState, 'info', `selectedUser$ → ${person}`); this.selectPerson(person); this.cdr.markForCheck(); }, this.clock.scale(index * 480));
      this.autoTypeTimers.push(handle);
    });
  }

  manualEvent(event: Event): void { this.emitHighFrequencyEvent(Number((event.target as HTMLInputElement).value), true, true); }
  autoGenerateEvents(resetFirst = true): void {
    if (resetFirst) { this.reset(); this.activeId = 'events'; this.sharedRun = true; this.clock.restartClock(); }
    for (let group = 0; group < 4; group++) {
      for (let index = 0; index < 15; index++) {
        const value = 20 + group * 15 + index;
        const at = this.clock.scale(group * 520 + index * 18);
        const handle = window.setTimeout(() => this.emitHighFrequencyEvent(value, true, true), at);
        this.autoTypeTimers.push(handle);
      }
    }
  }

  get searchGain(): number {
    const promise = this.promiseState.metrics.latestLatency; const observable = this.observableState.metrics.latestLatency;
    return promise > 0 && observable > 0 ? Math.max(0, Math.round((promise - observable) / promise * 1000) / 10) : 0;
  }
  usefulElapsed(side: Side): number {
    const state = this.state(side);
    return state.metrics.latestLatency || Math.max(0, this.clock.now() - this.latestSearchInputAt);
  }
  workUnits(state: DemoState): number { return Math.round(state.metrics.rowsScanned / 8_000); }
  cancelledWorkUnits(state: DemoState): number { return Math.round(state.metrics.rowsAvoided / 8_000); }
  dashboardSeries(key: keyof DashboardView): string { return this.observableDashboardHistory.map((item) => item[key]).join(' → ') || 'waiting for source values'; }
  workflowStagesExecuted(side: Side): number { return this.workflows(side).reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'completed').length, 0); }
  workflowStagesAvoided(side: Side): number { return this.workflows(side).reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'avoided').length, 0); }
  workflowWasted(side: Side): number { return this.workflows(side).filter((flow) => flow.status === 'stale').reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'completed').length, 0); }

  private workflows(side: Side): WorkflowView[] { return side === 'promise' ? this.promiseWorkflows : this.observableWorkflows; }
  private createWorkflow(side: Side, person: string): WorkflowView {
    const workflow: WorkflowView = { id: ++this.workflowId, person, status: 'running', startedAt: performance.now(), stages: this.workflowStages.map((name) => ({ name, status: 'waiting' })) };
    if (side === 'promise') this.promiseWorkflows = [...this.promiseWorkflows, workflow]; else this.observableWorkflows = [...this.observableWorkflows, workflow];
    return workflow;
  }

  private async runPromiseWorkflow(person: string): Promise<void> {
    const s = this.promiseState; const version = ++this.promiseSelectionLatest; const id = ++this.requestId; const workflow = this.createWorkflow('promise', person); const controller = new AbortController(); this.promiseControllers.add(controller);
    this.begin(s, `${person} workflow started`, id, `${person} · 5 stages`);
    try {
      for (let index = 0; index < workflow.stages.length; index++) {
        workflow.stages[index]!.status = 'running'; this.cdr.markForCheck();
        await this.api.delay(null, 480, controller.signal);
        workflow.stages[index]!.status = 'completed'; s.metrics.emitted++; this.log(s, 'emit', `${person} · ${workflow.stages[index]!.name} complete`, id);
      }
      if (version === this.promiseSelectionLatest) { workflow.status = 'completed'; s.result = `${person} dashboard ready`; this.complete(s, `${person} dashboard accepted`, id); }
      else { workflow.status = 'stale'; s.metrics.stale++; s.metrics.completed++; s.metrics.active--; this.setRequest(s, id, 'stale'); this.log(s, 'info', `${person} dashboard ignored · selection changed`, id); }
    } catch (error) { if ((error as DOMException).name === 'AbortError') this.cancelled(s, id, `${person} workflow aborted during reset`); else this.fail(s, `${person} workflow failed`, id); }
    finally { this.promiseControllers.delete(controller); s.loading = s.metrics.active > 0; this.cdr.markForCheck(); }
  }

  private bindSelectionPipeline(): void {
    this.selectionInput.pipe(switchMap((person) => {
      const s = this.observableState; const id = ++this.requestId; const workflow = this.createWorkflow('observable', person); let completed = false;
      this.begin(s, `${person} workflow subscribed`, id, `${person} · switchMap workflow`);
      return from(workflow.stages.map((_, index) => index)).pipe(
        concatMap((index) => { workflow.stages[index]!.status = 'running'; this.cdr.markForCheck(); return this.api.observableDelay(index, 480); }),
        tap((index) => {
          workflow.stages[index]!.status = 'completed'; s.metrics.emitted++; this.log(s, 'emit', `${person} · ${workflow.stages[index]!.name} complete`, id);
          if (index === workflow.stages.length - 1) { completed = true; workflow.status = 'completed'; s.result = `${person} dashboard ready`; s.metrics.latestLatency = Math.round(performance.now() - workflow.startedAt); this.complete(s, `${person} dashboard accepted`, id); }
          this.cdr.markForCheck();
        }),
        takeUntil(this.selectionCancel),
        finalize(() => {
          if (!completed) {
            workflow.status = 'cancelled'; workflow.stages.forEach((stage) => { if (stage.status === 'running') stage.status = 'cancelled'; else if (stage.status === 'waiting') stage.status = 'avoided'; });
            s.metrics.cancelled++; s.metrics.active = Math.max(0, s.metrics.active - 1); this.setRequest(s, id, 'cancelled'); this.log(s, 'cancel', `${person} entire workflow disposed by switchMap`, id);
          }
          s.loading = s.metrics.active > 0; this.cdr.markForCheck();
        })
      );
    }), takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private emitHighFrequencyEvent(value: number, promise: boolean, observable: boolean): void {
    this.rawEventCount++;
    if (promise) void this.runPromiseCalculation(value);
    if (observable) this.eventInput.next(value);
    this.cdr.markForCheck();
  }

  private async runPromiseCalculation(value: number): Promise<void> {
    const s = this.promiseState; const version = ++this.promiseEventLatest; const id = ++this.eventRequestId; const controller = new AbortController(); this.promiseControllers.add(controller); this.begin(s, `Event ${value} → calculation #${id}`, id, `quote ${value}`);
    try {
      const result = await this.api.delay(value * 37, 700, controller.signal);
      s.metrics.completed++; s.metrics.active--; s.metrics.rowsScanned++;
      if (version === this.promiseEventLatest) { s.metrics.emitted++; s.result = `Current quote: $${result}`; this.setRequest(s, id, 'completed'); this.log(s, 'complete', `Calculation #${id} accepted`, id); }
      else { s.metrics.stale++; this.setRequest(s, id, 'stale'); this.log(s, 'info', `Calculation #${id} stale · ignored`, id); }
    } catch (error) { if ((error as DOMException).name !== 'AbortError') this.fail(s, `Calculation #${id} failed`, id); }
    finally { this.promiseControllers.delete(controller); s.loading = s.metrics.active > 0; this.cdr.markForCheck(); }
  }

  private bindEventPipeline(): void {
    let activeId = 0; let activeValue = 0;
    this.eventInput.pipe(
      debounce(() => timer(this.clock.scale(120))), distinctUntilChanged(),
      switchMap((value) => {
        const s = this.observableState;
        if (activeId && s.requests.find((request) => request.id === activeId)?.status === 'running') { this.cancelled(s, activeId, `Calculation for ${activeValue} cancelled by switchMap`); s.metrics.rowsAvoided++; }
        activeId = ++this.eventRequestId; activeValue = value; this.begin(s, `debounceTime → calculation for ${value}`, activeId, `quote ${value}`);
        return this.api.observableDelay(value * 37, 700).pipe(takeUntil(this.eventCancel), tap((result) => {
          s.metrics.rowsScanned++; s.metrics.emitted++; s.result = `Current quote: $${result}`; this.complete(s, `Current calculation accepted`, activeId);
        }), finalize(() => { s.loading = s.metrics.active > 0; this.cdr.markForCheck(); }));
      }), takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  private async runPromiseDashboard(): Promise<void> {
    const s = this.promiseState; const controller = new AbortController(); this.promiseControllers.add(controller); this.begin(s, 'Promise.all snapshot requested');
    try {
      const [cpu, users, errors] = await Promise.all([this.api.delay(42, 1000, controller.signal), this.api.delay(1284, 1500, controller.signal), this.api.delay(0.7, 2000, controller.signal)]);
      this.promiseDashboard = { cpu, users, errors }; s.metrics.emitted = 3; s.result = 'SNAPSHOT COMPLETE · PROMISE LIFECYCLE ENDED'; this.complete(s, 'Promise.all snapshot complete');
      const ageTimer = window.setInterval(() => { this.snapshotAge++; this.cdr.markForCheck(); }, this.clock.scale(1000)); this.autoTypeTimers.push(ageTimer);
    } catch (error) { if ((error as DOMException).name !== 'AbortError') this.fail(s, 'Snapshot failed'); }
    finally { this.promiseControllers.delete(controller); s.loading = false; this.cdr.markForCheck(); }
  }

  private runObservableDashboard(): void {
    const s = this.observableState; this.begin(s, 'Subscribed to CPU$, Users$, Errors$'); let updates = 0;
    const cpu$ = timer(this.clock.scale(1000), this.clock.scale(1000)).pipe(map((tick) => 38 + Number(tick % 5) * 4), tap(() => s.metrics.emitted++));
    const users$ = timer(this.clock.scale(1500), this.clock.scale(1500)).pipe(map((tick) => 1245 + Number(tick) * 13), tap(() => s.metrics.emitted++));
    const errors$ = timer(this.clock.scale(2000), this.clock.scale(2000)).pipe(map((tick) => Number((0.8 - Number(tick % 4) * 0.1).toFixed(1))), tap(() => s.metrics.emitted++));
    this.observableSub = combineLatest([cpu$, users$, errors$]).pipe(finalize(() => { s.loading = false; this.log(s, 'cancel', 'Dashboard unsubscribed · all source timers stopped'); this.cdr.markForCheck(); })).subscribe(([cpu, users, errors]) => {
      this.observableDashboard = { cpu, users, errors }; this.observableDashboardHistory = [...this.observableDashboardHistory, this.observableDashboard].slice(-3); updates++; s.metrics.completed = updates; s.result = `LIVE VIEW MODEL · update #${updates}`; this.log(s, 'emit', `combineLatest → CPU ${cpu}% · ${users} users · ${errors}% errors`); this.cdr.markForCheck();
    });
  }

  private async runPromiseBasic(): Promise<void> {
    const s = this.promiseState; const controller = new AbortController(); this.promiseControllers.add(controller); this.begin(s, 'User request started');
    try { const user = await this.api.delay(this.api.user, 2000, controller.signal); s.result = `${user.avatar}  ${user.name} — ${user.role}`; s.metrics.emitted++; s.metrics.latestLatency = this.clock.now(); this.complete(s, 'User received'); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') this.fail(s, 'Request failed'); }
    finally { this.promiseControllers.delete(controller); s.loading = false; if (!controller.signal.aborted) this.log(s, 'info', 'finally → loading cleared'); this.cdr.markForCheck(); }
  }

  private runObservableBasic(): void {
    const s = this.observableState; this.begin(s, 'Subscribed · user request started');
    this.observableSub = this.api.observableDelay(this.api.user, 2000).pipe(finalize(() => { s.loading = false; this.log(s, 'info', 'finalize → loading cleared'); this.cdr.markForCheck(); })).subscribe({
      next: (user) => { s.result = `${user.avatar}  ${user.name} — ${user.role}`; s.metrics.emitted++; },
      complete: () => { s.metrics.latestLatency = this.clock.now(); this.complete(s, 'User received · stream completed'); }, error: () => this.fail(s, 'Request failed')
    });
  }

  private async promiseSearch(term: string): Promise<void> {
    const s = this.promiseState; const id = ++this.requestId; this.promiseLatest = id; const stats = this.database.stats;
    if (s.metrics.active > 0) this.log(s, 'info', `${s.metrics.active} older Promise quer${s.metrics.active === 1 ? 'y continues' : 'ies continue'} scanning in parallel`);
    this.begin(s, `5-table JOIN “${term}” started · ${this.formatRows(stats.totalRows)} stored rows`, id, term);
    try {
      const result = await this.database.queryPromise(term);
      s.metrics.completed++; s.metrics.active--; s.metrics.rowsScanned += result.rowsScanned; this.setRequest(s, id, id === this.promiseLatest ? 'completed' : 'stale');
      if (id === this.promiseLatest) {
        s.metrics.latestLatency = this.clock.now() - this.latestSearchInputAt; s.result = `${result.matches.toLocaleString()} joined records · ${result.megabytes} MB for “${term}” · useful result ${s.metrics.latestLatency}ms`;
        s.metrics.emitted++; this.log(s, 'complete', `“${term}” useful result in ${s.metrics.latestLatency}ms · dataset accepted`, id);
      } else { s.metrics.stale++; this.log(s, 'info', `“${term}” completed · ${this.formatRows(result.rowsScanned)} joined rows scanned, stale dataset ignored`, id); }
    } catch (error) { if ((error as DOMException).name === 'AbortError') this.cancelled(s, id, `“${term}” aborted`); else this.fail(s, `“${term}” failed`, id); }
    finally { s.loading = s.metrics.active > 0; this.cdr.markForCheck(); }
  }

  private bindSearchPipeline(): void {
    let activeId = 0; let activeTerm = '';
    this.searchInput.pipe(
      tap((term) => { if (term.length >= 2) this.log(this.observableState, 'info', `“${term}” entered · debounce`); }),
      debounce(() => timer(this.clock.scale(220))), distinctUntilChanged(),
      switchMap((term) => {
        if (term.length < 2) return of('');
        const s = this.observableState; const stats = this.database.stats;
        if (activeId && s.requests.find((r) => r.id === activeId)?.status === 'running') this.cancelled(s, activeId, `“${activeTerm}” cancelled by switchMap`);
        activeId = ++this.requestId; activeTerm = term; this.begin(s, `5-table JOIN “${term}” started · ${this.formatRows(stats.totalRows)} stored rows`, activeId, term);
        return this.database.queryObservable(term, (work) => {
          s.metrics.rowsScanned += work.rowsScanned; s.metrics.rowsAvoided += work.rowsAvoided;
          this.log(s, 'info', `Teardown saved ${this.formatRows(work.rowsAvoided)} joined rows of obsolete DB work`);
          this.cdr.markForCheck();
        }).pipe(
          takeUntil(this.searchCancel),
          tap((result) => {
            s.metrics.rowsScanned += result.rowsScanned; s.metrics.latestLatency = this.clock.now() - this.latestSearchInputAt;
            s.result = `${result.matches.toLocaleString()} joined records · ${result.megabytes} MB for “${term}” · useful result ${s.metrics.latestLatency}ms`;
            s.metrics.emitted++; this.complete(s, `“${term}” useful result in ${s.metrics.latestLatency}ms · dataset accepted`, activeId);
          }),
          finalize(() => { s.loading = s.metrics.active > 0; this.cdr.markForCheck(); })
        );
      }), takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  private begin(s: DemoState, message: string, id?: number, label?: string): void { s.loading = true; s.metrics.started++; s.metrics.active++; if (id !== undefined) s.requests = [...s.requests, { id, label: label ?? message, status: 'running' }]; this.log(s, 'start', message, id); this.cdr.markForCheck(); }
  private complete(s: DemoState, message: string, id?: number): void { s.metrics.completed++; s.metrics.active = Math.max(0, s.metrics.active - 1); if (id !== undefined) this.setRequest(s, id, 'completed'); this.log(s, 'complete', message, id); s.loading = s.metrics.active > 0; this.cdr.markForCheck(); }
  private fail(s: DemoState, message: string, id?: number): void { s.metrics.errors++; s.metrics.active = Math.max(0, s.metrics.active - 1); if (id !== undefined) this.setRequest(s, id, 'error'); this.log(s, 'error', message, id); s.loading = false; this.cdr.markForCheck(); }
  private cancelled(s: DemoState, id: number, message: string): void { s.metrics.cancelled++; s.metrics.active = Math.max(0, s.metrics.active - 1); this.setRequest(s, id, 'cancelled'); this.log(s, 'cancel', message, id); }
  private setRequest(s: DemoState, id: number, status: 'completed' | 'cancelled' | 'error' | 'stale'): void { s.requests = s.requests.map((request) => request.id === id ? { ...request, status } : request); }
  private state(side: Side): DemoState { return side === 'promise' ? this.promiseState : this.observableState; }
  private log(s: DemoState, type: Parameters<ComparisonRunnerService['log']>[1], message: string, id?: number): void { this.clock.log(s, type, message, id); }
  private formatRows(rows: number): string { return rows >= 1_000_000 ? `${(rows / 1_000_000).toFixed(1)}M` : `${Math.round(rows / 1000)}K`; }
  private duration(ms: number): string { return ms > 0 ? `${(ms / 1000).toFixed(2)} sec` : '—'; }
  private resetSide(side: Side): void { if (side === 'promise') { this.database.cancel('promise'); this.promiseControllers.forEach((c) => c.abort()); this.promiseControllers.clear(); this.promiseState = emptyState(); } else { this.database.cancel('observable'); this.selectionCancel.next(); this.eventCancel.next(); this.observableSub?.unsubscribe(); this.observableState = emptyState(); } }
  private cleanup(): void { this.searchCancel.next(); this.selectionCancel.next(); this.eventCancel.next(); this.database.cancelAll(); this.promiseControllers.forEach((controller) => controller.abort()); this.promiseControllers.clear(); this.observableSub?.unsubscribe(); this.observableSub = undefined; this.autoTypeTimers.forEach((timer) => window.clearTimeout(timer)); this.autoTypeTimers = []; }

  private readonly descriptions: Record<CoreScenarioId, Record<Side, string>> = {
    basic: { promise: 'async/await resolves one user and clears loading in finally.', observable: 'A cold Observable emits the same user and clears loading in finalize.' },
    search: { promise: 'Obsolete JOINs stay active or queued; version IDs only protect the UI.', observable: 'switchMap removes obsolete JOINs so the useful query receives the lane.' },
    selection: { promise: 'Each async/await workflow continues; a version ID ignores stale dashboards.', observable: 'switchMap disposes the whole previous five-stage workflow.' },
    events: { promise: 'A normal handler starts an async calculation for every input event.', observable: 'debounceTime shapes input; switchMap retains one current calculation.' },
    dashboard: { promise: 'Promise.all captures one coherent three-source snapshot.', observable: 'combineLatest keeps a live view synchronized as each source changes.' }
  };

  private readonly codes: Record<CoreScenarioId, Record<Side, string>> = {
    basic: { promise: `loading = true;\ntry {\n  user = await getUser();\n} finally {\n  loading = false;\n}`, observable: `getUser$().pipe(\n  finalize(() => loading = false)\n).subscribe(user => this.user = user);` },
    search: { promise: `const requestId = ++this.requestId;\n\n// Older Promise queries continue in parallel.\nconst hugeDataset = await databaseSearch(term);\n\nif (requestId === this.latestRequestId) {\n  this.result = hugeDataset;\n} else {\n  // Protects the UI, but the DB work already finished.\n  this.staleResultsIgnored++;\n}`, observable: `searchControl.valueChanges.pipe(\n  debounceTime(220),\n  distinctUntilChanged(),\n  switchMap(term => databaseSearch$(term))\n  // Unsubscription tears down the obsolete query.\n).subscribe(dataset => this.result = dataset);` },
    selection: { promise: `const version = ++latestVersion;\nconst user = await loadUser(id);\nconst team = await loadTeam(user);\nconst projects = await loadProjects(team);\nconst permissions = await loadPermissions(user);\nconst dashboard = await buildDashboard(...);\nif (version === latestVersion) show(dashboard);`, observable: `selectedUser$.pipe(\n  switchMap(id => loadUser$(id).pipe(\n    concatMap(loadTeam$),\n    concatMap(loadProjects$),\n    concatMap(loadPermissions$),\n    concatMap(buildDashboard$)\n  ))\n).subscribe(show);` },
    events: { promise: `input.addEventListener('input', async event => {\n  const version = ++latestVersion;\n  const quote = await calculate(event.value);\n  if (version === latestVersion) show(quote);\n});`, observable: `control.valueChanges.pipe(\n  debounceTime(120),\n  distinctUntilChanged(),\n  switchMap(value => calculate$(value))\n).subscribe(show);` },
    dashboard: { promise: `const snapshot = await Promise.all([\n  getCpu(), getUsers(), getErrorRate()\n]);\n// One coherent point-in-time result`, observable: `combineLatest([cpu$, users$, errors$]).pipe(\n  map(([cpu, users, errors]) => ({\n    cpu, users, errors\n  }))\n).subscribe(renderLiveDashboard);` }
  };
}
