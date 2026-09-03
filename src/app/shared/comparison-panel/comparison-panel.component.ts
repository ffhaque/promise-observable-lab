import { Component, input, output } from '@angular/core';
import { ActiveRequestsComponent } from '../active-requests/active-requests.component';
import { CodeViewerComponent } from '../code-viewer/code-viewer.component';
import { EventTimelineComponent } from '../event-timeline/event-timeline.component';
import { MetricsPanelComponent } from '../metrics-panel/metrics-panel.component';
import { DemoState, Side } from '../../core/demo.models';

@Component({
  selector: 'app-comparison-panel',
  standalone: true,
  imports: [ActiveRequestsComponent, CodeViewerComponent, EventTimelineComponent, MetricsPanelComponent],
  template: `
    <article class="panel" [class.observable]="side() === 'observable'">
      <header>
        <div><span class="eyebrow">{{ side() === 'promise' ? 'ECMASCRIPT' : 'RXJS' }}</span><h2>{{ side().toUpperCase() }}</h2></div>
        <span class="kind">{{ badge() }}</span>
      </header>
      <p class="description">{{ description() }}</p>

      @if (showActions()) {
        <div class="panel-actions">
          <button type="button" class="run-side" [disabled]="state().loading" (click)="run.emit()">{{ actionLabel() }}</button>
          @if (showCancel()) { <button type="button" class="cancel" [disabled]="!state().loading" (click)="cancel.emit()">{{ cancelLabel() }}</button> }
        </div>
      }

      <section class="result-box" [class.loading]="state().loading" [class.has-result]="state().result" role="status" aria-live="polite">
        <div class="status-row">
          <span class="status-dot"></span>
          <span>{{ state().loading ? loadingText() : state().result ? 'RESULT' : 'IDLE — READY TO RUN' }}</span>
        </div>
        @if (state().progress > 0 || state().loading && showProgress()) {
          <div class="progress-track"><span [style.width.%]="state().progress"></span></div>
          <b class="progress-label">{{ state().progress }}%</b>
        }
        @if (state().result) { <div class="result">{{ state().result }}</div> }
        @if (!state().result && !state().loading) { <div class="placeholder">Waiting for an asynchronous result…</div> }
      </section>

      <app-metrics-panel [metrics]="state().metrics" [mode]="metricMode()" />
      <app-active-requests [requests]="state().requests" />
      <app-event-timeline [events]="state().events" />
      <app-code-viewer [open]="state().codeOpen" [code]="code()" (toggle)="toggleCode.emit()" />
    </article>
  `,
  styleUrl: './comparison-panel.component.scss'
})
export class ComparisonPanelComponent {
  readonly side = input.required<Side>();
  readonly state = input.required<DemoState>();
  // A primitive companion input lets Angular observe mutations inside the
  // intentionally stateful simulation model (timers update the same object).
  readonly refreshToken = input.required<string>();
  readonly description = input.required<string>();
  readonly code = input.required<string>();
  readonly badge = input('ONE SHOT');
  readonly actionLabel = input('RUN');
  readonly loadingText = input('WORK IN PROGRESS');
  readonly metricMode = input('basic');
  readonly showActions = input(true);
  readonly showCancel = input(false);
  readonly showProgress = input(false);
  readonly cancelLabel = input('CANCEL');
  readonly run = output<void>();
  readonly cancel = output<void>();
  readonly toggleCode = output<void>();
}
