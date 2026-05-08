import { HttpHandlerFn, HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { getAuthToken } from './auth-token.util';

function generateCorrelationId(): string {
  try {
    // Navegadores modernos
    const cryptoAny: any = (globalThis as any).crypto;
    if (cryptoAny?.randomUUID) return cryptoAny.randomUUID();
  } catch {
    // ignore
  }
  // Fallback simples
  return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function decodeBase64Url(input: string): string {
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

function getEmpresaIdFromAny(value: unknown): number {
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
    obj?.Empresa?.Id ??
    obj?.profissional?.empresaId ??
    obj?.profissional?.EmpresaId ??
    obj?.Profissional?.empresaId ??
    obj?.Profissional?.EmpresaId ??
    obj?.cliente?.empresaId ??
    obj?.cliente?.EmpresaId ??
    obj?.Cliente?.empresaId ??
    obj?.Cliente?.EmpresaId ??
    obj?.servico?.empresaId ??
    obj?.servico?.EmpresaId ??
    obj?.Servico?.empresaId ??
    obj?.Servico?.EmpresaId;

  const id = Number(candidate ?? 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function getEmpresaIdFromToken(token: string | null): number {
  if (!token) return 0;
  const parts = token.split('.');
  if (parts.length !== 3) return 0;

  try {
    const json = decodeBase64Url(parts[1]);
    const payload = JSON.parse(json);
    return getEmpresaIdFromAny(payload);
  } catch {
    return 0;
  }
}

function getEmpresaId(token: string | null): number {
  const fromStorage = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('empresa_id') || 0) : 0;
  const fromToken = getEmpresaIdFromToken(token);

  if (fromToken > 0) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('empresa_id', String(fromToken));
      }
    } catch {
      // ignore
    }
    return fromToken;
  }

  return Number.isFinite(fromStorage) && fromStorage > 0 ? fromStorage : 0;
}

function normalizeApiPath(url: string): string {
  if (!url) return '';
  const withoutHost = url.replace(/^https?:\/\/[^/]+/i, '');
  return withoutHost.split('?')[0] || '';
}

function isTenantScopedPath(url: string): boolean {
  const path = normalizeApiPath(url).toLowerCase();
  if (!path.startsWith('/api/') || path.startsWith('/api/public/')) return false;

  const guardedPrefixes = [
    '/api/clientes',
    '/api/profissionais',
    '/api/servicos',
    '/api/usuarios',
    '/api/agendamentos',
    '/api/venda',
    '/api/produtos',
    '/api/salarios',
    '/api/pagamentos',
  ];

  return guardedPrefixes.some((prefix) => path.startsWith(prefix));
}

function filterArrayByEmpresaId(items: any[], empresaId: number): any[] {
  return items.filter((item) => {
    const itemEmpresaId = getEmpresaIdFromAny(item);
    // Se o item não expõe marcador de tenant, não remove no frontend.
    // A separação definitiva deve ocorrer no backend.
    if (itemEmpresaId <= 0) return true;
    return itemEmpresaId === empresaId;
  });
}

function filterBodyByEmpresaId(body: any, empresaId: number, url: string): any {
  if (!isTenantScopedPath(url) || !body) return body;

  if (Array.isArray(body)) {
    return filterArrayByEmpresaId(body, empresaId);
  }

  if (typeof body === 'object') {
    if (Array.isArray(body?.data)) {
      return { ...body, data: filterArrayByEmpresaId(body.data, empresaId) };
    }
    if (Array.isArray(body?.Data)) {
      return { ...body, Data: filterArrayByEmpresaId(body.Data, empresaId) };
    }
  }

  return body;
}

// Functional HTTP interceptor (Angular 16+)
export function authInterceptor(req: HttpRequest<any>, next: HttpHandlerFn) {
  const router = inject(Router);
  try {
    const isApiCall = req.url.startsWith('/api');
    if (!isApiCall) {
      return next(req);
    }

    const isPublicApiCall = req.url.includes('/api/public');

    const token = getAuthToken();
    const empresaId = getEmpresaId(token);

    const correlationId = generateCorrelationId();

    let headers = req.headers
      .set('Accept', 'application/json');

    if (!headers.has('X-Correlation-Id')) {
      headers = headers.set('X-Correlation-Id', correlationId);
    }

    const isFormData = typeof FormData !== 'undefined' && req.body instanceof FormData;

    // Para multipart/form-data (upload), não force Content-Type.
    // O browser precisa definir o boundary automaticamente.
    if (!isFormData && !headers.has('Content-Type') && req.method !== 'GET') {
      headers = headers.set('Content-Type', 'application/json');
    }

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
      // console.debug('[authInterceptor] Authorization header attached');
    }

    if (empresaId > 0) {
      headers = headers.set('X-Empresa-Id', String(empresaId));
    }

    const params = empresaId > 0 && !isPublicApiCall && !req.params.has('empresaId')
      ? req.params.set('empresaId', String(empresaId))
      : req.params;

    const cloned = req.clone({ headers, params, withCredentials: true });
    return next(cloned).pipe(
      map((event) => {
        if (cloned.method !== 'GET' || empresaId <= 0) return event;
        if (!(event instanceof HttpResponse)) return event;

        const filteredBody = filterBodyByEmpresaId(event.body, empresaId, cloned.url);
        if (filteredBody === event.body) return event;
        return event.clone({ body: filteredBody });
      }),
      catchError((error: HttpErrorResponse) => {
        // Anexa o correlationId ao erro para aparecer no UI
        try { (error as any).__correlationId = correlationId; } catch {}

        if (error) {
          // Unauthorized: redirect to login
          if (error.status === 401 && !isPublicApiCall) {
            try { router.navigate(['/login']); } catch {}
          }

          // Angular JSON parse error sometimes surfaces as status 200 with HTML body
          const body = (error.error && typeof error.error === 'string') ? error.error : '';
          if (error.status === 200 && body && /<\s*html|<!doctype/i.test(body) && !isPublicApiCall) {
            console.warn('[authInterceptor] HTML received for an API call; likely not authenticated. Redirecting to /login');
            try { router.navigate(['/login']); } catch {}
          }
        }
        return throwError(() => error);
      })
    );
  } catch (e) {
    // In case anything goes wrong, pass the original request
    return next(req);
  }
}
