import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PagamentosService {

  private apiUrl = '/api/Pagamentos'; // URL via proxy

  constructor(private http: HttpClient) { }

  // Método para buscar os dados de pagamentos com salários
  getPagamentos(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }
}
