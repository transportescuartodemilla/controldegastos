import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'finanzas.db');

export const db = new DatabaseSync(DB_PATH);

// Initialize database schema
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT DEFAULT 'admin123',
      role TEXT NOT NULL DEFAULT 'empleado', -- 'admin', 'contador', 'gestor', 'empleado'
      position TEXT NOT NULL,
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'activo', -- 'activo', 'inactivo'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0.0,
      status TEXT NOT NULL DEFAULT 'en_progreso', -- 'en_progreso', 'completado', 'en_pausa'
      start_date DATE NOT NULL,
      deadline DATE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'ingreso', 'gasto'
      color TEXT DEFAULT '#3B82F6'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'ingreso', 'gasto'
      amount REAL NOT NULL,
      project_id INTEGER,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      client_or_provider TEXT NOT NULL,
      date DATE NOT NULL,
      payment_method TEXT DEFAULT 'Transferencia',
      status TEXT NOT NULL DEFAULT 'disponible', -- 'disponible', 'en_dispersion', 'pagado', 'cancelado'
      reference_num TEXT,
      created_by_user_id INTEGER,
      notes TEXT,
      net_amount REAL DEFAULT 0.0,
      iva_amount REAL DEFAULT 0.0,
      isr_amount REAL DEFAULT 0.0,
      declaration_amount REAL DEFAULT 0.0,
      tax_rate_iva REAL DEFAULT 16.0,
      tax_rate_isr REAL DEFAULT 1.25,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'otorgado', -- 'otorgado' (dimos prestamo / por cobrar), 'recibido' (recibimos credito / por pagar)
      beneficiary TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0.0,
      remaining_amount REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0.0,
      start_date DATE NOT NULL,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'activo', -- 'activo', 'liquidado', 'vencido'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loan_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date DATE NOT NULL,
      payment_method TEXT DEFAULT 'Transferencia SPEI',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE
    );
  `);

  // Migration: Ensure tax columns exist on existing database
  const cols = db.prepare("PRAGMA table_info(transactions)").all().map(c => c.name);
  const requiredCols = [
    { name: 'net_amount', sql: 'ALTER TABLE transactions ADD COLUMN net_amount REAL DEFAULT 0.0;' },
    { name: 'iva_amount', sql: 'ALTER TABLE transactions ADD COLUMN iva_amount REAL DEFAULT 0.0;' },
    { name: 'isr_amount', sql: 'ALTER TABLE transactions ADD COLUMN isr_amount REAL DEFAULT 0.0;' },
    { name: 'declaration_amount', sql: 'ALTER TABLE transactions ADD COLUMN declaration_amount REAL DEFAULT 0.0;' },
    { name: 'tax_rate_iva', sql: 'ALTER TABLE transactions ADD COLUMN tax_rate_iva REAL DEFAULT 16.0;' },
    { name: 'tax_rate_isr', sql: 'ALTER TABLE transactions ADD COLUMN tax_rate_isr REAL DEFAULT 1.25;' },
    { name: 'repeat_interval', sql: "ALTER TABLE transactions ADD COLUMN repeat_interval TEXT DEFAULT 'none';" }
  ];
  for (const col of requiredCols) {
    if (!cols.includes(col.name)) {
      try {
        db.exec(col.sql);
      } catch (e) {
        console.warn(`Migration notice for ${col.name}:`, e.message);
      }
    }
  }

  // Migration: Ensure password column exists on users
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('password')) {
    try {
      db.exec("ALTER TABLE users ADD COLUMN password TEXT DEFAULT 'admin123';");
      db.exec("UPDATE users SET password = 'admin123' WHERE password IS NULL OR password = '';");
    } catch (e) {
      console.warn("Migration notice for users.password:", e.message);
    }
  } else {
    try {
      db.exec("UPDATE users SET password = 'admin123' WHERE password IS NULL OR password = '';");
    } catch {}
  }

  // Backfill existing income transactions if tax amounts are zero
  try {
    db.exec(`
      UPDATE transactions 
      SET 
        iva_amount = ROUND(amount * 0.16, 2),
        isr_amount = ROUND(amount * 0.0125, 2),
        declaration_amount = ROUND(amount * 1.16, 2),
        net_amount = ROUND(amount * 1.16 - amount * 0.0125, 2),
        tax_rate_iva = 16.0,
        tax_rate_isr = 1.25
      WHERE type = 'ingreso' AND (net_amount IS NULL OR net_amount = 0.0);
    `);
  } catch (e) {
    console.warn("Backfill notice:", e.message);
  }

  // Seed default categories if empty
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)');
    // Ingresos
    insertCat.run('Servicios Profesionales', 'ingreso', '#2563EB');
    insertCat.run('Desarrollo de Software', 'ingreso', '#3B82F6');
    insertCat.run('Consultoría Estratégica', 'ingreso', '#6366F1');
    insertCat.run('Mantenimiento & Soporte', 'ingreso', '#0EA5E9');
    insertCat.run('Venta de Licencias', 'ingreso', '#10B981');
    insertCat.run('Otros Ingresos', 'ingreso', '#64748B');

    // Gastos
    insertCat.run('Nómina y Sueldos', 'gasto', '#EF4444');
    insertCat.run('Servidores y Nube', 'gasto', '#F59E0B');
    insertCat.run('Herramientas y Software', 'gasto', '#8B5CF6');
    insertCat.run('Oficina y Servicios', 'gasto', '#EC4899');
    insertCat.run('Marketing y Ventas', 'gasto', '#14B8A6');
    insertCat.run('Honorarios Profesionales', 'gasto', '#F97316');
    insertCat.run('Viáticos y Representación', 'gasto', '#64748B');
  }

  // Seed users if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (name, email, password, role, position, avatar, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertUser.run('Ramiro Grajales', 'ramiro@empresa.com', 'admin123', 'admin', 'Director General & CEO', 'RG', 'activo');
    insertUser.run('Sofía Mendoza', 'sofia.mendoza@empresa.com', 'admin123', 'contador', 'Contadora Senior', 'SM', 'activo');
    insertUser.run('Carlos Valenzuela', 'carlos.v@empresa.com', 'admin123', 'gestor', 'Project Manager Tech', 'CV', 'activo');
    insertUser.run('Ana Lucía Rivas', 'ana.rivas@empresa.com', 'admin123', 'empleado', 'Desarrolladora Frontend', 'AR', 'activo');
    insertUser.run('Miguel Ángel Torres', 'miguel.torres@empresa.com', 'admin123', 'empleado', 'Consultor de Negocios', 'MT', 'activo');
  }

}

// Auto-run schema initialization
initDatabase();

export function clearDatabase() {
  db.exec(`
    DELETE FROM transactions;
    DELETE FROM projects;
    DELETE FROM loans;
    DELETE FROM loan_payments;
    DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'projects', 'loans', 'loan_payments');
  `);
}

// Transaction queries
export function getTransactions({ type, projectId, status, period, startDate, endDate, search, limit = 100 } = {}) {
  let query = `
    SELECT 
      t.*,
      p.name as project_name,
      p.client as project_client,
      u.name as user_name
    FROM transactions t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.created_by_user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    query += ` AND t.type = ?`;
    params.push(type);
  }

  if (projectId) {
    query += ` AND t.project_id = ?`;
    params.push(Number(projectId));
  }

  if (status) {
    query += ` AND t.status = ?`;
    params.push(status);
  }

  if (startDate) {
    query += ` AND t.date >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND t.date <= ?`;
    params.push(endDate);
  }

  if (period) {
    const now = new Date();
    if (period === 'daily') {
      const todayStr = now.toISOString().split('T')[0];
      query += ` AND t.date = ?`;
      params.push(todayStr);
    } else if (period === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff)).toISOString().split('T')[0];
      query += ` AND t.date >= ?`;
      params.push(monday);
    } else if (period === 'monthly') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      query += ` AND t.date >= ?`;
      params.push(firstDay);
    }
  }

  if (search) {
    query += ` AND (t.description LIKE ? OR t.client_or_provider LIKE ? OR t.reference_num LIKE ? OR t.category LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY t.date DESC, t.id DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params);
}

export function createTransaction(tx) {
  const amount = Number(tx.amount || 0);
  const net_amount = Number(tx.net_amount !== undefined ? tx.net_amount : amount);
  const iva_amount = Number(tx.iva_amount || 0);
  const isr_amount = Number(tx.isr_amount || 0);
  const declaration_amount = Number(tx.declaration_amount !== undefined ? tx.declaration_amount : amount);
  const tax_rate_iva = Number(tx.tax_rate_iva !== undefined ? tx.tax_rate_iva : 16.0);
  const tax_rate_isr = Number(tx.tax_rate_isr !== undefined ? tx.tax_rate_isr : 1.25);

  const stmt = db.prepare(`
    INSERT INTO transactions 
    (type, amount, project_id, category, description, client_or_provider, date, payment_method, status, reference_num, created_by_user_id, notes, net_amount, iva_amount, isr_amount, declaration_amount, tax_rate_iva, tax_rate_isr, repeat_interval)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    tx.type,
    amount,
    tx.project_id ? Number(tx.project_id) : null,
    tx.category || (tx.type === 'ingreso' ? 'Ventas & Facturación' : 'General'),
    tx.description || '',
    tx.client_or_provider || '',
    tx.date || new Date().toISOString().split('T')[0],
    tx.payment_method || 'Transferencia SPEI',
    tx.status || (tx.type === 'ingreso' ? 'disponible' : 'pagado'),
    tx.reference_num || `FAC-${Date.now().toString().slice(-6)}`,
    tx.created_by_user_id ? Number(tx.created_by_user_id) : 1,
    tx.notes || '',
    net_amount,
    iva_amount,
    isr_amount,
    declaration_amount,
    tax_rate_iva,
    tax_rate_isr,
    tx.repeat_interval || 'none'
  );

  return { 
    id: Number(info.lastInsertRowid), 
    ...tx,
    amount,
    net_amount,
    iva_amount,
    isr_amount,
    declaration_amount,
    tax_rate_iva,
    tax_rate_isr,
    repeat_interval: tx.repeat_interval || 'none'
  };
}

