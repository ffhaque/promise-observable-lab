import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-code-viewer', standalone: true,
  template: `
    <button class="code-toggle" type="button" [attr.aria-expanded]="open()" [attr.aria-controls]="contentId" (click)="toggle.emit()">{{ open() ? 'HIDE CODE' : 'VIEW CODE' }} <span aria-hidden="true">{{ open() ? '−' : '+' }}</span></button>
    @if (open()) { <pre [id]="contentId" tabindex="0"><code>{{ code() }}</code></pre> }
  `,
  styles: [`
    .code-toggle{width:100%;display:flex;justify-content:space-between;background:transparent;color:var(--muted);border:0;border-top:1px solid var(--line);padding:.8rem 0 0;margin-top:.8rem;font:700 .62rem var(--mono);letter-spacing:.09em;cursor:pointer}.code-toggle:hover{color:var(--text)}.code-toggle:focus-visible{outline:2px solid var(--green);outline-offset:4px}pre{background:#070a10;border:1px solid var(--line);border-radius:8px;padding:.9rem;overflow:auto;max-height:260px;color:#b8c2d6;font: .7rem/1.55 var(--mono);white-space:pre;margin:.8rem 0 0}pre:focus-visible{outline:2px solid var(--green)}code{font:inherit}:host-context(.presentation) .code-toggle{opacity:.72;font-size:.56rem}:host-context(.presentation) pre{max-height:190px}
  `]
})
export class CodeViewerComponent {
  private static nextId = 0;
  readonly contentId = `code-example-${++CodeViewerComponent.nextId}`;
  readonly open = input.required<boolean>(); readonly code = input.required<string>(); readonly toggle = output<void>();
}
