import { inject, Injectable } from '@angular/core';
import { PropertyCreateService } from './property-create.service';

// Резолв uuid типа/подтипа → человекочитаемый label из get_filter_options.
// Тот же справочник, что использует лента (property-card). Кэшируем in-flight Promise →
// параллельные первые вызовы дают ОДИН getFilterOptions.
@Injectable({ providedIn: 'root' })
export class UnitTypeLabelService {
  private readonly _createService = inject(PropertyCreateService);
  private _labelsPromise: Promise<Map<string, string>> | null = null;

  async getLabel(
    unitTypeId: string | null,
    subTypeId?: string | null,
  ): Promise<string | null> {
    const map = await this._ensureLabels();
    return (
      (subTypeId && map.get(subTypeId)) || (unitTypeId && map.get(unitTypeId)) || null
    );
  }

  private _ensureLabels(): Promise<Map<string, string>> {
    if (!this._labelsPromise) {
      this._labelsPromise = this._buildLabels();
    }
    return this._labelsPromise;
  }

  private async _buildLabels(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const opts = await this._createService.getFilterOptions();
      for (const u of opts.unit_types) map.set(u.id, u.label_en);
      for (const s of opts.sub_types) map.set(s.id, s.label_en);
    } catch {
      // справочник недоступен → не кэшируем провал, дать повтор на следующем вызове
      this._labelsPromise = null;
    }
    return map;
  }
}