export function updateTransaction(id, tx) {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const type = tx.type !== undefined ? tx.type : existing.type;
  const amount = Number(tx.amount !== undefined ? tx.amount : existing.amount);
  const net_amount = Number(tx.net_amount !== undefined ? tx.net_amount : (existing.net_amount !== null && existing.net_amount !== undefined ? existing.net_amount : amount));
  const iva_amount = Number(tx.iva_amount !== undefined ? tx.iva_amount : (existing.iva_amount || 0));
  const isr_amount = Number(tx.isr_amount !== undefined ? tx.isr_amount : (existing.isr_amount || 0));
  const declaration_amount = Number(tx.declaration_amount !== undefined ? tx.declaration_amount : (existing.declaration_amount !== null && existing.declaration_amount !== undefined ? existing.declaration_amount : amount));
  const tax_rate_iva = Number(tx.tax_rate_iva !== undefined ? tx.tax_rate_iva : (existing.tax_rate_iva || 16.0));
  const tax_rate_isr = Number(tx.tax_rate_isr !== undefined ? tx.tax_rate_isr : (existing.tax_rate_isr || 1.25));

  const project_id = tx.project_id !== undefined ? (tx.project_id ? Number(tx.project_id) : null) : existing.project_id;
  const category = tx.category !== undefined ? tx.category : (existing.category || '');
  const description = tx.description !== undefined ? tx.description : (existing.description || '');
  const client_or_provider = tx.client_or_provider !== undefined ? tx.client_or_provider : (existing.client_or_provider || '');
  const date = tx.date !== undefined ? tx.date : (existing.date || new Date().toISOString().split('T')[0]);
  const payment_method = tx.payment_method !== undefined ? tx.payment_method : (existing.payment_method || 'Transferencia SPEI');
  const status = tx.status !== undefined ? tx.status : (existing.status || (type === 'ingreso' ? 'disponible' : 'pagado'));
  const reference_num = tx.reference_num !== undefined ? tx.reference_num : (existing.reference_num || '');
  const notes = tx.notes !== undefined ? tx.notes : (existing.notes || '');
  const repeat_interval = tx.repeat_interval !== undefined ? tx.repeat_interval : (existing.repeat_interval || 'none');

  const stmt = db.prepare(`
    UPDATE transactions SET
      type = ?,
      amount = ?,
      project_id = ?,
      category = ?,
      description = ?,
      client_or_provider = ?,
      date = ?,
      payment_method = ?,
      status = ?,
      reference_num = ?,
      notes = ?,
      net_amount = ?,
      iva_amount = ?,
      isr_amount = ?,
      declaration_amount = ?,
      tax_rate_iva = ?,
      tax_rate_isr = ?,
      repeat_interval = ?
    WHERE id = ?
  `);

  stmt.run(
    type,
    amount,
    project_id,
    category,
    description,
    client_or_provider,
    date,
    payment_method,
    status,
    reference_num,
    notes,
    net_amount,
    iva_amount,
    isr_amount,
    declaration_amount,
    tax_rate_iva,
    tax_rate_isr,
    repeat_interval,
    Number(id)
  );

  return { 
    ...existing,
    ...tx,
    id: Number(id), 
    type,
    amount,
    project_id,
    category,
    description,
    client_or_provider,
    date,
    payment_method,
    status,
    reference_num,
    notes,
    net_amount,
    iva_amount,
    isr_amount,
    declaration_amount,
    tax_rate_iva,
    tax_rate_isr,
    repeat_interval
  };
}

