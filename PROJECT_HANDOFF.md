# Promise vs Observable Lab — Project Handoff

## Status

The Angular 22 teaching lab now contains 13 working, side-by-side scenarios. They are organized as a learning path rather than a flat list, use a shared comparison clock, and label every conclusion with one of four honest verdicts:

- Observable Advantage
- Promise Advantage
- Both Are Good
- Different Problem Shape

Validation on August 19, 2026:

- `npm test`: 28 of 28 tests passed across three test files.
- `npm run build`: production build passed.
- Browser screenshot QA was attempted, but no controllable browser was available in the session. Do not describe the current iteration as visually browser-verified.

## Run the project

```bash
npm install
npm start
npm test
npm run build
```

Open `http://localhost:4200`.

## Presentation Polish

### Layout and hierarchy

- Every scenario now places a shared **Primary Result** comparison between Run Both and the detailed panels. This surfaces the scenario's decisive latency, work count, delivery shape, freshness, cancellation, or readability outcome without requiring the audience to scan all metrics.
- Promise remains on the left and Observable on the right in every desktop comparison. Both stack in that order below 850px.
- **Run Both** is the dominant action, changes to a disabled **Running** state while work is active, and keeps Reset visible without causing layout movement.
- Scenario headings show the verdict once beside the title; the learning conclusion repeats it only where useful.
- Presentation Mode now reduces hero whitespace, panel padding, explanations, timeline height, and code prominence while increasing scenario headings, side labels, result values, verdicts, and the main action.
- Presentation Mode includes Previous/Next controls for the six-demo short path: Baseline → Search → Dependent Chain → Progressive Loading → Live Stream → Simple Save. All other scenarios remain available.

### Scenario visuals

- Search database lanes now use explicit **Running**, **Queued**, **Latest**, and **Cancelled** text and icons. Active progress uses a striped progress fill, while the primary result and accuracy callout explain that cancellation recovered constrained capacity rather than making the JOIN itself faster.
- Rapid-selection stages use text labels and symbols for running, complete, cancelled, and avoided work, not color alone.
- High-frequency events now read vertically as raw input → expensive calculations → stale/current output on both sides.
- Live Dashboard visibly distinguishes an aging Promise snapshot from a live Observable subscription and displays the three most recent source values.
- Progressive Loading exposes first-content-visible timing and retains the caveat that independent Promise handlers could also render progressively.
- Live Stream exposes Live, Paused, and Stopped states; Promise-friendly examples show their one-shot flow without portraying Observable as incorrect.

### Timelines, metrics, and code

- Timelines align timestamps/icons/messages, emphasize the newest event, automatically follow new events, preserve scrollback, and use a smaller fixed height in Presentation Mode.
- Metrics use two visual levels. Active work, cancellation/emissions, latest latency, and rows avoided receive primary emphasis; bookkeeping counters remain secondary.
- Code remains collapsed by default, scrolls internally, reports `aria-expanded`, connects its control through `aria-controls`, and stays visually secondary during presentations.

### Navigation, decision guide, and responsive behavior

- The grouped sidebar labels **Core Comparisons**, **More Reactive Patterns**, and **When Promise Shines**. The active scenario has both a visible marker and `aria-current="page"`.
- The final guide now starts with “What shape is your async work?”, shows a result/context/values-over-time decision flow, and ends with Promise, Observable, and Either summaries.
- At 1100px and below the sidebar becomes grouped multi-row navigation. At 850px the comparison stacks Promise then Observable. At 600px scenario navigation, primary results, metrics, code, and decision cards use a single-column mobile layout without page-level horizontal scrolling.

### Accessibility and motion

- Interactive controls have visible keyboard focus, meaningful button text, explicit disabled states, and textual status indicators in addition to color.
- Live results and timelines use status/log semantics with polite announcements.
- `prefers-reduced-motion` disables explanatory transitions and entrance animation while preserving every state change.
- Presentation Mode changes CSS hierarchy only; it does not recreate or restart a running scenario.

### Visual QA status

Browser automation was attempted again for the requested 1920×1080, 1440×900, 1366×768, 430×932, and 390×844 passes, but the environment reported that no controllable browser was available. Real screenshot QA did **not** occur. Responsive CSS was manually audited and DOM/component regression tests cover navigation, panel order, controls, verdicts, code disclosure, the decision guide, runtime errors, and resource teardown. A final physical browser/projector pass remains required.

## Scenario map

### Core Comparisons

1. **Baseline Request — Both Are Good.** One request and one result. Both finish at equivalent speed; Promise is simpler.
2. **Search Under Load — Observable Advantage.** Rapid input feeds equivalent constrained in-memory database lanes. Stale Promise queries keep their lane occupied; `switchMap` teardown frees Observable capacity for the newest useful query.
3. **Rapid Selection Workflow — Observable Advantage.** A changing employee selection starts a five-stage workflow. Version checks protect the Promise UI but old work continues; `switchMap` cancels the whole obsolete Observable chain.
4. **High-Frequency Events — Observable Advantage.** Sixty raw inputs start sixty Promise calculations. `debounceTime` and `switchMap` reduce the Observable side to a few current calculations.
5. **Live Dashboard — Different Problem Shape.** `Promise.all` captures a point-in-time snapshot; `combineLatest` maintains a view from continuing sources.

### More Reactive Patterns

