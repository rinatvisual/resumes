// Разбор резюме и сборка Word по шаблону
(function (root) {
  'use strict';

  // ---------- Общие помощники ----------
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTH_KEYS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTH_RE = '(?:янв\\S*|фев\\S*|мар\\S*|апр\\S*|ма[йя]|июн\\S*|июл\\S*|авг\\S*|сен\\S*|окт\\S*|ноя\\S*|дек\\S*)';
  const POINT_RE = '(?:' + MONTH_RE + '\\s+\\d{4}|\\d{1,2}[./]\\d{4}|\\d{4})(?:\\s*г\\.?(?:ода?)?)?';
  const NOW_RE = '(?:по\\s+)?(?:настоящее(?:\\s+время)?|н\\.?\\s*в\\.?|наст\\.?\\s*вр\\.?|сейчас|текущее\\s+время)';
  const DATE_LINE = new RegExp('^(?:с\\s+)?(' + POINT_RE + ')\\s*(?:[-–—]+|по)\\s*(' + POINT_RE + '|' + NOW_RE + ')\\s*(\\(.*\\))?\\s*[.,;]?\\s*(.*)$', 'i');
  const DURATION_LINE = /^\(?\s*(\d+\s*(?:год|года|лет|мес\S*)(?:\s+\d+\s*мес\S*)?)\s*\)?$/i;
  const BULLET_RE = /^\s*(?:[-–—•*·▪●◦►✓]|\d{1,2}[.)])\s*/;

  const clean = s => s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/["“„]([^"“”„\n]+)["”“]/g, '«$1»').trim();
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const isBullet = s => BULLET_RE.test(s) && !/^\d{4}/.test(s);
  const stripBullet = s => s.replace(BULLET_RE, '').trim();
  const dashes = s => s.replace(/\s*[–—]\s*/g, ' - ').replace(/(\S)\s+-\s*(\S)/g, '$1 - $2').replace(/(\d{4})\s*-\s*(\d{4})/g, '$1 - $2');

  function plural(n, one, few, many) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  // Первая буква пункта в нижний регистр (кроме аббревиатур: ЭДО, MS Office)
  function lowerFirst(s) {
    if (s.length > 1 && /[А-ЯЁ]/.test(s[0]) && /[а-яё]/.test(s[1])) return s[0].toLowerCase() + s.slice(1);
    return s;
  }

  // ---------- Даты в опыте работы ----------
  function parsePoint(p) {
    p = p.trim().toLowerCase();
    let m = p.match(/^(\d{1,2})[./](\d{4})/);
    if (m) return { m: +m[1] - 1, y: +m[2] };
    m = p.match(new RegExp('^(' + MONTH_RE + ')\\s+(\\d{4})', 'i'));
    if (m) {
      const idx = MONTH_KEYS.findIndex(k => m[1].startsWith(k));
      return { m: idx, y: +m[2] };
    }
    m = p.match(/(\d{4})/);
    return m ? { m: null, y: +m[1] } : null;
  }
  const fmtPoint = (pt, upper) => {
    const s = (pt.m != null ? MONTHS[pt.m] + ' ' : '') + pt.y;
    return upper ? cap(s) : s;
  };

  function duration(a, b) {
    if (a.m == null || b.m == null) {
      const y = b.y - a.y;
      return y > 0 ? y + ' ' + plural(y, 'год', 'года', 'лет') : '';
    }
    let months = (b.y - a.y) * 12 + ((b.m ?? 0) - (a.m ?? 0));
    if (months < 1) months = 1;
    const y = Math.floor(months / 12), mo = months % 12, out = [];
    if (y) out.push(y + ' ' + plural(y, 'год', 'года', 'лет'));
    if (mo) out.push(mo + ' ' + plural(mo, 'месяц', 'месяца', 'месяцев'));
    return out.join(' ');
  }

  // Приводит строку дат к виду «Октябрь 2024 - по настоящее время (5 месяцев)»
  function formatDateLine(line, nextDuration) {
    const m = clean(line).match(DATE_LINE);
    if (!m) return null;
    const a = parsePoint(m[1]);
    const now = new RegExp('^' + NOW_RE + '$', 'i').test(m[2].trim());
    const now0 = new Date();
    const b = now ? { m: now0.getMonth(), y: now0.getFullYear() } : parsePoint(m[2]);
    let dur = m[3] ? m[3].replace(/^\(\s*|\s*\)$/g, '') : (nextDuration || duration(a, b));
    const text = fmtPoint(a, true) + ' - ' + (now ? 'по настоящее время' : fmtPoint(b, false)) + (dur ? ' (' + dur + ')' : '');
    return { text, rest: clean(m[4] || '') };
  }
  const isDateLine = s => DATE_LINE.test(clean(s));

  // ---------- Заголовки блоков ----------
  const HEADINGS = [
    ['otdel', /^(?:желаемый\s+)?отделы?$/],
    ['exp', /^опыт\s+работы$/],
    ['soft', /^(?:владение\s+(?:по|пк|программами|компьютером)|программное\s+обеспечение|знание\s+(?:по|программ))$/],
    ['about', /^(?:о\s+себе|обо\s+мне|дополнительная\s+информация)$/],
    ['skills', /^(?:ключевые\s+|профессиональные\s+)?навыки$/],
    ['edu', /^(?:основное\s+)?образование$/],
    ['addEdu', /^(?:доп\.?\s*образование|дополнительное\s+образование|курсы(?:\s+и\s+тренинги)?|повышение\s+квалификации)$/],
    ['lang', /^(?:знание\s+(?:иностранных\s+)?языков.*|иностранные\s+языки|языки|владение\s+языками)$/],
    ['salary', /^(?:ожидания\s+по\s+(?:зарплате|заработной\s+плате)|(?:желаемая|ожидаемая)\s+(?:зарплата|заработная\s+плата)|зарплатные\s+ожидания|зарплата)$/],
    ['cats', /^уровень\s+в\s+котах$/],
  ];

  function matchHeading(line) {
    const m = line.match(/^([^:]{2,60}?)\s*:\s*(.*)$/);
    const name = (m ? m[1] : line).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    for (const [key, re] of HEADINGS) {
      if (re.test(name)) return { key, rest: m ? m[2].trim() : '' };
    }
    return null;
  }

  // Анкетные строки (обычно в блоке «О себе»)
  const PERSONAL = [
    ['grafik', /индивидуальн\S*\s+график/i, 'Готов / не готов перейти на индивидуальный график обучения'],
    ['family', /^семейное\s+положение/i, 'Семейное положение'],
    ['kids', /^(?:дет(?:ей|и)(?![а-яё])|есть\s+дет|нет\s+детей)/i, 'Дети'],
    ['license', /^(?:водительск|права(?![а-яё]))/i, 'Водительское удостоверение'],
  ];

  // ---------- Разбор текста в модель ----------
  function parse(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').map(clean);
    const sec = { head: [] };
    const personal = {};
    let cur = 'head';
    for (const line of lines) {
      if (line) {
        const h = matchHeading(line);
        if (h) {
          cur = h.key;
          sec[cur] = sec[cur] || [];
          if (h.rest) sec[cur].push(h.rest);
          continue;
        }
        if (cur !== 'exp') {
          const p = PERSONAL.find(([, re]) => re.test(line));
          if (p) { personal[p[0]] = (personal[p[0]] ? personal[p[0]] + ' ' : '') + line; continue; }
        }
      }
      (sec[cur] = sec[cur] || []).push(line);
    }

    const nonEmpty = arr => (arr || []).filter(Boolean);
    const model = {};

    // Шапка: ФИО, возраст, прочее
    const head = nonEmpty(sec.head);
    const ageIdx = head.findIndex(l => /^(?:возраст\s*:?\s*)?\d{1,2}\s*(?:год|года|лет)(?![а-яё])/i.test(l));
    model.age = ageIdx >= 0 ? head[ageIdx].replace(/^возраст\s*:?\s*/i, '') : '';
    const rest = head.filter((_, i) => i !== ageIdx);
    model.name = rest.length ? rest.shift().replace(/^ф\.?\s*и\.?\s*о\.?\s*:?\s*/i, '') : '';
    if (/^[—-]$/.test(model.name)) model.name = '';
    model.headExtra = rest;

    model.otdel = nonEmpty(sec.otdel).join(' ');
    model.jobs = parseJobs(sec.exp || []);
    model.soft = joinContinuations(nonEmpty(sec.soft).map(l => isBullet(l) ? stripBullet(l) : l)).map(dashes);
    model.about = nonEmpty(sec.about);
    model.personal = personal;
    model.skills = formatSkills(nonEmpty(sec.skills));
    model.edu = groups(sec.edu || []);
    model.addEdu = groups(sec.addEdu || []);
    model.lang = nonEmpty(sec.lang).map(l => dashes(isBullet(l) ? stripBullet(l) : l).replace(/\s*[:–—]\s*(?=[A-CА-СВ]\d)/i, ' - '));
    model.salary = nonEmpty(sec.salary).join(' ').replace(/\d{4,}/g, d => d.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
    model.cats = nonEmpty(sec.cats).join(' ');
    model.missing = findMissing(model);
    return model;
  }

  // Строки, начинающиеся с маленькой буквы, — продолжение предыдущей
  function joinContinuations(arr) {
    const out = [];
    for (const l of arr) {
      if (out.length && /^[a-zа-яё(]/.test(l)) out[out.length - 1] += ' ' + l;
      else out.push(l);
    }
    return out;
  }

  // Группы, разделённые пустыми строками (для образования)
  function groups(arr) {
    const res = [];
    let g = [];
    for (const l of arr) {
      if (!l) { if (g.length) res.push(g), g = []; continue; }
      g.push(dashes(isBullet(l) ? stripBullet(l) : l));
    }
    if (g.length) res.push(g);
    return res;
  }

  function formatSkills(arr) {
    if (!arr.length) return '';
    let s = arr.map(l => stripBullet(l).replace(/[;,.]\s*$/, '')).filter(Boolean).join(', ');
    s = s.replace(/\s*;\s*/g, ', ').replace(/\s+,/g, ',');
    return /[.!]$/.test(s) ? s : s + '.';
  }

  function parseJobs(lines) {
    const jobs = [];
    let job = null;
    const newJob = date => (job = { date, company: '', position: '', head: [], duties: [], ach: [], mode: 'head' }, jobs.push(job));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (/^\[даты не указаны\]$/i.test(line)) { newJob(''); continue; }
      if (isDateLine(line)) {
        let dur = null;
        const nxt = lines.slice(i + 1).find(Boolean);
        if (nxt && DURATION_LINE.test(nxt)) {
          dur = nxt.match(DURATION_LINE)[1];
          i = lines.indexOf(nxt, i + 1);
        }
        const d = formatDateLine(line, dur);
        newJob(d.text);
        if (d.rest) job.head.push(d.rest);
        continue;
      }
      if (!job) newJob('');
      const a = line.match(/^достижени[яе]\s*:?\s*(.*)$/i);
      if (a) { job.mode = 'ach'; if (a[1]) job.ach.push(a[1]); continue; }
      if (/^(?:обязанности|функционал|должностные\s+обязанности)\s*:?\s*$/i.test(line)) { job.mode = 'duties'; continue; }
      if (job.mode === 'head') {
        if (isBullet(line) || job.head.length >= 2) job.mode = 'duties';
        else { job.head.push(line); continue; }
      }
      (job.mode === 'ach' ? job.ach : job.duties).push(line);
    }
    for (const j of jobs) {
      const dash = x => (!x || /^[—-]$/.test(x) ? '' : x);
      j.company = dash(j.head[0]);
      j.position = dash(j.head[1]);
      j.duties = normalizeDuties(j.duties);
      delete j.head; delete j.mode;
    }
    return jobs;
  }

  // Пункты: «- текст;» и последний «- текст.»
  function normalizeDuties(arr) {
    const anyBullet = arr.some(isBullet);
    const items = [];
    for (const l of arr) {
      if (anyBullet && !isBullet(l) && items.length && /^[a-zа-яё(]/.test(l)) items[items.length - 1] += ' ' + l;
      else items.push(stripBullet(l));
    }
    const ABBR = /(?:^|[\s(])(?:т\.\s?[дпе]|др|пр|г|гг|руб|млн|млрд|тыс|ед)\.$/i;
    return items.filter(Boolean).map((t, i, all) => {
      t = t.replace(/[\s;,]+$/, '');
      if (!ABBR.test(t)) t = t.replace(/[.\s]+$/, '');
      const last = i === all.length - 1;
      return '- ' + lowerFirst(t) + (last ? (/\.$/.test(t) ? '' : '.') : ';');
    });
  }

  function findMissing(m) {
    const miss = [];
    if (!m.name) miss.push('ФИО');
    if (!m.age) miss.push('Возраст');
    if (!m.otdel) miss.push('Отдел');
    if (!m.jobs.length) miss.push('Опыт работы');
    m.jobs.forEach((j, i) => {
      const n = 'Опыт работы, место ' + (i + 1);
      if (!j.date) miss.push(n + ': даты');
      if (!j.company) miss.push(n + ': компания');
      if (!j.position) miss.push(n + ': должность');
      if (!j.duties.length) miss.push(n + ': обязанности');
    });
    if (!m.soft.length) miss.push('Владение ПО');
    if (!m.about.length) miss.push('О себе');
    PERSONAL.forEach(([k, , label]) => { if (!m.personal[k]) miss.push(label); });
    if (!m.skills) miss.push('Навыки');
    if (!m.edu.length) miss.push('Образование');
    if (!m.addEdu.length) miss.push('Доп. образование');
    if (!m.lang.length) miss.push('Знание языков');
    if (!m.salary) miss.push('Ожидания по зарплате');
    if (!m.cats) miss.push('Уровень в котах');
    return miss;
  }

  // ---------- Сборка XML таблицы для Word ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONT = '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
  const MAR = '<w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>';

  function r(text, o = {}) {
    const red = o.red;
    const rpr = FONT + (o.b || red ? '<w:b/><w:bCs/>' : '') + '<w:color w:val="' + (red ? 'C00000' : '000000') + '"/><w:sz w:val="28"/><w:szCs w:val="28"/>' +
      (red ? '<w:shd w:val="clear" w:color="auto" w:fill="FFD9D9"/>' : '');
    return String(text).split('\t').map((part, i) =>
      '<w:r><w:rPr>' + rpr + '</w:rPr>' + (i ? '<w:tab/>' : '') + (part ? '<w:t xml:space="preserve">' + esc(part) + '</w:t>' : '') + '</w:r>').join('');
  }
  const p = (runs = '', extra = '') => '<w:p><w:pPr>' + extra + '<w:spacing w:line="240" w:lineRule="auto"/></w:pPr>' + runs + '</w:p>';
  const missRun = label => r('[НЕ ЗАПОЛНЕНО: ' + label + ']', { red: true });

  function cellFull(paras) {
    return '<w:tc><w:tcPr><w:tcW w:w="10358" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="auto"/>' + MAR + '</w:tcPr>' + (paras || p()) + '</w:tc>';
  }
  function rowLR(h, leftMerge, rightParas) {
    return '<w:tr><w:trPr><w:trHeight w:val="' + h + '"/></w:trPr>' +
      '<w:tc><w:tcPr><w:tcW w:w="3549" w:type="dxa"/><w:vMerge' + (leftMerge ? ' w:val="restart"' : '') + '/><w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>' + MAR + '</w:tcPr>' + p() + '</w:tc>' +
      '<w:tc><w:tcPr><w:tcW w:w="6809" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="auto"/>' + MAR + '</w:tcPr>' + rightParas + '</w:tc></w:tr>';
  }
  const rowFull = (h, paras) => '<w:tr><w:trPr><w:trHeight w:val="' + h + '"/></w:trPr>' + cellFull(paras) + '</w:tr>';
  const headingRow = (title, missing) => rowFull(300, p(r(title, { b: true, red: missing }), '<w:keepNext/>'));

  function buildTableXml(m) {
    const rows = [];
    // Шапка
    let right = p(m.name ? r(m.name, { b: true }) : missRun('ФИО'));
    right += p(m.age ? r(m.age) : missRun('возраст'));
    m.headExtra.forEach(l => { right += p(r(l)); });
    rows.push(rowLR(333, true, right));
    rows.push(rowLR(640, false, p(r('Отдел:', { b: true, red: !m.otdel })).replace('<w:spacing w:line="240"', '<w:spacing w:before="240" w:line="240"')));
    rows.push(rowLR(2245, false, p(m.otdel ? r(m.otdel) : missRun('отдел')) + p()));

    // Опыт работы
    rows.push(headingRow('Опыт работы:', !m.jobs.length));
    let ex = '';
    if (!m.jobs.length) ex = p(missRun('опыт работы'));
    m.jobs.forEach((j, i) => {
      if (i) ex += p();
      ex += p(j.date ? r(j.date, { b: true }) : missRun('даты работы'));
      ex += p(j.company ? r(j.company, { b: true }) : missRun('компания'));
      ex += p(j.position ? r(j.position, { b: true }) : missRun('должность'));
      if (j.duties.length) j.duties.forEach(d => { ex += p(r(d)); });
      else ex += p(missRun('обязанности'));
      if (j.ach.length) {
        ex += p(r('Достижения:', { b: true }));
        j.ach.forEach(a => { ex += p(r(a)); });
      }
    });
    rows.push(rowFull(1244, ex));

    // Владение ПО
    rows.push(headingRow('Владение ПО:', !m.soft.length));
    rows.push(rowFull(241, m.soft.length ? m.soft.map(l => p(r(l))).join('') : p(missRun('владение ПО'))));

    // О себе + анкета + навыки
    rows.push(headingRow('О себе:', !m.about.length));
    let ab = m.about.length ? m.about.map(l => p(r(l))).join('') : p(missRun('о себе'));
    ab += p();
    PERSONAL.forEach(([k, , label]) => { ab += p(m.personal[k] ? r(m.personal[k]) : missRun(label)); });
    ab += p();
    ab += p(r('Навыки: ', { b: true, red: !m.skills }) + (m.skills ? r(m.skills) : missRun('навыки')));
    rows.push(rowFull(1500, ab));

    // Образование, доп. образование
    const grp = (g, label) => g.length ? g.map((lines, i) => (i ? p() : '') + lines.map(l => p(r(l))).join('')).join('') : p(missRun(label));
    rows.push(headingRow('Образование:', !m.edu.length));
    rows.push(rowFull(600, grp(m.edu, 'образование')));
    rows.push(headingRow('Доп. образование:', !m.addEdu.length));
    rows.push(rowFull(600, grp(m.addEdu, 'доп. образование')));

    // Языки
    rows.push(headingRow('Знание языков и уровень владения:', !m.lang.length));
    rows.push(rowFull(191, m.lang.length ? m.lang.map(l => p(r(l), '<w:keepNext/>')).join('') : p(missRun('знание языков'))));

    // Зарплата и уровень
    rows.push(rowFull(993,
      p() + p(r('Ожидания по зарплате: ', { red: !m.salary }) + (m.salary ? r(m.salary) : missRun('зарплата'))) +
      p() + p(r('Уровень в котах: ', { red: !m.cats }) + (m.cats ? r(m.cats) : missRun('уровень')))));

    return '<w:tbl><w:tblPr><w:tblStyle w:val="StGen4"/><w:tblW w:w="10358" w:type="dxa"/><w:tblInd w:w="132" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
      '<w:tblLook w:val="0600" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="3549"/><w:gridCol w:w="6809"/></w:tblGrid>' + rows.join('') + '</w:tbl>';
  }

  // Готовый .docx (Blob/Uint8Array) из модели
  async function buildDocx(model, templateB64, JSZipLib, type) {
    const zip = await JSZipLib.loadAsync(templateB64, { base64: true });
    const xml = await zip.file('word/document.xml').async('string');
    zip.file('word/document.xml', xml.replace('<!--RESUME_TABLE-->', buildTableXml(model)));
    return zip.generateAsync({ type: type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  // ---------- Текст из входного .docx ----------
  async function docxToText(data, JSZipLib, DOMParserCls) {
    const zip = await JSZipLib.loadAsync(data);
    const f = zip.file('word/document.xml');
    if (!f) throw new Error('Файл не похож на документ Word (.docx)');
    const doc = new DOMParserCls().parseFromString(await f.async('string'), 'text/xml');
    const out = [];
    const nameOf = n => n.nodeName;
    function textOf(node, buf) {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        const n = nameOf(c);
        if (n === 'w:p' || n === 'mc:Fallback' || n === 'w:instrText' || n === 'w:delText') continue;
        if (n === 'w:t') buf.push(c.textContent);
        else if (n === 'w:tab') buf.push(' ');
        else if (n === 'w:br' || n === 'w:cr') buf.push('\n');
        else if (c.firstChild) textOf(c, buf);
      }
    }
    function walk(node) {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        const n = nameOf(c);
        if (n === 'mc:Fallback') continue;
        if (n === 'w:p') {
          const buf = [];
          textOf(c, buf);
          let t = buf.join('');
          const isList = c.getElementsByTagName('w:numPr').length > 0;
          if (isList && t.trim() && !BULLET_RE.test(t)) t = '- ' + t;
          out.push(t);
          walk(c); // текст из надписей внутри абзаца
        } else if (c.firstChild) walk(c);
      }
    }
    walk(doc.documentElement);
    return out.join('\n');
  }

  // Текст из .txt: UTF-8 или Windows-1251
  function decodeTxt(bytes) {
    const u8 = new Uint8Array(bytes);
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1251').decode(u8); }
  }

  root.Resume = { parse, buildTableXml, buildDocx, docxToText, decodeTxt, PERSONAL };
})(typeof window !== 'undefined' ? window : globalThis);