export function deleteTransaction(id) {
  return db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(id));
}

// Project queries
export function getProjects() {
  const projects = db.prepare(`
    SELECT 
      p.*,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = p.id AND type = 'ingreso'), 0) as total_income,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = p.id AND type = 'ingreso' AND status = 'pagado'), 0) as collected_income,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = p.id AND type = 'ingreso' AND status = 'disponible'), 0) as available_income,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = p.id AND type = 'ingreso' AND status = 'en_dispersion'), 0) as in_dispersion_income,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = p.id AND type = 'gasto'), 0) as total_expenses,
      (SELECT COUNT(*) FROM transactions WHERE project_id = p.id) as transaction_count
    FROM projects p
    ORDER BY p.id DESC
  `).all();

  return projects.map(p => {
    const net_profit = p.total_income - p.total_expenses;
    const margin = p.total_income > 0 ? (net_profit / p.total_income) * 100 : 0;
    const budget_progress = p.budget > 0 ? (p.total_income / p.budget) * 100 : 0;
    return {
      ...p,
      net_profit,
      margin: parseFloat(margin.toFixed(1)),
      budget_progress: parseFloat(budget_progress.toFixed(1))
    };
  });
}

export function createProject(p) {
  const stmt = db.prepare(`
    INSERT INTO projects (name, client, budget, status, start_date, deadline, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    p.name,
    p.client,
    Number(p.budget || 0),
    p.status || 'en_progreso',
    p.start_date || new Date().toISOString().split('T')[0],
    p.deadline || null,
    p.description || ''
  );
  return { id: Number(info.lastInsertRowid), ...p };
}

export function updateProject(id, p) {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const name = p.name !== undefined ? p.name : existing.name;
  const client = p.client !== undefined ? p.client : existing.client;
  const budget = Number(p.budget !== undefined ? p.budget : existing.budget);
  const status = p.status !== undefined ? p.status : existing.status;
  const start_date = p.start_date !== undefined ? p.start_date : existing.start_date;
  const deadline = p.deadline !== undefined ? p.deadline : existing.deadline;
  const description = p.description !== undefined ? p.description : (existing.description || '');

  const stmt = db.prepare(`
    UPDATE projects SET
      name = ?,
      client = ?,
      budget = ?,
      status = ?,
      start_date = ?,
      deadline = ?,
      description = ?
    WHERE id = ?
  `);
  stmt.run(
    name,
    client,
    budget,
    status,
    start_date,
    deadline || null,
    description,
    Number(id)
  );
  return { ...existing, ...p, id: Number(id), name, client, budget, status, start_date, deadline, description };
}

export function deleteProject(id) {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(Number(id));
}

// User / Employee queries & Authentication
export function hashPassword(pwd) {
  if (!pwd) return '';
  return crypto.createHash('sha256').update(String(pwd) + '_solvento_salt_2026').digest('hex');
}

export function authenticateUser(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Por favor ingresa tu correo y contraseña' };
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).trim();

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (!user) {
    return { success: false, error: 'No existe una cuenta registrada con este correo electrónico' };
  }

  if (user.status === 'inactivo') {
    return { success: false, error: 'Esta cuenta está desactivada. Contacta al administrador.' };
  }

  const hashedInput = hashPassword(cleanPassword);
  const isValid = 
    user.password === cleanPassword || 
    user.password === hashedInput || 
    (cleanPassword === 'admin123' && (!user.password || user.password === 'admin123'));

  if (!isValid) {
    return { success: false, error: 'Contraseña incorrecta. Inténtalo de nuevo.' };
  }

  const { password: _, ...safeUser } = user;
  return { success: true, user: safeUser };
}

export function getUserById(id) {
  const user = db.prepare('SELECT id, name, email, role, position, avatar, status, created_at FROM users WHERE id = ?').get(Number(id));
  return user || null;
}

export function getDemoUsers() {
  return db.prepare(`
    SELECT id, name, email, role, position, avatar 
    FROM users 
    WHERE status = 'activo' 
    ORDER BY id ASC 
    LIMIT 5
  `).all();
}

export function getUsers() {
  return db.prepare(`
    SELECT 
      u.id,
      u.name,
      u.email,
      u.role,
      u.position,
      u.avatar,
      u.status,
      u.created_at,
      (SELECT COUNT(*) FROM transactions WHERE created_by_user_id = u.id) as transactions_registered
    FROM users u
    ORDER BY u.id ASC
  `).all();
}

export function createUser(u) {
  const initials = u.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  const rawPassword = u.password && String(u.password).trim() ? String(u.password).trim() : 'admin123';
  const finalPassword = hashPassword(rawPassword);

  const stmt = db.prepare(`
    INSERT INTO users (name, email, password, role, position, avatar, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    u.name,
    u.email,
    finalPassword,
    u.role || 'empleado',
    u.position || 'Colaborador',
    u.avatar || initials || 'US',
    u.status || 'activo'
  );
  return { id: Number(info.lastInsertRowid), ...u, avatar: u.avatar || initials || 'US' };
}

export function updateUser(id, u) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const name = u.name !== undefined ? u.name : existing.name;
  const email = u.email !== undefined ? u.email : existing.email;
  const role = u.role !== undefined ? u.role : existing.role;
  const position = u.position !== undefined ? u.position : existing.position;
  const status = u.status !== undefined ? u.status : existing.status;

  let password = existing.password;
  if (u.password && String(u.password).trim()) {
    password = hashPassword(String(u.password).trim());
  }

  const stmt = db.prepare(`
    UPDATE users SET
      name = ?,
      email = ?,
      password = ?,
      role = ?,
      position = ?,
      status = ?
    WHERE id = ?
  `);
  stmt.run(name, email, password, role, position, status, Number(id));
  return { ...existing, ...u, id: Number(id), name, email, role, position, status };
}

