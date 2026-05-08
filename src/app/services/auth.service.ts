import { Injectable, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { clearAuthToken, getAuthToken, setAuthToken } from './auth-token.util';

interface LoginRequest {
  login: string;
  senha: string;
}

interface LoginResponse {
  token?: string;
  message: string;
  login: string;
  cargo?: string;
  NomeUsuario?: string;
  nomeUsuario?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly enableDebugLogs = isDevMode();
  private apiUrl = '/api'; // Usar proxy em vez de URL absoluta
  private readonly LOGIN_TIME_KEY = 'login_time';
  private readonly LOGIN_KEY = 'login';
  private readonly ROLE_KEY = 'auth_role';
  private readonly USER_NAME_KEY = 'nome_usuario';
  private readonly SHOP_NAME_KEY = 'nome_barbearia';
  private readonly EMPRESA_ID_KEY = 'empresa_id';
  private readonly SESSION_ACTIVE_KEY = 'auth_session_active';

  constructor(private http: HttpClient, private router: Router) {}

  login(loginRequest: LoginRequest): Observable<LoginResponse> {
    if (this.enableDebugLogs) {
      console.log('=== TENTATIVA DE LOGIN ===');
      console.log('API URL:', `${this.apiUrl}/auth/login`);
    }

    const payload: any = {
      login: loginRequest.login,
      email: loginRequest.login,
      senha: loginRequest.senha
    };

    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, payload, { withCredentials: true }).pipe(
      tap(response => {
        if (this.enableDebugLogs) {
          console.log('=== LOGIN BEM-SUCEDIDO ===');
          console.log('Server response:', response);
        }
        if (response) {
          const responseToken = typeof response.token === 'string' ? response.token : '';

          // Evita reaproveitar empresa_id de uma sessão anterior.
          localStorage.removeItem(this.EMPRESA_ID_KEY);
          // Evita reaproveitar nível de acesso de uma sessão anterior.
          localStorage.removeItem(this.ROLE_KEY);

          // Fluxo híbrido: usa token legado quando existir, mas já funciona com sessão em cookie HttpOnly.
          if (responseToken) {
            setAuthToken(responseToken);
          } else {
            clearAuthToken();
          }

          localStorage.setItem(this.LOGIN_TIME_KEY, new Date().toISOString());
          localStorage.setItem(this.SESSION_ACTIVE_KEY, '1');
          localStorage.setItem(this.LOGIN_KEY, response.login ?? loginRequest.login);

          const empresaId = this.resolveEmpresaId(response, responseToken || null);
          if (empresaId > 0) {
            localStorage.setItem(this.EMPRESA_ID_KEY, String(empresaId));
          }

          const nomeUsuario = String(
            (response as any)?.nomeUsuario ?? (response as any)?.NomeUsuario ?? (response as any)?.nome ?? (response as any)?.Nome ?? ''
          ).trim();
          if (nomeUsuario) {
            localStorage.setItem(this.USER_NAME_KEY, nomeUsuario);
          } else {
            // Evita manter lixo de sessões anteriores
            localStorage.removeItem(this.USER_NAME_KEY);
          }

          // Nome da barbearia/empresa (multi-cliente). Mantém compatibilidade com vários backends.
          const nomeBarbearia = String(
            (response as any)?.nomeBarbearia ??
              (response as any)?.NomeBarbearia ??
              (response as any)?.barbeariaNome ??
              (response as any)?.BarbeariaNome ??
              (response as any)?.empresaNome ??
              (response as any)?.EmpresaNome ??
              (response as any)?.nomeEmpresa ??
              (response as any)?.NomeEmpresa ??
              (response as any)?.nomeFantasia ??
              (response as any)?.NomeFantasia ??
              ''
          ).trim();
          if (nomeBarbearia) {
            localStorage.setItem(this.SHOP_NAME_KEY, nomeBarbearia);
          } else {
            localStorage.removeItem(this.SHOP_NAME_KEY);
          }

          // Cache opcional de role/nivel quando o backend envia.
          const role = (response as any)?.cargo ?? (response as any)?.nivelAcesso ?? (response as any)?.NivelAcesso;
          if (role !== undefined && role !== null) {
            localStorage.setItem(this.ROLE_KEY, role.toString());
          }

          if (this.enableDebugLogs) {
            console.log('✅ Sessão ativa:', localStorage.getItem(this.SESSION_ACTIVE_KEY));
            console.log('✅ Login armazenado:', localStorage.getItem(this.LOGIN_KEY));
            console.log('✅ NomeUsuario armazenado:', localStorage.getItem(this.USER_NAME_KEY));
            console.log('🔄 Redirecionando para /businessperformance...');
          }
          this.router.navigate(['/businessperformance']);
        } else {
          console.error('❌ Login failed: Unexpected response format', response);
          throw new Error('Login failed: Unexpected response format');
        }
      }),
      catchError(error => {
        if (this.enableDebugLogs) {
          console.error('=== ERRO NO LOGIN ===');
          console.error('HTTP error:', error);
          console.error('Status:', error.status);
          console.error('Message:', error.message);
          console.error('Error details:', error.error);
        }
        return throwError(() => error);
      })
    );
  }

  logout(): void {
    if (this.isBrowser()) {
      // Logout de sessão por cookie (best-effort): não bloqueia o fluxo se a rota não existir.
      this.http.post(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({
        error: () => {
          // ignore
        }
      });

      clearAuthToken();
      localStorage.removeItem(this.SESSION_ACTIVE_KEY);
      localStorage.removeItem(this.LOGIN_TIME_KEY);
      localStorage.removeItem(this.LOGIN_KEY);
      localStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem(this.USER_NAME_KEY);
      localStorage.removeItem(this.SHOP_NAME_KEY);
      localStorage.removeItem(this.EMPRESA_ID_KEY);
    }

    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    if (this.isBrowser()) {
      const sessionFlag = localStorage.getItem(this.SESSION_ACTIVE_KEY);
      if (sessionFlag === '1') return true;

      const authToken = getAuthToken();
      return authToken !== null;
    }
    return false;
  }

  getLogin(): string | null {
    if (this.isBrowser()) {
      return localStorage.getItem(this.LOGIN_KEY);
    }
    return null;
  }

  getUserName(): string {
    // Preferir o NomeUsuario (nome de exibição) ao email/login técnico.
    const stored = this.getStoredUserName();
    if (stored) return stored;

    const fromToken = this.getNomeUsuarioFromToken();
    if (fromToken) return fromToken;

    return this.getLogin() || 'Usuário Desconhecido';
  }

  getShopName(): string {
    const stored = this.getStoredShopName();
    if (stored) return stored;

    const fromToken = this.getShopNameFromToken();
    if (fromToken) return fromToken;

    return 'Barbearia';
  }

  private getStoredShopName(): string {
    if (!this.isBrowser()) return '';
    return (localStorage.getItem(this.SHOP_NAME_KEY) ?? '').toString().trim();
  }

  private getShopNameFromToken(): string {
    if (!this.isBrowser()) return '';
    const token = getAuthToken();
    if (!token) return '';

    const parts = token.split('.');
    if (parts.length !== 3) return '';

    try {
      const json = this.decodeBase64Url(parts[1]);
      const payload = JSON.parse(json);

      const nome = String(
        payload?.nomeBarbearia ??
          payload?.NomeBarbearia ??
          payload?.barbeariaNome ??
          payload?.BarbeariaNome ??
          payload?.empresaNome ??
          payload?.EmpresaNome ??
          payload?.nomeEmpresa ??
          payload?.NomeEmpresa ??
          payload?.nomeFantasia ??
          payload?.NomeFantasia ??
          payload?.tenant ??
          payload?.Tenant ??
          ''
      ).trim();
      return nome;
    } catch {
      return '';
    }
  }

  private getStoredUserName(): string {
    if (!this.isBrowser()) return '';
    return (localStorage.getItem(this.USER_NAME_KEY) ?? '').toString().trim();
  }

  private getNomeUsuarioFromToken(): string {
    if (!this.isBrowser()) return '';
    const token = getAuthToken();
    if (!token) return '';

    const parts = token.split('.');
    if (parts.length !== 3) return '';

    try {
      const json = this.decodeBase64Url(parts[1]);
      const payload = JSON.parse(json);

      const nomeUsuario = String(
        payload?.nomeUsuario ?? payload?.NomeUsuario ?? payload?.name ?? payload?.Name ?? payload?.unique_name ?? payload?.UniqueName ?? ''
      ).trim();
      return nomeUsuario;
    } catch {
      return '';
    }
  }

  getLoginTimeIso(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(this.LOGIN_TIME_KEY);
  }

  getLoginTime(): Date | null {
    const iso = this.getLoginTimeIso();
    if (!iso) return null;

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;

    // Proteção: se por algum motivo o valor salvo estiver no futuro (clock ajustado,
    // timezone inconsistente, valor antigo/seed), evita mostrar um horário impossível.
    const now = new Date();
    const toleranceMs = 60_000; // 1 minuto
    if (d.getTime() > now.getTime() + toleranceMs) {
      return now;
    }
    return d;
  }

  /** Retorna o horário (HH:mm) desde quando o usuário logou. */
  getLoginSinceTimeText(locale: string = 'pt-BR'): string {
    const loginDate = this.getLoginTime();
    if (!loginDate) return 'Não disponível';

    try {
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(loginDate);
    } catch {
      const hh = String(loginDate.getHours()).padStart(2, '0');
      const mm = String(loginDate.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }

  getSessionDuration(): string {
    const loginTime = this.getLoginTimeIso();
    if (loginTime) {
      const loginDate = new Date(loginTime);
      const now = new Date();
      const durationMs = now.getTime() - loginDate.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
    return 'Não disponível';
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  /**
   * Detecta se o usuário é Admin a partir do token (JWT-like) armazenado.
   * Aceita múltiplas variantes para compatibilidade com backends diferentes.
   */
  isAdmin(): boolean {
    const cached = this.getCachedRole();
    if (cached) {
      const v = cached.trim().toLowerCase();
      return v === 'admin' || v === 'gerente' || v === '1';
    }

    const role = this.getRoleFromToken();
    // compat: gerente == admin
    return role === 'admin' || role === 'gerente' || role === '1';
  }

  getCachedRole(): string {
    if (!this.isBrowser()) return '';
    return (localStorage.getItem(this.ROLE_KEY) ?? '').toString();
  }

  setCachedRole(role: string): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(this.ROLE_KEY, role);
  }

  /** Retorna 'admin' | 'funcionario' | outros (lowercase), ou '' se não for possível. */
  private getRoleFromToken(): string {
    if (!this.isBrowser()) return '';
    const token = getAuthToken();
    if (!token) return '';

    const parts = token.split('.');
    if (parts.length !== 3) return '';
    const payloadB64 = parts[1];
    if (!payloadB64) return '';

    try {
      const json = this.decodeBase64Url(payloadB64);
      const payload = JSON.parse(json);

      const role = (payload?.role ?? payload?.Role ?? payload?.nivelAcesso ?? payload?.NivelAcesso ?? payload?.access ?? payload?.Access ?? '').toString();
      return role.trim().toLowerCase();
    } catch {
      return '';
    }
  }

  private decodeBase64Url(input: string): string {
    // Base64URL -> Base64
    let s = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad === 2) s += '==';
    else if (pad === 3) s += '=';
    else if (pad !== 0) s += '='.repeat(4 - pad);
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(s), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }

  private resolveEmpresaId(response: unknown, token: string | null | undefined): number {
    const fromResponse = this.extractEmpresaIdFromAny(response);
    if (fromResponse > 0) return fromResponse;

    const fromToken = this.extractEmpresaIdFromToken(token);
    if (fromToken > 0) return fromToken;

    return 0;
  }

  private extractEmpresaIdFromAny(value: unknown): number {
    const obj: any = value ?? {};
    const candidate =
      obj?.empresaId ??
      obj?.EmpresaId ??
      obj?.idEmpresa ??
      obj?.IdEmpresa ??
      obj?.tenantId ??
      obj?.TenantId ??
      obj?.companyId ??
      obj?.CompanyId ??
      obj?.empresa?.id ??
      obj?.Empresa?.Id;

    const id = Number(candidate ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  private extractEmpresaIdFromToken(token: string | null | undefined): number {
    if (!token) return 0;

    const parts = token.split('.');
    if (parts.length !== 3) return 0;

    try {
      const json = this.decodeBase64Url(parts[1]);
      const payload = JSON.parse(json);
      return this.extractEmpresaIdFromAny(payload);
    } catch {
      return 0;
    }
  }
}
