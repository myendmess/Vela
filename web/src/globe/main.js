import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';
// Importing data.js starts the registry + topology fetches at module scope
// (UI-18) — before the component tree mounts.
import './data.js';
import { mount } from 'svelte';
import GlobeApp from './GlobeApp.svelte';

mount(GlobeApp, { target: document.getElementById('app') });
