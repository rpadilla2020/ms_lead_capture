import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GraphLeadField { name: string; values: string[]; }
export interface GraphLeadData {
  id: string; created_time: number; field_data: GraphLeadField[];
  form_id: string; ad_id?: string; ad_name?: string;
  adset_id?: string; adset_name?: string; campaign_id?: string; campaign_name?: string;
}
export interface GraphAdForm { id: string; name: string; status: string; leads_count?: number; }
export interface GraphAdAccount { id: string; name: string; account_status: number; }
export interface GraphCampaign {
  id: string; name: string; status: string;
  adsets?: { data: GraphAdSet[] };
}
export interface GraphAdSet {
  id: string; name: string; status: string;
  ads?: { data: GraphAd[] };
}
export interface GraphAd {
  id: string; name: string; status: string;
  creative?: { lead_gen_form?: { id: string; name: string } };
}
export interface GraphTokenDebug {
  data: { is_valid: boolean; expires_at: number; scopes: string[] };
}

/** FIX #4 — timeout por defecto para todas las llamadas a Graph API */
const GRAPH_TIMEOUT_MS = Number(process.env.GRAPH_TIMEOUT_MS ?? 8_000);

@Injectable()
export class GraphApiService {
  private readonly logger    = new Logger(GraphApiService.name);
  private readonly version   = process.env.META_GRAPH_VERSION ?? 'v22.0';
  private readonly base      = `https://graph.facebook.com/${this.version}`;
  private readonly appToken  = process.env.META_APP_TOKEN ?? '';

  constructor(private readonly http: HttpService) {}

  // ─── Lead ────────────────────────────────────────────────────────────

  async getLead(leadgenId: string, pageToken: string): Promise<GraphLeadData> {
    try {
      const resp = await firstValueFrom(
        this.http.get<GraphLeadData>(`${this.base}/${leadgenId}`, {
          params: {
            fields: 'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
            access_token: pageToken,
          },
          timeout: GRAPH_TIMEOUT_MS,
        }),
      );
      return resp.data;
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? err.message;
      this.logger.error(`[GraphApi] getLead ${leadgenId}: ${msg}`);
      throw new HttpException(`Graph API error: ${msg}`, HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Formularios ─────────────────────────────────────────────────────

  async getPageForms(pageId: string, pageToken: string): Promise<GraphAdForm[]> {
    // FIX #9 — paginación con cursores
    return this.paginateAll<GraphAdForm>(
      `${this.base}/${pageId}/leadgen_forms`,
      { fields: 'id,name,status,leads_count', access_token: pageToken },
    );
  }

  // ─── Ad Accounts ─────────────────────────────────────────────────────

  async getPageAdAccounts(pageId: string, pageToken: string): Promise<GraphAdAccount[]> {
    return this.paginateAll<GraphAdAccount>(
      `${this.base}/${pageId}/adaccounts`,
      { fields: 'id,name,account_status', access_token: pageToken },
    );
  }

  // ─── Campañas — paginadas ─────────────────────────────────────────────

  async getAdAccountCampaignsPaginated(
    adAccountId: string, pageToken: string,
  ): Promise<GraphCampaign[]> {
    // FIX #9 — paginación real con cursores
    return this.paginateAll<GraphCampaign>(
      `${this.base}/${adAccountId}/campaigns`,
      {
        fields: 'id,name,status,adsets{id,name,status,ads{id,name,status,creative{lead_gen_form{id,name}}}}',
        access_token: pageToken,
      },
    );
  }

  // ─── Webhook: suscripción ────────────────────────────────────────────

  async subscribePageToWebhook(pageId: string, pageToken: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean }>(
          `${this.base}/${pageId}/subscribed_apps`, null,
          { params: { subscribed_fields: 'leadgen', access_token: pageToken }, timeout: GRAPH_TIMEOUT_MS },
        ),
      );
      return resp.data?.success === true;
    } catch (err) {
      this.logger.error(`[GraphApi] subscribeWebhook ${pageId}: ${err?.response?.data?.error?.message ?? err.message}`);
      return false;
    }
  }

  async getPageWebhookSubscriptions(pageId: string, pageToken: string): Promise<string[]> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ data: Array<{ subscribed_fields: string[] }> }>(
          `${this.base}/${pageId}/subscribed_apps`,
          { params: { access_token: pageToken }, timeout: GRAPH_TIMEOUT_MS },
        ),
      );
      return resp.data?.data?.[0]?.subscribed_fields ?? [];
    } catch { return []; }
  }

  // ─── Token ───────────────────────────────────────────────────────────

  async verifyPageToken(pageId: string, pageToken: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ id: string }>(
          `${this.base}/${pageId}`,
          { params: { fields: 'id', access_token: pageToken }, timeout: GRAPH_TIMEOUT_MS },
        ),
      );
      return resp.data?.id === pageId;
    } catch { return false; }
  }

  /**
   * FIX #7 — una sola llamada a /debug_token para obtener validez Y expiración
   * en lugar de verifyPageToken + getTokenExpiration por separado.
   */
  async debugToken(pageToken: string): Promise<{ is_valid: boolean; expires_at: Date | null; scopes: string[] }> {
    try {
      const accessToken = this.appToken || pageToken;
      const resp = await firstValueFrom(
        this.http.get<GraphTokenDebug>(
          `${this.base}/debug_token`,
          { params: { input_token: pageToken, access_token: accessToken }, timeout: GRAPH_TIMEOUT_MS },
        ),
      );
      const d          = resp.data?.data;
      const expiresAt  = d?.expires_at && d.expires_at !== 0
        ? new Date(d.expires_at * 1000)
        : null;
      return { is_valid: d?.is_valid ?? false, expires_at: expiresAt, scopes: d?.scopes ?? [] };
    } catch (err) {
      this.logger.error(`[GraphApi] debugToken: ${err.message}`);
      return { is_valid: false, expires_at: null, scopes: [] };
    }
  }

  // ─── Helper: flattenFields ────────────────────────────────────────────

  flattenFields(fieldData: GraphLeadField[]): Record<string, string> {
    return (fieldData ?? []).reduce((acc, f) => {
      acc[f.name] = f.values?.[0] ?? '';
      return acc;
    }, {} as Record<string, string>);
  }

  // ─── Paginación genérica con cursores ────────────────────────────────
  // FIX #9 — iterar páginas hasta que no haya cursor "next"

  private async paginateAll<T>(url: string, params: Record<string, any>): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = url;
    let nextParams: Record<string, any> | null = { ...params, limit: 100 };
    let page = 0;

    while (nextUrl && page < 50) { // máximo 50 páginas por seguridad
      page++;
      try {
        const resp = await firstValueFrom(
          this.http.get<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(
            nextUrl, { params: nextParams ?? {}, timeout: GRAPH_TIMEOUT_MS },
          ),
        );

        const data = resp.data?.data ?? [];
        results.push(...data);

        const nextCursor = resp.data?.paging?.cursors?.after;
        const hasNext    = !!resp.data?.paging?.next;

        if (hasNext && nextCursor) {
          nextParams = { ...params, limit: 100, after: nextCursor };
        } else {
          break;
        }
      } catch (err) {
        const msg = err?.response?.data?.error?.message ?? err.message;
        this.logger.error(`[GraphApi] paginateAll ${nextUrl} page ${page}: ${msg}`);
        break;
      }
    }

    return results;
  }
}
