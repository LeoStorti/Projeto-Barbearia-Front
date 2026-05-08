import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Produto {
Produto: any;
nome: any;
  productId: number;
  nomeProduto: string;
  fornecedor: string;
  quantidade: number;
  valorDeVenda: number;
  valorDeCompra: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProdutosService {
  private apiUrl = '/api/Produtos';

  constructor(private http: HttpClient) {}

  getProdutos(): Observable<Produto[]> {
    return this.http.get<Produto[]>(this.apiUrl);
  }

  // Método para excluir um produto pelo ID
  excluirProduto(id: number): Observable<any> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.delete(url);
  }

  atualizarProduto(produto: Produto): Observable<any> {
    const url = `${this.apiUrl}/${produto.productId}`;
    return this.http.put(url, produto);
  }

  adicionarProduto(produto: Produto): Observable<any> {
    return this.http.post(this.apiUrl, produto);
  }

  getProdutosByFornecedorId(id: number): Observable<Produto[]> {
    return this.http.get<Produto[]>(`${this.apiUrl}/fornecedores/${id}`);
  }
}
