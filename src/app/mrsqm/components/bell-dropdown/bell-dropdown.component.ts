import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { UnitTypeLabelService } from '../../services/unit-type-label.service';
import { buildBellRows } from '../../util/bell-rows';
import { BellItem, BellRow } from '../../types/notifier';
import { buildPropertyTitle } from '../../util/property-title';
import { isBellLiveOn, setBellLive } from '../../util/bell-live-pref';
import { PanelContentService } from '../../../features/panels/panel-content.service';

@Component({
  selector: 'mrsqm-bell-dropdown',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './bell-dropdown.component.html',
  styleUrl: './bell-dropdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BellDropdownComponent {
  private readonly _store = inject(NotifierStoreService);
  private readonly _labels = inject(UnitTypeLabelService);
  private readonly _panels = inject(PanelContentService);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  readonly status = this._store.status;
  readonly liveOn = signal(isBellLiveOn());

  // Резолв заголовков синхронно: держим Map unit_type_id→label, пополняем асинхронно.
  private readonly _titleMap = signal<Map<string, string>>(new Map());

  readonly rows = computed<BellRow[]>(() => {
    const map = this._titleMap();
    const getTitle = (it: BellItem): string =>
      buildPropertyTitle(
        it.bedrooms,
        it.unit_type_id ? (map.get(it.unit_type_id) ?? null) : null,
      );
    return buildBellRows(this._store.filters(), this._store.bell().items, getTitle);
  });

  readonly viewState = computed<'loading' | 'error' | 'no-filters' | 'no-new' | 'list'>(
    () => {
      if (this.status() === 'loading' && !this._store.filters().length) return 'loading';
      if (this.status() === 'error') return 'error';
      if (!this._store.filters().length) return 'no-filters';
      if (!this.rows().length) return 'no-new';
      return 'list';
    },
  );

  constructor() {
    // Открытие/закрытие нативного <dialog> по input open (top-layer showModal).
    effect(() => {
      const dlg = this.dialogRef()?.nativeElement;
      if (!dlg) return;
      if (this.open() && !dlg.open) dlg.showModal();
      else if (!this.open() && dlg.open) dlg.close();
    });
    // Подгрузка label типов для заголовков (брифом title собирает фронт).
    effect(() => {
      const items = this._store.bell().items;
      void this._loadTitles(items);
    });
  }

  private async _loadTitles(items: BellItem[]): Promise<void> {
    const map = new Map(this._titleMap());
    let changed = false;
    for (const it of items) {
      if (it.unit_type_id && !map.has(it.unit_type_id)) {
        const label = await this._labels.getLabel(it.unit_type_id);
        if (label) {
          map.set(it.unit_type_id, label);
          changed = true;
        }
      }
    }
    if (changed) this._titleMap.set(map);
  }

  onRowClick(row: BellRow): void {
    if (row.preview) {
      const item = this._store
        .bell()
        .items.find((it) => it.property_id === row.preview?.propertyId);
      this._store.openListing(row.preview.propertyId, row.filterId, item);
      this.closed.emit(); // закрытие дропдауна → store.closeBell() в bell-button
    } else {
      // fallback (бэклог без превью): пока тоже открываем дропдаун-закрытие; объект клиент
      // выберет в ленте. v1: просто закрываем (углубление до «результаты фильтра» — отдельная задача).
      this.closed.emit();
    }
  }

  toggleLive(): void {
    const next = !this.liveOn();
    this.liveOn.set(next);
    setBellLive(next);
  }

  // Состояние «нет сохранённых фильтров» → открыть панель фильтров ленты (spec §5).
  onCreateFilter(): void {
    this._panels.openFilterPanel();
    this.closed.emit();
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === this.dialogRef()?.nativeElement) this.closed.emit();
  }

  onDialogClose(): void {
    if (this.open()) this.closed.emit(); // Esc / нативное закрытие
  }
}
