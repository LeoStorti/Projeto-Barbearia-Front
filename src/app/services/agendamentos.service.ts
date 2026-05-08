import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError, map } from 'rxjs';
import { getAuthToken } from './auth-token.util';

export interface Agendamento {
  id: number;
  horario: string;
  profissionalId: number;
  cliente: string;
  servico: string;
  status: string;
}

interface ApiResponse<T> {
  Success: boolean;
  Data: T;
  Message: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AgendamentosService {
  private readonly apiUrl = '/api/Agendamentos'; // Usar URL relativa para proxy

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    });

    // Adicionar token de autorização se disponível
    const token = getAuthToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    } else {
      console.warn('[AgendamentosService] ⚠️ Nenhum token de autenticação encontrado!');
    }

    return headers;
  }

  // Função para testar diferentes formatos de data
  testarFormatosData(dataBase: string): Observable<any> {
    console.log('=== TESTANDO DIFERENTES FORMATOS DE DATA ===');
    console.log('Data base para teste:', dataBase);

    const dataObj = new Date(dataBase);
    const formatos = [
      dataBase, // Formato original YYYY-MM-DD
      dataObj.toISOString(), // ISO completo com horário
      dataObj.toISOString().split('T')[0], // ISO só data YYYY-MM-DD
      `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')}`, // Formato manual YYYY-MM-DD
    ];

    console.log('Formatos a testar (apenas formatos válidos):', formatos);

    return new Observable(observer => {
      let testesCompletos = 0;

      formatos.forEach((formato, index) => {
        let params = new HttpParams().set('data', formato);
        const fullUrl = `${this.apiUrl}?${params.toString()}`;
        console.log(`Teste ${index + 1}: ${formato} -> ${fullUrl}`);

        this.http.get<ApiResponse<Agendamento[]>>(this.apiUrl, {
          headers: this.getHeaders(),
          params
        }).subscribe({
          next: (response) => {
            console.log(`Formato ${formato} - Resposta:`, response);
            if (response.Success && response.Data && response.Data.length > 0) {
              console.log(`✅ FORMATO FUNCIONOU: ${formato} retornou ${response.Data.length} agendamentos`);
              observer.next({ formato, dados: response.Data });
            } else {
              console.log(`⚪ Formato ${formato} - Sem dados (mas sem erro)`);
            }

            testesCompletos++;
            if (testesCompletos === formatos.length) {
              observer.complete();
            }
          },
          error: (error) => {
            console.log(`❌ Formato ${formato} falhou:`, error.status, error.message);

            testesCompletos++;
            if (testesCompletos === formatos.length) {
              observer.complete();
            }
          }
        });
      });
    });
  }  // Função para buscar todos os agendamentos (sem filtro de data)
  getTodos(): Observable<Agendamento[]> {
    console.log('[AgendamentosService] Buscando TODOS os agendamentos...');

    return this.http.get(this.apiUrl, {
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      map(responseText => {
        console.log('[AgendamentosService] === RESPOSTA TODOS COMO TEXTO ===');
        console.log('[AgendamentosService] Resposta em texto:', responseText);
        console.log('[AgendamentosService] Tamanho da resposta:', responseText.length);

        try {
          const response = JSON.parse(responseText);
          console.log('[AgendamentosService] === RESPOSTA TODOS APÓS PARSE ===');
          console.log('[AgendamentosService] Resposta parseada:', response);

          // Verificar se é um array direto
          if (Array.isArray(response)) {
            console.log('[AgendamentosService] ✅ TODOS: Array direto com', response.length, 'itens');
            return response;
          }

          // Verificar formato ApiResponse
          if (response && typeof response === 'object') {
            if (response.Success && Array.isArray(response.Data)) {
              console.log('[AgendamentosService] ✅ TODOS: ApiResponse válido:', response.Data.length, 'agendamentos');
              if (response.Data.length > 0) {
                console.log('[AgendamentosService] Exemplo do primeiro agendamento:', response.Data[0]);
              }
              return response.Data;
            } else if (response.Data && Array.isArray(response.Data)) {
              console.log('[AgendamentosService] ⚠️ TODOS: ApiResponse sem Success:', response.Data.length, 'agendamentos');
              return response.Data;
            } else if (Array.isArray(response.data)) {
              console.log('[AgendamentosService] ✅ TODOS: data minúsculo:', response.data.length, 'agendamentos');
              return response.data;
            }
          }

          console.warn('[AgendamentosService] ❌ TODOS: Resposta inválida:', response);
          return [];

        } catch (parseError) {
          console.error('[AgendamentosService] ❌ TODOS: ERRO AO FAZER PARSE:', parseError);
          console.error('[AgendamentosService] Texto que causou erro:', responseText);
          return [];
        }
      }),
      catchError(error => {
        console.error('[AgendamentosService] === ERRO DETALHADO TODOS ===');
        console.error('[AgendamentosService] Status:', error.status);
        console.error('[AgendamentosService] StatusText:', error.statusText);
        console.error('[AgendamentosService] URL:', error.url);
        console.error('[AgendamentosService] Erro completo:', error);
        return throwError(() => new Error('Erro ao buscar todos os agendamentos.'));
      })
    );
  }

  getPorData(data: string, profissionalId?: number): Observable<Agendamento[]> {
    console.log('[AgendamentosService] Buscando agendamentos para data:', data);

    // Tentar diferentes formatos de data para garantir compatibilidade
    const dataFormatada = this.formatarDataParaAPI(data);
    console.log('[AgendamentosService] Data formatada para API:', dataFormatada);

    let params = new HttpParams().set('data', dataFormatada);
    if (profissionalId !== null && profissionalId !== undefined) {
      params = params.set('profissionalId', profissionalId.toString());
      console.log('[AgendamentosService] Profissional ID adicionado:', profissionalId);
    }

    const fullUrl = `${this.apiUrl}?${params.toString()}`;
    console.log('[AgendamentosService] URL completa da requisição:', fullUrl);

    // Primeiro vamos tentar como texto para debugar o formato da resposta
    return this.http.get(this.apiUrl, {
      headers: this.getHeaders(),
      params,
      responseType: 'text'
    }).pipe(
      map(responseText => {
        console.log('[AgendamentosService] === RESPOSTA COMO TEXTO ===');
        console.log('[AgendamentosService] Resposta em texto:', responseText);
        console.log('[AgendamentosService] Tamanho da resposta:', responseText.length);

        try {
          // Tentar fazer parse manual do JSON
          const response = JSON.parse(responseText);
          console.log('[AgendamentosService] === RESPOSTA APÓS PARSE JSON ===');
          console.log('[AgendamentosService] Tipo da resposta:', typeof response);
          console.log('[AgendamentosService] É array?', Array.isArray(response));
          console.log('[AgendamentosService] Resposta parseada:', response);
          console.log('[AgendamentosService] Chaves da resposta:', Object.keys(response || {}));

          // Verificar se é um array direto (sem wrapper ApiResponse)
          if (Array.isArray(response)) {
            console.log('[AgendamentosService] ✅ Resposta é array direto com', response.length, 'itens');
            return response;
          }

          // Verificar se tem o formato ApiResponse
          if (response && typeof response === 'object') {
            if (response.Success && Array.isArray(response.Data)) {
              console.log('[AgendamentosService] ✅ Formato ApiResponse válido:', response.Data.length, 'agendamentos');
              return response.Data;
            } else if (response.Data && Array.isArray(response.Data)) {
              console.log('[AgendamentosService] ⚠️ Formato ApiResponse sem Success, mas com Data:', response.Data.length, 'agendamentos');
              return response.Data;
            } else if (Array.isArray(response.data)) {
              console.log('[AgendamentosService] ✅ Formato com "data" minúsculo:', response.data.length, 'agendamentos');
              return response.data;
            }
          }

          console.warn('[AgendamentosService] ❌ Resposta inválida ou sem dados:', response);
          return [];

        } catch (parseError) {
          console.error('[AgendamentosService] ❌ ERRO AO FAZER PARSE DO JSON:', parseError);
          console.error('[AgendamentosService] Texto da resposta que causou erro:', responseText);

          // Se não conseguir fazer parse, retornar array vazio
          return [];
        }
      }),
      catchError(error => {
        console.error('[AgendamentosService] === ERRO DETALHADO ===');
        console.error('[AgendamentosService] Status:', error.status);
        console.error('[AgendamentosService] StatusText:', error.statusText);
        console.error('[AgendamentosService] URL:', error.url);
        console.error('[AgendamentosService] Headers:', error.headers);
        console.error('[AgendamentosService] Body/Response:', error.error);
        console.error('[AgendamentosService] OK:', error.ok);
        console.error('[AgendamentosService] Erro completo:', error);

        // Se o status é 200, mas chegou no catchError, pode ser um problema de parsing
        if (error.status === 200) {
          console.error('[AgendamentosService] ⚠️ ATENÇÃO: Status 200 mas erro de parsing! Verificar formato da resposta.');
        }

        return throwError(() => new Error('Erro ao buscar agendamentos.'));
      })
    );
  }

  private formatarDataParaAPI(data: string): string {
    try {
      // Se a data já está no formato correto YYYY-MM-DD, usar ela
      if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        console.log('[AgendamentosService] Data já no formato YYYY-MM-DD:', data);
        return data;
      }

      // Tentar criar o objeto Date e formatar corretamente
      const dataObj = new Date(data);

      // Verificar se a data é válida
      if (isNaN(dataObj.getTime())) {
        console.warn('[AgendamentosService] Data inválida, usando formato original:', data);
        return data;
      }

      // Formatar para YYYY-MM-DD (sem conversão de timezone)
      const ano = dataObj.getFullYear();
      const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
      const dia = String(dataObj.getDate()).padStart(2, '0');

      const dataFormatada = `${ano}-${mes}-${dia}`;
      console.log('[AgendamentosService] Data convertida:', data, '->', dataFormatada);

      return dataFormatada;
    } catch (error) {
      console.error('[AgendamentosService] Erro ao formatar data:', error);
      return data; // Retornar original em caso de erro
    }
  }
}
