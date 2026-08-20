import { Injectable } from '@angular/core';
import { DemoEvent, DemoEventType, DemoState } from './demo.models';
import { PresentationSpeed } from './demo.models';

@Injectable({ providedIn: 'root' })
export class ComparisonRunnerService {
  private epoch = performance.now();
  speed: PresentationSpeed = 'normal';

  restartClock(): void { this.epoch = performance.now(); }
  now(): number { return Math.max(0, Math.round(performance.now() - this.epoch)); }
  setSpeed(speed: PresentationSpeed): void { this.speed = speed; }
  scale(ms: number): number { return Math.round(ms * ({ fast: 0.45, normal: 1, slow: 1.5 })[this.speed]); }

  log(state: DemoState, type: DemoEventType, message: string, requestId?: number): void {
    const event: DemoEvent = { timestamp: this.now(), type, message, ...(requestId === undefined ? {} : { requestId }) };
    state.events = [...state.events, event];
  }
}
