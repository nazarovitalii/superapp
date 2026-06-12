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
import { FormsModule } from '@angular/forms';
import {
  EMPTY_FILTERS,
  FeedFilters,
  FeedFilterService,
} from '../../services/feed-filter.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { FilterOptions, ListingType } from '../../types/database';

@Component({
  selector: 'mrsqm-feed-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, FormsModule],
  templateUrl: './feed-filter-panel.component.html',
  styleUrl: './feed-filter-panel.component.scss',
})
export class FeedFilterPanelComponent {
  readonly closed = output<void>();
  private readonly _filterService = inject(FeedFilterService);
  private readonly _createService = inject(PropertyCreateService);

  // Справочники из БД (get_filter_options) — все типы недвижимости, спальни, санузлы.
  readonly options = signal<FilterOptions | null>(null);

  // Локальная черновая копия — применяем по кнопке «Применить».
  readonly draft = signal<FeedFilters>({ ...this._filterService.filters() });

  constructor() {
    void this._loadOptions();
  }

  private async _loadOptions(): Promise<void> {
    try {
      this.options.set(await this._createService.getFilterOptions());
    } catch {
      // справочники недоступны — покажем только цену/площадь/листинг
    }
  }

  // ─── Тип недвижимости (один; повторный клик снимает) ─────────────────────
  setUnitType(id: string): void {
    const cur = this.draft().unitTypeId;
    this._patch({ unitTypeId: cur === id ? null : id });
  }

  // ─── Мультиселекты ────────────────────────────────────────────────────────
  toggleBedroom(value: number): void {
    this._patch({ bedrooms: this._toggleInArray(this.draft().bedrooms, value) });
  }

  toggleBathroom(value: number): void {
    this._patch({ bathrooms: this._toggleInArray(this.draft().bathrooms, value) });
  }

  private _toggleInArray(arr: number[], value: number): number[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  // ─── Цена / площадь — с форматированием запятыми ─────────────────────────
  formatNum(value: number | null): string {
    return value !== null ? value.toLocaleString('en-US') : '';
  }

  setPriceMin(value: string): void {
    this._patch({ priceMin: this._parseNum(value) });
  }

  setPriceMax(value: string): void {
    this._patch({ priceMax: this._parseNum(value) });
  }

  setAreaMin(value: string): void {
    this._patch({ areaMin: this._parseNum(value) });
  }

  setAreaMax(value: string): void {
    this._patch({ areaMax: this._parseNum(value) });
  }

  private _parseNum(value: string): number | null {
    const digits = value.replace(/\D/g, '');
    return digits ? Number(digits) : null;
  }

  // ─── Мебель / готовность / листинг ───────────────────────────────────────
  setFurnished(value: string | null): void {
    this._patch({ furnished: this.draft().furnished === value ? null : value });
  }

  setHandover(value: string | null): void {
    this._patch({ handover: this.draft().handover === value ? null : value });
  }

  setListingType(type: ListingType | 'all'): void {
    this._patch({ listingType: type });
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
