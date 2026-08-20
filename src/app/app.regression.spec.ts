import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ComparisonRunnerService } from './core/comparison-runner.service';
import { ExtendedDemoComponent, ExtendedScenarioId } from './demos/extended-demo/extended-demo.component';

interface RegressionCase {
  id: string;
  name: string;
  wait: number;
  extended?: boolean;
}

const cases: RegressionCase[] = [
  { id: 'basic', name: 'Baseline Request', wait: 2_100 },
  { id: 'search', name: 'Search Under Load', wait: 10_100 },
  { id: 'selection', name: 'Rapid Selection Workflow', wait: 4_500 },
  { id: 'events', name: 'High-Frequency Events', wait: 3_000 },
  { id: 'dashboard', name: 'Live Dashboard', wait: 5_100 },
  { id: 'dependent', name: 'Dependent Request Chain', wait: 4_000, extended: true },
  { id: 'progressive', name: 'Progressive Loading', wait: 5_100, extended: true },
  { id: 'timeout', name: 'Timeout + Fallback', wait: 2_300, extended: true },
  { id: 'live-stream', name: 'Live Stream Control', wait: 2_200, extended: true },
  { id: 'lifecycle', name: 'Component Cleanup', wait: 5_100, extended: true },
  { id: 'save', name: 'Simple Save', wait: 1_100, extended: true },
  { id: 'sequential', name: 'Sequential Workflow', wait: 2_200, extended: true },
  { id: 'parallel', name: 'Parallel One-Time Requests', wait: 1_900, extended: true }
];

