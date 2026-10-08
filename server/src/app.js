import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { initDb } from './db.js';
import authRouter from './routes/auth.js';
import dispatchersRouter from './routes/dispatchers.js';
import carsRouter from './routes/cars.js';
import carHubRouter from './routes/car-hub.js';
import driversRouter from './routes/drivers.js';
import driverWaitlistRouter from './routes/driver-waitlist.js';
import paymentsRouter from './routes/payments.js';
import auditRouter from './routes/audit.js';
import ownersRouter from './routes/owners.js';
import financeRouter from './routes/finance.js';
import dashboardRouter from './routes/dashboard.js';
import assignmentsRouter from './routes/assignments.js';
import dailyReportsRouter from './routes/daily-reports.js';
import serviceRouter from './routes/service.js';
import notificationsRouter from './routes/notifications.js';
import reportsRouter from './routes/reports.js';
import settingsRouter from './routes/settings.js';
import branchesRouter from './routes/branches.js';

const app = express();

const allowedOrigins = new Set([
  config.corsOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    next(err);
  }
});

// Подключаем маршруты
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/dispatchers', dispatchersRouter);
app.use('/api/v1/cars', carHubRouter);
app.use('/api/v1/cars', carsRouter);
app.use('/api/v1/drivers', driversRouter);
app.use('/api/v1/driver-waitlist', driverWaitlistRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/owners', ownersRouter);
app.use('/api/v1/finance', financeRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/assignments', assignmentsRouter);
app.use('/api/v1/daily-reports', dailyReportsRouter);
app.use('/api/v1/service', serviceRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/branches', branchesRouter);

// Проверка работоспособности API
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Маршрут не найден', url: req.url },
  });
});

// Глобальный обработчик ошибок (должен быть последним)
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
});

if (process.env.VERCEL !== '1') {
  app.listen(config.port, () => {
    console.log(`Сервер Qween запущен на порту ${config.port}`);
  });
}

export default app;