export function deleteUser(id) {
  if (Number(id) === 1) {
    throw new Error('No es posible eliminar la Cuenta Maestra principal');
  }
  return db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
}

// Categories CRUD
export function getCategories() {
  return db.prepare(`
    SELECT 
      c.*,
      (SELECT COUNT(*) FROM transactions WHERE category = c.name AND type = c.type) as transaction_count
    FROM categories c
    ORDER BY c.type ASC, c.name ASC
  `).all();
}

export function createCategory({ name, type, color = '#2563EB' }) {
  if (!name || !name.trim()) throw new Error('Nombre de categoría requerido');
  const catType = type === 'gasto' ? 'gasto' : 'ingreso';
  const catColor = color || (catType === 'ingreso' ? '#2563EB' : '#EF4444');
  const trimmedName = name.trim();

  // Check if already exists
  const existing = db.prepare('SELECT * FROM categories WHERE LOWER(name) = LOWER(?) AND type = ?').get(trimmedName, catType);
  if (existing) {
    return { ...existing, transaction_count: 0 };
  }

  const stmt = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)');
  const info = stmt.run(trimmedName, catType, catColor);
  return { id: Number(info.lastInsertRowid), name: trimmedName, type: catType, color: catColor, transaction_count: 0 };
}

export function updateCategory(id, { name, type, color }) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const newName = name !== undefined ? name.trim() : existing.name;
  const newType = type !== undefined ? type : existing.type;
  const newColor = color !== undefined ? color : existing.color;

  db.prepare('UPDATE categories SET name = ?, type = ?, color = ? WHERE id = ?')
    .run(newName, newType, newColor, Number(id));

  // If the category name or type changed, cascade update existing transactions
  if (newName !== existing.name || newType !== existing.type) {
    db.prepare('UPDATE transactions SET category = ? WHERE category = ? AND type = ?')
      .run(newName, existing.name, existing.type);
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE category = ? AND type = ?').get(newName, newType).count;
  return { id: Number(id), name: newName, type: newType, color: newColor, transaction_count: count };
}

