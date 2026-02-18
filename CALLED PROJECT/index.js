// To‑Do — improved UI/UX: auto-focus, toast + undo, keyboard shortcuts, safer deletes
const TODOS_KEY = 'advanced_todos_v1';
const SETTINGS_KEY = 'advanced_settings_v1';

/* DOM */
const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const dueInput = document.getElementById('due-input');
const prioSelect = document.getElementById('prio-select');
const listEl = document.getElementById('todo-list');
const clearCompletedBtn = document.getElementById('clear-completed');
const clearAllBtn = document.getElementById('clear-all');

const themeSelect = document.getElementById('theme-select');
const accentPreset = document.getElementById('accent-preset');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');

const filters = document.querySelectorAll('.filter');
const progressFill = document.querySelector('.progress-fill');
const progressText = document.getElementById('progress-text');
const toastEl = document.getElementById('toast');

let todos = loadTodos();
let settings = loadSettings();
let currentFilter = 'all';
let lastDeleted = null; // for undo

applySettings();
render();
input.focus();

/* ---------- Form & shortcuts ---------- */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return showToast('Enter a task first');
  addTodo({ text, due: dueInput.value || null, prio: prioSelect.value });
  input.value = ''; dueInput.value = ''; prioSelect.value = 'medium';
  input.focus();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    input.focus();
  }
});

/* ---------- Controls ---------- */
clearCompletedBtn.addEventListener('click', () => {
  const count = todos.filter(t => t.done).length;
  if (!count) return showToast('No completed tasks');
  todos = todos.filter(t => !t.done);
  saveAndRender();
  showToast(`${count} completed cleared`);
});
clearAllBtn.addEventListener('click', () => {
  if (!confirm('Clear all tasks? This cannot be undone.')) return;
  todos = [];
  saveAndRender();
  showToast('All tasks cleared');
});

/* import/export */
exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ todos, settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'todos-export.json';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  showToast('Export started');
});
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.todos)) todos = data.todos;
      if (data.settings) settings = Object.assign(settings, data.settings);
      saveAndRender(); applySettings();
      showToast('Import successful');
    } catch {
      showToast('Invalid JSON');
    }
  };
  reader.readAsText(f);
});

/* filters */
filters.forEach(btn => btn.addEventListener('click', (e) => {
  filters.forEach(b => b.classList.remove('active'));
  e.currentTarget.classList.add('active');
  currentFilter = e.currentTarget.dataset.filter;
  render();
}));

/* theme & accent */
themeSelect.addEventListener('change', (e) => { settings.theme = e.target.value; applySettings(); saveSettings(); });
accentPreset.addEventListener('change', (e) => { settings.accent = e.target.value; applySettings(); saveSettings(); });

/* todo actions */
function addTodo({ text, due = null, prio = 'medium' }) {
  todos.push({ id: Date.now().toString(), text, done: false, due, prio });
  saveAndRender();
  showToast('Task added');
}

function toggleTodo(id) { const t = todos.find(x => x.id === id); if (t) t.done = !t.done; saveAndRender(); }
function removeTodo(id) {
  const idx = todos.findIndex(x => x.id === id); if (idx < 0) return;
  lastDeleted = todos.splice(idx, 1)[0];
  saveAndRender();
  showToast('Task deleted', () => {
    if (lastDeleted) {
      todos.push(lastDeleted);
      saveAndRender();
      lastDeleted = null;
    }
  });
}
function editTodo(id, newText) { const t = todos.find(x => x.id === id); if (t && newText.trim()) { t.text = newText.trim(); saveAndRender(); } }

