import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProfileService } from '../../services/profile.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { PropertyCreateService } from '../../services/property-create.service';
import {
  MyListing,
  PropertyStatus,
  PROPERTY_STATUS_LABELS,
  UserContacts,
  UserProfile,
} from '../../types/database';

type Tab = 'overview' | 'listings' | 'activity';

@Component({
  selector: 'mrsqm-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
})
export class ProfilePageComponent {
  private readonly _service = inject(ProfileService);
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _createService = inject(PropertyCreateService);

  readonly profile = signal<UserProfile | null>(null);
  readonly contacts = signal<UserContacts | null>(null);
  readonly listings = signal<MyListing[]>([]);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly tab = signal<Tab>('overview');

  // unit_type_id → название типа (из справочников).
  private _typeLabels = new Map<string, string>();

  constructor() {
    void this._load();
  }

  private async _load(): Promise<void> {
    const user = this._auth.currentUser();
    if (!user) {
      this.error.set('Сессия не найдена');
      this.isLoading.set(false);
      return;
    }
    try {
      const [profile, contacts, listings, opts] = await Promise.all([
        this._service.getProfile(user.id),
        this._service.getContacts(user.id),
        this._service.getMyListings(user.id),
        this._createService.getFilterOptions().catch(() => null),
      ]);
      this.profile.set(profile);
      this.contacts.set(contacts);
      this.listings.set(listings);
      if (opts) {
        for (const u of opts.unit_types) this._typeLabels.set(u.id, u.label_en);
        for (const s of opts.sub_types) this._typeLabels.set(s.id, s.label_en);
      }
    } catch {
      this.error.set('Не удалось загрузить профиль');
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(t: Tab): void {
    this.tab.set(t);
  }

  typeLabel(id: string | null): string {
    return (id && this._typeLabels.get(id)) || '—';
  }

  statusLabel(status: PropertyStatus): string {
    return PROPERTY_STATUS_LABELS[status] ?? status;
  }

  // Первая буква для аватара-заглушки.
  get initial(): string {
    return (this.profile()?.full_name ?? '?').trim().charAt(0).toUpperCase();
  }

  async copyReferral(): Promise<void> {
    const code = this.profile()?.referral_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard недоступен — молча игнорируем.
    }
  }

  async logout(): Promise<void> {
    await this._auth.signOut();
    window.location.href = '/login';
  }
}
