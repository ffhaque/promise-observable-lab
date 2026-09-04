import { Component, input } from '@angular/core';
import { DemoMetrics } from '../../core/demo.models';

@Component({
  selector: 'app-metrics-panel', standalone: true,
  template: `
    <div class="metrics">
      @for (item of items(); track item.label) {
        <div class="metric" [class.emphasis]="item.value > 0" [class.primary]="item.primary"><strong>{{ format(item.value, item.unit) }}</strong><span>{{ item.label }}</span></div>
      }
    </div>
  `,
  styles: [`
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:.9rem 0}
    .metric{background:var(--surface-2);padding:.58rem .55rem;min-width:0}.metric strong{display:block;font:700 .88rem var(--mono);font-variant-numeric:tabular-nums;color:var(--text)}.metric span{display:block;color:var(--muted);font:650 .5rem/1.25 var(--sans);text-transform:uppercase;letter-spacing:.05em;margin-top:.2rem}.metric.emphasis strong{color:var(--accent)}.metric.primary{background:color-mix(in srgb,var(--accent) 8%,var(--surface-2));grid-column:span 2}.metric.primary strong{font-size:1.24rem}.metric.primary span{color:var(--text-soft)}
    :host-context(.presentation) .metrics{margin:.65rem 0}:host-context(.presentation) .metric{padding:.5rem .4rem}:host-context(.presentation) .metric.primary strong{font-size:1.35rem}
    @media(max-width:560px){.metrics{grid-template-columns:repeat(2,1fr)}}
  `]
})
export class MetricsPanelComponent {
  readonly metrics = input.required<DemoMetrics>();
  readonly mode = input('basic');
  items(): { label: string; value: number; unit?: 'duration'; primary?: boolean }[] {
    const m = this.metrics();
    switch (this.mode()) {
      case 'search': return [
        { label: 'Latest useful latency', value: m.latestLatency, unit: 'duration', primary: true },
        { label: 'Work avoided', value: m.rowsAvoided, primary: true },
        { label: 'Rows scanned', value: m.rowsScanned }, { label: 'Started', value: m.started },
        { label: 'Completed', value: m.completed }, { label: 'Cancelled', value: m.cancelled }, { label: 'Stale ignored', value: m.stale }
      ];
      case 'selection': return [
        { label: 'Latest dashboard', value: m.latestLatency, unit: 'duration', primary: true },
        { label: 'Backend work units', value: m.rowsScanned, primary: true },
        { label: 'Work avoided', value: m.rowsAvoided }, { label: 'Workflows cancelled', value: m.cancelled },
        { label: 'Stale ignored', value: m.stale }
      ];
      case 'dashboard': return [
        { label: 'Live status', value: m.active, primary: true }, { label: 'View updates', value: m.completed, primary: true }, { label: 'Source emissions', value: m.emitted }
      ];
      case 'lifecycle': return [
        { label: 'Active work', value: m.active }, { label: 'Completed', value: m.completed },
        { label: 'Stopped / cancelled', value: m.cancelled, primary: true }, { label: 'Ignored after destroy', value: m.stale, primary: true }
      ];
      case 'sequential': return [
        { label: 'Stages completed', value: m.emitted, primary: true }, { label: 'Workflow completed', value: m.completed }, { label: 'Errors', value: m.errors }
      ];
      default: return [
        { label: 'Loading', value: m.active, primary: true }, { label: 'Completed', value: m.completed, primary: true }, { label: 'Result emitted', value: m.emitted }
      ];
    }
  }
  format(value: number, unit?: 'duration'): string {
    if (unit === 'duration') return value ? `${(value / 1000).toFixed(2)} s` : '—';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return String(value);
  }
}
