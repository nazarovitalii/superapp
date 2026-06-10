import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import {
  EMPTY_FILTERS,
  FeedFilters,
  FeedFilterService,
} from '../../services/feed-filter.service';
import { ListingType } from '../../types/database';

const PROPERTY_TYPES = [
  'Apartment',
  'Villa',
  'Townhouse',
  'Studio',
  'Penthouse',
  'Office',
];
const BED_OPTIONS = [0, 1, 2, 3, 4, 5];

@Component({
  selector: 'mrsqm-feed-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    FormsModule,
  ],
  templateUrl: './feed-filter-panel.component.html',
  styleUrl: './feed-filter-panel.component.scss',
})
export class FeedFilterPanelComponent {
  readonly closed = output<void>();
  private readonly _filterService = inject(FeedFilterService);

  readonly propertyTypes = PROPERTY_TYPES;
  readonly bedOptions = BED_OPTIONS;

  // Локальная черновая копия — применяем по кнопке «Применить».
  readonly draft = signal<FeedFilters>({ ...this._filterService.filters() });

  setPropertyType(type: string): void {
    const cur = this.draft().propertyType;
    this._patch({ propertyType: cur === type ? null : type });
  }

  setBedrooms(beds: number): void {
    const cur = this.draft().bedrooms;
    this._patch({ bedrooms: cur === beds ? null : beds });
  }

  setListingType(type: ListingType | 'all'): void {
    this._patch({ listingType: type });
  }

  setPriceMin(value: string): void {
    this._patch({ priceMin: value ? Number(value) : null });
  }

  setPriceMax(value: string): void {
    this._patch({ priceMax: value ? Number(value) : null });
  }

  setDistress(checked: boolean): void {
    this._patch({ distressOnly: checked });
  }

  bedLabel(beds: number): string {
    return beds === 0 ? 'Studio' : `${beds}${beds === 5 ? '+' : ''} BR`;
  }

  reset(): void {
    this.draft.set({ ...EMPTY_FILTERS });
  }

  apply(): void {
    this._filterService.filters.set({ ...this.draft() });
    this.closed.emit();
  }

  private _patch(patch: Partial<FeedFilters>): void {
    this.draft.set({ ...this.draft(), ...patch });
  }
}
