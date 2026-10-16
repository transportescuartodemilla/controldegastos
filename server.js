import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  initDatabase,
  getFinancialSummary,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  authenticateUser,
  getUserById,
  getDemoUsers,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getLoans,
  getLoanById,
  createLoan,
  updateLoan,
  deleteLoan,
  addLoanPayment,
  getLoanPayments,
  deleteLoanPayment,
  getLoansSummary,
  getReportData,
  clearDatabase
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initialize database
initDatabase();

// In-memory active user sessions: token -> { user, timestamp }
const SESSIONS = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8'
};

function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 No Encontrado');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error interno del servidor');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token'
    });
    res.end();
    return;
  }

  try {
    // API Routes
    if (pathname.startsWith('/api/')) {
      // 0. Authentication & Sessions
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        const result = authenticateUser(body.email, body.password);
        if (!result.success) {
          return sendJSON(res, { error: result.error }, 401);
        }
        const token = crypto.randomUUID();
        SESSIONS.set(token, { user: result.user, timestamp: Date.now() });
        return sendJSON(res, { success: true, token, user: result.user });
      }

      if (pathname === '/api/auth/me' && method === 'GET') {
        const authHeader = req.headers['authorization'] || req.headers['x-auth-token'] || reqUrl.searchParams.get('token');
        const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
        if (!token || !SESSIONS.has(token)) {
          return sendJSON(res, { error: 'No autorizado / Sesión expirada' }, 401);
        }
        const session = SESSIONS.get(token);
        return sendJSON(res, { success: true, user: session.user });
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        const authHeader = req.headers['authorization'] || req.headers['x-auth-token'] || reqUrl.searchParams.get('token');
        const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
        if (token) SESSIONS.delete(token);
        return sendJSON(res, { success: true, message: 'Sesión finalizada' });
      }

      if (pathname === '/api/auth/demo-users' && method === 'GET') {
        return sendJSON(res, getDemoUsers());
      }

      // 1. Summary
      if (pathname === '/api/summary' && method === 'GET') {
        const projectId = reqUrl.searchParams.get('projectId');
        const period = reqUrl.searchParams.get('period') || 'monthly';
        const summary = getFinancialSummary(projectId, period);
        return sendJSON(res, summary);
      }

      // 2. Transactions
      if (pathname === '/api/transactions') {
        if (method === 'GET') {
          const type = reqUrl.searchParams.get('type');
          const projectId = reqUrl.searchParams.get('projectId');
          const status = reqUrl.searchParams.get('status');
          const period = reqUrl.searchParams.get('period');
          const startDate = reqUrl.searchParams.get('startDate');
          const endDate = reqUrl.searchParams.get('endDate');
          const search = reqUrl.searchParams.get('search');
          const transactions = getTransactions({ type, projectId, status, period, startDate, endDate, search });
          return sendJSON(res, transactions);
        }

        if (method === 'POST') {
          const body = await parseBody(req);
          const newTx = createTransaction(body);
          return sendJSON(res, newTx, 201);
        }
      }

      const txMatch = pathname.match(/^\/api\/transactions\/(\d+)$/);
      if (txMatch) {
        const txId = txMatch[1];
        if (method === 'PUT') {
          const body = await parseBody(req);
          const updated = updateTransaction(txId, body);
          return sendJSON(res, updated);
        }
        if (method === 'DELETE') {
          deleteTransaction(txId);
          return sendJSON(res, { success: true, id: txId });
        }
      }

      // 3. Projects
      if (pathname === '/api/projects') {
        if (method === 'GET') {
          return sendJSON(res, getProjects());
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const project = createProject(body);
          return sendJSON(res, project, 201);
        }
      }

      const projMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
      if (projMatch) {
        const projId = projMatch[1];
        if (method === 'PUT') {
          const body = await parseBody(req);
          const updated = updateProject(projId, body);
          return sendJSON(res, updated);
        }
        if (method === 'DELETE') {
          deleteProject(projId);
          return sendJSON(res, { success: true, id: projId });
        }
      }

      // 4. Users / Employees
      if (pathname === '/api/users') {
        if (method === 'GET') {
          return sendJSON(res, getUsers());
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const user = createUser(body);
          return sendJSON(res, user, 201);
        }
      }

      const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
      if (userMatch) {
        const userId = userMatch[1];
        if (method === 'PUT') {
          const body = await parseBody(req);
          const updated = updateUser(userId, body);
          return sendJSON(res, updated);
        }
        if (method === 'DELETE') {
          try {
            deleteUser(userId);
            return sendJSON(res, { success: true, id: userId });
          } catch (err) {
            return sendJSON(res, { error: err.message }, 400);
          }
        }
      }

      // 5. Categories CRUD
      if (pathname === '/api/categories') {
        if (method === 'GET') {
          return sendJSON(res, getCategories());
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const cat = createCategory(body);
          return sendJSON(res, cat, 201);
        }
      }

      const catMatch = pathname.match(/^\/api\/categories\/(\d+)$/);
      if (catMatch) {
        const catId = catMatch[1];
        if (method === 'PUT') {
          const body = await parseBody(req);
          const updated = updateCategory(catId, body);
          return sendJSON(res, updated);
        }
        if (method === 'DELETE') {
          deleteCategory(catId);
          return sendJSON(res, { success: true, id: catId });
        }
      }

      // 5.1 Loans / Préstamos & Créditos
      if (pathname === '/api/loans') {
        if (method === 'GET') {
          const type = reqUrl.searchParams.get('type');
          const status = reqUrl.searchParams.get('status');
          const search = reqUrl.searchParams.get('search');
          return sendJSON(res, getLoans({ type, status, search }));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const newLoan = createLoan(body);
          return sendJSON(res, newLoan, 201);
        }
      }

      if (pathname === '/api/loans/summary' && method === 'GET') {
        return sendJSON(res, getLoansSummary());
      }

      const loanMatch = pathname.match(/^\/api\/loans\/(\d+)$/);
      if (loanMatch) {
        const loanId = loanMatch[1];
        if (method === 'GET') {
          const loan = getLoanById(loanId);
          if (!loan) return sendJSON(res, { error: 'Préstamo no encontrado' }, 404);
          return sendJSON(res, loan);
        }
        if (method === 'PUT') {
          const body = await parseBody(req);
          const updated = updateLoan(loanId, body);
          return sendJSON(res, updated);
        }
        if (method === 'DELETE') {
          deleteLoan(loanId);
          return sendJSON(res, { success: true, id: loanId });
        }
      }

      const loanPaymentsMatch = pathname.match(/^\/api\/loans\/(\d+)\/payments$/);
      if (loanPaymentsMatch) {
        const loanId = loanPaymentsMatch[1];
        if (method === 'GET') {
          return sendJSON(res, getLoanPayments(loanId));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const payment = addLoanPayment(loanId, body);
          return sendJSON(res, payment, 201);
        }
      }

      const loanPayDelMatch = pathname.match(/^\/api\/loan-payments\/(\d+)$/);
      if (loanPayDelMatch && method === 'DELETE') {
        const payId = loanPayDelMatch[1];
        deleteLoanPayment(payId);
        return sendJSON(res, { success: true, id: payId });
      }

      // 6. Reports (Daily, Weekly, Monthly)
      if (pathname === '/api/reports' && method === 'GET') {
        const type = reqUrl.searchParams.get('type') || 'monthly';
        const startDate = reqUrl.searchParams.get('startDate');
        const endDate = reqUrl.searchParams.get('endDate');
        const projectId = reqUrl.searchParams.get('projectId');
        const report = getReportData({ type, startDate, endDate, projectId });
        return sendJSON(res, report);
      }

      // 7. CSV Export
      if (pathname === '/api/export/csv' && method === 'GET') {
        const type = reqUrl.searchParams.get('type');
        const projectId = reqUrl.searchParams.get('projectId');
        const transactions = getTransactions({ type, projectId, limit: 1000 });

        let csv = 'ID,Tipo,Fecha,Proyecto,Cliente_Proveedor,Categoria,Monto,Metodo,Estado,Referencia,Notas\n';
        for (const t of transactions) {
          csv += `"${t.id}","${t.type}","${t.date}","${(t.project_name || 'General').replace(/"/g, '""')}","${(t.client_or_provider || '').replace(/"/g, '""')}","${t.category}","${t.amount}","${t.payment_method}","${t.status}","${t.reference_num || ''}","${(t.notes || '').replace(/"/g, '""')}"\n`;
        }

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="reporte_financiero_${Date.now()}.csv"`
        });
        res.end(csv);
        return;
      }

      // 8. Database Reset
      if (pathname === '/api/reset' && method === 'POST') {
        clearDatabase();
        return sendJSON(res, { success: true, message: 'Base de datos limpiada con éxito' });
      }

      // 404 for unknown API
      return sendJSON(res, { error: 'Ruta no encontrada' }, 404);
    }

    // Static files
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '') {
      safePath = '/index.html';
    }
    const fullFilePath = path.join(PUBLIC_DIR, safePath);

    // Verify it's within public directory
    if (!fullFilePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Acceso denegado');
    }

    serveStatic(req, res, fullFilePath);

  } catch (error) {
    console.error('Server error:', error);
    sendJSON(res, { error: 'Error interno en el servidor', details: error.message }, 500);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Panel Administrativo Financiero (Estilo Solvento)`);
  console.log(`🌐 Servidor iniciado en: http://localhost:${PORT}`);
  console.log(`💼 Control de Ingresos, Gastos, Proyectos y Empleados`);
  console.log(`=======================================================`);
});
