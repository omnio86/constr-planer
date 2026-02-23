const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { fromPath } = require('pdf2pic');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const config = require('../config/config.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Хранилище данных
const USERS_FILE = path.join(__dirname, 'users.json');
const PROJECTS_FILE = path.join(__dirname, 'projects.json');
const OPERATIONS_FILE = path.join(__dirname, 'operations.json');

// Загрузка данных
function loadData(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Запись операции в историю
function recordOperation(userId, type, tokensChange, description = '') {
  const operations = loadData(OPERATIONS_FILE);
  if (!operations[userId]) {
    operations[userId] = [];
  }
  
  operations[userId].unshift({
    id: uuidv4(),
    type,
    tokensChange,
    description,
    createdAt: new Date().toISOString()
  });
  
  // Храним максимум 100 операций
  if (operations[userId].length > 100) {
    operations[userId] = operations[userId].slice(0, 100);
  }
  
  saveData(OPERATIONS_FILE, operations);
}

// Инициализация superadmin
let users = loadData(USERS_FILE);
if (!users[config.superAdmin.username]) {
  users[config.superAdmin.username] = {
    id: uuidv4(),
    username: config.superAdmin.username,
    password: config.superAdmin.password,
    tokens: 999999,
    isAdmin: true,
    createdAt: new Date().toISOString()
  };
  saveData(USERS_FILE, users);
}

// Middleware для проверки JWT
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

// Настройка загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Настройка загрузки изображений для nanobanana
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads/nanobanana');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// ==================== API МАРШРУТЫ ====================

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }
  
  const users = loadData(USERS_FILE);
  if (users[username]) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  users[username] = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    tokens: config.defaultTokens,
    isAdmin: false,
    createdAt: new Date().toISOString()
  };
  saveData(USERS_FILE, users);
  
  // Записываем операцию регистрации
  recordOperation(users[username].id, 'registration', config.defaultTokens, 'Бонус за регистрацию');
  
  res.json({ message: 'Пользователь создан' });
});

// Авторизация
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const users = loadData(USERS_FILE);
  const user = users[username];
  
  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  
  // Проверка для superadmin (plain text) или обычного пользователя (bcrypt)
  let validPassword = false;
  if (username === config.superAdmin.username && password === config.superAdmin.password) {
    validPassword = true;
  } else {
    validPassword = await bcrypt.compare(password, user.password);
  }
  
  if (!validPassword) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  
  const token = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.isAdmin },
    config.jwtSecret,
    { expiresIn: '24h' }
  );
  
  res.json({ 
    token, 
    username: user.username, 
    tokens: user.tokens,
    isAdmin: user.isAdmin 
  });
});

// Получение информации о пользователе
app.get('/api/user', authMiddleware, (req, res) => {
  const users = loadData(USERS_FILE);
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  
  res.json({
    username: user.username,
    tokens: user.tokens,
    isAdmin: user.isAdmin
  });
});

// Получение истории операций
app.get('/api/user/operations', authMiddleware, (req, res) => {
  const users = loadData(USERS_FILE);
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  
  const operations = loadData(OPERATIONS_FILE);
  const userOperations = operations[user.id] || [];
  
  res.json(userOperations);
});

// Покупка токенов
app.post('/api/user/buy-tokens', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const users = loadData(USERS_FILE);
  const user = users[req.user.username];
  
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  
  const tokenAmount = parseInt(amount) || 0;
  // В реальном приложении здесь была бы интеграция с платежной системой
  user.tokens += tokenAmount;
  saveData(USERS_FILE, users);
  
  // Записываем операцию покупки
  recordOperation(user.id, 'purchase', tokenAmount, `Покупка ${tokenAmount} токенов`);
  
  res.json({ message: 'Токены добавлены', tokens: user.tokens });
});

