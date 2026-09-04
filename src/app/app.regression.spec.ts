import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ComparisonRunnerService } from './core/comparison-runner.service';
import { ExtendedDemoComponent, ExtendedScenarioId } from './demos/extended-demo/extended-demo.component';

interface RegressionCase { id: string; name: string; wait: number; extended?: boolean; }
const cases: RegressionCase[] = [
  { id: 'basic', name: 'Baseline Request', wait: 2_100 },
  { id: 'search', name: 'Search Under Load', wait: 10_500 },
  { id: 'selection', name: 'Rapid Selection Workflow', wait: 10_500 },
  { id: 'dashboard', name: 'Live Dashboard', wait: 5_100 },
  { id: 'lifecycle', name: 'Component Cleanup', wait: 5_100, extended: true },
  { id: 'sequential', name: 'Sequential Workflow', wait: 2_150, extended: true }
];

describe('Full six-scenario application regression', () => {
  let fixture: ComponentFixture<AppComponent>;
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [AppComponent] }).compileComponents();
    TestBed.inject(ComparisonRunnerService).setSpeed('normal');
    fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
  });
  afterEach(() => { fixture?.destroy(); window.history.replaceState({}, '', '/'); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('renders six compact demo links followed by the Decision Guide', () => {
    const host = fixture.nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLButtonElement>('.scenario-nav button');
    expect(host.querySelectorAll('.scenario-sidebar .nav-group')).toHaveLength(1);
    expect(buttons).toHaveLength(6);
    expect(Array.from(buttons, (button) => button.querySelector('.nav-copy b')?.textContent?.trim())).toEqual(cases.map(({ name }) => name));
    expect(host.querySelector<HTMLAnchorElement>('.decision-link')?.getAttribute('href')).toBe('#decision-guide');
    expect(host.querySelector('.sidebar-heading')?.textContent).toContain('6 FOCUSED DEMOS');
    expect(host.querySelectorAll('.scenario-nav app-verdict-badge')).toHaveLength(0);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
  });

  it('uses one centralized control hierarchy and keeps panel code secondary', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.workspace > .master-controls .run-both')).toHaveLength(1);
    expect(host.querySelectorAll('.workspace > .master-controls .run-promise')).toHaveLength(1);
    expect(host.querySelectorAll('.workspace > .master-controls .run-observable')).toHaveLength(1);
    expect(host.querySelectorAll('.comparison-grid .panel-actions')).toHaveLength(0);
    expect(host.querySelectorAll('.comparison-grid .code-toggle')).toHaveLength(2);
    expect(host.querySelectorAll('.learning app-verdict-badge')).toHaveLength(0);
  });

  it('starts the complete 18-step presentation deck from the landing page', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.hero-actions .deck-primary')!.click(); fixture.detectChanges();
    expect(host.querySelector('.app')?.classList.contains('presentation')).toBe(true);
    expect(host.querySelector('.deck-stage')?.getAttribute('data-slide')).toBe('title');
    expect(host.querySelector('.title-slide')?.textContent).toContain('Choosing the right shape for asynchronous work in Angular');
    expect(host.querySelector('.deck-bar')?.textContent).toContain('1 / 18');
    expect(window.location.search).toContain('presentation=true');
  });

  it('moves next and previous with controls and keyboard, and Escape exits', () => {
    const app = fixture.componentInstance; app.startPresentation(); fixture.detectChanges();
    const controls = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.deck-bar nav button');
    controls[1]!.click(); fixture.detectChanges();
    expect(app.activeSlide).toBe(1);
    controls[0]!.click(); fixture.detectChanges();
    expect(app.activeSlide).toBe(0);
    controls[1]!.focus();
    controls[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); fixture.detectChanges();
    expect(app.activeSlide).toBe(1); expect((fixture.nativeElement as HTMLElement).textContent).toContain('Why does Angular use Observables so heavily?');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); fixture.detectChanges();
    expect(app.activeSlide).toBe(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); fixture.detectChanges();
    expect(app.activeSlide).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
    expect(app.presentationMode).toBe(false); expect((fixture.nativeElement as HTMLElement).querySelector('.scenario-sidebar')).toBeTruthy();
  });

  it('reuses the real Baseline demo and Run Both from presentation', async () => {
    const app = fixture.componentInstance; app.startPresentation(); app.goToPresentationSlide(3); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(app.presentationStep.id).toBe('baseline-demo'); expect(app.activeId).toBe('basic');
    expect(host.querySelectorAll('app-comparison-panel')).toHaveLength(2);
    host.querySelector<HTMLButtonElement>('.workspace .run-both')!.click(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_100); fixture.detectChanges();
    expect(app.promiseState.metrics.completed).toBe(1); expect(app.observableState.metrics.completed).toBe(1);
    expect(Math.abs(app.promiseState.metrics.latestLatency - app.observableState.metrics.latestLatency)).toBeLessThan(40);
  });

  it('keeps Promise and Observable code viewable in presentation demo steps', () => {
    const app = fixture.componentInstance; app.startPresentation(); app.goToPresentationSlide(3); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const coreToggles = host.querySelectorAll<HTMLButtonElement>('.deck-demo-host .code-toggle');
    expect(coreToggles).toHaveLength(2); expect(coreToggles[0]?.getAttribute('aria-expanded')).toBe('false');
    coreToggles[0]!.click(); fixture.detectChanges();
    expect(coreToggles[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.deck-demo-host app-code-viewer pre')?.textContent).toContain('await getUser()');

    app.goToPresentationSlide(14); fixture.detectChanges();
    const extendedToggles = host.querySelectorAll<HTMLButtonElement>('.deck-demo-host .code-toggle');
    expect(extendedToggles).toHaveLength(2); extendedToggles[1]!.click(); fixture.detectChanges();
    expect(host.querySelector('.deck-demo-host app-code-viewer pre')?.textContent).toContain('concatMap');
  });

  it('cleans up active work when presentation exits', async () => {
    const app = fixture.componentInstance; app.startPresentation(); app.goToPresentationSlide(5); fixture.detectChanges();
    app.runBoth(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    app.exitPresentation(); fixture.detectChanges();
    expect(app.presentationMode).toBe(false); expect(app.promiseState.loading).toBe(false); expect(app.observableState.loading).toBe(false);
    expect(app.promiseLane.queued).toHaveLength(0); expect(app.observableLane.queued).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('renders the Decision Guide and final Takeaways as deck steps', () => {
    const app = fixture.componentInstance; app.startPresentation(); app.goToPresentationSlide(15); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#decision-guide')?.textContent).toContain('WHAT SHAPE IS YOUR ASYNC WORK?');
    app.nextPresentationSlide(); fixture.detectChanges();
    expect(host.querySelector('.final-slide')?.textContent).toContain('It becomes powerful when time is part of the problem.');
    expect(host.querySelector('.final-slide')?.textContent).not.toContain("DON'T ASK");
  });

  it('ends on a clean Questions slide with restart, previous, exit, links, and no active work', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = fixture.componentInstance; app.startPresentation(); app.goToPresentationSlide(16); fixture.detectChanges();
    app.nextPresentationSlide(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(app.presentationSteps.at(-1)?.id).toBe('questions'); expect(app.presentationStep.id).toBe('questions');
    expect(host.querySelector('.questions-slide')?.textContent).toContain("Promise • Observable • RxJS • Angular — let's discuss.");
    expect(host.querySelector('.deck-bar')?.textContent).toContain('18 / 18');
    expect(host.querySelector('.deck-next')).toBeNull();
    expect(host.querySelector<HTMLAnchorElement>('.questions-links a:first-child')?.href).toBe('https://ffhaque.github.io/promise-observable-lab/');
    expect(host.querySelector<HTMLAnchorElement>('.questions-links a:last-child')?.href).toBe('https://github.com/ffhaque/promise-observable-lab');
    expect(host.querySelectorAll('.questions-slide app-comparison-panel, .questions-slide app-primary-result')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    host.querySelector<HTMLButtonElement>('.deck-previous')!.click(); fixture.detectChanges();
    expect(app.presentationStep.id).toBe('final');
    app.goToPresentationSlide(17); fixture.detectChanges();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); fixture.detectChanges();
    expect(app.activeSlide).toBe(0); expect(app.presentationStep.id).toBe('title');
    app.goToPresentationSlide(17); fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.deck-exit')!.click(); fixture.detectChanges();
    expect(app.presentationMode).toBe(false); expect(host.querySelector('.scenario-sidebar')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('supports a GitHub Pages-safe direct presentation query URL', () => {
    fixture.destroy(); window.history.replaceState({}, '', '/promise-observable-lab/?presentation=true&slide=6');
    fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    expect(fixture.componentInstance.presentationMode).toBe(true);
    expect(fixture.componentInstance.presentationStep.id).toBe('search-demo');
    expect(fixture.componentInstance.activeId).toBe('search');
  });

  it('renders precise timeline values and separate latest-useful metrics in the DOM', async () => {
    const app = fixture.componentInstance; app.selectScenario('search'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_500); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const timelineText = host.querySelector('.comparison-grid')?.textContent ?? '';
    expect(timelineText).toMatch(/\d+\.\d{2} s/);
    expect(host.querySelector('app-primary-result')?.textContent).toContain('LATEST USEFUL RESULT');
    expect(host.querySelector('app-primary-result')?.textContent).toContain(`${app.searchGain}% sooner`);
    expect(host.textContent).toContain('did not execute the same JOIN faster');
    expect(host.querySelector('.latest-intent')?.textContent).toContain('angular');
    expect(host.querySelector('app-primary-result .comparison')?.textContent).toContain('Observable useful result arrived');
  });

  it('renders scheduler-derived latest intent and lifecycle ownership states', async () => {
    const app = fixture.componentInstance; app.selectScenario('search'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_000); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.lane.observable .query.latest')?.textContent).toContain('LATEST INTENT · EXECUTING');
    app.selectScenario('lifecycle'); fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.master .run')!.click();
    await vi.advanceTimersByTimeAsync(1_850); fixture.detectChanges();
    const lifecycle = (fixture.nativeElement as HTMLElement).querySelector('.lifecycle-journeys')?.textContent ?? '';
    expect(lifecycle).toContain('WORK CONTINUES'); expect(lifecycle).toContain('UNSUBSCRIBE'); expect(lifecycle).toContain('TEARDOWN');
    const honesty = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.honesty')!;
    expect(getComputedStyle(honesty).display).toBe('block');
  });

  it('renders the real Rapid Selection pool contention and measured latency advantage', async () => {
    const app = fixture.componentInstance; app.selectScenario('selection'); app.runBoth(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_900); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.promise-pool')?.textContent).toContain('CAPACITY 2 / 2');
    expect(host.querySelector('.promise-pool')?.textContent).toContain('Jessica · Load User');
    expect(host.querySelector('.observable-pool')?.textContent).toContain('CAPACITY 1 / 2');
    expect(host.querySelector('.observable-pool')?.textContent).toContain('Jessica · Load User');
    expect(host.querySelector('.observable-pool')?.textContent).toContain('David');
    await vi.advanceTimersByTimeAsync(8_500); fixture.detectChanges();
    expect(host.querySelector('app-primary-result')?.textContent).toContain('LATEST DASHBOARD READY');
    expect(host.querySelector('app-primary-result .comparison')?.textContent).toContain(`${app.selectionGain}% sooner`);
    expect(host.querySelector('.selection-explanation')?.textContent).toContain('Jessica received that capacity sooner');
  });

  it('preserves Promise-left, Observable-right, code disclosure, and final guide structure', () => {
    const host = fixture.nativeElement as HTMLElement;
    const panels = host.querySelectorAll<HTMLElement>('.comparison-grid app-comparison-panel');
    expect(panels).toHaveLength(2); expect(panels[0]?.textContent).toContain('PROMISE'); expect(panels[1]?.textContent).toContain('OBSERVABLE');
    const codeToggle = host.querySelector<HTMLButtonElement>('.code-toggle')!;
    expect(codeToggle.getAttribute('aria-expanded')).toBe('false'); codeToggle.click(); fixture.detectChanges();
    expect(codeToggle.getAttribute('aria-expanded')).toBe('true'); expect(host.querySelector('app-code-viewer pre')).toBeTruthy();
    expect(host.querySelectorAll('#decision-guide tbody tr')).toHaveLength(6);
    expect(host.querySelector('#decision-guide')?.textContent).not.toContain('High-Frequency Events');
  });

  it('runs every remaining use case through its visible Run Both control without errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runtimeErrors: unknown[] = []; const rejectionErrors: unknown[] = [];
    const onError = (event: ErrorEvent) => runtimeErrors.push(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => rejectionErrors.push(event.reason);
    window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
    try {
      for (const scenario of cases) {
        const host = fixture.nativeElement as HTMLElement;
        const nav = Array.from(host.querySelectorAll<HTMLButtonElement>('.scenario-nav button')).find((button) => button.textContent?.includes(scenario.name))!;
        nav.click(); fixture.detectChanges();
        const run = host.querySelector<HTMLButtonElement>(scenario.extended ? '.lab-content .master .run' : '.lab-content .run-both')!;
        run.click(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(scenario.wait); fixture.detectChanges();
        if (scenario.extended) {
          const demo = fixture.debugElement.query(By.directive(ExtendedDemoComponent)).componentInstance as ExtendedDemoComponent;
          expect(demo.scenarioId()).toBe(scenario.id as ExtendedScenarioId);
          expect(demo.promiseState.events.length).toBeGreaterThan(0); expect(demo.observableState.events.length).toBeGreaterThan(0);
          expect(demo.promiseState.metrics.errors).toBe(0); expect(demo.observableState.metrics.errors).toBe(0);
        } else {
          expect(fixture.componentInstance.promiseState.events.length).toBeGreaterThan(0);
          expect(fixture.componentInstance.observableState.events.length).toBeGreaterThan(0);
          expect(fixture.componentInstance.promiseState.metrics.errors).toBe(0);
          expect(fixture.componentInstance.observableState.metrics.errors).toBe(0);
        }
      }
    } finally {
      window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
    }
    expect(runtimeErrors).toEqual([]); expect(rejectionErrors).toEqual([]); expect(consoleError).not.toHaveBeenCalled();
  });

  it('can destroy the app during every scenario without timer leaks or delayed errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const scenario of cases) {
      const host = fixture.nativeElement as HTMLElement;
      Array.from(host.querySelectorAll<HTMLButtonElement>('.scenario-nav button')).find((button) => button.textContent?.includes(scenario.name))!.click(); fixture.detectChanges();
      host.querySelector<HTMLButtonElement>(scenario.extended ? '.lab-content .master .run' : '.lab-content .run-both')!.click();
      await Promise.resolve(); await vi.advanceTimersByTimeAsync(250);
    }
    fixture.destroy(); await vi.advanceTimersByTimeAsync(15_000);
    expect(consoleError).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
