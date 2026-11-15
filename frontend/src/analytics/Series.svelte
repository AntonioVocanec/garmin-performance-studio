<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 let {id,title,rows,series,unit}:{id:string;title:string;rows:Record<string,unknown>[];series:{key:string;label:string;color:string}[];unit:string}=$props();
 let ready=$state(false);let charts:typeof import('../lib/charts')|undefined;let host:HTMLElement;
 onMount(()=>{let disposed=false;void import('../lib/charts').then(c=>{if(!disposed){charts=c;ready=true}});return()=>{disposed=true}});
 onDestroy(()=>{if(host)charts?.disposeChartsInside(host)});
 $effect(()=>{if(ready)charts?.renderAnalyticsSeries(id,rows,series,unit,title)});
</script>
<div bind:this={host}><div {id} class="chart-wrap" aria-label={title}></div></div>
