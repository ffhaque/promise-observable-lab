import { Component, input } from '@angular/core';
import { DemoMetrics } from '../../core/demo.models';

@Component({
  selector: 'app-metrics-panel', standalone: true,
  template: `
    <div class="metrics">
      @for (item of items(); track item.label) {
        <div class="metric" [class.emphasis]="item.value > 0" [class.primary]="isPrimary(item.label)"><strong>{{ format(item.value) }}</strong><span>{{ item.label }}</span></div>
      }
    </div>
  `,
  styles: [`
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:.9rem 0}
    .metric{background:var(--surface-2);padding:.58rem .45rem;min-width:0}.metric strong{display:block;font:700 .9rem var(--mono);color:var(--text)}.metric span{display:block;color:var(--muted);font:600 .52rem/1.2 var(--sans);text-transform:uppercase;letter-spacing:.05em;margin-top:.2rem}.metric.emphasis strong{color:var(--accent)}.metric.primary{background:color-mix(in srgb,var(--accent) 7%,var(--surface-2))}.metric.primary strong{font-size:1.18rem}.metric.primary span{color:var(--text-soft)}
    :host-context(.presentation) .metrics{margin:.65rem 0}:host-context(.presentation) .metric{padding:.5rem .4rem}:host-context(.presentation) .metric.primary strong{font-size:1.35rem}
    @media(max-width:560px){.metrics{grid-template-columns:repeat(2,1fr)}}
  `]
})
export class MetricsPanelComponent {
  readonly metrics = input.required<DemoMetrics>();
  readonly search = input(false);
  isPrimary(label: string): boolean { return this.search() ? ['Active', 'Rows avoided', 'Latest latency ms'].includes(label) : ['Active', 'Cancelled', 'Emitted'].includes(label); }
  items(): { label: string; value: number }[] {
    const m = this.metrics();
    const base = [
      { label: 'Started', value: m.started }, { label: 'Completed', value: m.completed },
      { label: 'Active', value: m.active }, { label: 'Cancelled', value: m.cancelled },
      { label: 'Emitted', value: m.emitted }, { label: 'Errors', value: m.errors },
      { label: 'Retries', value: m.retries }
    ];
    if (this.search()) base.push(
      { label: 'Stale ignored', value: m.stale },
      { label: 'Rows scanned', value: m.rowsScanned },
      { label: 'Rows avoided', value: m.rowsAvoided },
      { label: 'Latest latency ms', value: m.latestLatency }
    );
    return base;
  }
  format(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return String(value);
  }
}