export function deleteCategory(id) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id));
  if (!existing) return false;
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(id));
  return true;
}

// Financial Summary calculation for the 3 main entries: 1 Ingresos, 2 Egresos, 3 Resumen
export function getFinancialSummary(projectId = null, period = 'monthly') {
  let filter = '';
  const params = [];

  if (projectId) {
    filter += ' AND project_id = ?';
    params.push(Number(projectId));
  }

  const now = new Date();
  let periodLabel = 'Este Mes';
  if (period === 'daily') {
    const todayStr = now.toISOString().split('T')[0];
    filter += ' AND date = ?';
    params.push(todayStr);
    periodLabel = 'Hoy';
  } else if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff)).toISOString().split('T')[0];
    filter += ' AND date >= ?';
    params.push(monday);
    periodLabel = 'Esta Semana';
  } else if (period === 'monthly') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    filter += ' AND date >= ?';
    params.push(firstDay);
    periodLabel = 'Este Mes';
  } else {
    periodLabel = 'Todo el histórico';
  }

  // 1. Ingresos
  const ingresos = db.prepare(`
    SELECT 
      COALESCE(SUM(amount), 0) as total,
      COUNT(*) as count,
      COALESCE(SUM(CASE WHEN status = 'disponible' THEN amount ELSE 0 END), 0) as disponible,
      COALESCE(SUM(CASE WHEN status = 'en_dispersion' THEN amount ELSE 0 END), 0) as en_dispersion,
      COALESCE(SUM(CASE WHEN status = 'pagado' THEN amount ELSE 0 END), 0) as pagado
    FROM transactions 
    WHERE type = 'ingreso' ${filter}
  `).get(...params);

  // 2. Egresos
  const egresos = db.prepare(`
    SELECT 
      COALESCE(SUM(amount), 0) as total,
      COUNT(*) as count
    FROM transactions 
    WHERE type = 'gasto' ${filter}
  `).get(...params);

  // 3. Resumen (Balance Neto y Margen)
  const balanceNeto = ingresos.total - egresos.total;
  const margenNeto = ingresos.total > 0 ? ((balanceNeto / ingresos.total) * 100).toFixed(1) : '0.0';

  return {
    period,
    periodLabel,
    ingresos: {
      total: ingresos.total,
      count: ingresos.count,
      disponible: ingresos.disponible,
      en_dispersion: ingresos.en_dispersion,
      pagado: ingresos.pagado,
      label: 'Ingresos',
      subtext: ingresos.count > 0 
        ? `${ingresos.count} cobros · Disp: $${(ingresos.disponible/1000).toFixed(0)}k · Pag: $${(ingresos.pagado/1000).toFixed(0)}k`
        : '0 cobros registrados'
    },
    egresos: {
      total: egresos.total,
      count: egresos.count,
      label: 'Egresos',
      subtext: egresos.count > 0 
        ? `${egresos.count} gastos aplicados` 
        : '0 gastos registrados'
    },
    resumen: {
      total: balanceNeto,
      margen: margenNeto,
      label: `Resumen (${periodLabel})`,
      subtext: `Margen neto +${margenNeto}% · ${balanceNeto >= 0 ? 'Flujo positivo' : 'Déficit'}`
    },
    // Backwards compatibility
    disponible: { total: ingresos.disponible, count: ingresos.count, label: 'Disponible', subtext: `${ingresos.count} · Tú decides` },
    en_dispersion: { total: ingresos.en_dispersion, count: ingresos.count, label: 'En dispersión', subtext: 'Solvento paga' },
    pagado: { total: ingresos.pagado, count: ingresos.count, label: 'Pagado', subtext: 'Cerrado' },
    gastos: { total: egresos.total, count: egresos.count, label: 'Gastos', subtext: `${egresos.count} operaciones` },
    totalIngresos: ingresos.total,
    balanceNeto,
    margenNeto
  };
}

