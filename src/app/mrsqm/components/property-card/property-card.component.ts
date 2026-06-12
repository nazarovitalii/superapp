import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { PropertyFeedItem } from '../../types/database';
import { DoneToggleComponent } from '../../../ui/done-toggle/done-toggle.component';

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
  readonly isSaved = input(false);
  // Чекбокс множественного выбора (как done-toggle в инбоксе).
  readonly isSelected = input(false);
  readonly cardClick = output<void>();
  // Клик по закладке — отдельно от клика по карточке (stopPropagation в шаблоне).
  readonly saveClick = output<void>();
  readonly selectToggle = output<void>();
  // Hover-кнопка «развернуть/свернуть» правый sidebar (item 2).
  readonly toggleClick = output<void>();
}
