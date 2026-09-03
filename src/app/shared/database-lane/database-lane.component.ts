import { Component, input } from '@angular/core';
import { DatabaseLaneSnapshot } from '../../core/in-memory-database.service';
import { Side } from '../../core/demo.models';

@Component({
  selector: 'app-database-lane', standalone: true,
  template: `
    <section class="lane" [class.observable]="side() === 'observable'">
      <header><span>{{ side().toUpperCase() }} DATABASE LANE</span><b>SINGLE CAPACITY</b></header>
      <div class="lane-body">
        <div class="active">
          <label>ACTIVE</label>
          @if (snapshot().active; as active) {
            <div class="query" [class.latest]="active.latest"><span><b>▶ {{ active.latest ? 'LATEST INTENT · EXECUTING' : 'EXECUTING' }}</b> “{{ active.term }}”</span><strong>{{ active.progress }}%</strong><i [style.width.%]="active.progress"></i></div>
          } @else { <div class="idle">Lane available</div> }
        </div>
        <div class="queue">
          <label>{{ side() === 'observable' ? 'CANCELLED / FREED' : 'QUEUE — WAITING FOR CAPACITY' }}</label>
          <div class="chips">
            @if (side() === 'observable') {
              @for (term of snapshot().cancelled; track $index) { <span class="cancelled"><b>✕ CANCELLED</b> {{ term }}</span> }
            }
            @for (query of snapshot().queued; track query.id) { <span class="queued" [class.latest]="$last"><b>{{ $last ? '★ LATEST INTENT · QUEUED' : '▣ QUEUED' }}</b> {{ query.term }}</span> }
            @if (!snapshot().queued.length && (side() !== 'observable' || !snapshot().cancelled.length)) { <em>None</em> }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .lane{--lane:var(--promise);border:1px solid color-mix(in srgb,var(--lane) 30%,var(--line));border-radius:10px;background:#090e17;padding:.88rem;margin-bottom:.75rem}.lane.observable{--lane:var(--observable)}header{display:flex;justify-content:space-between;color:var(--lane);font:800 .68rem var(--mono);letter-spacing:.09em;margin-bottom:.7rem}header b{color:var(--muted);font-size:.54rem}.lane-body{display:grid;grid-template-columns:1.1fr .9fr;gap:.75rem}label{display:block;color:var(--muted);font:700 .54rem var(--mono);letter-spacing:.1em;margin-bottom:.4rem}.query{min-height:46px;position:relative;overflow:hidden;border:1px solid color-mix(in srgb,var(--lane) 38%,var(--line));border-radius:7px;display:flex;justify-content:space-between;align-items:center;padding:.45rem .62rem;font:.72rem var(--mono)}.query.latest{box-shadow:inset 3px 0 var(--green)}.query span,.query strong{position:relative;z-index:1}.query span b{display:block;color:var(--lane);font-size:.48rem;margin-bottom:.12rem}.query i{position:absolute;inset:0 auto 0 0;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--lane) 18%,transparent),color-mix(in srgb,var(--lane) 18%,transparent) 8px,color-mix(in srgb,var(--lane) 9%,transparent) 8px,color-mix(in srgb,var(--lane) 9%,transparent) 16px);transition:width .12s}.idle{height:46px;border:1px dashed var(--line);border-radius:7px;display:grid;place-items:center;color:var(--muted);font:.62rem var(--mono)}.chips{display:flex;gap:.4rem;flex-wrap:wrap;min-height:46px;align-items:center}.chips span{background:#151d2a;border:1px solid var(--line);border-radius:6px;padding:.36rem .46rem;color:var(--text-soft);font:.59rem var(--mono);animation:arrive .18s}.chips span b{display:block;color:var(--muted);font-size:.44rem;margin-bottom:.1rem}.chips .cancelled{opacity:.72;text-decoration:line-through;color:var(--amber)}.chips .cancelled b{color:var(--red)}.chips .latest{border-color:color-mix(in srgb,var(--lane) 52%,var(--line));color:var(--text);box-shadow:inset 2px 0 var(--green)}.chips .latest b{color:var(--green)}.chips em{color:var(--muted);font:.6rem var(--mono)}@keyframes arrive{from{opacity:0;transform:translateX(5px)}}@media(max-width:600px){.lane-body{grid-template-columns:1fr}.query{min-height:44px}}@media(prefers-reduced-motion:reduce){.chips span{animation:none}.query i{transition:none}}
  `]
})
export class DatabaseLaneComponent { readonly side = input.required<Side>(); readonly snapshot = input.required<DatabaseLaneSnapshot>(); }
