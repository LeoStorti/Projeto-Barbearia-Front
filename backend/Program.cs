using Microsoft.EntityFrameworkCore;
using Projeto.Barber.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// configure InMemory for quick run; user can replace with SQL Server connection string
builder.Services.AddDbContext<APIDbContext>(opt => opt.UseInMemoryDatabase("BarberDb"));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.Run();
