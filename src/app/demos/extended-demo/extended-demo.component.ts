import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnChanges, SimpleChanges, inject, input } from '@angular/core';
import { Observable, Subject, Subscription, catchError, concatMap, finalize, forkJoin, from, merge, switchMap, takeUntil, tap, timeout as rxTimeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AsyncDemoService } from '../../core/async-demo.service';
import { ComparisonRunnerService } from '../../core/comparison-runner.service';
import { DemoState, DemoVerdict, PresentationSpeed, Side, emptyState } from '../../core/demo.models';
import { ComparisonPanelComponent } from '../../shared/comparison-panel/comparison-panel.component';
import { VerdictBadgeComponent } from '../../shared/verdict-badge/verdict-badge.component';
import { PrimaryResultComponent } from '../../shared/primary-result/primary-result.component';

export type ExtendedScenarioId = 'dependent' | 'progressive' | 'timeout' | 'live-stream' | 'lifecycle' | 'save' | 'sequential' | 'parallel';
type ItemStatus = 'waiting' | 'loading' | 'complete' | 'cancelled' | 'ignored';
interface VisualItem { label: string; status: ItemStatus; detail?: string; }
interface ExtendedSpec { name: string; eyebrow: string; verdict: DemoVerdict; message: string; promise: string; observable: string; promiseCode: string; observableCode: string; }

