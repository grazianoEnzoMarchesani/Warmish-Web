<script lang="ts">
  import { dialog } from './dialog';
  import { t, getLocale } from './i18n.svelte';
  import { PRIVACY_UPDATED, privacySections } from './privacy';
  import { mapConsent, setMapConsent } from './consent.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const sections = $derived(privacySections(getLocale()));
  const updated = $derived(PRIVACY_UPDATED[getLocale()]);
  const tilesOn = $derived(mapConsent() === 'granted');

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop">
  <button type="button" class="scrim" aria-label={t('privacy.close')} onclick={onclose}></button>
  <div class="modal" role="dialog" aria-modal="true" aria-label={t('privacy.title')} tabindex="-1" use:dialog>
    <header>
      <h2>{t('privacy.title')}</h2>
      <button class="x" onclick={onclose} aria-label={t('privacy.close')}>×</button>
    </header>
    <div class="body">
      <p class="updated">{t('privacy.updated', { date: updated })}</p>

      <section class="prefs">
        <h3>{t('privacy.prefsTitle')}</h3>
        <div class="prefs-row">
          <span class="state" class:on={tilesOn}>
            {tilesOn ? t('privacy.prefsMapOn') : t('privacy.prefsMapOff')}
          </span>
          {#if tilesOn}
            <button type="button" onclick={() => setMapConsent('denied')}>{t('privacy.prefsDisable')}</button>
          {:else}
            <button type="button" class="primary" onclick={() => setMapConsent('granted')}>{t('privacy.prefsEnable')}</button>
          {/if}
        </div>
      </section>

      {#each sections as s (s.id)}
        <h3>{s.title}</h3>
        {#each s.body as html}
          <div class="rich">{@html html}</div>
        {/each}
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .scrim {
    position: absolute; inset: 0; border: 0; border-radius: 0; padding: 0;
    background: rgba(0, 0, 0, 0.6); cursor: default;
  }
  .modal {
    position: relative;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    width: min(600px, 100%); max-height: 100%; display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  header {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 14px 16px; border-bottom: 1px solid var(--line);
  }
  h2 { font-size: 14px; margin: 0; }
  .x { padding: 2px 9px; font-size: 17px; line-height: 1; }
  .body { padding: 12px 16px 16px; overflow-y: auto; }

  .updated { margin: 0 0 12px; font-size: 11.5px; color: var(--muted); }

  .prefs {
    border: 1px solid var(--line); border-radius: 8px;
    padding: 10px 12px; margin-bottom: 16px; background: var(--bg);
  }
  .prefs h3 { margin: 0 0 8px; }
  .prefs-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .state { font-size: 12.5px; color: var(--muted); }
  .state.on { color: var(--text); }
  .prefs-row button {
    padding: 5px 12px; font-size: 12px;
    background: var(--input-bg); color: var(--text);
    border: 1px solid var(--line); border-radius: 6px; cursor: pointer;
  }
  .prefs-row button:hover { border-color: var(--accent); }
  .prefs-row button.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }

  h3 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted);
    margin: 18px 0 6px;
  }
  .rich :global(p) { margin: 0 0 8px; font-size: 13px; line-height: 1.55; }
  .rich :global(h3) {
    font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--text);
    margin: 12px 0 5px; font-weight: 600;
  }
  .rich :global(ul) { margin: 0 0 8px; padding-left: 18px; font-size: 13px; line-height: 1.55; }
  .rich :global(li) { margin: 2px 0; }
  .rich :global(a) { color: var(--accent); }
  .rich :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
    background: var(--input-bg); padding: 1px 4px; border-radius: 3px;
  }
  .rich :global(.privacy-table) { overflow-x: auto; margin: 0 0 8px; }
  .rich :global(table) { width: 100%; border-collapse: collapse; font-size: 12px; }
  .rich :global(th), .rich :global(td) {
    text-align: left; padding: 6px 8px; border: 1px solid var(--line); vertical-align: top;
  }
  .rich :global(th) { color: var(--muted); font-weight: 600; }
</style>
