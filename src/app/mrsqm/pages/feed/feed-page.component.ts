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
import { PropertyCreateService } from '../../services/property-create.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';
import { FeedSelectionService } from '../../services/feed-selection.service';
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
  private readonly _createService = inject(PropertyCreateService);
  private readonly _saved = inject(SavedPropertiesService);
  readonly filter = inject(FeedFilterService);
  // Множественный выбор чекбоксами — общий сервис с меню в главном хедере.
  readonly selection = inject(FeedSelectionService);

  // unit_type_id/sub_type_id (uuid) → название типа. Заполняется из справочников.
  private _typeLabels: Map<string, string> | null = null;

  readonly properties = signal<PropertyFeedItem[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal(false);
  readonly countTotal = signal(0);
  readonly offset = signal(0);
  readonly hasMore = signal(false);
  // id объектов в избранном (для иконки-закладки).
  readonly savedIds = signal<Set<string>>(new Set());

  get selectedPropertyId(): string | null {
    return this._panels.selectedProperty()?.id ?? null;
  }

  constructor() {
    void this._loadSaved();
    // Перезагружаем при смене dealType или фильтров.
    effect(() => {
      this.filter.dealType();
      this.filter.filters();
      this.offset.set(0);
      this.properties.set([]);
      void this._load();
    });
  }

  private async _loadSaved(): Promise<void> {
    try {
      this.savedIds.set(await this._saved.getSavedIds());
    } catch {
      // Избранное недоступно — иконки просто будут пустыми.
    }
  }

  // Toggle избранного по клику на закладку. Оптимистично обновляем Set.
  async toggleSaved(property: PropertyFeedItem): Promise<void> {
    const id = property.id;
    const next = new Set(this.savedIds());
    const wasSaved = next.has(id);
    // оптимистично
    if (wasSaved) next.delete(id);
    else next.add(id);
    this.savedIds.set(next);
    try {
      const isSaved = await this._saved.toggle(id);
      const fixed = new Set(this.savedIds());
      if (isSaved) fixed.add(id);
      else fixed.delete(id);
      this.savedIds.set(fixed);
    } catch {
      // откат при ошибке
      const revert = new Set(this.savedIds());
      if (wasSaved) revert.add(id);
      else revert.delete(id);
      this.savedIds.set(revert);
    }
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
      const items = await this._withTypeLabels(res.results ?? []);
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

  // Резолвим название типа: get_feed отдаёт только unit_type_id/sub_type_id (uuid),
  // а карточка показывает property_type. Берём label из справочников (кэш).
  private async _withTypeLabels(items: PropertyFeedItem[]): Promise<PropertyFeedItem[]> {
    if (!items.length) {
      return items;
    }
    const labels = await this._getTypeLabels();
    return items.map((it) => {
      const label =
        (it.sub_type_id && labels.get(it.sub_type_id)) ||
        (it.unit_type_id && labels.get(it.unit_type_id)) ||
        null;
      return label ? { ...it, property_type: label } : it;
    });
  }

  private async _getTypeLabels(): Promise<Map<string, string>> {
    if (this._typeLabels) {
      return this._typeLabels;
    }
    const map = new Map<string, string>();
    try {
      const opts = await this._createService.getFilterOptions();
      for (const u of opts.unit_types) map.set(u.id, u.label_en);
      for (const s of opts.sub_types) map.set(s.id, s.label_en);
    } catch {
      // Справочники недоступны — тип просто останется пустым, не критично.
    }
    this._typeLabels = map;
    return map;
  }
}
