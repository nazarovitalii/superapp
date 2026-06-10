import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

@Component({
  selector: 'mrsqm-stub-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="stub-wrap">
      <mat-icon class="stub-icon">{{ icon() }}</mat-icon>
      <p class="stub-title">{{ title() }}</p>
      <p class="stub-sub">Раздел в разработке</p>
    </div>
  `,
  styles: [
    `
      .stub-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 12px;
        color: var(--ink-muted);
      }
      .stub-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
        opacity: 0.4;
      }
      .stub-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
      }
      .stub-sub {
        font-size: 0.875rem;
        margin: 0;
        opacity: 0.7;
      }
    `,
  ],
})
export class StubPageComponent {
  private readonly _route = inject(ActivatedRoute);
  readonly title = toSignal(
    this._route.data.pipe(map((d) => (d['title'] as string) || '')),
    {
      initialValue: '',
    },
  );
  readonly icon = toSignal(
    this._route.data.pipe(map((d) => (d['icon'] as string) || 'construction')),
    { initialValue: 'construction' },
  );
}
