import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ComparisonRunnerService } from './core/comparison-runner.service';
import { DemoEvent } from './core/demo.models';

describe('AppComponent focused presentation and timing semantics', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [AppComponent] }).compileComponents();
    TestBed.inject(ComparisonRunnerService).setSpeed('normal');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('offers only the six final scenarios in presentation order', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(app.scenarios.map(({ id, name, verdict }) => ({ id, name, verdict }))).toEqual([
      { id: 'basic', name: 'Baseline Request', verdict: 'tie' },
      { id: 'search', name: 'Search Under Load', verdict: 'observable' },
      { id: 'selection', name: 'Rapid Selection Workflow', verdict: 'observable' },
      { id: 'dashboard', name: 'Live Dashboard', verdict: 'different-shape' },
      { id: 'lifecycle', name: 'Component Cleanup', verdict: 'observable' },
      { id: 'sequential', name: 'Sequential Workflow', verdict: 'promise' }
    ]);
  });

  it('uses one shared epoch and near-simultaneous starts for Run Both', async () => {
    const runner = TestBed.inject(ComparisonRunnerService);
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.runBoth(); const epoch = runner.currentEpoch(); await Promise.resolve();
    expect(runner.currentEpoch()).toBe(epoch);
    expect(Math.abs(app.promiseState.events[0]!.timestampMs - app.observableState.events[0]!.timestampMs)).toBeLessThan(5);
  });

  it('keeps equivalent baseline completion timing within scheduler noise', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(2_050);
    expect(app.promiseState.metrics.completed).toBe(1);
    expect(app.observableState.metrics.completed).toBe(1);
    expect(Math.abs(app.promiseState.metrics.latestLatency - app.observableState.metrics.latestLatency)).toBeLessThan(10);
  });

  it('records real search queue, execution, cancellation, teardown, and completion transitions', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10_500);
    expect(app.promiseState.events.some((event) => event.type === 'queue')).toBe(true);
    expect(app.promiseState.events.some((event) => event.type === 'execute' && event.message.includes('angular'))).toBe(true);
    expect(app.observableState.events.some((event) => event.type === 'cancel')).toBe(true);
    expect(app.observableState.events.some((event) => event.type === 'teardown')).toBe(true);
    expect(app.observableState.events.some((event) => event.type === 'complete' && event.message.includes('angular'))).toBe(true);
  });

  it('never completes cancelled Observable jobs while obsolete Promise jobs finish stale', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10_500);
    const cancelledIds = new Set(app.observableState.events.filter((event) => event.type === 'cancel').map((event) => event.requestId));
    expect(cancelledIds.size).toBeGreaterThan(2);
    expect(app.observableState.events.filter((event) => event.type === 'complete' && cancelledIds.has(event.requestId))).toEqual([]);
    expect(app.promiseState.events.filter((event) => event.type === 'ignore')).toHaveLength(4);
  });

  it('measures Latest Useful Result from final input instead of Run Both', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10_500);
    for (const state of [app.promiseState, app.observableState]) {
      expect(state.metrics.latestIntentAt).toBeGreaterThan(1_600);
      expect(state.metrics.latestLatency).toBeCloseTo(state.metrics.latestResultAt - state.metrics.latestIntentAt, 5);
      expect(state.metrics.latestLatency).toBeLessThan(state.metrics.latestResultAt);
    }
  });

  it('releases Observable capacity and materially improves latest useful search latency', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10_500);
    expect(app.observableState.metrics.rowsAvoided).toBeGreaterThan(2_000_000);
    expect(app.observableState.metrics.latestLatency).toBeLessThan(app.promiseState.metrics.latestLatency * 0.45);
    expect(app.observableLane.queued).toEqual([]); expect(app.observableLane.active).toBeUndefined();
  });

  it('uses equal constrained pools so switchMap releases capacity for the latest selection', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('selection'); app.runBoth(); await Promise.resolve();
    expect(app.promiseSelectionPoolSnapshot.capacity).toBe(app.observableSelectionPoolSnapshot.capacity);
    expect(app.selectionPoolCapacity).toBe(2);
    expect(app.selectionStageDurationMs).toBeGreaterThan(app.selectionCadenceMs);

    await vi.advanceTimersByTimeAsync(1_900);
    expect(app.promiseState.metrics.latestIntentAt).toBe(app.observableState.metrics.latestIntentAt);
    expect(app.promiseSelectionPoolSnapshot.active).toHaveLength(2);
    expect(app.promiseSelectionPoolSnapshot.queued.some((task) => task.person === 'Jessica')).toBe(true);
    expect(app.observableSelectionPoolSnapshot.active).toHaveLength(1);
    expect(app.observableSelectionPoolSnapshot.active[0]?.person).toBe('Jessica');
    expect(app.observableSelectionPoolSnapshot.queued).toEqual([]);
    expect(app.observableState.metrics.cancelled).toBe(4);

    const cancelledIds = new Set(app.observableState.events.filter((event) => event.type === 'cancel').map((event) => event.requestId));
    await vi.advanceTimersByTimeAsync(8_500);
    expect(app.promiseState.metrics.stale).toBe(4); expect(app.observableState.metrics.cancelled).toBe(4);
    expect(app.workflowWasted('promise')).toBe(20); expect(app.workflowStagesAvoided('observable')).toBe(16);
    expect(app.observableState.metrics.rowsAvoided).toBe(20); expect(app.observableState.metrics.rowsScanned).toBe(5);
    expect(app.observableState.events.filter((event) => event.type === 'complete' && cancelledIds.has(event.requestId))).toEqual([]);
    const promiseJessicaStart = app.promiseState.events.find((event) => event.type === 'execute' && event.message.includes('Jessica · Load User'))!;
    const observableJessicaStart = app.observableState.events.find((event) => event.type === 'execute' && event.message.includes('Jessica · Load User'))!;
    expect(observableJessicaStart.timestampMs).toBeLessThan(promiseJessicaStart.timestampMs);
    expect(app.promiseState.metrics.latestLatency).toBeCloseTo(app.promiseState.metrics.latestResultAt - app.promiseState.metrics.latestIntentAt, 5);
    expect(app.observableState.metrics.latestLatency).toBeCloseTo(app.observableState.metrics.latestResultAt - app.observableState.metrics.latestIntentAt, 5);
    expect(app.observableState.metrics.latestLatency).toBeLessThan(app.promiseState.metrics.latestLatency * 0.7);
    expect(app.selectionGain).toBeGreaterThan(30);
    expect(app.observableState.events.filter((event) => event.type === 'cancel').every((event) => event.timestampMs < app.observableState.metrics.latestResultAt)).toBe(true);
    expect(times(app.promiseState.events)).toEqual([...times(app.promiseState.events)].sort((a, b) => a - b));
    expect(times(app.observableState.events)).toEqual([...times(app.observableState.events)].sort((a, b) => a - b));
  });

  it('removes Rapid Selection backend work on teardown and reset', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('selection'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000);
    expect(app.promiseSelectionPoolSnapshot.active.length + app.promiseSelectionPoolSnapshot.queued.length).toBeGreaterThan(0);
    expect(app.observableState.events.some((event) => event.type === 'teardown' && event.message.includes('slot released'))).toBe(true);
    app.reset(); await Promise.resolve(); await vi.runAllTimersAsync();
    expect(app.promiseSelectionPoolSnapshot.active).toEqual([]); expect(app.promiseSelectionPoolSnapshot.queued).toEqual([]);
    expect(app.observableSelectionPoolSnapshot.active).toEqual([]); expect(app.observableSelectionPoolSnapshot.queued).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no Rapid Selection pool timers when the component is destroyed', async () => {
    const fixture = TestBed.createComponent(AppComponent); const app = fixture.componentInstance;
    app.selectScenario('selection'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000);
    fixture.destroy(); await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('models Live Dashboard as snapshot versus continuing values, not a speed race', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('dashboard'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(5_100);
    expect(app.promiseState.metrics.completed).toBe(1);
    const updates = app.observableState.metrics.completed; expect(updates).toBeGreaterThan(3);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(app.promiseState.metrics.completed).toBe(1); expect(app.observableState.metrics.completed).toBeGreaterThan(updates);
  });

  it('keeps timestamps monotonic on both timelines', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10_500);
    expect(times(app.promiseState.events)).toEqual([...times(app.promiseState.events)].sort((a, b) => a - b));
    expect(times(app.observableState.events)).toEqual([...times(app.observableState.events)].sort((a, b) => a - b));
  });

  it('reset clears timelines and prevents old scheduled work from returning', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000); app.reset();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(app.promiseState.events).toEqual([]); expect(app.observableState.events).toEqual([]);
    expect(app.promiseLane.active).toBeUndefined(); expect(app.observableLane.active).toBeUndefined();
    expect(app.promiseLane.queued).toEqual([]); expect(app.observableLane.queued).toEqual([]);
  });

  it('speed mode scales durations while preserving the cancellation advantage', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.selectScenario('search'); app.setPresentationSpeed('fast'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(5_000);
    const fastPromise = app.promiseState.metrics.latestLatency;
    expect(fastPromise).toBeGreaterThan(0); expect(app.observableState.metrics.latestLatency).toBeLessThan(fastPromise * 0.45);
    app.setPresentationSpeed('slow'); app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(16_000);
    expect(app.promiseState.metrics.latestLatency).toBeGreaterThan(fastPromise * 2.5);
    expect(app.observableState.metrics.latestLatency).toBeLessThan(app.promiseState.metrics.latestLatency * 0.45);
  });
});

function times(events: DemoEvent[]): number[] { return events.map((event) => event.timestampMs); }
