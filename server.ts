import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import fs from 'fs';
import bootstrap from './src/main.server';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  server.disable('x-powered-by');
  server.set('trust proxy', 1);

  const isValidPeriod = (month: number, year: number): boolean =>
    Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2100;

  const toIdString = (value: unknown): string => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
    if (typeof value === 'string') return value.trim();
    return '';
  };

  const isSafeId = (value: string): boolean => /^[0-9]{1,18}$/.test(value);

  const isTrustedWriteOrigin = (req: express.Request): boolean => {
    const origin = req.headers.origin;
    if (!origin) return true;

    const host = req.get('host');
    if (!host) return false;

    const forwardedProto = req.get('x-forwarded-proto');
    const proto = (forwardedProto ? forwardedProto.split(',')[0] : req.protocol).trim();
    return origin === `${proto}://${host}`;
  };

  server.use(express.json({ limit: '100kb' }));
  server.use(express.urlencoded({ extended: false, limit: '100kb' }));

  server.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          connectSrc: ["'self'", 'http:', 'https:'],
          fontSrc: ["'self'", 'https:', 'data:'],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false,
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Limite de requisicoes excedido. Tente novamente em alguns minutos.' },
  });

  const pagamentosWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Muitas alteracoes em pouco tempo. Tente novamente em alguns minutos.' },
  });

  server.use('/api', apiLimiter);

  server.use('/api/auth/login', authLimiter);

  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Simple in-memory store for paid payroll records (keyed by profissionalId-month-year)
  const paidRecords: Record<string, { profissionalId: string | number; month: number; year: number; paidAt: string }> = {};
  // Persisted file path so the mark-paid state survives server restarts
  const dataFile = resolve(serverDistFolder, 'paid-records.json');
  try {
    if (fs.existsSync(dataFile)) {
      const raw = fs.readFileSync(dataFile, { encoding: 'utf-8' });
      const parsed = JSON.parse(raw || '{}');
      Object.assign(paidRecords, parsed);
      console.log('Loaded paid records from', dataFile);
    }
  } catch (err) {
    console.error('Could not read paid-records file:', err);
  }

  server.post('/api/Pagamentos/mark-paid', pagamentosWriteLimiter, (req, res) => {
    try {
      if (!isTrustedWriteOrigin(req)) {
        return res.status(403).json({ success: false, message: 'forbidden origin' });
      }

      const { profissionalId, month, year } = req.body || {};
      const id = toIdString(profissionalId);
      const monthNum = Number(month);
      const yearNum = Number(year);
      if (!id || !isSafeId(id) || !isValidPeriod(monthNum, yearNum)) {
        return res.status(400).json({ success: false, message: 'profissionalId, month and year required' });
      }
      const key = `${id}-${monthNum}-${yearNum}`;
      paidRecords[key] = { profissionalId: id, month: monthNum, year: yearNum, paidAt: new Date().toISOString() };
      // Persist to disk (best-effort)
      try {
        fs.writeFileSync(dataFile, JSON.stringify(paidRecords, null, 2), { encoding: 'utf-8' });
      } catch (writeErr) {
        console.error('Failed to persist paid records:', writeErr);
      }
      return res.json({ success: true, key, paidAt: paidRecords[key].paidAt });
    } catch (err) {
      console.error('Erro mark-paid:', err);
      return res.status(500).json({ success: false, message: 'internal error' });
    }
  });

  server.get('/api/Pagamentos/status', (req, res) => {
    const profissionalId = toIdString(req.query['profissionalId']);
    const month = Number(req.query['month']);
    const year = Number(req.query['year']);
    if (!profissionalId || !isSafeId(profissionalId) || !isValidPeriod(month, year)) {
      return res.status(400).json({ success: false, message: 'profissionalId, month and year required' });
    }
    const key = `${profissionalId}-${month}-${year}`;
    const record = paidRecords[key];
    return res.json({ success: true, paid: !!record, paidAt: record ? record.paidAt : null });
  });
  // Export CSV for a given month/year (aggregated by professional)
  server.get('/api/Pagamentos/export', async (req, res) => {
    try {
      const month = Number(req.query['month']);
      const year = Number(req.query['year']);
      if (!isValidPeriod(month, year)) return res.status(400).json({ success: false, message: 'month and year required' });

      // Fetch pagamentos and profissionais by invoking the internal endpoints
      const pagamentosResp = await fetch(`http://localhost:${process.env['PORT'] || 4000}/api/Pagamentos`);
      const profsResp = await fetch(`http://localhost:${process.env['PORT'] || 4000}/api/Profissionais`);
      if (!pagamentosResp.ok || !profsResp.ok) {
        return res.status(502).json({ success: false, message: 'upstream error' });
      }

      const pagamentos = await pagamentosResp.json();
      const profissionais = await profsResp.json();

      // Build a map of profissionais by id (different shapes tolerated)
      const profMap: Record<string, any> = {};
      (profissionais || []).forEach((p: any) => {
        const id = p.ProfissionalId ?? p.id ?? p.ProfissionalId;
        profMap[String(id)] = p;
      });

      // Aggregate commissions per professional
      const aggs: Record<string, { nome: string; salario: number; comissao: number; total: number }> = {};
      (pagamentos || []).forEach((pg: any) => {
        const rawDate = pg.DataPagamento ?? pg.dataPagamento ?? pg.Data ?? pg.data;
        const dt = rawDate ? new Date(rawDate) : null;
        if (!dt) return;
        if (dt.getMonth() + 1 !== month || dt.getFullYear() !== year) return;
        const profId = pg.ProfissionalId ?? pg.profissionalId ?? pg.Profissional ?? pg.professionalId ?? (pg.Nome || pg.nome);
        const key = String(profId || 'unknown');
        const com = Number(pg.Comissao ?? pg.comissao ?? 0);
        if (!aggs[key]) {
          const prof = profMap[key] || {};
          const salario = Number(prof.Salario ?? prof.salario ?? 0);
          aggs[key] = { nome: (prof.Nome ?? prof.nome) ?? (pg.Nome ?? pg.nome) ?? 'Desconhecido', salario: salario, comissao: 0, total: 0 };
        }
        aggs[key].comissao += com;
        aggs[key].total = (aggs[key].salario || 0) + aggs[key].comissao;
      });

      // Also include professionals with salary but no pagamentos
      Object.keys(profMap).forEach(k => {
        if (!aggs[k]) {
          const prof = profMap[k];
          const salario = Number(prof.Salario ?? prof.salario ?? 0);
          aggs[k] = { nome: prof.Nome ?? prof.nome ?? 'Desconhecido', salario: salario, comissao: 0, total: salario };
        }
      });

      // Build CSV
      const rows = [['ProfissionalId', 'Nome', 'Salario', 'ComissaoMes', 'Total']];
      Object.keys(aggs).forEach(k => {
        const a = aggs[k];
        rows.push([k, a.nome, (a.salario || 0).toFixed(2), (a.comissao || 0).toFixed(2), (a.total || 0).toFixed(2)]);
      });
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="folha_${year}_${String(month).padStart(2,'0')}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(csv);
    } catch (err) {
      console.error('Erro export CSV:', err);
      return res.status(500).json({ success: false, message: 'internal error' });
    }
  });
  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y',
    immutable: true,
  }));

  // Define routes that should use SSR
  const ssrRoutes = ['/businessperformance', '/businessagendamentos', '/businessclientes'];

  server.get('*', (req, res, next) => {
    const { originalUrl } = req;
    console.log(`[SSR] Incoming request for: ${originalUrl}`);

    try {
      if (!ssrRoutes.some(route => originalUrl.startsWith(route))) {
        console.log(`[SSR] Bypassing SSR for: ${originalUrl}`);
        return res.sendFile(join(browserDistFolder, 'index.html'));
      }

      console.log(`[SSR] Rendering with SSR for: ${originalUrl}`);
      commonEngine
        .render({
          bootstrap,
          documentFilePath: indexHtml,
          url: originalUrl,
          publicPath: browserDistFolder,
          providers: [{ provide: APP_BASE_HREF, useValue: '/' }],
        })
        .then((html) => res.send(html))
        .catch((err) => {
          const error = err as Error;
          console.error(`[SSR] Error rendering ${originalUrl}:`, error);
          res.status(500).send('<h1>500 Internal Server Error</h1><p>Unexpected error while rendering page.</p>');
        });
    } catch (err) {
      const error = err as Error;
      console.error(`[SSR] Unexpected error for ${originalUrl}:`, error);
      res.status(500).send('<h1>500 Internal Server Error</h1><p>Unexpected error while rendering page.</p>');
    }
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
