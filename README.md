# Promise vs Observable Lab

An Angular 22 technical presentation that makes asynchronous behavior visible through six focused, side-by-side demonstrations. It does not assume that Observable is inherently faster than Promise.

## Start and validate

```bash
npm install
npm start
npm test
npm run build
```

Open `http://localhost:4200`.

## Presentation Deck Mode

Click **Start Presentation** on the landing page to deliver the complete presentation inside the Angular application. The deck has **18 steps** and alternates between concept slides, the six real interactive demos, focused takeaways, the Decision Guide, final takeaways, and a clean Questions screen.

- **Next:** Right Arrow or Space
- **Previous:** Left Arrow
- **Exit:** Escape or the Exit button
- **Restart:** Home or the Restart Presentation button on the Questions slide
- **Fullscreen:** `F` or the Fullscreen button when supported by the browser
- **Jump to a section:** open the compact menu in the presentation header

A bookmarkable, GitHub Pages-safe entry is available at `?presentation=true`; `&slide=6` optionally opens a specific one-based step. Presentation mode uses query parameters rather than a new route, so refreshing `/promise-observable-lab/?presentation=true` does not require server-side fallback routing.

Live presentation steps reuse the actual Baseline, Search, Rapid Selection, Dashboard, Cleanup, and Sequential Workflow implementations. There is no presentation-only simulation or timing logic. Slides never advance automatically when a demo completes. Exiting or changing slides clears active requests, timers, subscriptions, and queued database work.

Each live-demo step retains the Promise and Observable **View Code** controls. Code starts collapsed to keep the projected comparison focused and can be expanded during the presentation.

The normal six-demo Lab remains available through **Explore Lab**.

Recommended sequence: Title → async shape → Baseline intro/demo → Search intro/demo/takeaway → Rapid Selection intro/demo → Dashboard intro/demo → lifecycle intro/Cleanup demo → Promise comeback/Sequential demo → Decision Guide → Final Takeaways → Questions.

## Learning path

| # | Demonstration | Verdict |
|---|---|---|
| 1 | Baseline Request | Both Are Good |
| 2 | Search Under Load | Observable Advantage |
| 3 | Rapid Selection Workflow | Observable Advantage |
| 4 | Live Dashboard | Different Problem Shape |
| 5 | Component Cleanup | Observable Advantage |
| 6 | Sequential Workflow | Promise Advantage |

The final Decision Guide asks whether the work has one result, changing context, continuing values, or a lifecycle owner.

## Timing model

**Run Both** resets active work and creates one shared `performance.now()` epoch. Every timeline entry stores raw elapsed milliseconds at the instant its state transition occurs; formatting happens only in the timeline UI:

- under one second: `342 ms`
- one to ten seconds: `2.13 s`
- over ten seconds: `12.4 s`

Timeline time is elapsed time from Run Both. **Latest Useful Result** is a different metric: it is measured from the final relevant user input until that input's accepted result arrives.

Baseline and Sequential Workflow intentionally produce approximately equal timings. Search gains come from `switchMap` teardown removing obsolete jobs from an equivalent constrained database lane, allowing the final query to execute earlier. The final query itself does not run faster.

## Search database

Search creates deterministic relational data and performs a chunked five-table join:

```text
Developers → Teams → Projects → Developer_Skills → Skills
```

The model contains 100,000 developers, 500 teams, 1,500 projects, 300,000 developer-skill relationships, and 12 skills. Promise and Observable use separate, equivalent single-capacity FIFO lanes. Lane UI is derived directly from scheduler state.

## GitHub Pages deployment

The repository includes an automated GitHub Pages workflow that tests and builds the app before deployment.

1. In the GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push or merge into `main`, or manually run **Deploy Angular to GitHub Pages** from Actions.

Pages must be enabled once before `actions/configure-pages` can retrieve the site. A missing Pages site produces a `Get Pages site failed` / `Not Found` error.

The deployed URL is normally:

```text
https://<username>.github.io/<repository>/
```

See [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) for implementation details, timing-audit findings, coverage, and presentation notes.
