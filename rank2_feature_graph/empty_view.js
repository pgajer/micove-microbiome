// Presentation mode intentionally has no scientific loader or browser-storage access.
(() => {
 const el = id => document.getElementById(id);
 const viewControls=document.createElement('section');viewControls.id='sampleViewControls';viewControls.setAttribute('aria-label','Sample view settings');
 const coloring=document.createElement('details');coloring.id='sampleColoringControls';coloring.open=true;
 const heading=document.createElement('summary');heading.textContent='Sample coloring';coloring.append(heading,el('valenciaColorControls'));
 viewControls.append(el('sampleMethod').closest('label'),el('unfoldFaces').closest('label'),el('unfoldAnchor').closest('label'),coloring,el('sampleLegendPosition').closest('label'));
 el('sampleSidePanels').prepend(viewControls);
 for (const id of ['datasetSelect', 'panelDatasetSelect']) {
  const selector = el(id);
  selector.onchange = () => {
   if (selector.value === 'empty') return;
   const url = new URL(selector.dataset.entry, location.href);
   url.searchParams.set('dataset', selector.value);
   location.assign(url.href);
  };
 }
 el('sampleLegendPosition').onchange = event => {
  el('sampleContent').dataset.legendPosition = event.target.value;
 };
 el('toggleControls').onclick = () => {
  const collapsed = el('explorerLayout').classList.toggle('controlsCollapsed');
  el('controlSections').hidden = collapsed;
  el('toggleControls').textContent = collapsed ? '›' : '‹';
  el('toggleControls').setAttribute('aria-expanded', String(!collapsed));
 };
 let maximized = null;
 function maximize(panel) {
  maximized = maximized === panel ? null : panel;
  document.body.classList.toggle('panelMaximized', !!maximized);
  el('panelWorkspace').classList.toggle('hasMaximized', !!maximized);
  for (const button of document.querySelectorAll('button[id^="maximize-"]')) {
   const target = el(button.id.slice(9)), active = target === maximized;
   target.classList.toggle('maximized', active);
   button.textContent = active ? '↙ Restore' : '⛶ Maximize';
   button.setAttribute('aria-expanded', String(active));
  }
 }
 for (const button of document.querySelectorAll('button[id^="maximize-"]')) {
  button.onclick = () => maximize(el(button.id.slice(9)));
 }
 document.addEventListener('keydown', event => { if (event.key === 'Escape' && maximized) maximize(maximized); });
})();
