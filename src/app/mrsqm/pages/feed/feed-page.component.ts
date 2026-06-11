import { Component, inject, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { FeedFilterService } from '../../services/feed-filter.service';
import { FeedParams, FeedResponse, PropertyFeedItem } from '../../types/database';
import { PropertyCardComponent } from '../../components/property-card/property-card.component';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { signal } from '@angular/core';

const PAGE_SIZE = 20;

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
  readonly loadError = signal(false);
  readonly countTotal = signal(0);
  readonly offset = signal(0);
  readonly hasMore = signal(false);

  get selectedPropertyId(): string | null {
    return this._panels.selectedProperty()?.id ?? null;
  }

  constructor() {
    // Перезагружаем при смене dealType или фильтров.
    effect(() => {
      this.filter.dealType();
      this.filter.filters();
      this.offset.set(0);
      this.properties.set([]);
      void this._load();
    });
  }

  async loadMore(): Promise<void> {
    this.offset.set(this.offset() + PAGE_SIZE);
    await this._load(true);
  }

  openDetail(property: PropertyFeedItem): void {
    this._panels.openProperty(property);
  }

  // Маппинг фильтров ленты в параметры RPC get_feed.
  private _buildParams(): FeedParams {
    const f = this.filter.filters();
    return {
      p_deal_type: this.filter.dealType(),
      p_limit: PAGE_SIZE,
      p_offset: this.offset(),
      // p_bedrooms — массив (мультивыбор в API); пока одно значение.
      p_bedrooms: f.bedrooms !== null ? [f.bedrooms] : null,
      p_price_min: f.priceMin,
      p_price_max: f.priceMax,
      p_listing_type: f.listingType !== 'all' ? f.listingType : null,
      p_is_distress: f.distressOnly ? true : null,
    };
  }

  private async _load(append = false): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    try {
      const res = await this._supabase.rpc<FeedResponse>('get_feed', this._buildParams());
      const items = res.results ?? [];
      // Пустой результат — валиден (объектов нет), показываем empty-state.
      this.properties.set(append ? [...this.properties(), ...items] : items);
      this.countTotal.set(res.count_total ?? 0);
      this.hasMore.set(this.properties().length < (res.count_total ?? 0));
    } catch {
      // Ошибка RPC (нет города/сети) — не подменяем моками, честно показываем сбой.
      this.loadError.set(true);
      if (!append) {
        this.properties.set([]);
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
