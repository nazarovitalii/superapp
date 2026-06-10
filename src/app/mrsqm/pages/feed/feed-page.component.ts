import { Component, inject, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { FeedFilterService } from '../../services/feed-filter.service';
import { FeedResponse, PropertyFeedItem } from '../../types/database';
import { PropertyCardComponent } from '../../components/property-card/property-card.component';
import { MOCK_PROPERTIES } from './feed.mock';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { signal } from '@angular/core';

@Component({
  selector: 'mrsqm-feed-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    PropertyCardComponent,
  ],
  templateUrl: './feed-page.component.html',
  styleUrl: './feed-page.component.scss',
})
export class FeedPageComponent {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _panels = inject(PanelContentService);
  readonly filter = inject(FeedFilterService);

  readonly properties = signal<PropertyFeedItem[]>([]);
  readonly isLoading = signal(false);
  readonly countHidden = signal(0);
  readonly offset = signal(0);
  readonly hasMore = signal(false);

  get selectedPropertyId(): string | null {
    return this._panels.selectedProperty()?.id ?? null;
  }

  constructor() {
    // Перезагружаем при смене dealType или фильтров
    effect(() => {
      this.filter.dealType();
      this.filter.filters();
      this.offset.set(0);
      this.properties.set([]);
      void this._load();
    });
  }

  async loadMore(): Promise<void> {
    this.offset.set(this.offset() + 20);
    await this._load(true);
  }

  openDetail(property: PropertyFeedItem): void {
    this._panels.openProperty(property);
  }

  private async _load(append = false): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this._supabase.rpc<FeedResponse>('get_feed', {
        p_deal_type: this.filter.dealType(),
        p_limit: 20,
        p_offset: this.offset(),
      });
      const items = res.results ?? [];
      if (items.length > 0) {
        this.properties.set(append ? [...this.properties(), ...items] : items);
        this.countHidden.set(res.count_hidden ?? 0);
        this.hasMore.set(items.length === 20);
      } else {
        this._loadMocks();
      }
    } catch {
      this._loadMocks();
    } finally {
      this.isLoading.set(false);
    }
  }

  private _loadMocks(): void {
    const f = this.filter.filters();
    const filtered = MOCK_PROPERTIES.filter((p) => {
      if (p.deal_type !== this.filter.dealType()) return false;
      if (f.propertyType && p.property_type !== f.propertyType) return false;
      if (f.bedrooms !== null && (p.bedrooms ?? -1) !== f.bedrooms) return false;
      if (f.priceMin !== null && p.price < f.priceMin) return false;
      if (f.priceMax !== null && p.price > f.priceMax) return false;
      if (f.listingType !== 'all' && p.listing_type !== f.listingType) return false;
      if (f.distressOnly && !p.is_distress) return false;
      return true;
    });
    this.properties.set(filtered);
    this.countHidden.set(3);
    this.hasMore.set(false);
  }
}
