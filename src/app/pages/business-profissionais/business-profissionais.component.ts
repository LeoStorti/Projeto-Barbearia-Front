import { Component, OnInit, ViewChild, TemplateRef, AfterViewInit, ViewEncapsulation } from '@angular/core';
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
import { ProfissionaisService } from 'app/services/profissionais.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';

// Interface para Profissional
interface Profissional {
  id?: number;
  ProfissionalId?: number;
  nome?: string;
  Nome?: string;
  especializacao?: string;
  Especializacao?: string;
  fotoUrl?: string;
  FotoUrl?: string;
  telefone?: string;
  Telefone?: string;
  email?: string;
  Email?: string;
  aniversario?: string;
  Aniversario?: string;
  salario?: number;
  Salario?: number;
  dataContratacao?: string;
  DataContratacao?: string;
  ativo?: boolean;
  Ativo?: boolean;
}

@Component({
  selector: 'app-business-profissionais',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
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
    MatNativeDateModule,
    MatDatepickerModule,
    MatPaginatorModule
  ],
  templateUrl: './business-profissionais.component.html',
  styleUrls: ['./business-profissionais.component.css']
})
export class BusinessProfissionais implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['profissional', 'especializacao', 'contato', 'salario', 'status', 'acoes'];
  dataSourceProfissionais = new MatTableDataSource<Profissional>();
  dataSource: MatTableDataSource<Profissional> = new MatTableDataSource<Profissional>([]);
  // Controle do modal e formulário do profissional
  profissionalForm: any = {
    id: 0,
    nome: '',
    especializacao: '',
    telefone: '',
    email: '',
    fotoUrl: '',
    aniversario: '',
    salario: 0,
    dataContratacao: '',
    ativo: true
  };
  profissionalEditando: boolean = false;
  dialogRef: any;
  filtroNome: string = '';
  fotoSelecionada: File | null = null;
  fotoSelecionadaNome: string = '';

  private readonly fotoFalhou = new Set<number>();
  private fotoCacheToken = Date.now();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('modalProfissional') modalProfissionalTemplate!: TemplateRef<any>;

  constructor(
    private profissionaisService: ProfissionaisService,
    public dialog: MatDialog
  ) {}

  onProfissionaisOverflow(hasOverflow: boolean) {
    console.debug('[Profissionais] Overflow vertical:', hasOverflow);
  }

  ngOnInit(): void {
    this.carregarProfissionais();
  }

  ngAfterViewInit(): void {
    this.dataSourceProfissionais.paginator = this.paginator;
    console.log('📋 Paginator configurado:', this.paginator);
    console.log('🎭 Modal template disponível:', !!this.modalProfissionalTemplate);
  }

  carregarProfissionais(): void {
    console.log('🔄 Carregando profissionais...');
    this.profissionaisService.getProfissionais().subscribe(
      (data: any[]) => {
        console.log('✅ Profissionais carregados (dados originais):', data);

        // Mapear dados da API para o formato esperado pelo componente
        const profissionaisMapeados = data.map(item => ({
          id: item.ProfissionalId || item.id,
          nome: item.Nome || item.nome || 'Nome não informado',
          especializacao: item.Especializacao || item.especializacao || 'Não especificado',
          fotoUrl: item.FotoUrl || item.fotoUrl || '',
          telefone: item.Telefone || item.telefone || 'Não informado',
          email: item.Email || item.email || 'Não informado',
          aniversario: item.Aniversario || item.aniversario || '',
          salario: item.Salario || item.salario || 0,
          dataContratacao: item.DataContratacao || item.dataContratacao || new Date().toISOString(),
          ativo: item.Ativo !== undefined ? item.Ativo : (item.ativo !== undefined ? item.ativo : true)
        }));

        console.log('✅ Profissionais mapeados:', profissionaisMapeados);
        this.dataSourceProfissionais.data = profissionaisMapeados;

        // Atualiza token para evitar cache quando houver upload recente.
        this.fotoCacheToken = Date.now();
        this.fotoFalhou.clear();

        if (this.paginator) {
          this.dataSourceProfissionais.paginator = this.paginator;
        }
      },
      (error) => {
        console.error('❌ Erro ao carregar profissionais:', error);
      }
    );
  }

  private getProfId(p: any): number {
    return Number(p?.id ?? p?.ProfissionalId ?? 0);
  }

  getInitial(nome?: string): string {
    const text = (nome ?? '').trim();
    return (text ? text.charAt(0) : '?').toUpperCase();
  }

  fotoDisponivel(p: any): boolean {
    const id = this.getProfId(p);
    const url = (p?.fotoUrl ?? p?.FotoUrl ?? '').toString().trim();
    if (!url) return false;
    if (!id) return true;
    return !this.fotoFalhou.has(id);
  }

  getFotoSrc(rawUrl?: string | null): string {
    const url = (rawUrl ?? '').toString().trim();
    if (!url) return '';

    // Normaliza URLs relativas vindas da API.
    const normalized = /^https?:\/\//i.test(url)
      ? url
      : url.startsWith('/')
        ? url
        : `/${url}`;

    // Cache-buster para evitar exibir arquivo antigo/truncado em cache.
    const join = normalized.includes('?') ? '&' : '?';
    return `${normalized}${join}v=${this.fotoCacheToken}`;
  }

  onFotoError(p: any): void {
    const id = this.getProfId(p);
    if (id) {
      this.fotoFalhou.add(id);
    }
  }

  abrirModalProfissional(profissional?: any): void {
    console.log('🔧 Tentando abrir modal profissional...', { profissional, template: this.modalProfissionalTemplate });

    if (profissional) {
      this.profissionalForm = { ...profissional };
      this.profissionalEditando = true;
    } else {
      this.profissionalForm = {
        id: 0,
        nome: '',
        especializacao: '',
        telefone: '',
        email: '',
        fotoUrl: '',
        aniversario: '',
        salario: 0,
        dataContratacao: new Date().toISOString().split('T')[0],
        ativo: true
      };
      this.profissionalEditando = false;
    }

    this.fotoSelecionada = null;
    this.fotoSelecionadaNome = '';

    try {
      this.dialogRef = this.dialog.open(this.modalProfissionalTemplate, {
        width: '600px',
        disableClose: true,
        panelClass: 'custom-dialog-container'
      });
      console.log('✅ Modal aberto com sucesso!', this.dialogRef);
    } catch (error) {
      console.error('❌ Erro ao abrir modal:', error);
    }
  }

  onFotoSelecionada(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0] ?? null;
    this.fotoSelecionada = file;
    this.fotoSelecionadaNome = file?.name ?? '';

    if (file) {
      alert('Upload de arquivo nao suportado por esta API no momento. Informe a URL da foto no campo "URL da Foto".');
    }
  }

  fecharModalProfissional(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  salvarProfissional(): void {
    const empresaId = Number(localStorage.getItem('empresa_id') || 0);
    if (!empresaId || empresaId <= 0) {
      alert('Cadastre/seleciona uma empresa antes de salvar um profissional.');
      return;
    }

    const payload = {
      profissionalId: Number(this.profissionalForm?.id ?? this.profissionalForm?.ProfissionalId ?? 0),
      nome: (this.profissionalForm?.nome ?? '').trim(),
      especializacao: (this.profissionalForm?.especializacao ?? '').trim(),
      telefone: (this.profissionalForm?.telefone ?? '').trim(),
      email: (this.profissionalForm?.email ?? '').trim(),
      salario: Number(this.profissionalForm?.salario ?? 0),
      empresaId,
      fotoUrl: (this.profissionalForm?.fotoUrl ?? '').trim() || null,
    };

    if (this.profissionalEditando) {
      const id = Number(payload.profissionalId);
      if (!id) {
        alert('ID do profissional inválido para edição.');
        return;
      }
      console.log('📝 Atualizando profissional:', payload);
      this.profissionaisService.updateProfissional(id, payload).subscribe({
        next: () => {
          this.carregarProfissionais();
          this.fecharModalProfissional();
        },
        error: (error) => {
          console.error('❌ Erro ao atualizar profissional:', error);
          alert('Erro ao atualizar profissional.');
        }
      });
      return;
    }

    console.log('➕ Adicionando novo profissional:', payload);
    this.profissionaisService.createProfissional(payload).subscribe({
      next: (created: any) => {
        this.carregarProfissionais();
        this.fecharModalProfissional();
      },
      error: (error) => {
        console.error('❌ Erro ao criar profissional:', error);
        alert('Erro ao criar profissional.');
      }
    });
  }

  alternarStatus(profissional: any): void {
    const novoStatus = !profissional.ativo;
    const acao = novoStatus ? 'ativar' : 'desativar';

    if (confirm(`Tem certeza que deseja ${acao} este profissional?`)) {
      console.log(`🔄 ${acao} profissional:`, profissional);
      profissional.ativo = novoStatus;
      // Aqui você implementaria a chamada da API para atualizar o status
      this.carregarProfissionais();
    }
  }

  excluirProfissional(profissional: any): void {
    if (confirm('Tem certeza que deseja excluir este profissional?')) {
      console.log('🗑️ Excluindo profissional:', profissional);
      const id = Number(profissional?.id ?? profissional?.ProfissionalId ?? 0);
      if (!id) {
        alert('ID do profissional inválido.');
        return;
      }
      this.profissionaisService.deleteProfissional(id).subscribe({
        next: () => this.carregarProfissionais(),
        error: (error) => {
          console.error('❌ Erro ao excluir profissional:', error);
          alert('Erro ao excluir profissional.');
        }
      });
    }
  }

  aplicarFiltroNome(): void {
    this.dataSourceProfissionais.filterPredicate = (data: any, filter: string): boolean => {
      const searchTerm = filter.toLowerCase();
      return Boolean(
        (data.nome && data.nome.toLowerCase().includes(searchTerm)) ||
        (data.especializacao && data.especializacao.toLowerCase().includes(searchTerm)) ||
        (data.telefone && data.telefone.toLowerCase().includes(searchTerm)) ||
        (data.email && data.email.toLowerCase().includes(searchTerm))
      );
    };
    this.dataSourceProfissionais.filter = this.filtroNome.trim().toLowerCase();
  }

  calcularTempoServico(dataContratacao: string): string {
    if (!dataContratacao) return 'N/A';

    const contratacao = new Date(dataContratacao);
    const hoje = new Date();
    const anos = hoje.getFullYear() - contratacao.getFullYear();
    const meses = hoje.getMonth() - contratacao.getMonth();

    if (anos > 0) {
      return `${anos} ano${anos > 1 ? 's' : ''}`;
    } else if (meses > 0) {
      return `${meses} ${meses > 1 ? 'meses' : 'mês'}`;
    } else {
      return 'Menos de 1 mês';
    }
  }

  formatarAniversario(aniversario: string): string {
    if (!aniversario) return 'Não informado';
    const data = new Date(aniversario);
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
}
