# Promise vs Observable Lab — Project Handoff

## Current status

The Angular 22 lab is now a short technical presentation with six demonstrations and a final Decision Guide.

| # | Demonstration | Verdict | Main lesson |
|---|---|---|---|
| 1 | Baseline Request | Both Are Good | One-shot work has equivalent runtime. |
| 2 | Search Under Load | Observable Advantage | Cancellation recovers constrained capacity. |
| 3 | Rapid Selection Workflow | Observable Advantage | `switchMap` replaces an obsolete whole workflow. |
| 4 | Live Dashboard | Different Problem Shape | Snapshot versus continuing synchronized values. |
| 5 | Component Cleanup | Observable Advantage | Owned work stops with component lifetime. |
| 6 | Sequential Workflow | Promise Advantage | Fixed one-shot sequencing is clearer with `async`/`await`. |

Removed completely from navigation, implementation, and tests: High-Frequency Events, Dependent Request Chain, Progressive Dashboard Loading, Timeout & Cache Fallback, Live Application Log Stream, Simple Save Operation, and Parallel One-Time Requests.

## Timing audit findings

There was a real timeline semantics problem. Search logged every database request as “started” before the constrained lane actually began executing it. Queued time and execution time were therefore visually indistinguishable. The shared clock was correct, but timestamps were rounded at capture time, reducing the source data's precision.

The corrected system now:

- starts both sides from one shared `performance.now()` epoch;
- stores raw `performance.now() - epoch` milliseconds in `DemoEvent.timestampMs`;
- formats timestamps only in the view (`342 ms`, `2.13 s`, `12.4 s`);
- records request, queue, actual execution, cancellation, teardown, completion, and ignored-result transitions when they happen;
- records latest user intent and accepted-result timestamps separately;
- calculates `latestLatency = latestResultAt - latestIntentAt`;
- uses immutable event-array updates and explicit OnPush refresh signals;
- clears scheduled inputs, timers, lanes, subscriptions, and controllers on reset.

No completion timestamp is derived from `start + configuredDelay`. Configured delays only schedule work; recorded events call the shared clock at the actual callback, teardown, or state transition.

## Search scheduler and cancellation

Search uses deterministic relational data:

```text
Developers → Teams → Projects → Developer_Skills → Skills
```

It creates 100,000 developers, 500 teams, 1,500 projects, 300,000 developer-skill relationships, and 12 skills. Promise and Observable use equivalent, independent, single-capacity FIFO lanes.

Promise requests enter the queue and finish even after becoming obsolete. Request IDs keep stale results out of the UI but do not free the lane. Observable requests use `switchMap`; inner unsubscription calls the query-source teardown, removes the task from the scheduler, clears/reschedules the active lane timer when necessary, stops further chunks, and prevents later completion.

At Normal speed with deterministic fake timers, the final Search intent occurs around 1.70 seconds. The Observable's useful result takes about 2.02 seconds from that input. The Promise's useful result takes about 7.64 seconds because the final query waits behind obsolete joins. Exact browser values can vary with scheduling and CPU load; the behavior and ordering—not hardcoded displayed values—produce the difference.

## Scenario-specific timing conclusions

- **Baseline Request:** equivalent two-second one-shot work; timings intentionally match within scheduler noise.
- **Search Under Load:** Observable's newest useful result arrives materially earlier because cancelled work releases lane capacity.
- **Rapid Selection Workflow:** both sides now use independent, equivalent two-slot backend pools and identical 600 ms stage durations. Obsolete Promise workflows continue consuming or queueing for capacity; `switchMap` teardown removes the Observable's active/queued stage and releases its slot. Jessica therefore receives Observable capacity sooner, producing a real measured latest-dashboard latency advantage without a Promise-only delay.
- **Live Dashboard:** not a speed comparison. Promise settles with a snapshot; Observable keeps emitting a synchronized view.
- **Component Cleanup:** navigation occurs around 1.8 seconds. Observable teardown stops the timer then; the deliberately non-cooperative Promise settles around five seconds and its result is ignored. The primary result reports the actual shared-clock time when underlying work stopped (approximately 5.00 s versus 1.80 s). A separately labeled secondary result reports post-destroy work (approximately 3.20 s versus 0.00 s), using seconds consistently so zero cannot be mistaken for total Observable duration.
- **Sequential Workflow:** both three-stage flows use equal deterministic delays and complete at approximately equal time. Promise wins on readability.

