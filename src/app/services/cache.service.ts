import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

interface CacheEntry {
  response: HttpResponse<any>;
  timestamp: number;
}

@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    // Só cachear requests GET
    if (req.method !== 'GET') {
      return next.handle(req);
    }

    // Verificar se existe no cache e ainda é válido
    const cachedEntry = this.cache.get(req.url);
    if (cachedEntry && this.isCacheValid(cachedEntry.timestamp)) {
      console.log('Retornando do cache:', req.url);
      return of(cachedEntry.response);
    }

    // Fazer a requisição e cachear o resultado
    return next.handle(req).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          this.cache.set(req.url, {
            response: event,
            timestamp: Date.now()
          });
        }
      })
    );
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearUrl(url: string): void {
    this.cache.delete(url);
  }
}

// Serviço para gerenciar o cache manualmente
@Injectable({
  providedIn: 'root'
})
export class CacheManager {
  private localCache = new Map<string, any>();

  set(key: string, data: any, ttl: number = 300000): void { // 5 minutos padrão
    const expiry = Date.now() + ttl;
    this.localCache.set(key, { data, expiry });
  }

  get(key: string): any | null {
    const cached = this.localCache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiry) {
      this.localCache.delete(key);
      return null;
    }

    return cached.data;
  }

  delete(key: string): void {
    this.localCache.delete(key);
  }

  clear(): void {
    this.localCache.clear();
  }

  // Cache específico para dashboard
  setDashboardData(data: any): void {
    this.set('dashboard_data', data, 120000); // 2 minutos
  }

  getDashboardData(): any | null {
    return this.get('dashboard_data');
  }

  // Cache para listas
  setListData(type: string, data: any[]): void {
    this.set(`list_${type}`, data, 180000); // 3 minutos
  }

  getListData(type: string): any[] | null {
    return this.get(`list_${type}`);
  }
}
