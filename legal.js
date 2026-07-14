// Shared language handling for the legal pages (Privacy / Terms / Disclaimer).
// Reads the language chosen on the main site from localStorage (key "ta_lang"),
// so navigating from the homepage keeps the selected language. Each page supplies
// its own translated content via window.__PAGE.
(function () {
  var KEY = 'ta_lang';

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function fromUrl() { try { return new URLSearchParams(location.search).get('lang'); } catch (e) { return null; } }
  function norm(l) { return (l === 'ru' || l === 'ar') ? l : 'en'; }
  function pick() { return norm(fromUrl() || stored() || 'en'); }

  var COMMON = {
    en: { legal: 'Legal', back: '← Back to home', privacy: 'Privacy Policy', terms: 'Terms of Use', disclaimer: 'Disclaimer', company: 'Benchmark Technology Engineering L.L.C-FZ', copyright: '© 2026 Benchmark Technology Engineering L.L.C-FZ. All Rights Reserved.' },
    ru: { legal: 'Юридическое', back: '← На главную', privacy: 'Политика конфиденциальности', terms: 'Условия использования', disclaimer: 'Дисклеймер', company: 'Benchmark Technology Engineering L.L.C-FZ', copyright: '© 2026 Benchmark Technology Engineering L.L.C-FZ. Все права защищены.' },
    ar: { legal: 'قانوني', back: '→ العودة إلى الرئيسية', privacy: 'سياسة الخصوصية', terms: 'شروط الاستخدام', disclaimer: 'إخلاء المسؤولية', company: 'هندسة التكنولوجيا المعيارية ش.ذ.م.م-منطقة حرة', copyright: '© 2026 هندسة التكنولوجيا المعيارية ش.ذ.م.م-منطقة حرة. جميع الحقوق محفوظة.' }
  };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function txt(id, text) { var e = document.getElementById(id); if (e != null && text != null) e.textContent = text; }

  function render(lang) {
    lang = norm(lang);
    var c = COMMON[lang];
    var page = window.__PAGE || {};
    var d = (page.data && (page.data[lang] || page.data.en)) || {};

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem(KEY, lang); } catch (e) {}

    var segs = document.querySelectorAll('.langseg');
    for (var i = 0; i < segs.length; i++) segs[i].setAttribute('data-lang', lang);

    txt('l-brand', c.company); txt('l-back', c.back); txt('l-eyebrow', c.legal); txt('l-copy', c.copyright);
    txt('l-lp', c.privacy); txt('l-lt', c.terms); txt('l-ld', c.disclaimer);
    txt('l-title', d.title); txt('l-meta', d.meta);
    if (d.title) document.title = d.title + ' — ' + c.company;

    var body = document.getElementById('l-body');
    if (!body) return;
    body.innerHTML = '';
    if (page.type === 'disclaimer') {
      if (d.lead) body.appendChild(el('p', 'lead', '<strong>' + d.lead + '</strong>'));
      var ul = el('ul');
      (d.items || []).forEach(function (it) { ul.appendChild(el('li', null, it)); });
      body.appendChild(ul);
    } else {
      (d.sections || []).forEach(function (s) {
        body.appendChild(el('h2', null, '<span class="n">' + s.n + '</span>' + s.h));
        body.appendChild(el('p', null, s.p));
      });
    }
  }

  window.__setLang = function (l) { render(l); };
  if (document.readyState !== 'loading') render(pick());
  else document.addEventListener('DOMContentLoaded', function () { render(pick()); });
})();
