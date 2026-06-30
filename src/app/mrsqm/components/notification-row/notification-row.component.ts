import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NotificationItem } from '../../types/notification';
import { presentNotification } from '../../util/notification-presenter';
import { formatNotificationTime } from '../../util/notification-time';

@Component({
  selector: 'mrsqm-notification-row',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './notification-row.component.html',
  styleUrl: './notification-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationRowComponent {
  readonly item = input.required<NotificationItem>();
  readonly filterName = input<string | null>(null);
  readonly activated = output<void>();

  readonly vm = computed(() => presentNotification(this.item()));
  readonly time = computed(() => formatNotificationTime(this.item().created_at));
}
