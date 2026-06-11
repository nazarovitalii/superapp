import { Injectable, computed, inject, signal } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { MrsqmUser } from '../types/database';

// Ошибка входа для отображения в UI (русское сообщение).
export class AuthError extends Error {}

@Injectable({ providedIn: 'root' })
export class MrsqmAuthService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Профиль текущего пользователя (из таблицы `users`) или null, если не вошёл.
  private readonly _currentUser = signal<MrsqmUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  // true, пока идёт первичная проверка сессии при старте приложения.
  private readonly _isInitializing = signal<boolean>(true);
  readonly isInitializing = this._isInitializing.asReadonly();

  constructor() {
    // Восстановить сессию при загрузке и слушать изменения (вход/выход/refresh).
    void this._restoreSession();
    this._supabase.client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        this._currentUser.set(null);
      }
      // SIGNED_IN-профиль подтягиваем явно в signIn(), чтобы прокинуть ошибку
      // «нет активной записи в users» наверх в форму логина.
    });
  }

  // Вход по email+паролю. После Supabase Auth проверяем запись в `users`
  // (is_active = true). Если её нет/неактивна — принудительный signOut + ошибка.
  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this._supabase.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      throw new AuthError('Неверный email или пароль');
    }

    const profile = await this._loadProfile();
    if (!profile) {
      await this.signOut();
      throw new AuthError('Учётная запись не найдена или деактивирована');
    }
    this._currentUser.set(profile);
  }

  async signOut(): Promise<void> {
    await this._supabase.client.auth.signOut();
    this._currentUser.set(null);
  }

  // Подтянуть запись из `users` по auth.uid() с is_active = true.
  // RLS (users_select_own) сам ограничивает выборку текущим пользователем.
  private async _loadProfile(): Promise<MrsqmUser | null> {
    const { data, error } = await this._supabase.client
      .from('users')
      .select('id, email, full_name, role, is_active')
      .eq('is_active', true)
      .maybeSingle<MrsqmUser>();
    if (error || !data) {
      return null;
    }
    return data;
  }

  private async _restoreSession(): Promise<void> {
    try {
      const { data } = await this._supabase.client.auth.getSession();
      if (data.session) {
        const profile = await this._loadProfile();
        if (profile) {
          this._currentUser.set(profile);
        } else {
          // Сессия есть, но в users записи нет/деактивирована — выходим.
          await this.signOut();
        }
      }
    } finally {
      this._isInitializing.set(false);
    }
  }
}
