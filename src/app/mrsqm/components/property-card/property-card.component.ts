import {
  Component,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { PropertyFeedItem } from '../../types/database';
import { DoneToggleComponent } from '../../../ui/done-toggle/done-toggle.component';
import { formatFeedDate } from '../../util/feed-date.util';
import { resolveFeedAddress } from '../../util/feed-address.util';

@Component({
  selector: 'mrsqm-property-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, DoneToggleComponent],
  templateUrl: './property-card.component.html',
  styleUrl: './property-card.component.scss',
})
export class PropertyCardComponent {
  readonly property = input.required<PropertyFeedItem>();
  readonly isActive = input(false);
  // Стадия 1: новый/непросмотренный объект — жёлтая полоска по левому ребру (hot-path: только класс).
  readonly isUnseen = input(false);
  readonly isSaved = input(false);
  // Свой объект (CD-1): закладку «в избранное» не показываем — свой объект не лайкают.
  readonly isOwnItem = input(false);
  // Чекбокс множественного выбора (как done-toggle в инбоксе).
  readonly isSelected = input(false);
  // V-10: показывать публичный адрес (true = не-My охват; false = My Inventory → полный).
  readonly showPublicAddress = input(false);
  readonly cardClick = output<void>();
  // Клик по закладке — отдельно от клика по карточке (stopPropagation в шаблоне).
  readonly saveClick = output<void>();
  readonly selectToggle = output<void>();
  // Hover-кнопка «развернуть/свернуть» правый sidebar (item 2).
  readonly toggleClick = output<void>();

  // U-4: читаемый формат даты — мемоизировано через computed (hot-path).
  readonly dateLabel = computed(() =>
    formatFeedDate(
      this.property().last_actualized_at ?? this.property().published_at ?? null,
    ),
  );

  // V-10: резолв адреса по охвату — чистая функция, только computed (hot-path).
  readonly addr = computed(() =>
    resolveFeedAddress(this.property(), this.showPublicAddress()),
  );

  // Тип объекта в колонку: двухсловный тип («Hotel Apartment») всегда
  // разбиваем на две строки — второе слово на новой. Иначе — одной строкой.
  // Мемоизировано через computed (hot-path: без вычислений в шаблоне).
  readonly typeLines = computed<{ first: string; second: string | null }>(() => {
    const raw = (this.property().property_type ?? '').trim();
    if (!raw) return { first: '—', second: null };
    const parts = raw.split(/\s+/);
    return parts.length === 2
      ? { first: parts[0], second: parts[1] }
      : { first: raw, second: null };
  });
}
