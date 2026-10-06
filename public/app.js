const $ = (selector) => document.querySelector(selector);
const state = {
  actor: null,
  reference: { suppliers: [], categories: [] },
  dashboard: null,
  view: 'overview',
  viewToken: 0,
  products: [],
  selected: null,
  catalog: { search: '', status: '' },
  auditProduct: '',
  import: { format: 'json', content: '', preview: null, previewKey: '' },
};
const roleNames = { steward: 'Data steward', reviewer: 'Reviewer', admin: 'Administrator' };
const roleInitials = { steward: 'DS', reviewer: 'RV', admin: 'AD' };
const views = [
  ['overview', 'Overview', 'grid'],
  ['catalog', 'Product catalog', 'box'],
  ['reviews', 'Approval queue', 'check-square'],
  ['imports', 'Import & export', 'upload'],
  ['integrations', 'Integrations', 'connect'],
  ['audit', 'Audit trail', 'clock'],
];
const statusColors = {
  Draft: '#c9bd9a',
  InReview: '#ddbd7c',
  Approved: '#a6b793',
  Published: '#5d8266',
};
const paths = {
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  box: ['M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z', 'm3 7.5 9 4.5 9-4.5', 'M12 12v9', 'm7.5 5.3 9 4.5'],
  'check-square': ['M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9', 'm9 10 3 3L21 4'],
  check: ['m5 12 4 4L19 6'],
  shield: ['M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6z', 'm8 12 3 3 5-6'],
  upload: ['M12 16V3', 'm7 8 5-5 5 5', 'M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5'],
  download: ['M12 3v13', 'm7 11 5 5 5-5', 'M3 16v5h18v-5'],
  connect: ['M9 8 5 12l4 4', 'm15 8 4 4-4 4', 'm14 4-4 16', 'M3 4h3', 'M18 20h3'],
  clock: ['M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9z', 'M12 7v5l3 2'],
  search: ['M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z', 'm16 16 5 5'],
  arrow: ['M4 12h16', 'm14 6 6 6-6 6'],
  'arrow-up': ['M7 17 17 7', 'M7 7h10v10'],
  refresh: ['M20 7V3l-4 4', 'M20 7a9 9 0 0 0-15-1', 'M4 17v4l4-4', 'M4 17a9 9 0 0 0 15 1'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  logout: ['M10 3H4v18h6', 'M8 12h13', 'm17 8 4 4-4 4'],
  calendar: ['M3 5h18v16H3z', 'M3 10h18', 'M7 3v4', 'M17 3v4'],
  warning: ['m12 3 10 18H2z', 'M12 9v4', 'M12 17h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v6', 'M12 7h.01'],
  file: ['M14 3H5v18h14V8z', 'M14 3v5h5', 'M8 12h8', 'M8 16h6'],
  server: ['M3 3h18v7H3z', 'M3 14h18v7H3z', 'M7 6.5h.01', 'M7 17.5h.01', 'M16 6.5h2', 'M16 17.5h2'],
  bolt: ['m13 2-9 12h7l-1 8 10-13h-8z'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  edit: ['m15 4 5 5-11 11-6 1 1-6z', 'm12 7 5 5'],
  lock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  light: ['M9 18h6', 'M10 21h4', 'M8 14a6 6 0 1 1 8 0c-1 1-1 3-1 4H9c0-1 0-3-1-4'],
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || (value === false && !key.startsWith('aria-')))
      continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (['disabled', 'required', 'readOnly', 'checked', 'hidden'].includes(key))
      node[key] = Boolean(value);
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

function icon(name) {
  return svg(
    'svg',
    { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    ...(paths[name] || paths.box).map((d) => svg('path', { d })),
  );
}
function button(label, onClick, variant = '', iconName = null, attrs = {}) {
  return el(
    'button',
    { type: 'button', class: `button ${variant}`, onClick, ...attrs },
    iconName && icon(iconName),
    label,
  );
}
function route(view) {
  if (location.hash.slice(1) === view) navigate(view);
  else location.hash = view;
}
function canWrite() {
  return ['steward', 'admin'].includes(state.actor?.role);
}
function canReview() {
  return ['reviewer', 'admin'].includes(state.actor?.role);
}
function isAdmin() {
  return state.actor?.role === 'admin';
}
function ownRecord(product) {
  return [product.createdBy, product.updatedBy].some(
    (value) => value !== undefined && [state.actor?.username, state.actor?.id].includes(value),
  );
}
function labelFor(id, collection) {
  return state.reference[collection]?.find((item) => item.id === id)?.name || id || '—';
}
function actorName(actor) {
  return typeof actor === 'object' && actor
    ? actor.username || actor.id || 'System'
    : actor || 'System';
}
function badge(value) {
  return el(
    'span',
    { class: `badge badge-${String(value).toLowerCase()}` },
    el('span', { class: 'tiny-dot' }),
    { InReview: 'In review', DeadLetter: 'Dead letter' }[value] || value,
  );
}
function number(value) {
  return Number(value || 0).toLocaleString();
}
function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}
function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return Number.isNaN(minutes)
    ? '—'
    : minutes < 1
      ? 'Just now'
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} hr ago`
          : `${Math.floor(minutes / 1440)} days ago`;
}
function timeNode(value, relative = false) {
  return el(
    'time',
    { datetime: value, title: timestamp(value) },
    relative ? relativeTime(value) : timestamp(value),
  );
}
function qualityCell(quality) {
  const score = quality?.score ?? 0;
  return el(
    'span',
    { class: `quality-cell ${score < 65 ? 'bad' : score < 100 ? 'warning' : ''}` },
    icon(score === 100 ? 'check' : 'warning'),
    `${score}%`,
    svg(
      'svg',
      { class: 'quality-meter', viewBox: '0 0 100 5', 'aria-hidden': 'true' },
      svg('rect', { x: 0, y: 0, width: 100, height: 5, fill: '#eaecdf' }),
      svg('rect', {
        x: 0,
        y: 0,
        width: Math.max(0, Math.min(100, score)),
        height: 5,
        fill: score < 65 ? '#b86c61' : score < 100 ? '#c5a36a' : '#91a881',
      }),
    ),
  );
}
function productIcon(product) {
  return product.categoryId === 'LIGHTING'
    ? 'light'
    : product.categoryId === 'WIRE_CABLE'
      ? 'connect'
      : 'bolt';
}

async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.method && options.method !== 'GET') {
    headers['X-Atlas-Request'] = 'true';
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error?.message || `Request failed (${response.status}).`);
    error.code = json.error?.code;
    error.details = json.error?.details;
    error.status = response.status;
    error.requestId = json.requestId;
    if (response.status === 401 && state.actor && path !== '/api/login') showLogin();
    throw error;
  }
  return json.data;
}

function detailMessages(details) {
  if (!details) return [];
  if (typeof details === 'string') return [details];
  if (Array.isArray(details))
    return details.flatMap((item) =>
      typeof item === 'string'
        ? [item]
        : item.message
          ? [
              `${item.row ? `Row ${item.row}: ` : ''}${item.field ? `${item.field}: ` : ''}${item.message}`,
            ]
          : item.errors
            ? detailMessages(item.errors).map(
                (message) => `${item.row ? `Row ${item.row}: ` : ''}${message}`,
              )
            : detailMessages(item),
    );
  if (details.message) return [details.message];
  if (details.issues) return detailMessages(details.issues);
  if (details.errors) return detailMessages(details.errors);
  return Object.entries(details)
    .filter(([key]) => !['expectedVersion', 'actualVersion', 'currentVersion'].includes(key))
    .flatMap(([key, value]) =>
      typeof value === 'string' ? [`${key}: ${value}`] : detailMessages(value),
    );
}

function errorText(error) {
  const lines = detailMessages(error.details);
  return [error.message, ...lines.slice(0, 8)].join('\n');
}
function notify(message, error = false) {
  const node = el(
    'div',
    { class: `toast${error ? ' toast-error' : ''}`, role: error ? 'alert' : 'status' },
    el('span', { class: 'toast-icon' }, icon(error ? 'warning' : 'check')),
    el('p', {}, message),
    el(
      'button',
      {
        class: 'icon-button',
        type: 'button',
        'aria-label': 'Dismiss notification',
        onClick: () => node.remove(),
      },
      '×',
    ),
  );
  $('#notifications').append(node);
  setTimeout(() => node.remove(), error ? 12000 : 6000);
}

function showLogin() {
  state.actor = null;
  state.viewToken++;
  $('#initial-loading').hidden = true;
  $('#app-shell').hidden = true;
  $('#login-screen').hidden = false;
  $('#product-dialog').close();
  $('#comment-dialog').close();
  document.title = 'Atlas MDM · Sign in';
}

async function startWorkspace(actor) {
  state.actor = actor;
  state.reference = await api('/api/reference');
  $('#login-screen').hidden = true;
  $('#initial-loading').hidden = true;
  $('#app-shell').hidden = false;
  renderNavigation();
  const session = $('#session-control');
  session.replaceChildren(
    el('span', { class: 'avatar', 'aria-hidden': 'true' }, roleInitials[actor.role] || 'AT'),
    el(
      'div',
      {},
      el('strong', {}, roleNames[actor.role] || actor.username),
      el('small', {}, `Signed in as ${actor.username}`),
    ),
    el(
      'button',
      {
        class: 'icon-button',
        type: 'button',
        'aria-label': 'Sign out and switch role',
        title: 'Sign out and switch role',
        onClick: logout,
      },
      icon('logout'),
    ),
  );
  $('#topbar-avatar').textContent = roleInitials[actor.role] || 'AT';
  await navigate(
    views.some(([key]) => key === location.hash.slice(1)) ? location.hash.slice(1) : 'overview',
  );
}

function renderNavigation() {
  $('#primary-nav').replaceChildren(
    ...views.map(([key, title, iconName]) =>
      el(
        'button',
        {
          type: 'button',
          class: `nav-link${key === state.view ? ' active' : ''}`,
          'data-view': key,
          'aria-current': key === state.view ? 'page' : null,
          onClick: () => route(key),
        },
        icon(iconName),
        title,
        key === 'reviews'
          ? el(
              'span',
              { class: 'nav-count', 'data-review-count': '' },
              state.dashboard?.byStatus?.InReview ?? '—',
            )
          : key === state.view
            ? el('span', { class: 'nav-arrow', 'aria-hidden': 'true' }, '›')
            : null,
      ),
    ),
  );
}

async function logout() {
  try {
    await api('/api/logout', { method: 'POST', body: {} });
    showLogin();
    $('#login-username').focus();
  } catch (error) {
    notify(error.message, true);
  }
}
function pageHeading(title, subtitle, actions = [], eyebrow = null) {
  return el(
    'div',
    { class: 'page-heading' },
    el(
      'div',
      {},
      eyebrow && el('span', { class: 'eyebrow' }, eyebrow),
      el('h1', {}, title),
      el('p', {}, subtitle),
    ),
    actions.length ? el('div', { class: 'button-row' }, ...actions) : null,
  );
}
function panel(title, subtitle = null, action = null, ...body) {
  return el(
    'section',
    { class: 'panel' },
    el(
      'div',
      { class: 'panel-header' },
      el('div', {}, el('h2', {}, title), subtitle && el('p', {}, subtitle)),
      action,
    ),
    el('div', { class: 'panel-body' }, ...body),
  );
}
function emptyState(title, description, iconName = 'box', action = null) {
  return el(
    'div',
    { class: 'empty-state' },
    icon(iconName),
    el('h3', {}, title),
    el('p', {}, description),
    action,
  );
}
function notice(title, description, info = false) {
  return el(
    'div',
    { class: `notice${info ? ' notice-info' : ''}` },
    icon(info ? 'info' : 'shield'),
    el('p', {}, el('strong', {}, title), description),
  );
}
function pageError(error) {
  return el(
    'div',
    { class: 'form-error page-error', role: 'alert' },
    el('p', {}, errorText(error)),
    button('Try again', () => navigate(state.view), '', 'refresh'),
  );
}

async function navigate(view) {
  if (!state.actor) return;
  state.view = views.some(([key]) => key === view) ? view : 'overview';
  const token = ++state.viewToken;
  const viewLabel = views.find(([key]) => key === state.view)[1];
  $('#breadcrumb').textContent = viewLabel;
  document.title = `${viewLabel} · Atlas MDM`;
  $('#sidebar').classList.remove('is-open');
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  renderNavigation();
  const main = $('#main-content');
  main.setAttribute('aria-busy', 'true');
  main.replaceChildren(
    el('div', { class: 'panel loading-panel', role: 'status' }, 'Loading your workspace…'),
  );
  try {
    const renderers = {
      overview: renderOverview,
      catalog: renderCatalog,
      reviews: renderReviews,
      imports: renderImports,
      integrations: renderIntegrations,
      audit: renderAudit,
    };
    const content = await renderers[state.view]();
    if (token !== state.viewToken || !state.actor) return;
    main.replaceChildren(...(Array.isArray(content) ? content : [content]));
    if (!$('#product-dialog').open && !$('#comment-dialog').open)
      main.focus({ preventScroll: true });
  } catch (error) {
    if (token === state.viewToken && state.actor)
      main.replaceChildren(pageHeading(viewLabel, 'Your product data workspace'), pageError(error));
  } finally {
    if (token === state.viewToken) main.removeAttribute('aria-busy');
  }
}

function statCard(title, value, hint, iconName = 'box', options = {}) {
  return el(
    'article',
    { class: 'stat-card' },
    el(
      'div',
      { class: 'stat-top' },
      el('span', { class: 'stat-title' }, title),
      el('span', { class: `stat-icon${options.orange ? ' orange' : ''}` }, icon(iconName)),
    ),
    el(
      'div',
      { class: 'stat-value' },
      value,
      options.unit && el('span', { class: 'stat-unit' }, options.unit),
    ),
    el(
      'div',
      { class: 'stat-bottom' },
      icon(options.warning ? 'clock' : 'check'),
      el('span', { class: options.warning ? '' : 'positive' }, hint),
    ),
    options.spark &&
      svg(
        'svg',
        { class: 'stat-spark', viewBox: '0 0 80 30', 'aria-hidden': 'true' },
        svg('path', {
          d: 'M1 25 10 24 18 19 26 22 35 13 44 16 53 8 61 10 70 4 79 3',
          fill: 'none',
          stroke: options.orange ? '#d3aa6e' : '#9fb38c',
          'stroke-width': 1.5,
        }),
      ),
  );
}

function productTable(products, compact = false) {
  const columns = compact
    ? ['PRODUCT', 'STATUS', 'QUALITY', '']
    : ['PRODUCT', 'MANUFACTURER', 'CATEGORY', 'STATUS', 'QUALITY', 'UPDATED', ''];
  const table = el(
    'table',
    { class: 'data-table' },
    el(
      'caption',
      { class: 'visually-hidden' },
      compact ? 'Recent product records' : 'Product catalog',
    ),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...columns.map((label) =>
          el('th', { scope: 'col' }, label || el('span', { class: 'visually-hidden' }, 'Actions')),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...products.map((product) =>
        el(
          'tr',
          {},
          el(
            'td',
            {},
            el(
              'div',
              { class: 'product-name' },
              el(
                'span',
                { class: 'product-thumbnail', 'aria-hidden': 'true' },
                icon(productIcon(product)),
              ),
              el(
                'div',
                {},
                el(
                  'button',
                  { class: 'text-button', type: 'button', onClick: () => openProduct(product.id) },
                  el('strong', {}, product.name || 'Untitled product'),
                ),
                el('small', {}, product.sku),
              ),
            ),
          ),
          !compact && el('td', {}, product.manufacturer || '—'),
          !compact && el('td', { class: 'muted' }, labelFor(product.categoryId, 'categories')),
          el('td', {}, badge(product.status)),
          el('td', {}, qualityCell(product.quality)),
          !compact && el('td', { class: 'muted' }, timeNode(product.updatedAt)),
          el(
            'td',
            {},
            el(
              'button',
              {
                class: 'icon-button',
                type: 'button',
                'aria-label': `Open ${product.sku}`,
                title: 'Open product record',
                onClick: () => openProduct(product.id),
              },
              icon('arrow'),
            ),
          ),
        ),
      ),
    ),
  );
  return el('div', { class: 'table-scroll' }, table);
}

async function renderOverview() {
  const [dashboard, products, events, jobs] = await Promise.all([
    api('/api/dashboard'),
    api('/api/products'),
    api('/api/audit'),
    api('/api/jobs'),
  ]);
  state.dashboard = dashboard;
  state.products = products;
  renderNavigation();
  const issues = products.filter((product) => product.quality?.issues?.length);
  const recent = [...products]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);
  const delivered = jobs.filter((job) => job.status === 'Delivered').length;
  const header = pageHeading(
    'Your data, at a glance.',
    'A connected view of product health, approvals, and your downstream systems.',
    [
      el(
        'span',
        { class: 'date-pill' },
        icon('calendar'),
        new Date().toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ),
    ],
    'PRODUCT WORKSPACE',
  );
  const stats = el(
    'div',
    { class: 'stats-grid' },
    statCard('Total products', number(dashboard.totalProducts), 'One governed catalog', 'box', {
      spark: true,
    }),
    statCard(
      'Average data quality',
      Math.round(dashboard.averageQuality || 0),
      'Live rule evaluation',
      'shield',
      { unit: '%', spark: true },
    ),
    statCard(
      'Awaiting approval',
      number(dashboard.byStatus?.InReview),
      'Ready for a second look',
      'check-square',
      { warning: true, orange: true, spark: true },
    ),
    statCard(
      'Published products',
      number(dashboard.byStatus?.Published),
      'Connected to your outbox',
      'connect',
      { spark: true },
    ),
  );
  const banner = el(
    'section',
    { class: 'quality-banner' },
    el('span', { class: 'banner-icon' }, icon('shield')),
    el(
      'div',
      {},
      el(
        'h2',
        {},
        issues.length
          ? `${issues.length} product${issues.length === 1 ? '' : 's'} could use a little attention.`
          : 'Your catalog is in good shape.',
      ),
      el(
        'p',
        {},
        issues.length
          ? 'Resolve quality issues to keep every product moving forward.'
          : 'Every product currently passes the catalog quality rules.',
      ),
    ),
    button(
      issues.length ? 'Explore catalog' : 'View products',
      () => route('catalog'),
      '',
      'arrow',
    ),
  );
  const lifecycle = panel(
    'The product lifecycle',
    'Every record has a clear next step.',
    null,
    el(
      'div',
      { class: 'status-overview' },
      ...Object.keys(statusColors).map((status) =>
        el(
          'div',
          {},
          el(
            'small',
            {},
            svg(
              'svg',
              { class: 'status-dot', viewBox: '0 0 8 8', 'aria-hidden': 'true' },
              svg('circle', { cx: 4, cy: 4, r: 4, fill: statusColors[status] }),
            ),
            status === 'InReview' ? 'In review' : status,
          ),
          el('strong', {}, dashboard.byStatus?.[status] || 0),
        ),
      ),
    ),
    svg(
      'svg',
      {
        class: 'pipeline-bar',
        viewBox: '0 0 1000 10',
        preserveAspectRatio: 'none',
        role: 'img',
        'aria-label': `Product lifecycle: ${Object.entries(dashboard.byStatus || {})
          .map(([status, count]) => `${count} ${status}`)
          .join(', ')}`,
      },
      ...Object.keys(statusColors).map((status, index, all) =>
        svg('rect', {
          x:
            (all.slice(0, index).reduce((sum, key) => sum + (dashboard.byStatus?.[key] || 0), 0) /
              Math.max(1, dashboard.totalProducts)) *
            1000,
          y: 0,
          width:
            ((dashboard.byStatus?.[status] || 0) / Math.max(1, dashboard.totalProducts)) * 1000,
          height: 10,
          fill: statusColors[status],
        }),
      ),
    ),
    el(
      'div',
      { class: 'workflow-steps' },
      ...['Enrich', 'Review', 'Approve', 'Publish'].flatMap((label, index) => [
        index > 0 && el('span', { class: 'workflow-arrow', 'aria-hidden': 'true' }, '→'),
        el(
          'span',
          { class: 'workflow-step' },
          el('span', { class: 'workflow-number' }, index + 1),
          label,
        ),
      ]),
    ),
  );
  const recentPanel = el(
    'section',
    { class: 'panel' },
    el(
      'div',
      { class: 'panel-header' },
      el(
        'div',
        {},
        el('h2', {}, 'Recently updated products'),
        el('p', {}, 'A closer look at the records in motion.'),
      ),
      button('View catalog', () => route('catalog'), 'button-ghost', 'arrow'),
    ),
    recent.length
      ? productTable(recent, true)
      : emptyState(
          'Your catalog starts here',
          'Create your first product or import the sample supplier catalog.',
        ),
    el(
      'div',
      { class: 'table-footer' },
      `${products.length} product${products.length === 1 ? '' : 's'} in your workspace`,
      'LIVE CATALOG',
    ),
  );
  const activity = panel(
    'Workspace activity',
    'A traceable history of every change.',
    null,
    events.length
      ? el(
          'div',
          { class: 'activity-list' },
          ...events
            .slice(0, 4)
            .map((event) =>
              el(
                'div',
                { class: 'activity-item' },
                el(
                  'span',
                  { class: 'activity-icon' },
                  icon(
                    String(event.action).toLowerCase().includes('publish')
                      ? 'upload'
                      : String(event.action).toLowerCase().includes('approv')
                        ? 'check'
                        : 'edit',
                  ),
                ),
                el(
                  'div',
                  { class: 'activity-content' },
                  el('strong', {}, readableAction(event.action)),
                  el(
                    'p',
                    {},
                    `${actorName(event.actor)} · ${products.find((product) => product.id === (event.productId || event.product_id))?.sku || 'Workspace'}${event.comment ? ` · ${event.comment}` : ''}`,
                  ),
                  timeNode(event.createdAt || event.created_at, true),
                ),
              ),
            ),
        )
      : emptyState('A clean slate', 'Your product changes will appear here.', 'clock'),
    el(
      'div',
      { class: 'section-link' },
      el(
        'button',
        { class: 'text-button', type: 'button', onClick: () => route('audit') },
        'Explore audit trail',
      ),
      icon('arrow'),
    ),
  );
  const integration = panel(
    'Connected systems',
    'Your catalog, beyond the workspace.',
    null,
    el(
      'div',
      { class: 'integration-health' },
      el('span', { class: 'health-indicator', 'aria-hidden': 'true' }),
      el(
        'div',
        {},
        el('strong', {}, 'Mock ERP integration'),
        el('p', {}, 'Transactional outbox · delivery with retries'),
      ),
    ),
    el(
      'div',
      { class: 'integration-path' },
      el('span', { class: 'integration-node' }, icon('box'), 'Atlas MDM'),
      el('span', { class: 'path-dots', 'aria-hidden': 'true' }, '···→'),
      el('span', { class: 'integration-node' }, icon('server'), 'Mock ERP'),
    ),
    el(
      'div',
      { class: 'mini-metrics' },
      ...[
        [delivered, 'Delivered'],
        [dashboard.pendingJobs, 'Queued'],
        [dashboard.failedJobs, 'Need attention'],
      ].map(([value, label]) => el('div', {}, el('strong', {}, value || 0), el('span', {}, label))),
    ),
    el(
      'div',
      { class: 'section-link' },
      el(
        'button',
        { class: 'text-button', type: 'button', onClick: () => route('integrations') },
        'View integrations',
      ),
      icon('arrow'),
    ),
  );
  const guide = el(
    'section',
    { class: 'panel getting-started' },
    el('span', { class: 'eyebrow' }, 'TRY THE FULL JOURNEY'),
    el('h2', {}, 'From supplier to system.'),
    el(
      'p',
      {},
      'Import a sample catalog, enrich a product, and hand it to a reviewer. Publish it and watch the record arrive in the mock ERP.',
    ),
    button('Start with an import', () => route('imports'), '', 'arrow'),
  );
  return [
    header,
    stats,
    el(
      'div',
      { class: 'dashboard-grid' },
      el('div', { class: 'dashboard-main' }, banner, lifecycle, recentPanel),
      el('div', { class: 'dashboard-side' }, activity, integration, guide),
    ),
  ];
}

async function renderCatalog() {
  const params = new URLSearchParams(state.catalog);
  const products = await api(`/api/products?${params}`);
  state.products = products;
  const list = el('div', { id: 'catalog-results' });
  const count = el('span', { class: 'table-count' }, `${products.length} records`);
  function draw(data) {
    list.replaceChildren(
      data.length
        ? productTable(data)
        : emptyState(
            'No matching products',
            'Try another search or filter. You can also create a new record.',
            'search',
          ),
    );
    count.textContent = `${data.length} record${data.length === 1 ? '' : 's'}`;
  }
  draw(products);
  let timer;
  let request = 0;
  async function search() {
    const current = ++request;
    list.setAttribute('aria-busy', 'true');
    try {
      const data = await api(`/api/products?${new URLSearchParams(state.catalog)}`);
      if (current === request && state.view === 'catalog') {
        state.products = data;
        draw(data);
      }
    } catch (error) {
      notify(error.message, true);
    } finally {
      if (current === request) list.removeAttribute('aria-busy');
    }
  }
  const searchInput = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder: 'Search name, SKU, manufacturer…',
    'aria-label': 'Search product catalog',
    value: state.catalog.search,
    onInput: (event) => {
      state.catalog.search = event.target.value;
      clearTimeout(timer);
      timer = setTimeout(search, 250);
    },
  });
  const filter = el(
    'select',
    {
      class: 'filter-select',
      'aria-label': 'Filter products by status',
      onChange: (event) => {
        state.catalog.status = event.target.value;
        search();
      },
    },
    ...[
      ['', 'All statuses'],
      ['Draft', 'Draft'],
      ['InReview', 'In review'],
      ['Approved', 'Approved'],
      ['Published', 'Published'],
    ].map(([value, label]) =>
      el('option', { value, selected: state.catalog.status === value }, label),
    ),
  );
  return [
    pageHeading(
      'Product catalog',
      'One source of truth for every product, attribute, and connection.',
      [
        button('Import products', () => route('imports'), '', 'upload'),
        canWrite() && button('New product', () => openProduct(null), 'button-primary', 'plus'),
      ].filter(Boolean),
      'YOUR MASTER DATA',
    ),
    el(
      'section',
      { class: 'panel' },
      el(
        'div',
        { class: 'toolbar' },
        el(
          'div',
          { class: 'toolbar-left' },
          el('div', { class: 'search-wrap' }, icon('search'), searchInput),
          filter,
        ),
        count,
      ),
      list,
      el(
        'div',
        { class: 'table-footer' },
        'Select a product to enrich attributes or move it through its workflow.',
        'VERSIONED RECORDS',
      ),
    ),
  ];
}

async function renderReviews() {
  const products = await api('/api/products?status=InReview');
  const message = canReview()
    ? 'Reviewers approve a record only when someone else created and last edited it. Rejections include a comment so the steward knows what to change.'
    : 'As a data steward, you can inspect the queue. Sign out and enter as a reviewer to approve or reject a submitted product.';
  return [
    pageHeading(
      'A second look. A trusted record.',
      'Review the products ready for approval, then publish with confidence.',
      [button('Refresh queue', () => navigate('reviews'), '', 'refresh')],
      'APPROVAL QUEUE',
    ),
    notice('Good governance takes two people.', message),
    products.length
      ? el(
          'div',
          { class: 'review-grid' },
          ...products.map((product) =>
            el(
              'article',
              { class: 'panel review-card' },
              el(
                'div',
                { class: 'review-top' },
                el('span', { class: 'product-thumbnail' }, icon(productIcon(product))),
                el(
                  'div',
                  {},
                  el('h2', {}, product.name),
                  el('span', { class: 'sku-label' }, `${product.sku} · ${product.manufacturer}`),
                ),
                badge(product.status),
              ),
              el(
                'div',
                { class: 'review-info' },
                el(
                  'div',
                  {},
                  'Category',
                  el('strong', {}, labelFor(product.categoryId, 'categories')),
                ),
                el('div', {}, 'Last editor', el('strong', {}, product.updatedBy || '—')),
                el('div', {}, 'Version', el('strong', {}, `v${product.version}`)),
              ),
              qualityCell(product.quality),
              el(
                'div',
                { class: 'button-row' },
                button('Review record', () => openProduct(product.id), '', 'eye'),
                canReview() &&
                  button(
                    'Approve',
                    () => quickTransition(product, 'approve'),
                    'button-primary',
                    'check',
                    {
                      disabled: ownRecord(product),
                      title: ownRecord(product)
                        ? 'Another user must approve a record you created or last edited.'
                        : 'Approve this product',
                    },
                  ),
              ),
            ),
          ),
        )
      : el(
          'section',
          { class: 'panel' },
          emptyState(
            'All caught up.',
            'Products appear here after a steward resolves their quality issues and submits them for review.',
            'check-square',
            button('Explore catalog', () => route('catalog'), '', 'arrow'),
          ),
        ),
  ];
}

const fieldDefinitions = [
  {
    name: 'name',
    label: 'Product name',
    required: true,
    placeholder: 'Commercial circuit breaker',
    full: true,
  },
  { name: 'sku', label: 'SKU', required: true, placeholder: 'AT-CB-200', maxlength: 32 },
  { name: 'manufacturer', label: 'Manufacturer', required: true, placeholder: 'Volterra Electric' },
  { name: 'mpn', label: 'Manufacturer part number', required: true, placeholder: 'VCB-200' },
  { name: 'supplierId', label: 'Supplier', collection: 'suppliers' },
  { name: 'categoryId', label: 'Category', collection: 'categories' },
  {
    name: 'uom',
    label: 'Unit of measure',
    options: [
      ['EA', 'Each (EA)'],
      ['FT', 'Feet (FT)'],
      ['M', 'Meters (M)'],
    ],
  },
  {
    name: 'voltage',
    label: 'Voltage (V)',
    type: 'number',
    placeholder: '120',
    min: 0,
    step: 'any',
  },
  { name: 'gtin', label: 'GTIN', placeholder: 'Valid 8, 12, 13, or 14-digit GTIN', maxlength: 14 },
  { name: 'source', label: 'Source', placeholder: 'Manual entry', full: true },
];

async function openProduct(id) {
  try {
    const product = id ? await api(`/api/products/${encodeURIComponent(id)}`) : null;
    state.selected = product;
    buildProductDialog(product);
    if (!$('#product-dialog').open) $('#product-dialog').showModal();
  } catch (error) {
    notify(error.message, true);
  }
}

function buildProductDialog(product) {
  const dialog = $('#product-dialog');
  const isNew = !product;
  const editable = canWrite() && (isNew || product.status === 'Draft');
  const form = el(
    'form',
    { class: 'record-form', id: 'record-editor' },
    el('h3', {}, 'Product attributes'),
  );
  const grid = el('div', { class: 'field-grid' });
  const inputs = {};
  let dirty = false;
  const dirtyNote = el(
    'span',
    { class: 'dirty-note', hidden: true },
    icon('edit'),
    'Unsaved changes',
  );
  const transitionButtons = [];
  for (const definition of fieldDefinitions) {
    let input;
    const defaults = {
      source: 'Manual entry',
      uom: 'EA',
      supplierId: state.reference.suppliers?.[0]?.id || '',
      categoryId: state.reference.categories?.[0]?.id || '',
    };
    const value = product?.[definition.name] ?? defaults[definition.name] ?? '';
    if (definition.collection || definition.options) {
      const options =
        definition.options ||
        (state.reference[definition.collection] || []).map((item) => [item.id, item.name]);
      input = el(
        'select',
        { id: `record-${definition.name}`, name: definition.name, disabled: !editable },
        ...options.map(([key, label]) =>
          el('option', { value: key, selected: key === value }, label),
        ),
      );
    } else
      input = el('input', {
        id: `record-${definition.name}`,
        name: definition.name,
        value,
        disabled: !editable,
        type: definition.type || 'text',
        maxlength: definition.maxlength,
        min: definition.min,
        step: definition.step,
        placeholder: definition.placeholder,
        autocomplete: 'off',
      });
    inputs[definition.name] = input;
    input.addEventListener('input', () => {
      dirty = true;
      dirtyNote.hidden = false;
      for (const btn of transitionButtons) btn.disabled = true;
    });
    grid.append(
      el(
        'label',
        { class: `field${definition.full ? ' field-full' : ''}`, for: `record-${definition.name}` },
        definition.label,
        input,
      ),
    );
  }
  form.append(
    grid,
    el(
      'p',
      { class: 'field-note' },
      editable
        ? 'Drafts can contain quality issues. Save to evaluate the rules before submitting.'
        : product?.status === 'Draft'
          ? 'Sign in as a steward or administrator to edit draft records.'
          : 'Reopen this product as a draft to change its attributes.',
    ),
  );
  const aside = el(
    'aside',
    { class: 'record-aside', 'aria-label': 'Quality and record information' },
    el('h3', {}, 'Data quality'),
  );
  if (product) {
    aside.append(
      el('div', { class: 'quality-score' }, product.quality?.score ?? 0, el('span', {}, '/100')),
      qualityCell(product.quality),
    );
    const issues = product.quality?.issues || [];
    aside.append(
      issues.length
        ? el(
            'ul',
            { class: 'quality-issues' },
            ...issues.map((issue) =>
              el(
                'li',
                {},
                el('strong', {}, icon('warning'), issue.field || issue.rule),
                el('p', {}, issue.message),
              ),
            ),
          )
        : el(
            'div',
            { class: 'quality-clear' },
            icon('check'),
            el('p', {}, 'All active quality rules pass. This product is ready for its next step.'),
          ),
    );
    const metadata = [
      ['Created by', product.createdBy],
      ['Last edited by', product.updatedBy],
      ['Approved by', product.approvedBy || '—'],
      ['Updated', timestamp(product.updatedAt)],
      ['Source', product.source || 'Manual entry'],
    ];
    aside.append(
      el(
        'div',
        { class: 'record-metadata' },
        el('h3', {}, 'Record lineage'),
        el(
          'dl',
          {},
          ...metadata.map(([label, value]) =>
            el(
              'div',
              { class: label === 'Source' ? 'source-meta' : '' },
              el('dt', {}, label),
              el('dd', {}, value),
            ),
          ),
        ),
        button(
          'View record history',
          () => {
            state.auditProduct = product.id;
            dialog.close();
            route('audit');
          },
          'button-ghost button-small',
          'clock',
        ),
      ),
    );
  } else
    aside.append(
      el(
        'div',
        { class: 'quality-clear' },
        icon('info'),
        el(
          'p',
          {},
          'Save your draft to evaluate completeness, category requirements, valid units, and product identifiers.',
        ),
      ),
      el(
        'p',
        { class: 'record-rule' },
        'Identity is unique by SKU and by manufacturer + part number. A second person approves the record before it can be published.',
      ),
    );
  const errorArea = el('div', { class: 'form-error record-error', role: 'alert', hidden: true });
  const header = el(
    'div',
    { class: 'dialog-header' },
    el(
      'div',
      {},
      el('span', { class: 'eyebrow' }, isNew ? 'CREATE PRODUCT RECORD' : 'PRODUCT MASTER'),
      el(
        'h2',
        { id: 'product-dialog-title' },
        isNew ? 'A new product starts here.' : product.name || 'Untitled product',
      ),
      el(
        'div',
        { class: 'dialog-meta' },
        !isNew && product.sku,
        !isNew && badge(product.status),
        !isNew && `Version ${product.version}`,
        dirtyNote,
      ),
    ),
    el(
      'button',
      {
        class: 'icon-button',
        type: 'button',
        'aria-label': 'Close product details',
        onClick: () => dialog.close(),
      },
      icon('close'),
    ),
  );
  const actions = el('div', { class: 'button-row' });
  const footerNote = el(
    'div',
    { class: 'button-row' },
    button('Close', () => dialog.close(), 'button-ghost'),
  );
  if (editable)
    actions.append(
      el(
        'button',
        { type: 'submit', form: 'record-editor', class: 'button button-primary' },
        icon('check'),
        isNew ? 'Create draft' : 'Save changes',
      ),
    );
  if (product) {
    function action(label, actionName, variant, iconName, disabled = false, title = null) {
      const btn = button(
        label,
        () =>
          actionName === 'reject'
            ? askRejection(product)
            : transitionInDialog(product, actionName, errorArea),
        variant,
        iconName,
        { disabled, title },
      );
      transitionButtons.push(btn);
      actions.append(btn);
    }
    if (product.status === 'Draft' && canWrite())
      action(
        'Submit for review',
        'submit',
        'button-soft',
        'arrow',
        false,
        product.quality?.issues?.length
          ? 'The server will explain any quality issues that block submission.'
          : null,
      );
    if (product.status === 'InReview' && canReview()) {
      action('Return to draft', 'reject', 'button-danger', 'edit');
      action(
        'Approve record',
        'approve',
        'button-primary',
        'check',
        ownRecord(product),
        ownRecord(product)
          ? 'A different user must approve a record you created or last edited.'
          : null,
      );
      if (ownRecord(product))
        aside.append(
          el(
            'p',
            { class: 'workflow-hint' },
            'Another user must approve this record because you created or last edited it.',
          ),
        );
    }
    if (product.status === 'Approved' && canReview())
      action('Publish to ERP', 'publish', 'button-primary', 'upload');
    if (['Approved', 'Published'].includes(product.status) && canWrite())
      action('Reopen as draft', 'reopen', 'button-soft', 'edit');
    if (!editable && !actions.childElementCount)
      aside.append(
        el(
          'p',
          { class: 'workflow-hint' },
          product.status === 'InReview'
            ? 'A reviewer can approve or return this record to draft.'
            : product.status === 'Approved'
              ? 'A reviewer can publish this approved product.'
              : 'A steward can reopen this published record for changes.',
        ),
      );
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editable) return;
    const data = Object.fromEntries(
      fieldDefinitions.map((definition) => [
        definition.name,
        definition.name === 'voltage'
          ? inputs.voltage.value.trim() === ''
            ? null
            : Number(inputs.voltage.value)
          : inputs[definition.name].value.trim(),
      ]),
    );
    if (!isNew) data.version = product.version;
    setDialogBusy(dialog, true);
    errorArea.hidden = true;
    try {
      const updated = await api(
        isNew ? '/api/products' : `/api/products/${encodeURIComponent(product.id)}`,
        { method: isNew ? 'POST' : 'PUT', body: data },
      );
      state.selected = updated;
      buildProductDialog(updated);
      notify(
        isNew
          ? 'Product created as a draft. Quality rules have been evaluated.'
          : 'Product saved. Quality rules have been evaluated.',
      );
      navigate(state.view);
    } catch (error) {
      showRecordError(errorArea, error, product);
    } finally {
      if (dirty || errorArea.isConnected) setDialogBusy(dialog, false);
    }
  });
  dialog.replaceChildren(
    header,
    el('div', { class: 'dialog-body' }, form, aside, errorArea),
    el('div', { class: 'dialog-footer' }, footerNote, actions),
  );
}

function setDialogBusy(dialog, busy) {
  dialog.setAttribute('aria-busy', String(busy));
  for (const btn of dialog.querySelectorAll('button')) {
    if (busy) {
      btn.dataset.wasDisabled = String(btn.disabled);
      btn.disabled = true;
    } else if (btn.dataset.wasDisabled) {
      btn.disabled = btn.dataset.wasDisabled === 'true';
      delete btn.dataset.wasDisabled;
    }
  }
}
function showRecordError(area, error, product) {
  area.hidden = false;
  area.replaceChildren(
    el('p', {}, errorText(error)),
    error.status === 409 &&
      product &&
      button('Reload latest version', () => openProduct(product.id), '', 'refresh'),
  );
  area.scrollIntoView({ block: 'nearest' });
}
async function transitionInDialog(product, action, errorArea, comment = '') {
  const dialog = $('#product-dialog');
  setDialogBusy(dialog, true);
  errorArea.hidden = true;
  try {
    const updated = await api(`/api/products/${encodeURIComponent(product.id)}/transitions`, {
      method: 'POST',
      body: { action, version: product.version, comment },
    });
    state.selected = updated;
    buildProductDialog(updated);
    notify(
      action === 'publish'
        ? 'Product published. A delivery job is now in the integration outbox.'
        : action === 'reject'
          ? 'Product returned to draft with your review comment.'
          : action === 'reopen'
            ? 'Product reopened as a draft. Previous approval was cleared.'
            : action === 'approve'
              ? 'Product approved. It is ready to publish.'
              : 'Product submitted for review.',
    );
    navigate(state.view);
  } catch (error) {
    showRecordError(errorArea, error, product);
  } finally {
    setDialogBusy(dialog, false);
  }
}
async function quickTransition(product, action) {
  try {
    await api(`/api/products/${encodeURIComponent(product.id)}/transitions`, {
      method: 'POST',
      body: { action, version: product.version },
    });
    notify('Product approved. Open the record to publish it to the mock ERP.');
    navigate(state.view);
  } catch (error) {
    notify(errorText(error), true);
  }
}

function askRejection(product) {
  const dialog = $('#comment-dialog');
  const field = el('textarea', {
    id: 'review-comment',
    name: 'comment',
    required: true,
    maxlength: 1000,
    rows: 4,
    placeholder: 'Explain what needs to change…',
  });
  const form = el(
    'form',
    { class: 'comment-form' },
    el('p', {}, `Return ${product.sku} to the steward with a clear reason for the change.`),
    el('label', { class: 'field', for: 'review-comment' }, 'Review comment', field),
    el(
      'div',
      { class: 'button-row' },
      button('Cancel', () => dialog.close(), 'button-ghost'),
      el('button', { type: 'submit', class: 'button button-danger' }, 'Return to draft'),
    ),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!field.value.trim()) {
      field.setCustomValidity('Enter a review comment.');
      field.reportValidity();
      return;
    }
    dialog.close();
    transitionInDialog(product, 'reject', $('#product-dialog .record-error'), field.value.trim());
  });
  field.addEventListener('input', () => field.setCustomValidity(''));
  dialog.replaceChildren(
    el(
      'div',
      { class: 'dialog-header' },
      el(
        'div',
        {},
        el('h2', { id: 'comment-dialog-title' }, 'Give the steward a clear next step.'),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'icon-button',
          'aria-label': 'Close review comment',
          onClick: () => dialog.close(),
        },
        icon('close'),
      ),
    ),
    form,
  );
  dialog.showModal();
  field.focus();
}

async function renderImports() {
  const previewHost = el('div', { id: 'import-preview' });
  const errorHost = el('div', { class: 'form-error import-errors', role: 'alert', hidden: true });
  const editor = el('textarea', {
    class: 'import-editor',
    id: 'import-content',
    rows: 14,
    spellcheck: false,
    'aria-describedby': 'import-format-help',
    placeholder: 'Load the sample catalog or paste your supplier data here.',
    value: state.import.content,
    disabled: !canWrite(),
    onInput: (event) => {
      state.import.content = event.target.value;
      clearPreview();
    },
  });
  const tabs = el('div', { class: 'format-tabs', role: 'group', 'aria-label': 'Import format' });
  const previewButton = button('Preview & validate', preview, 'button-primary', 'eye', {
    disabled: !canWrite(),
  });
  function clearPreview() {
    state.import.preview = null;
    state.import.previewKey = '';
    previewHost.replaceChildren();
    errorHost.hidden = true;
  }
  function drawTabs() {
    tabs.replaceChildren(
      ...['json', 'csv', 'xml'].map((format) =>
        el(
          'button',
          {
            type: 'button',
            class: `format-tab${state.import.format === format ? ' active' : ''}`,
            'aria-pressed': state.import.format === format,
            onClick: () => {
              state.import.format = format;
              clearPreview();
              drawTabs();
              $('#import-format-help').textContent =
                `Current format: ${format.toUpperCase()}. Preview checks the entire batch without saving it.`;
            },
          },
          format.toUpperCase(),
        ),
      ),
    );
  }
  drawTabs();
  async function sample() {
    try {
      const response = await fetch(`/samples/supplier-products.${state.import.format}`);
      if (!response.ok) throw new Error('The sample catalog could not be loaded.');
      const content = await response.text();
      state.import.content = content;
      editor.value = content;
      clearPreview();
      notify(
        `Sample ${state.import.format.toUpperCase()} catalog loaded. Preview it before importing.`,
      );
    } catch (error) {
      notify(error.message, true);
    }
  }
  const file = el('input', {
    class: 'file-input',
    id: 'import-file',
    type: 'file',
    accept: '.json,.csv,.xml,application/json,text/csv,application/xml,text/xml',
    disabled: !canWrite(),
    'aria-label': 'Upload a JSON, CSV, or XML supplier catalog',
    onChange: async (event) => {
      const selected = event.target.files[0];
      if (!selected) return;
      if (selected.size > 512 * 1024) {
        notify('Choose a file smaller than 512 KB.', true);
        event.target.value = '';
        return;
      }
      try {
        const extension = selected.name.split('.').pop().toLowerCase();
        if (['json', 'csv', 'xml'].includes(extension)) state.import.format = extension;
        state.import.content = await selected.text();
        editor.value = state.import.content;
        drawTabs();
        clearPreview();
        $('#import-format-help').textContent =
          `Current format: ${state.import.format.toUpperCase()}. Preview checks the entire batch without saving it.`;
      } catch (error) {
        notify(error.message, true);
      }
    },
  });
  async function preview() {
    if (!state.import.content.trim()) {
      errorHost.hidden = false;
      errorHost.textContent = 'Add catalog content or load a sample before previewing.';
      return;
    }
    previewButton.disabled = true;
    errorHost.hidden = true;
    try {
      const key = `${state.import.format}\n${state.import.content}`;
      const result = await api('/api/imports', {
        method: 'POST',
        body: { format: state.import.format, content: state.import.content, dryRun: true },
      });
      if (key !== `${state.import.format}\n${state.import.content}`) return;
      state.import.preview = result;
      state.import.previewKey = key;
      drawPreview();
    } catch (error) {
      clearPreview();
      errorHost.hidden = false;
      errorHost.replaceChildren(el('pre', {}, errorText(error)));
    } finally {
      previewButton.disabled = !canWrite();
    }
  }
  function drawPreview() {
    const result = state.import.preview;
    if (!result) return;
    const commitButton = button(
      `Import ${result.total} products`,
      commit,
      'button-primary',
      'upload',
      { disabled: !canWrite() },
    );
    async function commit() {
      if (state.import.previewKey !== `${state.import.format}\n${state.import.content}`) {
        clearPreview();
        notify('The source changed. Preview the catalog again before importing.', true);
        return;
      }
      commitButton.disabled = true;
      try {
        const imported = await api('/api/imports', {
          method: 'POST',
          body: { format: state.import.format, content: state.import.content, dryRun: false },
        });
        clearPreview();
        state.import.content = '';
        editor.value = '';
        file.value = '';
        previewHost.replaceChildren(
          el(
            'div',
            { class: 'form-success' },
            `${imported.created} product${imported.created === 1 ? '' : 's'} imported as drafts. Open the catalog to enrich and submit them.`,
            button('View catalog', () => route('catalog'), 'button-ghost button-small', 'arrow'),
          ),
        );
        notify(`${imported.created} products imported. The complete batch was saved.`);
      } catch (error) {
        errorHost.hidden = false;
        errorHost.replaceChildren(el('pre', {}, errorText(error)));
        commitButton.disabled = false;
      }
    }
    previewHost.replaceChildren(
      el(
        'section',
        { class: 'panel preview-panel' },
        el(
          'div',
          { class: 'preview-summary' },
          el(
            'div',
            {},
            el('strong', {}, `${result.total} records ready to import`),
            el('p', {}, 'Preview only · quality issues are allowed in draft records.'),
          ),
          commitButton,
        ),
        el(
          'div',
          { class: 'table-scroll' },
          el(
            'table',
            { class: 'data-table' },
            el('caption', { class: 'visually-hidden' }, 'Supplier import preview'),
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                ...['ROW', 'SKU', 'QUALITY', 'ISSUES'].map((label) =>
                  el('th', { scope: 'col' }, label),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              ...(result.rows || []).map((row) =>
                el(
                  'tr',
                  {},
                  el('td', {}, row.row),
                  el('td', {}, row.sku),
                  el('td', {}, qualityCell(row.quality)),
                  el(
                    'td',
                    { class: 'audit-comment' },
                    row.quality?.issues?.map((issue) => issue.message).join(' · ') ||
                      'All rules pass',
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
  drawPreview();
  const sourcePanel = el(
    'section',
    { class: 'panel' },
    el(
      'div',
      { class: 'panel-header' },
      el(
        'div',
        {},
        el('h2', {}, 'Bring your supplier data in'),
        el('p', {}, 'Three formats. One governed product model.'),
      ),
      tabs,
    ),
    el(
      'div',
      { class: 'panel-body' },
      el(
        'div',
        { class: 'import-upload' },
        icon('upload'),
        el(
          'div',
          {},
          el('strong', {}, 'Choose a supplier catalog'),
          el('p', {}, 'JSON, CSV, or XML · up to 100 products'),
          file,
        ),
      ),
      el(
        'label',
        { class: 'field', for: 'import-content' },
        'Catalog source',
        editor,
        el(
          'span',
          { class: 'field-note', id: 'import-format-help' },
          `Current format: ${state.import.format.toUpperCase()}. Preview checks the entire batch without saving it.`,
        ),
      ),
      el(
        'div',
        { class: 'button-row import-actions' },
        button('Load sample catalog', sample, '', 'file'),
        previewButton,
      ),
      errorHost,
    ),
  );
  const guidePanel = panel(
    'A careful handoff, every time.',
    'Validate first. Save the whole batch.',
    null,
    el(
      'ol',
      { class: 'guidance-list' },
      ...[
        [
          'Choose a source',
          'Upload your catalog, paste its content, or load a fictional supplier sample.',
        ],
        [
          'Preview the records',
          'Structural errors or duplicate identities block the complete batch. Quality issues stay visible on drafts.',
        ],
        [
          'Import & enrich',
          'Confirm the preview to save drafts. Resolve their quality issues before submitting for review.',
        ],
      ].map(([title, description], index) =>
        el(
          'li',
          {},
          el('span', { class: 'guidance-number' }, index + 1),
          el('div', {}, el('strong', {}, title), el('p', {}, description)),
        ),
      ),
    ),
    el(
      'div',
      { class: 'format-note' },
      'The sample catalog contains the same products in all three formats. After importing one format, importing the same products again is blocked by unique identity checks.',
    ),
    el(
      'div',
      { class: 'export-links' },
      el('h3', {}, 'Take approved data downstream.'),
      el('p', {}, 'Exports contain Published products only.'),
      el(
        'div',
        { class: 'button-row' },
        ...['json', 'csv', 'xml'].map((format) =>
          el(
            'a',
            {
              class: 'button button-small',
              href: `/api/exports?format=${format}`,
              download: `atlas-products.${format}`,
            },
            icon('download'),
            format.toUpperCase(),
          ),
        ),
      ),
    ),
  );
  return [
    pageHeading(
      'Good data starts at the source.',
      'Bring supplier catalogs into a consistent model, then share a trusted catalog.',
      [],
      'IMPORT & EXPORT',
    ),
    !canWrite() &&
      notice(
        'Your current role can export and inspect.',
        'Switch to a steward or administrator to upload, preview, and import supplier records.',
        true,
      ),
    el('div', { class: 'two-column' }, sourcePanel, guidePanel),
    previewHost,
  ].filter(Boolean);
}

async function renderIntegrations() {
  const [jobs, products] = await Promise.all([api('/api/jobs'), api('/api/products')]);
  const materialsResult = await Promise.allSettled([api('/api/erp/materials')]);
  const materials = materialsResult[0].status === 'fulfilled' ? materialsResult[0].value : [];
  const counts = Object.fromEntries(
    ['Pending', 'Retry', 'Delivered', 'DeadLetter'].map((status) => [
      status,
      jobs.filter((job) => job.status === status).length,
    ]),
  );
  const stats = el(
    'div',
    { class: 'stats-grid integration-stats' },
    statCard('Queued for delivery', counts.Pending, 'Durable product snapshots', 'upload', {
      warning: true,
    }),
    statCard('Retrying', counts.Retry, 'Backoff between attempts', 'refresh', {
      warning: true,
      orange: true,
    }),
    statCard('Delivered', counts.Delivered, 'Acknowledged by mock ERP', 'check'),
    statCard('Dead letters', counts.DeadLetter, 'Administrator can retry', 'warning', {
      warning: true,
      orange: true,
    }),
  );
  const jobTable = el(
    'table',
    { class: 'data-table' },
    el('caption', { class: 'visually-hidden' }, 'Transactional integration outbox'),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...['PRODUCT / JOB', 'STATUS', 'ATTEMPTS', 'LAST UPDATE', 'DELIVERY DETAIL', ''].map(
          (label) =>
            el(
              'th',
              { scope: 'col' },
              label || el('span', { class: 'visually-hidden' }, 'Actions'),
            ),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...jobs.map((job) => {
        const productId = job.productId || job.product_id;
        const product = products.find((item) => item.id === productId);
        return el(
          'tr',
          {},
          el(
            'td',
            {},
            el(
              'div',
              { class: 'product-name' },
              el(
                'div',
                {},
                el('strong', {}, product?.sku || productId),
                el('small', {}, `Version ${job.productVersion ?? job.product_version}`),
                el('span', { class: 'job-id' }, job.id),
              ),
            ),
          ),
          el('td', {}, badge(job.status)),
          el('td', {}, job.attempts),
          el('td', { class: 'muted' }, timeNode(job.updatedAt || job.updated_at)),
          el(
            'td',
            { class: 'error-detail' },
            job.lastError ||
              job.last_error ||
              (job.status === 'Delivered'
                ? 'Delivery acknowledged'
                : job.status === 'Pending'
                  ? 'Waiting for the outbox worker'
                  : '—'),
          ),
          el(
            'td',
            {},
            isAdmin() && ['Retry', 'DeadLetter'].includes(job.status)
              ? button(
                  'Retry',
                  async () => {
                    try {
                      await api(`/api/jobs/${encodeURIComponent(job.id)}/retry`, {
                        method: 'POST',
                        body: {},
                      });
                      notify('The job has been queued for another delivery attempt.');
                      navigate('integrations');
                    } catch (error) {
                      notify(error.message, true);
                    }
                  },
                  'button-small',
                  'refresh',
                )
              : null,
          ),
        );
      }),
    ),
  );
  const outbox = el(
    'section',
    { class: 'panel' },
    el(
      'div',
      { class: 'panel-header' },
      el(
        'div',
        {},
        el('h2', {}, 'Integration outbox'),
        el('p', {}, 'Publish and enqueue happen in one database transaction.'),
      ),
      button('Refresh', () => navigate('integrations'), 'button-ghost', 'refresh'),
    ),
    jobs.length
      ? el('div', { class: 'table-scroll' }, jobTable)
      : emptyState(
          'No deliveries yet.',
          'Approve and publish a product to create its first delivery job.',
          'connect',
        ),
    el(
      'div',
      { class: 'table-footer' },
      'Automatic retries · idempotent receiver · visible dead letters',
      `${jobs.length} delivery jobs`,
    ),
  );
  const materialsArray = Array.isArray(materials) ? materials : materials?.materials || [];
  let materialsContent = emptyState(
    'Ready for its first material.',
    'Published products arrive here after the worker receives a successful delivery acknowledgement.',
    'server',
  );
  if (materialsResult[0].status === 'rejected')
    materialsContent = el(
      'div',
      { class: 'panel-body' },
      el(
        'div',
        { class: 'form-error' },
        `Mock ERP unavailable: ${materialsResult[0].reason.message}`,
      ),
    );
  else if (materialsArray.length)
    materialsContent = el(
      'div',
      { class: 'table-scroll' },
      el(
        'table',
        { class: 'data-table' },
        el('caption', { class: 'visually-hidden' }, 'Mock ERP material records'),
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ...['MATERIAL', 'DESCRIPTION', 'UNIT', 'GROUP', 'VERSION'].map((label) =>
              el('th', { scope: 'col' }, label),
            ),
          ),
        ),
        el(
          'tbody',
          {},
          ...materialsArray.map((material) => {
            const data = material.payload || material.material || material;
            return el(
              'tr',
              {},
              el('td', {}, data.MATNR),
              el('td', {}, data.MAKTX),
              el('td', {}, data.MEINS),
              el('td', {}, data.MATKL),
              el('td', {}, data.sourceVersion),
            );
          }),
        ),
      ),
    );
  const materialsPanel = el(
    'section',
    { class: 'panel' },
    el(
      'div',
      { class: 'panel-header' },
      el(
        'div',
        {},
        el('h2', {}, 'Downstream material records'),
        el('p', {}, 'The product snapshots received by the mock ERP.'),
      ),
      el('span', { class: 'table-count' }, `${materialsArray.length} materials`),
    ),
    materialsContent,
  );
  const mapping = panel(
    'A transparent data contract.',
    'SAP-inspired field names in an independent mock.',
    null,
    el(
      'dl',
      { class: 'mapping-list' },
      ...[
        ['SKU', 'MATNR'],
        ['Product name', 'MAKTX'],
        ['Unit of measure', 'MEINS'],
        ['Category', 'MATKL'],
        ['Manufacturer', 'MFRNR'],
        ['Part number', 'MFRPN'],
        ['Voltage', 'VOLTAGE'],
        ['Record version', 'sourceVersion'],
      ].map(([from, to]) => el('div', {}, el('dt', {}, from), el('dd', {}, `→ ${to}`))),
    ),
    el(
      'p',
      { class: 'console-help' },
      'This demonstrates mapping, delivery, and recovery. It is an independent simulated integration.',
    ),
  );
  const result = [
    pageHeading(
      'Every connection, accounted for.',
      'Follow each published product from your outbox to the downstream material record.',
      [button('Refresh deliveries', () => navigate('integrations'), '', 'refresh')],
      'CONNECTED SYSTEMS',
    ),
    stats,
    outbox,
    el('div', { class: 'integration-grid' }, materialsPanel, mapping),
  ];
  if (isAdmin()) {
    const input = el(
      'select',
      { id: 'failure-count' },
      ...Array.from({ length: 6 }, (_, value) =>
        el(
          'option',
          { value, selected: value === 2 },
          value === 0 ? '0 · Clear failures' : `${value} request${value === 1 ? '' : 's'}`,
        ),
      ),
    );
    const control = button(
      'Configure mock failures',
      async () => {
        control.disabled = true;
        try {
          await api('/api/demo/erp', { method: 'POST', body: { failNext: Number(input.value) } });
          notify(
            Number(input.value)
              ? `The mock ERP will fail its next ${input.value} delivery requests. Publish a product to see retries in action.`
              : 'Mock ERP failure injection cleared.',
          );
        } catch (error) {
          notify(error.message, true);
        } finally {
          control.disabled = false;
        }
      },
      'button-soft',
      'bolt',
    );
    const consolePanel = panel(
      'Try a delivery failure.',
      'Demo controls · administrator only · requires demo mode.',
      null,
      el(
        'div',
        { class: 'console-controls' },
        el('label', { class: 'field', for: 'failure-count' }, 'Fail the next ERP requests', input),
        control,
      ),
      el(
        'p',
        { class: 'console-help' },
        'Configure a failure, then publish an approved product. Refresh to observe retry attempts. Set 0 to restore the receiver. Retry or dead-letter jobs can be requeued above.',
      ),
    );
    consolePanel.classList.add('integration-console');
    result.push(consolePanel);
  } else
    result.push(
      notice(
        'Explore recovery as an administrator.',
        'Sign out and enter as administrator to configure mock ERP failures or retry an unsuccessful delivery.',
        true,
      ),
    );
  return result;
}

function readableAction(action = '') {
  return String(action)
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function parsedSnapshot(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
async function renderAudit() {
  const [events, products] = await Promise.all([
    api(
      `/api/audit${state.auditProduct ? `?productId=${encodeURIComponent(state.auditProduct)}` : ''}`,
    ),
    api('/api/products'),
  ]);
  const filter = el(
    'select',
    {
      class: 'filter-select',
      'aria-label': 'Filter audit events by product',
      onChange: (event) => {
        state.auditProduct = event.target.value;
        navigate('audit');
      },
    },
    el('option', { value: '', selected: !state.auditProduct }, 'All products'),
    ...products.map((product) =>
      el(
        'option',
        { value: product.id, selected: product.id === state.auditProduct },
        `${product.sku} · ${product.name}`,
      ),
    ),
  );
  const table = el(
    'table',
    { class: 'data-table' },
    el('caption', { class: 'visually-hidden' }, 'Append-only product audit trail'),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...['WHEN', 'ACTION', 'PRODUCT', 'ACTOR', 'COMMENT', 'RECORD CHANGE'].map((label) =>
          el('th', { scope: 'col' }, label),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...events.map((event) => {
        const id = event.productId || event.product_id;
        const product = products.find((item) => item.id === id);
        const before = parsedSnapshot(event.before ?? event.beforeJson ?? event.before_json);
        const after = parsedSnapshot(event.after ?? event.afterJson ?? event.after_json);
        return el(
          'tr',
          {},
          el('td', { class: 'muted' }, timeNode(event.createdAt || event.created_at)),
          el('td', {}, el('span', { class: 'audit-action' }, readableAction(event.action))),
          el(
            'td',
            {},
            id
              ? el(
                  'button',
                  { class: 'text-button', type: 'button', onClick: () => openProduct(id) },
                  product?.sku || id,
                )
              : 'Workspace',
          ),
          el('td', {}, actorName(event.actor)),
          el('td', { class: 'audit-comment' }, event.comment || '—'),
          el(
            'td',
            {},
            el(
              'details',
              { class: 'audit-details' },
              el('summary', {}, 'Inspect change'),
              el('pre', {}, JSON.stringify({ before, after }, null, 2)),
            ),
          ),
        );
      }),
    ),
  );
  return [
    pageHeading(
      'The story behind every record.',
      'Follow who changed what, when it happened, and how the product moved forward.',
      [],
      'AUDIT TRAIL',
    ),
    notice(
      'History you can inspect.',
      'Every product mutation is recorded in the same transaction as its change. Database triggers prevent updating or deleting audit events through ordinary database operations.',
      true,
    ),
    el(
      'section',
      { class: 'panel' },
      el(
        'div',
        { class: 'toolbar' },
        filter,
        el('span', { class: 'audit-legend' }, icon('lock'), 'Append-only event history'),
      ),
      events.length
        ? el('div', { class: 'table-scroll' }, table)
        : emptyState(
            'No events for this view.',
            'Create, edit, or transition a product to add a traceable event.',
            'clock',
          ),
      el(
        'div',
        { class: 'table-footer' },
        `${events.length} recorded events`,
        'Seed events are explicitly marked as demo data.',
      ),
    ),
  ];
}

$('#refresh-button').append(icon('refresh'));
$('#refresh-button').addEventListener('click', () => navigate(state.view));
$('#menu-toggle').addEventListener('click', () => {
  const opened = $('#sidebar').classList.toggle('is-open');
  $('#menu-toggle').setAttribute('aria-expanded', String(opened));
  $('#menu-toggle').setAttribute('aria-label', opened ? 'Close navigation' : 'Open navigation');
});
document.addEventListener('click', (event) => {
  if (
    $('#sidebar').classList.contains('is-open') &&
    !event.target.closest('#sidebar') &&
    !event.target.closest('#menu-toggle')
  ) {
    $('#sidebar').classList.remove('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('#sidebar').classList.remove('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
  }
});
window.addEventListener('hashchange', () => {
  if (state.actor) navigate(location.hash.slice(1));
});
for (const input of document.querySelectorAll('input[name="role"]'))
  input.addEventListener('change', () => {
    $('#login-username').value = input.value;
    $('#login-password').value = 'AtlasDemo!2026';
    $('#login-error').hidden = true;
  });
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector('[type="submit"]');
  submit.disabled = true;
  $('#login-error').hidden = true;
  try {
    const actor = await api('/api/login', {
      method: 'POST',
      body: { username: $('#login-username').value.trim(), password: $('#login-password').value },
    });
    await startWorkspace(actor);
  } catch (error) {
    $('#login-error').textContent = error.message;
    $('#login-error').hidden = false;
  } finally {
    submit.disabled = false;
  }
});

try {
  const actor = await api('/api/session');
  await startWorkspace(actor);
} catch (error) {
  showLogin();
  if (error.status !== 401)
    notify(
      'The workspace is unavailable. Check that the app service is running, then try signing in.',
      true,
    );
}
