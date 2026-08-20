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
            <time>{{ format(event.timestamp) }}</time>
            <span class="icon">{{ icon(event.type) }}</span>
            <span>{{ event.message }}</span>
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
  format(ms: number): string { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`; }
  icon(type: DemoEvent['type']): string {
    return ({ start: '▶', complete: '✓', cancel: '■', error: '✕', emit: '●', retry: '↻', info: '·' })[type];
  }
}
