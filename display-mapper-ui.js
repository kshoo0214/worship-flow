/**
 * Shared display mapper helpers for settings / stage editor.
 */

function getAutoOutputDisplayId(displays) {
  if (!displays?.length) return '';
  if (displays.length >= 2) {
    const secondary = displays.find((d) => !d.isPrimary) || displays[1];
    return String(secondary.id);
  }
  return String(displays[0].id);
}

function getAutoRelayDisplayId(displays, outputDisplayId = '', stageDisplayId = '') {
  if (!displays?.length) return '';
  const outId = String(outputDisplayId || '').trim() || getAutoOutputDisplayId(displays);
  const stageId = String(stageDisplayId || '').trim()
    || getAutoStageDisplayId(displays, outId);
  const used = new Set([outId, stageId].filter(Boolean));
  const candidate = displays.find((d) => !used.has(String(d.id)));
  if (candidate) return String(candidate.id);
  if (displays.length >= 2) {
    const secondary = displays.find((d) => !d.isPrimary) || displays[1];
    return String(secondary.id);
  }
  return String(displays[0].id);
}

function getAutoStageDisplayId(displays, outputDisplayId = '') {
  if (!displays?.length) return '';
  const outId = String(outputDisplayId || '').trim();
  const primary = displays.find((d) => d.isPrimary) || displays[0];
  const outputDisplay = outId
    ? displays.find((d) => String(d.id) === outId)
    : getAutoOutputDisplayId(displays) && displays.find((d) => String(d.id) === getAutoOutputDisplayId(displays));
  const others = displays.filter((d) => {
    if (d.id === primary.id) return false;
    if (outputDisplay && d.id === outputDisplay.id) return false;
    return true;
  });
  if (others.length) return String(others[0].id);
  if (displays.length >= 2) {
    return String((displays.find((d) => !d.isPrimary) || displays[1]).id);
  }
  return String(displays[0].id);
}

function renderDisplayMapper(root, displaysCache, options = {}) {
  if (!root) return;
  const {
    savedId = '',
    autoId = '',
    onSelect,
    emptyLabel = 'No displays',
    programLabel = 'Program',
    stageLabel = 'Stage',
    showRoleTags = false,
  } = options;

  if (!displaysCache?.displays?.length) {
    root.innerHTML = `<span class="dm-empty">${emptyLabel}</span>`;
    root.style.height = '88px';
    return;
  }

  const { displays, virtualBounds } = displaysCache;
  const effectiveId = savedId || autoId || '';
  const pad = 14;
  const innerW = Math.max(virtualBounds.width, 1);
  const innerH = Math.max(virtualBounds.height, 1);
  const maxW = Math.min(root.clientWidth || 320, 360);
  const scale = Math.min((maxW - pad * 2) / innerW, (140 - pad * 2) / innerH);

  root.style.height = `${Math.round(innerH * scale + pad * 2)}px`;
  root.innerHTML = '';

  displays.forEach((d) => {
    const block = document.createElement('button');
    block.type = 'button';
    block.className = 'display-mapper-block';
    if (d.isPrimary) block.classList.add('is-primary');
    const isTarget = String(d.id) === effectiveId;
    if (isTarget) block.classList.add('is-selected');
    if (!savedId && isTarget) block.classList.add('is-auto');

    block.style.left = `${pad + (d.bounds.x - virtualBounds.x) * scale}px`;
    block.style.top = `${pad + (d.bounds.y - virtualBounds.y) * scale}px`;
    block.style.width = `${Math.max(d.bounds.width * scale, 52)}px`;
    block.style.height = `${Math.max(d.bounds.height * scale, 40)}px`;

    const role = showRoleTags
      ? (String(d.id) === String(savedId || autoId) ? stageLabel : '')
      : '';
    block.innerHTML = [
      `<span class="dm-label">${d.index + 1}${d.isPrimary ? ' ★' : ''}</span>`,
      `<span class="dm-size">${d.bounds.width}×${d.bounds.height}</span>`,
      role ? `<span class="dm-role">${role}</span>` : '',
    ].join('');
    block.title = `${d.label || `Display ${d.index + 1}`} (${d.bounds.width}×${d.bounds.height})`;
    block.addEventListener('click', () => onSelect?.(String(d.id), d));
    root.appendChild(block);
  });
}

const SCREEN_ROLES = ['program', 'stage', 'relay'];

const SCREEN_ROLE_COLORS = {
  program: '#4ade80',
  stage: '#60a5fa',
  relay: '#c084fc',
};

function resolveEffectiveDisplayIds(settings, displays = []) {
  const list = Array.isArray(displays) ? displays : [];
  const outSaved = String(settings?.outputDisplayId || '').trim();
  const stageSaved = String(settings?.stageDisplayId || '').trim();
  const relaySaved = String(settings?.relayDisplayId || '').trim();
  const outAuto = getAutoOutputDisplayId(list);
  const stageAuto = getAutoStageDisplayId(list, outSaved || outAuto);
  const relayAuto = getAutoRelayDisplayId(list, outSaved || outAuto, stageSaved || stageAuto);
  return {
    program: outSaved || outAuto,
    stage: stageSaved || stageAuto,
    relay: relaySaved || relayAuto,
  };
}

