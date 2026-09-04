import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnChanges, inject, input } from '@angular/core';
import { Subscription, concatMap, finalize, from } from 'rxjs';
import { AsyncDemoService } from '../../core/async-demo.service';
import { ComparisonRunnerService } from '../../core/comparison-runner.service';
import { DemoState, DemoVerdict, PresentationSpeed, Side, emptyState } from '../../core/demo.models';
import { ComparisonPanelComponent } from '../../shared/comparison-panel/comparison-panel.component';
import { PrimaryResultComponent } from '../../shared/primary-result/primary-result.component';
import { VerdictBadgeComponent } from '../../shared/verdict-badge/verdict-badge.component';

export type ExtendedScenarioId = 'lifecycle' | 'sequential';
type ItemStatus = 'waiting' | 'loading' | 'complete' | 'cancelled';
interface VisualItem { label: string; status: ItemStatus; }
interface ExtendedSpec { name: string; eyebrow: string; verdict: DemoVerdict; message: string; promise: string; observable: string; promiseCode: string; observableCode: string; }

@Component({
  selector: 'app-extended-demo', standalone: true,
  imports: [ComparisonPanelComponent, PrimaryResultComponent, VerdictBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './extended-demo.component.html', styleUrl: './extended-demo.component.scss'
})
export class ExtendedDemoComponent implements OnChanges {
  readonly scenarioId = input.required<ExtendedScenarioId>();
  readonly speed = input<PresentationSpeed>('normal');
  private readonly api = inject(AsyncDemoService);
  readonly clock = inject(ComparisonRunnerService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  promiseState = emptyState();
  observableState = emptyState();
  promiseItems: VisualItem[] = [];
  observableItems: VisualItem[] = [];
  mounted = false;
  navigatedAway = false;
  private subscriptions = new Subscription();
  private controllers = new Set<AbortController>();
  private handles: number[] = [];
  private generation = 0;

  readonly specs: Record<ExtendedScenarioId, ExtendedSpec> = {
    lifecycle: {
      name: 'Component Cleanup', eyebrow: 'SCENARIO 05 / 06', verdict: 'observable',
      message: 'Async work has ownership. Observable teardown can stop owned work when the Angular component disappears.',
      promise: 'The deliberately non-cooperative Promise settles after destruction; a guard ignores its result.',
      observable: 'Unsubscription runs source teardown at destruction and stops the underlying timer.',
      promiseCode: `const result = await loadProduct();\nif (!destroyed) this.product = result;\n// AbortController could be added explicitly.`,
      observableCode: `loadProduct$().pipe(\n  takeUntilDestroyed(this.destroyRef)\n).subscribe(product => this.product = product);`
    },
    sequential: {
      name: 'Sequential Workflow', eyebrow: 'SCENARIO 06 / 06', verdict: 'promise',
      message: 'Equivalent deterministic stages take equivalent time. Promise has the readability advantage for this fixed one-shot sequence.',
      promise: 'Three one-time stages read naturally from top to bottom.',
      observable: 'concatMap preserves the same order, but no changing stream or cancellation requirement exists.',
      promiseCode: `const account = await createAccount();\nawait uploadAvatar(account.id);\nawait sendWelcomeEmail(account.email);`,
      observableCode: `createAccount$().pipe(\n  concatMap(uploadAvatar$),\n  concatMap(sendWelcomeEmail$)\n).subscribe();`
    }
  };

  constructor() { this.destroyRef.onDestroy(() => this.cleanup()); }
  ngOnChanges(): void { this.clock.setSpeed(this.speed()); this.reset(); }
  get spec(): ExtendedSpec { return this.specs[this.scenarioId()]; }
  get isRunning(): boolean { return this.promiseState.loading || this.observableState.loading; }
  get primaryResult(): { label: string; promise: string; observable: string; promiseDetail: string; observableDetail: string; comparison: string; note: string } {
    if (this.scenarioId() === 'lifecycle') {
      const promiseStoppedAt = this.promiseState.metrics.underlyingStoppedAt;
      const observableStoppedAt = this.observableState.metrics.underlyingStoppedAt;
      return {
        label: 'UNDERLYING WORK STOPPED AT',
        promise: this.lifecycleTimestamp(promiseStoppedAt),
        observable: this.lifecycleTimestamp(observableStoppedAt),
        promiseDetail: promiseStoppedAt ? 'operation settled · stale result ignored' : this.navigatedAway ? 'work is still running after destroy' : 'request started from shared 0.00 s',
        observableDetail: observableStoppedAt ? 'unsubscribe → teardown → stopped' : 'request started from shared 0.00 s',
        comparison: promiseStoppedAt && observableStoppedAt ? `Observable stopped underlying work ${this.seconds(promiseStoppedAt - observableStoppedAt)} earlier` : '',
        note: 'Both operations started at the shared 0.00 s epoch. This compares when their underlying work stopped—not how quickly a request completed.'
      };
    }
    return {
      label: 'READABILITY · EQUIVALENT RUNTIME',
      promise: this.duration(this.promiseState.metrics.latestLatency),
      observable: this.duration(this.observableState.metrics.latestLatency),
      promiseDetail: '3 stages · linear async/await', observableDetail: '3 stages · concatMap pipeline',
      comparison: this.promiseState.metrics.latestLatency && this.observableState.metrics.latestLatency ? 'PROMISE ADVANTAGE FOR READABILITY · BOTH ARE CORRECT' : '',
      note: 'Promise advantage for readability. Neither implementation is made artificially faster.'
    };
  }

  renderToken(state: DemoState): string {
    const m = state.metrics;
    return [state.loading, state.result, state.events.length, m.completed, m.cancelled, m.emitted, m.latestLatency, m.ownerDestroyedAt, m.underlyingStoppedAt, m.workAfterOwnerDestroyed].join(':');
  }
  runBoth(): void {
    this.reset(); this.clock.restartClock();
    if (this.scenarioId() === 'lifecycle') { this.runLifecycleSide('promise'); this.runLifecycleSide('observable'); this.later(() => this.navigateAway(), 1800); }
    else { this.runSequentialPromise(); this.runSequentialObservable(); }
  }
  runSide(side: Side): void {
    this.reset(); this.clock.restartClock();
    if (this.scenarioId() === 'lifecycle') { this.runLifecycleSide(side); this.later(() => this.navigateAway(), 1800); }
    else if (side === 'promise') this.runSequentialPromise(); else this.runSequentialObservable();
  }
  reset(): void {
    this.cleanup(); this.generation++;
    this.promiseState = emptyState(); this.observableState = emptyState(); this.promiseItems = []; this.observableItems = [];
    this.mounted = false; this.navigatedAway = false; this.clock.restartClock(); this.cdr.markForCheck();
  }
  toggleCode(side: Side): void { const state = this.state(side); state.codeOpen = !state.codeOpen; this.cdr.markForCheck(); }
  postDestroyWork(side: Side): string {
    const state = this.state(side);
    if (!state.metrics.ownerDestroyedAt) return '—';
    if (!state.metrics.underlyingStoppedAt) return 'STILL RUNNING';
    return this.seconds(Math.max(0, state.metrics.underlyingStoppedAt - state.metrics.ownerDestroyedAt));
  }
  lifecycleTimestamp(value: number): string { return value > 0 ? this.seconds(value) : '—'; }

  private runLifecycleSide(side: Side): void {
    this.mounted = true;
    const state = this.state(side);
    this.log(state, 'start', 'Component mounted');
    this.begin(state, side === 'promise' ? 'Promise request started' : 'Observable subscribed');
    if (side === 'promise') {
      const run = this.generation;
      this.handles.push(window.setTimeout(() => {
        if (run !== this.generation) return;
        state.metrics.underlyingStoppedAt = this.clock.now();
        state.metrics.workAfterOwnerDestroyed = Math.max(0, state.metrics.underlyingStoppedAt - state.metrics.ownerDestroyedAt);
        state.metrics.active = 0; state.metrics.completed++; state.loading = false;
        if (this.navigatedAway) { state.metrics.stale++; this.log(state, 'complete', 'Promise settles · underlying work stopped'); this.log(state, 'ignore', 'Result ignored — component already destroyed'); }
        else this.complete(state, 'Product loaded', 'Product rendered');
        this.cdr.markForCheck();
      }, this.clock.scale(5000)));
      return;
    }
    this.subscriptions.add(this.api.observableDelay('Product loaded', 5000).pipe(finalize(() => {
      if (!state.metrics.underlyingStoppedAt) state.metrics.underlyingStoppedAt = this.clock.now();
      if (state.metrics.ownerDestroyedAt) state.metrics.workAfterOwnerDestroyed = Math.max(0, state.metrics.underlyingStoppedAt - state.metrics.ownerDestroyedAt);
      state.loading = false; state.metrics.active = 0;
      this.log(state, 'teardown', 'Teardown executed'); this.cdr.markForCheck();
    })).subscribe((result) => this.complete(state, result, 'Product rendered')));
  }
  private navigateAway(): void {
    if (this.navigatedAway) return;
    this.navigatedAway = true; this.mounted = false;
    const destroyedAt = this.clock.now();
    this.promiseState.metrics.ownerDestroyedAt = destroyedAt; this.observableState.metrics.ownerDestroyedAt = destroyedAt;
    if (this.promiseState.events.length) {
      this.log(this.promiseState, 'destroy', 'Navigation away');
      this.log(this.promiseState, 'destroy', 'Component destroyed');
      this.log(this.promiseState, 'ignore', 'Promise operation continues');
    }
    if (this.observableState.events.length) {
      this.log(this.observableState, 'destroy', 'Navigation away');
      this.log(this.observableState, 'destroy', 'Component destroyed');
      this.observableState.metrics.cancelled++;
      this.log(this.observableState, 'cancel', 'Unsubscribed');
      this.subscriptions.unsubscribe(); this.subscriptions = new Subscription();
      this.log(this.observableState, 'complete', 'Underlying work stopped');
    }
    this.cdr.markForCheck();
  }
  private runSequentialPromise(): void {
    const state = this.promiseState; const labels = ['Create Account', 'Upload Avatar', 'Send Welcome Email']; const startedAt = this.clock.now();
    this.promiseItems = this.items(labels); this.begin(state, 'Sequential async/await workflow started');
    void (async () => {
      try {
        for (let index = 0; index < labels.length; index++) {
          this.setItem(this.promiseItems, index, 'loading'); await this.managedDelay(null, 700); this.setItem(this.promiseItems, index, 'complete');
          state.metrics.emitted++; this.log(state, 'emit', `${labels[index]} complete`);
        }
        state.metrics.latestResultAt = this.clock.now(); state.metrics.latestLatency = state.metrics.latestResultAt - startedAt;
        this.complete(state, 'New user workflow complete', 'All sequential stages complete');
      } catch (error) { if ((error as DOMException).name !== 'AbortError') this.fail(state, 'Sequential workflow failed'); }
    })();
  }
  private runSequentialObservable(): void {
    const state = this.observableState; const labels = ['Create Account', 'Upload Avatar', 'Send Welcome Email']; const startedAt = this.clock.now();
    this.observableItems = this.items(labels); this.begin(state, 'concatMap workflow subscribed');
    this.subscriptions.add(from(labels.map((_, index) => index)).pipe(concatMap((index) => {
      this.setItem(this.observableItems, index, 'loading'); return this.api.observableDelay(index, 700);
    })).subscribe({
      next: (index) => { this.setItem(this.observableItems, index, 'complete'); state.metrics.emitted++; this.log(state, 'emit', `${labels[index]} complete`); },
      complete: () => { state.metrics.latestResultAt = this.clock.now(); state.metrics.latestLatency = state.metrics.latestResultAt - startedAt; this.complete(state, 'New user workflow complete', 'All concatMap stages complete'); }
    }));
  }

  private begin(state: DemoState, message: string): void { state.loading = true; state.metrics.started++; state.metrics.active++; this.log(state, 'start', message); }
  private complete(state: DemoState, result: string, message: string): void { state.result = result; state.loading = false; state.metrics.active = 0; state.metrics.completed++; this.log(state, 'complete', message); this.cdr.markForCheck(); }
  private fail(state: DemoState, message: string): void { state.loading = false; state.metrics.active = 0; state.metrics.errors++; this.log(state, 'error', message); }
  private log(state: DemoState, type: Parameters<ComparisonRunnerService['log']>[1], message: string): void { this.clock.log(state, type, message); this.cdr.markForCheck(); }
  private state(side: Side): DemoState { return side === 'promise' ? this.promiseState : this.observableState; }
  private items(labels: string[]): VisualItem[] { return labels.map((label) => ({ label, status: 'waiting' })); }
  private setItem(items: VisualItem[], index: number, status: ItemStatus): void { items[index] = { ...items[index]!, status }; this.cdr.markForCheck(); }
  private later(callback: () => void, ms: number): void { this.handles.push(window.setTimeout(callback, this.clock.scale(ms))); }
  private duration(ms: number): string { return ms > 0 ? `${(ms / 1000).toFixed(2)} sec` : '—'; }
  private seconds(ms: number): string { return `${(ms / 1000).toFixed(2)} s`; }
  private timelineTime(ms: number): string { return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`; }
  private managedDelay<T>(value: T, ms: number): Promise<T> { const controller = new AbortController(); this.controllers.add(controller); return this.api.delay(value, ms, controller.signal).finally(() => this.controllers.delete(controller)); }
  private cleanup(): void { this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.controllers.forEach((controller) => controller.abort()); this.controllers.clear(); this.handles.forEach((handle) => window.clearTimeout(handle)); this.handles = []; }
}
