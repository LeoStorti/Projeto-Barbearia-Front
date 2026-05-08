import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

export type NivelAcessoUsuario = 'Admin' | 'Funcionario';

export interface UsuarioDto {
  usuarioId: number;
  nomeUsuario: string;
  email: string;
  // Por segurança, idealmente o backend NÃO deveria devolver senha.
  // Mantemos opcional para compatibilidade.
  senha?: string;
  nivelAcesso: NivelAcessoUsuario;
}

export interface CreateUsuarioRequest {
  nomeUsuario: string;
  email: string;
  senha: string;
  nivelAcesso: NivelAcessoUsuario;
}

export interface UpdateUsuarioRequest {
  nomeUsuario?: string;
  email?: string;
  senha?: string;
  nivelAcesso?: NivelAcessoUsuario;
}

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {
  // Controller padrão ASP.NET costuma expor /api/Usuarios (case-insensitive)
  private apiUrl = '/api/Usuarios';

  private readonly headers = new HttpHeaders({
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  });

  constructor(private http: HttpClient) {}

  list(): Observable<UsuarioDto[]> {
    return this.http.get<any[]>(this.apiUrl, { headers: this.headers }).pipe(
      map((data) => (Array.isArray(data) ? data : []).map((raw) => this.normalizeUsuario(raw))),
      catchError(this.handleError('Falha ao carregar usuários'))
    );
  }

  create(payload: CreateUsuarioRequest): Observable<UsuarioDto> {
    const apiPayload: any = {
      NomeUsuario: payload.nomeUsuario,
      Email: payload.email,
      Senha: payload.senha,
      NivelAcesso: this.toApiNivelAcesso(payload.nivelAcesso),
    };

    return this.http.post<any>(this.apiUrl, apiPayload, { headers: this.headers }).pipe(
      map((raw) => this.normalizeUsuario(raw)),
      catchError(this.handleError('Falha ao criar usuário'))
    );
  }

  update(usuarioId: number, payload: UpdateUsuarioRequest): Observable<UsuarioDto> {
    const apiPayload: any = { UsuarioId: usuarioId };

    if (payload.nomeUsuario !== undefined) apiPayload.NomeUsuario = payload.nomeUsuario;
    if (payload.email !== undefined) apiPayload.Email = payload.email;
    if (payload.senha !== undefined) apiPayload.Senha = payload.senha;
    if (payload.nivelAcesso !== undefined) apiPayload.NivelAcesso = this.toApiNivelAcesso(payload.nivelAcesso);

    return this.http.put<any>(`${this.apiUrl}/${usuarioId}`, apiPayload, { headers: this.headers }).pipe(
      map((raw) => this.normalizeUsuario(raw)),
      catchError(this.handleError('Falha ao atualizar usuário'))
    );
  }

  delete(usuarioId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${usuarioId}`, { headers: this.headers }).pipe(
      catchError(this.handleError('Falha ao excluir usuário'))
    );
  }

  private normalizeUsuario(raw: any): UsuarioDto {
    const usuarioId = Number(
      raw?.usuarioId ?? raw?.UsuarioId ?? raw?.id ?? raw?.Id ?? 0
    );

    const nomeUsuario = String(
      raw?.nomeUsuario ?? raw?.NomeUsuario ?? raw?.nome ?? raw?.Nome ?? ''
    );

    const email = String(
      raw?.email ?? raw?.Email ?? ''
    );

    const nivelAcessoRaw = String(raw?.NivelAcesso ?? raw?.nivelAcesso ?? '2').trim();
    const nivelAcesso = this.fromApiNivelAcesso(nivelAcessoRaw);

    // Senha nunca deveria vir da API; se vier, mantemos opcional.
    const senhaVal = raw?.senha ?? raw?.Senha;
    const senha = senhaVal === undefined || senhaVal === null ? undefined : String(senhaVal);

    return {
      usuarioId,
      nomeUsuario,
      email,
      senha,
      nivelAcesso,
    };
  }

  private fromApiNivelAcesso(value: string): NivelAcessoUsuario {
    const v = (value ?? '').trim().toLowerCase();
    // API atual devolve "1" para Admin
    if (v === '1' || v === 'admin') return 'Admin';
    return 'Funcionario';
  }

  private toApiNivelAcesso(value: NivelAcessoUsuario): string {
    return value === 'Admin' ? '1' : '2';
  }

  private handleError(message: string) {
    return (error: HttpErrorResponse) => {
      console.error('[UsuariosService]', message, error);
      return throwError(() => new Error(message));
    };
  }
}
