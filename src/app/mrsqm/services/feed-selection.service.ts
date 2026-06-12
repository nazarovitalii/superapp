import { computed, Injectable, signal } from '@angular/core';

// Состояние множественного выбора объектов в ленте (чекбоксы).
// Живёт в сервисе, чтобы меню выбора в главном хедере и лента
// работали с одним и тем же набором id.
@Injectable({ providedIn: 'root' })
export class FeedSelectionService {
  private readonly _selectedIds = signal<Set<string>>(new Set());

  readonly selectedIds = this._selectedIds.asReadonly();
  readonly count = computed(() => this._selectedIds().size);

  isSelected(id: string): boolean {
    return this._selectedIds().has(id);
  }

  toggle(id: string): void {
    const next = new Set(this._selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._selectedIds.set(next);
  }

  clear(): void {
    this._selectedIds.set(new Set());
  }
}
