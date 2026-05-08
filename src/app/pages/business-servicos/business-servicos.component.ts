import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
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
import { HttpClient } from '@angular/common/http';
import { AuthService } from 'app/services/auth.service';
import { MatPaginator } from '@angular/material/paginator';
import { ActivatedRoute, Router } from '@angular/router';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';


// Definindo a interface para os serviços
interface Servico {
  servicoId: number;
  nomeServico: string;
  preco: number;
  descricao: string;
  duracao: number;
  categoria: string;
}

interface ServicoCreatePayload {
  nomeServico: string;
  preco: number;
  descricao: string;
  duracao: number;
  categoria: string;
}

interface ServicoUpdatePayload extends ServicoCreatePayload {
  servicoId: number;
}

@Component({
  selector: 'app-business-servicos',
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
    MatPaginatorModule,
    MatDialogModule,
    MatSelectModule,
    MatOptionModule
  ],
  templateUrl: './business-servicos.component.html',
  styleUrls: ['./business-servicos.component.css']
})
export class BusinessServicos implements OnInit, AfterViewInit  {
  servicos: Servico[] = [];
  displayedColumnsServicos: string[] = ['nomeServico', 'preco', 'categoria', 'duracao', 'descricao', 'acoes'];
  dataSourceServicos = new MatTableDataSource<Servico>();

  // Controle do modal e formulário do serviço
  servicoForm: any = {
    servicoId: 0,
    nomeServico: '',
    preco: 0,
    descricao: '',
    duracao: 0,
    categoria: ''
  };
  servicoEditando: boolean = false;
  dialogRef: any;
  filtroNome: string = '';

