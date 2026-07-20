<script>
  import { sparkPoints } from './format.js';

  let { spark, w = 64, h = 18 } = $props();
  const d = $derived(sparkPoints(spark, w, h));
</script>

{#if d}
  <svg width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true"><polyline
      points={d.pts}
      fill="none"
      stroke={d.up ? '#089981' : '#f23645'}
      stroke-width="1.2" /></svg>
{/if}
