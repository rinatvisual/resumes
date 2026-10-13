// Обработка резюме через Claude API: чистка и раскладка по блокам шаблона
(function (root) {
  'use strict';

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  // Основная инструкция (не меняется — кэшируется на стороне Claude и стоит дешевле)
  function systemPrompt() {
    return `Ты — редактор резюме в кадровой службе. Сегодняшняя дата указана в сообщении с резюме.
Тебе присылают резюме кандидата (текст из Word или txt; порядок строк может быть перепутан из-за вёрстки в колонки).
Твоя задача — разложить сведения по блокам единого шаблона и вызвать инструмент save_resume.
Пометки вида «[НЕ ЗАПОЛНЕНО: …]» и «[даты не указаны]», а также памятки шаблона («На что обратить внимание», «(Наименование образовательной организации)» и т. п.) — служебные, это не данные кандидата: игнорируй их.

ГЛАВНОЕ ПРАВИЛО: ничего не выдумывай. Если сведений нет — оставь поле пустым (null или пустой список). Пустые поля потом подсветятся красным, и рекрутер их дозаполнит. Исключения — только детализация обязанностей и «О себе» по правилам ниже.

Что УБРАТЬ полностью:
- контакты: телефоны, e-mail, ссылки, мессенджеры, улицу и дом (город проживания НЕ убирай — он идёт в city);
- гражданство, пол, дату рождения (вместо неё — возраст), национальность, ИНН и любые документы;
- подсказки и заготовки из конструкторов резюме («Укажите ваши навыки», «Название учебного заведения» и т. п.);
- служебные заголовки («ЛИЧНАЯ ИНФОРМАЦИЯ», «КОНТАКТЫ» и т. п.), «График и занятость», желаемую должность, «Готов к командировкам/переезду».

Правила по блокам:
- age: возраст строкой «26 лет». Если указана только дата рождения — посчитай возраст на сегодня.
- city: регион и город проживания как в резюме, например «РТ, г. Заинск».
- jobs: каждое место работы отдельно. Переводы внутри одной компании без перерыва — одно место работы; position — последняя должность; карьерный рост одной фразой в achievements (например «Вырос с оператора склада до менеджера ГУТЗ»), если он был.
  Даты — месяц (1–12) и год. Работает до сих пор — current: true. Если указан только год — month: null.
  company: ВСЕГДА с организационно-правовой формой: ПАО/АО/ООО/ИП/Самозанятость + название в «ёлочках»: ООО «Агроторг», АО «Эссен Продакшн». Государственные и муниципальные учреждения — полным названием, как указано. Если форму ты достоверно знаешь — укажи её. Если не знаешь (кофейня, салон, магазин, бренд) — НЕ угадывай: оставь название как у кандидата («Кофейня «Sevendays»»), рекрутер уточнит вручную. Самозанятость — только если кандидат сам так написал. Если места работы нет — null.
  position: с заглавной буквы, без названия компании. Если должность не выделена отдельно, но в строке перечислены профессии («Бровист, мастер по наращиванию ресниц, фотограф») или вид работы («Учебная и производственная практика») — это position, а не обязанность.
  duties: пункты в виде существительных («Инвентаризация склада», «Внесение изменений в систему NEXUS»), каждый с большой буквы, без знаков препинания в конце. Исправь опечатки и согласование, смысл не меняй. Перечисление через запятую раздели на отдельные пункты.
  ОБЯЗАТЕЛЬНО МИНИМУМ 6 ОБЯЗАННОСТЕЙ, если кандидат указал от 2 до 5 — доведи до 6 детализацией: разложи указанные обязанности на составные действия, которые они обычно включают для этой должности (например, «Инвентаризация склада» → «Подготовка склада к инвентаризации», «Пересчёт товарных остатков», «Сверка фактического наличия с данными учёта»). Это детализация, а не выдумка. Нельзя добавлять новые направления работы, цифры, программы, оборудование и достижения. Если обязанностей нет совсем — оставь список пустым. Если указана ровно одна — не расширяй количество, только распиши её подробнее при необходимости.
  КАЖДАЯ ОБЯЗАННОСТЬ — НЕ МЕНЕЕ 4 СЛОВ. Если пункт из 3 слов и меньше («Работа с клиентами»), распиши его, уточнив суть в рамках сказанного («Консультирование клиентов по ассортименту и услугам»).
  achievements: только то, что кандидат сам указал как результат/достижение, полными предложениями. Нет — пустой список.
- software: только программы, которые кандидат НАЗВАЛ, по одной (или группе) в строке: «Microsoft Excel - уверенный пользователь». Уровень — только если указан. Не расшифровывай общие слова: «офисные программы» так и пиши («Офисные программы - продвинутый пользователь»), не придумывай Word/Excel. Знания и умения, которые не являются программами («знание комплектующих ПК»), переноси в skills.
- about: ОДИН сплошной абзац (список из одного элемента), без переносов строк и без списков; каждое предложение заканчивается точкой. Основа — текст кандидата о себе с редактурой (опечатки, пунктуация, стиль). Сюда же коротко полезные факты: служба в армии, наличие медкнижки.
  В «О себе» НЕ должно быть ни слова об образовании, учёбе, вузах, колледжах, курсах, тренингах — удали такие предложения целиком, даже если это образование уже есть в разделе «Образование». Сам в education не переноси. Если удалённые сведения НЕ указаны в разделах об образовании — запиши каждое в about_education предельно кратко (например: «Курс 1С, 2022»).
  ОБЯЗАТЕЛЬНО МИНИМУМ 6 ПРЕДЛОЖЕНИЙ (после удаления образования). Если меньше — раскрой написанное подробнее: разверни мысли, качества и мотивацию кандидата, опираясь на сведения из этого резюме (опыт работы, навыки). Нельзя добавлять факты, которых нет в резюме: хобби, курсы, награды, качества, которые не следуют из сказанного. Если блока «О себе» нет совсем — оставь список пустым.
- grafik, family, kids, license — только если сведения есть в резюме.
- skills: профессиональные навыки списком, коротко, с маленькой буквы (кроме названий и аббревиатур).
- education / additional_education: заполняй ТОЛЬКО из разделов об образовании и курсах самого резюме, ничего не переноси туда из «О себе» и не дописывай; можно лишь поправить оформление. Учебное заведение полным названием, специальность и уровень в скобках («Технологические машины и оборудование (бакалавриат)»), годы «2017 - 2021» (если известен только год окончания — «2023»), форма обучения с большой буквы («Очная форма обучения»). Курсы, тренинги, языковые школы — в additional_education.
- languages: «Английский - A1». Если уровень не указан — только язык. Русский как родной не указывай. Прочерк «-» — значит пусто.
- salary: число с пробелами по разрядам «60 000»; приписки «от», «и выше» сохраняй («130 000 и выше»). Если суммы нет — null.
- otdel и cats заполняй, только если они явно есть в тексте.
- warnings: телеграфным стилем, до 6 слов в пункте (например: «Агроторг: начало 20.08 или 20.06?», «Грядка: обяз. 2→6», «О себе: 3→6»). Только реальные противоречия (в том числе даты достижений вне периода работы, например «достижение в июне 2022, а работа с декабря 2022»), сомнительные места и отметки о расширении. Пустые блоки не перечисляй.

ПЕРЕД ВЫЗОВОМ save_resume ПРОВЕРЬ СЕБЯ:
1) где кандидат указал 2–5 обязанностей, их стало не меньше 6; в каждой обязанности не меньше 4 слов;
2) профессии и виды работы стоят в position, а не в duties;
3) в about один абзац, не меньше 6 предложений и ни слова об образовании и курсах;
4) контакты убраны, город проживания сохранён в city;
5) ничего не выдумано сверх разрешённой детализации.

Пиши кратко: не повторяй сведения, не добавляй пояснений от себя.`;
  }

  const str = { type: ['string', 'null'] };
  const point = { type: ['object', 'null'], properties: { month: { type: ['integer', 'null'] }, year: { type: 'integer' } }, required: ['year'] };
  const eduItem = {
    type: 'object',
    properties: { institution: str, specialty: str, years: str, form: str }
  };
  const TOOL = {
    name: 'save_resume',
    description: 'Сохранить резюме, разложенное по блокам шаблона',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'], description: 'ФИО полностью: Фамилия Имя Отчество' },
        age: str,
        city: { type: ['string', 'null'], description: 'Регион и город проживания' },
        otdel: str,
        jobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              start: point, end: point, current: { type: 'boolean' },
              company: str, position: str,
              duties: { type: 'array', items: { type: 'string' } },
              achievements: { type: 'array', items: { type: 'string' } }
            },
            required: ['company', 'position', 'duties']
          }
        },
        software: { type: 'array', items: { type: 'string' } },
        about: { type: 'array', items: { type: 'string' } },
        grafik: { type: ['string', 'null'], enum: ['готов', 'не готов', null], description: 'Готов ли перейти на индивидуальный график обучения' },
        family: { type: ['string', 'null'], description: 'Семейное положение одним-двумя словами: «женат», «холост», «замужем», «не замужем»' },
        kids: { type: ['string', 'null'], description: '«нет» или «есть», можно с уточнением: «есть (2)»' },
        license: { type: ['string', 'null'], description: '«нет», «учусь» или категории: «категория B»' },
        skills: { type: 'array', items: { type: 'string' } },
        education: { type: 'array', items: eduItem },
        additional_education: { type: 'array', items: eduItem },
        languages: { type: 'array', items: { type: 'string' } },
        salary: str,
        cats: str,
        about_education: { type: 'array', items: { type: 'string' }, description: 'Образование и курсы, найденные в «О себе», которых нет в разделах об образовании' },
        warnings: { type: 'array', items: { type: 'string' }, maxItems: 5 }
      },
      required: ['name', 'jobs', 'warnings']
    }
  };

  // Очистка текста до отправки: меньше токенов, и контакты не уходят в Claude
  const PHONE = /(?:\+\s?\d{1,3}|\b8)[\s\-–(]*\d{3}[\s\-–)]*\d{3}[\s\-–]*\d{2}[\s\-–]*\d{2}\b/g;
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const URL = /(?:https?:\/\/|www\.)\S+|\b(?:t\.me|vk\.com|wa\.me|hh\.ru\/resume|linkedin\.com|instagram\.com)\/\S*/gi;
  const NICK = /(^|[\s,(])@[A-Za-z0-9_]{3,}/g;
  const LABEL_ONLY = /^(?:тел(?:ефон)?\.?|моб(?:ильный)?\.?|e-?mail|эл(?:ектронная)?\.?\s*почта|почта|telegram|телеграм|tg|тг|instagram|инстаграм|max|макс|whatsapp|vk|вконтакте|контакты|контактная информация|адрес|ссылка|сайт|skype|личная информация)\s*:?\s*[,;.]*$/i;
  const HINT = /^(?:укажите|введите|опишите|перечислите|напишите|добавьте)\b|^название учебного заведения$|^\[не заполнено[^\]]*\]$|^\[даты не указаны\]$/i;

  function compact(text) {
    const out = [];
    const src = root.Resume ? root.Resume.stripGuide(text) : text;
    for (let line of src.replace(/\r\n?/g, '\n').split('\n')) {
      line = line.replace(/\[НЕ ЗАПОЛНЕНО:[^\]]*\]/gi, '')
        .replace(EMAIL, '').replace(URL, '').replace(PHONE, '').replace(NICK, '$1')
        .replace(/[ \t\u00a0]+/g, ' ').replace(/\s+([,;.])/g, '$1').replace(/([,;])(?:\s*[,;])+/g, '$1').replace(/,\s*\./g, '.').replace(/^[\s,;:]+|[\s,;]+$/g, '');
      if (LABEL_ONLY.test(line) || HINT.test(line) || /^[-–—•*·.,;:\s]*$/.test(line)) line = '';
      if (!line && (!out.length || out[out.length - 1] === '')) continue; // без повторных пустых строк
      out.push(line);
    }
    return out.join('\n').trim();
  }

  // Запрос к Claude
  async function process(text, apiKey, model, customRules, cacheTtl) {
    const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const system = [{ type: 'text', text: systemPrompt() }];
    if (customRules && customRules.trim()) {
      system.push({ type: 'text', text: 'ДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА РЕКРУТЕРА — обязательно выполняй их (но правило «ничего не выдумывай» всегда главнее; детализация обязанностей до 6 пунктов по основной инструкции выдумкой не считается):\n' + customRules.trim() });
    }
    // метка кэша на последнем блоке: в кэш попадают описание блоков, инструкция и правила рекрутера
    system[system.length - 1].cache_control = cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    const first = await call(apiKey, {
      model,
      max_tokens: 6000,
      system,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'save_resume' },
      messages: [{ role: 'user', content: 'Сегодня ' + today + '\n\nРезюме кандидата:\n\n' + compact(text) }]
    });
    const d = first.input, usage = Object.assign({}, first.usage);
    d.warnings = d.warnings || [];

    // Проверка ответа: если Haiku не довёл обязанности или «О себе» до нормы — короткий запрос-доработка
    const need = checkRules(d);
    if (need.jobs.length || need.about) {
      try {
        const fix = await repair(d, need, apiKey, model);
        for (const k in fix.usage) if (typeof fix.usage[k] === 'number') usage[k] = (usage[k] || 0) + fix.usage[k];
        usage.repaired = true;
      } catch (e) {
        d.warnings.push('Доработка не удалась — нажмите «Обработать заново»');
      }
    }

    // Места работы без ООО/АО/ИП — отмечаем, чтобы уточнить вручную (без запросов к Claude)
    (d.jobs || []).forEach(j => {
      const c = String(j.company || '').trim();
      if (c && !hasForm(c)) d.warnings.push(c + ': укажите ООО/АО/ИП');
    });
    return { data: d, usage };
  }

  // Есть ли у названия организационно-правовая форма
  const FORM_RE = /^(?:ПАО|НПАО|АО|ЗАО|ОАО|НАО|ООО|ИП|ГУП|МУП|ФГУП|ФГБУ|ФГАОУ|ФГБОУ|ГБУ|ГАУ|ГКУ|МБУ|МАУ|МКУ|МБОУ|МАОУ|МБДОУ|МАДОУ|ГБОУ|ГАОУ|ГАПОУ|ГБПОУ|АНО|Самозанят)/i;
  const hasForm = name => FORM_RE.test(String(name).trim()) || /учреждени|муниципальн|государственн|федеральн|министерств|администрац|воинская часть/i.test(name);

  // Сколько предложений в тексте
  const sentences = t => (String(t || '').match(/[^.!?…]+[.!?…]+/g) || []).filter(x => x.trim().length > 2).length;
  const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;

  function checkRules(d) {
    const jobs = [];
    (d.jobs || []).forEach((j, i) => {
      const du = (j.duties || []).filter(x => String(x || '').trim());
      if (du.length && ((du.length >= 2 && du.length < 6) || du.some(x => words(x) <= 3) || !String(j.position || '').trim())) jobs.push(i);
    });
    const about = (d.about || []).join(' ').trim();
    return { jobs, about: !!about && (sentences(about) < 6 || /\n/.test(about)) };
  }

  const FIX_TOOL = {
    name: 'fix_resume',
    description: 'Вернуть доработанные обязанности и «О себе»',
    input_schema: {
      type: 'object',
      properties: {
        jobs: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, position: { type: ['string', 'null'] }, duties: { type: 'array', items: { type: 'string' } } }, required: ['index', 'duties'] } },
        about: { type: ['string', 'null'] }
      },
      required: ['jobs']
    }
  };
  const FIX_PROMPT = `Ты дорабатываешь резюме кандидата. Ничего не выдумывай сверх детализации.
Обязанности: для каждого места работы из запроса верни НЕ МЕНЬШЕ 6 пунктов (если исходно был всего 1 пункт — количество не увеличивай), каждый НЕ МЕНЬШЕ 4 слов. Сохрани смысл исходных пунктов; недостающие получи детализацией указанных обязанностей на составные действия, обычные для этой должности. Короткие пункты (3 слова и меньше) распиши подробнее. Нельзя добавлять новые направления работы, цифры, программы, оборудование, достижения. Пункты — существительные с большой буквы, без знаков препинания в конце.
Если position пустая, а среди обязанностей есть перечень профессий или название должности — убери его из обязанностей и верни в position.
«О себе» (если передано): один сплошной абзац, НЕ МЕНЬШЕ 6 предложений, каждое с точкой. Раскрой сказанное кандидатом, опираясь на его опыт работы. Без образования и курсов. Новых фактов (хобби, награды, качества, не следующие из сказанного) не добавляй.
Верни результат через fix_resume.`;

  async function repair(d, need, apiKey, model) {
    const payload = {
      jobs: need.jobs.map(i => ({ index: i, company: d.jobs[i].company, position: d.jobs[i].position, duties: d.jobs[i].duties })),
      about: need.about ? (d.about || []).join(' ') : null,
      experience: (d.jobs || []).map(j => [j.position, j.company].filter(Boolean).join(', '))
    };
    const r = await call(apiKey, {
      model, max_tokens: 3000, system: FIX_PROMPT,
      tools: [FIX_TOOL], tool_choice: { type: 'tool', name: 'fix_resume' },
      messages: [{ role: 'user', content: JSON.stringify(payload) }]
    });
    const f = r.input || {};
    (f.jobs || []).forEach(fj => {
      const j = d.jobs[fj.index];
      if (!j || !need.jobs.includes(fj.index) || !Array.isArray(fj.duties) || !fj.duties.length) return;
      const before = j.duties.length;
      j.duties = fj.duties;
      if (!String(j.position || '').trim() && fj.position) j.position = fj.position;
      if (fj.duties.length > before) d.warnings.push((j.company || 'Место ' + (fj.index + 1)).replace(/^(ООО|АО|ПАО|ОАО|ИП)\s*/, '') + ': обяз. ' + before + '→' + fj.duties.length);
    });
    if (need.about && f.about) {
      const before = sentences((d.about || []).join(' '));
      d.about = [f.about.replace(/\s+/g, ' ').trim()];
      d.warnings.push('О себе: ' + before + '→' + sentences(f.about));
    }
    return r;
  }

  // Запрос к Claude, ответ — блок инструмента
  async function call(apiKey, body) {
    const data = await callRaw(apiKey, body);
    const block = (data.content || []).find(b => b.type === 'tool_use');
    if (!block) throw new Error('Claude не вернул данные резюме');
    return { input: block.input, usage: data.usage || {} };
  }

  // Один запрос к Claude API с понятными ошибками
  async function callRaw(apiKey, body) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText;
      if (res.status === 401) throw new Error('Claude не принял ключ API (' + msg + '). Ключ скопирован не полностью, удалён или отключён — создайте новый в console.anthropic.com → API Keys и вставьте его в «Настройки Claude».');
      if (res.status === 403) throw new Error('Доступ запрещён (' + msg + '). Обычно это значит, что Claude API недоступен из вашей страны или у аккаунта нет доступа к выбранной модели.');
      if (res.status === 429) throw new Error('Слишком много запросов — подождите минуту (' + msg + ')');
      throw new Error('Ошибка Claude API ' + res.status + ': ' + msg);
    }
    return data;
  }

  // ---------- Перевод ответа Claude в текст «канонического» вида ----------
  const v = s => (s == null ? '' : String(s).trim());
  const pt = p => (p.month ? MONTHS[p.month - 1] + ' ' : '') + p.year;

  function toCanonicalText(d) {
    const L = [];
    L.push(v(d.name) || '[не указано]');
    if (v(d.age)) L.push(v(d.age));
    L.push('', 'Отдел:');
    if (v(d.otdel)) L.push(v(d.otdel));

    L.push('', 'Опыт работы:');
    // от новых к старым: сначала текущая работа, затем по дате окончания и начала
    const key = p => (p && p.year ? p.year * 12 + (p.month || 12) : 0);
    const jobs = (d.jobs || []).slice().sort((a, b) =>
      (b.current || !key(b.end) ? 1e6 : key(b.end)) - (a.current || !key(a.end) ? 1e6 : key(a.end)) || key(b.start) - key(a.start));
    jobs.forEach((j, i) => {
      if (i) L.push('');
      if (j.start && j.start.year) {
        const s = pt(j.start);
        const e = j.current ? 'по настоящее время' : (j.end && j.end.year ? pt(j.end) : null);
        L.push(s[0].toUpperCase() + s.slice(1) + ' - ' + (e || 'по настоящее время'));
      } else {
        L.push('[даты не указаны]');
      }
      L.push(v(j.company) || '[не указано]', v(j.position) || '[не указано]');
      (j.duties || []).filter(x => v(x)).forEach(x => L.push('- ' + v(x)));
      const ach = (j.achievements || []).filter(x => v(x));
      if (ach.length) L.push('Достижения:', ...ach.map(v));
    });

    L.push('', 'Владение ПО:', ...(d.software || []).map(v).filter(Boolean));
    // «О себе» — одним абзацем
    const about = (d.about || []).map(v).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    L.push('', 'О себе:', ...(about ? [about] : []), '');
    const g = v(d.grafik).toLowerCase();
    if (g) L.push(g === 'готов' ? 'Готов перейти на индивидуальный график обучения' : 'Не готов перейти на индивидуальный график обучения');
    if (v(d.family)) L.push('Семейное положение: ' + v(d.family).toLowerCase());
    const k = v(d.kids).toLowerCase();
    if (k) L.push(k.startsWith('нет') ? 'Детей нет' : 'Есть дети' + k.replace(/^есть(\s+дети)?/, ''));
    if (v(d.license)) L.push('Водительское удостоверение: ' + v(d.license));
    L.push('', 'Навыки: ' + (d.skills || []).map(v).filter(Boolean).join(', '));

    const edu = arr => {
      (arr || []).forEach((e, i) => {
        if (i) L.push('');
        [e.institution, e.specialty, e.years, e.form].map(v).filter(Boolean).forEach(x => L.push(x));
      });
    };
    L.push('', 'Образование:'); edu(d.education);
    L.push('', 'Доп. образование:'); edu(d.additional_education);
    L.push('', 'Знание языков и уровень владения:', ...(d.languages || []).map(v).filter(Boolean));
    L.push('', 'Город проживания: ' + v(d.city));
    L.push('', 'Ожидания по зарплате: ' + v(d.salary));
    L.push('', 'Уровень в котах: ' + v(d.cats));
    return L.join('\n');
  }

  root.ResumeAI = { process, toCanonicalText, compact, checkRules, TOOL, systemPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