  // Propriedade para armazenar o novo serviço
  novoServico: Servico = {
    servicoId: 0,
    nomeServico: '',
    preco: 0,
    descricao: '',
    duracao: 0,
    categoria: ''
  };

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('modalServico') modalServicoTemplate!: TemplateRef<any>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    public dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.carregarServicos();
  }

  ngAfterViewInit(): void {
    this.dataSourceServicos.paginator = this.paginator;
    console.log('📋 Paginator configurado:', this.paginator);
    console.log('🎭 Modal template disponível:', !!this.modalServicoTemplate);
  }

  abrirModalServico(servico?: any): void {
    console.log('🔧 Tentando abrir modal serviço...', { servico, template: this.modalServicoTemplate });

    if (servico) {
      this.servicoForm = { ...servico };
      this.servicoEditando = true;
    } else {
      this.servicoForm = {
        servicoId: 0,
        nomeServico: '',
        preco: 0,
        descricao: '',
        duracao: 0,
        categoria: ''
      };
      this.servicoEditando = false;
    }

    try {
      this.dialogRef = this.dialog.open(this.modalServicoTemplate, {
        width: '500px',
        disableClose: true,
        panelClass: 'custom-dialog-container'
      });
      console.log('✅ Modal aberto com sucesso!', this.dialogRef);
    } catch (error) {
      console.error('❌ Erro ao abrir modal:', error);
    }
  }

  fecharModalServico(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  private getApiErrorMessage(error: any): string {
    const status = error?.status ? `HTTP ${error.status}` : 'HTTP desconhecido';
    const data = error?.error;

    if (typeof data === 'string' && data.trim()) {
      return `${status} - ${data}`;
    }

    if (data?.message) {
      return `${status} - ${data.message}`;
    }

    if (data?.title) {
      return `${status} - ${data.title}`;
    }

    if (data?.errors) {
      const validationMessages = Object.values(data.errors)
        .flat()
        .map((item: any) => String(item));
      if (validationMessages.length) {
        return `${status} - ${validationMessages.join(' | ')}`;
      }
    }

    return `${status} - erro ao processar requisição.`;
  }

  private parsePrecoInput(raw: any): number {
    if (raw === null || raw === undefined) return NaN;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
    const normalized = String(raw)
      .trim()
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  private parseIntInput(raw: any): number {
    if (raw === null || raw === undefined) return NaN;
    const parsed = Number(String(raw).trim().replace(',', '.'));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  }

  private validarServicoForm(payload: ServicoCreatePayload): string | null {
    if (!payload.nomeServico || payload.nomeServico.trim().length < 2) {
      return 'Informe um nome de serviço válido.';
    }
    if (!Number.isFinite(payload.preco) || payload.preco <= 0) {
      return 'Informe um preço válido maior que zero (ex: 39,90).';
    }
    if (!Number.isFinite(payload.duracao) || payload.duracao <= 0) {
      return 'Informe uma duração válida em minutos.';
    }
    if (!payload.categoria || payload.categoria.trim().length < 2) {
      return 'Informe a categoria do serviço.';
    }
    return null;
  }

  salvarServico(): void {
    if (this.servicoEditando) {
      // Atualizar serviço existente
      const updatePayload: ServicoUpdatePayload = {
        servicoId: Number(this.servicoForm.servicoId ?? 0),
        nomeServico: (this.servicoForm.nomeServico ?? '').toString().trim(),
        preco: this.parsePrecoInput(this.servicoForm.preco),
        descricao: (this.servicoForm.descricao ?? '').toString().trim(),
        duracao: this.parseIntInput(this.servicoForm.duracao),
        categoria: (this.servicoForm.categoria ?? '').toString().trim()
      };

      const erroValidacao = this.validarServicoForm(updatePayload);
      if (erroValidacao) {
        alert(`Erro ao atualizar serviço!\n${erroValidacao}`);
        return;
      }

  this.http.put<Servico>(`/api/Servicos/${this.servicoForm.servicoId}`, updatePayload).subscribe(
        (data: Servico) => {
          console.log('✅ Serviço atualizado:', data);
          this.carregarServicos();
          this.fecharModalServico();
        },
        (error: any) => {
          console.error('❌ Erro ao atualizar serviço:', error);
          alert(`Erro ao atualizar serviço!\n${this.getApiErrorMessage(error)}`);
        }
      );
    } else {
      // Adicionar novo serviço
      const createPayload: ServicoCreatePayload = {
        nomeServico: (this.servicoForm.nomeServico ?? '').toString().trim(),
        preco: this.parsePrecoInput(this.servicoForm.preco),
        descricao: (this.servicoForm.descricao ?? '').toString().trim(),
        duracao: this.parseIntInput(this.servicoForm.duracao),
        categoria: (this.servicoForm.categoria ?? '').toString().trim()
      };

      const erroValidacao = this.validarServicoForm(createPayload);
      if (erroValidacao) {
        alert(`Erro ao adicionar serviço!\n${erroValidacao}`);
        return;
      }

  this.http.post<Servico>('/api/Servicos', createPayload).subscribe(
        (data: Servico) => {
          console.log('✅ Serviço criado:', data);
          this.carregarServicos();
          this.fecharModalServico();
        },
        (error: any) => {
          console.error('❌ Erro ao adicionar serviço:', error);
          alert(`Erro ao adicionar serviço!\n${this.getApiErrorMessage(error)}`);
        }
      );
    }
  }

  excluirServico(servico: any): void {
    if (confirm('Tem certeza que deseja excluir este serviço?')) {
  this.http.delete(`/api/Servicos/${servico.servicoId}`).subscribe(
        () => {
          console.log('✅ Serviço excluído com sucesso');
          this.carregarServicos();
        },
        (error: any) => {
          console.error('❌ Erro ao excluir serviço:', error);
          alert(`Erro ao excluir serviço!\n${this.getApiErrorMessage(error)}`);
        }
      );
    }
  }

  aplicarFiltroNome(): void {
    this.dataSourceServicos.filterPredicate = (data: Servico, filter: string): boolean => {
      const searchTerm = filter.toLowerCase();
      return Boolean(
        (data.nomeServico && data.nomeServico.toLowerCase().includes(searchTerm)) ||
        (data.categoria && data.categoria.toLowerCase().includes(searchTerm)) ||
        (data.descricao && data.descricao.toLowerCase().includes(searchTerm))
      );
    };
    this.dataSourceServicos.filter = this.filtroNome.trim().toLowerCase();
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

    carregarServicos(): void {
      console.log('Carregando serviços...');
  this.http.get<Servico[]>(`/api/Servicos`).subscribe(
        (data: Servico[]) => {
          console.log('✅ Serviços carregados:', data);
          console.log('📊 Estrutura do primeiro serviço:', data[0]);
          console.log('🔧 Quantidade de serviços:', data.length);
          this.dataSourceServicos.data = data;
          console.log('🎯 DataSource atualizado:', this.dataSourceServicos.data);

          // Forçar atualização da tabela se necessário
          if (this.paginator) {
            this.dataSourceServicos.paginator = this.paginator;
          }
        },
        (error) => {
          console.error('❌ Erro ao carregar serviços', error);
        }
      );
    }

    enviarNovoServico() {
      // Implementação para enviarNovoServico
    }
}
