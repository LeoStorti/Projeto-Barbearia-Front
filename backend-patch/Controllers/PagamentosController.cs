// PATCHED PagamentosController
// Replace your existing PagamentosController with this file or merge the methods.
// Adjust namespaces (APIBarbearia.Controllers) and APIDbContext namespace if necessary.
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using APIBarbearia.Models;
using API.Context;
using System.Text;
using System;

namespace APIBarbearia.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PagamentosController : ControllerBase
    {
        private readonly APIDbContext _context;

        public PagamentosController(APIDbContext context)
        {
            _context = context;
        }

        // Keep your existing endpoints above (GetPagamentos, GetPagamento, Post/Put/Delete) if needed.

        // GET api/Pagamentos/for-month?month=9&year=2025
        [HttpGet("for-month")]
        public async Task<IActionResult> GetForMonth([FromQuery] int month, [FromQuery] int year)
        {
            if (month < 1 || month > 12) return BadRequest("month must be between 1 and 12");
            if (year < 2000 || year > DateTime.UtcNow.Year + 1) return BadRequest("invalid year");

            // Read base sets
            var profs = await _context.Profissionais.AsNoTracking().ToListAsync(); // includes Salario

            // Try to read pre-computed comissoes from the view
            var comissoes = await _context.VwComissoesMensais
                .AsNoTracking()
                .Where(c => c.Ano == year && c.Mes == month)
                .ToListAsync();

            // Read folha de pagamentos (persisted snapshots)
            var folhas = await _context.FolhaPagamentos
                .AsNoTracking()
                .Where(f => f.Ano == year && f.Mes == month)
                .ToListAsync();

            // Compute fallback commissions in bulk from Pagamentos -> Vendas if the view didn't contain rows for some professionals
            var fallback = await ComputeFallbackCommissions(month, year);

            var result = profs.Select(p =>
            {
                var c = comissoes.FirstOrDefault(x => x.ProfissionalId == p.ProfissionalId);
                var f = folhas.FirstOrDefault(x => x.ProfissionalId == p.ProfissionalId);

                decimal salario = p.Salario;
                decimal comissao = c?.ValorComissao ?? 0m;

                // if view has no row, use fallback aggregate when available
                if (c == null && fallback.TryGetValue(p.ProfissionalId, out var fb)) comissao = fb;

                decimal total = salario + comissao;
                bool pago = f?.Pago ?? false;
                DateTime? pagoEm = f?.PagoEm;

                return new
                {
                    ProfissionalId = p.ProfissionalId,
                    Nome = p.Nome,
                    ValorSalario = salario,
                    ValorComissao = comissao,
                    ValorTotal = total,
                    Pago = pago,
                    PagoEm = pagoEm
                };
            }).OrderBy(x => x.Nome).ToList();

            return Ok(result);
        }

        // POST api/Pagamentos/mark-paid
        [HttpPost("mark-paid")]
        public async Task<IActionResult> MarkPaid([FromBody] MarkPaidRequest req)
        {
            if (req == null || req.ProfissionalId <= 0 || req.Mes < 1 || req.Mes > 12) return BadRequest("profissionalId, mes e ano obrigatorios");

            var salario = await _context.Profissionais.Where(p => p.ProfissionalId == req.ProfissionalId).Select(p => p.Salario).FirstOrDefaultAsync();

            // Prefer the view value
            var comissaoFromView = await _context.VwComissoesMensais
                .Where(c => c.ProfissionalId == req.ProfissionalId && c.Ano == req.Ano && c.Mes == req.Mes)
                .Select(c => c.ValorComissao)
                .FirstOrDefaultAsync();

            decimal comissao;
            if (comissaoFromView > 0)
            {
                comissao = comissaoFromView;
            }
            else
            {
                // fallback: aggregate payments for that professional in the month
                var fallback = await ComputeFallbackCommissions(req.Mes, req.Ano);
                fallback.TryGetValue(req.ProfissionalId, out comissao);
            }

            var total = salario + comissao;

            var existing = await _context.FolhaPagamentos.FirstOrDefaultAsync(f => f.ProfissionalId == req.ProfissionalId && f.Ano == req.Ano && f.Mes == req.Mes);
            if (existing != null)
            {
                existing.Pago = true;
                existing.PagoEm = DateTime.UtcNow;
                existing.ValorComissao = comissao;
                existing.ValorSalario = salario;
                existing.ValorTotal = total;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                var novo = new FolhaPagamento
                {
                    ProfissionalId = req.ProfissionalId,
                    Ano = req.Ano,
                    Mes = req.Mes,
                    ValorTotal = total,
                    ValorSalario = salario,
                    ValorComissao = comissao,
                    Pago = true,
                    PagoEm = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };
                _context.FolhaPagamentos.Add(novo);
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, profissionalId = req.ProfissionalId, ano = req.Ano, mes = req.Mes });
        }

        // GET api/Pagamentos/export?month=9&year=2025
        [HttpGet("export")]
        public async Task<IActionResult> Export([FromQuery] int month, [FromQuery] int year)
        {
            if (month < 1 || month > 12) return BadRequest("month must be between 1 and 12");

            var profs = await _context.Profissionais.AsNoTracking().ToListAsync();
            var comissoes = await _context.VwComissoesMensais.AsNoTracking().Where(c => c.Ano == year && c.Mes == month).ToListAsync();
            var folhas = await _context.FolhaPagamentos.AsNoTracking().Where(f => f.Ano == year && f.Mes == month).ToListAsync();
            var fallback = await ComputeFallbackCommissions(month, year);

            var rows = profs.Select(p =>
            {
                var c = comissoes.FirstOrDefault(x => x.ProfissionalId == p.ProfissionalId);
                var f = folhas.FirstOrDefault(x => x.ProfissionalId == p.ProfissionalId);

                decimal salario = p.Salario;
                decimal comissao = c?.ValorComissao ?? 0m;
                if (c == null && fallback.TryGetValue(p.ProfissionalId, out var fb)) comissao = fb;
                decimal total = salario + comissao;
                bool pago = f?.Pago ?? false;
                DateTime? pagoEm = f?.PagoEm;

                return new
                {
                    p.ProfissionalId,
                    p.Nome,
                    ValorSalario = salario,
                    ValorComissao = comissao,
                    ValorTotal = total,
                    Pago = pago,
                    PagoEm = pagoEm
                };
            }).OrderBy(x => x.Nome).ToList();

            var sb = new StringBuilder();
            sb.AppendLine("ProfissionalId,Nome,ValorSalario,ValorComissao,ValorTotal,Pago,PagoEm");
            foreach (var r in rows)
            {
                var nome = (r.Nome ?? "").Replace("\"", "\"\"");
                sb.AppendLine($"{r.ProfissionalId},\"{nome}\",{r.ValorSalario},{r.ValorComissao},{r.ValorTotal},{(r.Pago ? 1 : 0)},{(r.PagoEm?.ToString("o") ?? "")} ");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            return File(bytes, "text/csv", $"folha_{year}_{month.ToString().PadLeft(2, '0')}.csv");
        }

        // Helper: bulk-aggregate Pagamentos joined to Vendas to compute commissions when the view is missing
        private async Task<Dictionary<int, decimal>> ComputeFallbackCommissions(int month, int year)
        {
            var start = new DateTime(year, month, 1);
            var end = start.AddMonths(1);

            // Join Pagamentos -> Vendas (ensure Venda navigation exists)
            var query = _context.Pagamentos
                .AsNoTracking()
                .Where(p => p.DataPagamento >= start && p.DataPagamento < end && p.VendaId != null)
                .Include(p => p.Venda)
                .Where(p => p.Venda != null);

            var grouped = await query
                .GroupBy(p => p.Venda.ProfissionalId)
                .Select(g => new { ProfissionalId = g.Key, ValorComissao = g.Sum(p => p.ValorPago) })
                .ToListAsync();

            return grouped.ToDictionary(x => x.ProfissionalId, x => x.ValorComissao);
        }

        // DTO for incoming request
        public class MarkPaidRequest
        {
            public int ProfissionalId { get; set; }
            public int Mes { get; set; }
            public int Ano { get; set; }
        }
    }
}
