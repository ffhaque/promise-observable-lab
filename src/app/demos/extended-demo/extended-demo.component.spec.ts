import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparisonRunnerService } from '../../core/comparison-runner.service';
import { ExtendedDemoComponent, ExtendedScenarioId } from './extended-demo.component';

describe('ExtendedDemoComponent timing semantics', () => {
  let fixture: ComponentFixture<ExtendedDemoComponent>;
  let component: ExtendedDemoComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [ExtendedDemoComponent] }).compileComponents();
    TestBed.inject(ComparisonRunnerService).setSpeed('normal');
  });
  afterEach(() => { component?.reset(); fixture?.destroy(); vi.restoreAllMocks(); vi.useRealTimers(); });

  function create(id: ExtendedScenarioId): ExtendedDemoComponent {
    fixture = TestBed.createComponent(ExtendedDemoComponent);
    fixture.componentRef.setInput('scenarioId', id); fixture.detectChanges();
    component = fixture.componentInstance; return component;
  }

  it('tears down Observable work at destruction while the non-cooperative Promise settles later', async () => {
    const demo = create('lifecycle'); demo.runBoth();
    await vi.advanceTimersByTimeAsync(1_850);
    expect(demo.navigatedAway).toBe(true);
    expect(demo.observableState.metrics.cancelled).toBe(1);
    expect(demo.observableState.metrics.underlyingStoppedAt).toBeCloseTo(demo.observableState.metrics.ownerDestroyedAt, 5);
    expect(demo.promiseState.loading).toBe(true);
    await vi.advanceTimersByTimeAsync(3_250);
    expect(demo.promiseState.metrics.stale).toBe(1);
    expect(demo.promiseState.metrics.workAfterOwnerDestroyed).toBeGreaterThan(3_100);
    expect(demo.observableState.metrics.workAfterOwnerDestroyed).toBe(0);
  });

  it('records destruction before Observable teardown and Promise settlement', async () => {
    const demo = create('lifecycle'); demo.runBoth(); await vi.advanceTimersByTimeAsync(5_100);
    const observableDestroy = demo.observableState.events.find((event) => event.type === 'destroy')!;
    const teardown = demo.observableState.events.find((event) => event.type === 'teardown')!;
    const promiseDestroy = demo.promiseState.events.find((event) => event.type === 'destroy')!;
    const promiseComplete = demo.promiseState.events.find((event) => event.type === 'complete')!;
    expect(teardown.timestampMs).toBeGreaterThanOrEqual(observableDestroy.timestampMs);
    expect(teardown.timestampMs - observableDestroy.timestampMs).toBeLessThan(5);
    expect(promiseComplete.timestampMs).toBeGreaterThan(promiseDestroy.timestampMs + 3_000);
  });

  it('completes equivalent sequential stages in order and at approximately equal times', async () => {
    const demo = create('sequential'); demo.runBoth(); await vi.advanceTimersByTimeAsync(2_150);
    expect(demo.promiseItems.map((item) => item.status)).toEqual(['complete', 'complete', 'complete']);
    expect(demo.observableItems.map((item) => item.status)).toEqual(['complete', 'complete', 'complete']);
    expect(demo.promiseState.result).toBe(demo.observableState.result);
    expect(Math.abs(demo.promiseState.metrics.latestLatency - demo.observableState.metrics.latestLatency)).toBeLessThan(10);
    expect(demo.promiseState.events.filter((event) => event.type === 'emit').map((event) => event.message)).toEqual([
      'Create Account complete', 'Upload Avatar complete', 'Send Welcome Email complete'
    ]);
  });

  it('scales lifecycle and sequential durations without changing their relationships', async () => {
    const runner = TestBed.inject(ComparisonRunnerService);
    const lifecycle = create('lifecycle'); runner.setSpeed('fast'); lifecycle.runBoth();
    await vi.advanceTimersByTimeAsync(809); expect(lifecycle.navigatedAway).toBe(false);
    await vi.advanceTimersByTimeAsync(2); expect(lifecycle.navigatedAway).toBe(true);
    lifecycle.reset(); fixture.componentRef.setInput('scenarioId', 'sequential'); fixture.detectChanges(); runner.setSpeed('fast');
    component.runBoth(); await vi.advanceTimersByTimeAsync(950);
    expect(component.promiseState.metrics.completed).toBe(1); expect(component.observableState.metrics.completed).toBe(1);
    expect(Math.abs(component.promiseState.metrics.latestLatency - component.observableState.metrics.latestLatency)).toBeLessThan(10);
  });

  it('reset prevents old timers and subscriptions from mutating fresh state', async () => {
    const demo = create('lifecycle'); demo.runBoth(); await vi.advanceTimersByTimeAsync(500); demo.reset();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(demo.promiseState.events).toEqual([]); expect(demo.observableState.events).toEqual([]);
    expect(demo.promiseState.metrics.completed).toBe(0); expect(demo.observableState.metrics.cancelled).toBe(0);
  });
});
