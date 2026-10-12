// Обработка резюме через Claude API: чистка и раскладка по блокам шаблона
(function (root) {
  'use strict';

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  function systemPrompt() {
    const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    return `Ты — редактор резюме в кадровой службе. Сегодня ${today}.
Тебе присылают резюме кандидата (текст из Word или txt; порядок строк может быть перепутан из-за вёрстки в колонки).
Твоя задача — разложить сведения по блокам единого шаблона и вызвать инструмент save_resume.
Пометки вида «[НЕ ЗАПОЛНЕНО: …]» и «[даты не указаны]» — служебные, это не данные кандидата: игнорируй их.

ГЛАВНОЕ ПРАВИЛО: ничего не выдумывай. Если сведений нет — оставь поле пустым (null или пустой список). Пустые поля потом подсветятся красным, и рекрутер их дозаполнит.

Что УБРАТЬ полностью:
- контакты: телефоны, e-mail, ссылки, мессенджеры, адреса проживания;
- гражданство, пол, дату рождения (вместо неё — возраст), национальность, фото, ИНН и любые документы;
- подсказки и заготовки из конструкторов резюме («Укажите ваши навыки», «Название учебного заведения» и т. п.);
- служебные заголовки («ЛИЧНАЯ ИНФОРМАЦИЯ», «КОНТАКТЫ» и т. п.), «График и занятость», желаемую должность, «Готов к командировкам/переезду».

Правила по блокам:
- age: возраст строкой «26 лет». Если указана только дата рождения — посчитай возраст на сегодня.
- jobs: каждое место работы отдельно, от новых к старым. Переводы внутри одной компании без перерыва — одно место работы; position — последняя должность; карьерный рост одной фразой в achievements (например «Вырос с оператора склада до менеджера ГУТЗ»), если он был.
  Даты — месяц (1–12) и год. Работает до сих пор — current: true. Если указан только год — month: null.
  company: организационная форма + название в «ёлочках»: ООО «Агроторг», АО «Тандер». Известные бренды можно без формы.
  position: с заглавной буквы, без названия компании.
  duties: короткие пункты в виде существительных («инвентаризация склада», «внесение изменений в систему NEXUS»), с маленькой буквы, без знаков препинания в конце. Исправь опечатки и согласование, смысл не меняй, не добавляй обязанностей, которых нет в тексте. Перечисление через запятую раздели на отдельные пункты.
  achievements: только то, что кандидат сам указал как результат/достижение, полными предложениями.
- software: по одной программе (или группе) в строке: «Microsoft Excel - уверенный пользователь». Уровень пиши только если он указан. Пакет Word/Excel/PowerPoint можно объединить: «Пакет программ MS Office (Word, Excel)».
- about: текст кандидата о себе, лёгкая редактура (опечатки, пунктуация). Сюда же коротко полезные факты: служба в армии, наличие медкнижки. Каждый абзац — отдельная строка.
- grafik, family, kids, license — только если сведения есть в резюме.
- skills: профессиональные навыки списком, коротко, с маленькой буквы (кроме названий и аббревиатур).
- education / additional_education: учебное заведение полным названием, специальность и уровень в скобках («Технологические машины и оборудование (бакалавриат)»), годы «2017 - 2021» (если известен только год окончания — «2023»), форма обучения («Очная форма обучения»). Курсы, тренинги, языковые школы — в additional_education.
- languages: «Английский - A1». Если уровень не указан — только язык. Русский как родной не указывай.
- salary: только число с пробелами по разрядам «60 000». Если суммы нет — null.
- otdel и cats заполняй, только если они явно есть в тексте.
- warnings: коротко перечисли противоречия и сомнительные места, которые рекрутеру стоит проверить (несостыковки дат, непонятная должность и т. п.). Пиши по-русски.`;
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
        warnings: { type: 'array', items: { type: 'string' } }
      },
      required: ['name', 'jobs', 'warnings']
    }
  };

  // Запрос к Claude
  async function process(text, apiKey, model) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: systemPrompt(),
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'save_resume' },
        messages: [{ role: 'user', content: 'Резюме кандидата:\n\n' + text }]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText;
      if (res.status === 401) throw new Error('Неверный ключ API (' + msg + ')');
      if (res.status === 403) throw new Error('Доступ запрещён (' + msg + ')');
      if (res.status === 429) throw new Error('Слишком много запросов — подождите минуту (' + msg + ')');
      throw new Error('Ошибка Claude API ' + res.status + ': ' + msg);
    }
    const block = (data.content || []).find(b => b.type === 'tool_use');
    if (!block) throw new Error('Claude не вернул данные резюме');
    return { data: block.input, usage: data.usage };
  }

  // ---------- Перевод ответа Claude в текст «канонического» вида ----------
  const v = s => (s == null ? '' : String(s).trim());
  const pt = p => (p.month ? MONTHS[p.month - 1] + ' ' : '') + p.year;

  function toCanonicalText(d) {
    const L = [];
    L.push(v(d.name) || '—');
    if (v(d.age)) L.push(v(d.age));
    L.push('', 'Отдел:');
    if (v(d.otdel)) L.push(v(d.otdel));

    L.push('', 'Опыт работы:');
    (d.jobs || []).forEach((j, i) => {
      if (i) L.push('');
      if (j.start && j.start.year) {
        const s = pt(j.start);
        const e = j.current ? 'по настоящее время' : (j.end && j.end.year ? pt(j.end) : null);
        L.push(s[0].toUpperCase() + s.slice(1) + ' - ' + (e || 'по настоящее время'));
      } else {
        L.push('[даты не указаны]');
      }
      L.push(v(j.company) || '—', v(j.position) || '—');
      (j.duties || []).filter(x => v(x)).forEach(x => L.push('- ' + v(x)));
      const ach = (j.achievements || []).filter(x => v(x));
      if (ach.length) L.push('Достижения:', ...ach.map(v));
    });

    L.push('', 'Владение ПО:', ...(d.software || []).map(v).filter(Boolean));
    L.push('', 'О себе:', ...(d.about || []).map(v).filter(Boolean), '');
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
    L.push('', 'Ожидания по зарплате: ' + v(d.salary));
    L.push('', 'Уровень в котах: ' + v(d.cats));
    return L.join('\n');
  }

  root.ResumeAI = { process, toCanonicalText, TOOL, systemPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
