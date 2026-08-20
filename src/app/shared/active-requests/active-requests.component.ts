import { Component, input } from '@angular/core';
import { ActiveRequest } from '../../core/demo.models';

@Component({
  selector: 'app-active-requests', standalone: true,
  template: `
    @if (requests().length) {
      <div class="request-box">
        <div class="label">REQUEST ACTIVITY</div>
        @for (request of requests(); track request.id) {
          <div class="request" [class]="'request ' + request.status">
            <span class="pulse"></span><code>#{{ request.id }}</code><span>{{ request.label }}</span><b>{{ request.status }}</b>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .request-box{background:#090d15;border:1px solid var(--line);border-radius:8px;padding:.65rem;margin:.75rem 0;max-height:125px;overflow:auto}.label{font:700 .59rem var(--mono);color:var(--muted);letter-spacing:.1em;margin-bottom:.45rem}.request{display:grid;grid-template-columns:8px 28px 1fr auto;gap:.45rem;align-items:center;padding:.3rem;font-size:.72rem;color:var(--text-soft)}.request b{font:600 .58rem var(--mono);text-transform:uppercase;color:var(--muted)}.pulse{width:6px;height:6px;background:var(--green);border-radius:50%}.running .pulse{animation:pulse 1s infinite}.completed .pulse{background:var(--green)}.cancelled,.stale{opacity:.48;text-decoration:line-through}.cancelled .pulse,.stale .pulse{background:var(--amber)}.error .pulse{background:var(--red)}code{color:var(--muted)}@keyframes pulse{50%{box-shadow:0 0 0 4px rgba(42,209,139,.12)}}
  `]
})
export class ActiveRequestsComponent { readonly requests = input.required<ActiveRequest[]>(); }