/* persistence */
function saveAndRender(){ saveTodos(); render(); }
function saveTodos(){ try { localStorage.setItem(TODOS_KEY, JSON.stringify(todos)); } catch (e) { console.error(e); } }
function loadTodos(){ try { const raw = localStorage.getItem(TODOS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }

function defaultSettings(){ return { theme: 'light', accent: '#2b7cff', fontSize: 15 }; }
function loadSettings(){ try { const raw = localStorage.getItem(SETTINGS_KEY); return raw ? JSON.parse(raw) : defaultSettings(); } catch { return defaultSettings(); } }
function saveSettings(){ try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { console.error(e); } }

function applySettings(){
  document.documentElement.setAttribute('data-theme', settings.theme || 'light');
  document.documentElement.style.setProperty('--accent', settings.accent || '#2b7cff');
  themeSelect.value = settings.theme || 'light';
  accentPreset.value = settings.accent || '#2b7cff';
}

/* render + filtering + progress */
function render(){
  listEl.innerHTML = '';
  const list = filteredTodos();
  if (list.length === 0) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No tasks — add something!';
    listEl.appendChild(empty); updateProgress(); return;
  }

  list.sort(sortByDuePrio);

  list.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' completed' : '');
    li.draggable = true;
    li.dataset.id = todo.id;

    const chk = document.createElement('button'); chk.className = 'icon'; chk.innerHTML = todo.done ? '✅' : '⬜';
    chk.title = todo.done ? 'Mark not done' : 'Mark done';
    chk.addEventListener('click', () => toggleTodo(todo.id));

    const txt = document.createElement('div'); txt.className = 'text'; txt.contentEditable = 'true'; txt.spellcheck = false; txt.textContent = todo.text;
    txt.addEventListener('blur', () => editTodo(todo.id, txt.textContent));
    txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); txt.blur(); } });

    const meta = document.createElement('div'); meta.className = 'meta';
    const prio = document.createElement('div'); prio.className = 'badge prio-' + (todo.prio || 'medium'); prio.textContent = (todo.prio || 'medium').toUpperCase();
    meta.appendChild(prio);
    if (todo.due) {
      const d = document.createElement('div'); d.className = 'due'; d.textContent = formatDue(todo.due);
      meta.appendChild(d);
    }

    const del = document.createElement('button'); del.className = 'icon'; del.innerHTML = '🗑️'; del.title = 'Delete';
    del.addEventListener('click', () => { if (confirm('Delete this task?')) removeTodo(todo.id); });

    li.appendChild(chk); li.appendChild(txt); li.appendChild(meta); li.appendChild(del);
    listEl.appendChild(li);
  });

  updateProgress();
}

/* filtering helpers */
function filteredTodos(){
  const now = new Date();
  if (currentFilter === 'active') return todos.filter(t => !t.done);
  if (currentFilter === 'completed') return todos.filter(t => t.done);
  if (currentFilter === 'due') return todos.filter(t => t.due && new Date(t.due) <= addDays(now, 3) && !t.done);
  return todos;
}

/* sort + progress */
function sortByDuePrio(a,b){
  if (a.due && b.due) {
    const da = new Date(a.due), db = new Date(b.due);
    if (da - db !== 0) return da - db;
  } else if (a.due && !b.due) return -1;
  else if (!a.due && b.due) return 1;
  const prioVal = { high: 0, medium: 1, low: 2 };
  return (prioVal[a.prio] - prioVal[b.prio]) || (parseInt(a.id) - parseInt(b.id));
}
function updateProgress(){
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + '%';
  progressText.textContent = `${done}/${total}`;
}

/* utils */
function formatDue(d){
  const dt = new Date(d); const today = new Date();
  const diff = Math.ceil((dt - new Date(today.getFullYear(),today.getMonth(),today.getDate())) / (1000*60*60*24));
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return dt.toLocaleDateString();
}
function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate() + n); return r; }

/* toast + undo */
let toastTimer = null;
function showToast(msg, undoCb) {
  toastEl.innerHTML = '';
  const span = document.createElement('div'); span.textContent = msg;
  toastEl.appendChild(span);
  if (undoCb) {
    const btn = document.createElement('button'); btn.textContent = 'Undo';
    btn.addEventListener('click', () => { undoCb(); clearToast(); });
    toastEl.appendChild(btn);
  }
  toastEl.style.display = 'flex';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearToast, 5000);
}
function clearToast() { toastEl.style.display = 'none'; toastEl.innerHTML = ''; clearTimeout(toastTimer); }

/* init */
if (!settings.accent) settings.accent = '#2b7cff';
applySettings();
saveSettings();