## Architecture

```text
src/app/
  app.component.*                     shell, four core demos, navigation, guide
  demos/extended-demo/                Component Cleanup and Sequential Workflow
  core/async-demo.service.ts          Promise and Observable delay primitives
  core/comparison-runner.service.ts   shared epoch, raw event time, speed scaling
  core/in-memory-database.service.ts  joined data and cancellable FIFO lanes
  core/demo.models.ts                 state, raw timeline events, metrics
  shared/comparison-panel/            reusable side-by-side presentation panel
  shared/event-timeline/              precise event history formatting
  shared/database-lane/               scheduler-derived active/queued/cancelled UI
  shared/primary-result/              scenario-specific headline metrics
```

## Validation coverage

The automated suite covers:

- the exact six-scenario order and verdicts;
- one shared Run Both epoch and near-simultaneous starts;
- equivalent Baseline and Sequential timings;
- Search queue/execution/cancel/teardown/completion ordering;
- no completion after an Observable job is cancelled;
- stale Promise jobs continuing to completion;
- latest-useful latency measured from final input;
- material Search latency improvement from released capacity;
- Rapid Selection teardown, stale work, and avoided stages;
- snapshot versus continuing Dashboard behavior;
- Component Cleanup destruction, teardown, later Promise settlement, and work-after-destroy metrics;
- monotonic timestamps;
- reset and destruction preventing delayed mutations and timer leaks;
- speed scaling preserving relative behavior;
- DOM rendering of precise timeline values, metrics, navigation, verdicts, code disclosure, and the six-row Decision Guide;
- runtime, console-error, and unhandled-rejection checks across every remaining scenario.

Run:

```bash
npm test
npm run build
```

## Presentation flow

Baseline Request → Search Under Load → Rapid Selection Workflow → Live Dashboard → Component Cleanup → Sequential Workflow → Decision Guide.

The closing principle is: Observable is not inherently faster. It becomes powerful when time, changing context, repeated values, or lifecycle are part of the problem. Use Promise when a simple one-shot async flow is all that is needed.

## Final visual and presentation polish

- Navigation is now one compact six-item list followed by Decision Guide. Scenario verdict chips were removed from navigation so the active label remains the dominant cue; the full text verdict remains beside each scenario title.
- Run Both is the fixed-width primary action. Run Promise, Run Observable, and Reset now form one centralized secondary control row instead of being buried separately inside each comparison panel.
- Primary Result now uses larger tabular values, explicit Promise/Observable identity markers, an optional high-emphasis comparison statement, and a concise explanatory note.
- Baseline shows equal duration and loaded-result status without a wall of bookkeeping metrics.
- Search surfaces Latest User Intent, marks the newest queued or executing scheduler job, retains recent cancelled work, and promotes actual latest-useful latency, work avoided, and measured percentage. The explanatory capacity note remains visible without opening code.
- Rapid Selection labels the newest employee workflow, renders scheduler-derived active/queued/cancelled pool work, and measures Jessica's dashboard latency from the final selection. Its speed difference now comes from released constrained capacity rather than unequal stage timing.
- Live Dashboard presents Snapshot versus Live as delivery shapes and keeps updates local to the changing values.
- Component Cleanup includes parallel ownership strips with measured start, destroy, and stop points: Promise work continues to settlement and its stale result is ignored; Observable unsubscribe triggers teardown and stops the underlying work at destruction.
- Sequential Workflow retains equal deterministic timings and uses a prominent Promise-readability conclusion while describing both approaches as correct.
- Timeline rows use aligned tabular timestamps, distinct state icons, screen-reader status text, compact spacing, and the existing live auto-scroll behavior.
- Metrics are scenario-specific: two headline metrics receive emphasis while secondary counters remain compact. Unused retries and unrelated counters are no longer shown everywhere.
- Presentation Mode enlarges scenario/verdict/result hierarchy, centralizes a sticky non-overlapping control bar on desktop, reduces secondary spacing, keeps code collapsed by default, and advances from demo 6 to the Decision Guide.
- Narrow layouts stack Promise before Observable, turn control rows into touch-friendly grids, stack lifecycle tracks and decision content, and keep lanes/code internally contained.
- Focus indicators, disabled text states, `aria-current`, `aria-expanded`, live regions, textual status labels, and reduced-motion handling remain in place.

