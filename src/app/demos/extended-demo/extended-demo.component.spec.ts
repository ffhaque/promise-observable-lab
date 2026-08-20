import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparisonRunnerService } from '../../core/comparison-runner.service';
import { ExtendedDemoComponent, ExtendedScenarioId } from './extended-demo.component';

describe('ExtendedDemoComponent scenarios', () => {
  let fixture: ComponentFixture<ExtendedDemoComponent>;
  let component: ExtendedDemoComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [ExtendedDemoComponent] }).compileComponents();
    TestBed.inject(ComparisonRunnerService).setSpeed('normal');
  });

  afterEach(() => {
    component?.reset(); fixture?.destroy(); vi.restoreAllMocks(); vi.useRealTimers();
  });

  function create(scenarioId: ExtendedScenarioId): ExtendedDemoComponent {
    fixture = TestBed.createComponent(ExtendedDemoComponent);
    fixture.componentRef.setInput('scenarioId', scenarioId);
    fixture.detectChanges(); component = fixture.componentInstance;
    return component;
  }

  it('cancels obsolete Observable dependency chains while Promise chains finish stale', async () => {
    const demo = create('dependent'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(demo.promiseState.metrics.started).toBe(3);
    expect(demo.promiseState.metrics.stale).toBe(2);
    expect(demo.observableState.metrics.cancelled).toBe(2);
    expect(demo.observableState.metrics.completed).toBe(1);
    expect(demo.promiseState.result).toContain('Customer C');
    expect(demo.observableState.result).toContain('Customer C');
  });

  it('renders Observable dashboard sections progressively before Promise.all resolves', async () => {
    const demo = create('progressive'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(900);
    expect(demo.promiseState.metrics.emitted).toBe(0);
    expect(demo.observableState.metrics.emitted).toBe(1);
    expect(demo.observableItems[0]?.status).toBe('complete');
    await vi.advanceTimersByTimeAsync(4_200);
    expect(demo.promiseState.metrics.completed).toBe(1);
    expect(demo.observableState.metrics.completed).toBe(1);
  });

  it('delivers the same cache result through both timeout strategies', async () => {
    const demo = create('timeout'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(2_300);
    expect(demo.promiseState.result).toBe('Cached customer data');
    expect(demo.observableState.result).toBe('Cached customer data');
    expect(demo.promiseItems[0]?.status).toBe('cancelled');
    expect(demo.observableItems[0]?.status).toBe('cancelled');
  });

  it('shows a settled Promise batch versus a controllable continuing stream', async () => {
    const demo = create('live-stream'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(2_200);
    expect(demo.promiseState.metrics.completed).toBe(1);
    expect(demo.promiseState.metrics.emitted).toBe(3);
    expect(demo.observableState.metrics.emitted).toBeGreaterThan(2);
    demo.stop(); const emissions = demo.observableState.metrics.emitted;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(demo.observableState.metrics.emitted).toBe(emissions);
  });

  it('tears down Observable work on navigation while non-cooperative Promise work settles later', async () => {
    const demo = create('lifecycle'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(1_800);
    expect(demo.navigatedAway).toBe(true);
    expect(demo.observableState.metrics.cancelled).toBe(1);
    expect(demo.promiseState.loading).toBe(true);
    await vi.advanceTimersByTimeAsync(3_300);
    expect(demo.promiseState.metrics.stale).toBe(1);
    expect(demo.promiseState.result).toBe('');
  });

  it('shows Promise as a clear one-shot save without claiming a speed win', async () => {
    const demo = create('save'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(demo.promiseState.result).toBe('Profile saved');
    expect(demo.observableState.result).toBe('Profile saved');
    expect(demo.promiseState.metrics.completed).toBe(demo.observableState.metrics.completed);
  });

  it('completes both sequential workflows in the same order', async () => {
    const demo = create('sequential'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(2_200);
    expect(demo.promiseItems.map((item) => item.status)).toEqual(['complete', 'complete', 'complete']);
    expect(demo.observableItems.map((item) => item.status)).toEqual(['complete', 'complete', 'complete']);
    expect(demo.promiseState.result).toBe(demo.observableState.result);
  });

  it('shows Promise.all and forkJoin as equivalent parallel one-time aggregators', async () => {
    const demo = create('parallel'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(1_900);
    expect(demo.promiseState.metrics.emitted).toBe(3);
    expect(demo.observableState.metrics.emitted).toBe(3);
    expect(demo.promiseState.result).toBe(demo.observableState.result);
  });

  it('reset prevents delayed work from mutating fresh state', async () => {
    const demo = create('progressive'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(500); demo.reset();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(demo.promiseState.events).toEqual([]);
    expect(demo.observableState.events).toEqual([]);
    expect(demo.promiseItems).toEqual([]);
    expect(demo.observableItems).toEqual([]);
  });

  it('scales progressive content, timeout fallback, navigation, and stream cadence consistently', async () => {
    const runner = TestBed.inject(ComparisonRunnerService);
    runner.setSpeed('fast'); const demo = create('progressive'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(359); expect(demo.observableState.metrics.emitted).toBe(0);
    await vi.advanceTimersByTimeAsync(2); expect(demo.observableState.metrics.emitted).toBe(1);

    fixture.componentRef.setInput('scenarioId', 'timeout'); fixture.detectChanges(); demo.runBoth();
    await vi.advanceTimersByTimeAsync(967); expect(demo.observableState.result).toBe('');
    await vi.advanceTimersByTimeAsync(2); expect(demo.observableState.result).toBe('Cached customer data');

    fixture.componentRef.setInput('scenarioId', 'lifecycle'); fixture.detectChanges(); demo.runBoth();
    await vi.advanceTimersByTimeAsync(764); expect(demo.navigatedAway).toBe(false);
    await vi.advanceTimersByTimeAsync(2); expect(demo.navigatedAway).toBe(true);

    fixture.componentRef.setInput('scenarioId', 'live-stream'); fixture.detectChanges(); demo.runBoth();
    await vi.advanceTimersByTimeAsync(314); expect(demo.observableState.metrics.emitted).toBe(0);
    await vi.advanceTimersByTimeAsync(2); expect(demo.observableState.metrics.emitted).toBe(1); demo.stop();

    runner.setSpeed('slow'); demo.reset(); demo.runBoth();
    await vi.advanceTimersByTimeAsync(1_049); expect(demo.observableState.metrics.emitted).toBe(0);
    await vi.advanceTimersByTimeAsync(2); expect(demo.observableState.metrics.emitted).toBe(1); demo.stop();
  });
});
