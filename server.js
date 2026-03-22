const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Recipe per bread (kg)
const RECIPE = {
  'Мука':       0.3885,
  'Вода':       0.2075,
  'Соль':       0.007,
  'Дрожжи':     0.00078,
  'Улучшитель': 0.00117,
  'Дрова':      0.078125
};

const DOUGH_INGREDIENTS = ['Мука', 'Вода', 'Соль', 'Дрожжи', 'Улучшитель'];
const PACKAGE_PRICE = 200;
const PACKAGE_THRESHOLD = 4500;

// ─── DB helpers ──────────────────────────────────────────────────────────────

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const def = {
      inventory: [
        { id: 1, name: 'Мука',       quantity: 50,  unit: 'кг', minLevel: 5,   price: 1500  },
        { id: 2, name: 'Вода',       quantity: 100, unit: 'кг', minLevel: 10,  price: 0     },
        { id: 3, name: 'Соль',       quantity: 10,  unit: 'кг', minLevel: 1,   price: 500   },
        { id: 4, name: 'Дрожжи',     quantity: 2,   unit: 'кг', minLevel: 0.2, price: 15000 },
        { id: 5, name: 'Улучшитель', quantity: 1,   unit: 'кг', minLevel: 0.1, price: 20000 },
        { id: 6, name: 'Дрова',      quantity: 20,  unit: 'кг', minLevel: 2,   price: 500   }
      ],
      history: [],
      nextId: { inventory: 7, history: 1 }
    };
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(def, null, 2));
    return def;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normName(name) {
  return name.trim().toLowerCase();
}

function findByName(inventory, name) {
  return inventory.find(i => normName(i.name) === normName(name));
}

// ─── Production helpers ───────────────────────────────────────────────────────

function calcIngredients(produced) {
  const needed = {};
  for (const [n, amt] of Object.entries(RECIPE)) needed[n] = amt * produced;
  return needed;
}

function calcDoughMass(needed) {
  return DOUGH_INGREDIENTS.reduce((s, n) => s + (needed[n] || 0), 0);
}

function calcPackaging(produced, price) {
  if (price <= PACKAGE_THRESHOLD) {
    const packages = Math.floor(produced / 2);
    return { packages, packageCost: packages * PACKAGE_PRICE };
  }
  return { packages: 0, packageCost: 0 };
}

function calcTotalCost(db, needed, packageCost) {
  let cost = 0;
  for (const [name, amt] of Object.entries(needed)) {
    const item = findByName(db.inventory, name);
    if (item) cost += amt * item.price;
  }
  return cost + packageCost;
}