Validation after this polish pass: `npm test` passes 25 of 25 tests across three files. The production build passes with no TypeScript errors. UI regression tests now also cover the centralized control hierarchy, concise navigation, active state, Presentation Mode progression, latest-intent lane rendering, lifecycle ownership strip, comparison headline, code disclosure, and Decision Guide.

## Manual QA

Browser automation was attempted for this polish pass, but no browser backend was connected. Real screenshot QA was therefore not performed. Manually verify 1920×1080, 1440×900, 1366×768, 768px, 430px, and 390px layouts; watch Search mid-run and completed, Rapid Selection mid-run, Dashboard emissions, Cleanup after navigation, Sequential completion, timeline auto-scroll, Presentation Mode controls, and the Decision Guide.

## Presentation Deck Mode

The website now contains a typed **18-step** presentation: Title, async-shape question, Baseline intro/demo, Search intro/demo/takeaway, Rapid Selection intro/demo, Dashboard intro/demo, lifecycle intro/Cleanup demo, Promise comeback/Sequential demo, Decision Guide, Final Takeaways, and Questions.

Use **Start Presentation**, Previous/Next, Left/Right Arrow, Space, Escape, Home to restart, the optional Fullscreen control, and the compact section menu. `?presentation=true&slide=N` provides static-host-safe direct entry without adding a route that could cause a GitHub Pages refresh 404.

Demo steps reveal the existing scenario components and state; they do not duplicate simulations or introduce presentation-only timing. Changing slides or exiting uses the Lab cleanup paths, including database cancellation, AbortController cleanup, RxJS unsubscription, and timer removal. Demo completion never advances automatically. Normal Lab mode remains available through **Explore Lab**.

Promise and Observable code-disclosure panels remain available on every live-demo presentation step. They start collapsed and use the existing scenario code definitions rather than presentation-only copies.

Automated coverage now includes deck entry, 18-step navigation, controls and keyboard navigation, direct query entry, live-demo reuse, Run Both from the deck, equivalent Baseline timing, cleanup on exit, the Decision Guide, Final Takeaways, Questions, and normal Lab availability. The Questions step has no Next control, provides Previous/Restart/Exit behavior, exposes the deployed demo and source links, and starts no timers or subscriptions.

## Rapid Selection constrained backend

Rapid Selection owns two independent `SelectionBackendPool` instances, one per side. Each has capacity 2, and every Load User, Load Team, Load Projects, Load Permissions, and Build Dashboard operation uses the same deterministic 600 ms duration. Promise workflows remain legitimate sequential `async`/`await` chains and are not cancelled when context changes. Observable workflows use `switchMap`; inner teardown cancels the real pool task, removes it from active or queued work, releases the slot, and prevents the remaining stages from starting.

The visible capacity cards are direct snapshots of those schedulers. `LATEST DASHBOARD READY` is calculated as `latestDashboardAt - latestSelectionAt` for Jessica on each side, and the percentage advantage is calculated from the measured values. Tests cover equal pool configuration, common stage duration, simultaneous final intent, Promise contention, Observable teardown, no later completion for cancelled workflows, earlier Jessica execution, materially lower latest-dashboard latency, reset/destruction cleanup, monotonic event time, and code disclosure inside Presentation Mode.

## Component Cleanup timing presentation

The underlying lifecycle simulation remains unchanged: both operations begin from the shared epoch, destruction occurs at the scheduled lifecycle event, Observable teardown cancels its timer, and the non-cooperative Promise settles later. Presentation now separates `underlyingStoppedAt` from `workAfterOwnerDestroyed`. Timeline entries are independently recorded at the shared clock for mount, request/subscription, navigation, destruction, continuation or unsubscribe, teardown, underlying stop, settlement, and stale-result rejection. Lifecycle values use `X.XX s` consistently. Current full-suite count: **37 passing tests**.
