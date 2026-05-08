import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, tap, shareReplay, catchError } from 'rxjs/operators';
import { chartPalette, getThemePalette } from '../theme/color-tokens';

interface CacheEntry {
  data: any;
  timestamp: number;
  expiry: number;
}

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5 minutos

  constructor(private http: HttpClient) {}

  get<T>(url: string, cacheTime?: number): Observable<T> {
    const key = this.generateKey(url);
    const cached = this.cache.get(key);
    const now = Date.now();

    // Verificar se existe cache válido
    if (cached && now < cached.expiry) {
      return of(cached.data);
    }

    // Fazer requisição HTTP e cachear resultado
    return this.http.get<T>(url).pipe(
      tap(data => {
        this.cache.set(key, {
          data,
          timestamp: now,
          expiry: now + (cacheTime || this.DEFAULT_CACHE_TIME)
        });
      }),
      catchError(error => {
        // Se houver erro e tiver cache expirado, retornar cache mesmo assim
        if (cached) {
          console.warn('Usando cache expirado devido a erro:', error);
          return of(cached.data);
        }
        throw error;
      }),
      shareReplay(1)
    );
  }

  invalidate(pattern?: string): void {
    if (pattern) {
      // Remove entradas que correspondem ao padrão
      Array.from(this.cache.keys())
        .filter(key => key.includes(pattern))
        .forEach(key => this.cache.delete(key));
    } else {
      // Limpa todo o cache
      this.cache.clear();
    }
  }

  invalidateExpired(): void {
    const now = Date.now();
    Array.from(this.cache.entries())
      .filter(([_, entry]) => now >= entry.expiry)
      .forEach(([key, _]) => this.cache.delete(key));
  }

  getCacheInfo(): { size: number; entries: Array<{ key: string; timestamp: number; expiry: number }> } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        timestamp: entry.timestamp,
        expiry: entry.expiry
      }))
    };
  }

  private generateKey(url: string): string {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
  }
}

@Injectable({
  providedIn: 'root'
})
export class DashboardDataService {
  private readonly API_BASE = '/api';
  private dashboardData$ = new BehaviorSubject<any>(null);

  constructor(private cacheService: CacheService) {}

  getDashboardData(): Observable<any> {
    return this.cacheService.get(`${this.API_BASE}/dashboard`, 2 * 60 * 1000); // Cache por 2 minutos
  }

  getKPIs(): Observable<any[]> {
    // Simular dados reais
    return of([
      {
        title: 'Faturamento Mensal',
        value: 15750,
        percentage: 12,
        icon: 'attach_money',
        color: 'success',
        format: 'currency',
        trend: [12000, 13500, 14200, 15750],
        target: 18000
      },
      {
        title: 'Clientes Atendidos',
        value: 234,
        percentage: 8,
        icon: 'people',
        color: 'primary',
        format: 'number',
        trend: [190, 210, 225, 234],
        target: 250
      },
      {
        title: 'Agendamentos Hoje',
        value: 18,
        percentage: -3,
        icon: 'event',
        color: 'warning',
        format: 'number',
        trend: [22, 20, 19, 18],
        target: 25
      },
      {
        title: 'Produtos Vendidos',
        value: 45,
        percentage: 15,
        icon: 'shopping_cart',
        color: 'success',
        format: 'number',
        trend: [35, 38, 42, 45],
        target: 50
      },
      {
        title: 'Taxa de Conversão',
        value: 78.5,
        percentage: 5,
        icon: 'trending_up',
        color: 'primary',
        format: 'percentage',
        trend: [72, 74, 76, 78.5],
        target: 85
      },
      {
        title: 'Ticket Médio',
        value: 67.30,
        percentage: 3,
        icon: 'receipt',
        color: 'success',
        format: 'currency',
        trend: [62, 64, 65, 67.30],
        target: 75
      }
    ]);
  }

  getFaturamentoMensal(): Observable<any> {
    const palette = getThemePalette();
    return of({
      labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      datasets: [
        {
          label: 'Faturamento 2024',
          data: [12000, 13500, 14200, 15750, 16200, 17800, 16500, 18200, 17900, 19100, 18800, 20200],
          borderColor: palette.primary,
          backgroundColor: palette.primary.startsWith('#') ? `${palette.primary}1A` : 'rgba(214, 255, 0, 0.10)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Meta',
          data: Array(12).fill(18000),
          borderColor: palette.warning,
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          pointRadius: 0
        }
      ]
    });
  }

  getServicosPopulares(): Observable<any> {
    const colors = chartPalette();
    return of({
      labels: ['Corte Masculino', 'Barba', 'Corte + Barba', 'Progressiva', 'Coloração', 'Outros'],
      datasets: [{
        data: [35, 25, 20, 8, 7, 5],
        backgroundColor: [
          colors[0],
          colors[3],
          colors[2],
          colors[1],
          colors[4],
          colors[0].startsWith('#') ? `${colors[0]}80` : colors[0]
        ],
        borderWidth: 0
      }]
    });
  }

  getProfissionaisPerformance(): Observable<any> {
    const palette = getThemePalette();
    return of({
      labels: ['João Silva', 'Maria Santos', 'Pedro Costa', 'Ana Lima', 'Carlos Mendes'],
      datasets: [{
        label: 'Faturamento (R$)',
        data: [4500, 3800, 3200, 2900, 2100],
        backgroundColor: palette.primary,
        borderRadius: 8
      }]
    });
  }

  getAgendamentosRecentes(): Observable<any[]> {
    return of([
      {
        clienteNome: 'João Silva',
        servicoNome: 'Corte Masculino',
        profissionalNome: 'Maria Santos',
        dataHora: new Date(),
        status: 'Confirmado',
        valor: 35.00
      },
      {
        clienteNome: 'Pedro Costa',
        servicoNome: 'Barba',
        profissionalNome: 'João Silva',
        dataHora: new Date(Date.now() - 3600000),
        status: 'Finalizado',
        valor: 25.00
      },
      // Mais dados simulados...
    ]);
  }

  invalidateCache(): void {
    this.cacheService.invalidate('dashboard');
  }
}
