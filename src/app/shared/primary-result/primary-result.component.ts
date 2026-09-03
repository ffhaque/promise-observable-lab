import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-primary-result',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="primary-result" aria-label="Primary comparison result">
      <header><span>PRIMARY RESULT</span><strong>{{ label() }}</strong></header>
      <div class="values">
        <div class="promise"><span><i></i>PROMISE</span><strong>{{ promiseValue() }}</strong><small>{{ promiseDetail() }}</small></div>
        <div class="versus" aria-hidden="true">VS</div>
        <div class="observable"><span><i></i>OBSERVABLE</span><strong>{{ observableValue() }}</strong><small>{{ observableDetail() }}</small></div>
      </div>
      @if (comparison()) { <div class="comparison" role="status">{{ comparison() }}</div> }
      @if (note()) { <p>{{ note() }}</p> }
    </section>
  `,
  styles: [`
    .primary-result{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#090e17;margin:1rem 0;box-shadow:0 12px 28px rgba(0,0,0,.12)}
    header{display:flex;align-items:center;justify-content:center;gap:.65rem;padding:.62rem .8rem;border-bottom:1px solid var(--line);background:#0d1420}header span{color:var(--green);font:800 .54rem var(--mono);letter-spacing:.12em}header strong{color:var(--text);font:750 .72rem var(--sans)}
    .values{display:grid;grid-template-columns:1fr 42px 1fr;align-items:stretch}.values>div:not(.versus){padding:1.1rem 1.2rem;text-align:center}.values span{display:flex;align-items:center;justify-content:center;gap:.4rem;color:var(--text-soft);font:800 .59rem var(--mono);letter-spacing:.12em}.values span i{width:7px;height:7px;border-radius:50%;background:var(--promise)}.values .observable span i{background:var(--observable)}.values strong{display:block;margin:.38rem 0 .2rem;font:850 clamp(1.65rem,2.6vw,2.55rem)/1 var(--mono);font-variant-numeric:tabular-nums;color:var(--promise)}.values .observable strong{color:var(--observable)}.values small{display:block;min-height:1em;color:var(--text-soft);font:.68rem/1.35 var(--sans)}.versus{display:grid;place-items:center;color:#657187;font:800 .55rem var(--mono);border-left:1px solid var(--line);border-right:1px solid var(--line)}
    .comparison{padding:.72rem 1rem;border-top:1px solid rgba(42,209,139,.25);background:rgba(42,209,139,.08);text-align:center;color:var(--green);font:850 clamp(.85rem,1.4vw,1.08rem) var(--sans)}
    p{margin:0;padding:.72rem 1rem;border-top:1px solid var(--line);text-align:center;color:var(--text-soft);font:.72rem/1.5 var(--sans)}
    :host-context(.presentation) .values strong{font-size:clamp(2.15rem,3.3vw,3.15rem)}:host-context(.presentation) header strong{font-size:.88rem}:host-context(.presentation) p{font-size:.76rem}:host-context(.presentation) .comparison{font-size:1.1rem}
    @media(max-width:560px){.values{grid-template-columns:1fr}.versus{height:24px;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.values>div:not(.versus){padding:.8rem}.values strong{font-size:1.7rem}}
  `]
})
export class PrimaryResultComponent {
  readonly label = input.required<string>();
  readonly promiseValue = input.required<string>();
  readonly observableValue = input.required<string>();
  readonly promiseDetail = input('');
  readonly observableDetail = input('');
  readonly comparison = input('');
  readonly note = input('');
}
