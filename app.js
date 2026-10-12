// Интерфейс сайта: загрузка файлов, предпросмотр, скачивание
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const items = [];          // { id, file, raw, text, model, ai }
  let current = null, seq = 0, timer = null, showRaw = false;

  // ---------- Настройки Claude (хранятся только в этом браузере) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } }
  };
  const cfg = {
    key: store.get('claude_key', ''),
    model: store.get('claude_model', 'claude-sonnet-5-5'),
    auto: store.get('claude_auto', '1') === '1'
  };
  function renderAiState() {
    const el = $('aiState');
    el.textContent = cfg.key ? '● Claude подключён' : '○ Claude не подключён';
    el.className = 'ai-state' + (cfg.key ? ' on' : '');
  }
  function openSettings() {
    $('apiKey').value = cfg.key;
    $('aiModel').value = cfg.model;
    $('aiAuto').checked = cfg.auto;
    $('settings').hidden = false;
    $('apiKey').focus();
  }
  function saveSettings() {
    cfg.key = $('apiKey').value.trim();
    cfg.model = $('aiModel').value;
    cfg.auto = $('aiAuto').checked;
    store.set('claude_key', cfg.key || null);
    store.set('claude_model', cfg.model);
    store.set('claude_auto', cfg.auto ? '1' : '0');
    $('settings').hidden = true;
    renderAiState();
  }

  // ---------- Обработка через Claude ----------
  async function runAI(it) {
    if (!cfg.key) { openSettings(); return; }
    it.ai = { state: 'busy' };
    refresh(it);
    try {
      const { data } = await ResumeAI.process(it.raw, cfg.key, cfg.model);
      it.text = ResumeAI.toCanonicalText(data);
      it.model = Resume.parse(it.text);
      it.ai = { state: 'done', warnings: data.warnings || [] };
    } catch (e) {
      const net = e instanceof TypeError;
      it.ai = { state: 'error', error: net ? 'Не удалось связаться с Claude API (нет связи или запрос заблокирован): ' + e.message : e.message };
    }
    refresh(it);
  }
  function refresh(it) {
    if (it === current) { if (!showRaw) $('src').value = it.text; renderPreview(); }
    renderList();
  }

  // ---------- Загрузка файлов ----------
  async function readFile(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    const buf = await file.arrayBuffer();
    if (ext === 'docx') return Resume.docxToText(buf, JSZip, DOMParser);
    if (ext === 'txt') return Resume.decodeTxt(buf);
    if (ext === 'doc') throw new Error('Старый формат .doc не поддерживается — откройте файл в Word и сохраните как .docx');
    throw new Error('Неподдерживаемый формат: .' + ext);
  }

  async function addFiles(files) {
    let last = null;
    for (const f of files) {
      try {
        const it = addItem(f.name, await readFile(f));
        if (cfg.key && cfg.auto) queue.push(it);
        last = it;
      } catch (e) {
        alert(f.name + ':\n' + e.message);
      }
    }
    if (last) select(last);
    drainQueue();
  }

  // резюме обрабатываются по очереди, чтобы не упереться в лимиты API
  const queue = [];
  let draining = false;
  async function drainQueue() {
    if (draining) return;
    draining = true;
    while (queue.length) await runAI(queue.shift());
    draining = false;
  }

  function addItem(fileName, text) {
    const it = { id: ++seq, file: fileName, raw: text, text, model: Resume.parse(text), ai: { state: 'none' } };
    items.push(it);
    return it;
  }

  // ---------- Список резюме ----------
  function renderList() {
    const ul = $('list');
    ul.innerHTML = '';
    items.forEach(it => {
      const li = document.createElement('li');
      if (it === current) li.className = 'active';
      const n = it.model.missing.length;
      li.innerHTML = '<span class="nm"></span><span class="fn"></span><span class="x"><span class="badge ' + (n ? 'bad' : 'good') + '">' +
        (n ? 'нет ' + n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'блока' : 'блоков') : '✓') + '</span><button class="del" title="Убрать">×</button></span>';
      li.querySelector('.nm').textContent = it.model.name || 'Без имени';
      li.querySelector('.fn').textContent = it.file + (it.ai.state === 'busy' ? ' · Claude обрабатывает…' : it.ai.state === 'done' ? ' · обработано Claude' : it.ai.state === 'error' ? ' · ошибка Claude' : '');
      li.onclick = () => select(it);
      li.querySelector('.del').onclick = e => { e.stopPropagation(); remove(it); };
      ul.appendChild(li);
    });
    $('btnZip').disabled = items.length < 2;
  }

  function select(it) {
    current = it;
    $('work').hidden = !it;
    $('empty').hidden = !!it;
    showRaw = false;
    if (it) { $('src').value = it.text; renderPreview(); }
    renderList();
  }

  function remove(it) {
    items.splice(items.indexOf(it), 1);
    select(current === it ? items[items.length - 1] || null : current);
  }

  // ---------- Предпросмотр ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const P = (t, cls) => '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(t) + '</p>';
  const MISS = label => '<p><span class="miss">[НЕ ЗАПОЛНЕНО: ' + esc(label) + ']</span></p>';
  const H = (t, miss) => '<p class="h' + (miss ? ' miss-h' : '') + '">' + (miss ? '<span class="miss">' + esc(t) + '</span>' : esc(t)) + '</p>';
  const GAP = '<div class="gap"></div>';

  function renderPreview() {
    const m = current.model;
    let h = '<div class="headblock">';
    h += m.name ? P(m.name, 'b') : MISS('ФИО');
    h += m.age ? P(m.age) : MISS('возраст');
    m.headExtra.forEach(l => { h += P(l); });
    h += H('Отдел:', !m.otdel) + (m.otdel ? P(m.otdel) : MISS('отдел')) + '</div>';

    h += H('Опыт работы:', !m.jobs.length);
    if (!m.jobs.length) h += MISS('опыт работы');
    m.jobs.forEach((j, i) => {
      if (i) h += GAP;
      h += j.date ? P(j.date, 'b') : MISS('даты работы');
      h += j.company ? P(j.company, 'b') : MISS('компания');
      h += j.position ? P(j.position, 'b') : MISS('должность');
      h += j.duties.length ? j.duties.map(d => P(d)).join('') : MISS('обязанности');
      if (j.ach.length) h += P('Достижения:', 'b') + j.ach.map(a => P(a)).join('');
    });

    h += H('Владение ПО:', !m.soft.length) + (m.soft.length ? m.soft.map(l => P(l)).join('') : MISS('владение ПО'));

    h += H('О себе:', !m.about.length) + (m.about.length ? m.about.map(l => P(l)).join('') : MISS('о себе')) + GAP;
    Resume.PERSONAL.forEach(([k, , label]) => { h += m.personal[k] ? P(m.personal[k]) : MISS(label); });
    h += GAP + '<p><span class="b' + (m.skills ? '' : ' miss') + '">Навыки: </span>' + (m.skills ? esc(m.skills) : '<span class="miss">[НЕ ЗАПОЛНЕНО: навыки]</span>') + '</p>';

    const grp = (g, label) => g.length ? g.map(lines => lines.map(l => P(l)).join('')).join(GAP) : MISS(label);
    h += H('Образование:', !m.edu.length) + grp(m.edu, 'образование');
    h += H('Доп. образование:', !m.addEdu.length) + grp(m.addEdu, 'доп. образование');
    h += H('Знание языков и уровень владения:', !m.lang.length) + (m.lang.length ? m.lang.map(l => P(l)).join('') : MISS('знание языков'));

    const line = (label, v, ml) => '<p>' + (v ? esc(label) + esc(v) : '<span class="miss">' + esc(label) + '[НЕ ЗАПОЛНЕНО: ' + ml + ']</span>') + '</p>';
    h += GAP + GAP + line('Ожидания по зарплате: ', m.salary, 'зарплата') + GAP + line('Уровень в котах: ', m.cats, 'уровень');
    $('paper').innerHTML = h;

    const note = $('aiNote'), ai = current.ai;
    note.hidden = ai.state === 'none' || (ai.state === 'done' && !ai.warnings.length);
    note.className = 'ai-note' + (ai.state === 'error' ? ' err' : ai.state === 'busy' ? ' busy' : '');
    if (ai.state === 'busy') note.textContent = 'Claude обрабатывает резюме… Обычно это занимает 10–40 секунд.';
    else if (ai.state === 'error') note.textContent = ai.error;
    else if (ai.state === 'done') note.innerHTML = '<b>Claude просит проверить:</b><ul>' + ai.warnings.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    $('btnAI').disabled = ai.state === 'busy';
    $('btnAI').textContent = ai.state === 'done' ? 'Обработать заново' : 'Обработать через Claude';
    $('btnRaw').hidden = current.raw === current.text;
    $('btnRaw').textContent = showRaw ? 'Вернуться к результату' : 'Показать оригинал';
    $('src').readOnly = showRaw;

    const st = $('status');
    if (m.missing.length) {
      st.className = 'status bad';
      st.innerHTML = '<b>Не хватает (' + m.missing.length + '):</b><ul>' + m.missing.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    } else {
      st.className = 'status good';
      st.textContent = '✓ Все блоки на месте';
    }
  }

  // ---------- Скачивание ----------
  const fileNameFor = it => 'Резюме_' + ((it.model.name || 'без_имени').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_')) + '.docx';

  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function downloadCurrent() {
    if (!current) return;
    save(await Resume.buildDocx(current.model, window.TEMPLATE_DOCX, JSZip), fileNameFor(current));
  }

  async function downloadAll() {
    const zip = new JSZip(), used = {};
    for (const it of items) {
      let name = fileNameFor(it);
      if (used[name]) name = name.replace(/\.docx$/, '_' + (++used[name]) + '.docx'); else used[name] = 1;
      zip.file(name, await Resume.buildDocx(it.model, window.TEMPLATE_DOCX, JSZip, 'uint8array'));
    }
    save(await zip.generateAsync({ type: 'blob' }), 'Резюме.zip');
  }

  // ---------- События ----------
  const drop = $('drop');
  $('fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
  // файлы, брошенные мимо рамки, тоже принимаем
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); if (e.target !== drop && !drop.contains(e.target)) addFiles([...e.dataTransfer.files]); });

  $('btnPaste').onclick = () => { select(addItem('вставленный текст', '')); $('src').focus(); };
  $('src').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (showRaw) return;
      current.text = $('src').value;
      if (current.ai.state === 'none') current.raw = current.text;
      current.model = Resume.parse(current.text);
      renderPreview();
      renderList();
    }, 250);
  });
  $('btnDocx').onclick = downloadCurrent;
  $('btnAI').onclick = () => current && runAI(current);
  $('btnRaw').onclick = () => { showRaw = !showRaw; $('src').value = showRaw ? current.raw : current.text; renderPreview(); };
  $('btnSettings').onclick = openSettings;
  $('btnSaveSettings').onclick = saveSettings;
  $('btnForgetKey').onclick = () => { $('apiKey').value = ''; saveSettings(); };
  $('settings').onclick = e => { if (e.target === $('settings')) $('settings').hidden = true; };
  renderAiState();
  $('btnZip').onclick = downloadAll;
})();
