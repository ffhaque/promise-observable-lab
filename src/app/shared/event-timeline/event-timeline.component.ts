import { Component, ElementRef, effect, input, viewChild } from '@angular/core';
import { DemoEvent } from '../../core/demo.models';

@Component({
  selector: 'app-event-timeline',
  standalone: true,
  template: `
    <section class="timeline" aria-label="Event timeline">
      <div class="section-label"><span>EVENT TIMELINE</span><span class="live-dot"></span></div>
      <div #eventList class="event-list" role="log" aria-live="polite" aria-relevant="additions">
        @for (event of events(); track $index) {
          <div class="event" [class]="'event ' + event.type" [class.latest]="$last">
            <time>{{ format(event.timestampMs) }}</time>
            <span class="icon" aria-hidden="true">{{ icon(event.type) }}</span>
            <span><span class="sr-only">{{ label(event.type) }}: </span>{{ event.message }}</span>
          </div>
        } @empty {
          <div class="empty">Run this side to watch its lifecycle.</div>
        }
      </div>
    </section>
  `,
  styleUrl: './event-timeline.component.scss'
})
export class EventTimelineComponent {
  readonly events = input.required<DemoEvent[]>();
  private readonly eventList = viewChild<ElementRef<HTMLElement>>('eventList');

  constructor() {
    effect(() => {
      this.events().length;
      queueMicrotask(() => { const list = this.eventList()?.nativeElement; if (list) list.scrollTop = list.scrollHeight; });
    });
  }
  format(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  }
  icon(type: DemoEvent['type']): string {
    return ({ start: '▶', queue: '▣', execute: '▶', complete: '✓', cancel: '✕', emit: '●', ignore: '↳', destroy: '⌁', teardown: '■', error: '!', info: '·' })[type];
  }
  label(type: DemoEvent['type']): string { return ({ start: 'Started', queue: 'Queued', execute: 'Executing', complete: 'Completed', cancel: 'Cancelled', emit: 'Emitted', ignore: 'Ignored', destroy: 'Destroyed', teardown: 'Teardown', error: 'Error', info: 'Information' })[type]; }
}
