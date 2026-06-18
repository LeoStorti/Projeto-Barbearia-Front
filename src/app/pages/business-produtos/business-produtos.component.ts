import { Component, OnInit, ViewChild, TemplateRef, AfterViewInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ProdutosService } from 'app/services/produtos.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';

// Interface para Produto
interface Produto {
  id?: number;
  ProdutoId?: number;
  nomeProduto?: string;
  NomeProduto?: string;
  descricao?: string;
  Descricao?: string;
  quantidadeEmEstoque?: number;
  QuantidadeEmEstoque?: number;
  precoCompra?: number;
  PrecoCompra?: number;
  precoVenda?: number;
  PrecoVenda?: number;
  categoria?: string;
  Categoria?: string;
  fornecedor?: string;
  Fornecedor?: string;
}

@Component({
  selector: 'app-business-produtos',
  standalone: true,
  imports: [
    MatButtonModule,
    MatTabsModule,
    MatInputModule,
    MatTableModule,
    MatFormFieldModule,
    MatCheckboxModule,
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatTooltipModule,
    MatToolbarModule,
    MatDialogModule,
    MatSelectModule,
    MatOptionModule,
    MatPaginatorModule
  ],
  templateUrl: './business-produtos.component.html',
  styleUrls: ['./business-produtos.component.css']
})
export class BusinessProdutos implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['produto', 'descricao', 'quantidade', 'precoCompra', 'precoVenda', 'total', 'acoes'];
  dataSourceProdutos = new MatTableDataSource<Produto>();
dataSource: { data: Produto[] } = { data: [] }

  // Controle do modal e formulário do produto
  produtoForm: any = {
    id: 0,
    nomeProduto: '',
    descricao: '',
    quantidadeEmEstoque: 0,
    precoCompra: 0,
    precoVenda: 0,
    categoria: '',
    fornecedor: ''
  };
  produtoEditando: boolean = false;
  dialogRef: any;
  filtroNome: string = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('modalProduto') modalProdutoTemplate!: TemplateRef<any>;

  constructor(
    private produtosService: ProdutosService,
    public dialog: MatDialog
  ) {}

  onProdutosOverflow(hasOverflow: boolean) {
    console.debug('[Produtos] Overflow vertical:', hasOverflow);
  }

  ngOnInit(): void {
    this.carregarProdutos();
  }

  ngAfterViewInit(): void {
    this.dataSourceProdutos.paginator = this.paginator;
    console.log('📋 Paginator configurado:', this.paginator);
    console.log('🎭 Modal template disponível:', !!this.modalProdutoTemplate);
  }

  carregarProdutos(): void {
    console.log('🔄 Carregando produtos...');
    this.produtosService.getProdutos().subscribe(
      (data: any[]) => {
        console.log('✅ Produtos carregados (dados originais):', data);

        // Mapear dados da API para o formato esperado pelo componente
        const produtosMapeados = data.map(item => ({
          id: item.ProdutoId || item.id,
          nomeProduto: item.NomeProduto || item.nomeProduto || 'Produto não informado',
          descricao: item.Descricao || item.descricao || 'Sem descrição',
          quantidadeEmEstoque: item.QuantidadeEmEstoque || item.quantidadeEmEstoque || 0,
          precoCompra: item.PrecoCompra || item.precoCompra || 0,
          precoVenda: item.PrecoVenda || item.precoVenda || 0,
          categoria: item.Categoria || item.categoria || 'Sem categoria',
          fornecedor: item.Fornecedor || item.fornecedor || 'Sem fornecedor'
        }));

        console.log('✅ Produtos mapeados:', produtosMapeados);
        this.dataSourceProdutos.data = produtosMapeados;

        if (this.paginator) {
          this.dataSourceProdutos.paginator = this.paginator;
        }
      },
      (error) => {
        console.error('❌ Erro ao carregar produtos:', error);
      }
    );
  }

  abrirModalProduto(produto?: any): void {
    console.log('🔧 Tentando abrir modal produto...', { produto, template: this.modalProdutoTemplate });

    if (produto) {
      this.produtoForm = { ...produto };
      this.produtoEditando = true;
    } else {
      this.produtoForm = {
        id: 0,
        nomeProduto: '',
        descricao: '',
        quantidadeEmEstoque: 0,
        precoCompra: 0,
        precoVenda: 0,
        categoria: '',
        fornecedor: ''
      };
      this.produtoEditando = false;
    }

    try {
      this.dialogRef = this.dialog.open(this.modalProdutoTemplate, {
        width: '600px',
        disableClose: true,
        panelClass: 'custom-dialog-container'
      });
      console.log('✅ Modal aberto com sucesso!', this.dialogRef);
    } catch (error) {
      console.error('❌ Erro ao abrir modal:', error);
    }
  }

  fecharModalProduto(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  salvarProduto(): void {
    if (this.produtoEditando) {
      // Atualizar produto existente
      console.log('📝 Atualizando produto:', this.produtoForm);
      // Aqui você implementaria a chamada da API para atualizar
      this.carregarProdutos();
      this.fecharModalProduto();
    } else {
      // Adicionar novo produto
      console.log('➕ Adicionando novo produto:', this.produtoForm);
      // Aqui você implementaria a chamada da API para criar
      this.carregarProdutos();
      this.fecharModalProduto();
    }
  }

  excluirProduto(produto: any): void {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
      console.log('🗑️ Excluindo produto:', produto);
      // Aqui você implementaria a chamada da API para excluir
      this.carregarProdutos();
    }
  }

  aplicarFiltroNome(): void {
    this.dataSourceProdutos.filterPredicate = (data: any, filter: string): boolean => {
      const searchTerm = filter.toLowerCase();
      return Boolean(
        (data.nomeProduto && data.nomeProduto.toLowerCase().includes(searchTerm)) ||
        (data.categoria && data.categoria.toLowerCase().includes(searchTerm)) ||
        (data.fornecedor && data.fornecedor.toLowerCase().includes(searchTerm))
      );
    };
    this.dataSourceProdutos.filter = this.filtroNome.trim().toLowerCase();
  }

  // Método para calcular o valor total de cada produto (quantidade * preço de venda)
  calcularTotal(produto: any): number {
    return (produto.quantidadeEmEstoque || 0) * (produto.precoVenda || 0);
  }

  calcularMargemLucro(produto: any): number {
    const precoCompra = produto.precoCompra || 0;
    const precoVenda = produto.precoVenda || 0;
    if (precoCompra === 0) return 0;
    return ((precoVenda - precoCompra) / precoCompra) * 100;
  }

  produtosVisiveisMobile(): Produto[] {
    const source = this.dataSourceProdutos.filteredData ?? this.dataSourceProdutos.data;
    if (!this.paginator) return source;
    const pageSize = Number(this.paginator.pageSize || 10);
    const pageIndex = Number(this.paginator.pageIndex || 0);
    const start = pageIndex * pageSize;
    return source.slice(start, start + pageSize);
  }

  trackByProdutoId(_index: number, produto: Produto): number {
    return Number(produto?.id ?? produto?.ProdutoId ?? 0);
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
}
