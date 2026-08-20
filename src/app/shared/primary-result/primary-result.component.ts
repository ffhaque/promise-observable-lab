import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-primary-result',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="primary-result" aria-label="Primary comparison result">
      <header><span>PRIMARY RESULT</span><strong>{{ label() }}</strong></header>
      <div class="values">
        <div class="promise"><span>PROMISE</span><strong>{{ promiseValue() }}</strong><small>{{ promiseDetail() }}</small></div>
        <div class="versus" aria-hidden="true">VS</div>
        <div class="observable"><span>OBSERVABLE</span><strong>{{ observableValue() }}</strong><small>{{ observableDetail() }}</small></div>
      </div>
      @if (note()) { <p>{{ note() }}</p> }
    </section>
  `,
  styles: [`
    .primary-result{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#090e17;margin:1rem 0;box-shadow:0 12px 32px rgba(0,0,0,.14)}
    header{display:flex;align-items:center;justify-content:center;gap:.65rem;padding:.58rem .8rem;border-bottom:1px solid var(--line);background:#0d1420}header span{color:var(--green);font:800 .52rem var(--mono);letter-spacing:.12em}header strong{color:var(--text-soft);font:750 .65rem var(--sans)}
    .values{display:grid;grid-template-columns:1fr 42px 1fr;align-items:stretch}.values>div:not(.versus){padding:1rem 1.2rem;text-align:center}.values span{display:block;color:var(--muted);font:800 .56rem var(--mono);letter-spacing:.12em}.values strong{display:block;margin:.3rem 0 .15rem;font:850 clamp(1.45rem,2.4vw,2.35rem)/1 var(--mono);color:var(--promise)}.values .observable strong{color:var(--observable)}.values small{display:block;min-height:1em;color:var(--text-soft);font:.62rem/1.3 var(--sans)}.versus{display:grid;place-items:center;color:#4e5b70;font:800 .55rem var(--mono);border-left:1px solid var(--line);border-right:1px solid var(--line)}
    p{margin:0;padding:.7rem 1rem;border-top:1px solid var(--line);background:rgba(42,209,139,.045);text-align:center;color:var(--text-soft);font:.7rem/1.45 var(--sans)}
    :host-context(.presentation) .values strong{font-size:clamp(2rem,3.1vw,3rem)}:host-context(.presentation) header strong{font-size:.8rem}:host-context(.presentation) p{font-size:.8rem}
    @media(max-width:560px){.values{grid-template-columns:1fr}.versus{height:24px;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.values>div:not(.versus){padding:.8rem}.values strong{font-size:1.7rem}}
  `]
})
export class PrimaryResultComponent {
  readonly label = input.required<string>();
  readonly promiseValue = input.required<string>();
  readonly observableValue = input.required<string>();
  readonly promiseDetail = input('');
  readonly observableDetail = input('');
  readonly note = input('');
}
