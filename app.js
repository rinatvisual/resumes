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
    $('aiRules').value = cfg.rules;
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
    store.set('claude_key', cfg.key || null);
    store.set('claude_model2', cfg.model);
    store.set('claude_rules2', cfg.rules);
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
      const { data, usage } = await ResumeAI.process(it.raw, cfg.key, cfg.model, cfg.rules);
      it.text = ResumeAI.toCanonicalText(data);
      it.model = Resume.parse(it.text);
      it.ai = { state: 'done', warnings: data.warnings || [], usage };
    } catch (e) {
      it.ai = { state: 'error', error: e instanceof TypeError ? await diagnose() : e.message };
    }
    refresh(it);
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
    note.hidden = ai.state === 'none';
    note.className = 'ai-note' + (ai.state === 'error' ? ' err' : ai.state === 'busy' ? ' busy' : '');
    if (ai.state === 'busy') note.textContent = 'Claude обрабатывает резюме… Обычно это занимает 10–40 секунд.';
    else if (ai.state === 'error') note.textContent = ai.error;
    else if (ai.state === 'done') {
      const u = ai.usage || {};
      const tok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      note.innerHTML = (ai.warnings.length ? '<b>Claude просит проверить:</b><ul>' + ai.warnings.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '✓ Claude обработал резюме, замечаний нет.') +
        '<div class="tokens">Токены: ' + tok + ' на входе (из них из кэша ' + (u.cache_read_input_tokens || 0) + '), ' + (u.output_tokens || 0) + ' на выходе</div>';
    }
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
  $('btnDefaultRules').onclick = () => { $('aiRules').value = DEFAULT_RULES; };
  $('btnForgetKey').onclick = () => { $('apiKey').value = ''; saveSettings(); };
  $('settings').onclick = e => { if (e.target === $('settings')) $('settings').hidden = true; };
  renderAiState();
  $('btnZip').onclick = downloadAll;
})();
