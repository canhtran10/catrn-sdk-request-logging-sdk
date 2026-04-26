/**
 * @param requiresLogin - When true, client uses sessionStorage + POST /api/login
 * @returns HTML shell using Pico.css (CDN): filters, timeline, detail + blob fetch via SAS
 */
export function activityLogsHtmlPage(requiresLogin: boolean): string {
  const flag = JSON.stringify(requiresLogin);
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" class="rl-activity">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Request activity logs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" crossorigin="anonymous" />
  <style>
    /* Font ~5% smaller; form controls ~35% tighter (Pico spacing scale × 0.65) */
    html.rl-activity {
      font-size: 95%;
      --pico-font-size: 100%;
    }
    .rl-main {
      --pico-spacing: 0.65rem;
      --pico-form-element-spacing-vertical: 0.4875rem;
      --pico-form-element-spacing-horizontal: 0.65rem;
      --pico-typography-spacing-vertical: 0.65rem;
      --pico-block-spacing-vertical: 0.65rem;
      --pico-block-spacing-horizontal: 0.65rem;
      --pico-grid-column-gap: 0.65rem;
      --pico-grid-row-gap: 0.65rem;
      --pico-nav-element-spacing-vertical: 0.65rem;
      --pico-nav-element-spacing-horizontal: 0.325rem;
      --pico-nav-link-spacing-vertical: 0.325rem;
      --pico-nav-link-spacing-horizontal: 0.325rem;
      --pico-border-radius: 0.1625rem;
    }
    .hidden { display: none !important; }
    .rl-main { max-width: 1400px; margin-inline: auto; }
    .rl-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: var(--pico-spacing);
      align-items: start;
    }
    @media (max-width: 991px) {
      .rl-grid { grid-template-columns: 1fr; }
    }
    .tl-flow {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 0.23rem;
      min-height: 3.25rem;
      padding: var(--pico-spacing);
      border: var(--pico-border-width) solid var(--pico-border-color);
      border-radius: var(--pico-border-radius);
      background: var(--pico-card-background-color);
    }
    .tl-arrow {
      align-self: center;
      color: var(--pico-muted-color);
      font-weight: 700;
      user-select: none;
      padding: 0 0.15rem;
    }
    .tl-node {
      text-align: left;
      max-width: 9rem;
      white-space: normal;
      padding: 0.25rem 0.35rem;
      font-size: 0.95em;
    }
    .tl-time { font-size: 0.7rem; opacity: 0.85; }
    .tl-url { font-size: 0.76rem; margin-top: 0.15rem; word-break: break-word; }
    .blob-pre {
      font-size: 0.76rem;
      max-height: 14rem;
      overflow: auto;
      margin-bottom: 0;
    }
    #loginErr { color: var(--pico-color-red-500, #c62828); min-height: 1.25rem; }
    .rl-login-wrap { max-width: 28rem; margin-inline: auto; }
  </style>
</head>
<body>
  <main class="container rl-main">
    <div id="loginPanel" class="hidden">
      <article class="rl-login-wrap">
        <header>
          <h1>Activity logs</h1>
          <p><small>Session is kept only for this tab.</small></p>
        </header>
        <form id="loginForm">
          <label for="rlUser">Username <input id="rlUser" type="text" name="username" autocomplete="username" required /></label>
          <label for="rlPass">Password <input id="rlPass" type="password" name="password" autocomplete="current-password" required /></label>
          <p id="loginErr" aria-live="polite"></p>
          <button type="submit" id="rlLogin">Sign in</button>
        </form>
      </article>
    </div>

    <div id="appPanel" class="hidden">
      <hgroup>
        <h1>Request activity logs</h1>
        <p><small>Project scope · blobs via short-lived SAS from server, read in browser.</small></p>
      </hgroup>
      <p><button type="button" id="rlLogout" class="secondary outline hidden">Sign out</button></p>

      <article>
        <header><strong>Filters</strong> <small>(time window ≤ 15 days)</small></header>
        <fieldset class="grid">
          <label for="fUser">user_id <input id="fUser" type="search" placeholder="exact match" autocomplete="off" /></label>
          <label for="fCustomer">customer_id <input id="fCustomer" type="search" placeholder="exact match" autocomplete="off" /></label>
          <label for="fFrom">From <input id="fFrom" type="datetime-local" /></label>
          <label for="fTo">To <input id="fTo" type="datetime-local" /></label>
          <label for="fMethod">method
            <select id="fMethod">
              <option value="">(any)</option>
              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option>
              <option>DELETE</option><option>HEAD</option><option>OPTIONS</option>
            </select>
          </label>
          <label for="fStatus">status <input id="fStatus" type="number" placeholder="e.g. 200" min="0" max="599" /></label>
          <label for="fSort">order
            <select id="fSort">
              <option value="desc">newest first</option>
              <option value="asc">oldest first (timeline)</option>
            </select>
          </label>
        </fieldset>
        <footer>
          <button type="button" id="fApply">Apply filters</button>
        </footer>
      </article>

      <div class="rl-grid">
        <article>
          <header><strong>Timeline</strong></header>
          <nav>
            <ul style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; list-style:none; padding:0; margin:0 0 0.75rem 0;">
              <li><button type="button" id="prev" class="secondary">Previous</button></li>
              <li><span id="meta" class="secondary"></span></li>
              <li><button type="button" id="next" class="secondary">Next</button></li>
            </ul>
          </nav>
          <div id="timeline" class="tl-flow" role="list" aria-label="Request timeline"></div>
        </article>

        <article>
          <header><strong>Detail</strong></header>
          <p id="detailEmpty" class="secondary">Select a step on the timeline.</p>
          <div id="detailBody" class="hidden">
            <h4>Row</h4>
            <pre id="detailMeta" class="blob-pre" style="max-height:9rem">—</pre>
            <h4>Request body (blob)</h4>
            <pre id="detailReq" class="blob-pre">—</pre>
            <h4>Response body (blob)</h4>
            <pre id="detailRes" class="blob-pre">—</pre>
          </div>
        </article>
      </div>
    </div>
  </main>
  <script>