// Загрузка PDF
app.post('/api/projects/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { projectName } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    
    const users = loadData(USERS_FILE);
    const user = users[req.user.username];
    
    if (user.tokens < 1) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Недостаточно токенов' });
    }
    
    // Парсинг PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    
    // Создаем список страниц (превью будут генерироваться на клиенте)
    const pageImages = [];
    for (let i = 1; i <= pdfData.numpages; i++) {
      pageImages.push({
        page: i,
        image: `/uploads/${path.basename(req.file.path)}`,
        pageNum: i
      });
    }
    
    // Создание проекта
    const projects = loadData(PROJECTS_FILE);
    const projectId = uuidv4();
    projects[projectId] = {
      id: projectId,
      name: projectName,
      userId: user.id,
      pdfPath: req.file.path,
      pageCount: pdfData.numpages,
      pages: pageImages,
      status: 'uploaded',
      createdAt: new Date().toISOString()
    };
    saveData(PROJECTS_FILE, projects);
    
    // Списание токена
    user.tokens -= 1;
    saveData(USERS_FILE, users);
    
    // Записываем операцию
    recordOperation(user.id, 'upload', -1, `Загрузка проекта "${projectName}"`);
    
    res.json({
      projectId,
      name: projectName,
      pageCount: pdfData.numpages,
      pages: pageImages,
      tokensLeft: user.tokens
    });
  } catch (err) {
    console.error('Ошибка загрузки:', err);
    res.status(500).json({ error: 'Ошибка обработки PDF' });
  }
});