@Component({
  selector: 'app-extended-demo', standalone: true,
  imports: [ComparisonPanelComponent, VerdictBadgeComponent, PrimaryResultComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './extended-demo.component.html',
  styleUrl: './extended-demo.component.scss'
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
  selectedContext = '';
  paused = false;
  mounted = false;
  navigatedAway = false;
  private version = 0;
  private sequence = 0;
  private readonly context$ = new Subject<string>();
  private readonly contextCancel$ = new Subject<void>();
  private subscriptions = new Subscription();
  private controllers = new Set<AbortController>();
  private handles: number[] = [];

  readonly specs: Record<ExtendedScenarioId, ExtendedSpec> = {
    dependent: { name: 'Dependent Request Chain', eyebrow: 'MORE REACTIVE PATTERNS · 06', verdict: 'observable', message: 'switchMap can replace an entire dependent async workflow when its source context changes.', promise: 'Readable async/await with version protection; obsolete dependency chains continue.', observable: 'An outer customer stream disposes the entire previous dependent chain.', promiseCode: `const version = ++latest;\nconst customer = await loadCustomer(id);\nconst orders = await loadOrders(customer.id);\nconst details = await loadDetails(orders);\nconst recs = await loadRecommendations(details);\nif (version === latest) show(recs);`, observableCode: `customerId$.pipe(\n  switchMap(id => loadCustomer$(id).pipe(\n    concatMap(loadOrders$),\n    concatMap(loadDetails$),\n    concatMap(loadRecommendations$)\n  ))\n).subscribe(show);` },
    progressive: { name: 'Progressive Dashboard Loading', eyebrow: 'MORE REACTIVE PATTERNS · 07', verdict: 'observable', message: 'Independent streams naturally deliver sections as they arrive; Promise.all intentionally treats them as one aggregate.', promise: 'Promise.all renders one complete aggregate after its slowest dependency.', observable: 'Independent Observables reveal each dashboard section as soon as it arrives.', promiseCode: `const dashboard = await Promise.all([\n  getNotifications(), getProfile(),\n  getOrders(), getRecommendations()\n]);\nrenderCompleteDashboard(dashboard);`, observableCode: `merge(\n  notifications$.pipe(map(value => ({ section: 'notifications', value }))),\n  profile$.pipe(map(value => ({ section: 'profile', value }))),\n  orders$.pipe(map(value => ({ section: 'orders', value }))),\n  recommendations$.pipe(map(value => ({ section: 'recommendations', value })))\n).subscribe(renderSection);` },
    timeout: { name: 'Timeout & Cache Fallback', eyebrow: 'MORE REACTIVE PATTERNS · 08', verdict: 'tie', message: 'Both solve timeout and fallback correctly; RxJS expresses the lifecycle as a composable pipeline.', promise: 'Promise.race detects timeout, aborts cooperative primary work, then awaits cache.', observable: 'timeout + catchError switch to the same cache fallback and finalize cleanup.', promiseCode: `try {\n  return await Promise.race([primary(signal), timeout(2000)]);\n} catch {\n  controller.abort();\n  return await cache();\n}`, observableCode: `primary$().pipe(\n  timeout(2000),\n  catchError(() => cache$()),\n  finalize(() => loading = false)\n);` },
    'live-stream': { name: 'Live Application Log Stream', eyebrow: 'MORE REACTIVE PATTERNS · 09', verdict: 'different-shape', message: 'A Promise represents one eventual batch; Observable directly models a controllable long-lived event sequence.', promise: 'Fetches one log batch and settles. Another batch requires another operation.', observable: 'A continuing subscription emits log entries until paused or stopped.', promiseCode: `const batch = await fetchNextLogBatch();\nrender(batch); // Promise settled`, observableCode: `logStream$.subscribe(renderLog);\n// pause/stop are subscription lifecycle controls\nsubscription.unsubscribe();` },
    lifecycle: { name: 'Component Lifecycle', eyebrow: 'MORE REACTIVE PATTERNS · 10', verdict: 'observable', message: 'Subscription lifetime can naturally follow Angular component lifetime.', promise: 'Without propagated cancellation, work settles after destruction and its result is ignored.', observable: 'Navigation triggers unsubscription; teardown stops the operation immediately.', promiseCode: `const result = await loadProduct();\nif (!destroyed) this.product = result;\n// AbortController could be added explicitly.`, observableCode: `loadProduct$().pipe(\n  takeUntilDestroyed(this.destroyRef)\n).subscribe(product => this.product = product);` },
    save: { name: 'Simple Save Operation', eyebrow: 'WHEN PROMISE SHINES · 11', verdict: 'promise', message: 'For a simple one-shot command, Promise may communicate intent more clearly.', promise: 'One click, one operation, one result: linear async/await is an excellent fit.', observable: 'Works correctly with finalize, but adds no meaningful stream advantage.', promiseCode: `async save() {\n  this.saving = true;\n  try { await saveProfile(this.form.value); }\n  finally { this.saving = false; }\n}`, observableCode: `saveProfile$(form.value).pipe(\n  finalize(() => this.saving = false)\n).subscribe(result => this.saved = result);` },
    sequential: { name: 'Sequential Workflow', eyebrow: 'WHEN PROMISE SHINES · 12', verdict: 'promise', message: 'When one-shot work is linear and context does not change, async/await often provides the clearest code.', promise: 'Three one-time stages read naturally from top to bottom.', observable: 'concatMap is correct and composable, but there is no stream-specific requirement.', promiseCode: `const account = await createAccount();\nawait uploadAvatar(account.id);\nawait sendWelcomeEmail(account.email);`, observableCode: `createAccount$().pipe(\n  concatMap(account => uploadAvatar$(account.id).pipe(map(() => account))),\n  concatMap(account => sendWelcomeEmail$(account.email))\n);` },
    parallel: { name: 'Parallel One-Time Requests', eyebrow: 'WHEN PROMISE SHINES · 13', verdict: 'tie', message: 'Promise.all and forkJoin are both excellent for a fixed set of one-time operations.', promise: 'Promise.all combines User, Permissions, and Settings after the slowest completes.', observable: 'forkJoin is ideal when the same one-time sources already live in an Observable flow.', promiseCode: `const [user, permissions, settings] = await Promise.all([\n  getUser(), getPermissions(), getSettings()\n]);`, observableCode: `forkJoin({\n  user: user$(), permissions: permissions$(), settings: settings$()\n}).subscribe(renderStartup);` }
  };

  constructor() {
    this.bindDependentChain();
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  ngOnChanges(changes: SimpleChanges): void { if (changes['scenarioId'] || changes['speed']) this.reset(); }
  get spec(): ExtendedSpec { return this.specs[this.scenarioId()]; }
  get isRunning(): boolean { return this.promiseState.loading || this.observableState.loading; }
  get primaryResult(): { label: string; promise: string; observable: string; promiseDetail: string; observableDetail: string; note: string } {
    switch (this.scenarioId()) {
      case 'dependent': return { label: 'CONTEXT CHANGED MID-WORKFLOW', promise: `${this.promiseState.metrics.stale} obsolete`, observable: `${this.observableState.metrics.cancelled} cancelled`, promiseDetail: 'chains still settled', observableDetail: 'chains disposed', note: 'The result guard protects the Promise UI; switchMap also releases the obsolete dependency chain.' };
      case 'progressive': return { label: 'FIRST CONTENT VISIBLE', promise: this.promiseState.metrics.latestLatency ? this.duration(this.promiseState.metrics.latestLatency) : '—', observable: this.observableState.metrics.latestLatency ? this.duration(this.observableState.metrics.latestLatency) : '—', promiseDetail: 'aggregate became visible', observableDetail: 'first independent section', note: 'Independent Promise handlers could also progressively render. This compares Promise.all aggregation with independent streams.' };
      case 'timeout': return { label: 'FALLBACK RESULT', promise: this.promiseState.result || '—', observable: this.observableState.result || '—', promiseDetail: 'Promise.race + abort', observableDetail: 'timeout + catchError', note: 'Both approaches are correct. RxJS packages the source switch into one composable pipeline.' };
      case 'live-stream': return { label: 'DELIVERY SHAPE', promise: this.promiseState.metrics.completed ? 'BATCH SETTLED' : '—', observable: this.paused ? 'Ⅱ PAUSED' : this.observableState.loading ? '● LIVE' : this.observableState.metrics.emitted ? '■ STOPPED' : '—', promiseDetail: `${this.promiseState.metrics.emitted} values in one result`, observableDetail: `${this.observableState.metrics.emitted} events over time`, note: 'A batch and a continuing stream are different requirements; neither side is failing.' };
      case 'lifecycle': return { label: 'AFTER NAVIGATION', promise: this.promiseState.metrics.stale ? 'SETTLED LATE' : this.promiseState.loading ? 'STILL RUNNING' : '—', observable: this.observableState.metrics.cancelled ? 'CANCELLED' : this.observableState.loading ? 'SUBSCRIBED' : '—', promiseDetail: 'result guarded after destroy', observableDetail: 'teardown released work', note: 'Promise work can also cooperate with AbortController; subscription ownership makes teardown natural for Observable.' };
      case 'save': return { label: 'ONE ACTION · ONE RESULT', promise: this.promiseState.result ? 'SAVED ✓' : 'ASYNC / AWAIT', observable: this.observableState.result ? 'SAVED ✓' : 'EQUIVALENT', promiseDetail: 'simple linear flow', observableDetail: 'also correct', note: 'Promise communicates this one-shot command with less machinery.' };
      case 'sequential': return { label: 'READABILITY', promise: `${this.promiseState.metrics.emitted} / 3`, observable: `${this.observableState.metrics.emitted} / 3`, promiseDetail: 'top-to-bottom async/await', observableDetail: 'concatMap pipeline', note: 'Both preserve order; async/await is the clearer fit when the workflow is one-shot and cannot change context.' };
      case 'parallel': return { label: 'PARALLEL ONE-TIME RESULT', promise: this.duration(this.promiseState.metrics.latestLatency), observable: this.duration(this.observableState.metrics.latestLatency), promiseDetail: 'Promise.all', observableDetail: 'forkJoin', note: 'Both wait for the same slowest operation. Tiny timer noise is not a performance advantage.' };
    }
  }
  renderToken(state: DemoState): string { const m = state.metrics; return [state.loading, state.result, state.events.length, m.started, m.completed, m.cancelled, m.active, m.emitted, m.stale, this.promiseItems.map(i => i.status), this.observableItems.map(i => i.status)].join(':'); }
  chooseCustomer(customer: string): void { this.reset(); this.selectedContext = customer; void this.runPromiseChain(customer); this.context$.next(customer); }

  runBoth(): void {
    this.reset(); this.clock.restartClock();
    switch (this.scenarioId()) {
      case 'dependent': this.autoCustomers(); break;
      case 'progressive': this.runProgressivePromise(); this.runProgressiveObservable(); break;
      case 'timeout': this.runTimeoutPromise(); this.runTimeoutObservable(); break;
      case 'live-stream': this.fetchPromiseBatch(); this.startLogStream(); break;
      case 'lifecycle': this.runLifecycleBoth(); break;
      case 'save': this.runSavePromise(); this.runSaveObservable(); break;
      case 'sequential': this.runSequentialPromise(); this.runSequentialObservable(); break;
      case 'parallel': this.runParallelPromise(); this.runParallelObservable(); break;
    }
  }

  runSide(side: Side): void {
    if (side === 'promise') { this.controllers.forEach((controller) => controller.abort()); this.controllers.clear(); this.promiseState = emptyState(); } else { this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.observableState = emptyState(); }
    const id = this.scenarioId();
    if (id === 'dependent') side === 'promise' ? void this.runPromiseChain('Customer C') : this.context$.next('Customer C');
    else if (id === 'progressive') side === 'promise' ? this.runProgressivePromise() : this.runProgressiveObservable();
    else if (id === 'timeout') side === 'promise' ? this.runTimeoutPromise() : this.runTimeoutObservable();
    else if (id === 'live-stream') side === 'promise' ? this.fetchPromiseBatch() : this.startLogStream();
    else if (id === 'lifecycle') this.runLifecycleSide(side);
    else if (id === 'save') side === 'promise' ? this.runSavePromise() : this.runSaveObservable();
    else if (id === 'sequential') side === 'promise' ? this.runSequentialPromise() : this.runSequentialObservable();
    else side === 'promise' ? this.runParallelPromise() : this.runParallelObservable();
  }

  reset(): void {
    this.cleanup(); this.contextCancel$.next(); this.promiseState = emptyState(); this.observableState = emptyState(); this.promiseItems = []; this.observableItems = [];
    this.selectedContext = ''; this.paused = false; this.mounted = false; this.navigatedAway = false; this.version = 0; this.clock.restartClock(); this.cdr.markForCheck();
  }
  toggleCode(side: Side): void { const state = side === 'promise' ? this.promiseState : this.observableState; state.codeOpen = !state.codeOpen; this.cdr.markForCheck(); }
  pause(): void { this.paused = true; this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.log(this.observableState, 'info', 'PAUSED · subscription released'); this.observableState.loading = false; this.observableState.metrics.active = 0; this.cdr.markForCheck(); }
  resume(): void { if (this.paused) { this.paused = false; this.startLogStream(false); } }
  stop(): void { this.paused = false; this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.observableState.loading = false; this.observableState.metrics.active = 0; this.log(this.observableState, 'cancel', 'STOPPED · teardown prevented future logs'); this.cdr.markForCheck(); }

  private begin(state: DemoState, message: string): void { state.loading = true; state.metrics.started++; state.metrics.active++; this.log(state, 'start', message); }
  private complete(state: DemoState, result: string, message: string): void { state.result = result; state.loading = false; state.metrics.active = 0; state.metrics.completed++; this.log(state, 'complete', message); this.cdr.markForCheck(); }
  private log(state: DemoState, type: Parameters<ComparisonRunnerService['log']>[1], message: string): void { this.clock.log(state, type, message); this.cdr.markForCheck(); }
  private items(labels: string[]): VisualItem[] { return labels.map((label) => ({ label, status: 'waiting' })); }
  private setItem(items: VisualItem[], index: number, status: ItemStatus, detail?: string): void { items[index] = { ...items[index]!, status, ...(detail ? { detail } : {}) }; this.cdr.markForCheck(); }
  private later(callback: () => void, ms: number): void { this.handles.push(window.setTimeout(callback, this.clock.scale(ms))); }
  private duration(ms: number): string { return ms > 0 ? `${(ms / 1000).toFixed(2)} sec` : '—'; }
  private managedDelay<T>(value: T, ms: number): Promise<T> { const controller = new AbortController(); this.controllers.add(controller); return this.api.delay(value, ms, controller.signal).finally(() => this.controllers.delete(controller)); }

  private autoCustomers(): void { ['Customer A', 'Customer B', 'Customer C'].forEach((customer, index) => this.later(() => { this.selectedContext = customer; void this.runPromiseChain(customer); this.context$.next(customer); }, index * 550)); }
  private async runPromiseChain(customer: string): Promise<void> {
    const state = this.promiseState; const version = ++this.version; const labels = ['Load Customer', 'Load Orders', 'Load Order Details', 'Load Recommendations']; const items = this.items(labels); this.promiseItems.push(...items.map((item) => ({ ...item, label: `${customer} · ${item.label}` }))); const offset = this.promiseItems.length - labels.length; this.begin(state, `${customer} dependency chain started`);
    try {
      for (let index = 0; index < labels.length; index++) { this.setItem(this.promiseItems, offset + index, 'loading'); await this.managedDelay(null, 650); this.setItem(this.promiseItems, offset + index, 'complete'); state.metrics.emitted++; this.log(state, 'emit', `${customer} · ${labels[index]} complete`); }
      state.metrics.active--; state.metrics.completed++;
      if (version === this.version) { state.result = `${customer} recommendations ready`; this.log(state, 'complete', `${customer} chain accepted`); } else { state.metrics.stale++; this.log(state, 'info', `${customer} chain obsolete · final result ignored`); }
      state.loading = state.metrics.active > 0; this.cdr.markForCheck();
    } catch (error) { if ((error as DOMException).name !== 'AbortError') throw error; }
  }
  private bindDependentChain(): void {
    this.context$.pipe(switchMap((customer) => {
      const state = this.observableState; const labels = ['Load Customer', 'Load Orders', 'Load Order Details', 'Load Recommendations']; const items = this.items(labels); this.observableItems = items.map((item) => ({ ...item, label: `${customer} · ${item.label}` })); let completed = false; this.begin(state, `${customer} chain subscribed`);
      return from(labels.map((_, index) => index)).pipe(concatMap((index) => { this.setItem(this.observableItems, index, 'loading'); return this.api.observableDelay(index, 650); }), tap((index) => { this.setItem(this.observableItems, index, 'complete'); state.metrics.emitted++; if (index === labels.length - 1) { completed = true; this.complete(state, `${customer} recommendations ready`, `${customer} chain completed`); } }), takeUntil(this.contextCancel$), finalize(() => { if (!completed) { state.metrics.cancelled++; state.metrics.active = Math.max(0, state.metrics.active - 1); this.observableItems.forEach((item, index) => { if (item.status === 'loading') this.setItem(this.observableItems, index, 'cancelled'); else if (item.status === 'waiting') this.setItem(this.observableItems, index, 'ignored'); }); this.log(state, 'cancel', `${customer} entire dependency chain disposed`); } }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private runProgressivePromise(): void { const state = this.promiseState; const labels = ['Notifications · 0.8s', 'Profile · 1.0s', 'Orders · 2.0s', 'Recommendations · 5.0s']; this.promiseItems = this.items(labels); this.promiseItems.forEach((_, i) => this.setItem(this.promiseItems, i, 'loading')); this.begin(state, 'Promise.all aggregate started'); Promise.all([this.managedDelay('Notifications', 800), this.managedDelay('Profile', 1000), this.managedDelay('Orders', 2000), this.managedDelay('Recommendations', 5000)]).then((values) => { values.forEach((_, i) => this.setItem(this.promiseItems, i, 'complete')); state.metrics.emitted = 4; state.metrics.latestLatency = this.clock.now(); this.complete(state, 'Full dashboard ready', 'Promise.all delivered all four sections'); }).catch((error) => { if ((error as DOMException).name !== 'AbortError') throw error; }); }
  private runProgressiveObservable(): void { const state = this.observableState; const labels = ['Notifications · 0.8s', 'Profile · 1.0s', 'Orders · 2.0s', 'Recommendations · 5.0s']; this.observableItems = this.items(labels); this.observableItems.forEach((_, i) => this.setItem(this.observableItems, i, 'loading')); this.begin(state, 'Four independent section streams subscribed'); const streams = [800, 1000, 2000, 5000].map((delay, index) => this.api.observableDelay(index, delay)); this.subscriptions.add(merge(...streams).subscribe((index) => { this.setItem(this.observableItems, index, 'complete'); state.metrics.emitted++; if (state.metrics.emitted === 1) state.metrics.latestLatency = this.clock.now(); this.log(state, 'emit', `${labels[index]} visible`); if (state.metrics.emitted === 4) this.complete(state, 'Full dashboard ready', 'All sections delivered'); })); }

  private runTimeoutPromise(): void { const state = this.promiseState; const controller = new AbortController(); this.controllers.add(controller); this.promiseItems = this.items(['Primary API', '2s Timeout', 'Cache · 150ms']); this.setItem(this.promiseItems, 0, 'loading'); this.setItem(this.promiseItems, 1, 'loading'); this.begin(state, 'Primary API raced against timeout'); const timeout = this.managedDelay<'timeout'>('timeout', 2000); Promise.race([this.api.delay<'primary'>('primary', 3500, controller.signal), timeout]).then(async (winner) => { if (winner === 'timeout') { controller.abort(); this.setItem(this.promiseItems, 0, 'cancelled'); this.setItem(this.promiseItems, 1, 'complete'); this.setItem(this.promiseItems, 2, 'loading'); this.log(state, 'error', 'Primary timed out · cooperative abort'); const cached = await this.managedDelay('Cached customer data', 150); this.setItem(this.promiseItems, 2, 'complete'); this.complete(state, cached, 'Cache fallback delivered'); } }).catch((error) => { if ((error as DOMException).name !== 'AbortError') throw error; }).finally(() => this.controllers.delete(controller)); }
  private runTimeoutObservable(): void { const state = this.observableState; this.observableItems = this.items(['Primary API', 'timeout(2s)', 'Cache · 150ms']); this.setItem(this.observableItems, 0, 'loading'); this.setItem(this.observableItems, 1, 'loading'); this.begin(state, 'Primary request pipeline subscribed'); this.subscriptions.add(this.api.observableDelay('Primary customer data', 3500).pipe(rxTimeout({ first: this.clock.scale(2000) }), catchError(() => { this.setItem(this.observableItems, 0, 'cancelled'); this.setItem(this.observableItems, 1, 'complete'); this.setItem(this.observableItems, 2, 'loading'); this.log(state, 'error', 'timeout() → switching to cache$'); return this.api.observableDelay('Cached customer data', 150); }), finalize(() => { state.loading = false; this.cdr.markForCheck(); })).subscribe((result) => { this.setItem(this.observableItems, 2, 'complete'); this.complete(state, result, 'Cache fallback delivered'); })); }

  private fetchPromiseBatch(): void { const state = this.promiseState; this.begin(state, 'Fetching next log batch'); this.managedDelay(['User Login', 'API Request', 'Cache Miss'], 800).then((batch) => { state.metrics.emitted += batch.length; batch.forEach((entry) => this.log(state, 'emit', entry)); this.complete(state, `Batch received · ${batch.length} logs · Promise settled`, 'One log batch complete'); }).catch((error) => { if ((error as DOMException).name !== 'AbortError') throw error; }); }
  private startLogStream(resetState = true): void { const state = this.observableState; if (resetState) state.result = ''; this.begin(state, 'Log stream subscribed'); const entries = ['User Login', 'API Request', 'Cache Miss', 'Payment Started', 'API Completed']; const stream = new Observable<string>((subscriber) => { let index = 0; const handle = window.setInterval(() => subscriber.next(entries[index++ % entries.length]!), this.clock.scale(700)); return () => window.clearInterval(handle); }); this.subscriptions.add(stream.pipe(finalize(() => this.log(state, 'info', 'Log stream teardown executed'))).subscribe((entry) => { state.metrics.emitted++; state.result = `LIVE · ${entry}`; this.log(state, 'emit', entry); })); }

  private runLifecycleBoth(): void { this.runLifecycleSide('promise'); this.runLifecycleSide('observable'); this.later(() => this.navigateAway(), 1700); }
  private runLifecycleSide(side: Side): void { this.mounted = true; const state = side === 'promise' ? this.promiseState : this.observableState; this.begin(state, 'Product component mounted · 5s request started'); if (side === 'promise') { const controller = new AbortController(); this.controllers.add(controller); this.api.delay('Product loaded', 5000, controller.signal).then((result) => { if (this.navigatedAway) { state.metrics.stale++; this.log(state, 'info', 'Promise settled after destroy · result ignored'); state.loading = false; state.metrics.active = 0; } else this.complete(state, result, 'Product rendered'); }).catch(() => undefined).finally(() => this.controllers.delete(controller)); } else { const sub = this.api.observableDelay('Product loaded', 5000).pipe(finalize(() => this.log(state, 'cancel', 'Unsubscribed · teardown stopped request'))).subscribe((result) => this.complete(state, result, 'Product rendered')); this.subscriptions.add(sub); } }
  private navigateAway(): void { this.navigatedAway = true; this.mounted = false; this.log(this.promiseState, 'info', 'Navigation away · component destroyed · Promise work continues'); this.log(this.observableState, 'info', 'Navigation away · component destroyed'); this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.observableState.loading = false; this.observableState.metrics.cancelled++; this.observableState.metrics.active = 0; this.cdr.markForCheck(); }

  private runSavePromise(): void { const state = this.promiseState; this.begin(state, 'Save Profile clicked'); this.managedDelay('Profile saved', 1000).then((result) => this.complete(state, result, 'async/await save succeeded')).catch((error) => { if ((error as DOMException).name !== 'AbortError') throw error; }).finally(() => this.log(state, 'info', 'finally → saving false')); }
  private runSaveObservable(): void { const state = this.observableState; this.begin(state, 'Save Profile subscribed'); this.subscriptions.add(this.api.observableDelay('Profile saved', 1000).pipe(finalize(() => this.log(state, 'info', 'finalize → saving false'))).subscribe((result) => this.complete(state, result, 'Observable save succeeded'))); }

  private runSequentialPromise(): void { const state = this.promiseState; const labels = ['Create Account', 'Upload Avatar', 'Send Welcome Email']; this.promiseItems = this.items(labels); this.begin(state, 'Sequential async/await workflow started'); void (async () => { try { for (let i = 0; i < labels.length; i++) { this.setItem(this.promiseItems, i, 'loading'); await this.managedDelay(null, 700); this.setItem(this.promiseItems, i, 'complete'); state.metrics.emitted++; this.log(state, 'emit', `${labels[i]} complete`); } this.complete(state, 'New user workflow complete', 'All sequential stages complete'); } catch (error) { if ((error as DOMException).name !== 'AbortError') throw error; } })(); }
  private runSequentialObservable(): void { const state = this.observableState; const labels = ['Create Account', 'Upload Avatar', 'Send Welcome Email']; this.observableItems = this.items(labels); this.begin(state, 'concatMap workflow subscribed'); this.subscriptions.add(from(labels.map((_, index) => index)).pipe(concatMap((index) => { this.setItem(this.observableItems, index, 'loading'); return this.api.observableDelay(index, 700); })).subscribe({ next: (index) => { this.setItem(this.observableItems, index, 'complete'); state.metrics.emitted++; this.log(state, 'emit', `${labels[index]} complete`); }, complete: () => this.complete(state, 'New user workflow complete', 'All concatMap stages complete') })); }

  private runParallelPromise(): void { const state = this.promiseState; const labels = ['User · 0.8s', 'Permissions · 1.4s', 'Settings · 1.8s']; this.promiseItems = this.items(labels); this.promiseItems.forEach((_, i) => this.setItem(this.promiseItems, i, 'loading')); this.begin(state, 'Promise.all startup requests started'); Promise.all([this.managedDelay('User', 800), this.managedDelay('Permissions', 1400), this.managedDelay('Settings', 1800)]).then((results) => { results.forEach((_, i) => this.setItem(this.promiseItems, i, 'complete')); state.metrics.emitted = 3; state.metrics.latestLatency = this.clock.now(); this.complete(state, 'Startup data ready', 'Promise.all completed after slowest request'); }).catch((error) => { if ((error as DOMException).name !== 'AbortError') throw error; }); }
  private runParallelObservable(): void { const state = this.observableState; const labels = ['User · 0.8s', 'Permissions · 1.4s', 'Settings · 1.8s']; this.observableItems = this.items(labels); this.observableItems.forEach((_, i) => this.setItem(this.observableItems, i, 'loading')); this.begin(state, 'forkJoin startup requests subscribed'); this.subscriptions.add(forkJoin([this.api.observableDelay('User', 800), this.api.observableDelay('Permissions', 1400), this.api.observableDelay('Settings', 1800)]).subscribe((results) => { results.forEach((_, i) => this.setItem(this.observableItems, i, 'complete')); state.metrics.emitted = 3; state.metrics.latestLatency = this.clock.now(); this.complete(state, 'Startup data ready', 'forkJoin completed after slowest source'); })); }

  private cleanup(): void { this.contextCancel$.next(); this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.controllers.forEach((controller) => controller.abort()); this.controllers.clear(); this.handles.forEach((handle) => { window.clearTimeout(handle); window.clearInterval(handle); }); this.handles = []; }
}
