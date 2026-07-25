import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const USERS_TIMEOUT_MS = Number(process.env.USERS_TIMEOUT_MS ?? 8_000);

export interface ClientLookupData {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
}

export interface ResolvedClient {
  id: string;
  snapshot: Record<string, any>;
}

interface LookupResponse {
  found: boolean;
  source?: 'local' | 'external';
  user?: Record<string, any> & { id: string };
}

@Injectable()
export class UsersClientService {
  private readonly logger  = new Logger(UsersClientService.name);
  private readonly usersUrl = process.env.USERS_INTERNAL_URL ?? 'http://ms_users:3000/api/users_new';

  constructor(private readonly http: HttpService) {}

  /**
   * Busca al cliente en ms_users_ (teléfono → email) y lo crea si no existe.
   * Devuelve el id real y el snapshot completo del registro — contact_snapshot
   * en ms_opportunities debe ser el JSON real de ms_users_, no uno armado a mano.
   */
  async resolveOrCreateClient(accountId: number, data: ClientLookupData): Promise<ResolvedClient> {
    const headers = { account: String(accountId), 'Content-Type': 'application/json' };

    try {
      const existing = await this.lookup(data, headers);
      if (existing) return existing;

      const resp = await firstValueFrom(
        this.http.post<Record<string, any> & { id: string }>(
          `${this.usersUrl}/users`,
          {
            firstName: data.firstName || undefined,
            lastName:  data.lastName  || undefined,
            email:     data.email     || undefined,
            phone:     data.phone     || undefined,
            source:    'meta_ads',
          },
          { headers, timeout: USERS_TIMEOUT_MS },
        ),
      );
      return { id: resp.data.id, snapshot: resp.data };
    } catch (err) {
      const msg = err?.response?.data?.message ?? err.message;
      throw new Error(`ms_users_ error: ${msg}`);
    }
  }

  private async lookup(
    data: ClientLookupData,
    headers: Record<string, string>,
  ): Promise<ResolvedClient | null> {
    // Orden: teléfono → email
    for (const [field, value] of [['phone', data.phone], ['email', data.email]] as const) {
      if (!value) continue;

      const resp = await firstValueFrom(
        this.http.get<LookupResponse>(
          `${this.usersUrl}/users/lookup-by-identifier`,
          { params: { field, value }, headers, timeout: USERS_TIMEOUT_MS },
        ),
      );

      if (resp.data.found && resp.data.source === 'local' && resp.data.user) {
        return { id: resp.data.user.id, snapshot: resp.data.user };
      }
    }
    return null;
  }
}
