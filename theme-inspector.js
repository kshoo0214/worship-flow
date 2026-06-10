/** 슬라이드 편집기와 동일한 텍스트 레이어 인스펙터 (테마 창·편집기 공용) */

function hexToRgba(hex, a) {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rgbaToHex(c) {
  if (!c || typeof c !== 'string') return '#000000';
  if (c.startsWith('#')) return c.slice(0, 7);
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function buildTextLayerInspectorHTML(t) {
  return `
    <div class="inspector-section"><h3>${t('themeTextLayer')}</h3>
      <div class="inspector-row"><label>${t('posSize')}</label><div class="inline-4">
        <input type="number" id="inspLayerX" min="0" max="100" step="0.5" title="X">
        <input type="number" id="inspLayerY" min="0" max="100" step="0.5" title="Y">
        <input type="number" id="inspLayerW" min="5" max="100" step="0.5" title="W">
        <input type="number" id="inspLayerH" min="4" max="100" step="0.5" title="H">
      </div></div>
      <div class="inspector-row"><label>${t('inspFont')}</label><select id="inspFontFamily">
        <option value="-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif">System</option>
        <option value="'Apple SD Gothic Neo', sans-serif">SD Gothic</option>
        <option value="'Malgun Gothic', sans-serif">Malgun Gothic</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="'Times New Roman', serif">Times</option></select></div>
      <div class="inspector-row"><label>${t('defaultFontSize')}</label><input type="range" id="inspFontSize" min="2" max="12" step="0.1"></div>
      <div class="inspector-row"><label>${t('fontWeight')}</label><select id="inspFontWeight">
        <option value="400">400</option><option value="600">600</option><option value="700">700</option><option value="800">800</option></select></div>
      <div class="inspector-row"><label>${t('lineHeight')}</label><input type="range" id="inspLineHeight" min="0.8" max="2.5" step="0.05"></div>
      <div class="inspector-row"><label>${t('letterSpacing')}</label><input type="range" id="inspLetterSpacing" min="0" max="10" step="0.1"></div>
      <div class="inspector-row"><label>${t('textColor')}</label><input type="color" id="inspTextColor"></div>
      <div class="inspector-row"><label>${t('hAlign')}</label><div class="align-btns">
        <button type="button" data-align="left">L</button><button type="button" data-align="center">C</button><button type="button" data-align="right">R</button></div></div>
      <div class="inspector-row"><label>${t('verticalAlign')}</label><div class="align-btns" id="inspVAlignBtns">
        <button type="button" data-valign="top">${t('alignTop')}</button><button type="button" data-valign="middle">${t('alignMiddle')}</button><button type="button" data-valign="bottom">${t('alignBottom')}</button></div></div>
      <div class="inspector-row"><label>${t('strokeLabel')}</label><input type="range" id="inspStrokeW" min="0" max="8" step="0.5"></div>
      <div class="inspector-row"><label>${t('strokeColor')}</label><input type="color" id="inspStrokeColor"></div>
      <div class="inspector-row"><label>${t('shadowLabel')}</label><div style="display:flex;gap:6px"><input type="number" id="inspShadowX" style="width:50%"><input type="number" id="inspShadowY" style="width:50%"></div></div>
      <div class="inspector-row"><label>${t('shadowLabel')}</label><input type="range" id="inspShadowBlur" min="0" max="40"><input type="color" id="inspShadowColor" style="margin-top:6px"></div>
    </div>`;
}

function bindTextLayerInspector(layer, options = {}) {
  const { onChange, clampFn } = options;
  const clamp = clampFn || ((v, min, max) => Math.max(min, Math.min(max, v)));
  const st = layer.style;
  const set = (fn) => {
    fn();
    if (onChange) onChange();
  };

  const lx = document.getElementById('inspLayerX');
  if (lx) {
    lx.value = Math.round(layer.x * 10) / 10;
    document.getElementById('inspLayerY').value = Math.round(layer.y * 10) / 10;
    document.getElementById('inspLayerW').value = Math.round(layer.w * 10) / 10;
    document.getElementById('inspLayerH').value = Math.round(layer.h * 10) / 10;
    ['inspLayerX', 'inspLayerY', 'inspLayerW', 'inspLayerH'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      const keys = ['x', 'y', 'w', 'h'];
      const mins = [0, 0, 5, 4];
      el.oninput = () => set(() => { layer[keys[i]] = clamp(Number(el.value), mins[i], 100); });
    });
  }

  const ff = document.getElementById('inspFontFamily');
  if (ff) {
    ff.value = st.fontFamily;
    ff.onchange = (e) => set(() => { st.fontFamily = e.target.value; });
  }
  document.getElementById('inspFontSize').value = st.fontSize;
  document.getElementById('inspFontSize').oninput = (e) => set(() => { st.fontSize = Number(e.target.value); });
  const fw = document.getElementById('inspFontWeight');
  if (fw) { fw.value = st.fontWeight || '700'; fw.onchange = (e) => set(() => { st.fontWeight = e.target.value; }); }
  const lh = document.getElementById('inspLineHeight');
  if (lh) { lh.value = st.lineHeight ?? 1; lh.oninput = (e) => set(() => { st.lineHeight = Number(e.target.value); }); }
  const ls = document.getElementById('inspLetterSpacing');
  if (ls) { ls.value = st.letterSpacing ?? 1; ls.oninput = (e) => set(() => { st.letterSpacing = Number(e.target.value); }); }
  document.getElementById('inspTextColor').value = st.color;
  document.getElementById('inspTextColor').oninput = (e) => set(() => { st.color = e.target.value; });

  document.querySelectorAll('.align-btns button[data-align]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.align === st.textAlign);
    btn.onclick = () => set(() => {
      st.textAlign = btn.dataset.align;
      document.querySelectorAll('.align-btns button[data-align]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
  document.querySelectorAll('#inspVAlignBtns button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.valign === (st.verticalAlign || 'middle'));
    btn.onclick = () => set(() => {
      st.verticalAlign = btn.dataset.valign;
      document.querySelectorAll('#inspVAlignBtns button').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('inspStrokeW').value = st.strokeWidth;
  document.getElementById('inspStrokeW').oninput = (e) => set(() => { st.strokeWidth = Number(e.target.value); });
  document.getElementById('inspStrokeColor').value = st.strokeColor;
  document.getElementById('inspStrokeColor').oninput = (e) => set(() => { st.strokeColor = e.target.value; });
  document.getElementById('inspShadowX').value = st.shadowX ?? 0;
  document.getElementById('inspShadowY').value = st.shadowY ?? 4;
  document.getElementById('inspShadowBlur').value = st.shadowBlur ?? 12;
  const shadowColorEl = document.getElementById('inspShadowColor');
  shadowColorEl.value = rgbaToHex(st.shadowColor || 'rgba(0,0,0,0.85)');
  document.getElementById('inspShadowX').oninput = (e) => set(() => { st.shadowX = Number(e.target.value); });
  document.getElementById('inspShadowY').oninput = (e) => set(() => { st.shadowY = Number(e.target.value); });
  document.getElementById('inspShadowBlur').oninput = (e) => set(() => { st.shadowBlur = Number(e.target.value); });
  shadowColorEl.oninput = (e) => set(() => { st.shadowColor = hexToRgba(e.target.value, 0.85); });
}

module.exports = {
  buildTextLayerInspectorHTML,
  bindTextLayerInspector,
  hexToRgba,
  rgbaToHex,
};
