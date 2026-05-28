/* ===========================================================
   Режим правок (review mode) — выделить текст → комментарий.
   Активен ТОЛЬКО на localhost или при ?review в URL.
   На боевом сайте ничего не показывает.
   Данные — в localStorage (общие для всех страниц одного origin).
   Выгрузка: POST /__review (сервер пишет файл) + скачать + копировать.
   =========================================================== */
(function () {
  var host = location.hostname;
  var FLAG = /[?&]review\b/.test(location.search);
  try { if (FLAG) localStorage.setItem('rv_on', '1'); } catch (e) {}
  var persisted = false; try { persisted = localStorage.getItem('rv_on') === '1'; } catch (e) {}
  var ON = host === 'localhost' || host === '127.0.0.1' || host === '' || FLAG || persisted;
  if (!ON) return;

  var LS = 'ms_review_v1';
  var pageId = decodeURIComponent((location.pathname.split('/').pop() || 'index.html')) || 'index.html';
  var active = false;

  function load() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } }
  function save(a) { localStorage.setItem(LS, JSON.stringify(a)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return (s || '').replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  /* ---------- стили ---------- */
  var css = ''
    + '.rv-hl{background:#B5F500;color:#17181c;border-radius:2px;cursor:pointer;padding:0 1px}'
    + '.rv-hl.rv-flash{outline:2px solid #0F2453;outline-offset:1px}'
    + '.rv-fab{position:fixed;right:18px;bottom:18px;z-index:2147483600;background:#0F2453;color:#fff;border:none;border-radius:999px;padding:12px 18px;font:600 14px/1 system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:8px;align-items:center}'
    + '.rv-fab.act{background:#B5F500;color:#0F2453}'
    + '.rv-fab .rv-dot{width:8px;height:8px;border-radius:50%;background:#B5F500}'
    + '.rv-fab.act .rv-dot{background:#0F2453}'
    + '.rv-pop{position:absolute;z-index:2147483601;background:#fff;border:1px solid #d8d8d0;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:10px;width:300px;font:14px system-ui,-apple-system,sans-serif}'
    + '.rv-pop .rv-q{font-size:12px;color:#5b616d;margin-bottom:6px;max-height:54px;overflow:auto;border-left:3px solid #B5F500;padding-left:8px}'
    + '.rv-pop textarea{width:100%;border:1px solid #d8d8d0;border-radius:8px;padding:8px;font:14px system-ui;resize:vertical;min-height:64px;box-sizing:border-box}'
    + '.rv-row{display:flex;gap:8px;margin-top:8px;justify-content:flex-end}'
    + '.rv-b{border:none;border-radius:8px;padding:8px 12px;font:600 13px system-ui;cursor:pointer}'
    + '.rv-b.p{background:#0F2453;color:#fff}.rv-b.g{background:#ececec;color:#333}'
    + '.rv-panel{position:fixed;right:18px;bottom:74px;z-index:2147483601;width:370px;max-width:calc(100vw - 36px);max-height:72vh;background:#fff;border:1px solid #d8d8d0;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;font:14px system-ui,-apple-system,sans-serif}'
    + '.rv-panel.open{display:flex}'
    + '.rv-panel h4{margin:0;padding:13px 16px;background:#0F2453;color:#fff;font:600 14px system-ui;display:flex;justify-content:space-between;align-items:center}'
    + '.rv-hint{padding:8px 14px;font-size:12px;color:#5b616d;background:#faf9f5;border-bottom:1px solid #eee}'
    + '.rv-list{overflow:auto;padding:4px 6px}'
    + '.rv-pg{font:600 11px system-ui;text-transform:uppercase;letter-spacing:.05em;color:#8a8f99;padding:10px 8px 4px}'
    + '.rv-item{border-bottom:1px solid #f0efe9;padding:9px 8px;cursor:pointer}'
    + '.rv-item:hover{background:#faf9f5}'
    + '.rv-item .q{color:#0F2453;font-weight:600;font-size:12.5px;line-height:1.35}'
    + '.rv-item .n{color:#333;font-size:13px;margin-top:4px;white-space:pre-wrap}'
    + '.rv-item .x{float:right;color:#c0504a;cursor:pointer;font-weight:700;padding:0 4px}'
    + '.rv-empty{padding:24px 16px;color:#999;text-align:center;font-size:13px}'
    + '.rv-foot{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px;border-top:1px solid #eee;background:#faf9f5}'
    + '.rv-foot .rv-b{width:100%}.rv-foot .wide{grid-column:1 / -1}'
    + '.rv-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:2147483602;background:#0F2453;color:#fff;padding:11px 18px;border-radius:10px;font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .2s}'
    + '.rv-toast.show{opacity:1}.rv-toast.err{background:#c0504a}';
  var styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);

  /* ---------- элементы ---------- */
  var fab = document.createElement('button');
  fab.className = 'rv-fab';
  fab.innerHTML = '<span class="rv-dot"></span><span class="rv-fab-t">Правки</span>';
  document.body.appendChild(fab);

  var panel = document.createElement('div');
  panel.className = 'rv-panel';
  panel.innerHTML = '<h4><span>Правки страницы</span><span class="rv-close" style="cursor:pointer">✕</span></h4>'
    + '<div class="rv-hint">Режим выкл. Нажмите кнопку справа внизу и выделяйте текст.</div>'
    + '<div class="rv-list"></div>'
    + '<div class="rv-foot">'
    + '<button class="rv-b p wide rv-send">💾 Сохранить для Claude</button>'
    + '<button class="rv-b g rv-dl">⬇ Скачать .md</button>'
    + '<button class="rv-b g rv-copy">📋 Копировать</button>'
    + '<button class="rv-b g wide rv-clear" style="color:#c0504a">🗑 Очистить всё</button>'
    + '</div>';
  document.body.appendChild(panel);

  var toast = document.createElement('div'); toast.className = 'rv-toast'; document.body.appendChild(toast);
  var pop = null;

  function showToast(msg, err) {
    toast.textContent = msg; toast.className = 'rv-toast show' + (err ? ' err' : '');
    setTimeout(function () { toast.className = 'rv-toast' + (err ? ' err' : ''); }, 2600);
  }

  /* ---------- режим вкл/выкл ---------- */
  function setActive(v) {
    active = v;
    fab.classList.toggle('act', v);
    fab.querySelector('.rv-fab-t').textContent = v ? 'Выделяйте текст' : 'Правки';
    panel.querySelector('.rv-hint').textContent = v
      ? 'Режим включён. Выделите текст — появится поле для комментария.'
      : 'Режим выкл. Нажмите кнопку справа внизу и выделяйте текст.';
    renderFabCount();
  }
  function renderFabCount() {
    var n = load().length;
    var base = active ? 'Выделяйте текст' : 'Правки';
    fab.querySelector('.rv-fab-t').textContent = base + (n ? ' (' + n + ')' : '');
  }

  fab.addEventListener('click', function (e) {
    // одиночный клик — тумблер режима; если панель закрыта и есть правки — откроем
    setActive(!active);
    if (active) panel.classList.add('open');
  });
  panel.querySelector('.rv-close').addEventListener('click', function () { panel.classList.remove('open'); });

  /* ---------- контекст (ближайший заголовок секции) ---------- */
  function nearestContext(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el) return '';
    var sec = el.closest('section,header,footer,.panel,.card') || el;
    var h = sec.querySelector('.eyebrow,h1,h2,h3');
    var tag = (el.tagName || '').toLowerCase();
    var label = h ? h.textContent.trim().slice(0, 42) : (sec.id || tag);
    return label;
  }

  /* ---------- поповер при выделении ---------- */
  document.addEventListener('mouseup', function (e) {
    if (!active) return;
    if (e.target.closest && e.target.closest('.rv-pop,.rv-panel,.rv-fab')) return;
    setTimeout(function () {
      var sel = window.getSelection();
      var text = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
      if (text.length < 3) return;
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      var ctx = nearestContext(sel.anchorNode);
      openPop(text, ctx, rect);
    }, 1);
  });

  function closePop() { if (pop) { pop.remove(); pop = null; } }

  function openPop(text, ctx, rect) {
    closePop();
    pop = document.createElement('div'); pop.className = 'rv-pop';
    pop.innerHTML = '<div class="rv-q">' + esc(text.slice(0, 220)) + (text.length > 220 ? '…' : '') + '</div>'
      + '<textarea placeholder="Ваш комментарий к этому тексту…"></textarea>'
      + '<div class="rv-row"><button class="rv-b g rv-cancel">Отмена</button><button class="rv-b p rv-add">Сохранить</button></div>';
    document.body.appendChild(pop);
    var top = rect.bottom + window.scrollY + 8;
    var left = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 312);
    pop.style.top = top + 'px'; pop.style.left = Math.max(8, left) + 'px';
    var ta = pop.querySelector('textarea'); ta.focus();
    pop.querySelector('.rv-cancel').addEventListener('click', closePop);
    pop.querySelector('.rv-add').addEventListener('click', function () {
      var note = ta.value.trim(); if (!note) { ta.focus(); return; }
      var arr = load();
      arr.push({ id: uid(), page: pageId, quote: text, note: note, context: ctx, ts: Date.now() });
      save(arr);
      closePop();
      window.getSelection().removeAllRanges();
      highlightAll(); renderPanel(); renderFabCount();
      showToast('Правка сохранена');
    });
    ta.addEventListener('keydown', function (ev) { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') pop.querySelector('.rv-add').click(); });
  }
  document.addEventListener('mousedown', function (e) {
    if (pop && !e.target.closest('.rv-pop')) closePop();
  });

  /* ---------- подсветка сохранённого (single text node) ---------- */
  function clearMarks() {
    [].slice.call(document.querySelectorAll('mark.rv-hl')).forEach(function (m) {
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
  }
  function wrapFirst(quote, id, note) {
    var q = (quote || '').trim();
    if (q.length < 3) return false;
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.indexOf(q) < 0) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (!p || (p.closest && p.closest('.rv-panel,.rv-pop,.rv-fab,.rv-toast,script,style,mark.rv-hl'))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node = tw.nextNode(); if (!node) return false;
    var idx = node.nodeValue.indexOf(q);
    try {
      var range = document.createRange();
      range.setStart(node, idx); range.setEnd(node, idx + q.length);
      var mark = document.createElement('mark');
      mark.className = 'rv-hl'; mark.setAttribute('data-id', id); mark.title = note || '';
      range.surroundContents(mark);
      mark.addEventListener('click', function () { panel.classList.add('open'); flash(id); });
      return true;
    } catch (e) { return false; }
  }
  function highlightAll() {
    clearMarks();
    load().filter(function (c) { return c.page === pageId; })
      .forEach(function (c) { c._found = wrapFirst(c.quote, c.id, c.note); });
  }
  function flash(id) {
    var m = document.querySelector('mark.rv-hl[data-id="' + id + '"]');
    if (m) { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); m.classList.add('rv-flash'); setTimeout(function () { m.classList.remove('rv-flash'); }, 1500); }
    var item = panel.querySelector('.rv-item[data-id="' + id + '"]');
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- панель ---------- */
  function renderPanel() {
    var list = panel.querySelector('.rv-list');
    var all = load();
    if (!all.length) { list.innerHTML = '<div class="rv-empty">Пока пусто. Включите режим и выделите текст, чтобы оставить правку.</div>'; return; }
    var cur = all.filter(function (c) { return c.page === pageId; });
    var other = all.filter(function (c) { return c.page !== pageId; });
    var html = '';
    function row(c) {
      return '<div class="rv-item" data-id="' + c.id + '">'
        + '<span class="x" data-del="' + c.id + '">✕</span>'
        + '<div class="q">«' + esc(c.quote.slice(0, 90)) + (c.quote.length > 90 ? '…' : '') + '»</div>'
        + '<div class="n">' + esc(c.note) + '</div>'
        + '</div>';
    }
    if (cur.length) { html += '<div class="rv-pg">Эта страница · ' + cur.length + '</div>' + cur.map(row).join(''); }
    if (other.length) {
      var byPage = {}; other.forEach(function (c) { (byPage[c.page] = byPage[c.page] || []).push(c); });
      Object.keys(byPage).forEach(function (p) { html += '<div class="rv-pg">' + esc(p) + ' · ' + byPage[p].length + '</div>' + byPage[p].map(row).join(''); });
    }
    list.innerHTML = html;
    [].slice.call(list.querySelectorAll('.rv-item')).forEach(function (it) {
      it.addEventListener('click', function (e) {
        if (e.target.hasAttribute('data-del')) return;
        flash(it.getAttribute('data-id'));
      });
    });
    [].slice.call(list.querySelectorAll('[data-del]')).forEach(function (x) {
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = x.getAttribute('data-del');
        save(load().filter(function (c) { return c.id !== id; }));
        highlightAll(); renderPanel(); renderFabCount();
      });
    });
  }

  /* ---------- экспорт ---------- */
  function exportMD() {
    var all = load();
    var d = new Date();
    var stamp = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    if (!all.length) return '# Правки сайта (' + stamp + ')\n\n_(пусто)_\n';
    var byPage = {}; all.forEach(function (c) { (byPage[c.page] = byPage[c.page] || []).push(c); });
    var out = '# Правки сайта (' + stamp + ')\n\nВсего правок: ' + all.length + '\n';
    Object.keys(byPage).forEach(function (p) {
      out += '\n## ' + p + ' (' + byPage[p].length + ')\n';
      byPage[p].forEach(function (c, i) {
        out += '\n### ' + (i + 1) + '. ' + (c.context ? '[' + c.context + ']' : '') + '\n';
        out += '> ' + c.quote.replace(/\n+/g, ' ') + '\n\n';
        out += '**Правка:** ' + c.note + '\n';
      });
    });
    return out;
  }

  panel.querySelector('.rv-send').addEventListener('click', function () {
    var body = JSON.stringify({ md: exportMD(), json: JSON.stringify(load(), null, 2) });
    fetch('/__review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { showToast('Сохранено: ' + (d.file || 'ok') + ' — скажите Claude'); })
      .catch(function () {
        // На проде (статика) сервера нет — копируем в буфер, чтобы прислать Claude
        var t = exportMD();
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(
          function () { showToast('Скопировано в буфер — пришлите Claude'); },
          function () { showToast('Нажмите «Скачать .md»', true); }
        );
        else showToast('Нажмите «Скачать .md»', true);
      });
  });
  panel.querySelector('.rv-dl').addEventListener('click', function () {
    var blob = new Blob([exportMD()], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'pravki.md'; document.body.appendChild(a); a.click(); a.remove();
  });
  panel.querySelector('.rv-copy').addEventListener('click', function () {
    var t = exportMD();
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { showToast('Скопировано'); }, function () { showToast('Не вышло — используйте Скачать', true); });
    else showToast('Буфер недоступен — используйте Скачать', true);
  });
  panel.querySelector('.rv-clear').addEventListener('click', function () {
    if (!load().length) return;
    if (confirm('Удалить ВСЕ правки на всех страницах?')) { save([]); highlightAll(); renderPanel(); renderFabCount(); }
  });

  /* ---------- старт ---------- */
  function start() { highlightAll(); renderPanel(); renderFabCount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
