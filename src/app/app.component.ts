import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, HostListener, ViewChild, inject } from '@angular/core';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject, Subscription, combineLatest, concatMap, debounce, distinctUntilChanged, finalize, from, map, of, switchMap, takeUntil, tap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AsyncDemoService } from './core/async-demo.service';
import { ComparisonRunnerService } from './core/comparison-runner.service';
import { DatabaseLaneSnapshot, InMemoryDatabaseService } from './core/in-memory-database.service';
import { DemoState, DemoVerdict, PresentationSpeed, Side, emptyState } from './core/demo.models';
import { ComparisonPanelComponent } from './shared/comparison-panel/comparison-panel.component';
import { DatabaseLaneComponent } from './shared/database-lane/database-lane.component';
import { VerdictBadgeComponent } from './shared/verdict-badge/verdict-badge.component';
import { ExtendedDemoComponent, ExtendedScenarioId } from './demos/extended-demo/extended-demo.component';
import { PrimaryResultComponent } from './shared/primary-result/primary-result.component';
import { SelectionBackendPool, SelectionBackendPoolSnapshot } from './core/selection-backend-pool';

type CoreScenarioId = 'basic' | 'search' | 'selection' | 'dashboard';
type ScenarioId = CoreScenarioId | ExtendedScenarioId;
interface Scenario { id: ScenarioId; number: string; name: string; result: string; learning: string[]; verdict: DemoVerdict; }
type StageStatus = 'waiting' | 'queued' | 'running' | 'completed' | 'cancelled' | 'avoided';
interface WorkflowView { id: number; person: string; status: 'running' | 'completed' | 'cancelled' | 'stale'; startedAt: number; stages: { name: string; status: StageStatus }[]; }
interface DashboardView { cpu: number; users: number; errors: number; }
interface PrimaryResultView { label: string; promise: string; observable: string; promiseDetail: string; observableDetail: string; comparison: string; note: string; }
type PresentationStepType = 'title' | 'concept' | 'intro' | 'demo' | 'takeaway' | 'guide' | 'final' | 'questions';
interface PresentationStep { id: string; type: PresentationStepType; title: string; section: string; scenarioId?: ScenarioId; }

