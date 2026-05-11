(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Unit names: letters, digits, dot, dash, underscore, @, : (for slices),
  // and \x escapes that systemd may use. Anything else is rejected up-front
  // so we never paste user-controlled tokens into a shell command.
  const VALID_UNIT = /^[A-Za-z0-9@:_.\\\-]+$/;
  const SEP = '<<<__AX_SEP__>>>';

  const TYPE_OPTIONS = [
    { value: 'all',       label: 'All types' },
    { value: 'service',   label: 'Service' },
    { value: 'socket',    label: 'Socket' },
    { value: 'timer',     label: 'Timer' },
    { value: 'target',    label: 'Target' },
    { value: 'mount',     label: 'Mount' },
    { value: 'automount', label: 'Automount' },
    { value: 'path',      label: 'Path' },
    { value: 'slice',     label: 'Slice' },
    { value: 'scope',     label: 'Scope' },
    { value: 'swap',      label: 'Swap' },
    { value: 'device',    label: 'Device' },
  ];
  const STATE_OPTIONS = [
    { value: 'all',          label: 'Any state' },
    { value: 'active',       label: 'Active' },
    { value: 'inactive',     label: 'Inactive' },
    { value: 'failed',       label: 'Failed' },
    { value: 'activating',   label: 'Activating' },
    { value: 'deactivating', label: 'Deactivating' },
  ];
  const SCOPE_OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'user',   label: 'User' },
  ];

  let typeSelect, stateSelect, scopeSelect;

  // ---------- custom themed select ----------

  function createSelect(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'ax-csel';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ax-csel-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (opts.ariaLabel) trigger.setAttribute('aria-label', opts.ariaLabel);

    const label = document.createElement('span');
    label.className = 'ax-csel-label';
    const caret = document.createElement('span');
    caret.className = 'ax-csel-caret';
    trigger.appendChild(label);
    trigger.appendChild(caret);

    const popup = document.createElement('div');
    popup.className = 'ax-csel-popup';
    popup.setAttribute('role', 'listbox');
    popup.hidden = true;

    let options = opts.options.slice();
    let value = opts.value;
    let focusedIndex = -1;
    let typeBuffer = '';
    let typeTimer = null;
    let isOpen = false;

    function renderOptions() {
      popup.innerHTML = '';
      for (const o of options) {
        const item = document.createElement('div');
        item.className = 'ax-csel-option';
        item.setAttribute('role', 'option');
        item.dataset.value = o.value;
        item.textContent = o.label;
        if (o.value === value) item.classList.add('selected');
        item.addEventListener('mouseenter', () => {
          const items = Array.from(popup.children);
          focusedIndex = items.indexOf(item);
          items.forEach((el, i) => el.classList.toggle('focused', i === focusedIndex));
        });
        item.addEventListener('click', () => {
          setValue(o.value);
          close();
          trigger.focus();
        });
        popup.appendChild(item);
      }
    }

    function renderLabel() {
      const found = options.find((o) => o.value === value);
      label.textContent = found ? found.label : (opts.placeholder || '');
    }

    function setValue(v, silent) {
      const old = value;
      value = v;
      renderLabel();
      Array.from(popup.children).forEach((el) => {
        el.classList.toggle('selected', el.dataset.value === v);
      });
      if (!silent && old !== v && typeof opts.onChange === 'function') {
        opts.onChange(v);
      }
    }

    function focusItem(i) {
      const items = Array.from(popup.children);
      if (!items.length) return;
      focusedIndex = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((el, idx) => el.classList.toggle('focused', idx === focusedIndex));
      items[focusedIndex].scrollIntoView({ block: 'nearest' });
    }

    function moveFocus(dir) {
      const items = Array.from(popup.children);
      if (!items.length) return;
      if (focusedIndex < 0) focusedIndex = items.findIndex((el) => el.dataset.value === value);
      if (focusedIndex < 0) focusedIndex = dir > 0 ? 0 : items.length - 1;
      else focusedIndex = Math.max(0, Math.min(items.length - 1, focusedIndex + dir));
      items.forEach((el, i) => el.classList.toggle('focused', i === focusedIndex));
      items[focusedIndex].scrollIntoView({ block: 'nearest' });
    }

    function commitFocus() {
      const items = Array.from(popup.children);
      if (focusedIndex >= 0 && items[focusedIndex]) {
        setValue(items[focusedIndex].dataset.value);
      }
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      popup.hidden = false;
      wrap.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');

      // initial focus highlight on the selected item
      focusedIndex = options.findIndex((o) => o.value === value);
      const items = Array.from(popup.children);
      items.forEach((el, i) => el.classList.toggle('focused', i === focusedIndex));
      if (focusedIndex >= 0 && items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: 'nearest' });
      }

      // flip up if not enough room below
      popup.classList.remove('ax-csel-popup-up');
      const tRect = trigger.getBoundingClientRect();
      const pRect = popup.getBoundingClientRect();
      const spaceBelow = window.innerHeight - tRect.bottom;
      if (spaceBelow < pRect.height + 12 && tRect.top > pRect.height + 12) {
        popup.classList.add('ax-csel-popup-up');
      }

      document.addEventListener('mousedown', onDocMouseDown, true);
      window.addEventListener('resize', close);
      window.addEventListener('blur', close);
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      popup.hidden = true;
      wrap.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      focusedIndex = -1;
      Array.from(popup.children).forEach((el) => el.classList.remove('focused'));
      document.removeEventListener('mousedown', onDocMouseDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    }

    function toggle() { isOpen ? close() : open(); }

    function onDocMouseDown(e) {
      if (!wrap.contains(e.target)) close();
    }

    function onTypeahead(ch) {
      typeBuffer += ch.toLowerCase();
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => { typeBuffer = ''; }, 600);
      const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(typeBuffer));
      if (idx >= 0) focusItem(idx);
    }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) { commitFocus(); close(); }
        else open();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) open();
        else moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) open();
        else moveFocus(-1);
      } else if (e.key === 'Home') {
        if (isOpen) { e.preventDefault(); focusItem(0); }
      } else if (e.key === 'End') {
        if (isOpen) { e.preventDefault(); focusItem(options.length - 1); }
      } else if (e.key === 'Escape') {
        if (isOpen) { e.preventDefault(); close(); }
      } else if (e.key === 'Tab') {
        close();
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        if (!isOpen) open();
        onTypeahead(e.key);
      }
    });

    renderOptions();
    renderLabel();
    wrap.appendChild(trigger);
    wrap.appendChild(popup);

    return {
      el: wrap,
      get value() { return value; },
      set value(v) { setValue(v); },
      setSilent(v) { setValue(v, true); },
      setOptions(next) { options = next.slice(); renderOptions(); renderLabel(); },
      close,
    };
  }

  const state = {
    scope: 'system',
    type: 'service',
    stateFilter: 'all',
    search: '',
    units: [],
    filtered: [],
    selected: null,        // unit name
    detail: null,          // { name, props, status, cat, logs }
    activeTab: 'status',
    busy: false,
    pollTimer: null,
    journalLines: 200,
    autoRefresh: 0,
    useSudo: true,
  };

  // ---------- safety helpers ----------

  function safeUnit(name) {
    if (typeof name !== 'string' || !VALID_UNIT.test(name)) {
      throw new Error('Refusing unsafe unit name: ' + JSON.stringify(name));
    }
    return name;
  }
  const scopeArg = () => (state.scope === 'user' ? '--user' : '--system');

  // System-scope mutating actions go through axion.sudo. User-scope actions
  // run as the logged-in user so plain exec is enough. The user can override
  // this for hosts where the SSH login is already root via the setting.
  function needsSudoForAction() {
    return state.scope === 'system' && state.useSudo;
  }

  async function runReadCmd(cmd) {
    return await window.axion.exec(cmd);
  }
  async function runMutation(cmd) {
    if (needsSudoForAction()) return await window.axion.sudo(cmd);
    return await window.axion.exec(cmd);
  }

  // ---------- DOM bootstrap ----------

  function buildToolbarSelects() {
    typeSelect = createSelect({
      options: TYPE_OPTIONS,
      value: state.type,
      ariaLabel: 'Unit type',
      onChange: (v) => { state.type = v; loadUnits(); },
    });
    $('#type-select-mount').appendChild(typeSelect.el);

    stateSelect = createSelect({
      options: STATE_OPTIONS,
      value: state.stateFilter,
      ariaLabel: 'Active state filter',
      onChange: (v) => { state.stateFilter = v; renderList(); },
    });
    $('#state-select-mount').appendChild(stateSelect.el);

    scopeSelect = createSelect({
      options: SCOPE_OPTIONS,
      value: state.scope,
      ariaLabel: 'systemd scope',
      onChange: (v) => {
        state.scope = v;
        $('#scope-pill').textContent = v;
        state.selected = null;
        state.detail = null;
        renderDetail();
        loadUnits();
      },
    });
    $('#scope-select-mount').appendChild(scopeSelect.el);
  }

  function wireToolbar() {
    $('#search').addEventListener('input', (e) => {
      state.search = e.target.value.trim().toLowerCase();
      renderList();
    });
    $('#refresh-btn').addEventListener('click', () => loadUnits());
    $('#failed-btn').addEventListener('click', () => {
      stateSelect.value = 'failed';
    });
    $('#daemon-reload-btn').addEventListener('click', daemonReload);
  }

  function wireDetail() {
    $$('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => runUnitAction(btn.dataset.action));
    });
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    $('#logs-refresh').addEventListener('click', () => loadLogs(true));
  }

  // ---------- loading: list-units + list-unit-files ----------

  async function loadUnits() {
    setBusy(true, 'Listing units…');
    try {
      const typeArg = state.type === 'all' ? '' : '--type=' + state.type;
      const cmd =
        'systemctl ' + scopeArg() + ' --no-pager --no-legend --plain --all ' + typeArg + ' list-units' +
        ' ; echo "' + SEP + '"' +
        ' ; systemctl ' + scopeArg() + ' --no-pager --no-legend ' + typeArg + ' list-unit-files';
      const r = await runReadCmd(cmd);
      const [unitsRaw = '', filesRaw = ''] = (r.stdout || '').split(SEP);
      state.units = mergeUnits(unitsRaw, filesRaw);
      setStatus('Loaded ' + state.units.length + ' units.');
    } catch (e) {
      handleError(e, 'Failed to load units');
    } finally {
      setBusy(false);
      renderList();
      renderSummary();
      schedulePoll();
    }
  }

  function mergeUnits(unitsRaw, filesRaw) {
    const map = new Map();
    for (const rawLine of unitsRaw.split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*[●*]\s*/, '').trim();
      if (!line) continue;
      // UNIT LOAD ACTIVE SUB DESCRIPTION
      const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
      if (!m) continue;
      const [, name, load, active, sub, description] = m;
      map.set(name, {
        name,
        load,
        active,
        sub,
        description: (description || '').trim(),
        fileState: '',
      });
    }
    for (const rawLine of filesRaw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(/^(\S+)\s+(\S+)(?:\s+(\S+))?\s*$/);
      if (!m) continue;
      const [, name, fileState] = m;
      // Skip template names ending with @ that have no instance (still useful, keep)
      if (map.has(name)) {
        map.get(name).fileState = fileState;
      } else {
        map.set(name, {
          name,
          load: 'loaded',
          active: '-',
          sub: '-',
          description: '',
          fileState,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- filtering / list rendering ----------

  function applyFilter() {
    const q = state.search;
    const sf = state.stateFilter;
    state.filtered = state.units.filter((u) => {
      if (sf !== 'all' && u.active !== sf) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || (u.description || '').toLowerCase().includes(q);
    });
  }

  function renderList() {
    applyFilter();
    const list = $('#unit-list');
    const empty = $('#list-empty');
    list.innerHTML = '';
    if (state.filtered.length === 0) {
      list.hidden = true;
      empty.hidden = false;
      renderSummary();
      return;
    }
    list.hidden = false;
    empty.hidden = true;

    const frag = document.createDocumentFragment();
    for (const u of state.filtered) {
      const li = document.createElement('li');
      li.className = 'unit-row';
      if (u.name === state.selected) li.classList.add('active');
      li.innerHTML =
        '<div class="unit-row-main">' +
          '<span class="unit-row-name"></span>' +
          '<span class="unit-row-desc"></span>' +
        '</div>' +
        '<span class="unit-dot s-' + cssState(u.active) + '" title="' + escapeAttr(u.active + ' / ' + u.sub) + '"></span>';
      li.querySelector('.unit-row-name').textContent = u.name;
      li.querySelector('.unit-row-desc').textContent = u.description || (u.fileState ? '(unit-file: ' + u.fileState + ')' : '');
      li.addEventListener('click', () => selectUnit(u.name));
      frag.appendChild(li);
    }
    list.appendChild(frag);
    renderSummary();
  }

  function renderSummary() {
    const total = state.units.length;
    const active = state.units.filter((u) => u.active === 'active').length;
    const failed = state.units.filter((u) => u.active === 'failed').length;
    const showing = state.filtered.length;
    $('#summary').innerHTML =
      'Showing ' + showing + ' / ' + total + ' · ' +
      '<span class="ax-text-success">' + active + ' active</span> · ' +
      '<span class="ax-text-error">' + failed + ' failed</span>';
  }

  function cssState(s) {
    if (!s) return 'inactive';
    if (['active', 'failed', 'inactive', 'activating', 'deactivating'].includes(s)) return s;
    return 'inactive';
  }

  // ---------- selection / detail load ----------

  async function selectUnit(name) {
    state.selected = name;
    state.detail = null;
    state.activeTab = 'status';
    renderList();
    showDetailShell(name);
    await loadDetail(name);
  }

  function showDetailShell(name) {
    $('#detail-empty').hidden = true;
    $('#detail').hidden = false;
    $('#d-name').textContent = name;
    $('#d-desc').textContent = '';
    setPill('#d-active', '—');
    setPill('#d-sub', '—');
    setPill('#d-file-state', '—');
    setPill('#d-load', '—');
    $('#tab-status').textContent = 'Loading…';
    $('#tab-definition').textContent = '';
    $('#tab-logs-pre').textContent = '';
    $('#tab-properties').textContent = '';
    switchTab('status');
    updateActionAvailability(null);
  }

  async function loadDetail(name) {
    let unit;
    try { unit = safeUnit(name); } catch (e) { handleError(e, 'Cannot inspect unit'); return; }

    setBusy(true, 'Loading ' + unit + '…');
    const cmd =
      'systemctl ' + scopeArg() + ' --no-pager status ' + unit + ' || true' +
      ' ; echo "' + SEP + '"' +
      ' ; systemctl ' + scopeArg() + ' --no-pager cat ' + unit + ' 2>&1 || true' +
      ' ; echo "' + SEP + '"' +
      ' ; systemctl ' + scopeArg() + ' --no-pager show ' + unit + ' || true';
    try {
      const r = await runReadCmd(cmd);
      const parts = (r.stdout || '').split(SEP);
      const status = (parts[0] || '').replace(/^\n+/, '');
      const cat    = (parts[1] || '').replace(/^\n+/, '');
      const showRaw = (parts[2] || '');
      const props = parseShow(showRaw);

      // ensure this is still the active selection
      if (state.selected !== unit) return;

      state.detail = { name: unit, status, cat, props, logs: null };

      $('#d-desc').textContent = props.Description || '';
      setPill('#d-active', props.ActiveState || '—', pillToneForActive(props.ActiveState));
      setPill('#d-sub', props.SubState || '—');
      setPill('#d-file-state', props.UnitFileState || (props.LoadState === 'masked' ? 'masked' : '—'),
              pillToneForFileState(props.UnitFileState));
      setPill('#d-load', props.LoadState || '—', props.LoadState === 'not-found' ? 'error' : '');

      $('#tab-status').textContent = status.trim() || '(no status output)';
      $('#tab-definition').textContent = cat.trim() || '(no unit file output)';
      $('#tab-properties').textContent = formatProps(props);
      updateActionAvailability(props);
      setStatus('Loaded ' + unit + '.');
    } catch (e) {
      handleError(e, 'Failed to load unit detail');
    } finally {
      setBusy(false);
    }
  }

  function parseShow(text) {
    const props = {};
    for (const line of (text || '').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i <= 0) continue;
      const k = line.slice(0, i);
      const v = line.slice(i + 1);
      props[k] = v;
    }
    return props;
  }

  function formatProps(props) {
    const keys = Object.keys(props).sort();
    return keys.map((k) => k + '=' + props[k]).join('\n');
  }

  function pillToneForActive(active) {
    if (active === 'active') return 'success';
    if (active === 'failed') return 'error';
    if (active === 'activating' || active === 'deactivating') return 'warn';
    return '';
  }
  function pillToneForFileState(fs) {
    if (!fs) return '';
    if (fs === 'enabled' || fs === 'enabled-runtime') return 'success';
    if (fs === 'disabled') return 'warn';
    if (fs === 'masked') return 'error';
    return '';
  }

  function updateActionAvailability(props) {
    const buttons = $$('button[data-action]');
    if (!props) {
      buttons.forEach((b) => b.disabled = true);
      return;
    }
    const active = props.ActiveState;
    const fs = props.UnitFileState;
    const load = props.LoadState;
    const canReload = props.CanReload === 'yes';
    const masked = load === 'masked' || fs === 'masked';

    const map = {
      start:   masked || active === 'active' || active === 'activating',
      stop:    masked || active === 'inactive' || active === 'failed',
      restart: masked,
      reload:  masked || !canReload,
      enable:  masked || fs === 'enabled' || fs === 'static' || fs === 'alias',
      disable: masked || fs === 'disabled' || fs === 'static',
      mask:    masked,
      unmask:  !masked,
    };
    buttons.forEach((b) => {
      b.disabled = !!map[b.dataset.action];
    });
  }

  // ---------- actions ----------

  async function runUnitAction(action) {
    if (!state.selected) return;
    let unit;
    try { unit = safeUnit(state.selected); } catch (e) { handleError(e, 'Cannot run action'); return; }
    const valid = ['start','stop','restart','reload','enable','disable','mask','unmask'];
    if (!valid.includes(action)) return;

    const cmd = 'systemctl ' + scopeArg() + ' ' + action + ' ' + unit;
    setBusy(true, action + ' ' + unit + '…');
    try {
      const r = await runMutation(cmd);
      if (r.exitCode === 0) {
        window.axion.ui.notify(unit + ': ' + action + ' OK', { tone: 'success' });
        setStatus(action + ' ' + unit + ' completed.');
      } else {
        window.axion.ui.notify(unit + ': ' + action + ' failed', { tone: 'error' });
        setStatus('Exit ' + r.exitCode + ': ' + ((r.stderr || r.stdout || '').trim().split('\n').pop() || ''));
      }
      // Reload detail + list to reflect new state.
      await loadDetail(unit);
      await loadUnits();
    } catch (e) {
      if (e && e.code === 'E_SUDO_CANCELLED') {
        setStatus(action + ' cancelled.');
        return;
      }
      handleError(e, action + ' failed');
    } finally {
      setBusy(false);
    }
  }

  async function daemonReload() {
    const cmd = 'systemctl ' + scopeArg() + ' daemon-reload';
    setBusy(true, 'daemon-reload…');
    try {
      const r = await runMutation(cmd);
      if (r.exitCode === 0) {
        window.axion.ui.notify('daemon-reload OK', { tone: 'success' });
        setStatus('daemon-reload completed.');
      } else {
        window.axion.ui.notify('daemon-reload failed', { tone: 'error' });
        setStatus((r.stderr || r.stdout || '').trim());
      }
      await loadUnits();
      if (state.selected) await loadDetail(state.selected);
    } catch (e) {
      if (e && e.code === 'E_SUDO_CANCELLED') { setStatus('daemon-reload cancelled.'); return; }
      handleError(e, 'daemon-reload failed');
    } finally {
      setBusy(false);
    }
  }

  // ---------- tabs ----------

  function switchTab(name) {
    state.activeTab = name;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $('#tab-status').hidden = name !== 'status';
    $('#tab-definition').hidden = name !== 'definition';
    $('#tab-logs').hidden = name !== 'logs';
    $('#tab-properties').hidden = name !== 'properties';
    if (name === 'logs' && state.selected) loadLogs(false);
  }

  async function loadLogs(force) {
    if (!state.selected) return;
    if (state.detail && state.detail.logs != null && !force) {
      $('#tab-logs-pre').textContent = state.detail.logs || '(no journal output)';
      return;
    }
    let unit;
    try { unit = safeUnit(state.selected); } catch (e) { handleError(e, 'Cannot fetch logs'); return; }

    $('#tab-logs-pre').textContent = 'Loading…';
    $('#logs-meta').textContent = '';
    const n = Math.max(50, Math.min(5000, parseInt(state.journalLines, 10) || 200));
    const scope = state.scope === 'user' ? '--user' : '';
    const cmd = 'journalctl ' + scope + ' --no-pager -n ' + n + ' -u ' + unit + ' 2>&1 || true';
    try {
      const r = await runReadCmd(cmd);
      const text = (r.stdout || '').trim();
      if (state.selected !== unit) return;
      if (state.detail) state.detail.logs = text;
      $('#tab-logs-pre').textContent = text || '(no journal output)';
      $('#logs-meta').textContent = 'Last ' + n + ' lines for ' + unit;
    } catch (e) {
      handleError(e, 'Failed to load logs');
      $('#tab-logs-pre').textContent = 'Error: ' + (e.message || String(e));
    }
  }

  // ---------- polling ----------

  function schedulePoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    const sec = parseInt(state.autoRefresh, 10);
    if (!sec || sec < 1) return;
    state.pollTimer = setInterval(() => {
      if (state.busy) return;
      loadUnits();
      if (state.selected) loadDetail(state.selected);
    }, sec * 1000);
  }

  // ---------- ui helpers ----------

  function setBusy(b, msg) {
    state.busy = !!b;
    const m = $('#status-msg');
    if (b) {
      m.innerHTML = '<span class="spinner"></span>' + (msg || 'Working…');
    } else if (msg) {
      m.textContent = msg;
    }
  }
  function setStatus(msg) { $('#status-msg').textContent = msg || ''; }

  function setPill(sel, text, tone) {
    const el = $(sel);
    el.textContent = text;
    el.classList.remove('ax-pill-accent','ax-pill-success','ax-pill-warn','ax-pill-error');
    if (tone === 'success') el.classList.add('ax-pill-success');
    else if (tone === 'warn') el.classList.add('ax-pill-warn');
    else if (tone === 'error') el.classList.add('ax-pill-error');
    else if (tone === 'accent') el.classList.add('ax-pill-accent');
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function handleError(e, prefix) {
    const msg = (e && (e.message || e.code)) || String(e);
    window.axion.ui.notify((prefix || 'Error') + ': ' + msg, { tone: 'error' });
    setStatus((prefix || 'Error') + ': ' + msg);
    // eslint-disable-next-line no-console
    console.error(e);
  }

  function renderDetail() {
    if (!state.selected) {
      $('#detail-empty').hidden = false;
      $('#detail').hidden = true;
    }
  }

  // ---------- bootstrap ----------

  function readSettings(info) {
    const s = (info && info.settings) || window.axion.settings || {};
    state.scope = (s.defaultScope === 'user' ? 'user' : 'system');
    state.type  = s.defaultType || 'service';
    state.journalLines = s.journalLines || 200;
    state.autoRefresh = s.autoRefresh || 0;
    state.useSudo = s.useSudo !== false;
  }

  function applySettingsToUI() {
    if (scopeSelect) scopeSelect.setSilent(state.scope);
    if (typeSelect)  typeSelect.setSilent(state.type);
    if (stateSelect) stateSelect.setSilent(state.stateFilter);
    $('#scope-pill').textContent = state.scope;
  }

  function applySession(info) {
    const s = (info && info.session) || window.axion.session;
    if (s && s.host) {
      $('#session-info').textContent = (s.user ? s.user + '@' : '') + s.host;
    } else {
      $('#session-info').textContent = 'no session';
    }
  }

  function init() {
    buildToolbarSelects();
    wireToolbar();
    wireDetail();

    window.axion.on('ready', (info) => {
      readSettings(info);
      applySettingsToUI();
      applySession(info);
      window.axion.window && window.axion.window.setTitle('systemctl-manager');
      if ((info && info.session) || window.axion.session) {
        loadUnits();
      } else {
        setStatus('Not connected. Open an SSH session to load units.');
      }
    });

    window.axion.on('session-change', (info) => {
      applySession(info);
      loadUnits();
    });
  }

  init();
})();
