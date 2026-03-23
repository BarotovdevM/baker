'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let currentSection = 'warehouse';
let inventory   = [];
let salesHistory = [];
let calcData    = null; // last successful check result

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbar-date').textContent = fmtDateLong(new Date());

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.section));
  });

  navigate('warehouse');
});

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });

  const titles = {
    'warehouse':      'Склад ингредиентов',
    'add-ingredient': 'Добавить ингредиент',
    'del-ingredient': 'Удалить ингредиент',
    'production':     'Расчёт производства',
    'history':        'История продаж',
    'del-history':    'Удалить запись',
    'losses':         'Списать убытки',
    'stats':          'Статистика'
  };
  document.getElementById('page-title').textContent = titles[section] || '';

  const renders = {
    'warehouse':      renderWarehouse,
    'add-ingredient': renderAddIngredient,
    'del-ingredient': renderDelIngredient,
    'production':     renderProduction,
    'history':        renderHistory,
    'del-history':    renderDelHistory,
    'losses':         renderLosses,
    'stats':          renderStats
  };

  if (renders[section]) renders[section]();
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(method, url, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok && !data.error) data.error = `Ошибка сервера (${r.status})`;
    return data;
  } catch (e) {
    toast('❌ Ошибка соединения с сервером');
    return { error: e.message };
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml, confirmLabel, confirmClass, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = confirmLabel;
  btn.className = `btn ${confirmClass}`;
  btn.onclick = () => { closeModal(); onConfirm(); };
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtNum(n, dec = 4) { return parseFloat(n.toFixed(dec)); }
function fmtSum(n) { return Math.round(n).toLocaleString('ru') + ' сум'; }
function fmtKg(n)  { return parseFloat(n.toFixed(4)) + ' кг'; }

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtDateLong(d) {
  return d.toLocaleDateString('ru', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function stockStatus(item) {
  if (item.quantity < item.minLevel)            return { cls: 'badge-red',    txt: '🔴 Ниже нормы' };
  if (item.quantity < item.minLevel * 2)        return { cls: 'badge-yellow', txt: '🟡 Мало'       };
  return                                               { cls: 'badge-green',  txt: '🟢 Норма'      };
}

// ─── 1. Warehouse ─────────────────────────────────────────────────────────────
async function renderWarehouse() {
  const data = await api('GET', '/api/inventory');
  inventory = data;
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="card-title" style="margin:0;border:none;padding:0;">Ингредиенты на складе</div>
        <button class="btn btn-primary btn-sm" onclick="navigate('add-ingredient')">➕ Добавить</button>
      </div>
      <div class="table-wrap" style="margin-top:1rem;">
        <table>
          <thead>
            <tr>
              <th>Ингредиент</th>
              <th>Количество</th>
              <th>Минимум</th>
              <th>Цена / кг</th>
              <th>Статус</th>
              <th>Запас</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${inventory.map(item => {
              const st = stockStatus(item);
              const pct = item.minLevel > 0 ? Math.min(100, (item.quantity / (item.minLevel * 2)) * 100) : 100;
              const barColor = st.cls === 'badge-green' ? '#27ae60' : st.cls === 'badge-yellow' ? '#f39c12' : '#c0392b';
              return `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td>${fmtKg(item.quantity)}</td>
                  <td>${fmtKg(item.minLevel)}</td>
                  <td>${item.price.toLocaleString('ru')} сум</td>
                  <td><span class="badge ${st.cls}">${st.txt}</span></td>
                  <td style="min-width:100px;">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:${pct}%;background:${barColor};"></div>
                    </div>
                  </td>
                  <td>
                    <button class="btn btn-ghost btn-sm" onclick="editIngredient(${item.id})">✏️</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${inventory.length === 0 ? '<p style="text-align:center;padding:2rem;color:#999;">Склад пуст</p>' : ''}
      </div>
    </div>`;
}

function editIngredient(id) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  showModal(
    `Редактировать: ${item.name}`,
    `<div class="form-group"><label>Количество (кг)</label><input id="edit-qty" type="number" step="0.001" value="${item.quantity}"></div>
     <div class="form-group"><label>Минимальный уровень (кг)</label><input id="edit-min" type="number" step="0.001" value="${item.minLevel}"></div>
     <div class="form-group"><label>Цена за кг (сум)</label><input id="edit-price" type="number" step="1" value="${item.price}"></div>`,
    'Сохранить', 'btn-primary',
    async () => {
      await api('PUT', `/api/inventory/${id}`, {
        quantity: parseFloat(document.getElementById('edit-qty').value),
        minLevel: parseFloat(document.getElementById('edit-min').value),
        price:    parseFloat(document.getElementById('edit-price').value)
      });
      toast('✅ Ингредиент обновлён');
      renderWarehouse();
    }
  );
}

// ─── 2. Add ingredient ────────────────────────────────────────────────────────
function renderAddIngredient() {
  document.getElementById('content').innerHTML = `
    <div class="card" style="max-width:500px;">
      <div class="card-title">Добавить / пополнить ингредиент</div>
      <div id="add-alert"></div>
      <div class="form-group">
        <label>Название</label>
        <input id="a-name" type="text" placeholder="Мука" />
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Количество (кг)</label>
          <input id="a-qty" type="number" step="0.001" placeholder="0" />
        </div>
        <div class="form-group">
          <label>Единица</label>
          <input id="a-unit" type="text" value="кг" />
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Минимальный уровень (кг)</label>
          <input id="a-min" type="number" step="0.001" placeholder="0" />
        </div>
        <div class="form-group">
          <label>Цена за кг (сум)</label>
          <input id="a-price" type="number" step="1" placeholder="0" />
        </div>
      </div>
      <div class="alert alert-info" style="font-size:0.85rem;">
        💡 Если ингредиент уже существует — количество будет добавлено к существующему.
      </div>
      <button class="btn btn-primary" onclick="addIngredient()">➕ Добавить</button>
    </div>`;
}

async function addIngredient() {
  const name  = document.getElementById('a-name').value.trim();
  const qty   = parseFloat(document.getElementById('a-qty').value);
  const unit  = document.getElementById('a-unit').value;
  const min   = parseFloat(document.getElementById('a-min').value) || 0;
  const price = parseFloat(document.getElementById('a-price').value) || 0;

  if (!name || isNaN(qty)) {
    document.getElementById('add-alert').innerHTML =
      '<div class="alert alert-danger">Введите название и количество</div>';
    return;
  }

  const res = await api('POST', '/api/inventory', { name, quantity: qty, unit, minLevel: min, price });
  if (res.error) {
    document.getElementById('add-alert').innerHTML = `<div class="alert alert-danger">${res.error}</div>`;
    return;
  }

  toast(`✅ Ингредиент "${res.name}" добавлен / пополнен`);
  renderAddIngredient();
}

// ─── 3. Delete ingredient ─────────────────────────────────────────────────────
async function renderDelIngredient() {
  const data = await api('GET', '/api/inventory');
  inventory = data;
  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="card-title">Удалить ингредиент</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ингредиент</th><th>Количество</th><th></th></tr></thead>
          <tbody>
            ${inventory.map(item => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td>${fmtKg(item.quantity)}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteIngredient(${item.id},'${item.name}')">🗑️ Удалить</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${inventory.length === 0 ? '<p style="text-align:center;padding:2rem;color:#999;">Склад пуст</p>' : ''}
      </div>
    </div>`;
}

function deleteIngredient(id, name) {
  showModal(
    'Удалить ингредиент',
    `<div class="alert alert-danger">Удалить <strong>${name}</strong> со склада? Это действие нельзя отменить.</div>`,
    'Удалить', 'btn-danger',
    async () => {
      await api('DELETE', `/api/inventory/${id}`);
      toast(`🗑️ "${name}" удалён`);
      renderDelIngredient();
    }
  );
}

// ─── 4. Production ────────────────────────────────────────────────────────────
function renderProduction() {
  document.getElementById('content').innerHTML = `
    <div class="grid-2" style="align-items:start;">
      <div>
        <div class="card">
          <div class="card-title">⚙️ Параметры производства</div>
          <div id="prod-alert"></div>
          <div class="form-group">
            <label>Количество хлеба (шт)</label>
            <input id="p-qty" type="number" min="1" placeholder="100" />
          </div>
          <div class="form-group">
            <label>Цена продажи за 1 шт (сум)</label>
            <input id="p-price" type="number" min="1" placeholder="4500" />
          </div>
          <button class="btn btn-primary" onclick="checkProduction()" style="width:100%;">🔍 Рассчитать</button>
        </div>
        <div class="card" id="calc-result" style="display:none;">
          <div class="card-title">📋 Результат расчёта</div>
          <div id="calc-body"></div>
          <div class="divider"></div>
          <div class="form-group" style="margin-top:0.5rem;">
            <label>Количество проданного хлеба (шт)</label>
            <input id="p-sold" type="number" min="0" placeholder="0" />
          </div>
          <button class="btn btn-success" onclick="saveProduction()" style="width:100%;">💾 Сохранить продажу</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">📖 Рецептура (на 1 хлеб)</div>
        <div class="result-row"><span class="rlabel">Мука</span><span class="rvalue">0,3885 кг</span></div>
        <div class="result-row"><span class="rlabel">Вода</span><span class="rvalue">0,2075 кг</span></div>
        <div class="result-row"><span class="rlabel">Соль</span><span class="rvalue">0,007 кг</span></div>
        <div class="result-row"><span class="rlabel">Дрожжи</span><span class="rvalue">0,00078 кг</span></div>
        <div class="result-row"><span class="rlabel">Улучшитель</span><span class="rvalue">0,00117 кг</span></div>
        <div class="result-row"><span class="rlabel">Дрова (в себестоимость)</span><span class="rvalue">0,078125 кг</span></div>
        <div class="divider"></div>
        <div class="result-row"><span class="rlabel">Пакет (≤ 4500 сум)</span><span class="rvalue">1 пак = 2 хлеба · 200 сум</span></div>
      </div>
    </div>`;
}

async function checkProduction() {
  const produced = parseInt(document.getElementById('p-qty').value);
  const price    = parseFloat(document.getElementById('p-price').value);
  document.getElementById('prod-alert').innerHTML = '';

  if (!produced || !price || produced < 1 || price < 1) {
    document.getElementById('prod-alert').innerHTML =
      '<div class="alert alert-danger">Введите корректное количество и цену</div>';
    return;
  }

  const res = await api('POST', '/api/production/check', { produced, price });

  if (!res.ok) {
    const shortList = res.shortages.map(s =>
      `<li>❌ <strong>Недостаточно: ${s.name}</strong> — нужно ${fmtKg(s.needed)}, есть ${fmtKg(s.available)}</li>`
    ).join('');
    document.getElementById('prod-alert').innerHTML =
      `<div class="alert alert-danger"><strong>Недостаточно ингредиентов:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem;">${shortList}</ul></div>`;
    document.getElementById('calc-result').style.display = 'none';
    return;
  }

  calcData = res;

  const pkgLine = res.packages > 0
    ? `<div class="result-row"><span class="rlabel">Пакеты (${res.packages} шт × 200 сум)</span><span class="rvalue">${fmtSum(res.packageCost)}</span></div>`
    : `<div class="result-row"><span class="rlabel">Пакеты</span><span class="rvalue" style="color:#999;">не включены (цена ≥ 5000 сум)</span></div>`;

  const ingRows = Object.entries(res.needed).map(([name, amt]) =>
    `<div class="result-row"><span class="rlabel">${name}</span><span class="rvalue">${fmtKg(amt)}</span></div>`
  ).join('');

  document.getElementById('calc-body').innerHTML = `
    <div class="alert alert-success">✅ Ингредиентов достаточно для производства ${res.produced} хлебов</div>
    <div class="card-title" style="font-size:0.85rem;margin-bottom:0.5rem;">Ингредиенты:</div>
    ${ingRows}
    <div class="divider"></div>
    <div class="result-row"><span class="rlabel">Общая масса теста</span><span class="rvalue">${fmtKg(res.doughMass)}</span></div>
    ${pkgLine}
    <div class="result-row"><span class="rlabel">Общая себестоимость производства</span><span class="rvalue">${fmtSum(res.totalProductionCost)}</span></div>
    <div class="result-row"><span class="rlabel">Себестоимость 1 хлеба</span><span class="rvalue highlight">${fmtSum(res.costPerBread)}</span></div>`;

  document.getElementById('p-sold').value = produced;
  document.getElementById('calc-result').style.display = 'block';
}

async function saveProduction() {
  if (!calcData) return;
  const produced = calcData.produced;
  const price    = calcData.price;
  const sold     = parseInt(document.getElementById('p-sold').value);

  if (isNaN(sold) || sold < 0) {
    toast('❌ Введите корректное количество проданного');
    return;
  }
  if (sold > produced) {
    toast(`❌ Продано (${sold}) не может превышать произведено (${produced})`);
    return;
  }

  const res = await api('POST', '/api/production/save', { produced, sold, price });
  if (res.error) { toast('❌ ' + res.error); return; }

  toast(`✅ Продажа сохранена: произведено ${produced}, продано ${sold}`);
  calcData = null;
  renderProduction();
  navigate('history');
}

// ─── 5. History ───────────────────────────────────────────────────────────────
async function renderHistory() {
  const data = await api('GET', '/api/history');
  salesHistory = data;
  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="card-title" style="margin:0;border:none;padding:0;">История продаж</div>
        <span style="font-size:0.85rem;color:#999;">${salesHistory.length} записей</span>
      </div>
      <div class="table-wrap" style="margin-top:1rem;">
        <table>
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Произведено</th>
              <th>Продано</th>
              <th>Списано</th>
              <th>Цена</th>
              <th>Доход</th>
              <th>Себестоимость</th>
              <th>Убытки</th>
              <th>Прибыль</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${salesHistory.map(r => `
              <tr>
                <td style="white-space:nowrap;">${fmtDate(r.date)}</td>
                <td>${r.produced}</td>
                <td>${r.sold}</td>
                <td>${r.losses > 0 ? `<span class="badge badge-red">${r.losses}</span>` : '—'}</td>
                <td>${r.price.toLocaleString('ru')} сум</td>
                <td style="color:#27ae60;font-weight:600;">${fmtSum(r.revenue)}</td>
                <td>${fmtSum(r.costForSold)}</td>
                <td>${r.lossAmount > 0 ? `<span style="color:#c0392b;">${fmtSum(r.lossAmount)}</span>` : '—'}</td>
                <td style="font-weight:700;color:${r.profit >= 0 ? '#27ae60' : '#c0392b'}">${fmtSum(r.profit)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-warning btn-sm" onclick="openLossModal(${r.id},${r.produced},${r.sold},${r.losses})" title="Списать убытки">⚠️</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteRecord(${r.id})" title="Удалить">🗑️</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${history.length === 0 ? '<p style="text-align:center;padding:2rem;color:#999;">История пуста</p>' : ''}
      </div>
    </div>`;
}

function deleteRecord(id) {
  const origin = currentSection;
  showModal(
    'Удалить запись',
    '<div class="alert alert-danger">Удалить эту запись из истории? Запасы на складе НЕ будут восстановлены.</div>',
    'Удалить', 'btn-danger',
    async () => {
      await api('DELETE', `/api/history/${id}`);
      toast('🗑️ Запись удалена');
      navigate(origin);
    }
  );
}

function openLossModal(id, produced, sold, currentLosses) {
  const maxLoss = produced - sold;
  const origin  = currentSection; // remember which page opened this modal
  showModal(
    'Списать убытки',
    `<div class="alert alert-warning">Максимально можно списать: <strong>${maxLoss} шт</strong> (уже списано: ${currentLosses})</div>
     <div class="form-group">
       <label>Сколько хлеба списать как убыток? (итого)</label>
       <input id="loss-input" type="number" min="0" max="${maxLoss}" value="${currentLosses}" />
     </div>`,
    'Списать', 'btn-warning',
    async () => {
      const losses = parseInt(document.getElementById('loss-input').value);
      if (isNaN(losses) || losses < 0) { toast('❌ Неверное количество'); return; }
      const res = await api('POST', `/api/history/${id}/losses`, { losses });
      if (res.error) { toast('❌ ' + res.error); return; }
      toast(`⚠️ Убытки списаны: ${losses} хлебов`);
      navigate(origin); // go back to whichever page triggered the modal
    }
  );
}

// ─── 6. Delete history (dedicated section) ───────────────────────────────────
async function renderDelHistory() {
  const data = await api('GET', '/api/history');
  salesHistory = data;
  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="card-title">❌ Удалить запись из истории</div>
      <div class="alert alert-danger" style="font-size:0.85rem;">
        ⚠️ Удалённые записи не восстанавливаются. Запасы на складе при удалении не возвращаются.
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Произведено</th>
              <th>Продано</th>
              <th>Доход</th>
              <th>Прибыль</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${salesHistory.map(r => `
              <tr>
                <td style="white-space:nowrap;">${fmtDate(r.date)}</td>
                <td>${r.produced}</td>
                <td>${r.sold}</td>
                <td style="color:#27ae60;font-weight:600;">${fmtSum(r.revenue)}</td>
                <td style="font-weight:700;color:${r.profit >= 0 ? '#27ae60' : '#c0392b'}">${fmtSum(r.profit)}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteRecord(${r.id})">🗑️ Удалить</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${history.length === 0 ? '<p style="text-align:center;padding:2rem;color:#999;">История пуста</p>' : ''}
      </div>
    </div>`;
}

// ─── 7. Losses (dedicated section) ───────────────────────────────────────────
async function renderLosses() {
  const data = await api('GET', '/api/history');
  salesHistory = data;

  // Only show records that still have unsold/unlost bread
  const eligible = salesHistory.filter(r => r.sold + r.losses < r.produced);

  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="card-title">⚠️ Списание убытков</div>
      ${eligible.length === 0
        ? '<div class="alert alert-info">Нет записей для списания убытков. Все произведённые хлеба учтены.</div>'
        : `<div class="alert alert-warning">Выберите запись и укажите количество хлеба для списания.</div>
           <div class="table-wrap">
             <table>
               <thead><tr><th>Дата</th><th>Произведено</th><th>Продано</th><th>Списано</th><th>Остаток</th><th></th></tr></thead>
               <tbody>
                 ${eligible.map(r => `
                   <tr>
                     <td>${fmtDate(r.date)}</td>
                     <td>${r.produced}</td>
                     <td>${r.sold}</td>
                     <td>${r.losses}</td>
                     <td><strong>${r.produced - r.sold - r.losses}</strong></td>
                     <td><button class="btn btn-warning btn-sm" onclick="openLossModal(${r.id},${r.produced},${r.sold},${r.losses})">⚠️ Списать</button></td>
                   </tr>`).join('')}
               </tbody>
             </table>
           </div>`
      }
    </div>`;
}

// ─── 7. Statistics ────────────────────────────────────────────────────────────
async function renderStats() {
  const data = await api('GET', '/api/stats');
  const { daily, monthly } = data;

  const statSection = (title, s) => `
    <div class="card">
      <div class="card-title">${title}</div>
      <div class="grid-4">
        <div class="stat-box">
          <div class="label">Произведено</div>
          <div class="value">${s.produced}</div>
        </div>
        <div class="stat-box">
          <div class="label">Продано</div>
          <div class="value">${s.sold}</div>
        </div>
        <div class="stat-box">
          <div class="label">Убытки (шт)</div>
          <div class="value red">${s.losses}</div>
        </div>
        <div class="stat-box">
          <div class="label">Доход</div>
          <div class="value green">${fmtSum(s.revenue)}</div>
        </div>
      </div>
      <div class="grid-3" style="margin-top:1rem;">
        <div class="stat-box">
          <div class="label">Себестоимость</div>
          <div class="value">${fmtSum(s.cost)}</div>
        </div>
        <div class="stat-box">
          <div class="label">Сумма убытков</div>
          <div class="value red">${fmtSum(s.lossAmount)}</div>
        </div>
        <div class="stat-box">
          <div class="label">Прибыль</div>
          <div class="value ${s.profit >= 0 ? 'green' : 'red'}">${fmtSum(s.profit)}</div>
        </div>
      </div>
    </div>`;

  document.getElementById('content').innerHTML =
    statSection('📅 Сегодня', daily) +
    statSection('📆 Этот месяц', monthly);
}
