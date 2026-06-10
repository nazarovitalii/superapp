import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class MrsqmSupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );

  async rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, params);
    if (error) throw error;
    return data as T;
  }
}