// Обработка выбранной страницы
app.post('/api/projects/:projectId/process', authMiddleware, async (req, res) => {
  try {
    const { pageNumber, installPiles, pileDistance } = req.body;
    const projects = loadData(PROJECTS_FILE);
    const project = projects[req.params.projectId];
    
    if (!project) return res.status(404).json({ error: 'Проект не найден' });
    if (project.userId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    
    const users = loadData(USERS_FILE);
    const user = users[req.user.username];
    
    if (user.tokens < 2) {
      return res.status(403).json({ error: 'Недостаточно токенов (требуется 2)' });
    }
    
    // Получаем путь к изображению страницы
    const pageData = project.pages.find(p => p.page === parseInt(pageNumber));
    if (!pageData) return res.status(404).json({ error: 'Страница не найдена' });
    
    // Отправляем на обработку в Nobanana API (заглушка)
    // В реальном приложении здесь был бы реальный API вызов
    const analysisResult = await analyzeBlueprint(
      path.join(__dirname, '../public', pageData.image),
      { installPiles, pileDistance }
    );
    
    // Обновляем проект
    project.status = 'processed';
    project.selectedPage = parseInt(pageNumber);
    project.analysis = analysisResult;
    project.pileOptions = { installPiles, pileDistance: parseFloat(pileDistance) || 2 };
    saveData(PROJECTS_FILE, projects);
    
    // Списание токенов
    user.tokens -= 2;
    saveData(USERS_FILE, users);
    
    // Записываем операцию
    recordOperation(user.id, 'processing', -2, `Обработка проекта "${project.name}"`);
    
    res.json({
      projectId: project.id,
      status: 'processed',
      analysis: analysisResult,
      tokensLeft: user.tokens
    });
  } catch (err) {
    console.error('Ошибка обработки:', err);
    res.status(500).json({ error: 'Ошибка обработки чертежа' });
  }
});

// Имитация анализа чертежа
async function analyzeBlueprint(imagePath, options) {
  // Заглушка - в реальности здесь был бы API вызов к Nobanana
  return {
    walls: [
      { id: 1, length: 5.2, type: 'new', x1: 100, y1: 100, x2: 620, y2: 100 },
      { id: 2, length: 3.8, type: 'new', x1: 620, y1: 100, x2: 620, y2: 480 },
      { id: 3, length: 5.2, type: 'new', x1: 100, y1: 480, x2: 620, y2: 480 },
      { id: 4, length: 3.8, type: 'existing', x1: 100, y1: 100, x2: 100, y2: 480 }
    ],
    totalNewWallLength: 14.2,
    rooms: [
      { id: 1, area: 19.76, name: 'Комната 1' }
    ],
    pilesNeeded: options.installPiles ? Math.ceil(14.2 / (options.pileDistance || 2)) : 0,
    pileDistance: options.pileDistance || 2,
    objects3D: [
      { type: 'wall', x: 0, y: 0, z: 0, width: 5.2, height: 2.7, depth: 0.2, color: '#FF6B6B' },
      { type: 'wall', x: 5.2, y: 0, z: 0, width: 0.2, height: 2.7, depth: 3.8, color: '#FF6B6B' },
      { type: 'wall', x: 0, y: 0, z: 3.8, width: 5.2, height: 2.7, depth: 0.2, color: '#FF6B6B' }
    ]
  };
}

// Получение проекта
app.get('/api/projects/:projectId', authMiddleware, (req, res) => {
  const projects = loadData(PROJECTS_FILE);
  const project = projects[req.params.projectId];
  
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  if (project.userId !== req.user.userId && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  
  res.json(project);
});

// Получение всех проектов пользователя
app.get('/api/projects', authMiddleware, (req, res) => {
  const projects = loadData(PROJECTS_FILE);
  const userProjects = Object.values(projects).filter(
    p => p.userId === req.user.userId || req.user.isAdmin
  );
  res.json(userProjects);
});

// Удаление проекта
app.delete('/api/projects/:projectId', authMiddleware, (req, res) => {
  try {
    const projects = loadData(PROJECTS_FILE);
    const project = projects[req.params.projectId];

    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    if (project.userId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    // Удаляем PDF файл
    if (project.pdfPath && fs.existsSync(project.pdfPath)) {
      fs.unlinkSync(project.pdfPath);
    }

    // Удаляем проект из данных
    delete projects[req.params.projectId];
    saveData(PROJECTS_FILE, projects);

    res.json({ message: 'Проект успешно удален' });
  } catch (err) {
    console.error('Ошибка удаления проекта:', err);
    res.status(500).json({ error: 'Ошибка удаления проекта' });
  }
});

// Генерация Excel сметы
app.get('/api/projects/:projectId/export/excel', authMiddleware, async (req, res) => {
  try {
    console.log(`[Excel Export] Starting export for project: ${req.params.projectId}`);
    
    const projects = loadData(PROJECTS_FILE);
    const project = projects[req.params.projectId];
    
    if (!project) {
      console.log(`[Excel Export] Project not found: ${req.params.projectId}`);
      return res.status(404).json({ error: 'Проект не найден' });
    }
    
    if (!project.analysis) {
      console.log(`[Excel Export] Project not processed: ${req.params.projectId}`);
      return res.status(400).json({ error: 'Проект не обработан. Сначала выполните анализ чертежа.' });
    }
    
    if (!project.analysis.walls || !Array.isArray(project.analysis.walls)) {
      console.log(`[Excel Export] Invalid analysis data for project: ${req.params.projectId}`);
      return res.status(400).json({ error: 'Некорректные данные анализа проекта' });
    }
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Смета');
    
    // Заголовки
    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = `Смета по проекту: ${project.name}`;
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    
    worksheet.getCell('A3').value = 'Дата создания:';
    worksheet.getCell('B3').value = new Date().toLocaleDateString('ru-RU');
    
    // Таблица стен
    worksheet.getCell('A5').value = 'Стены';
    worksheet.getCell('A5').font = { bold: true, size: 14 };
    
    worksheet.getRow(6).values = ['№', 'Тип', 'Длина (м)', 'Примечание'];
    worksheet.getRow(6).font = { bold: true };
    
    let row = 7;
    project.analysis.walls.forEach((wall, idx) => {
      worksheet.getRow(row).values = [
        idx + 1,
        wall.type === 'new' ? 'Новая' : 'Существующая',
        wall.length,
        wall.type === 'new' ? 'Требуется строительство' : 'Уже существует'
      ];
      row++;
    });
    
    worksheet.getRow(row).values = ['', 'ИТОГО новых стен:', project.analysis.totalNewWallLength, 'м'];
    worksheet.getRow(row).font = { bold: true };
    
    // Сваи
    if (project.pileOptions?.installPiles) {
      row += 2;
      worksheet.getCell(`A${row}`).value = 'Фундамент на сваях';
      worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
      
      row++;
      worksheet.getRow(row).values = ['Параметр', 'Значение'];
      worksheet.getRow(row).font = { bold: true };
      
      row++;
      worksheet.getRow(row).values = ['Расстояние между сваями', `${project.pileOptions.pileDistance} м`];
      
      row++;
      worksheet.getRow(row).values = ['Количество свай', project.analysis.pilesNeeded];
      worksheet.getRow(row).font = { bold: true };
    }
    
    // Стоимость (примерная)
    row += 2;
    worksheet.getCell(`A${row}`).value = 'Смета расходов';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    
    row++;
    worksheet.getRow(row).values = ['Наименование работ', 'Количество', 'Цена за ед.', 'Сумма'];
    worksheet.getRow(row).font = { bold: true };
    
    const wallPrice = 3500; // руб/м
    const pilePrice = 2500; // руб/шт
    
    row++;
    worksheet.getRow(row).values = [
      'Возведение новых стен',
      `${project.analysis.totalNewWallLength} м`,
      `${wallPrice} руб.`,
      `${project.analysis.totalNewWallLength * wallPrice} руб.`
    ];
    
    if (project.pileOptions?.installPiles) {
      row++;
      worksheet.getRow(row).values = [
        'Установка свай',
        `${project.analysis.pilesNeeded} шт`,
        `${pilePrice} руб.`,
        `${project.analysis.pilesNeeded * pilePrice} руб.`
      ];
    }
    
    row++;
    const total = project.analysis.totalNewWallLength * wallPrice + 
                  (project.pileOptions?.installPiles ? project.analysis.pilesNeeded * pilePrice : 0);
    worksheet.getRow(row).values = ['ИТОГО:', '', '', `${total} руб.`];
    worksheet.getRow(row).font = { bold: true, size: 12 };
    
    // Автоширина колонок
    worksheet.columns.forEach(column => {
      column.width = 25;
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="smeta_${project.name}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
    
    console.log(`[Excel Export] Successfully exported project: ${req.params.projectId}`);
  } catch (err) {
    console.error('[Excel Export] Error:', err.message);
    console.error('[Excel Export] Stack:', err.stack);
    res.status(500).json({ error: 'Ошибка генерации Excel: ' + err.message });
  }
});

// Генерация PDF сметы
app.get('/api/projects/:projectId/export/pdf', authMiddleware, async (req, res) => {
  let browser = null;
  try {
    console.log(`[PDF Export] Starting export for project: ${req.params.projectId}`);
    
    const projects = loadData(PROJECTS_FILE);
    const project = projects[req.params.projectId];
    
    if (!project) {
      console.log(`[PDF Export] Project not found: ${req.params.projectId}`);
      return res.status(404).json({ error: 'Проект не найден' });
    }
    
    if (!project.analysis) {
      console.log(`[PDF Export] Project not processed: ${req.params.projectId}`);
      return res.status(400).json({ error: 'Проект не обработан. Сначала выполните анализ чертежа.' });
    }
    
    console.log(`[PDF Export] Launching puppeteer...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    const wallPrice = 3500;
    const pilePrice = 2500;
    const total = project.analysis.totalNewWallLength * wallPrice + 
                  (project.pileOptions?.installPiles ? project.analysis.pilesNeeded * pilePrice : 0);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { text-align: center; color: #333; }
          h2 { color: #555; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .total { font-weight: bold; font-size: 14px; background-color: #e8f4f8; }
          .header-info { margin-bottom: 30px; }
          .new-wall { color: #FF6B6B; }
        </style>
      </head>
      <body>
        <h1>Смета по проекту: ${project.name}</h1>
        <div class="header-info">
          <p><strong>Дата создания:</strong> ${new Date().toLocaleDateString('ru-RU')}</p>
        </div>
        
        <h2>Стены</h2>
        <table>
          <tr>
            <th>№</th>
            <th>Тип</th>
            <th>Длина (м)</th>
            <th>Примечание</th>
          </tr>
          ${project.analysis.walls.map((wall, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td class="${wall.type === 'new' ? 'new-wall' : ''}">${wall.type === 'new' ? 'Новая' : 'Существующая'}</td>
              <td>${wall.length}</td>
              <td>${wall.type === 'new' ? 'Требуется строительство' : 'Уже существует'}</td>
            </tr>
          `).join('')}
          <tr class="total">
            <td></td>
            <td>ИТОГО новых стен:</td>
            <td>${project.analysis.totalNewWallLength} м</td>
            <td></td>
          </tr>
        </table>
        
        ${project.pileOptions?.installPiles ? `
          <h2>Фундамент на сваях</h2>
          <table>
            <tr>
              <th>Параметр</th>
              <th>Значение</th>
            </tr>
            <tr>
              <td>Расстояние между сваями</td>
              <td>${project.pileOptions.pileDistance} м</td>
            </tr>
            <tr class="total">
              <td>Количество свай</td>
              <td>${project.analysis.pilesNeeded} шт</td>
            </tr>
          </table>
        ` : ''}
        
        <h2>Смета расходов</h2>
        <table>
          <tr>
            <th>Наименование работ</th>
            <th>Количество</th>
            <th>Цена за ед.</th>
            <th>Сумма</th>
          </tr>
          <tr>
            <td>Возведение новых стен</td>
            <td>${project.analysis.totalNewWallLength} м</td>
            <td>${wallPrice} руб.</td>
            <td>${project.analysis.totalNewWallLength * wallPrice} руб.</td>
          </tr>
          ${project.pileOptions?.installPiles ? `
            <tr>
              <td>Установка свай</td>
              <td>${project.analysis.pilesNeeded} шт</td>
              <td>${pilePrice} руб.</td>
              <td>${project.analysis.pilesNeeded * pilePrice} руб.</td>
            </tr>
          ` : ''}
          <tr class="total">
            <td colspan="3"><strong>ИТОГО:</strong></td>
            <td><strong>${total} руб.</strong></td>
          </tr>
        </table>
      </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="smeta_${project.name}.pdf"`);
    res.send(pdf);
    
    console.log(`[PDF Export] Successfully exported project: ${req.params.projectId}`);
  } catch (err) {
    console.error('[PDF Export] Error:', err.message);
    console.error('[PDF Export] Stack:', err.stack);
    res.status(500).json({ error: 'Ошибка генерации PDF: ' + err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Генерация 3D визуализации
app.get('/api/projects/:projectId/visualization', authMiddleware, (req, res) => {
  const projects = loadData(PROJECTS_FILE);
  const project = projects[req.params.projectId];
  
  if (!project || !project.analysis) {
    return res.status(404).json({ error: 'Проект или анализ не найден' });
  }
  
  res.json({
    objects3D: project.analysis.objects3D,
    walls: project.analysis.walls,
    totalNewWallLength: project.analysis.totalNewWallLength
  });
});

// Тестирование nanobanana API
app.post('/api/nanobanana/test', authMiddleware, uploadImage.single('image'), async (req, res) => {
  try {
    const { apiKey, prompt } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }
    
    if (!apiKey) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'API ключ обязателен' });
    }
    
    if (!prompt) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Промт обязателен' });
    }
    
    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Заглушка для имитации вызова nanobanana API
    // В реальном приложении здесь был бы реальный API вызов к nanobanana
    console.log(`[Nanobanana Test] Calling API with key: ${apiKey.substring(0, 10)}...`);
    console.log(`[Nanobanana Test] Prompt: ${prompt}`);
    console.log(`[Nanobanana Test] Image size: ${imageBuffer.length} bytes`);
    
    // Имитация обработки - возвращаем загруженное изображение как "результат"
    // В реальном сценарии здесь был бы реальный API вызов:
    // const response = await axios.post('https://api.nanobanana.ai/v1/generate', {
    //   apiKey,
    //   prompt,
    //   image: base64Image
    // });
    
    // Для демонстрации возвращаем загруженное изображение с наложенным текстом
    // или просто ссылку на загруженное изображение как результат
    await simulateNanobananaProcessing();
    
    // Копируем изображение как "результат" с уникальным именем
    const resultFileName = `result-${uuidv4()}-${req.file.originalname}`;
    const resultPath = path.join(__dirname, '../public/uploads/nanobanana', resultFileName);
    fs.copyFileSync(imagePath, resultPath);
    
    // Удаляем оригинал после копирования
    fs.unlinkSync(imagePath);
    
    const resultUrl = `/uploads/nanobanana/${resultFileName}`;
    
    res.json({
      success: true,
      resultUrl,
      message: 'Генерация завершена успешно'
    });
    
  } catch (err) {
    console.error('[Nanobanana Test] Error:', err.message);
    
    // Очистка загруженного файла в случае ошибки
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Ошибка при обработке запроса: ' + err.message });
  }
});

// Имитация задержки обработки nanobanana
function simulateNanobananaProcessing() {
  return new Promise(resolve => setTimeout(resolve, 2000));
}

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в браузере`);
});
