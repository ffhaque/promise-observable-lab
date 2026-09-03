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

}
