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
import { NotificationsService } from '../../services/notifications.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { BellDropdownComponent } from '../bell-dropdown/bell-dropdown.component';
import { PanelContentService } from '../../../features/panels/panel-content.service';

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
  private readonly _notifications = inject(NotificationsService);
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _panels = inject(PanelContentService);

  readonly isAuthenticated = this._auth.isAuthenticated;
  readonly unreadCount = this._notifications.unreadCount;
  readonly isOpen = signal(false);
  // Sidebar уведомлений открыт → колокол «активен» (повёрнут как ×).
  readonly isNotificationsOpen = computed(() => this._panels.isNotificationsOpen());

  readonly hasUnseen = computed(() => this.unreadCount() > 0);
  readonly badgeText = computed<string | null>(() => {
    const n = this.unreadCount();
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
    // Если сайдбар уведомлений открыт — клик закрывает его, попап не открываем.
    if (this._panels.isNotificationsOpen()) {
      this._panels.closeNotifications();
      return;
    }
    this.isOpen.set(true);
  }

  // Закрытие дропдауна помечает все уведомления прочитанными.
  onClosed(): void {
    this.isOpen.set(false);
    void this._notifications.markAllRead();
  }
}