function checkShortages(db, needed) {
  const shortages = [];
  for (const [name, amt] of Object.entries(needed)) {
    const item = findByName(db.inventory, name);
    const avail = item ? item.quantity : 0;
    if (avail < amt) shortages.push({ name, needed: amt, available: avail });
  }
  return shortages;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

app.get('/api/inventory', (req, res) => {
  res.json(readDB().inventory);
});

app.post('/api/inventory', (req, res) => {
  const db = readDB();
  const { name, quantity, unit, minLevel, price } = req.body;
  if (!name || quantity == null) return res.status(400).json({ error: 'Название и количество обязательны' });

  const existing = findByName(db.inventory, name);
  if (existing) {
    existing.quantity += parseFloat(quantity);
    writeDB(db);
    return res.json(existing);
  }

  const item = {
    id: db.nextId.inventory++,
    name: name.trim(),
    quantity: parseFloat(quantity),
    unit: unit || 'кг',
    minLevel: parseFloat(minLevel) || 0,
    price: parseFloat(price) || 0
  };
  db.inventory.push(item);
  writeDB(db);
  res.json(item);
});

app.put('/api/inventory/:id', (req, res) => {
  const db = readDB();
  const item = db.inventory.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  const { name, quantity, unit, minLevel, price } = req.body;
  if (name     != null) item.name     = name.trim();
  if (quantity != null) item.quantity = parseFloat(quantity);
  if (unit     != null) item.unit     = unit;
  if (minLevel != null) item.minLevel = parseFloat(minLevel);
  if (price    != null) item.price    = parseFloat(price);
  writeDB(db);
  res.json(item);
});

app.delete('/api/inventory/:id', (req, res) => {
  const db = readDB();
  const idx = db.inventory.findIndex(i => i.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  db.inventory.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ─── Production ───────────────────────────────────────────────────────────────

app.post('/api/production/check', (req, res) => {
  const db = readDB();
  const produced = parseInt(req.body.produced);
  const price    = parseFloat(req.body.price);
  if (!produced || !price) return res.status(400).json({ error: 'Введите количество и цену' });

  const needed = calcIngredients(produced);
  const shortages = checkShortages(db, needed);
  if (shortages.length) return res.json({ ok: false, shortages });

  const { packages, packageCost } = calcPackaging(produced, price);
  const doughMass           = calcDoughMass(needed);
  const totalProductionCost = calcTotalCost(db, needed, packageCost);
  const costPerBread        = totalProductionCost / produced;

  res.json({ ok: true, produced, price, needed, doughMass, packages, packageCost, totalProductionCost, costPerBread });
});

app.post('/api/production/save', (req, res) => {
  const db       = readDB();
  const produced = parseInt(req.body.produced);
  const sold     = parseInt(req.body.sold);
  const price    = parseFloat(req.body.price);

  if (isNaN(produced) || isNaN(sold) || isNaN(price))
    return res.status(400).json({ error: 'Неверные данные' });
  if (sold > produced)
    return res.status(400).json({ error: 'Продано не может превышать произведено' });

  const needed = calcIngredients(produced);
  const shortages = checkShortages(db, needed);
  if (shortages.length) return res.status(400).json({ error: 'Недостаточно ингредиентов', shortages });

  // Deduct inventory
  for (const [name, amt] of Object.entries(needed)) {
    const item = findByName(db.inventory, name);
    if (item) item.quantity -= amt;
  }

  const { packages, packageCost } = calcPackaging(produced, price);
  const doughMass           = calcDoughMass(needed);
  const totalProductionCost = calcTotalCost(db, needed, packageCost);
  const costPerBread        = totalProductionCost / produced;
  const costForSold         = costPerBread * sold;
  const revenue             = sold * price;
  const profit              = revenue - costForSold;

  const record = {
    id: db.nextId.history++,
    date: new Date().toISOString(),
    produced, sold, losses: 0, price,
    packages, packageCost,
    doughMass,
    ingredientsUsed: needed,
    totalProductionCost, costPerBread, costForSold,
    lossAmount: 0, revenue, profit
  };

  db.history.push(record);
  writeDB(db);
  res.json(record);
});

// ─── Losses ───────────────────────────────────────────────────────────────────

app.post('/api/history/:id/losses', (req, res) => {
  const db = readDB();
  const record = db.history.find(h => h.id === parseInt(req.params.id));
  if (!record) return res.status(404).json({ error: 'Запись не найдена' });

  const losses = parseInt(req.body.losses);
  if (isNaN(losses) || losses < 0) return res.status(400).json({ error: 'Неверное количество' });
  if (record.sold + losses > record.produced)
    return res.status(400).json({ error: 'Продано + убытки не могут превышать произведено' });

  record.losses     = losses;
  record.lossAmount = record.costPerBread * losses;
  record.profit     = record.revenue - record.costForSold - record.lossAmount;

  writeDB(db);
  res.json(record);
});

// ─── History ─────────────────────────────────────────────────────────────────

app.get('/api/history', (req, res) => {
  const db = readDB();
  res.json([...db.history].reverse());
});

app.delete('/api/history/:id', (req, res) => {
  const db = readDB();
  const idx = db.history.findIndex(h => h.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Запись не найдена' });
  db.history.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ─── Statistics ───────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const db    = readDB();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const sum = records => ({
    produced:   records.reduce((s, r) => s + r.produced,   0),
    sold:       records.reduce((s, r) => s + r.sold,       0),
    losses:     records.reduce((s, r) => s + r.losses,     0),
    revenue:    records.reduce((s, r) => s + r.revenue,    0),
    cost:       records.reduce((s, r) => s + r.costForSold,0),
    lossAmount: records.reduce((s, r) => s + r.lossAmount, 0),
    profit:     records.reduce((s, r) => s + r.profit,     0)
  });

  res.json({
    daily:   sum(db.history.filter(h => h.date.startsWith(today))),
    monthly: sum(db.history.filter(h => h.date.startsWith(month)))
  });
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bakeri ERP running on http://0.0.0.0:${PORT}`);
});