@Component({
  selector: 'app-root', standalone: true,
  imports: [FormsModule, ReactiveFormsModule, ComparisonPanelComponent, DatabaseLaneComponent, VerdictBadgeComponent, ExtendedDemoComponent, PrimaryResultComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss', './app.full-width.scss']
})
export class AppComponent {
  @ViewChild(ExtendedDemoComponent) private extendedDemo?: ExtendedDemoComponent;
  private readonly api = inject(AsyncDemoService);
  private readonly clock = inject(ComparisonRunnerService);
  private readonly database = inject(InMemoryDatabaseService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly scenarios: Scenario[] = [
    { id: 'basic', number: '01', name: 'Baseline Request', verdict: 'tie', result: 'BOTH ARE GOOD', learning: ['Equivalent one-shot work completes in equivalent time.', 'Observable does not make a one-shot operation intrinsically faster.', 'Choose the clearest API for the surrounding code.'] },
    { id: 'search', number: '02', name: 'Search Under Load', verdict: 'observable', result: 'OBSERVABLE ADVANTAGE', learning: ['Promise request IDs protect the UI, but obsolete queries still occupy the constrained database lane.', 'switchMap teardown removes obsolete work from the real scheduler.', 'The latest query is not executed faster; it receives capacity earlier.'] },
    { id: 'selection', number: '03', name: 'Rapid Selection Workflow', verdict: 'observable', result: 'OBSERVABLE ADVANTAGE', learning: ['Both sides have the same two-slot backend capacity and identical stage durations.', 'Old Promise workflows keep consuming or queueing for backend capacity.', 'switchMap teardown releases obsolete capacity so Jessica becomes ready sooner.'] },
    { id: 'dashboard', number: '04', name: 'Live Dashboard', verdict: 'different-shape', result: 'DIFFERENT PROBLEM SHAPE', learning: ['Promise.all creates one point-in-time snapshot.', 'combineLatest maintains a view as continuing sources change.', 'This is a difference in async shape, not a speed race.'] },
    { id: 'lifecycle', number: '05', name: 'Component Cleanup', verdict: 'observable', result: 'OBSERVABLE ADVANTAGE', learning: [] },
    { id: 'sequential', number: '06', name: 'Sequential Workflow', verdict: 'promise', result: 'PROMISE ADVANTAGE', learning: [] }
  ];

  activeId: ScenarioId = 'basic';
  promiseState = emptyState();
  observableState = emptyState();
  presentationMode = false;
  activeSlide = 0;
  presentationMenuOpen = false;
  presentationSpeed: PresentationSpeed = 'normal';
  sharedRun = false;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly people = ['Sarah', 'John', 'Michael', 'David', 'Jessica'];
  promiseWorkflows: WorkflowView[] = [];
  observableWorkflows: WorkflowView[] = [];
  promiseDashboard?: DashboardView;
  observableDashboard?: DashboardView;
  observableDashboardHistory: DashboardView[] = [];
  snapshotAge = 0;
  readonly selectionPoolCapacity = 2;
  readonly selectionStageDurationMs = 600;
  readonly selectionCadenceMs = 450;
  promiseSelectionPoolSnapshot: SelectionBackendPoolSnapshot = { side: 'promise', capacity: 2, active: [], queued: [], cancelled: [] };
  observableSelectionPoolSnapshot: SelectionBackendPoolSnapshot = { side: 'observable', capacity: 2, active: [], queued: [], cancelled: [] };

  private requestId = 0;
  private promiseLatest = 0;
  private promiseControllers = new Set<AbortController>();
  private observableSub?: Subscription;
  private searchInput = new Subject<string>();
  private searchCancel = new Subject<void>();
  private autoTypeTimers: number[] = [];
  private selectionInput = new Subject<string>();
  private selectionCancel = new Subject<void>();
  private promiseSelectionLatest = 0;
  private workflowId = 0;
  private readonly workflowStages = ['Load User', 'Load Team', 'Load Projects', 'Load Permissions', 'Build Dashboard'];
  private readonly promiseSelectionPool: SelectionBackendPool;
  private readonly observableSelectionPool: SelectionBackendPool;
  readonly presentationSteps: readonly PresentationStep[] = [
    { id: 'title', type: 'title', title: 'Promise vs Observable', section: 'Title' },
    { id: 'question', type: 'concept', title: 'Why does Angular use Observables so heavily?', section: 'Title' },
    { id: 'baseline-intro', type: 'intro', title: "First, let's make the comparison fair.", section: 'Baseline' },
    { id: 'baseline-demo', type: 'demo', title: 'Baseline Request', section: 'Baseline', scenarioId: 'basic' },
    { id: 'search-intro', type: 'intro', title: 'What if the user changes their mind?', section: 'Search', scenarioId: 'search' },
    { id: 'search-demo', type: 'demo', title: 'Search Under Load', section: 'Search', scenarioId: 'search' },
    { id: 'search-takeaway', type: 'takeaway', title: 'What did switchMap actually buy us?', section: 'Search' },
    { id: 'selection-intro', type: 'intro', title: "switchMap isn't just for search boxes.", section: 'Rapid Selection', scenarioId: 'selection' },
    { id: 'selection-demo', type: 'demo', title: 'Rapid Selection Workflow', section: 'Rapid Selection', scenarioId: 'selection' },
    { id: 'dashboard-intro', type: 'intro', title: 'What if the data never really finishes?', section: 'Live Dashboard', scenarioId: 'dashboard' },
    { id: 'dashboard-demo', type: 'demo', title: 'Live Dashboard', section: 'Live Dashboard', scenarioId: 'dashboard' },
    { id: 'lifecycle-intro', type: 'intro', title: 'Who owns the asynchronous work?', section: 'Component Cleanup', scenarioId: 'lifecycle' },
    { id: 'lifecycle-demo', type: 'demo', title: 'Component Cleanup', section: 'Component Cleanup', scenarioId: 'lifecycle' },
    { id: 'promise-comeback', type: 'concept', title: 'So should everything be an Observable?', section: 'Sequential Workflow', scenarioId: 'sequential' },
    { id: 'sequential-demo', type: 'demo', title: 'Sequential Workflow', section: 'Sequential Workflow', scenarioId: 'sequential' },
    { id: 'decision-guide', type: 'guide', title: 'What shape is your async work?', section: 'Decision Guide' },
    { id: 'final', type: 'final', title: 'Promise vs Observable', section: 'Final Takeaways' },
    { id: 'questions', type: 'questions', title: 'Questions?', section: 'Questions' }
  ];
  promiseLane: DatabaseLaneSnapshot = { queued: [], cancelled: [] };
  observableLane: DatabaseLaneSnapshot = { queued: [], cancelled: [] };

  constructor() {
    this.promiseSelectionPool = new SelectionBackendPool('promise', this.selectionPoolCapacity, (snapshot) => { this.promiseSelectionPoolSnapshot = snapshot; this.cdr.markForCheck(); });
    this.observableSelectionPool = new SelectionBackendPool('observable', this.selectionPoolCapacity, (snapshot) => { this.observableSelectionPoolSnapshot = snapshot; this.cdr.markForCheck(); });
    this.bindSearchPipeline();
    this.bindSelectionPipeline();
    this.database.laneChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.promiseLane = this.database.snapshot('promise'); this.observableLane = this.database.snapshot('observable'); this.cdr.markForCheck();
    });
    this.destroyRef.onDestroy(() => this.cleanup());
    const params = new URLSearchParams(window.location.search);
    if (params.get('presentation') === 'true') {
      const requestedSlide = Number(params.get('slide')) - 1;
      this.activeSlide = Number.isInteger(requestedSlide) ? Math.min(Math.max(requestedSlide, 0), this.presentationSteps.length - 1) : 0;
      this.presentationMode = true;
      const scenarioId = this.presentationSteps[this.activeSlide]?.scenarioId;
      if (scenarioId) this.activeId = scenarioId;
    }
  }

  get scenario(): Scenario { return this.scenarios.find((item) => item.id === this.activeId)!; }
  get isRunning(): boolean { return this.promiseState.loading || this.observableState.loading; }
  get isCoreScenario(): boolean { return ['basic', 'search', 'selection', 'dashboard'].includes(this.activeId); }
  get extendedScenarioId(): ExtendedScenarioId { return this.activeId as ExtendedScenarioId; }
  get isSearch(): boolean { return this.activeId === 'search'; }
  get showCancel(): boolean { return this.activeId === 'dashboard'; }
  get promiseDescription(): string { return this.descriptions[this.activeId as CoreScenarioId].promise; }
  get observableDescription(): string { return this.descriptions[this.activeId as CoreScenarioId].observable; }
  get promiseCode(): string { return this.codes[this.activeId as CoreScenarioId].promise; }
  get observableCode(): string { return this.codes[this.activeId as CoreScenarioId].observable; }
  get databaseStats() { return this.database.stats; }
  get comparisonFocus(): string {
    return ({
      basic: 'Compare cleanup and readability. Runtime should be equal.',
      search: 'Watch the lanes: obsolete Promise queries queue; switchMap removes obsolete Observable work.',
      selection: 'Watch obsolete Promise stages consume the two-slot pool while switchMap releases Observable capacity for Jessica.',
      dashboard: 'Watch snapshot age increase while three live sources keep the Observable view synchronized.'
    } satisfies Record<CoreScenarioId, string>)[this.activeId as CoreScenarioId];
  }
  get presentationStep(): PresentationStep { return this.presentationSteps[this.activeSlide]!; }
  get isPresentationDemo(): boolean { return this.presentationMode && this.presentationStep.type === 'demo'; }
  get isPresentationGuide(): boolean { return this.presentationMode && this.presentationStep.type === 'guide'; }
  get presentationProgress(): number { return ((this.activeSlide + 1) / this.presentationSteps.length) * 100; }
  get fullscreenAvailable(): boolean { return Boolean(document.fullscreenEnabled); }
  get primaryResult(): PrimaryResultView {
    switch (this.activeId as CoreScenarioId) {
      case 'search': return { label: 'LATEST USEFUL RESULT', promise: this.duration(this.promiseState.metrics.latestLatency), observable: this.duration(this.observableState.metrics.latestLatency), promiseDetail: this.promiseState.metrics.latestLatency ? `${this.promiseState.metrics.stale} obsolete queries completed` : `${this.promiseLane.queued.length} queries queued`, observableDetail: `${this.observableState.metrics.cancelled} obsolete queries cancelled`, comparison: this.searchGain ? `Observable useful result arrived ${this.searchGain}% sooner` : '', note: 'Observable did not execute the same query faster. switchMap cancelled obsolete work, releasing constrained capacity for the newest useful request.' };
      case 'selection': return { label: 'LATEST DASHBOARD READY', promise: this.duration(this.promiseState.metrics.latestLatency), observable: this.duration(this.observableState.metrics.latestLatency), promiseDetail: `${this.obsoleteStagesExecuted('promise')} obsolete stages executed`, observableDetail: `${this.observableState.metrics.rowsAvoided} backend stage units avoided`, comparison: this.selectionGain ? `Observable useful dashboard arrived ${this.selectionGain}% sooner` : '', note: "Observable did not make Jessica's individual stages execute faster. switchMap released limited backend capacity by cancelling workflows that no longer mattered." };
      case 'dashboard': return { label: 'DELIVERY SHAPE', promise: this.promiseDashboard ? 'SNAPSHOT ✓' : '—', observable: this.observableState.loading ? 'LIVE ●' : this.observableDashboard ? 'STOPPED' : '—', promiseDetail: this.promiseDashboard ? `captured ${this.snapshotAge} seconds ago` : 'point-in-time aggregate', observableDetail: `${this.observableState.metrics.completed} synchronized updates`, comparison: 'Different problem shape — not a speed race', note: 'Promise.all creates a one-time snapshot. combineLatest maintains a view from sources that continue changing.' };
      default: return { label: 'ONE REQUEST · ONE RESULT', promise: this.duration(this.promiseState.metrics.latestLatency), observable: this.duration(this.observableState.metrics.latestLatency), promiseDetail: this.promiseState.result ? '✓ User loaded' : 'async / await', observableDetail: this.observableState.result ? '✓ User loaded' : 'cold stream', comparison: this.promiseState.metrics.latestLatency && this.observableState.metrics.latestLatency ? 'BOTH ARE GOOD' : '', note: 'Same one-shot work. Approximately the same runtime. Observable is not intrinsically faster.' };
    }
  }

  startPresentation(): void { this.presentationMode = true; this.goToPresentationSlide(0); }
  setPresentationMode(enabled: boolean): void { enabled ? this.startPresentation() : this.exitPresentation(); }
  previousPresentationSlide(): void { if (this.activeSlide > 0) this.goToPresentationSlide(this.activeSlide - 1); }
  nextPresentationSlide(): void { if (this.activeSlide < this.presentationSteps.length - 1) this.goToPresentationSlide(this.activeSlide + 1); }
  goToPresentationSlide(index: number): void {
    if (index < 0 || index >= this.presentationSteps.length) return;
    this.stopActiveWork();
    this.activeSlide = index;
    this.presentationMenuOpen = false;
    const scenarioId = this.presentationStep.scenarioId;
    if (scenarioId) this.activeId = scenarioId;
    this.promiseState.codeOpen = false; this.observableState.codeOpen = false;
    this.updatePresentationUrl();
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    this.cdr.markForCheck();
  }
  exitPresentation(): void {
    this.stopActiveWork();
    this.presentationMode = false; this.presentationMenuOpen = false;
    this.updatePresentationUrl(); this.cdr.markForCheck();
  }
  togglePresentationMenu(): void { this.presentationMenuOpen = !this.presentationMenuOpen; this.cdr.markForCheck(); }
  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
  }

  @HostListener('window:keydown', ['$event'])
  handlePresentationKey(event: KeyboardEvent): void {
    if (!this.presentationMode) return;
    if (event.key === 'Escape') { event.preventDefault(); this.exitPresentation(); return; }
    if (this.isEditableTarget(event.target)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); this.nextPresentationSlide(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.previousPresentationSlide(); return; }
    if (event.key === ' ' && !this.isInteractiveTarget(event.target)) { event.preventDefault(); this.nextPresentationSlide(); return; }
    if (event.key === 'Home') { event.preventDefault(); this.startPresentation(); return; }
    if (event.key.toLowerCase() === 'f' && document.fullscreenEnabled) { event.preventDefault(); void this.toggleFullscreen(); }
  }

  setPresentationSpeed(speed: PresentationSpeed): void { this.presentationSpeed = speed; this.clock.setSpeed(speed); this.reset(); }

  renderToken(state: DemoState): string {
    const m = state.metrics;
    return [state.loading, state.result, state.progress, state.events.length, state.codeOpen,
      m.started, m.completed, m.cancelled, m.active, m.emitted, m.errors, m.retries, m.stale, m.rowsScanned, m.rowsAvoided, m.latestLatency,
      state.requests.map((request) => `${request.id}:${request.status}`).join('|')].join(':');
  }

  selectScenario(id: ScenarioId): void { if (id !== this.activeId) { this.reset(); this.activeId = id; this.cdr.markForCheck(); } }
  updateSearch(term: string): void {
    if (term.length >= 2) { this.recordSearchIntent(); void this.promiseSearch(term); }
    this.searchInput.next(term);
  }

  reset(): void {
    if (this.activeId === 'search') this.searchCancel.next();
    this.selectionCancel.next();
    this.cleanup(); this.promiseState = emptyState(); this.observableState = emptyState(); this.requestId = 0;
    this.promiseLatest = 0; this.promiseSelectionLatest = 0; this.sharedRun = false;
    this.promiseWorkflows = []; this.observableWorkflows = []; this.promiseDashboard = undefined; this.observableDashboard = undefined; this.observableDashboardHistory = []; this.snapshotAge = 0;
    this.database.resetHistory(); this.searchControl.setValue('', { emitEvent: false }); this.clock.restartClock(); this.cdr.markForCheck();
  }

  runBoth(): void {
    this.reset(); this.sharedRun = true; this.clock.restartClock();
    queueMicrotask(() => {
      switch (this.activeId) {
        case 'search': this.startAutoType(false); break;
        case 'selection': this.autoSelect(false); break;
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
      case 'dashboard': void this.runPromiseDashboard(); break;
    }
  }

  runObservable(resetClock = true): void {
    if (resetClock) { this.resetSide('observable'); this.clock.restartClock(); }
    switch (this.activeId) {
      case 'basic': this.runObservableBasic(); break;
      case 'search': { const term = this.searchControl.value || 'angular'; if (!this.searchControl.value) this.searchControl.setValue(term, { emitEvent: false }); this.searchInput.next(term); break; }
      case 'selection': this.selectionInput.next('Jessica'); break;
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
  toggleCode(side: Side): void { this.state(side).codeOpen = !this.state(side).codeOpen; this.cdr.markForCheck(); }

  autoType(): void { this.startAutoType(true); }
  private startAutoType(resetFirst: boolean): void {
    if (resetFirst) { this.reset(); this.activeId = 'search'; this.sharedRun = true; this.clock.restartClock(); }
    const values = ['a', 'an', 'ang', 'angu', 'angul', 'angular'];
    values.forEach((value, index) => {
      const timer = window.setTimeout(() => {
        this.searchControl.setValue(value, { emitEvent: false });
        this.log(this.promiseState, 'info', `Input “${value}”`); this.log(this.observableState, 'info', `Input “${value}”`);
        if (value.length >= 2) { this.recordSearchIntent(); void this.promiseSearch(value); }
        this.searchInput.next(value); this.cdr.markForCheck();
      }, this.clock.scale(index * 340));
      this.autoTypeTimers.push(timer);
    });
  }

  selectPerson(person: string): void {
    const intentAt = this.clock.now();
    this.promiseState.metrics.latestIntentAt = intentAt;
    this.observableState.metrics.latestIntentAt = intentAt;
    void this.runPromiseWorkflow(person);
    this.selectionInput.next(person);
  }
  autoSelect(resetFirst = true): void {
    if (resetFirst) { this.reset(); this.activeId = 'selection'; this.sharedRun = true; this.clock.restartClock(); }
    this.people.forEach((person, index) => {
      const handle = window.setTimeout(() => { this.log(this.promiseState, 'info', `Selected ${person}`); this.log(this.observableState, 'info', `selectedUser$ → ${person}`); this.selectPerson(person); this.cdr.markForCheck(); }, this.clock.scale(index * this.selectionCadenceMs));
      this.autoTypeTimers.push(handle);
    });
  }

  get searchGain(): number {
    const promise = this.promiseState.metrics.latestLatency; const observable = this.observableState.metrics.latestLatency;
    return promise > 0 && observable > 0 ? Math.max(0, Math.round((promise - observable) / promise * 1000) / 10) : 0;
  }
  get selectionGain(): number {
    const promise = this.promiseState.metrics.latestLatency; const observable = this.observableState.metrics.latestLatency;
    return promise > 0 && observable > 0 ? Math.max(0, Math.round((promise - observable) / promise * 1000) / 10) : 0;
  }
  workUnits(state: DemoState): number { return Math.round(state.metrics.rowsScanned / 8_000); }
  cancelledWorkUnits(state: DemoState): number { return Math.round(state.metrics.rowsAvoided / 8_000); }
  dashboardSeries(key: keyof DashboardView): string { return this.observableDashboardHistory.map((item) => item[key]).join(' → ') || 'waiting for source values'; }
  workflowStagesExecuted(side: Side): number { return this.workflows(side).reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'completed').length, 0); }
  workflowStagesAvoided(side: Side): number { return this.workflows(side).reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'avoided').length, 0); }
  workflowWasted(side: Side): number { return this.workflows(side).filter((flow) => flow.status === 'stale').reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'completed').length, 0); }
  obsoleteStagesExecuted(side: Side): number { const flows = this.workflows(side); return flows.slice(0, -1).reduce((sum, flow) => sum + flow.stages.filter((stage) => stage.status === 'completed').length, 0); }
  isLatestWorkflow(side: Side, id: number): boolean { return this.workflows(side).at(-1)?.id === id; }

  private workflows(side: Side): WorkflowView[] { return side === 'promise' ? this.promiseWorkflows : this.observableWorkflows; }
  private createWorkflow(side: Side, person: string): WorkflowView {
    const workflow: WorkflowView = { id: ++this.workflowId, person, status: 'running', startedAt: performance.now(), stages: this.workflowStages.map((name) => ({ name, status: 'waiting' })) };
    if (side === 'promise') this.promiseWorkflows = [...this.promiseWorkflows, workflow]; else this.observableWorkflows = [...this.observableWorkflows, workflow];
    return workflow;
  }

  private async runPromiseWorkflow(person: string): Promise<void> {
    const s = this.promiseState; const version = ++this.promiseSelectionLatest; const id = ++this.requestId; const workflow = this.createWorkflow('promise', person);
    this.begin(s, `${person} workflow started`, id, `${person} · 5 stages`);
    try {
      for (let index = 0; index < workflow.stages.length; index++) {
        const stage = workflow.stages[index]!;
        const task = this.promiseSelectionPool.enqueue(workflow.id, person, stage.name, this.clock.scale(this.selectionStageDurationMs), {
          queued: () => { stage.status = 'queued'; this.log(s, 'queue', `${person} · ${stage.name} queued for backend capacity`, id); },
          executing: () => { stage.status = 'running'; this.log(s, 'execute', `${person} · ${stage.name} executing · backend slot acquired`, id); },
          completed: () => this.cdr.markForCheck()
        });
        await task.completed;
        workflow.stages[index]!.status = 'completed'; s.metrics.emitted++; s.metrics.rowsScanned++; this.log(s, 'emit', `${person} · ${workflow.stages[index]!.name} complete`, id);
      }
      if (version === this.promiseSelectionLatest) { workflow.status = 'completed'; s.result = `${person} dashboard ready`; s.metrics.latestResultAt = this.clock.now(); s.metrics.latestLatency = s.metrics.latestResultAt - s.metrics.latestIntentAt; this.complete(s, `${person} dashboard accepted`, id); }
      else { workflow.status = 'stale'; s.metrics.stale++; s.metrics.completed++; s.metrics.active--; this.setRequest(s, id, 'stale'); this.log(s, 'ignore', `${person} dashboard ignored · selection changed`, id); }
    } catch (error) { if ((error as DOMException).name === 'AbortError') this.cancelled(s, id, `${person} workflow aborted during reset`); else this.fail(s, `${person} workflow failed`, id); }
    finally { s.loading = s.metrics.active > 0; this.cdr.markForCheck(); }
  }

  private bindSelectionPipeline(): void {
    this.selectionInput.pipe(switchMap((person) => {
      const s = this.observableState; const id = ++this.requestId; const workflow = this.createWorkflow('observable', person); let completed = false;
      this.begin(s, `${person} workflow subscribed`, id, `${person} · switchMap workflow`);
      return from(workflow.stages.map((_, index) => index)).pipe(
        concatMap((index) => this.runObservableSelectionStage(workflow, index, id)),
        tap((index) => {
          workflow.stages[index]!.status = 'completed'; s.metrics.emitted++; s.metrics.rowsScanned++; this.log(s, 'emit', `${person} · ${workflow.stages[index]!.name} complete`, id);
          if (index === workflow.stages.length - 1) { completed = true; workflow.status = 'completed'; s.result = `${person} dashboard ready`; s.metrics.latestResultAt = this.clock.now(); s.metrics.latestLatency = s.metrics.latestResultAt - s.metrics.latestIntentAt; this.complete(s, `${person} dashboard accepted`, id); }
          this.cdr.markForCheck();
        }),
        takeUntil(this.selectionCancel),
        finalize(() => {
          if (!completed) {
            s.metrics.rowsAvoided += workflow.stages.filter((stage) => stage.status !== 'completed').length;
            workflow.status = 'cancelled'; workflow.stages.forEach((stage) => { if (stage.status === 'running' || stage.status === 'queued') stage.status = 'cancelled'; else if (stage.status === 'waiting') stage.status = 'avoided'; });
            s.metrics.cancelled++; s.metrics.active = Math.max(0, s.metrics.active - 1); this.setRequest(s, id, 'cancelled'); this.log(s, 'cancel', `${person} entire workflow disposed by switchMap`, id);
          }
          s.loading = s.metrics.active > 0; this.cdr.markForCheck();
        })
      );
    }), takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private runObservableSelectionStage(workflow: WorkflowView, index: number, requestId: number): Observable<number> {
    const state = this.observableState;
    const stage = workflow.stages[index]!;
    return new Observable<number>((subscriber) => {
      const task = this.observableSelectionPool.enqueue(workflow.id, workflow.person, stage.name, this.clock.scale(this.selectionStageDurationMs), {
        queued: () => { stage.status = 'queued'; this.log(state, 'queue', `${workflow.person} · ${stage.name} queued for backend capacity`, requestId); },
        executing: () => { stage.status = 'running'; this.log(state, 'execute', `${workflow.person} · ${stage.name} executing · backend slot acquired`, requestId); },
        cancelled: (location) => {
          stage.status = 'cancelled';
          this.log(state, 'teardown', `${workflow.person} · ${stage.name} removed from ${location} backend work · slot released`, requestId);
          this.cdr.markForCheck();
        }
      });
      task.completed.then(() => {
        if (!subscriber.closed) { subscriber.next(index); subscriber.complete(); }
      }).catch((error: unknown) => {
        if (!subscriber.closed && (error as DOMException).name !== 'AbortError') subscriber.error(error);
      });
      return () => task.cancel();
    });
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
    try { const user = await this.api.delay(this.api.user, 2000, controller.signal); s.result = `${user.avatar}  ${user.name} — ${user.role}`; s.metrics.emitted++; s.metrics.latestResultAt = this.clock.now(); s.metrics.latestLatency = s.metrics.latestResultAt; this.complete(s, 'User received'); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') this.fail(s, 'Request failed'); }
    finally { this.promiseControllers.delete(controller); s.loading = false; if (!controller.signal.aborted) this.log(s, 'info', 'finally → loading cleared'); this.cdr.markForCheck(); }
  }

  private runObservableBasic(): void {
    const s = this.observableState; this.begin(s, 'Subscribed · user request started');
    this.observableSub = this.api.observableDelay(this.api.user, 2000).pipe(finalize(() => { s.loading = false; this.log(s, 'info', 'finalize → loading cleared'); this.cdr.markForCheck(); })).subscribe({
      next: (user) => { s.result = `${user.avatar}  ${user.name} — ${user.role}`; s.metrics.emitted++; },
      complete: () => { s.metrics.latestResultAt = this.clock.now(); s.metrics.latestLatency = s.metrics.latestResultAt; this.complete(s, 'User received · stream completed'); }, error: () => this.fail(s, 'Request failed')
    });
  }

  private async promiseSearch(term: string): Promise<void> {
    const s = this.promiseState; const id = ++this.requestId; this.promiseLatest = id; const stats = this.database.stats;
    if (s.metrics.active > 0) this.log(s, 'info', `${s.metrics.active} older Promise quer${s.metrics.active === 1 ? 'y continues' : 'ies continue'} scanning in parallel`);
    this.begin(s, `5-table JOIN “${term}” started · ${this.formatRows(stats.totalRows)} stored rows`, id, term);
    try {
      const result = await this.database.queryPromise(term, {
        queued: () => { this.setRequestStatus(s, id, 'queued'); this.log(s, 'queue', `“${term}” queued for the Promise database lane`, id); },
        executing: () => { this.setRequestStatus(s, id, 'running'); this.log(s, 'execute', `“${term}” executing on the Promise database lane`, id); }
      });
      s.metrics.completed++; s.metrics.active--; s.metrics.rowsScanned += result.rowsScanned; this.setRequest(s, id, id === this.promiseLatest ? 'completed' : 'stale');
      if (id === this.promiseLatest) {
        s.metrics.latestResultAt = this.clock.now(); s.metrics.latestLatency = s.metrics.latestResultAt - s.metrics.latestIntentAt; s.result = `${result.matches.toLocaleString()} joined records · ${result.megabytes} MB for “${term}” · useful result ${this.duration(s.metrics.latestLatency)}`;
        s.metrics.emitted++; this.log(s, 'complete', `“${term}” useful result in ${s.metrics.latestLatency}ms · dataset accepted`, id);
      } else { s.metrics.stale++; this.log(s, 'ignore', `“${term}” completed · ${this.formatRows(result.rowsScanned)} joined rows scanned, stale dataset ignored`, id); }
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
        return this.database.queryObservable(term, {
          queued: () => { this.setRequestStatus(s, activeId, 'queued'); this.log(s, 'queue', `“${term}” queued for the Observable database lane`, activeId); },
          executing: () => { this.setRequestStatus(s, activeId, 'running'); this.log(s, 'execute', `“${term}” executing on the Observable database lane`, activeId); },
          cancelled: (work) => {
            s.metrics.rowsScanned += work.rowsScanned; s.metrics.rowsAvoided += work.rowsAvoided;
            this.log(s, 'teardown', `Teardown removed “${term}” from the lane · ${this.formatRows(work.rowsAvoided)} joined rows avoided`, activeId);
            this.cdr.markForCheck();
          }
        }).pipe(
          takeUntil(this.searchCancel),
          tap((result) => {
            s.metrics.rowsScanned += result.rowsScanned; s.metrics.latestResultAt = this.clock.now(); s.metrics.latestLatency = s.metrics.latestResultAt - s.metrics.latestIntentAt;
            s.result = `${result.matches.toLocaleString()} joined records · ${result.megabytes} MB for “${term}” · useful result ${this.duration(s.metrics.latestLatency)}`;
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
  private setRequestStatus(s: DemoState, id: number, status: 'queued' | 'running'): void { s.requests = s.requests.map((request) => request.id === id ? { ...request, status } : request); }
  private state(side: Side): DemoState { return side === 'promise' ? this.promiseState : this.observableState; }
  private log(s: DemoState, type: Parameters<ComparisonRunnerService['log']>[1], message: string, id?: number): void { this.clock.log(s, type, message, id); }
  private formatRows(rows: number): string { return rows >= 1_000_000 ? `${(rows / 1_000_000).toFixed(1)}M` : `${Math.round(rows / 1000)}K`; }
  private duration(ms: number): string { return ms > 0 ? `${(ms / 1000).toFixed(2)} sec` : '—'; }
  private recordSearchIntent(): void {
    const intentAt = this.clock.now();
    this.promiseState.metrics.latestIntentAt = intentAt;
    this.observableState.metrics.latestIntentAt = intentAt;
  }
  private resetSide(side: Side): void { if (side === 'promise') { this.database.cancel('promise'); this.promiseControllers.forEach((c) => c.abort()); this.promiseControllers.clear(); this.promiseState = emptyState(); } else { this.database.cancel('observable'); this.selectionCancel.next(); this.observableSub?.unsubscribe(); this.observableState = emptyState(); } }
  private cleanup(): void { this.searchCancel.next(); this.selectionCancel.next(); this.database.cancelAll(); this.promiseSelectionPool.reset(); this.observableSelectionPool.reset(); this.promiseControllers.forEach((controller) => controller.abort()); this.promiseControllers.clear(); this.observableSub?.unsubscribe(); this.observableSub = undefined; this.autoTypeTimers.forEach((timer) => window.clearTimeout(timer)); this.autoTypeTimers = []; }

  private stopActiveWork(): void {
    this.reset();
    this.extendedDemo?.reset();
  }

  private updatePresentationUrl(): void {
    const url = new URL(window.location.href);
    if (this.presentationMode) {
      url.searchParams.set('presentation', 'true');
      url.searchParams.set('slide', `${this.activeSlide + 1}`);
    } else {
      url.searchParams.delete('presentation');
      url.searchParams.delete('slide');
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && ['BUTTON', 'A'].includes(target.tagName);
  }

  private readonly descriptions: Record<CoreScenarioId, Record<Side, string>> = {
    basic: { promise: 'async/await resolves one user and clears loading in finally.', observable: 'A cold Observable emits the same user and clears loading in finalize.' },
    search: { promise: 'Obsolete JOINs stay active or queued; version IDs only protect the UI.', observable: 'switchMap removes obsolete JOINs so the useful query receives the lane.' },
    selection: { promise: 'Each async/await workflow continues through the same two-slot backend pool; a version ID only protects the UI.', observable: 'switchMap teardown removes obsolete work from an equivalent pool so the current workflow receives capacity sooner.' },
    dashboard: { promise: 'Promise.all captures one coherent three-source snapshot.', observable: 'combineLatest keeps a live view synchronized as each source changes.' }
  };

  private readonly codes: Record<CoreScenarioId, Record<Side, string>> = {
    basic: { promise: `loading = true;\ntry {\n  user = await getUser();\n} finally {\n  loading = false;\n}`, observable: `getUser$().pipe(\n  finalize(() => loading = false)\n).subscribe(user => this.user = user);` },
    search: { promise: `const requestId = ++this.requestId;\n\n// Older Promise queries continue in parallel.\nconst hugeDataset = await databaseSearch(term);\n\nif (requestId === this.latestRequestId) {\n  this.result = hugeDataset;\n} else {\n  // Protects the UI, but the DB work already finished.\n  this.staleResultsIgnored++;\n}`, observable: `searchControl.valueChanges.pipe(\n  debounceTime(220),\n  distinctUntilChanged(),\n  switchMap(term => databaseSearch$(term))\n  // Unsubscription tears down the obsolete query.\n).subscribe(dataset => this.result = dataset);` },
    selection: { promise: `const version = ++latestVersion;\nconst user = await backendPool.run(() => loadUser(id));\nconst team = await backendPool.run(() => loadTeam(user));\nconst projects = await backendPool.run(() => loadProjects(team));\nconst permissions = await backendPool.run(() => loadPermissions(user));\nconst dashboard = await backendPool.run(() => buildDashboard(...));\nif (version === latestVersion) show(dashboard);`, observable: `selectedUser$.pipe(\n  switchMap(id => loadUser$(id).pipe(\n    concatMap(loadTeam$),\n    concatMap(loadProjects$),\n    concatMap(loadPermissions$),\n    concatMap(buildDashboard$)\n  ))\n  // teardown removes active/queued pool work\n).subscribe(show);` },
    dashboard: { promise: `const snapshot = await Promise.all([\n  getCpu(), getUsers(), getErrorRate()\n]);\n// One coherent point-in-time result`, observable: `combineLatest([cpu$, users$, errors$]).pipe(\n  map(([cpu, users, errors]) => ({\n    cpu, users, errors\n  }))\n).subscribe(renderLiveDashboard);` }
  };
}
