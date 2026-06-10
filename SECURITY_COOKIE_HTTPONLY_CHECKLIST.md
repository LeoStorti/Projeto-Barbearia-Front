# Checklist Backend - Cookie HttpOnly (Angular + API .NET)

Objetivo: autenticar via cookie HttpOnly (sem token legivel por JavaScript), mantendo o frontend funcional com withCredentials.

## 1) Emissao do cookie no login

No endpoint de login, apos validar usuario/senha, gere o JWT (ou id de sessao) e envie no Set-Cookie.

Exemplo (ASP.NET Core):

```csharp
var cookieOptions = new CookieOptions
{
	HttpOnly = true,
	Secure = !app.Environment.IsDevelopment(),
	SameSite = app.Environment.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None,
	Path = "/",
	Expires = DateTimeOffset.UtcNow.AddHours(8)
};

Response.Cookies.Append("auth_token", jwt, cookieOptions);

return Ok(new
{
	message = "Login realizado com sucesso",
	login = usuario.Email,
	// Opcional: manter dados nao sensiveis para UX
	nomeUsuario = usuario.Nome,
	empresaId = usuario.EmpresaId
});
```

Notas:
- Se frontend e backend estiverem em dominios diferentes em producao, use SameSite=None + Secure=true.
- Em localhost com HTTP, Secure=true bloqueia cookie; por isso no exemplo Secure depende do ambiente.

## 2) Leitura do token via cookie no backend

A validacao de autenticacao deve aceitar token vindo do cookie auth_token.

Exemplo (JwtBearer):

```csharp
builder.Services
	.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
	.AddJwtBearer(options =>
	{
		options.TokenValidationParameters = new TokenValidationParameters
		{
			ValidateIssuer = true,
			ValidateAudience = true,
			ValidateLifetime = true,
			ValidateIssuerSigningKey = true,
			ValidIssuer = builder.Configuration["Jwt:Issuer"],
			ValidAudience = builder.Configuration["Jwt:Audience"],
			IssuerSigningKey = new SymmetricSecurityKey(
				Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
		};

		options.Events = new JwtBearerEvents
		{
			OnMessageReceived = context =>
			{
				if (string.IsNullOrWhiteSpace(context.Token) &&
					context.Request.Cookies.TryGetValue("auth_token", out var token))
				{
					context.Token = token;
				}

				return Task.CompletedTask;
			}
		};
	});
```

## 3) CORS com credenciais

Sem isso, o navegador nao envia cookie cross-origin.

```csharp
builder.Services.AddCors(options =>
{
	options.AddPolicy("FrontPolicy", policy =>
	{
		policy
			.WithOrigins("http://localhost:4201", "http://localhost:4200")
			.AllowAnyHeader()
			.AllowAnyMethod()
			.AllowCredentials();
	});
});

app.UseCors("FrontPolicy");
```

Importante:
- Quando usar AllowCredentials(), nao use AllowAnyOrigin().

## 4) Endpoint de logout

Crie POST /api/auth/logout para expirar o cookie no servidor.

```csharp
[HttpPost("logout")]
public IActionResult Logout()
{
	Response.Cookies.Append("auth_token", string.Empty, new CookieOptions
	{
		HttpOnly = true,
		Secure = !HttpContext.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(),
		SameSite = HttpContext.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment()
			? SameSiteMode.Lax
			: SameSiteMode.None,
		Path = "/",
		Expires = DateTimeOffset.UtcNow.AddDays(-1)
	});

	return Ok(new { message = "Logout realizado" });
}
```

## 5) Ordem de middlewares

Garanta esta ordem no Program.cs:

1. UseRouting
2. UseCors
3. UseAuthentication
4. UseAuthorization
5. MapControllers

## 6) Ajustes de seguranca recomendados

1. Access token curto (ex.: 15-30 min) e refresh token com rotacao.
2. Revogacao de sessao (blacklist/jti) para logout efetivo antes do expirar.
3. Rate limit no login (ja aplicado no front SSR, manter no backend principal tambem).
4. Log de falhas de login sem vazar detalhes sensiveis.

## 7) Criterios de aceite (teste rapido)

1. Login responde 200 e Set-Cookie auth_token com HttpOnly.
2. Requisicoes autenticadas funcionam sem Authorization Bearer no frontend.
3. Logout remove cookie e endpoint protegido passa a retornar 401.
4. Recarregar pagina mantem sessao enquanto cookie valido.
5. Em ambiente cross-origin, cookie trafega com withCredentials sem erro de CORS.

## 8) Limpeza final no frontend (apos backend pronto)

Quando tudo acima estiver ativo em producao:

1. Remover fallback legado de token em localStorage.
2. Remover utilitarios de set/get de auth_token no navegador.
3. Manter apenas estado de sessao nao sensivel no cliente (nome, empresaId, etc.).

