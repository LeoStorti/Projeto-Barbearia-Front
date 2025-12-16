using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;
using API.Context;
using APIBarbearia.Models;

namespace Projeto.Barber.Api.Tests
{
    public class PagamentosControllerTests
    {
        private APIDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<APIDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            return new APIDbContext(options);
        }

        [Fact]
        public async Task ForMonth_UsesView_WhenAvailable()
        {
            using var ctx = CreateContext();
            // Seed profissional
            var p = new Profissional { ProfissionalId = 1, Nome = "Ana", Salario = 1000m };
            ctx.Profissionais.Add(p);
            // Seed view row
            var v = new VwComissoesMensais { ProfissionalId = 1, Ano = 2025, Mes = 9, ValorComissao = 250m };
            ctx.VwComissoesMensais.Add(v);
            await ctx.SaveChangesAsync();

            var controller = new APIBarbearia.Controllers.PagamentosController(ctx);
            var ok = await controller.GetForMonth(9, 2025) as Microsoft.AspNetCore.Mvc.OkObjectResult;
            Assert.NotNull(ok);
            var list = ok.Value as System.Collections.IEnumerable;
            Assert.NotNull(list);
            // find the record for Ana
            var arr = ((System.Collections.IEnumerable)ok.Value).Cast<dynamic>().ToArray();
            Assert.Single(arr);
            decimal comissao = arr[0].ValorComissao;
            Assert.Equal(250m, comissao);
        }

        [Fact]
        public async Task ForMonth_FallbacksToPagamentos_WhenViewMissing()
        {
            using var ctx = CreateContext();
            // Seed profissional
            var p = new Profissional { ProfissionalId = 2, Nome = "Bruno", Salario = 1200m };
            ctx.Profissionais.Add(p);
            // Seed venda and pagamentos
            var venda = new Vendas { VendaId = 10, ProfissionalId = 2 };
            ctx.Vendas.Add(venda);
            var pagamento = new Pagamento { PagamentoId = 100, VendaId = 10, ValorPago = 300m, DataPagamento = new DateTime(2025, 9, 15) };
            ctx.Pagamentos.Add(pagamento);
            await ctx.SaveChangesAsync();

            var controller = new APIBarbearia.Controllers.PagamentosController(ctx);
            var ok = await controller.GetForMonth(9, 2025) as Microsoft.AspNetCore.Mvc.OkObjectResult;
            Assert.NotNull(ok);
            var arr = ((System.Collections.IEnumerable)ok.Value).Cast<dynamic>().ToArray();
            Assert.Single(arr);
            decimal comissao = arr[0].ValorComissao;
            Assert.Equal(300m, comissao);
        }

        [Fact]
        public async Task MarkPaid_Creates_FolhaPagamento_WithSnapshot()
        {
            using var ctx = CreateContext();
            var p = new Profissional { ProfissionalId = 3, Nome = "Carla", Salario = 1500m };
            ctx.Profissionais.Add(p);
            var venda = new Vendas { VendaId = 20, ProfissionalId = 3 };
            ctx.Vendas.Add(venda);
            var pagamento = new Pagamento { PagamentoId = 200, VendaId = 20, ValorPago = 400m, DataPagamento = new DateTime(2025, 9, 10) };
            ctx.Pagamentos.Add(pagamento);
            await ctx.SaveChangesAsync();

            var controller = new APIBarbearia.Controllers.PagamentosController(ctx);
            var req = new APIBarbearia.Controllers.PagamentosController.MarkPaidRequest { ProfissionalId = 3, Mes = 9, Ano = 2025 };
            var res = await controller.MarkPaid(req) as Microsoft.AspNetCore.Mvc.OkObjectResult;
            Assert.NotNull(res);
            // verify folha
            var folha = ctx.FolhaPagamentos.FirstOrDefault(f => f.ProfissionalId == 3 && f.Mes == 9 && f.Ano == 2025);
            Assert.NotNull(folha);
            Assert.True(folha.Pago);
            Assert.Equal(1500m, folha.ValorSalario);
            Assert.Equal(400m, folha.ValorComissao);
            Assert.Equal(1900m, folha.ValorTotal);
        }
    }
}