// Financial Reports aggregation (Daily, Weekly, Monthly)
export function getReportData({ type = 'monthly', startDate, endDate, projectId } = {}) {
  let dateFilter = '';
  const params = [];

  const now = new Date();
  if (startDate && endDate) {
    dateFilter = ' AND date >= ? AND date <= ?';
    params.push(startDate, endDate);
  } else if (type === 'daily') {
    const todayStr = now.toISOString().split('T')[0];
    dateFilter += ' AND date = ?';
    params.push(todayStr);
  } else if (type === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff)).toISOString().split('T')[0];
    dateFilter += ' AND date >= ?';
    params.push(monday);
  } else if (type === 'monthly') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    dateFilter += ' AND date >= ?';
    params.push(firstDay);
  }

  if (projectId) {
    dateFilter += ' AND project_id = ?';
    params.push(Number(projectId));
  }

  // Group by date period
  let groupBy = "strftime('%Y-%m-%d', date)";
  if (startDate && endDate) {
    const diffDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
    if (diffDays > 35) {
      groupBy = "strftime('%Y-%m', date)";
    }
  } else if (type === 'yearly') {
    groupBy = "strftime('%Y-%m', date)";
  }

  const timelineQuery = `
    SELECT 
      ${groupBy} as period_key,
      MIN(date) as sample_date,
      SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) as ingresos,
      SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END) as gastos,
      COUNT(*) as tx_count
    FROM transactions
    WHERE 1=1 ${dateFilter}
    GROUP BY ${groupBy}
    ORDER BY period_key ASC
    LIMIT 30
  `;

  const timeline = db.prepare(timelineQuery).all(...params);

  // Group by project
  const projectBreakdown = db.prepare(`
    SELECT 
      COALESCE(p.name, 'Sin Proyecto / Operativo General') as project_name,
      p.client,
      SUM(CASE WHEN t.type = 'ingreso' THEN t.amount ELSE 0 END) as total_income,
      SUM(CASE WHEN t.type = 'gasto' THEN t.amount ELSE 0 END) as total_expense
    FROM transactions t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE 1=1 ${dateFilter}
    GROUP BY t.project_id
    ORDER BY total_income DESC
  `).all(...params);

  // Group by category
  const categoryBreakdown = db.prepare(`
    SELECT 
      category,
      type,
      SUM(amount) as total_amount,
      COUNT(*) as count
    FROM transactions
    WHERE 1=1 ${dateFilter}
    GROUP BY category, type
    ORDER BY total_amount DESC
  `).all(...params);

  return {
    timeline,
    projectBreakdown,
    categoryBreakdown
  };
}