(function () {
  var STORAGE = 'request_logging_ui_session';
  var requiresLogin = ${flag};
  var page = 1;
  var pageSize = 50;
  var selectedId = null;
  var rowsCache = [];

  function mountBaseHref() {
    var p = window.location.pathname || '/';
    if (p !== '/' && p.slice(-1) !== '/') { p = p + '/'; }
    return window.location.origin + p;
  }
  var mountRoot = mountBaseHref();
  function apiHref(relPath) { return new URL(relPath, mountRoot).href; }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').split('<').join('&lt;').replace(/"/g, '&quot;');
  }
  function authHeaders() {
    var t = sessionStorage.getItem(STORAGE);
    if (!t) return {};
    return { 'Authorization': 'Bearer ' + t };
  }
  function showLogin() {
    document.getElementById('loginPanel').classList.remove('hidden');
    document.getElementById('appPanel').classList.add('hidden');
    document.getElementById('rlLogout').classList.add('hidden');
  }
  function showApp() {
    document.getElementById('loginPanel').classList.add('hidden');
    document.getElementById('appPanel').classList.remove('hidden');
    if (requiresLogin) document.getElementById('rlLogout').classList.remove('hidden');
  }

  function defaultRangeUtc() {
    var to = new Date();
    var from = new Date(to.getTime() - 15 * 24 * 60 * 60 * 1000);
    function fmtLocal(d) {
      var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      var h = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + day + 'T' + h + ':' + mi;
    }
    document.getElementById('fFrom').value = fmtLocal(from);
    document.getElementById('fTo').value = fmtLocal(to);
  }

  function listQueryString() {
    var qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    var fromEl = document.getElementById('fFrom').value;
    var toEl = document.getElementById('fTo').value;
    qs.set('from', new Date(fromEl).toISOString());
    qs.set('to', new Date(toEl).toISOString());
    var u = document.getElementById('fUser').value.trim();
    var c = document.getElementById('fCustomer').value.trim();
    if (u) qs.set('userId', u);
    if (c) qs.set('customerId', c);
    var m = document.getElementById('fMethod').value;
    if (m) qs.set('method', m);
    var st = document.getElementById('fStatus').value.trim();
    if (st !== '') qs.set('statusCode', st);
    qs.set('sort', document.getElementById('fSort').value || 'asc');
    return qs.toString();
  }

  function renderTimeline(rows) {
    rowsCache = rows;
    var el = document.getElementById('timeline');
    el.innerHTML = '';
    if (!rows.length) {
      el.textContent = 'No rows for these filters.';
      return;
    }
    rows.forEach(function (row, idx) {
      if (idx > 0) {
        var ar = document.createElement('span');
        ar.className = 'tl-arrow';
        ar.textContent = '→';
        el.appendChild(ar);
      }
      var n = document.createElement('button');
      n.type = 'button';
      n.className = 'tl-node ' + (row.id === selectedId ? '' : 'secondary outline');
      n.setAttribute('role', 'listitem');
      n.setAttribute('aria-pressed', row.id === selectedId ? 'true' : 'false');
      n.dataset.id = row.id;
      n.innerHTML = '<span class="tl-time">' + esc(row.timestamp) + '</span><div><kbd>' + esc(row.method) + '</kbd> <small>' + esc(row.status_code) + '</small></div><div class="tl-url">' + esc(row.url) + '</div>';
      n.onclick = function () { selectRow(row.id); };
      el.appendChild(n);
    });
  }

  function selectRow(id) {
    selectedId = id;
    renderTimeline(rowsCache);
    loadDetail(id);
  }

  /**
   * @param reqId - Request log row id
   * @param kind - request or response
   * @returns Body text, or null if session ended (401)
   */
  async function fetchBlobProxy(reqId, kind) {
    var br = await fetch(
      apiHref('api/request/' + encodeURIComponent(reqId) + '/blob?kind=' + encodeURIComponent(kind)),
      { headers: authHeaders() }
    );
    if (br.status === 401) {
      sessionStorage.removeItem(STORAGE);
      if (requiresLogin) { showLogin(); return null; }
    }
    if (!br.ok) {
      var t = await br.text().catch(function () { return ''; });
      return 'Error ' + br.status + (t ? ': ' + t.slice(0, 500) : '');
    }
    return await br.text();
  }

  async function loadDetail(id) {
    document.getElementById('detailEmpty').classList.add('hidden');
    document.getElementById('detailBody').classList.remove('hidden');
    document.getElementById('detailMeta').textContent = 'Loading…';
    document.getElementById('detailReq').textContent = '—';
    document.getElementById('detailRes').textContent = '—';
    var r = await fetch(apiHref('api/request/' + encodeURIComponent(id)), { headers: authHeaders() });
    if (r.status === 401) {
      sessionStorage.removeItem(STORAGE);
      if (requiresLogin) { showLogin(); return; }
    }
    if (!r.ok) {
      document.getElementById('detailMeta').textContent = 'Error ' + r.status;
      return;
    }
    var j = await r.json();
    var row = j.row || {};
    document.getElementById('detailMeta').textContent = JSON.stringify(row, null, 2);
    if (row.request_blob_url) {
      var reqT = await fetchBlobProxy(id, 'request');
      if (reqT === null) return;
      document.getElementById('detailReq').textContent = reqT;
    } else {
      document.getElementById('detailReq').textContent = '(no request blob)';
    }
    if (row.response_blob_url) {
      var resT = await fetchBlobProxy(id, 'response');
      if (resT === null) return;
      document.getElementById('detailRes').textContent = resT;
    } else {
      document.getElementById('detailRes').textContent = '(no response blob)';
    }
  }

  async function load() {
    var r = await fetch(apiHref('api/list?' + listQueryString()), { headers: authHeaders() });
    if (r.status === 401) {
      sessionStorage.removeItem(STORAGE);
      if (requiresLogin) { showLogin(); return; }
    }
    if (!r.ok) {
      var errT = await r.text().catch(function () { return ''; });
      document.getElementById('timeline').textContent = 'List error ' + r.status + ' ' + errT;
      return;
    }
    var j = await r.json();
    document.getElementById('meta').textContent = 'Page ' + j.page + ' · ' + j.rows.length + ' / ' + j.total;
    renderTimeline(j.rows || []);
    if (selectedId && !(j.rows || []).some(function (x) { return x.id === selectedId; })) {
      selectedId = null;
      document.getElementById('detailEmpty').classList.remove('hidden');
      document.getElementById('detailBody').classList.add('hidden');
    }
  }

  async function doLogin(ev) {
    if (ev) ev.preventDefault();
    document.getElementById('loginErr').textContent = '';
    var u = document.getElementById('rlUser').value;
    var p = document.getElementById('rlPass').value;
    var r = await fetch(apiHref('api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.session) {
      document.getElementById('loginErr').textContent = 'Invalid username or password.';
      return;
    }
    sessionStorage.setItem(STORAGE, j.session);
    showApp();
    defaultRangeUtc();
    page = 1;
    load();
  }

  async function doLogout() {
    var t = sessionStorage.getItem(STORAGE);
    if (t) {
      await fetch(apiHref('api/logout'), { method: 'POST', headers: { 'Authorization': 'Bearer ' + t } }).catch(function () {});
    }
    sessionStorage.removeItem(STORAGE);
    showLogin();
  }

  document.getElementById('loginForm').addEventListener('submit', doLogin);
  document.getElementById('rlLogout').onclick = doLogout;
  document.getElementById('prev').onclick = function () { if (page > 1) { page--; load(); } };
  document.getElementById('next').onclick = function () { page++; load(); };
  document.getElementById('fApply').onclick = function () { page = 1; load(); };

  if (requiresLogin) {
    if (sessionStorage.getItem(STORAGE)) {
      showApp();
      defaultRangeUtc();
      load();
    } else {
      document.getElementById('loginPanel').classList.remove('hidden');
    }
  } else {
    document.getElementById('appPanel').classList.remove('hidden');
    defaultRangeUtc();
    load();
  }
})();
  </script>
</body>
</html>`;
}