describe('Full application regression', () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [AppComponent] }).compileComponents();
    TestBed.inject(ComparisonRunnerService).setSpeed('normal');
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders a non-overlapping sidebar structure with every scenario grouped and reachable', () => {
    const host = fixture.nativeElement as HTMLElement;
    const groups = host.querySelectorAll('.scenario-sidebar .nav-group');
    const buttons = host.querySelectorAll<HTMLButtonElement>('.scenario-sidebar .scenario-nav button');

    expect(groups).toHaveLength(3);
    expect(buttons).toHaveLength(13);
    expect(Array.from(groups, (group) => group.querySelector('h2')?.textContent?.trim())).toEqual([
      'Core Comparisons', 'More Reactive Patterns', 'When Promise Shines'
    ]);
    expect(Array.from(buttons, (button) => button.querySelector('.nav-copy b')?.textContent?.trim())).toEqual(cases.map((item) => item.name));
    expect(new Set(Array.from(buttons, (button) => button.textContent?.trim())).size).toBe(13);
    expect(host.querySelectorAll('.scenario-nav app-verdict-badge')).toHaveLength(13);
  });

  it('preserves the presentation hierarchy, comparison order, code disclosure, and decision guide', () => {
    const host = fixture.nativeElement as HTMLElement;
    const presentationToggle = host.querySelector<HTMLInputElement>('.mode-toggle input')!;
    presentationToggle.click(); fixture.detectChanges();
    expect(host.querySelector('.app')?.classList.contains('presentation')).toBe(true);
    expect(host.querySelector('.presentation-path')).toBeTruthy();

    const panels = host.querySelectorAll<HTMLElement>('.comparison-grid app-comparison-panel');
    expect(panels).toHaveLength(2);
    expect(panels[0]?.textContent).toContain('PROMISE');
    expect(panels[1]?.textContent).toContain('OBSERVABLE');
    expect(host.querySelector('app-primary-result')).toBeTruthy();

    const codeToggle = host.querySelector<HTMLButtonElement>('.code-toggle')!;
    expect(codeToggle.getAttribute('aria-expanded')).toBe('false');
    codeToggle.click(); fixture.detectChanges();
    expect(codeToggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('app-code-viewer pre')).toBeTruthy();
    codeToggle.click(); fixture.detectChanges();
    expect(host.querySelector('app-code-viewer pre')).toBeNull();

    expect(host.querySelector('.decision-tree')?.textContent).toContain('ONE EVENTUAL RESULT?');
    expect(host.querySelectorAll('.decision-columns article')).toHaveLength(3);
    expect(host.querySelector('.closing-principle')?.textContent).toContain('What is the shape of my asynchronous problem?');
  });

  it('keeps one prominent Run Both control and a readable verdict for every selected scenario', () => {
    for (const scenario of cases) {
      const host = fixture.nativeElement as HTMLElement;
      const navButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.scenario-nav button'))
        .find((button) => button.querySelector('.nav-copy b')?.textContent?.trim() === scenario.name)!;
      navButton.click(); fixture.detectChanges();
      expect(host.querySelectorAll(scenario.extended ? '.lab-content .master .run' : '.lab-content .run-both')).toHaveLength(1);
      expect(host.querySelector('.lab-content app-verdict-badge')?.textContent?.trim().length, `${scenario.name}: verdict text`).toBeGreaterThan(0);
      expect(host.querySelector('.lab-content app-primary-result'), `${scenario.name}: primary result`).toBeTruthy();
      expect(navButton.getAttribute('aria-current'), `${scenario.name}: current page semantics`).toBe('page');
    }
  });

  it('runs all thirteen use cases through the rendered controls without runtime errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runtimeErrors: unknown[] = [];
    const rejectionErrors: unknown[] = [];
    const onError = (event: ErrorEvent) => runtimeErrors.push(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => rejectionErrors.push(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    try {
      for (const scenario of cases) {
        const host = fixture.nativeElement as HTMLElement;
        const navButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.scenario-nav button'))
          .find((button) => button.querySelector('.nav-copy b')?.textContent?.trim() === scenario.name);

        expect(navButton, `${scenario.name}: navigation button`).toBeTruthy();
        navButton!.click(); fixture.detectChanges();
        expect(navButton!.classList.contains('active'), `${scenario.name}: active navigation state`).toBe(true);
        expect(host.textContent, `${scenario.name}: rendered heading`).toContain(scenario.name);

        const runButton = host.querySelector<HTMLButtonElement>(scenario.extended ? '.lab-content .master .run' : '.lab-content .run-both');
        expect(runButton, `${scenario.name}: Run Both button`).toBeTruthy();
        runButton!.click(); await Promise.resolve();
        await vi.advanceTimersByTimeAsync(scenario.wait); fixture.detectChanges();

        if (scenario.extended) {
          const demo = fixture.debugElement.query(By.directive(ExtendedDemoComponent))?.componentInstance as ExtendedDemoComponent | undefined;
          expect(demo, `${scenario.name}: extended demo instance`).toBeTruthy();
          expect(demo!.scenarioId(), `${scenario.name}: selected scenario`).toBe(scenario.id as ExtendedScenarioId);
          expect(demo!.promiseState.events.length, `${scenario.name}: Promise timeline`).toBeGreaterThan(0);
          expect(demo!.observableState.events.length, `${scenario.name}: Observable timeline`).toBeGreaterThan(0);
          expect(demo!.promiseState.metrics.errors, `${scenario.name}: Promise metric errors`).toBe(0);
          expect(demo!.observableState.metrics.errors, `${scenario.name}: Observable metric errors`).toBe(0);
        } else {
          const app = fixture.componentInstance;
          expect(app.promiseState.events.length, `${scenario.name}: Promise timeline`).toBeGreaterThan(0);
          expect(app.observableState.events.length, `${scenario.name}: Observable timeline`).toBeGreaterThan(0);
          expect(app.promiseState.metrics.errors, `${scenario.name}: Promise metric errors`).toBe(0);
          expect(app.observableState.metrics.errors, `${scenario.name}: Observable metric errors`).toBe(0);
        }
      }
    } finally {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    }

    expect(runtimeErrors).toEqual([]);
    expect(rejectionErrors).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('can leave every running scenario without delayed mutations or uncaught errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    for (const scenario of cases) {
      const host = fixture.nativeElement as HTMLElement;
      const navButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.scenario-nav button'))
        .find((button) => button.querySelector('.nav-copy b')?.textContent?.trim() === scenario.name)!;
      navButton.click(); fixture.detectChanges();
      host.querySelector<HTMLButtonElement>(scenario.extended ? '.lab-content .master .run' : '.lab-content .run-both')!.click();
      await Promise.resolve(); await vi.advanceTimersByTimeAsync(250);
    }

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(consoleError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