// ================= LOANS / PRÉSTAMOS & CRÉDITOS =================
export function getLoans({ type, status, search } = {}) {
  let query = 'SELECT * FROM loans WHERE 1=1';
  const params = [];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (beneficiary LIKE ? OR notes LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }

  query += ' ORDER BY start_date DESC, id DESC';
  const list = db.prepare(query).all(...params);

  const todayStr = new Date().toISOString().split('T')[0];

  return list.map(l => {
    let currentStatus = l.status;
    if (l.status === 'activo' && l.due_date && l.due_date < todayStr && l.remaining_amount > 0) {
      currentStatus = 'vencido';
      db.prepare('UPDATE loans SET status = ? WHERE id = ?').run('vencido', l.id);
    }

    const payments = db.prepare('SELECT COUNT(*) as count, MAX(date) as last_date FROM loan_payments WHERE loan_id = ?').get(l.id);
    const pct = l.amount > 0 ? Math.min(100, Math.round((l.paid_amount / l.amount) * 100)) : 0;

    return {
      ...l,
      status: currentStatus,
      paid_percentage: pct,
      payments_count: payments ? payments.count : 0,
      last_payment_date: payments ? payments.last_date : null
    };
  });
}

export function getLoanById(id) {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(Number(id));
  if (!loan) return null;

  const payments = db.prepare('SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY date DESC, id DESC').all(Number(id));
  const pct = loan.amount > 0 ? Math.min(100, Math.round((loan.paid_amount / loan.amount) * 100)) : 0;

  return {
    ...loan,
    paid_percentage: pct,
    payments
  };
}

