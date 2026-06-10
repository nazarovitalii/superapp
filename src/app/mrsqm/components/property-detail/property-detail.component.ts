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
