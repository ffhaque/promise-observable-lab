import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ComparisonRunnerService } from './core/comparison-runner.service';
import { ExtendedDemoComponent, ExtendedScenarioId } from './demos/extended-demo/extended-demo.component';

interface RegressionCase { id: string; name: string; wait: number; extended?: boolean; }
const cases: RegressionCase[] = [
  { id: 'basic', name: 'Baseline Request', wait: 2_100 },
  { id: 'search', name: 'Search Under Load', wait: 10_500 },
  { id: 'selection', name: 'Rapid Selection Workflow', wait: 4_500 },
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
  afterEach(() => { fixture?.destroy(); vi.restoreAllMocks(); vi.useRealTimers(); });

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
  });

  it('provides presentation navigation through all six demos and onward to the guide', () => {
    const host = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.setPresentationMode(true); fixture.detectChanges();
    expect(host.querySelector('.app')?.classList.contains('presentation')).toBe(true);
    const path = host.querySelector('.presentation-path')!;
    expect(path.textContent).toContain('DEMO 1 OF 6');
    const buttons = path.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0]?.disabled).toBe(true);
    buttons[1]!.click(); fixture.detectChanges();
    expect(fixture.componentInstance.activeId).toBe('search');
    expect(host.querySelector('.presentation-path')?.textContent).toContain('DEMO 2 OF 6');
    fixture.componentInstance.selectScenario('sequential'); fixture.detectChanges();
    expect(host.querySelector('.presentation-path')?.textContent).toContain('DECISION GUIDE');
    expect(host.querySelector<HTMLButtonElement>('.presentation-path button:last-child')?.disabled).toBe(false);
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