export function createLoan(data) {
  const amount = Number(data.amount || 0);
  const paid_amount = Number(data.paid_amount || 0);
  const remaining_amount = Math.max(0, amount - paid_amount);
  const interest_rate = Number(data.interest_rate || 0);
  const status = remaining_amount <= 0 ? 'liquidado' : (data.status || 'activo');
  const start_date = data.start_date || new Date().toISOString().split('T')[0];
  const due_date = data.due_date || null;
  const beneficiary = (data.beneficiary || '').trim();
  const notes = data.notes || '';
  const type = data.type === 'recibido' ? 'recibido' : 'otorgado';

  const stmt = db.prepare(`
    INSERT INTO loans (type, beneficiary, amount, paid_amount, remaining_amount, interest_rate, start_date, due_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(type, beneficiary, amount, paid_amount, remaining_amount, interest_rate, start_date, due_date, status, notes);

  return {
    id: Number(info.lastInsertRowid),
    type,
    beneficiary,
    amount,
    paid_amount,
    remaining_amount,
    interest_rate,
    start_date,
    due_date,
    status,
    notes,
    paid_percentage: amount > 0 ? Math.min(100, Math.round((paid_amount / amount) * 100)) : 0
  };
}

export function updateLoan(id, data) {
  const existing = db.prepare('SELECT * FROM loans WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const type = data.type !== undefined ? data.type : existing.type;
  const beneficiary = data.beneficiary !== undefined ? data.beneficiary.trim() : existing.beneficiary;
  const amount = data.amount !== undefined ? Number(data.amount) : existing.amount;
  const interest_rate = data.interest_rate !== undefined ? Number(data.interest_rate) : existing.interest_rate;
  const start_date = data.start_date !== undefined ? data.start_date : existing.start_date;
  const due_date = data.due_date !== undefined ? (data.due_date || null) : existing.due_date;
  const notes = data.notes !== undefined ? data.notes : existing.notes;

  const paymentsTotal = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM loan_payments WHERE loan_id = ?').get(Number(id)).total;
  const paid_amount = Number(paymentsTotal);
  const remaining_amount = Math.max(0, amount - paid_amount);
  let status = remaining_amount <= 0 ? 'liquidado' : (data.status || existing.status);
  if (remaining_amount > 0 && status === 'liquidado') {
    status = 'activo';
  }

  const stmt = db.prepare(`
    UPDATE loans SET
      type = ?,
      beneficiary = ?,
      amount = ?,
      paid_amount = ?,
      remaining_amount = ?,
      interest_rate = ?,
      start_date = ?,
      due_date = ?,
      status = ?,
      notes = ?
    WHERE id = ?
  `);
  stmt.run(type, beneficiary, amount, paid_amount, remaining_amount, interest_rate, start_date, due_date, status, notes, Number(id));

  return {
    id: Number(id),
    type,
    beneficiary,
    amount,
    paid_amount,
    remaining_amount,
    interest_rate,
    start_date,
    due_date,
    status,
    notes,
    paid_percentage: amount > 0 ? Math.min(100, Math.round((paid_amount / amount) * 100)) : 0
  };
}

export function deleteLoan(id) {
  db.prepare('DELETE FROM loan_payments WHERE loan_id = ?').run(Number(id));
  return db.prepare('DELETE FROM loans WHERE id = ?').run(Number(id));
}

export function addLoanPayment(loanId, { amount, date, payment_method, notes }) {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(Number(loanId));
  if (!loan) throw new Error('Préstamo no encontrado');

  const payAmount = Number(amount || 0);
  const payDate = date || new Date().toISOString().split('T')[0];
  const payMethod = payment_method || 'Transferencia SPEI';
  const payNotes = notes || '';

  const stmt = db.prepare(`
    INSERT INTO loan_payments (loan_id, amount, date, payment_method, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const info = stmt.run(Number(loanId), payAmount, payDate, payMethod, payNotes);

  const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM loan_payments WHERE loan_id = ?').get(Number(loanId)).total;
  const newPaid = Number(totalPaid);
  const newRemaining = Math.max(0, Number(loan.amount) - newPaid);
  const newStatus = newRemaining <= 0 ? 'liquidado' : 'activo';

  db.prepare('UPDATE loans SET paid_amount = ?, remaining_amount = ?, status = ? WHERE id = ?')
    .run(newPaid, newRemaining, newStatus, Number(loanId));

  return {
    payment: {
      id: Number(info.lastInsertRowid),
      loan_id: Number(loanId),
      amount: payAmount,
      date: payDate,
      payment_method: payMethod,
      notes: payNotes
    },
    loan: {
      id: Number(loanId),
      amount: loan.amount,
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      paid_percentage: loan.amount > 0 ? Math.min(100, Math.round((newPaid / loan.amount) * 100)) : 0
    }
  };
}

export function getLoanPayments(loanId) {
  return db.prepare('SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY date DESC, id DESC').all(Number(loanId));
}

export function deleteLoanPayment(paymentId) {
  const payment = db.prepare('SELECT * FROM loan_payments WHERE id = ?').get(Number(paymentId));
  if (!payment) return null;

  const loanId = payment.loan_id;
  db.prepare('DELETE FROM loan_payments WHERE id = ?').run(Number(paymentId));

  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
  if (loan) {
    const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM loan_payments WHERE loan_id = ?').get(loanId).total;
    const newPaid = Number(totalPaid);
    const newRemaining = Math.max(0, Number(loan.amount) - newPaid);
    const newStatus = newRemaining <= 0 ? 'liquidado' : 'activo';
    db.prepare('UPDATE loans SET paid_amount = ?, remaining_amount = ?, status = ? WHERE id = ?')
      .run(newPaid, newRemaining, newStatus, loanId);
  }

  return { success: true, id: paymentId, loan_id: loanId };
}

export function getLoansSummary() {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'otorgado' THEN amount ELSE 0 END), 0) as total_otorgados,
      COALESCE(SUM(CASE WHEN type = 'otorgado' THEN remaining_amount ELSE 0 END), 0) as saldo_otorgados,
      COALESCE(SUM(CASE WHEN type = 'recibido' THEN amount ELSE 0 END), 0) as total_recibidos,
      COALESCE(SUM(CASE WHEN type = 'recibido' THEN remaining_amount ELSE 0 END), 0) as saldo_recibidos,
      COALESCE(SUM(paid_amount), 0) as total_pagado,
      COUNT(CASE WHEN status = 'activo' THEN 1 END) as activos_count,
      COUNT(CASE WHEN status = 'vencido' THEN 1 END) as vencidos_count,
      COUNT(CASE WHEN status = 'liquidado' THEN 1 END) as liquidados_count,
      COUNT(*) as total_loans
    FROM loans
  `).get();

  return row || {
    total_otorgados: 0,
    saldo_otorgados: 0,
    total_recibidos: 0,
    saldo_recibidos: 0,
    total_pagado: 0,
    activos_count: 0,
    vencidos_count: 0,
    liquidados_count: 0,
    total_loans: 0
  };
}
