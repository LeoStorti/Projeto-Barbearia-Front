import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface Clientes {
  ClienteId: number;
  Nome: string;
  Telefone: string;
  Email: string;
  DataNascimento: string | Date;
  Endereco: string;
  Observacoes: string;
  Alergias: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientesService {
  private apiUrl = '/api';

  // Alguns backends/roteadores fazem matching por path com casing.
  // O restante do projeto também usa "/api/Clientes".
  private readonly clientesEndpoint = 'Clientes';

  constructor(private http: HttpClient) {}

  private toApiDateTime(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      const yyyy = value.getFullYear();
      const month = value.getMonth();
      const day = value.getDate();
      // Padroniza em UTC com sufixo Z (como no Swagger) e evita shift.
      return new Date(Date.UTC(yyyy, month, day, 0, 0, 0, 0)).toISOString();
    }

    const str = String(value).trim();
    if (!str) return null;

    // dd/MM/yyyy ou d/M/yyyy
    const br = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str);
    if (br) {
      const dd = br[1].padStart(2, '0');
      const mm = br[2].padStart(2, '0');
      const yyyy = br[3];
      const y = Number(yyyy);
      const m = Number(mm) - 1;
      const d = Number(dd);
      return new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString();
    }

    // yyyy-MM-dd (ou yyyy-MM-ddTHH:mm...)
    const isoDate = /^\d{4}-\d{2}-\d{2}$/.exec(str);
    if (isoDate) {
      const y = Number(str.slice(0, 4));
      const m = Number(str.slice(5, 7)) - 1;
      const d = Number(str.slice(8, 10));
      return new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString();
    }

    // Já veio como ISO com horário
    const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(str);
    if (isoDateTime) {
      // mantém como está (reduz se vier com ms/timezone muito grande)
      return str;
    }

    // Fallback: tentar parsear e reduzir para YYYY-MM-DD
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const month = parsed.getMonth();
      const day = parsed.getDate();
      return new Date(Date.UTC(yyyy, month, day, 0, 0, 0, 0)).toISOString();
    }

    return null;
  }

  private toApiPayload(cliente: Clientes): any {
    return {
      clienteId: Number(cliente?.ClienteId ?? 0),
      nome: String(cliente?.Nome ?? ''),
      telefone: String(cliente?.Telefone ?? ''),
      email: String(cliente?.Email ?? ''),
      dataNascimento: this.toApiDateTime(cliente?.DataNascimento),
      endereco: String(cliente?.Endereco ?? ''),
      observacoes: String(cliente?.Observacoes ?? ''),
      alergias: String(cliente?.Alergias ?? ''),
    };
  }

  private normalizeCliente(raw: any): Clientes {
    const id = Number(raw?.ClienteId ?? raw?.clienteId ?? raw?.id ?? raw?.Id ?? raw?.clienteID ?? raw?.ClienteID ?? 0);
    return {
      ClienteId: Number.isFinite(id) ? id : 0,
      Nome: String(raw?.Nome ?? raw?.nome ?? raw?.nomeCliente ?? raw?.name ?? ''),
      Telefone: String(raw?.Telefone ?? raw?.telefone ?? raw?.phone ?? ''),
      Email: String(raw?.Email ?? raw?.email ?? ''),
      DataNascimento: (raw?.DataNascimento ?? raw?.dataNascimento ?? raw?.nascimento ?? raw?.birthDate ?? ''),
      Endereco: String(raw?.Endereco ?? raw?.endereco ?? raw?.address ?? ''),
      Observacoes: String(raw?.Observacoes ?? raw?.observacoes ?? raw?.observacao ?? raw?.notes ?? ''),
      Alergias: String(raw?.Alergias ?? raw?.alergias ?? raw?.allergies ?? ''),
    };
  }

  // Buscar todos os clientes
  getClientes(): Observable<Clientes[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${this.clientesEndpoint}`).pipe(
      map((list) => (Array.isArray(list) ? list : []).map((c) => this.normalizeCliente(c)))
    );
  }

  // Buscar cliente por ID
  getClienteById(id: number): Observable<Clientes> {
    return this.http.get<any>(`${this.apiUrl}/${this.clientesEndpoint}/${id}`).pipe(
      map((c) => this.normalizeCliente(c))
    );
  }

  // Criar novo cliente
  criarCliente(cliente: Clientes): Observable<Clientes> {
    const payload = this.toApiPayload(cliente);
    console.debug('[ClientesService] POST', `${this.apiUrl}/${this.clientesEndpoint}`, payload);
    return this.http.post<any>(`${this.apiUrl}/${this.clientesEndpoint}`, payload).pipe(
      map((c) => this.normalizeCliente(c))
    );
  }

  // Atualizar cliente existente
  atualizarCliente(id: number, cliente: Clientes): Observable<Clientes> {
    const payload = this.toApiPayload(cliente);
    console.debug('[ClientesService] PUT', `${this.apiUrl}/${this.clientesEndpoint}/${id}`, payload);
    return this.http.put<any>(`${this.apiUrl}/${this.clientesEndpoint}/${id}`, payload).pipe(
      map((c) => this.normalizeCliente(c))
    );
  }

  // Excluir cliente
  excluirCliente(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${this.clientesEndpoint}/${id}`);
  }

  // Método de teste para verificar conectividade
  testarConexao(): Observable<any> {
    console.log('🔍 Testando conexão com:', `${this.apiUrl}/${this.clientesEndpoint}`);
    return this.http.get(`${this.apiUrl}/${this.clientesEndpoint}`);
  }
}
