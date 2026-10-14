// Чтение PDF: текст по строкам и фото кандидата (библиотека pdf.js загружается только при первом PDF)
(function (root) {
  'use strict';
  let loading = null;

  function loadLib() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    if (!loading) loading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'lib/pdfjs/pdf.js';
      s.onload = () => {
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.js';
        ok(root.pdfjsLib);
      };
      s.onerror = () => fail(new Error('Не удалось загрузить модуль чтения PDF'));
      document.head.appendChild(s);
    });
    return loading;
  }

  // Текст страницы: кусочки текста собираем в строки по высоте, пустая строка — при большом отступе
  function pageLines(items) {
    const parts = items.filter(it => it.str !== undefined).map(it => ({
      s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10, eol: it.hasEOL
    })).filter(p => p.s.trim() || p.eol);
    parts.sort((a, b) => (Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 ? b.y - a.y : a.x - b.x));
    const lines = [];
    let cur = null;
    for (const p of parts) {
      if (cur && Math.abs(cur.y - p.y) <= Math.min(cur.h, p.h) * 0.5) {
        const gap = p.x - cur.xEnd;
        cur.text += (gap > p.h * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(p.s) ? ' ' : '') + p.s;
        cur.xEnd = p.x + p.w;
      } else {
        if (cur) lines.push(cur);
        cur = { text: p.s, y: p.y, h: p.h, xEnd: p.x + p.w };
      }
    }
    if (cur) lines.push(cur);
    const out = [];
    lines.forEach((l, i) => {
      if (i && lines[i - 1].y - l.y > l.h * 2.2) out.push('');
      out.push(l.text.replace(/\s+/g, ' ').trim());
    });
    return out;
  }

  // Самое крупное изображение на первой странице — фото кандидата
  async function firstPagePhoto(lib, page) {
    try {
      const ops = await page.getOperatorList();
      const pageW = page.view[2] - page.view[0];
      // следим за матрицей преобразования, чтобы знать, сколько места картинка занимает на странице:
      // фон шаблона растянут почти на весь лист — его пропускаем, фото обычно занимает около четверти ширины
      const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
      let ctm = [1, 0, 0, 1, 0, 0];
      const stack = [], found = [];
      ops.fnArray.forEach((fn, i) => {
        if (fn === lib.OPS.save) stack.push(ctm);
        else if (fn === lib.OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === lib.OPS.transform) ctm = mul(ctm, ops.argsArray[i]);
        else if (fn === lib.OPS.paintImageXObject || fn === lib.OPS.paintJpegXObject) {
          const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
          found.push({ name: ops.argsArray[i][0], w, h });
        }
      });
      let best = null, bestArea = 0;
      for (const f of found) {
        if (f.w > pageW * 0.6 || f.w < 40 || f.h < 40) continue;  // фон или мелкая иконка
        const img = await new Promise(ok => {
          try { page.objs.get(f.name, ok); } catch (e) { try { page.commonObjs.get(f.name, ok); } catch (e2) { ok(null); } }
          setTimeout(() => ok(null), 3000);
        });
        if (!img || !img.width) continue;
        if (f.w * f.h > bestArea) { best = img; bestArea = f.w * f.h; }
      }
      if (!best) return null;
      const c = document.createElement('canvas');
      c.width = best.width; c.height = best.height;
      const ctx = c.getContext('2d');
      if (best.bitmap) ctx.drawImage(best.bitmap, 0, 0);
      else if (best.data) {
        const id = ctx.createImageData(best.width, best.height), src = best.data, px = best.width * best.height;
        const ch = src.length / px;  // 1 — серое, 3 — RGB, 4 — RGBA
        for (let i = 0; i < px; i++) {
          const o = i * 4;
          if (ch >= 3) { id.data[o] = src[i * ch]; id.data[o + 1] = src[i * ch + 1]; id.data[o + 2] = src[i * ch + 2]; }
          else { id.data[o] = id.data[o + 1] = id.data[o + 2] = src[i]; }
          id.data[o + 3] = ch === 4 ? src[i * 4 + 3] : 255;
        }
        ctx.putImageData(id, 0, 0);
      } else return null;
      // фон — белый (у прозрачных картинок), сохраняем в JPEG
      const c2 = document.createElement('canvas');
      c2.width = c.width; c2.height = c.height;
      const ctx2 = c2.getContext('2d');
      ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, c2.width, c2.height); ctx2.drawImage(c, 0, 0);
      const blob = await new Promise(ok => c2.toBlob(ok, 'image/jpeg', 0.9));
      if (!blob) return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'jpg', mime: 'image/jpeg', cx: best.width, cy: best.height };
    } catch (e) { return null; }
  }

  async function read(buf) {
    const lib = await loadLib();
    const doc = await lib.getDocument({ data: new Uint8Array(buf), cMapUrl: 'lib/pdfjs/cmaps/', cMapPacked: true }).promise;
    const lines = [];
    let photo = null;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      if (n > 1) lines.push('');
      lines.push(...pageLines(tc.items));
      if (n === 1) photo = await firstPagePhoto(lib, page);
    }
    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.replace(/\s/g, '').length < 40) {
      throw new Error('В этом PDF нет текста — похоже, это скан или картинка. Такой файл можно перепечатать или сохранить из Word заново как PDF с текстом.');
    }
    return { text, photo };
  }

  root.PdfRead = { read };
})(window);
