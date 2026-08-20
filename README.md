# Promise vs Observable Lab

An interactive Angular 22 lab that makes asynchronous behavior visible. Thirteen side-by-side demos compare lifecycle, cancellation, progressive delivery, streams, composition, and simple one-shot work without claiming that one abstraction is universally faster.

## Start and validate

```bash
npm install
npm start
npm test
npm run build
```

Open `http://localhost:4200`.

## Learning path

### Core Comparisons

1. Baseline Request — both are good
2. Search Under Load — Observable capacity advantage
3. Rapid Selection Workflow — Observable workflow advantage
4. High-Frequency Events — Observable event-shaping advantage
5. Live Dashboard — snapshot versus continuing view

### More Reactive Patterns

6. Dependent Request Chain — replace a complete chain with outer `switchMap`
7. Progressive Loading — independent sections arrive before an aggregate completes
8. Timeout & Cache Fallback — two correct strategies, one composable RxJS pipeline
9. Live Stream Control — repeated values plus pause, resume, stop, and teardown
10. Component Cleanup — lifecycle-owned unsubscription

### When Promise Shines

11. Simple Save — direct one-shot `async`/`await`
12. Sequential Workflow — readable top-to-bottom control flow
13. Parallel One-Time Requests — `Promise.all` and `forkJoin` are both good

Use **Run Both** to start each comparison on a shared clock. Use **Fast / Normal / Slow** for presentation pacing. Every scenario includes visible state, metrics, lifecycle history, code, an honest verdict, and a teaching message.

## The database search

Search uses a deterministic in-memory relational dataset with 100,000 developers and a chunked five-table join. Equivalent FIFO query lanes expose the effect of obsolete work under constrained capacity. `switchMap` is faster for the newest useful result because teardown frees capacity—not because Observable executes SQL faster.

## Core principle

Promise is excellent for one result. Observable becomes powerful when time and change are part of the problem.

See [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) for scenario mechanics, architecture, accuracy notes, test coverage, and the recommended presentation flow.

## GitHub Pages Deployment

The repository includes an automated GitHub Pages workflow. It runs the complete test suite before building and deploying the Angular browser application.

1. Push this project to a GitHub repository whose default deployment branch is `main`.
2. Open the repository on GitHub and select **Settings**.
3. Open **Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. Push or merge a commit into `main`.
6. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to finish successfully.
7. Open the deployment URL shown by the workflow or on the repository's Pages settings screen.

The URL format is:

```text
https://<username>.github.io/<repository>/
```

The workflow derives `<repository>` from GitHub metadata and passes `/<repository>/` to Angular as the deployment-only base href. Local development remains available at `http://localhost:4200/` with the normal `/` base href.

Every future push to `main` automatically installs from `package-lock.json`, runs the tests, creates a production build, and redeploys the site. You can also run it manually from **Actions → Deploy to GitHub Pages → Run workflow**.

The application does not use Angular Router routes, so GitHub Pages does not require hash routing or a `404.html` SPA fallback.
