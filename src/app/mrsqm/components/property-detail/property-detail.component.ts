import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PropertyDetail, PropertyFeedItem } from '../../types/database';
import { MrsqmSupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'mrsqm-property-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './property-detail.component.html',
  styleUrl: './property-detail.component.scss',
})
export class PropertyDetailComponent implements OnInit {
  private readonly _supabase = inject(MrsqmSupabaseService);

  readonly property = input.required<PropertyFeedItem>();
  readonly closed = output<void>();

  readonly detail = signal<PropertyDetail | null>(null);
  readonly isLoading = signal(true);
  readonly activePhotoIdx = signal(0);

  // Табы карточки: Инфо / Комментарии (item 13).
  readonly activeTab = signal<'info' | 'comments'>('info');
  // Подтабы комментариев: All (видны всем) / Private (только мне).
  readonly commentsScope = signal<'all' | 'private'>('all');

  setTab(tab: 'info' | 'comments'): void {
    this.activeTab.set(tab);
  }

  setCommentsScope(scope: 'all' | 'private'): void {
    this.commentsScope.set(scope);
  }

  // Счётчик комментариев в табе. Реальные данные подключим, когда появятся
  // RPC get_comments/add_comment (см. DB-батч). Пока — из comments_count объекта.
  get commentsCount(): number {
    return this.property().comments_count ?? 0;
  }

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this._supabase.rpc<PropertyDetail>('get_property', {
        p_property_id: this.property().id,
      });
      this.detail.set(res);
    } catch {
      // показываем данные из feed при ошибке
    } finally {
      this.isLoading.set(false);
    }
  }

  get displayData(): PropertyDetail | PropertyFeedItem {
    return this.detail() ?? this.property();
  }

  nextPhoto(): void {
    const photos = this.displayData.photos;
    if (!photos || photos.length <= 1) return;
    this.activePhotoIdx.set((this.activePhotoIdx() + 1) % photos.length);
  }

  prevPhoto(): void {
    const photos = this.displayData.photos;
    if (!photos || photos.length <= 1) return;
    this.activePhotoIdx.set((this.activePhotoIdx() - 1 + photos.length) % photos.length);
  }

  openWhatsApp(phone: string): void {
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
  }
}
