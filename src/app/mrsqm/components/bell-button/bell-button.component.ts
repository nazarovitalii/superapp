import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { BellDropdownComponent } from '../bell-dropdown/bell-dropdown.component';

@Component({
  selector: 'mrsqm-bell-button',
  standalone: true,
  imports: [MatIconButton, MatIcon, MatTooltip, BellDropdownComponent],
  templateUrl: './bell-button.component.html',
  styleUrl: './bell-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BellButtonComponent {
  private readonly _store = inject(NotifierStoreService);
  private readonly _auth = inject(MrsqmAuthService);

  readonly isAuthenticated = this._auth.isAuthenticated;
  readonly bellUnseen = this._store.bellUnseen;
  readonly isOpen = signal(false);

  readonly hasUnseen = computed(() => this.bellUnseen() > 0);
  readonly badgeText = computed<string | null>(() => {
    const n = this.bellUnseen();
    if (n <= 0) return null;
    return n > 99 ? '99+' : String(n);
  });

  constructor() {
    // Запрос «открыть дропдаун» из toast/клика по уведомлению (store.requestOpen()).
    // Снапшот текущего значения на момент монтирования — чтобы ненулевой tick
    // (toast fired до рендера компонента) не открывал дропдаун сразу.
    let prev = this._store.openRequested();
    effect(() => {
      const tick = this._store.openRequested();
      if (tick > prev) {
        prev = tick;
        this.isOpen.set(true);
      }
    });
  }

  openDropdown(): void {
    this.isOpen.set(true);
  }

  // Закрытие дропдауна гасит сигнал уведомлений (Рамка №0): mark_bell_seen + refresh.
  onClosed(): void {
    this.isOpen.set(false);
    void this._store.closeBell();
  }
}
