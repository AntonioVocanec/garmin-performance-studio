<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 let {runs}:{runs:{name:string;trace?:Record<string,unknown>[]}[]}=$props();let metric=$state('heartRate');let host:HTMLElement;let ready=$state(false);let charts:typeof import('../lib/charts')|undefined;
 onMount(()=>{let disposed=false;void import('../lib/charts').then(c=>{if(!disposed){charts=c;ready=true}});return()=>{disposed=true}});onDestroy(()=>{if(host)charts?.disposeChartsInside(host)});
 $effect(()=>{if(ready)charts?.renderRunningOverlay('running-comparison-chart',runs,metric)});
</script>
<div bind:this={host}><label class="analytics-controls">Preklapanje po vremenu<select aria-label="Metrika usporedbe trčanja" bind:value={metric}><option value="heartRate">Puls · bpm</option><option value="paceSecondsPerKm">Tempo · s/km</option></select></label><div id="running-comparison-chart" class="chart-wrap"></div><details><summary>Uzorci vremenskih nizova</summary><div class="analytics-table"><table><thead><tr><th>Aktivnost</th><th>Vrijeme · s</th><th>Puls · bpm</th><th>Tempo · s/km</th></tr></thead><tbody>{#each runs as r}{#each r.trace??[] as p}<tr><td>{r.name}</td><td>{p.elapsedSeconds??'—'}</td><td>{p.heartRate??'—'}</td><td>{p.paceSecondsPerKm??'—'}</td></tr>{/each}{/each}</tbody></table></div></details></div>
