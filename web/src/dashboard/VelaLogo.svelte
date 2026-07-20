<script>
  // The Vela neon logo SVG — preserved exactly from globe/dashboard/index.html.
  let { class: klass = 'w-9 h-9' } = $props();
</script>

<a
  href="https://github.com/myendmess/Vela"
  target="_blank"
  rel="noopener"
  title="Vela source"
  aria-label="Vela on GitHub"
  class="block shrink-0 drop-shadow-[0_0_6px_rgba(59,205,240,0.45)] focus-visible:outline-2 focus-visible:outline-amber-400 {klass}">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="neonGrad" x1="15" y1="90" x2="90" y2="10" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#34ebac" /> <stop offset="50%" stop-color="#3bcdf0" /> <stop offset="100%" stop-color="#42b9f5" /> </linearGradient>
    </defs>
    <g stroke="url(#neonGrad)" stroke-linejoin="round">
      <path d="M 15 25 L 30 25 L 50 55 L 70 30 L 55 30 L 90 10 L 96 35 L 80 35 L 48 78 L 40 90 Z"
            fill="url(#neonGrad)" fill-opacity="0.1" stroke-width="1.8" />
      <path d="M 52 81 L 84 38 L 90 43 L 58 86 Z"
            fill="url(#neonGrad)" fill-opacity="0.1" stroke-width="1.8" />
      <g fill="none" stroke-width="0.75" opacity="0.9">
        <polyline points="22,35 27,42 27,55 36,70" />
        <polyline points="65,75 75,62 75,50 82,45" />
      </g>
      <circle cx="36" cy="70" r="1.3" fill="url(#neonGrad)" stroke="none" />
      <circle cx="82" cy="45" r="1.3" fill="url(#neonGrad)" stroke="none" />
    </g>
  </svg>
</a>
