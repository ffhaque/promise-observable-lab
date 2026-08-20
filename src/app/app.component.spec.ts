import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent presentation scenarios', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppComponent] }).compileComponents();
  });

  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('offers all thirteen scenarios in three teaching groups', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(app.scenarios.map((scenario) => scenario.id)).toEqual(['basic', 'search', 'selection', 'events', 'dashboard', 'dependent', 'progressive', 'timeout', 'live-stream', 'lifecycle', 'save', 'sequential', 'parallel']);
    expect(app.scenarioGroups.map((group) => group.items.length)).toEqual([5, 5, 3]);
  });

  it('scales the demos for presentation without changing the scenario', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.setPresentationSpeed('fast');
    expect(app.activeId).toBe('search'); expect(app.presentationSpeed).toBe('fast');
  });

  it('scales dynamically constructed debounce windows in Fast and Slow modes', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('events');
    app.setPresentationSpeed('fast'); app.runObservable(false);
    await vi.advanceTimersByTimeAsync(53); expect(app.observableState.metrics.started).toBe(0);
    await vi.advanceTimersByTimeAsync(2); expect(app.observableState.metrics.started).toBe(1);
    app.reset(); app.setPresentationSpeed('slow'); app.manualEvent({ target: { value: '51' } } as unknown as Event);
    await vi.advanceTimersByTimeAsync(179); expect(app.observableState.metrics.started).toBe(0);
    await vi.advanceTimersByTimeAsync(2); expect(app.observableState.metrics.started).toBe(1);
  });

  it('preserves rapid-selection sequencing while scaling its scripted input', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('selection');
    app.setPresentationSpeed('fast'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(865); expect(app.promiseState.metrics.started).toBe(5);
    app.reset(); app.setPresentationSpeed('slow'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_879); expect(app.promiseState.metrics.started).toBe(4);
    await vi.advanceTimersByTimeAsync(2); expect(app.promiseState.metrics.started).toBe(5);
  });

  it('renders equivalent baseline results after two seconds', async () => {
    vi.useFakeTimers(); const fixture = TestBed.createComponent(AppComponent); fixture.componentInstance.runBoth(); await Promise.resolve();
    expect(fixture.componentInstance.promiseState.events[0]?.timestamp).toBe(0);
    expect(fixture.componentInstance.observableState.events[0]?.timestamp).toBe(0);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(fixture.componentInstance.promiseState.metrics.completed).toBe(1);
    expect(fixture.componentInstance.observableState.metrics.completed).toBe(1);
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('Platform Engineer');
  });

  it('feeds shared search input to both implementations', () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('search'); app.updateSearch('angular');
    expect(app.promiseState.events.some((event) => event.message.includes('5-table JOIN “angular”'))).toBe(true);
    expect(app.observableState.events.some((event) => event.message.includes('“angular” entered'))).toBe(true); app.reset();
  });

  it('uses equal work and latency for one isolated query', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('search'); app.searchControl.setValue('angular');
    app.runPromise(false); app.runObservable(false); await vi.advanceTimersByTimeAsync(2_200);
    expect(app.promiseState.metrics.latestLatency).toBe(1800);
    expect(app.observableState.metrics.latestLatency).toBe(2020);
    expect(app.promiseState.metrics.rowsScanned).toBe(app.observableState.metrics.rowsScanned);
  });

  it('shows queued Promise work and freed Observable capacity during Auto Type', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('search'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_100);
    expect(app.promiseLane.queued.length).toBeGreaterThan(1);
    expect(app.observableLane.cancelled.length).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(app.promiseState.metrics.started).toBe(5); expect(app.promiseState.metrics.stale).toBe(4);
    expect(app.observableState.metrics.started).toBe(5); expect(app.observableState.metrics.cancelled).toBe(4);
    expect(app.observableState.metrics.rowsAvoided).toBeGreaterThan(2_000_000);
    expect(app.observableState.metrics.latestLatency).toBeLessThan(app.promiseState.metrics.latestLatency * 0.4);
    expect(app.promiseState.metrics.latestLatency).toBeGreaterThanOrEqual(6_000);
    expect(app.observableState.metrics.latestLatency).toBeLessThanOrEqual(3_000);
  });

  it('cancels prior Observable workflows and safely ignores stale Promise dashboards', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('selection'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4_500);
    expect(app.promiseState.metrics.started).toBe(5); expect(app.promiseState.metrics.stale).toBe(4);
    expect(app.promiseState.result).toBe('Jessica dashboard ready');
    expect(app.promiseWorkflows.filter((workflow) => workflow.status === 'stale')).toHaveLength(4);
    expect(app.observableState.metrics.started).toBe(5); expect(app.observableState.metrics.cancelled).toBe(4); expect(app.observableState.metrics.completed).toBe(1);
    expect(app.observableState.result).toBe('Jessica dashboard ready');
    expect(app.workflowStagesAvoided('observable')).toBeGreaterThanOrEqual(16);
    expect(app.workflowWasted('promise')).toBe(20);
  });

  it('shapes a raw event burst into substantially fewer Observable calculations', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('events'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(app.rawEventCount).toBe(60);
    expect(app.promiseState.metrics.started).toBe(60); expect(app.promiseState.metrics.completed).toBe(60); expect(app.promiseState.metrics.stale).toBe(59);
    expect(app.observableState.metrics.started).toBe(4); expect(app.observableState.metrics.cancelled).toBe(3); expect(app.observableState.metrics.completed).toBe(1);
    expect(app.observableState.metrics.started).toBeLessThan(app.promiseState.metrics.started / 10);
  });

  it('captures one Promise snapshot while combineLatest keeps updating', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('dashboard'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_100);
    expect(app.promiseState.metrics.completed).toBe(1); expect(app.promiseState.metrics.emitted).toBe(3); expect(app.promiseState.result).toContain('SNAPSHOT COMPLETE'); expect(app.snapshotAge).toBe(3);
    expect(app.observableDashboard).toBeTruthy(); const updates = app.observableState.metrics.completed; expect(updates).toBeGreaterThan(3);
    await vi.advanceTimersByTimeAsync(2_000); expect(app.promiseState.metrics.completed).toBe(1); expect(app.observableState.metrics.completed).toBeGreaterThan(updates);
  });

  it('reset stops active timers, subscriptions, and async work', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance; app.selectScenario('dashboard'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_100); app.reset(); await vi.advanceTimersByTimeAsync(5_000);
    expect(app.promiseState.events).toEqual([]); expect(app.observableState.events).toEqual([]);
    expect(app.promiseDashboard).toBeUndefined(); expect(app.observableDashboard).toBeUndefined(); expect(app.observableState.metrics.emitted).toBe(0);
  });

  it('reset also stops queued searches, workflow stages, and high-frequency calculations', async () => {
    vi.useFakeTimers(); const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('selection'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(700); app.reset();
    app.selectScenario('events'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(300); app.reset();
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000); app.reset();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(app.promiseState.events).toEqual([]); expect(app.observableState.events).toEqual([]);
    expect(app.promiseLane.active).toBeUndefined(); expect(app.promiseLane.queued).toEqual([]);
    expect(app.observableLane.active).toBeUndefined(); expect(app.observableLane.queued).toEqual([]);
    expect(app.promiseWorkflows).toEqual([]); expect(app.observableWorkflows).toEqual([]); expect(app.rawEventCount).toBe(0);
  });
});
