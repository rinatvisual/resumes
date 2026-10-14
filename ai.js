// Обработка резюме через Claude API: чистка и раскладка по блокам шаблона
(function (root) {
  'use strict';

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  // Основная инструкция (не меняется — кэшируется на стороне Claude и стоит дешевле)
  function systemPrompt() {
    return `Ты — редактор резюме в кадровой службе. Сегодняшняя дата указана в сообщении с резюме.
Тебе присылают резюме кандидата (текст из Word или txt; порядок строк может быть перепутан из-за вёрстки в колонки).
Твоя задача — разложить сведения по блокам единого шаблона, исправить ошибки и вызвать инструмент save_resume.
Пометки вида «[НЕ ЗАПОЛНЕНО: …]» и «[даты не указаны]», а также памятки шаблона («На что обратить внимание», «(Наименование образовательной организации)» и т. п.) — служебные, это не данные кандидата: игнорируй их.

ГЛАВНЫЕ ПРАВИЛА:
1. НИЧЕГО НЕ ВЫДУМЫВАЙ. Каждый навык, программа, факт, качество и хобби в ответе должны быть в резюме кандидата. Если сведений нет — оставь поле пустым (null или пустой список), его подсветят красным. Исключение — только детализация обязанностей и раскрытие «О себе» по правилам ниже. Примеры в этой инструкции — только образец формата, никогда не переноси их в ответ.
2. НИЧЕГО НЕ ТЕРЯЙ. Все сведения кандидата должны попасть в подходящий блок. Удалять можно только то, что перечислено в «Что убрать». Если сомневаешься, удалять или нет, — оставь.
3. Редактура — это исправление ошибок и стиля, а не сокращение. Не сокращай текст кандидата и не обобщай его.
4. Исправляя опечатку, восстанавливай ТО ЖЕ слово, которое кандидат хотел написать, а не подбирай похожее или синоним: слово с ошибкой и исправленное должны отличаться лишь несколькими буквами.

Что убрать:
- контакты: телефоны, e-mail, ссылки, мессенджеры, улицу и дом (город проживания оставь — он идёт в city);
- гражданство, пол, дату рождения (вместо неё — возраст), национальность, ИНН и любые документы;
- подсказки и заготовки из конструкторов резюме («Укажите ваши навыки» и т. п.), служебные заголовки («ЛИЧНАЯ ИНФОРМАЦИЯ», «КОНТАКТЫ»), служебные пометки к разделам;
- «График и занятость», желаемую должность, «Готов к командировкам/переезду», любые фразы про индивидуальный график обучения и «образование не получаю».

Правила по блокам:
- age: возраст строкой «N лет». Если указана только дата рождения — посчитай возраст на сегодня.
- city: регион и город проживания ровно как в резюме. Нет — null.
- jobs: каждое место работы отдельно, как у кандидата. Переводы внутри одной компании без перерыва — одно место работы; position — последняя должность; карьерный рост одной фразой в achievements, если он был.
  Даты — месяц (1–12) и год. Работает до сих пор — current: true. Если указан только год — month: null.
  company: название места работы РОВНО как написал кандидат — не добавляй и не меняй ООО/АО/ИП, не переводи, не уточняй; можно только убрать служебные слова вроде «Организация:». Нет — null.
  position: с заглавной буквы, без названия компании. Если должность не выделена отдельно, но в строке перечислены профессии или вид работы (практика, стажировка) — это position, а не обязанность.
  duties: пункты в виде существительных: «<Действие> <объект>», каждый с большой буквы, без знаков препинания в конце. Исправь опечатки и согласование, смысл не меняй. Перечисление через запятую раздели на отдельные пункты. Количество пунктов кандидата НЕ УМЕНЬШАЙ: не удаляй и не объединяй его пункты (если пункт — личное качество, переформулируй его как действие).
  ОБЯЗАТЕЛЬНО МИНИМУМ 6 ОБЯЗАННОСТЕЙ, если кандидат указал хотя бы одну (от 1 до 5 — доведи до 6 детализацией: разложи указанные обязанности на составные действия, которые они обычно включают для этой должности). Нельзя добавлять новые направления работы, цифры, программы, оборудование и достижения. Нет обязанностей совсем — пустой список. Больше 6 — оставь все.
  КАЖДАЯ ОБЯЗАННОСТЬ — НЕ МЕНЕЕ 4 СЛОВ: короткий пункт распиши, уточнив суть в рамках сказанного и должности.
  achievements: всё, что кандидат указал как результат или достижение этого места работы, полными предложениями, без сокращений. Нет — пустой список. Достижения кандидата НИКОГДА не выбрасывай: если достижение не относится к месту работы (учёба, диплом, личные проекты) — перенеси его в about.
- software: только программы и системы, которые кандидат НАЗВАЛ, по одной в строке: «<Программа> - <уровень>». Уровень — только если указан. Пояснения кандидата к программе можно сократить. Не расшифровывай общие слова («офисные программы» так и пиши), не добавляй программ от себя. Умения, которые не являются программами, — в skills.
- skills: ВСЕ навыки и личные качества, которые кандидат перечислил в навыках, плюс качества, перенесённые из обязанностей (без повторов того, что уже есть). Ни один пункт кандидата не удаляй и не объединяй; только исправь опечатки. Коротко, с маленькой буквы (кроме названий и аббревиатур).
- about: ОДИН сплошной абзац (список из одного элемента), без переносов строк и списков; каждое предложение заканчивается точкой. Это весь текст кандидата о себе — без сокращений и в его же грамматической форме: лицо, время и обороты оставь как у кандидата («я освоил» — так и оставь, «мною освоено» — так и оставь); исправляй только опечатки и пунктуацию. Пропущенные знаки препинания обязательно расставь: если два предложения слиплись без точки, раздели их точкой (так, чтобы каждое предложение имело смысл), слова при этом не меняй. Сохрани всё: опыт, качества, достижения, студенческую и общественную активность, хобби и увлечения, мотивацию, пожелания по работе. Службу в армии и медкнижку упоминай, только если кандидат сам о них написал.
  Убери из «О себе» только сам факт обучения: где и на кого учится или учился, какое учебное заведение окончил, какие курсы прошёл (это есть в блоках образования). Всё остальное, связанное с учёбой (достижения, активность, «окончил с отличием», рейтинги выпускников), оставь. Сам в education ничего не переноси. Если убранный факт обучения НЕ указан в разделах об образовании — запиши его в about_education кратко.
  ОБЯЗАТЕЛЬНО МИНИМУМ 6 ПРЕДЛОЖЕНИЙ. Если меньше — раскрой мысли кандидата подробнее, опираясь на сведения из этого резюме (опыт работы, навыки). Каждое новое предложение должно опираться на конкретный факт из резюме; не пиши общих и служебных фраз («подробности указаны в резюме» и т. п.) и новых фактов. Нет «О себе» совсем — пустой список.
- family, kids, license — только если сведения есть в резюме.
- education / additional_education: только из разделов об образовании и курсах резюме, ничего не переноси из «О себе» и не дописывай. Для каждого: institution — учебное заведение полным названием; department — кафедра, факультет или институт, если указаны; specialty — направление или специальность с кодом, если он указан, и уровень в скобках («<код> <направление> (бакалавриат)»); years — период как у кандидата: «ГГГГ - ГГГГ» или с месяцами, если они указаны («Сентябрь ГГГГ - июнь ГГГГ»); если известен только год окончания — «ГГГГ»; form — форма обучения с большой буквы («Очная форма обучения»). Курсы, тренинги, языковые школы — в additional_education, с объёмом часов, если указан.
- languages: «<Язык> - <уровень>». Если уровень не указан — только язык. Русский как родной не указывай. Прочерк «-» — значит пусто.
- salary: число с пробелами по разрядам; приписки «от», «и выше» сохраняй. Если суммы нет — null.
- otdel и cats заполняй, только если они явно есть в тексте.
- warnings: телеграфным стилем, до 6 слов в пункте. Только реальные противоречия (в том числе даты достижений вне периода работы), сомнительные места и отметки о расширении («<компания>: обяз. N→6», «О себе: N→6»). Пустые блоки не перечисляй.

ПЕРЕД ВЫЗОВОМ save_resume ПРОВЕРЬ СЕБЯ:
1) все навыки кандидата есть в skills, ни один не потерян и ни один не добавлен от себя;
2) в about сохранены все сведения кандидата (кроме самого факта обучения), его формулировки и лицо; достижения не по месту работы перенесены сюда; нет выдуманных и служебных фраз; один абзац, не меньше 6 предложений;
3) у каждого места работы с обязанностями их не меньше 6, количество пунктов кандидата не уменьшено; в каждой не меньше 4 слов;
4) у образования указаны кафедра/факультет, если они были у кандидата;
5) в ответе нет ничего, чего нет в резюме, кроме разрешённой детализации; примеры из инструкции не использованы;
6) контакты убраны, город сохранён.

Кратко пиши только замечания в warnings. Всё остальное — полностью, без сокращений.`;
  }

  const str = { type: ['string', 'null'] };
  const point = { type: ['object', 'null'], properties: { month: { type: ['integer', 'null'] }, year: { type: 'integer' } }, required: ['year'] };
  const eduItem = {
    type: 'object',
    properties: { institution: str, department: str, specialty: str, years: str, form: str }
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

  // Тело основного запроса (общее для обычного и пакетного режима)
  function buildMainBody(text, model, customRules, cacheTtl) {
    const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const system = [{ type: 'text', text: systemPrompt() }];
    if (customRules && customRules.trim()) {
      system.push({ type: 'text', text: 'ДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА РЕКРУТЕРА — обязательно выполняй их (но правило «ничего не выдумывай» всегда главнее; детализация обязанностей до 6 пунктов по основной инструкции выдумкой не считается):\n' + customRules.trim() });
    }
    // метка кэша на последнем блоке: в кэш попадают описание блоков, инструкция и правила рекрутера
    system[system.length - 1].cache_control = cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    return {
      model,
      max_tokens: 6000,
      system,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'save_resume' },
      messages: [{ role: 'user', content: 'Сегодня ' + today + '\n\nРезюме кандидата:\n\n' + compact(text) }]
    };
  }

  // Обычный режим: основной запрос + доработка и проверки
  async function process(text, apiKey, model, customRules, cacheTtl) {
    const first = await call(apiKey, buildMainBody(text, model, customRules, cacheTtl));
    return finish(first.input, first.usage, text, apiKey, model);
  }

  // Доработка и проверки после основного ответа (обычный и пакетный режим)
  async function finish(input, firstUsage, text, apiKey, model) {
    const d = input, usage = Object.assign({}, firstUsage);
    d.warnings = d.warnings || [];

    // Проверка ответа: если Haiku не довёл обязанности или «О себе» до нормы — доработка (до 2 заходов)
    for (let round = 0; round < 2; round++) {
      const need = checkRules(d);
      if (!need.jobs.length && !need.about) break;
      const fix = await repair(d, need, apiKey, model);
      for (const k in fix.usage) if (typeof fix.usage[k] === 'number') usage[k] = (usage[k] || 0) + fix.usage[k];
      if (fix.ok) usage.repaired = true;
      if (fix.errors.length) {
        d.warnings.push('Доработка: ошибок ' + fix.errors.length + ' (' + fix.errors[0].slice(0, 90) + ')');
        if (!fix.ok) break;
      }
    }
    (d.jobs || []).forEach((j, i) => {
      const n = (j.duties || []).filter(x => String(x || '').trim()).length;
      if (n >= 1 && n < 6) d.warnings.push((j.company || 'Место ' + (i + 1)) + ': обязанностей ' + n + ' из 6');
    });

    // Защита от потерь и выдумок — сверка с исходным текстом (без запросов к Claude)
    guard(d, compact(text));

    return { data: d, usage };
  }

  // ---------- Сверка ответа с исходным текстом ----------
  // «основы» слов: для сравнения формулировок без учёта окончаний и опечаток в окончаниях
  // похожие кириллические и латинские буквы приводим к одному виду («1с» = «1c»)
  const LOOK = { 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'к': 'k', 'м': 'm', 'т': 't', 'в': 'b', 'н': 'h' };
  const stems = t => (String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[асеорхукмтвн]/g, c => LOOK[c]).match(/[a-zа-я0-9+#]+/g) || [])
    .filter(w => w.length >= 3 || /\d/.test(w) || /^[a-z]{2}$/.test(w)).map(w => w.length >= 6 ? w.slice(0, 5) : w);
  const STOP = new Set(['работ', 'знани', 'навык', 'умени', 'опыт', 'польз', 'базов', 'уверен', 'продв', 'для', 'при', 'так'].map(w => stems(w)[0]));
  const covered = (item, pool) => stems(item).filter(w => !STOP.has(w)).some(w => pool.has(w));

  function guard(d, src) {
    const srcSet = new Set(stems(src));
    const R = root.Resume;
    const srcModel = R ? R.parse(src) : null;

    // 1) выдуманные навыки и программы — убрать
    for (const key of ['skills', 'software']) {
      const keep = [];
      (d[key] || []).forEach(x => {
        if (!String(x || '').trim()) return;
        if (stems(x).filter(w => !STOP.has(w)).length && !covered(x, srcSet)) d.warnings.push('Убрано, нет в резюме: ' + x);
        else keep.push(x);
      });
      d[key] = keep;
    }

    // 2) потерянные навыки кандидата — вернуть
    if (srcModel && srcModel.skills) {
      const have = new Set(stems((d.skills || []).join(' ')));
      const lost = srcModel.skills.replace(/\.$/, '').split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean)
        .filter(x => !covered(x, have));
      if (lost.length) {
        d.skills = (d.skills || []).concat(lost.map(x => x[0].toLowerCase() === x[0] || /^[A-ZА-Я]{2,}/.test(x) ? x : x[0].toLowerCase() + x.slice(1)));
        d.warnings.push('Возвращены навыки: ' + lost.length);
      }
    }

    // 3) повторы в навыках: пункт, который лишь уточняет уже имеющийся («стрессоустойчивость к любым ситуациям»
    //    при «стрессоустойчивость»), убираем — но только если это не пункт из списка навыков самого кандидата
    const srcItems = new Set(((srcModel && srcModel.skills) || '').replace(/\.$/, '').split(/\s*[,;]\s*/).map(x => x.trim().toLowerCase()));
    const sk = d.skills || [];
    const st = sk.map(x => stems(x).filter(w => !STOP.has(w)));
    d.skills = sk.filter((x, i) => srcItems.has(x.trim().toLowerCase()) || !st.some((o, k) =>
      k !== i && o.length && o.length < st[i].length && o.every(w => st[i].includes(w))));

    // 4) объём курсов в часах («252 ч.») — вернуть, если Claude потерял
    const hours = (src.match(/\d{2,4}\s*(?:ч\.|час(?:ов|а)?|ак\.?\s*ч)/gi) || []).map(h => h.match(/\d+/)[0]);
    const addEdu = d.additional_education || [];
    if (addEdu.length === 1) {
      const txt = JSON.stringify(addEdu[0]);
      hours.forEach(h => { if (!txt.includes(h)) addEdu[0].specialty = (addEdu[0].specialty || '') + ' (' + h + ' ч.)'; });
    }

    // 5) достижения кандидата, которых нет в результате, — дописываем в «О себе»
    const outSet = new Set(stems(JSON.stringify([d.about, (d.jobs || []).map(j => [j.achievements, j.duties]), d.skills])));
    const coverage = t => { const w = stems(t).filter(x => !STOP.has(x)); return w.length ? w.filter(x => outSet.has(x)).length / w.length : 1; };
    ((srcModel && srcModel.jobs) || []).forEach(j => (j.ach || []).forEach(a => {
      if (a.length > 15 && coverage(a) < 0.5) {
        d.about = [((d.about || []).join(' ') + ' ' + a.replace(/^[-–•\s]+/, '')).trim()];
        d.warnings.push('Достижение перенесено в «О себе»: ' + a.slice(0, 40) + '…');
      }
    }));

    // 6) фразы в «О себе», которых по сути нет в исходнике, — на проверку
    (d.about || []).join(' ').match(/[^.!?…]+[.!?…]+/g)?.forEach(sn => {
      const w = stems(sn).filter(x => !STOP.has(x));
      if (w.length >= 4 && w.filter(x => srcSet.has(x)).length / w.length < 0.4) d.warnings.push('Проверьте фразу в «О себе»: ' + sn.trim().slice(0, 60) + '…');
    });

    // 7) «О себе» заметно короче исходного — предупредить
    if (srcModel && srcModel.about && srcModel.about.length) {
      const before = srcModel.about.join(' ').length, after = (d.about || []).join(' ').length;
      if (after < before * 0.65) d.warnings.push('О себе сократилось: ' + before + '→' + after + ' знаков');
    }
  }

  // Сколько предложений в тексте
  const sentences = t => (String(t || '').match(/[^.!?…]+[.!?…]+/g) || []).filter(x => x.trim().length > 2).length;
  const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;

  function checkRules(d) {
    const jobs = [];
    (d.jobs || []).forEach((j, i) => {
      const du = (j.duties || []).filter(x => String(x || '').trim());
      if (du.length && (du.length < 6 || du.some(x => words(x) <= 2) || !String(j.position || '').trim())) jobs.push(i);
    });
    const about = (d.about || []).join(' ').trim();
    return { jobs, about: !!about && (sentences(about) < 6 || /\n/.test(about)) };
  }

  // Доработка: каждое место работы и «О себе» — отдельным маленьким запросом (параллельно),
  // чтобы Haiku не пропускал места из длинного списка
  const FIX_DUTIES_TOOL = {
    name: 'fix_duties',
    description: 'Вернуть доработанные обязанности одного места работы',
    input_schema: { type: 'object', properties: { position: { type: ['string', 'null'] }, duties: { type: 'array', items: { type: 'string' } } }, required: ['duties'] }
  };
  const FIX_ABOUT_TOOL = {
    name: 'fix_about',
    description: 'Вернуть доработанный текст «О себе»',
    input_schema: { type: 'object', properties: { about: { type: 'string' } }, required: ['about'] }
  };
  const FIX_DUTIES_PROMPT = `Ты дорабатываешь обязанности одного места работы из резюме. Ничего не выдумывай сверх детализации.
Верни НЕ МЕНЬШЕ 6 пунктов и не меньше, чем было в запросе, каждый НЕ МЕНЬШЕ 4 слов.
Сохрани все исходные пункты по смыслу (не удаляй и не объединяй их); короткие (3 слова и меньше) распиши подробнее; недостающие получи детализацией указанных обязанностей на составные действия, обычные для этой должности.
Нельзя добавлять новые направления работы, цифры, программы, оборудование, достижения.
Пункты — действия в виде существительных, с большой буквы, без знаков препинания в конце. Личные качества пунктами не делай.
Если position пустая, а среди пунктов есть перечень профессий или название должности — убери его из пунктов и верни в position.
Верни результат через fix_duties.`;
  const FIX_ABOUT_PROMPT = `Ты дорабатываешь блок «О себе» из резюме. Ничего не выдумывай.
Верни один сплошной абзац, НЕ МЕНЬШЕ 6 предложений, каждое с точкой. Сохрани ВСЕ сведения исходного текста, ничего не удаляй и не сокращай.
Если предложений меньше 6 — раскрой сказанное подробнее, опираясь на опыт работы кандидата (передан в запросе). Новых фактов (хобби, награды, качества, не следующие из сказанного) не добавляй.
Верни результат через fix_about.`;

  async function repair(d, need, apiKey, model) {
    const usage = {};
    const add = u => { for (const k in u || {}) if (typeof u[k] === 'number') usage[k] = (usage[k] || 0) + u[k]; };
    const experience = (d.jobs || []).map(j => [j.position, j.company].filter(Boolean).join(', '));
    const tasks = need.jobs.map(i => async () => {
      const j = d.jobs[i];
      const minN = Math.max(6, j.duties.length);
      // минимум пунктов задаём прямо в формате ответа — так модель соблюдает его надёжнее
      const tool = JSON.parse(JSON.stringify(FIX_DUTIES_TOOL));
      tool.input_schema.properties.duties.minItems = minN;
      const r = await call(apiKey, {
        model, max_tokens: 1500, system: FIX_DUTIES_PROMPT,
        tools: [tool], tool_choice: { type: 'tool', name: 'fix_duties' },
        messages: [{ role: 'user', content: JSON.stringify({ company: j.company, position: j.position, duties: j.duties }) }]
      });
      add(r.usage);
      const f = r.input || {};
      const du = (f.duties || []).map(x => String(x || '').trim()).filter(Boolean);
      const before = j.duties.length;
      if (!du.length || du.length < before) return;  // ответ короче исходного — не принимаем
      j.duties = du;
      if (!String(j.position || '').trim() && f.position) j.position = f.position;
      if (du.length > before) d.warnings.push((j.company || 'Место ' + (i + 1)) + ': обяз. ' + before + '→' + du.length);
    });
    if (need.about) tasks.push(async () => {
      const r = await call(apiKey, {
        model, max_tokens: 1500, system: FIX_ABOUT_PROMPT,
        tools: [FIX_ABOUT_TOOL], tool_choice: { type: 'tool', name: 'fix_about' },
        messages: [{ role: 'user', content: JSON.stringify({ about: (d.about || []).join(' '), experience }) }]
      });
      add(r.usage);
      const t = String((r.input || {}).about || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      const before = sentences((d.about || []).join(' '));
      d.about = [t];
      d.warnings.push('О себе: ' + before + '→' + sentences(t));
    });
    // не больше 3 запросов одновременно
    const errors = [];
    let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        const t = tasks[next++];
        try { await t(); } catch (e) { errors.push(e.message); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return { usage, errors, ok: tasks.length - errors.length };
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
    // временные ошибки сервера (перегрузка, лимит) — повторяем до 3 раз с паузой
    for (let attempt = 0; ; attempt++) {
      try { return await callOnce(apiKey, body); }
      catch (e) {
        if (!e.retryable || attempt >= 3) throw e;
        await new Promise(r => setTimeout(r, (e.retryAfter || 2 ** attempt * 2) * 1000));
      }
    }
  }

  async function callOnce(apiKey, body) {
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
      const err = new Error(res.status === 429 ? 'Слишком много запросов — подождите минуту (' + msg + ')' : 'Ошибка Claude API ' + res.status + ': ' + msg);
      err.retryable = res.status === 429 || res.status >= 500;  // 529 — перегрузка, 500/503 — сбой
      err.retryAfter = +res.headers.get('retry-after') || 0;
      throw err;
    }
    return data;
  }

  // ---------- Пакетная обработка (Message Batches API, −50% к цене) ----------
  // пакеты идут через посредника (base) — напрямую из браузера Anthropic их не принимает
  async function batchCreate(apiKey, requests, base) {
    return callRawPath(apiKey, 'POST', '/v1/messages/batches', { requests }, base);
  }
  async function batchList(apiKey, base) {
    return callRawPath(apiKey, 'GET', '/v1/messages/batches?limit=10', null, base);
  }
  async function batchGet(apiKey, id, base) {
    return callRawPath(apiKey, 'GET', '/v1/messages/batches/' + id, null, base);
  }
  // результаты — JSONL: по строке на резюме; возвращаем { custom_id: {input, usage} | {error} }
  async function batchResults(apiKey, url, base) {
    const res = await fetch(base ? url.replace('https://api.anthropic.com', base) : url, { headers: apiHeaders(apiKey) });
    if (!res.ok) throw new Error('Не удалось получить результаты пакета: ' + res.status);
    const out = {};
    (await res.text()).split('\n').filter(Boolean).forEach(line => {
      const r = JSON.parse(line), res2 = r.result || {};
      if (res2.type === 'succeeded') {
        const block = (res2.message.content || []).find(b => b.type === 'tool_use');
        out[r.custom_id] = block ? { input: block.input, usage: res2.message.usage || {} } : { error: 'Claude не вернул данные резюме' };
      } else {
        out[r.custom_id] = { error: res2.type === 'expired' ? 'не успело обработаться за 24 часа' : res2.type === 'canceled' ? 'пакет отменён' : ((res2.error && (res2.error.error || res2.error).message) || 'ошибка') };
      }
    });
    return out;
  }
  const apiHeaders = apiKey => ({
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  });
  async function callRawPath(apiKey, method, path, body, base) {
    const res = await fetch((base || 'https://api.anthropic.com') + path, { method, headers: apiHeaders(apiKey), body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Ошибка Claude API ' + res.status + ': ' + ((data.error && data.error.message) || res.statusText));
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
    if (v(d.family)) L.push('Семейное положение: ' + v(d.family).toLowerCase());
    const k = v(d.kids).toLowerCase();
    if (k) L.push(k.startsWith('нет') ? 'Детей нет' : 'Есть дети' + k.replace(/^есть(\s+дети)?/, ''));
    if (v(d.license)) L.push('Водительское удостоверение: ' + v(d.license));
    L.push('', 'Навыки: ' + (d.skills || []).map(v).filter(Boolean).join(', '));

    const edu = arr => {
      (arr || []).forEach((e, i) => {
        if (i) L.push('');
        [e.institution, v(e.department) ? (/^(кафедра|факультет|институт)/i.test(v(e.department)) ? v(e.department) : 'Кафедра: ' + v(e.department)) : '', e.specialty, e.years, e.form].map(v).filter(Boolean).forEach(x => L.push(x));
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

  root.ResumeAI = { process, finish, buildMainBody, batchCreate, batchList, batchGet, batchResults, toCanonicalText, compact, checkRules, guard, TOOL, systemPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
