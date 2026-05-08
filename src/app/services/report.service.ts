import { Injectable, Inject, PLATFORM_ID, Optional, DOCUMENT } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';

export interface ReportData {
  title: string;
  subtitle?: string;
  period: string;
  data: any[];
  summary?: any;
  additionalSections?: AdditionalSection[];
}

export interface AdditionalSection {
  title: string;
  data: any[];
}

export interface ProfissionalPerformance {
  nome: string;
  totalServicos: number;
  faturamentoTotal: number;
  ticketMedio: number;
  participacaoFaturamento: number;
  clienteFavorito?: string;
  servicoMaisExecutado?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    @Optional() @Inject(DOCUMENT) private document: Document | null,
    @Optional() private authService: AuthService | null
  ) {}

  // Gerar relatório em HTML para impressão/PDF
  generateHTMLReport(reportData: ReportData): void {
    if (!isPlatformBrowser(this.platformId) || !this.document) {
      return;
    }
    const htmlContent = this.createHTMLReport(reportData);
    const printWindow = window.open('', '_blank');

    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Aguardar o carregamento e imprimir
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    } else {
      // Fallback para ambientes com bloqueio de pop-up: imprimir via iframe oculto
      const iframe = this.document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';

      this.document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        this.document.body.removeChild(iframe);
        return;
      }

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          // Remoção best-effort após disparar o print
          setTimeout(() => {
            try {
              this.document?.body.removeChild(iframe);
            } catch {
              // ignore
            }
          }, 500);
        }
      }, 250);
    }
  }

  // Gerar CSV para download
  generateCSVReport(data: any[], filename: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (!data || data.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Escapar aspas e vírgulas
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    this.downloadFile(csvContent, filename + '.csv', 'text/csv');
  }

  // Gerar relatório de faturamento
  generateFaturamentoReport(startDate: Date, endDate: Date, data: any[]): void {
    const reportData: ReportData = {
      title: 'Relatório de Faturamento',
      subtitle: 'Análise detalhada do faturamento por período',
      period: `${this.formatDate(startDate)} a ${this.formatDate(endDate)}`,
      data: data.map(item => ({
        Data: this.formatDate(new Date(item.data)),
        Cliente: item.clienteNome,
        Serviço: item.servicoNome,
        Profissional: item.profissionalNome,
        Valor: this.formatCurrency(item.valor),
        Status: item.status
      })),
      summary: this.calculateSummary(data)
    };

    this.generateHTMLReport(reportData);
  }

  // Gerar relatório de clientes
  generateClientesReport(data: any[]): void {
    const reportData: ReportData = {
      title: 'Relatório de Clientes',
      subtitle: 'Lista completa de clientes cadastrados',
      period: `Gerado em ${this.formatDate(new Date())}`,
      data: data.map(cliente => ({
        Nome: cliente.nome,
        Email: cliente.email,
        Telefone: cliente.telefone,
        'Data Cadastro': this.formatDate(new Date(cliente.dataCadastro)),
        'Última Visita': cliente.ultimaVisita ? this.formatDate(new Date(cliente.ultimaVisita)) : 'Nunca'
      }))
    };

    this.generateHTMLReport(reportData);
  }

  // Gerar relatório de agendamentos
  generateAgendamentosReport(startDate: Date, endDate: Date, data: any[]): void {
    const reportData: ReportData = {
      title: 'Relatório de Agendamentos',
      subtitle: 'Histórico de agendamentos por período',
      period: `${this.formatDate(startDate)} a ${this.formatDate(endDate)}`,
      data: data.map(agendamento => ({
        Data: this.formatDate(new Date(agendamento.data)),
        Horário: agendamento.horario,
        Cliente: agendamento.clienteNome,
        Profissional: agendamento.profissionalNome,
        Serviço: agendamento.servicoNome,
        Status: agendamento.status,
        Valor: this.formatCurrency(agendamento.valor)
      })),
      summary: this.calculateAgendamentosSummary(data)
    };

    this.generateHTMLReport(reportData);
  }

  // Gerar relatório de desempenho dos profissionais
  generatePerformanceProfissionaisReport(startDate: Date, endDate: Date, data: any[]): void {
    const profissionaisPerformance = this.calculateProfissionaisPerformance(data);

    const reportData: ReportData = {
      title: 'Relatório de Desempenho dos Profissionais',
      subtitle: 'Análise de serviços realizados e faturamento por profissional',
      period: `${this.formatDate(startDate)} a ${this.formatDate(endDate)}`,
      data: profissionaisPerformance.map((prof: ProfissionalPerformance) => ({
        Profissional: prof.nome,
        'Serviços Realizados': prof.totalServicos,
        'Faturamento Total': this.formatCurrency(prof.faturamentoTotal),
        'Ticket Médio': this.formatCurrency(prof.ticketMedio),
        'Cliente Favorito': prof.clienteFavorito || 'N/A',
        'Serviço Mais Executado': prof.servicoMaisExecutado || 'N/A'
      })),
      summary: this.calculateProfissionaisSummary(profissionaisPerformance)
    };

    this.generateHTMLReport(reportData);
  }

  // Gerar relatório melhorado de faturamento com dados dos profissionais
  generateFaturamentoComProfissionaisReport(startDate: Date, endDate: Date, data: any[]): void {
    const profissionaisPerformance = this.calculateProfissionaisPerformance(data);

    const reportData: ReportData = {
      title: 'Relatório de Faturamento Detalhado',
      subtitle: 'Análise de faturamento com desempenho dos profissionais',
      period: `${this.formatDate(startDate)} a ${this.formatDate(endDate)}`,
      data: data.map(item => ({
        Data: this.formatDate(new Date(item.data)),
        Cliente: item.clienteNome,
        Serviço: item.servicoNome,
        Profissional: item.profissionalNome,
        Valor: this.formatCurrency(item.valor),
        Status: item.status
      })),
      summary: {
        ...this.calculateSummary(data),
        ...this.calculateProfissionaisSummary(profissionaisPerformance)
      },
      additionalSections: [{
        title: 'Desempenho dos Profissionais',
        data: profissionaisPerformance.map((prof: ProfissionalPerformance) => ({
          Profissional: prof.nome,
          'Serviços': prof.totalServicos,
          'Faturamento': this.formatCurrency(prof.faturamentoTotal),
          'Participação': prof.participacaoFaturamento + '%'
        }))
      }]
    };

    this.generateHTMLReport(reportData);
  }

  private createHTMLReport(reportData: ReportData): string {
    const companyName = this.getCompanyName();
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportData.title}</title>
        <style>
          ${this.getReportStyles()}
        </style>
      </head>
      <body>
        <div class="report-container">
          ${this.createHeader(companyName)}
          ${this.createReportTitle(reportData)}
          ${reportData.summary ? this.createSummary(reportData.summary) : ''}
          ${this.createDataTable(reportData.data)}
          ${reportData.additionalSections ? this.createAdditionalSections(reportData.additionalSections) : ''}
          ${this.createFooter(companyName)}
        </div>
      </body>
      </html>
    `;
  }

  private getReportStyles(): string {
    const primary = this.readCssVar('--primary-color', '#d6ff00');
    const primaryDark = this.readCssVar('--primary-color-dark', '#b7d900');
    return `
      :root {
        --report-primary: ${primary};
        --report-primary-dark: ${primaryDark};
        --report-text: #0b0f0d;
        --report-muted: #475569;
        --report-border: #e5e7eb;
        --report-surface: #f8fafc;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        color: var(--report-text);
        background: white;
      }

      .report-container {
        max-width: 210mm;
        margin: 0 auto;
        padding: 20mm;
        background: white;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid var(--report-primary);
      }

      .logo {
        background: var(--report-primary);
        color: var(--report-text);
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 18px;
        font-weight: bold;
      }

      .company-info {
        text-align: right;
        color: var(--report-muted);
      }

      .company-info h3 {
        color: var(--report-text);
        margin-bottom: 5px;
      }

      .report-title {
        text-align: center;
        margin-bottom: 30px;
      }

      .report-title h1 {
        color: var(--report-text);
        font-size: 24px;
        margin-bottom: 8px;
      }

      .report-title .subtitle {
        color: var(--report-muted);
        font-size: 14px;
        margin-bottom: 5px;
      }

      .report-title .period {
        color: #64748b;
        font-size: 12px;
      }

      .summary {
        background: var(--report-surface);
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 30px;
        border-left: 4px solid var(--report-primary);
      }

      .summary h3 {
        color: var(--report-text);
        margin-bottom: 15px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
      }

      .summary-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--report-border);
      }

      .summary-item:last-child {
        border-bottom: none;
      }

      .summary-label {
        font-weight: 600;
        color: #334155;
      }

      .summary-value {
        font-weight: bold;
        color: var(--report-text);
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
        font-size: 11px;
      }

      .data-table th {
        background: var(--report-primary);
        color: var(--report-text);
        padding: 12px 8px;
        text-align: left;
        font-weight: 600;
        border: 1px solid var(--report-primary-dark);
      }

      .data-table td {
        padding: 10px 8px;
        border: 1px solid var(--report-border);
      }

      .data-table tbody tr:nth-child(even) {
        background: var(--report-surface);
      }

      .data-table tbody tr:hover {
        background: color-mix(in srgb, var(--report-primary) 10%, white);
      }

      .footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid var(--report-border);
        color: var(--report-muted);
        font-size: 10px;
      }

      .section-title {
        margin: 30px 0 15px;
        font-size: 18px;
        color: var(--report-text);
        border-bottom: 2px solid var(--report-primary);
        padding-bottom: 6px;
      }

      @media print {
        body {
          font-size: 11px;
        }

        .report-container {
          margin: 0;
          padding: 15mm;
        }

        .data-table {
          font-size: 9px;
        }

        .data-table th,
        .data-table td {
          padding: 6px 4px;
        }
      }
    `;
  }

  private getCompanyName(): string {
    try {
      const name = this.authService?.getShopName?.() ?? '';
      return name.toString().trim() || 'Barbearia';
    } catch {
      return 'Barbearia';
    }
  }

  private createHeader(companyName: string): string {
    return `
      <div class="header">
        <div class="logo">BARBEARIA</div>
        <div class="company-info">
          <h3>${companyName}</h3>
        </div>
      </div>
    `;
  }

  private readCssVar(name: string, fallback: string): string {
    if (!isPlatformBrowser(this.platformId)) {
      return fallback;
    }

    const doc = this.document ?? (globalThis as any)?.document;
    if (!doc) {
      return fallback;
    }

    try {
      const value = getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch {
      return fallback;
    }
  }

  private createReportTitle(reportData: ReportData): string {
    return `
      <div class="report-title">
        <h1>${reportData.title}</h1>
        ${reportData.subtitle ? `<div class="subtitle">${reportData.subtitle}</div>` : ''}
        <div class="period">${reportData.period}</div>
      </div>
    `;
  }

  private createSummary(summary: any): string {
    const items = Object.entries(summary).map(([key, value]) => `
      <div class="summary-item">
        <span class="summary-label">${this.formatLabel(key)}:</span>
        <span class="summary-value">${this.formatValue(value)}</span>
      </div>
    `).join('');

    return `
      <div class="summary">
        <h3>Resumo Executivo</h3>
        <div class="summary-grid">
          ${items}
        </div>
      </div>
    `;
  }

  private createDataTable(data: any[]): string {
    if (!data || data.length === 0) {
      return '<p>Nenhum dado disponível para exibição.</p>';
    }

    const headers = Object.keys(data[0]);
    const headerRow = headers.map(header => `<th>${header}</th>`).join('');

    const dataRows = data.map(row => {
      const cells = headers.map(header => `<td>${row[header] ?? ''}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `
      <table class="data-table">
        <thead>
          <tr>${headerRow}</tr>
        </thead>
        <tbody>
          ${dataRows}
        </tbody>
      </table>
    `;
  }

  private createAdditionalSections(sections: AdditionalSection[]): string {
    return sections.map(section => `
      <div style="margin-top: 30px;">
        <h3 class="section-title">${section.title}</h3>
        ${this.createDataTable(section.data)}
      </div>
    `).join('');
  }

  private createFooter(companyName: string): string {
    const now = new Date();
    return `
      <div class="footer">
        <p>Relatório gerado em ${this.formatDate(now)} às ${this.formatTime(now)}</p>
        <p>${companyName} - Sistema de Gestão</p>
      </div>
    `;
  }

  private calculateSummary(data: any[]): any {
    const totalFaturamento = data.reduce((sum, item) => sum + (item.valor || 0), 0);
    const totalClientes = new Set(data.map(item => item.clienteId)).size;
    const totalAgendamentos = data.length;
    const ticketMedio = totalAgendamentos > 0 ? totalFaturamento / totalAgendamentos : 0;

    return {
      'Total de Registros': totalAgendamentos,
      'Faturamento Total': totalFaturamento,
      'Clientes Únicos': totalClientes,
      'Ticket Médio': ticketMedio
    };
  }

  private calculateProfissionaisPerformance(data: any[]): ProfissionalPerformance[] {
    const profissionaisMap = new Map<string, any>();
    const totalGeral = data.reduce((sum, item) => sum + (item.valor || 0), 0);

    // Agrupar dados por profissional
    data.forEach(item => {
      const nome = item.profissionalNome || 'Não informado';

      if (!profissionaisMap.has(nome)) {
        profissionaisMap.set(nome, {
          nome,
          servicos: [],
          clientes: new Set(),
          faturamento: 0
        });
      }

      const prof = profissionaisMap.get(nome);
      prof.servicos.push(item.servicoNome);
      prof.clientes.add(item.clienteNome);
      prof.faturamento += item.valor || 0;
    });

    // Calcular métricas para cada profissional
    return Array.from(profissionaisMap.values()).map(prof => {
      const servicosCount = prof.servicos.length;
      const ticketMedio = servicosCount > 0 ? prof.faturamento / servicosCount : 0;
      const participacao = totalGeral > 0 ? ((prof.faturamento / totalGeral) * 100) : 0;

      // Encontrar cliente favorito (mais atendido)
      const clienteCount = new Map();
      data.filter(item => item.profissionalNome === prof.nome)
          .forEach(item => {
            const cliente = item.clienteNome;
            clienteCount.set(cliente, (clienteCount.get(cliente) || 0) + 1);
          });

      const clienteFavorito = clienteCount.size > 0 ?
        [...clienteCount.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined;

      // Encontrar serviço mais executado
      const servicoCount = new Map();
      prof.servicos.forEach((servico: string) => {
        servicoCount.set(servico, (servicoCount.get(servico) || 0) + 1);
      });

      const servicoMaisExecutado = servicoCount.size > 0 ?
        [...servicoCount.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined;

      return {
        nome: prof.nome,
        totalServicos: servicosCount,
        faturamentoTotal: prof.faturamento,
        ticketMedio,
        participacaoFaturamento: Math.round(participacao * 100) / 100,
        clienteFavorito,
        servicoMaisExecutado
      };
    }).sort((a, b) => b.faturamentoTotal - a.faturamentoTotal);
  }

  private calculateProfissionaisSummary(profissionais: ProfissionalPerformance[]): any {
    if (profissionais.length === 0) {
      return {
        'Total de Profissionais': 0,
        'Profissional Top': 'N/A',
        'Maior Faturamento': 'R$ 0,00'
      };
    }

    const topProfissional = profissionais[0];
    const totalServicos = profissionais.reduce((sum, prof) => sum + prof.totalServicos, 0);
    const mediaServicos = Math.round(totalServicos / profissionais.length);

    return {
      'Total de Profissionais': profissionais.length,
      'Profissional Top': topProfissional.nome,
      'Maior Faturamento': this.formatCurrency(topProfissional.faturamentoTotal),
      'Média de Serviços': mediaServicos
    };
  }

  private calculateAgendamentosSummary(data: any[]): any {
    const confirmedAppointments = data.filter(item => item.status === 'Confirmado').length;
    const cancelledAppointments = data.filter(item => item.status === 'Cancelado').length;
    const totalRevenue = data.reduce((sum, item) => sum + (item.valor || 0), 0);

    return {
      'Total de Agendamentos': data.length,
      'Agendamentos Confirmados': confirmedAppointments,
      'Agendamentos Cancelados': cancelledAppointments,
      'Faturamento Total': totalRevenue,
      'Taxa de Confirmação': data.length > 0 ? (confirmedAppointments / data.length * 100).toFixed(1) + '%' : '0%'
    };
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    if (!isPlatformBrowser(this.platformId) || !this.document) {
      return;
    }
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = filename;
    this.document.body.appendChild(a);
    a.click();
    this.document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  private formatLabel(key: string): string {
    // Converter camelCase para texto legível
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  private formatValue(value: any): string {
    if (typeof value === 'number') {
      if (value > 1000) {
        return this.formatCurrency(value);
      }
      return value.toLocaleString('pt-BR');
    }
    return String(value);
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR');
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}
