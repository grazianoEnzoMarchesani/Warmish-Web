<script lang="ts">
  import { dialog } from './dialog';
  import { t } from './i18n.svelte';

  let { onclose }: { onclose: () => void } = $props();

  // [translation key for the key-combo, translation key for the description]
  const shortcuts: [string, string][] = [
    ['help.keyPrevNext', 'help.scPrevNext'],
    ['help.keyFilmstrip', 'help.scFilmstrip'],
    ['help.keyMap', 'help.scMap'],
    ['help.keyWheel', 'help.scWheel'],
    ['help.keyDrag', 'help.scDrag'],
    ['help.keyEsc', 'help.scEsc'],
    ['help.keyDelete', 'help.scDelete'],
    ['help.keyClosePoly', 'help.scClosePoly'],
  ];

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop">
  <button type="button" class="scrim" aria-label={t('help.close')} onclick={onclose}></button>
  <div class="modal" role="dialog" aria-modal="true" aria-label={t('help.title')} tabindex="-1" use:dialog>
    <header>
      <h2>{t('help.title')}</h2>
      <button class="x" onclick={onclose} aria-label={t('help.close')}>×</button>
    </header>
    <div class="body">
      <h3>{t('help.whatTitle')}</h3>
      <p>{t('help.whatBody')}</p>

      <h3>{t('help.shortcutsTitle')}</h3>
      <table>
        <tbody>
          {#each shortcuts as [keyK, whatK] (keyK)}
            <tr><th>{t(keyK)}</th><td>{t(whatK)}</td></tr>
          {/each}
        </tbody>
      </table>

      <h3>{t('help.exportTitle')}</h3>
      <p>{t('help.exportBody1')}</p>
      <p>{t('help.exportBody2')}</p>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 50;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .scrim {
    position: absolute; inset: 0; border: 0; border-radius: 0; padding: 0;
    background: rgba(0, 0, 0, 0.6); cursor: default;
  }
  .modal {
    position: relative;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    width: min(520px, 100%); max-height: 100%; display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  header {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 14px 16px; border-bottom: 1px solid var(--line);
  }
  h2 { font-size: 14px; margin: 0; }
  .x { padding: 2px 9px; font-size: 17px; line-height: 1; }
  .body { padding: 12px 16px 16px; overflow-y: auto; }
  h3 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted);
    margin: 16px 0 6px;
  }
  h3:first-child { margin-top: 0; }
  p { margin: 0; font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  tr { border-bottom: 1px solid var(--line); }
  th {
    text-align: left; font-weight: 400; color: var(--accent); padding: 6px 14px 6px 0;
    white-space: nowrap; vertical-align: top; font-variant-numeric: tabular-nums;
  }
  td { padding: 6px 0; color: var(--text); }
</style>