6. **Dependent Request Chain — Observable Advantage.** Customer A, B, and C arrive before four dependent stages finish. Promise chains settle and stale results are ignored; the outer `switchMap` replaces the entire obsolete chain.
7. **Progressive Dashboard Loading — Observable Advantage.** `Promise.all` deliberately renders the complete aggregate at five seconds. Four merged Observable sources render independent sections at 0.8, 1, 2, and 5 seconds. The UI explicitly notes that independent Promise handlers can also progressively render.
8. **Timeout & Cache Fallback — Both Are Good.** `Promise.race` plus cooperative abort and an RxJS `timeout`/`catchError` pipeline deliver the same cache result. RxJS is more composable; it is not faster.
9. **Live Application Log Stream — Different Problem Shape.** A Promise fetches one batch and settles. Observable represents a continuing sequence with pause, resume, stop, and teardown.
10. **Component Lifecycle Cleanup — Observable Advantage.** Navigation occurs during a five-second request. Non-cooperative Promise work settles later and is ignored; Observable unsubscription tears down the operation immediately. The UI notes that Promise cancellation can be added with `AbortController`.

### When Promise Shines

11. **Simple Save Operation — Promise Advantage.** One click, one operation, one result; direct `async`/`await` communicates the intent clearly.
12. **Sequential Workflow — Promise Advantage.** Create Account → Upload Avatar → Send Welcome Email. Both are correct; linear `async`/`await` is easier to read when the context cannot change.
13. **Parallel One-Time Requests — Both Are Good.** `Promise.all` and `forkJoin` complete after the same slowest User, Permissions, and Settings request.

## Presentation tools

- **Run Both** resets the active demo and starts both sides from the same epoch.
- **Fast / Normal / Slow** scales all simulated service work, database ticks, input scripts, and live timers.
- **Presentation Mode** enlarges the lab while retaining the verdicts and decision guide.
- Every panel includes metrics, timeline history, result state, and collapsible source code.
- The final decision guide asks: Is it one result? Are values expected over time? Can the source context change?

## Search database model

The browser app creates deterministic relational data and performs a chunked five-table join:

```text
Developers → Teams → Projects → Developer_Skills → Skills
```

It contains 100,000 developers, 500 teams, 1,500 projects, 300,000 developer-skill relationships, and 12 skills. Promise and Observable receive separate but equivalent single-capacity FIFO lanes. This makes resource contention measurable without one side interfering with the other.

The teaching claim is recovered capacity, not faster SQL. In production, unsubscribing can abort a browser request, but database work stops only when cancellation propagates through the server, driver, and database.

## Architecture

```text
src/app/
  app.component.*                     shell, grouped navigation, core demos, guide
  demos/extended-demo/                scenarios 6–13 and their tests
  core/async-demo.service.ts          cancellable async primitives
  core/comparison-runner.service.ts   shared clock, speed scaling, event logging
  core/in-memory-database.service.ts  relational data, JOIN work, FIFO lanes
  core/demo.models.ts                 state, metrics, verdict and speed types
  shared/comparison-panel/            reusable side-by-side panel
  shared/event-timeline/              lifecycle history
  shared/metrics-panel/               comparable counters
  shared/active-requests/             request lifecycle view
  shared/code-viewer/                 collapsible code
  shared/database-lane/               active, queued, cancelled database work
  shared/verdict-badge/               consistent teaching verdicts
```

The root keeps the original five advanced simulations. The dedicated `ExtendedDemoComponent` owns scenarios 6–13 so the root does not become a monolith. All time-based resources have reset/destroy cleanup; cancellable Promise examples use tracked `AbortController`s and Observable examples use subscription teardown.

## Automated coverage

The 28 tests validate:

- all 13 scenarios and the 5/5/3 grouping;
- shared baseline completion and rendered output;
- realistic search queueing, cancellation, stale protection, work avoided, and latest-result latency;
- whole-workflow cancellation during rapid selection;
- event burst shaping;
- snapshot versus continuing dashboard updates;
- dependent-chain replacement;
- progressive section arrival before `Promise.all`;
- equal cache fallback results;
- one batch versus a stoppable live stream;
- component teardown behavior;
- equivalent simple-save results;
- sequential ordering;
- `Promise.all`/`forkJoin` equivalence;
- reset preventing delayed mutations;
- presentation speed state.
- Presentation Mode and its short-path controls;
- Promise-left / Observable-right DOM order;
- a primary result and readable verdict for every scenario;
- accessible code expansion and collapse;
- decision-guide structure;
- Fast and Slow debounce, scripted-selection, progressive-loading, fallback, navigation-away, and live-stream timing ratios.

The application-level regression suite additionally navigates all 13 scenarios through the rendered sidebar, runs them through their visible **Run Both** controls, checks both timelines and error metrics, traps console/runtime/unhandled-rejection failures, and verifies that component destruction leaves no scheduled timers.

## Technical accuracy guardrails

- Observable is not inherently faster than Promise.
- A Promise does not block creation of later Promises.
- Ignoring a stale result is not cancellation.
- A Promise can cancel cooperative underlying work with an external mechanism such as `AbortController`; the Promise object itself has no cancellation operation.
- Unsubscription only saves work when the Observable source implements teardown and the underlying system honors cancellation.
- `Promise.all` can be replaced with independent Promise handlers when progressive rendering is desired.
- Prefer Promise for simple one-shot control flow; prefer Observable when values, ownership, context, or composition change over time.

## Recommended live presentation

For a concise talk: Baseline → Search Under Load → Dependent Request Chain → Progressive Loading → Live Stream Control → Simple Save → Decision Guide.

For a deep dive: present all scenarios in numerical order. Use **Normal** speed while explaining internals, **Fast** for a complete tour, and **Slow** when narrating cancellation events.

## Remaining manual check

Run a desktop and narrow-mobile browser pass when a controllable browser is available. Check grouped navigation wrapping, sticky header controls, both comparison columns, long timelines, code expansion, the final table, and that every button remains keyboard accessible.
