import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { UserResult } from './demo.models';
import { ComparisonRunnerService } from './comparison-runner.service';

@Injectable({ providedIn: 'root' })
export class AsyncDemoService {
  constructor(private readonly runner: ComparisonRunnerService) {}
  readonly user: UserResult = { name: 'Ada Lovelace', role: 'Platform Engineer', avatar: 'AL' };

  delay<T>(value: T, ms: number, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const timer = window.setTimeout(() => { cleanup(); resolve(value); }, this.runner.scale(ms));
      const abort = (): void => { window.clearTimeout(timer); cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
      const cleanup = (): void => signal?.removeEventListener('abort', abort);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  observableDelay<T>(value: T, ms: number): Observable<T> {
    return new Observable<T>((subscriber) => {
      const timer = window.setTimeout(() => { subscriber.next(value); subscriber.complete(); }, this.runner.scale(ms));
      return () => window.clearTimeout(timer);
    });
  }

  latency(term: string): number {
    return this.queryPlan(term).latency;
  }

  searchResult(term: string): string {
    const plan = this.queryPlan(term);
    return `${plan.matches.toLocaleString()} records · ${plan.megabytes} MB dataset for “${term}”`;
  }

  queryPlan(term: string): { latency: number; rows: number; matches: number; megabytes: number } {
    const plans: Record<string, { latency: number; rows: number; matches: number; megabytes: number }> = {
      a: { latency: 4600, rows: 3_200_000, matches: 840_000, megabytes: 1260 },
      an: { latency: 4200, rows: 2_600_000, matches: 420_000, megabytes: 820 },
      ang: { latency: 3800, rows: 2_100_000, matches: 184_000, megabytes: 460 },
      angu: { latency: 3300, rows: 1_500_000, matches: 62_000, megabytes: 180 },
      angul: { latency: 2700, rows: 920_000, matches: 18_400, megabytes: 72 },
      angular: { latency: 1800, rows: 480_000, matches: 6_240, megabytes: 28 }
    };
    return plans[term.toLowerCase()] ?? {
      latency: 1800 + ((term.length * 317) % 1800), rows: Math.max(250_000, 3_500_000 - term.length * 380_000),
      matches: Math.max(400, 180_000 - term.length * 19_000), megabytes: Math.max(8, 310 - term.length * 38)
    };
  }
}
