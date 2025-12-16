Patch para integrar fallback de comissão e testes (xUnit)

O que tem aqui
- `Controllers/PagamentosController.cs` — versão patchada do controller que implementa:
  - `GET /api/Pagamentos/for-month?month=&year=` (usa `VwComissoesMensais` quando disponível; caso contrário agrega `Pagamentos`+`Vendas` por profissional em bulk como fallback)
  - `POST /api/Pagamentos/mark-paid` (upsert em `FolhaPagamentos` com snapshot de salario/comissao/total)
  - `GET /api/Pagamentos/export` (CSV)
- `tests/Projeto.Barber.Api.Tests.csproj` — projeto de testes xUnit (EF Core InMemory)
- `tests/PagamentosControllerTests.cs` — 3 testes: view presente, fallback a partir de Pagamentos, mark-paid cria FolhaPagamento

Como aplicar no seu backend real
1) Faça backup dos seus arquivos atuais (`PagamentosController.cs` e `APIDbContext`).
2) Copie/mescle `Controllers/PagamentosController.cs` deste patch no seu projeto (ajuste namespaces se necessário).
3) Garanta que seu `APIDbContext` possua os `DbSet`:
   - `public DbSet<FolhaPagamento> FolhaPagamentos { get; set; }`
   - `public DbSet<VwComissoesMensais> VwComissoesMensais { get; set; }`
   e que na `OnModelCreating` exista:
   - `modelBuilder.Entity<VwComissoesMensais>().HasNoKey().ToView("VwComissoesMensais");`
   - índice único em `FolhaPagamento` por `{ ProfissionalId, Ano, Mes }` é recomendado.
4) Se seu modelo de `Pagamento` usa outro nome para a data ou navegação para `Venda`, ajuste o helper `ComputeFallbackCommissions` para usar as colunas corretas (`DataPagamento`, `VendaId`, `Venda.ProfissionalId`, `ValorPago`).
5) Build e rode os testes (opcional): crie um projeto de testes similar ao `tests/` e rode `dotnet test`.

Como rodar os testes localmente (exemplo)
1) No seu ambiente .NET com SDK instalado, estando na raiz do patch:

```powershell
cd backend-patch/tests
dotnet test
```

Notas
- Os testes usam InMemory provider apenas para validar a lógica. Para verificar integração com SQL Server, rode a aplicação localmente apontando a string de conexão para seu banco de dev.
- Ajuste a serialização/formatos de datas na exportação CSV se precisar compatibilidade com Excel em outro encodamento (atualmente UTF-8).

Se quiser, eu posso gerar um patch direto no seu projeto backend se você colar o caminho do arquivo `PagamentosController.cs` e `APIDbContext` (ou colar o conteúdo aquí).
