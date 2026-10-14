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
  // Стандартные правила редактуры (основное из мастер-промпта)
  const DEFAULT_RULES = "- Исправляй орфографию, пунктуацию, грамматику, опечатки, согласование слов и падежи.\n- Переписывай неудачные, обрывочные и непонятные фразы; убирай повторы, тавтологию, разговорные и эмоциональные выражения.\n- Обязанности, навыки и достижения приводи к единому деловому стилю, но сохраняй индивидуальность кандидата — не превращай текст в шаблон.\n- Слишком длинные абзацы разбивай на короткие.\n- Проверяй смысл: дублирующуюся информацию убирай, противоречия и непоследовательные даты выноси в замечания.\n- Ничего не придумывай и не преувеличивай: ни фактов, ни достижений, ни цифр (детализация обязанностей до 6 пунктов — не выдумка, она разрешена). Если смысл фрагмента невозможно восстановить — оставь его близко к оригиналу и укажи в замечаниях.\n- Удаляй все личные контакты: телефоны, e-mail, Telegram и ники, ссылки на личные профили. Номер телефона, который относится к описанию работы, а не к контактам кандидата, не удаляй.\n- Не меняй названия организаций, учебных заведений, должностей и квалификаций, если в них нет явной ошибки.\n- Не заполняй разделы, для которых в резюме нет сведений.";
  const cfg = {
    key: store.get('claude_key', ''),
    model: store.get('claude_model2', 'claude-haiku-5-5'),
    rules: store.get('claude_rules2', DEFAULT_RULES),
    auto: store.get('claude_auto', '1') === '1',
    ttl: store.get('claude_ttl', '1h'),
    batch: store.get('claude_batch', '0') === '1'
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
    $('aiRules').value = cfg.rules;
    $('aiTtl').value = cfg.ttl;
    $('aiBatch').checked = cfg.batch;
    $('settings').hidden = false;
    $('apiKey').focus();
  }
  function saveSettings() {
    // убираем случайные пробелы, переносы строк, кавычки и невидимые символы
    cfg.key = $('apiKey').value.replace(/[\s"'«»\u200B-\u200D\uFEFF]/g, '');
    if (cfg.key && !cfg.key.startsWith('sk-ant-')) {
      alert('Это не похоже на ключ API: он должен начинаться с «sk-ant-».\nСкопируйте ключ заново в console.anthropic.com → API Keys.');
      return;
    }
    cfg.model = $('aiModel').value;
    cfg.auto = $('aiAuto').checked;
    cfg.rules = $('aiRules').value;
    cfg.ttl = $('aiTtl').value;
    cfg.batch = $('aiBatch').checked;
    store.set('claude_ttl', cfg.ttl);
    store.set('claude_batch', cfg.batch ? '1' : '0');
    store.set('claude_key', cfg.key || null);
    store.set('claude_model2', cfg.model);
    store.set('claude_rules2', cfg.rules);
    store.set('claude_auto', cfg.auto ? '1' : '0');
    $('settings').hidden = true;
    $('btnBatch').onclick = sendBatch;
  renderAiState();
  renderBatchState();
  restoreBatch();
    renderList();
  }

  // ---------- Обработка через Claude ----------
  async function runAI(it) {
    if (!cfg.key) { openSettings(); return; }
    it.ai = { state: 'busy' };
    refresh(it);
    try {
      applyResult(it, await ResumeAI.process(it.raw, cfg.key, cfg.model, cfg.rules, cfg.ttl));
    } catch (e) {
      it.ai = { state: 'error', error: e instanceof TypeError ? await diagnose() : e.message };
    }
    refresh(it);
  }
  function applyResult(it, { data, usage }) {
    it.text = ResumeAI.toCanonicalText(data);
    it.model = Resume.parse(it.text);
    it.ai = { state: 'done', warnings: data.warnings || [], eduHints: data.about_education || [], usage };
  }

  // ---------- Пакетная обработка (дешевле в 2 раза, результат — от минут до 24 часов) ----------
  // Пакет сохраняется в браузере (IndexedDB), чтобы не потеряться, если закрыть страницу.
  const idb = {
    open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open('resumes', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
      });
    },
    async get(k) { try { const db = await this.open(); return await new Promise(ok => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.open(); await new Promise(ok => { const t = db.transaction('kv', 'readwrite'); v == null ? t.objectStore('kv').delete(k) : t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* без сохранения */ } }
  };
  let batch = null;  // { id, ids: [...], counts }
  const waitingForBatch = () => items.filter(it => it.ai.state === 'none' || it.ai.state === 'error');

  async function sendBatch() {
    if (!cfg.key) { openSettings(); return; }
    const list = waitingForBatch();
    if (!list.length || batch) return;
    $('btnBatch').disabled = true;
    try {
      const requests = list.map(it => ({ custom_id: 'r' + it.id, params: ResumeAI.buildMainBody(it.raw, cfg.model, cfg.rules, '1h') }));
      const b = await ResumeAI.batchCreate(cfg.key, requests);
      batch = { id: b.id, ids: list.map(it => it.id), counts: b.request_counts };
      list.forEach(it => { it.ai = { state: 'batch' }; });
      await idb.set('batch', { id: b.id, items: list.map(it => ({ id: it.id, file: it.file, raw: it.raw, photo: it.photo })) });
      renderList(); if (current) renderPreview();
      pollBatch();
    } catch (e) {
      alert('Не удалось отправить пакет:\n' + (e instanceof TypeError
        ? 'Anthropic не принимает пакетные запросы напрямую из браузера (обычные — принимает). Для пакетного режима нужен посредник. Пока выключите «Пакетную обработку» в настройках — резюме обработаются по одному.'
        : e.message));
    }
    $('btnBatch').disabled = false;
    renderBatchState();
  }

  async function pollBatch() {
    if (!batch) return;
    try {
      const b = await ResumeAI.batchGet(cfg.key, batch.id);
      batch.counts = b.request_counts;
      renderBatchState();
      if (b.processing_status === 'ended') return finishBatch(b);
    } catch (e) { /* нет связи — попробуем позже */ }
    setTimeout(pollBatch, 30000);
  }

  async function finishBatch(b) {
    const res = await ResumeAI.batchResults(cfg.key, b.results_url);
    const its = items.filter(it => batch.ids.includes(it.id));
    batch = null;
    await idb.set('batch', null);
    renderBatchState();
    // доработка и проверки — обычными запросами, по очереди
    for (const it of its) {
      const r = res['r' + it.id];
      if (!r || r.error) { it.ai = { state: 'error', error: 'Пакет: ' + ((r && r.error) || 'нет результата') }; refresh(it); continue; }
      it.ai = { state: 'busy' }; refresh(it);
      try {
        const out = await ResumeAI.finish(r.input, r.usage, it.raw, cfg.key, cfg.model);
        out.usage.batch = true;
        applyResult(it, out);
      } catch (e) { it.ai = { state: 'error', error: e.message }; }
      refresh(it);
    }
  }

  function renderBatchState() {
    const btn = $('btnBatch'), st = $('batchState');
    const n = waitingForBatch().length;
    btn.hidden = !cfg.batch || !!batch || !n;
    btn.textContent = 'Отправить пакетом (' + n + ')';
    if (batch) {
      const c = batch.counts || {};
      const done = (c.succeeded || 0) + (c.errored || 0) + (c.expired || 0) + (c.canceled || 0);
      st.hidden = false;
      st.textContent = 'Пакет в работе: готово ' + done + ' из ' + batch.ids.length + ' · проверяю раз в 30 сек. Страницу можно закрыть — пакет продолжится при следующем открытии.';
    } else st.hidden = true;
  }

  // при открытии страницы — продолжить незавершённый пакет
  async function restoreBatch() {
    const saved = await idb.get('batch');
    if (!saved || !saved.id) return;
    saved.items.forEach(x => {
      const it = addItem(x.file, x.raw, x.photo);
      it.id = x.id; seq = Math.max(seq, x.id);
      it.ai = { state: 'batch' };
    });
    batch = { id: saved.id, ids: saved.items.map(x => x.id), counts: {} };
    if (items.length) select(items[0]);
    renderBatchState();
    pollBatch();
  }

  // Почему запрос не дошёл: сервер вообще недоступен или ответил отказом
  async function diagnose() {
    if (!navigator.onLine) return 'Нет подключения к интернету.';
    try {
      await fetch('https://api.anthropic.com/v1/messages', { method: 'GET', mode: 'no-cors', cache: 'no-store' });
      return 'Сервер Claude ответил, но отказал в доступе ещё до проверки ключа. Так бывает, когда запрос идёт из страны, ' +
        'где Claude API недоступен (Россия в их число входит), либо его режет антивирус или расширение браузера (например, блокировщик рекламы).';
    } catch (e2) {
      return 'Сервер Claude недоступен из этой сети: соединение блокируется провайдером, корпоративной сетью, антивирусом или расширением браузера.';
    }
  }
  function refresh(it) {
    if (it === current) { if (!showRaw) $('src').value = it.text; renderPreview(); }
    renderList();
  }

  // ---------- Загрузка файлов ----------
  async function readFile(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    const buf = await file.arrayBuffer();
    if (ext === 'docx') {
      const photo = await Resume.extractPhoto(buf, JSZip).catch(() => null);
      return { text: await Resume.docxToText(buf, JSZip, DOMParser), photo };
    }
    if (ext === 'txt') return { text: Resume.decodeTxt(buf), photo: null };
    if (ext === 'zip') {
      // архив: берём все .docx и .txt внутри (в том числе во вложенных папках)
      const zip = await JSZip.loadAsync(buf), out = [];
      const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.|~\$)/.test(n) && /\.(docx|txt)$/i.test(n)).sort();
      for (const n of names) {
        const data = await zip.files[n].async('arraybuffer');
        const short = n.split('/').pop();
        try { out.push(Object.assign({ name: short }, await readFile({ name: short, arrayBuffer: async () => data }))); }
        catch (e) { out.push({ name: short, error: e.message }); }
      }
      if (!out.length) throw new Error('В архиве нет файлов .docx или .txt');
      return out;
    }
    if (ext === 'doc') throw new Error('Старый формат .doc не поддерживается — откройте файл в Word и сохраните как .docx');
    throw new Error('Неподдерживаемый формат: .' + ext);
  }

  async function addFiles(files) {
    let last = null;
    const errors = [];
    for (const f of files) {
      try {
        const got = await readFile(f);
        for (const g of Array.isArray(got) ? got : [Object.assign({ name: f.name }, got)]) {
          if (g.error) { errors.push(g.name + ': ' + g.error); continue; }
          const it = addItem(g.name, g.text, g.photo);
          if (cfg.key && cfg.auto && !cfg.batch) queue.push(it);  // в пакетном режиме ждём кнопку «Отправить пакетом»
          last = it;
        }
      } catch (e) {
        errors.push(f.name + ': ' + e.message);
      }
    }
    if (errors.length) alert('Не удалось прочитать:\n' + errors.join('\n'));
    if (last) select(last);
    renderBatchState();
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

  function addItem(fileName, text, photo) {
    const it = { id: ++seq, file: fileName, raw: text, text, model: Resume.parse(text), ai: { state: 'none' }, photo: photo || null };
    if (it.photo) it.photoUrl = URL.createObjectURL(new Blob([it.photo.bytes], { type: it.photo.mime }));
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
      li.querySelector('.fn').textContent = it.file + (it.ai.state === 'busy' ? ' · Claude обрабатывает…' : it.ai.state === 'batch' ? ' · в пакете' : it.ai.state === 'done' ? ' · обработано Claude' : it.ai.state === 'error' ? ' · ошибка Claude' : '');
      li.onclick = () => select(it);
      li.querySelector('.del').onclick = e => { e.stopPropagation(); remove(it); };
      ul.appendChild(li);
    });
    $('btnZip').disabled = items.length < 2;
    renderBatchState();
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
    let h = (current.photoUrl ? '<img class="photo" src="' + current.photoUrl + '" alt="Фото">' : '') + '<div class="headblock">';
    h += m.name ? P(m.name, 'b') : MISS('ФИО');
    h += m.age ? P(m.age) : MISS('возраст');
    m.headExtra.forEach(l => { h += P(l); });
    h += H('Отдел:', !m.otdel) + (m.otdel ? P(m.otdel) : MISS('отдел')) + '</div><div style="clear:both"></div>';

    h += H('Опыт работы:', !m.jobs.length);
    if (!m.jobs.length) h += MISS('опыт работы');
    m.jobs.forEach((j, i) => {
      if (i) h += GAP;
      h += j.date ? P(j.date, 'b') : MISS('даты работы');
      h += j.company ? P(j.company, 'b') : MISS('компания');
      h += j.position ? P(j.position, 'b') : MISS('должность');
      h += j.duties.length ? j.duties.map(d => P(d)).join('') : MISS('обязанности');
      h += j.ach.length ? P('Достижения:', 'b') + j.ach.map(a => P(a)).join('') : H('Достижения:', true).replace('class="h', 'class="b') + MISS('достижения');
    });

    h += H('Владение ПО:', !m.soft.length) + (m.soft.length ? m.soft.map(l => P(l)).join('') : MISS('владение ПО'));

    h += H('О себе:', !m.about.length) + (m.about.length ? m.about.map(l => P(l)).join('') : MISS('о себе')) + GAP;
    Resume.PERSONAL.forEach(([k, , label]) => { h += m.personal[k] ? P(m.personal[k]) : MISS(label); });
    h += GAP + '<p><span class="b' + (m.skills ? '' : ' miss') + '">Навыки: </span>' + (m.skills ? esc(m.skills) : '<span class="miss">[НЕ ЗАПОЛНЕНО: навыки]</span>') + '</p>';

    const grp = (g, label, needForm) => g.length ? g.map(lines => lines.map(l => P(l)).join('') +
      (needForm && !Resume.hasSpecialty(lines) ? MISS('направление / специальность') : '') +
      (needForm && !Resume.hasStudyForm(lines) ? MISS('форма обучения') : '')).join(GAP) : MISS(label);
    h += H('Образование:', !m.edu.length) + grp(m.edu, 'образование', true);
    if (m.addEdu.length) h += H('Доп. образование:', false) + grp(m.addEdu, 'доп. образование');
    h += H('Знание языков и уровень владения:', !m.lang.length) + (m.lang.length ? m.lang.map(l => P(l)).join('') : MISS('знание языков'));

    const line = (label, v, ml) => '<p>' + (v ? esc(label) + esc(v) : '<span class="miss">' + esc(label) + '[НЕ ЗАПОЛНЕНО: ' + ml + ']</span>') + '</p>';
    h += GAP + GAP + line('Город проживания: ', m.city, 'город') + GAP + line('Ожидания по зарплате: ', m.salary, 'зарплата') + GAP + line('Уровень в котах: ', m.cats, 'уровень');
    $('paper').innerHTML = h;

    const note = $('aiNote'), ai = current.ai;
    note.hidden = ai.state === 'none';
    note.className = 'ai-note' + (ai.state === 'error' ? ' err' : ai.state === 'busy' || ai.state === 'batch' ? ' busy' : '');
    if (ai.state === 'busy') note.textContent = 'Claude обрабатывает резюме… Обычно это занимает 10–40 секунд.';
    else if (ai.state === 'batch') note.textContent = 'Резюме в пакете Claude. Результат появится, когда пакет будет готов (обычно до часа).';
    else if (ai.state === 'error') note.textContent = ai.error;
    else if (ai.state === 'done') {
      const u = ai.usage || {};
      const fresh = u.input_tokens || 0, read = u.cache_read_input_tokens || 0, wrote = u.cache_creation_input_tokens || 0;
      note.innerHTML = (ai.eduHints && ai.eduHints.length ? '<div class="edu-hint"><b>В «О себе» найдено образование — добавьте в «Образование» или «Доп. образование»:</b><ul>' +
        ai.eduHints.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') + (ai.warnings.length ? '<b>Claude просит проверить:</b><ul>' + ai.warnings.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '✓ Claude обработал резюме, замечаний нет.') +
        '<div class="tokens">Токены — вход: ' + fresh + ' обычных, ' + read + ' из кэша, ' + wrote + ' записано в кэш; выход: ' + (u.output_tokens || 0) +
        (read ? ' · кэш сработал' : wrote ? ' · кэш создан, со следующего резюме будет дешевле' : '') +
        (u.repaired ? ' · была доработка (обязанности / «О себе»)' : '') + (u.batch ? ' · пакет (−50% на основной запрос)' : '') + '</div>';
    }
    $('btnAI').disabled = ai.state === 'busy' || ai.state === 'batch';
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
    save(await Resume.buildDocx(current.model, window.TEMPLATE_DOCX, JSZip, 'blob', current.photo), fileNameFor(current));
  }

  async function downloadAll() {
    const zip = new JSZip(), used = {};
    for (const it of items) {
      let name = fileNameFor(it);
      if (used[name]) name = name.replace(/\.docx$/, '_' + (++used[name]) + '.docx'); else used[name] = 1;
      zip.file(name, await Resume.buildDocx(it.model, window.TEMPLATE_DOCX, JSZip, 'uint8array', it.photo));
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
  $('btnDefaultRules').onclick = () => { $('aiRules').value = DEFAULT_RULES; };
  $('btnForgetKey').onclick = () => { $('apiKey').value = ''; saveSettings(); };
  $('settings').onclick = e => { if (e.target === $('settings')) $('settings').hidden = true; };
  $('btnBatch').onclick = sendBatch;
  renderAiState();
  renderBatchState();
  restoreBatch();
  $('btnZip').onclick = downloadAll;
})();
