import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { catchError, throwError, Observable, map } from 'rxjs';

export interface Profissional {
  id: number;
  nome: string;
  especialidade: string;
  fotoUrl?: string;
  email?: string;
  telefone?: string;
  especializacao?: string;
  salario?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProfissionaisService {
  private apiUrl = '/api/Profissionais';

  private readonly headers = new HttpHeaders({
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  });

  constructor(private http: HttpClient) { }

  private normalizeFotoUrl(rawUrl: unknown): string | undefined {
    const url = (rawUrl ?? '').toString().trim();
    if (!url) return undefined;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return url;
    return `/${url}`;
  }

  createProfissional(payload: unknown): Observable<unknown> {
    return this.http.post<unknown>(this.apiUrl, payload, {
      headers: this.headers,
    });
  }

  updateProfissional(id: number, payload: unknown): Observable<unknown> {
    return this.http.put<unknown>(`${this.apiUrl}/${id}`, payload, {
      headers: this.headers,
    });
  }

  deleteProfissional(id: number): Observable<unknown> {
    return this.http.delete<unknown>(`${this.apiUrl}/${id}`, {
      headers: this.headers,
    });
  }

  private sendFotoUpload(
    id: number,
    file: File,
    routeTemplate: string,
    method: 'POST' | 'PUT',
    fileField: string,
    extraFields?: Record<string, string>
  ): Observable<unknown> {
    const formData = new FormData();
    formData.append(fileField, file, file.name);
    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        if (!key || value === undefined || value === null) return;
        formData.append(key, value);
      });
    }

    // Não enviar Content-Type manualmente (browser define boundary do multipart)
    const headers = this.headers.delete('Content-Type');
    const url = routeTemplate.replace('{id}', String(id));

    return this.http.request<unknown>(method, url, {
      body: formData,
      headers,
    });
  }

  uploadFotoProfissional(id: number, file: File, metadata?: Record<string, unknown>): Observable<unknown> {
    const normalizedMeta = Object.entries(metadata ?? {}).reduce((acc, [key, value]) => {
      if (value === undefined || value === null) return acc;
      acc[key] = String(value);
      return acc;
    }, {} as Record<string, string>);

    const attempts: Array<{
      routeTemplate: string;
      method: 'POST' | 'PUT';
      fileField: string;
      includeMetadata?: boolean;
    }> = [
      { routeTemplate: `${this.apiUrl}/{id}/foto`, method: 'POST', fileField: 'foto' },
      { routeTemplate: `${this.apiUrl}/{id}/foto`, method: 'POST', fileField: 'file' },
      { routeTemplate: `${this.apiUrl}/{id}/foto`, method: 'PUT', fileField: 'foto' },
      { routeTemplate: `${this.apiUrl}/{id}/upload-foto`, method: 'POST', fileField: 'foto' },
      { routeTemplate: `${this.apiUrl}/upload-foto/{id}`, method: 'POST', fileField: 'foto' },
      { routeTemplate: `${this.apiUrl}/foto/{id}`, method: 'POST', fileField: 'foto' },
      { routeTemplate: `${this.apiUrl}/{id}`, method: 'PUT', fileField: 'foto', includeMetadata: true },
      { routeTemplate: `${this.apiUrl}/{id}`, method: 'PUT', fileField: 'file', includeMetadata: true },
      { routeTemplate: `${this.apiUrl}/{id}`, method: 'PUT', fileField: 'Foto', includeMetadata: true },
    ];

    const tryAttempt = (index: number, lastError?: unknown): Observable<unknown> => {
      if (index >= attempts.length) {
        return throwError(() => lastError ?? new Error('Falha ao enviar foto do profissional.'));
      }

      const current = attempts[index];
      const extraFields = current.includeMetadata ? normalizedMeta : undefined;
      return this.sendFotoUpload(id, file, current.routeTemplate, current.method, current.fileField, extraFields).pipe(
        catchError((error: unknown) => {
          const status = Number((error as any)?.status ?? 0);
          const shouldRetry = [0, 400, 404, 405, 415, 500].includes(status);

          if (!shouldRetry) {
            return throwError(() => error);
          }

          return tryAttempt(index + 1, error);
        })
      );
    };

    return tryAttempt(0);
  }

  getProfissionais(): Observable<Profissional[]> {
    return this.http.get<any>(this.apiUrl, {
      headers: this.headers
    }).pipe(
      map((resp: any) => {
        const list: any[] = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.data)
            ? resp.data
            : Array.isArray(resp?.Data)
              ? resp.Data
              : [];

        return list.map(p => ({
          id: p.ProfissionalId ?? p.profissionalId ?? p.Id ?? p.id,
          nome: p.Nome ?? p.nome,
          especialidade: p.Especializacao ?? p.especializacao ?? p.Especialidade ?? p.especialidade,
          fotoUrl: this.normalizeFotoUrl(p.FotoUrl ?? p.fotoUrl ?? p.AvatarUrl ?? p.avatarUrl ?? p.ImagemUrl ?? p.imagemUrl),
          especializacao: p.Especializacao ?? p.especializacao ?? p.Especialidade ?? p.especialidade,
          email: p.Email ?? p.email,
          telefone: p.Telefone ?? p.telefone,
          salario: Number(p.Salario ?? p.salario ?? 0)
        }));
      }),
      catchError(this.handleError)
    );
  }

  private handleError(error: unknown): Observable<never> {
    console.error('Erro ao carregar profissionais:', error);

    let message = 'Falha ao carregar profissionais';
    const err = error as any;
    const http = err as HttpErrorResponse;
    if (http?.error) {
      message =
        http.error?.Message ??
        http.error?.message ??
        http.error?.Detail ??
        http.error?.detail ??
        http.error?.title ??
        message;
    }
    if (typeof message !== 'string' || !message.trim()) {
      message = 'Falha ao carregar profissionais';
    }
    return throwError(() => new Error(message));
  }
}
