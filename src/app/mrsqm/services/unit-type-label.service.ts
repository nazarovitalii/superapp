import { inject, Injectable } from '@angular/core';
import { PropertyCreateService } from './property-create.service';

// Резолв uuid типа/подтипа → человекочитаемый label из get_filter_options.
// Тот же справочник, что использует лента (property-card). Кэш-Map поверх уже
// кэшированного getFilterOptions — повторный RPC не дёргается.
@Injectable({ providedIn: 'root' })
export class UnitTypeLabelService {
  private readonly _createService = inject(PropertyCreateService);
  private _labels: Map<string, string> | null = null;

  async getLabel(
    unitTypeId: string | null,
    subTypeId?: string | null,
  ): Promise<string | null> {
    const map = await this._ensureLabels();
    return (
      (subTypeId && map.get(subTypeId)) || (unitTypeId && map.get(unitTypeId)) || null
    );
  }

  private async _ensureLabels(): Promise<Map<string, string>> {
    if (this._labels) {
      return this._labels;
    }
    const map = new Map<string, string>();
    try {
      const opts = await this._createService.getFilterOptions();
      for (const u of opts.unit_types) map.set(u.id, u.label_en);
      for (const s of opts.sub_types) map.set(s.id, s.label_en);
    } catch {
      // справочник недоступен — заголовок останется без типа, не критично
    }
    this._labels = map;
    return map;
  }
}
