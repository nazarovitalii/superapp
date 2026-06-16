import {
  Component,
  input,
  output,
  signal,
  computed,
  ChangeDetectionStrategy,
  HostListener,
  OnInit,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { PropertyPhoto } from '../../types/database';

// Полноэкранный просмотр фото объекта (лайтбокс) — в духе focus-mode оверлея SP:
// затемнённый фон, крестик справа сверху, стрелки, счётчик, полоска миниатюр.
// Управление: клик по стрелкам/миниатюрам, клавиши ←/→/Esc, свайп на тач-устройствах.
@Component({
  selector: 'mrsqm-property-gallery-lightbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './property-gallery-lightbox.component.html',
  styleUrl: './property-gallery-lightbox.component.scss',
})
export class PropertyGalleryLightboxComponent implements OnInit {
  readonly photos = input.required<PropertyPhoto[]>();
  readonly startIndex = input<number>(0);
  readonly closed = output<void>();

  private readonly _idx = signal(0);
  readonly index = computed(() =>
    Math.min(Math.max(this._idx(), 0), Math.max(this.photos().length - 1, 0)),
  );
  readonly current = computed(() => this.photos()[this.index()] ?? null);

  // Координата X начала свайпа (тач).
  private _touchStartX: number | null = null;

  // input стартового индекса применяем один раз при инициализации.
  private _started = false;
  ngOnInit(): void {
    if (!this._started) {
      this._idx.set(this.startIndex());
      this._started = true;
    }
  }

  next(): void {
    const len = this.photos().length;
    if (len <= 1) return;
    this._idx.set((this.index() + 1) % len);
  }

  prev(): void {
    const len = this.photos().length;
    if (len <= 1) return;
    this._idx.set((this.index() - 1 + len) % len);
  }

  go(i: number): void {
    this._idx.set(i);
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'ArrowRight') {
      this.next();
    } else if (e.key === 'ArrowLeft') {
      this.prev();
    }
  }

  onTouchStart(e: TouchEvent): void {
    this._touchStartX = e.changedTouches[0]?.clientX ?? null;
  }

  onTouchEnd(e: TouchEvent): void {
    if (this._touchStartX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - this._touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx < 0) this.next();
      else this.prev();
    }
    this._touchStartX = null;
  }
}
