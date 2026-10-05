export interface XConfig {
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
}
export type XIdentity = { id: string; username: string };

// Only these exact provider endpoints ever receive codes or credentials.
const tokenEndpoint = 'https://api.x.com/2/oauth2/token';
const meEndpoint = 'https://api.x.com/2/users/me';
const revokeEndpoint = 'https://api.x.com/2/oauth2/revoke';
// X documents both scopes as required even for /2/users/me. There is no
// documented identity-only grant. We never call a post or timeline endpoint.
export const xScopes = 'tweet.read users.read';
export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
export async function pkceChallenge(verifier: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function xConfigured(env: XConfig): boolean {
  return !!env.X_CLIENT_ID?.trim() && !!env.X_CLIENT_SECRET?.trim();
}
export async function authorizationUrl(env: XConfig, state: string, verifier: string, redirectUri: string) {
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: env.X_CLIENT_ID!, redirect_uri: redirectUri,
    scope: xScopes, state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256' }).toString();
  return url.toString();
}

type XStage = 'token' | 'profile' | 'revoke';
export class XUnavailable extends Error {
  stage: XStage;
  status: number | null;
  constructor(stage: XStage, status: number | null = null) {
    super('X verification could not be completed.');
    this.stage = stage;
    this.status = status;
  }
}
async function xRequest(stage: XStage, url: string, init: RequestInit): Promise<Response> {
  try {
    // workerd does not implement redirect:"error". Manual prevents forwarding
    // credentials, and the success check below rejects every redirect response.
    const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new XUnavailable(stage, response.status);
    return response;
  } catch (error) {
    if (error instanceof XUnavailable) throw error;
    throw new XUnavailable(stage);
  }
}
// Never log provider bodies or raw exceptions: they can contain credentials.
export async function identifyXUser(env: XConfig, code: string, verifier: string, redirectUri: string): Promise<XIdentity> {
  let stage: XStage = 'token';
  try {
    const encodedClient = `${encodeURIComponent(env.X_CLIENT_ID!)}:${encodeURIComponent(env.X_CLIENT_SECRET!)}`;
    const clientHeaders = { Authorization: `Basic ${btoa(encodedClient)}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const tokenResponse = await xRequest('token', tokenEndpoint, {
      method: 'POST', headers: clientHeaders,
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }),
    });
    const token = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown };
    if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192) throw new XUnavailable('token');
    try {
      if (typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer') throw new XUnavailable('token');
      stage = 'profile';
      const profileResponse = await xRequest('profile', meEndpoint, { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json() as { data?: { id?: unknown; username?: unknown } };
      const user = profile.data;
      if (!user || typeof user.id !== 'string' || !/^[1-9][0-9]{0,24}$/.test(user.id) ||
          typeof user.username !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(user.username)) throw new XUnavailable('profile');
      return { id: user.id, username: user.username };
    } finally {
      // Revoke even after a failed lookup. Do not certify success unless X has
      // acknowledged revocation. Never persist the token, even if revocation fails.
      await xRequest('revoke', revokeEndpoint, {
        method: 'POST', headers: clientHeaders,
        // X requires the hint even though its walkthrough omits it. Without it,
        // the live endpoint rejects the request with HTTP 400 invalid_request.
        body: new URLSearchParams({ token: token.access_token, token_type_hint: 'access_token', client_id: env.X_CLIENT_ID! }),
      });
    }
  } catch (error) {
    if (error instanceof XUnavailable) throw error;
    throw new XUnavailable(stage);
  }
}
