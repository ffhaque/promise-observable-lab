import { Component, input } from '@angular/core';
import { DemoVerdict } from '../../core/demo.models';

@Component({
  selector: 'app-verdict-badge',
  standalone: true,
  template: `<span class="badge" [class]="'badge ' + verdict()" [class.compact]="compact()"><b>{{ icon() }}</b><span>{{ label() }}</span></span>`,
  styles: [`
    .badge{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--line);border-radius:99px;padding:.34rem .58rem;color:var(--text-soft);font:800 .56rem var(--mono);letter-spacing:.05em;white-space:nowrap}
    .badge b{font-size:.72rem}
    .badge.compact{padding:.22rem .42rem;font-size:.49rem;letter-spacing:.025em}
    .badge.compact b{font-size:.58rem}
    .observable{color:var(--observable);border-color:rgba(240,184,91,.38);background:rgba(240,184,91,.08)}
    .promise{color:var(--promise);border-color:rgba(73,205,245,.38);background:rgba(73,205,245,.08)}
    .tie{color:var(--green);border-color:rgba(42,209,139,.38);background:rgba(42,209,139,.08)}
    .different-shape{color:#b9a3ff;border-color:rgba(167,139,250,.38);background:rgba(167,139,250,.08)}
    :host-context(.presentation) .badge:not(.compact){font-size:.72rem;padding:.46rem .72rem}
    :host-context(.presentation) .badge:not(.compact) b{font-size:.9rem}
  `]
})
export class VerdictBadgeComponent {
  readonly verdict = input.required<DemoVerdict>();
  readonly compact = input(false);
  label(): string { return ({ observable: 'OBSERVABLE ADVANTAGE', promise: 'PROMISE ADVANTAGE', tie: 'BOTH ARE GOOD', 'different-shape': 'DIFFERENT PROBLEM SHAPE' })[this.verdict()]; }
  icon(): string { return ({ observable: '◉', promise: '◆', tie: '⚖', 'different-shape': '◇' })[this.verdict()]; }
}
