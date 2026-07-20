import './app.css';
// Importing actions.js starts the registry+dataset fetch at module scope
// (UI-18) — before the component tree mounts.
import { onPopState } from './actions.js';
import { mount } from 'svelte';
import { ui } from './store.svelte.js';
import DashboardApp from './DashboardApp.svelte';

// Viewport + input-capability flags (UI-1/UI-2/UI-19).
const mqMobile = window.matchMedia('(max-width: 767px)');
const mqTouch = window.matchMedia('(hover: none)');
ui.isMobile = mqMobile.matches;
ui.isTouch = mqTouch.matches;
mqMobile.addEventListener('change', (e) => {
  ui.isMobile = e.matches;
  // Layout flip rebuilds the chart option (leafDepth), which resets the zoom —
  // keep our drill/sheet state consistent with that.
  ui.drill = null;
  ui.sheet = 'closed';
});
mqTouch.addEventListener('change', (e) => { ui.isTouch = e.matches; });

window.addEventListener('popstate', onPopState);

mount(DashboardApp, { target: document.getElementById('app') });
