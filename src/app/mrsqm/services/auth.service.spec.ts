import { TestBed } from '@angular/core/testing';
import { AuthError, MrsqmAuthService } from './auth.service';
import { MrsqmSupabaseService } from './supabase.service';
import { MrsqmUser } from '../types/database';

// Заглушка Supabase-клиента: подменяем auth + from('users'), чтобы
// проверить логику AuthService без реального сервера.
const makeUser = (over: Partial<MrsqmUser> = {}): MrsqmUser => ({
  id: 'u1',
  email: 'a@b.com',
  full_name: 'Агент',
  role: 'agent',
  is_active: true,
  ...over,
});

class FakeSupabase {
  signInResult: { data: { user: unknown }; error: unknown } = {
    data: { user: { id: 'u1' } },
    error: null,
  };
  sessionResult: { data: { session: unknown } } = { data: { session: null } };
  profileResult: { data: MrsqmUser | null; error: unknown } = {
    data: makeUser(),
    error: null,
  };
  signOutCalls = 0;

  client = {
    auth: {
      signInWithPassword: async () => this.signInResult,
      signOut: async () => {
        this.signOutCalls++;
        return { error: null };
      },
      getSession: async () => this.sessionResult,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: (): void => undefined } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => this.profileResult,
        }),
      }),
    }),
  };
}

describe('MrsqmAuthService', () => {
  let fake: FakeSupabase;

  const build = (): MrsqmAuthService => {
    TestBed.configureTestingModule({
      providers: [MrsqmAuthService, { provide: MrsqmSupabaseService, useValue: fake }],
    });
    return TestBed.inject(MrsqmAuthService);
  };

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.resetTestingModule();
  });

  it('входит при валидных кредах и активной записи в users', async () => {
    const svc = build();
    await svc.signIn('a@b.com', 'pass');
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.currentUser()?.id).toBe('u1');
  });

  it('кидает AuthError при ошибке Supabase Auth', async () => {
    fake.signInResult = { data: { user: null }, error: { message: 'bad' } };
    const svc = build();
    await expectAsync(svc.signIn('a@b.com', 'x')).toBeRejectedWithError(AuthError);
    expect(svc.isAuthenticated()).toBe(false);
  });

  it('выходит и кидает ошибку, если в users нет активной записи', async () => {
    fake.profileResult = { data: null, error: null };
    const svc = build();
    await expectAsync(svc.signIn('a@b.com', 'pass')).toBeRejected();
    expect(svc.isAuthenticated()).toBe(false);
    expect(fake.signOutCalls).toBeGreaterThan(0);
  });

  it('signOut сбрасывает текущего пользователя', async () => {
    const svc = build();
    await svc.signIn('a@b.com', 'pass');
    await svc.signOut();
    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.currentUser()).toBeNull();
  });
});
