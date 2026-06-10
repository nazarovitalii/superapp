import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PropertyFeedItem } from '../../types/database';

@Component({
  selector: 'mrsqm-property-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  templateUrl: './property-card.component.html',
  styleUrl: './property-card.component.scss',
})
export class PropertyCardComponent {
  readonly property = input.required<PropertyFeedItem>();
  readonly isActive = input(false);
  readonly cardClick = output<void>();
}