function getSavedDisplayIdForRole(settings, role) {
  if (role === 'program') return String(settings?.outputDisplayId || '').trim();
  if (role === 'stage') return String(settings?.stageDisplayId || '').trim();
  if (role === 'relay') return String(settings?.relayDisplayId || '').trim();
  return '';
}

function getRoleBadgesForDisplay(displayId, settings, displays = []) {
  const id = String(displayId || '').trim();
  if (!id) return [];
  const effective = resolveEffectiveDisplayIds(settings, displays);
  return SCREEN_ROLES.map((role) => {
    const saved = getSavedDisplayIdForRole(settings, role);
    if (saved) {
      if (saved !== id) return null;
      return { role, auto: false };
    }
    if (effective[role] === id) return { role, auto: true };
    return null;
  }).filter(Boolean);
}

/**
 * ProPresenter-style unified screen layout — all monitors in one graphic with role badges.
 * @param {HTMLElement|null} root
 * @param {{ displays: object[], virtualBounds: object }} displaysCache
 * @param {{ settings: object, activeRole: string, labels: object, onAssign: Function }} options
 */
function renderScreenLayoutMapper(root, displaysCache, options = {}) {
  if (!root) return;
  const {
    settings = {},
    activeRole = 'program',
    labels = {},
    onAssign,
  } = options;

  if (!displaysCache?.displays?.length) {
    root.innerHTML = `<span class="hint dm-empty">${labels.empty || 'No displays'}</span>`;
    root.style.height = '140px';
    return;
  }

  const { displays, virtualBounds } = displaysCache;
  const pad = 18;
  const innerW = Math.max(virtualBounds.width, 1);
  const innerH = Math.max(virtualBounds.height, 1);
  const maxW = Math.max(root.clientWidth || 420, 320);
  const scale = Math.min((maxW - pad * 2) / innerW, (220 - pad * 2) / innerH);

  root.style.height = `${Math.round(innerH * scale + pad * 2)}px`;
  root.innerHTML = '';

  displays.forEach((d) => {
    const block = document.createElement('button');
    block.type = 'button';
    block.className = 'screen-layout-block';
    if (d.isPrimary) block.classList.add('is-primary');

    const badges = getRoleBadgesForDisplay(d.id, settings, displays);
    badges.forEach(({ role, auto }) => {
      block.classList.add(`has-${role}`);
      if (auto) block.classList.add(`is-${role}-auto`);
    });

    if (activeRole !== 'clear' && getSavedDisplayIdForRole(settings, activeRole) === String(d.id)) {
      block.classList.add('is-role-target');
    }

    block.style.left = `${pad + (d.bounds.x - virtualBounds.x) * scale}px`;
    block.style.top = `${pad + (d.bounds.y - virtualBounds.y) * scale}px`;
    block.style.width = `${Math.max(d.bounds.width * scale, 72)}px`;
    block.style.height = `${Math.max(d.bounds.height * scale, 52)}px`;

    const badgeHtml = badges.map(({ role, auto }) => {
      const label = labels[role] || role;
      return `<span class="screen-role-badge screen-role-badge--${role}${auto ? ' is-auto' : ''}">${label}${auto ? ' · A' : ''}</span>`;
    }).join('');

    block.innerHTML = [
      `<span class="dm-label">${d.index + 1}${d.isPrimary ? ' ★' : ''}</span>`,
      `<span class="dm-size">${d.bounds.width}×${d.bounds.height}</span>`,
      badgeHtml ? `<span class="screen-role-badges">${badgeHtml}</span>` : '',
    ].join('');
    block.title = `${d.label || `Display ${d.index + 1}`} (${d.bounds.width}×${d.bounds.height})`;
    block.addEventListener('click', () => onAssign?.(String(d.id), activeRole));
    root.appendChild(block);
  });
}

function populateDisplaySelect(select, displaysCache, savedId, labels = {}) {
  if (!select) return;
  const autoLabel = labels.auto || 'Auto';
  const displays = displaysCache?.displays || [];
  select.innerHTML = `<option value="">${autoLabel}</option>`;
  displays.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = String(d.id);
    opt.textContent = `${labels.monitor || 'Monitor'} ${d.index + 1} — ${d.bounds.width}×${d.bounds.height}${d.isPrimary ? ' ★' : ''}`;
    select.appendChild(opt);
  });
  select.value = savedId && displays.some((d) => String(d.id) === savedId) ? savedId : '';
}

module.exports = {
  getAutoOutputDisplayId,
  getAutoRelayDisplayId,
  getAutoStageDisplayId,
  SCREEN_ROLES,
  SCREEN_ROLE_COLORS,
  resolveEffectiveDisplayIds,
  getSavedDisplayIdForRole,
  getRoleBadgesForDisplay,
  renderScreenLayoutMapper,
  renderDisplayMapper,
  populateDisplaySelect,
};
