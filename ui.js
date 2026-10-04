// Custom selects that look like the rest of the sea. Each native <select data-fsel> stays in the page, hidden, as the
// source of truth: levels.js keeps filling it and listening for "change". This draws a button and a listbox on top
// (the APG "select-only combobox" pattern) and keeps the two in step.
(() => {
  let count = 0;

  function enhance(sel) {
    const id = `fsel${++count}`;
    const wrap = document.createElement('div');
    wrap.className = sel.dataset.fsel === 'action' ? 'fsel action' : 'fsel';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = `${id}-btn`;
    btn.className = 'btn fsel-btn';
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `${id}-list`);
    const value = document.createElement('span');
    value.className = 'fsel-value';
    value.id = `${id}-value`;
    const mark = document.createElement('span');
    mark.className = 'fsel-mark';
    mark.setAttribute('aria-hidden', 'true');
    btn.append(value, mark);
    const list = document.createElement('ul');
    list.className = 'fsel-list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.hidden = true;

    // Point the select's <label> (or its aria-label) at the new button.
    const label = sel.id && document.querySelector(`label[for="${sel.id}"]`);
    if (label) {
      label.id = label.id || `${id}-label`;
      label.htmlFor = btn.id;
      btn.setAttribute('aria-labelledby', label.id);
      list.setAttribute('aria-labelledby', label.id);
    } else if (sel.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
      list.setAttribute('aria-label', sel.getAttribute('aria-label'));
    }

    sel.classList.add('fsel-native');
    sel.tabIndex = -1;
    sel.after(wrap);
    wrap.append(btn, list);

    let items = [], active = -1, typed = '', typedAt = 0;
    const isOpen = () => !list.hidden;

    // Options with value "" are a placeholder: shown on the button, never listed.
    function sync() {
      const opts = [...sel.options];
      const placeholder = opts.find(o => o.value === '');
      items = opts.filter(o => o.value !== '');
      list.innerHTML = '';
      items.forEach((o, i) => {
        const li = document.createElement('li');
        li.id = `${id}-opt${i}`;
        li.setAttribute('role', 'option');
        li.dataset.value = o.value;
        li.textContent = o.textContent;
        li.setAttribute('aria-selected', String(o.value === sel.value));
        list.append(li);
      });
      const cur = items.find(o => o.value === sel.value);
      value.textContent = cur ? cur.textContent : placeholder ? placeholder.textContent : '';
      btn.disabled = !items.length;
      if (isOpen()) setActive(active);
    }
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true });
    sel.addEventListener('change', () => queueMicrotask(sync));
    sync();

    function setActive(i, scroll = true) {
      const lis = list.children;
      if (active > -1 && lis[active]) lis[active].classList.remove('active');
      active = Math.max(0, Math.min(items.length - 1, i));
      const li = lis[active];
      if (!li) return;
      li.classList.add('active');
      btn.setAttribute('aria-activedescendant', li.id);
      // Scroll only the list (never the page), and not for pointer hovers.
      if (scroll) {
        if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop - 6;
        else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight + 6;
      }
    }
    function open(at) {
      if (!items.length) return;
      list.hidden = false;
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      // Open upward when there isn't room below.
      wrap.classList.remove('up');
      const r = btn.getBoundingClientRect(), h = list.offsetHeight;
      if (r.bottom + h + 12 > innerHeight && r.top > h + 12) wrap.classList.add('up');
      const sel_i = items.findIndex(o => o.value === sel.value);
      setActive(at != null ? at : sel_i > -1 ? sel_i : 0);
    }
    function close(focus) {
      typed = '';
      if (!isOpen()) return;
      list.hidden = true;
      wrap.classList.remove('open', 'up');
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-activedescendant');
      if (focus) btn.focus();
    }
    function choose(i) {
      const o = items[i];
      close(true);
      if (!o) return;
      if (o.value !== sel.value) {
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (sel.value === '') sync();
    }

    btn.addEventListener('click', () => (isOpen() ? close(false) : open()));
    list.addEventListener('pointermove', e => {
      const li = e.target.closest('li'); if (li) setActive([...list.children].indexOf(li), false);
    });
    // pointerdown keeps focus on the button, so the list doesn't close on blur before the click lands.
    list.addEventListener('pointerdown', e => e.preventDefault());
    list.addEventListener('click', e => {
      const li = e.target.closest('li'); if (li) choose([...list.children].indexOf(li));
    });
    wrap.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget)) close(false); });
    document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) close(false); });

    btn.addEventListener('keydown', e => {
      const k = e.key;
      if (!isOpen()) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) { e.preventDefault(); open(); }
        else if (k === 'Home') { e.preventDefault(); open(0); }
        else if (k === 'End') { e.preventDefault(); open(items.length - 1); }
        else if (k.length === 1 && /\S/.test(k)) { open(); typeahead(k); }
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); e.altKey ? choose(active) : setActive(active - 1); }
      else if (k === 'Home') { e.preventDefault(); setActive(0); }
      else if (k === 'End') { e.preventDefault(); setActive(items.length - 1); }
      else if (k === 'PageDown') { e.preventDefault(); setActive(active + 6); }
      else if (k === 'PageUp') { e.preventDefault(); setActive(active - 6); }
      else if (k === ' ' && typed && Date.now() - typedAt < 700) { e.preventDefault(); typeahead(k); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
      else if (k === 'Escape') { e.preventDefault(); close(true); }
      else if (k === 'Tab') close(false);
      else if (k.length === 1 && /\S/.test(k)) typeahead(k);
    });
    // Some engines fire the button's click on Space keyup even after keydown was handled.
    btn.addEventListener('keyup', e => { if (e.key === ' ') e.preventDefault(); });
    // Typing jumps to the next option starting with what was typed.
    function typeahead(ch) {
      const now = Date.now();
      typed = now - typedAt > 700 ? ch.toLowerCase() : typed + ch.toLowerCase();
      typedAt = now;
      const start = typed.length === 1 ? active + 1 : active;
      for (let n = 0; n < items.length; n++) {
        const i = (start + n) % items.length;
        if (items[i].textContent.toLowerCase().startsWith(typed)) { setActive(i); return; }
      }
    }
  }

  document.querySelectorAll('select[data-fsel]').forEach(enhance);
})();
