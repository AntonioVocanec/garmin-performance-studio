<script lang="ts">
  import { onMount } from "svelte";

  let offline = $state(false);

  onMount(() => {
    const updateConnection = () => (offline = !navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  });
</script>

{#if offline}
  <div class="connectivity" role="status" aria-live="polite">
    Izvan mreže · dostupno je samo sučelje; Garmin podaci i dnevnik ne spremaju se za izvanmrežni rad.
  </div>
{/if}

<style>
  .connectivity {
    max-width: 1500px;
    margin: 0 auto 12px;
    padding: 10px 14px;
    border: 1px solid #7d6130;
    border-radius: 10px;
    background: #2a2111;
    color: #f2ca71;
    font-size: 12px;
  }
</style>
