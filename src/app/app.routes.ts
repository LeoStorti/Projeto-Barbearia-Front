// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { TelaDeLoginComponent } from './pages/tela-de-login/tela-de-login.component';
import { AuthGuard } from './auth.guard'; // Importar o AuthGuard
import { BusinessPerformance } from './pages/business-performance/business-performance.component';
// Removido SchedulerComponent; usar componente existente de agendamentos
import { BusinessAgendamento } from './pages/business-agendamentos/business-agendamentos.component';
import { BusinessClientes } from './pages/business-clientes/business-clientes.component';
import { BusinessRelatorios } from './pages/business-relatorios/business-relatorios.component';
import { BusinessServicos } from './pages/business-servicos/business-servicos.component';
import { BusinessPagamentos } from './pages/business-pagamentos/business-pagamentos.component';
import { BusinessProdutos } from './pages/business-produtos/business-produtos.component';
import { BusinessProfissionais } from './pages/business-profissionais/business-profissionais.component';
import { BusinessUsuarios } from './pages/business-usuarios/business-usuarios.component';
import { PublicAgendarComponent } from './pages/public-agendar/public-agendar.component';
import { FuncionarioRestrictionGuard } from './funcionario-restriction.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: TelaDeLoginComponent },
  { path: 'agendar/:slug', component: PublicAgendarComponent },
  {
    path: 'businessperformance',
    component: BusinessPerformance,
    canActivate: [AuthGuard, FuncionarioRestrictionGuard],
    data: { denyMessage: 'Acesso restrito: Funcionário não pode acessar o Dashboard.' },
  },
  { path: 'businessagendamentos', component: BusinessAgendamento, canActivate: [AuthGuard] },
  {path: 'businessclientes', component: BusinessClientes, canActivate: [AuthGuard] },
  {
    path: 'businessrelatorios',
    component: BusinessRelatorios,
    canActivate: [AuthGuard, FuncionarioRestrictionGuard],
    data: { denyMessage: 'Acesso restrito: Funcionário não pode acessar Relatórios.' },
  },
  {path: 'businessservicos', component: BusinessServicos, canActivate: [AuthGuard] },
  {
    path: 'businesspagamentos',
    component: BusinessPagamentos,
    canActivate: [AuthGuard, FuncionarioRestrictionGuard],
    data: { ssr: false, denyMessage: 'Acesso restrito: Funcionário não pode acessar Pagamentos.' },
  },
  {path: 'businessprodutos', component: BusinessProdutos, canActivate: [AuthGuard] },
  {path: 'businessprofissionais', component: BusinessProfissionais, canActivate: [AuthGuard] },
  {path: 'businessusuarios', component: BusinessUsuarios, canActivate: [AuthGuard] },

  //{path: 'layout-login', component: AppLoginLayoutComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '/login' },
];
