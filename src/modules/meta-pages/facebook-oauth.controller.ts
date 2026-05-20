import {
  Controller, Get, HttpCode, HttpStatus,
  ParseIntPipe, Query, Redirect, Res,
} from '@nestjs/common';
import { FacebookOAuthService } from './facebook-oauth.service';

@Controller('meta-pages/auth')
export class FacebookOAuthController {
  constructor(private readonly oauthService: FacebookOAuthService) {}

  /**
   * GET /api/lead-capture/meta-pages/auth/facebook?accountId=1
   *
   * Genera la URL de autorización y redirige al admin a Facebook.
   * El admin verá el popup de Facebook para seleccionar sus páginas.
   */
  @Get('facebook')
  @Redirect()
  initiateOAuth(
    @Query('accountId', ParseIntPipe) accountId: number,
  ) {
    const url = this.oauthService.getAuthUrl(accountId);
    return { url, statusCode: HttpStatus.FOUND };
  }

  /**
   * GET /api/lead-capture/meta-pages/auth/facebook/callback?code=XXX&state=accountId
   *
   * Facebook redirige aquí tras la autorización.
   * - Intercambia el code por tokens
   * - Guarda las páginas autorizadas en meta_page_config
   * - Redirige al frontend con el resultado
   */
  @Get('facebook/callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: any,
  ) {
    // Facebook puede devolver error si el usuario cancela
    if (error) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
      return res.redirect(`${frontendUrl}/lead-capture/pages?oauth_error=${encodeURIComponent(error)}`);
    }

    const result = await this.oauthService.handleCallback(code, state);

    // Redirigir al frontend con el resultado
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const params = new URLSearchParams({
      oauth_success: 'true',
      created:       String(result.created),
      updated:       String(result.updated),
    });

    return res.redirect(`${frontendUrl}/lead-capture/pages?${params.toString()}`);
  }

  /**
   * GET /api/lead-capture/meta-pages/auth/facebook/url?accountId=1
   *
   * Alternativa: devuelve la URL en JSON en lugar de redirigir.
   * Útil cuando el frontend quiere abrir la ventana de OAuth manualmente (popup).
   */
  @Get('facebook/url')
  @HttpCode(HttpStatus.OK)
  getAuthUrl(
    @Query('accountId', ParseIntPipe) accountId: number,
  ): { url: string } {
    const url = this.oauthService.getAuthUrl(accountId);
    return { url };
  }
}
