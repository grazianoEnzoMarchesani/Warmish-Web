<script lang="ts">
  /**
   * Global map-tile consent banner. Shown on every startup until consent is
   * granted; "Not now" records a refusal and hides it for the session, but it
   * returns on the next load. Once granted it stops showing — the choice is then
   * recovered from the "Privacy" button in the top bar (opens the privacy notice,
   * which carries the enable/disable toggle).
   *
   * Non-blocking: a card pinned bottom-left, the rest of the app stays usable.
   * The in-map gate (`MapView.svelte`) covers the same ground when you are
   * actually in map view, so this hides itself there (`suppressed`).
   */
  import { t } from './i18n.svelte';
  import { mapTilesAllowed, setMapConsent } from './consent.svelte';

  let { onshowprivacy, suppressed = false }: {
    onshowprivacy: () => void;
    suppressed?: boolean;
  } = $props();

  // Resets on reload — "next startup" is a fresh page load.
  let dismissed = $state(false);

  const showBanner = $derived(!mapTilesAllowed() && !dismissed && !suppressed);

  function accept() { setMapConsent('granted'); }
  function decline() { setMapConsent('denied'); dismissed = true; }
</script>

{#if showBanner}
  <div class="banner" role="region" aria-label={t('map.consentTitle')}>
    <div class="head">
      <strong>{t('map.consentTitle')}</strong>
      <button class="x" onclick={decline} aria-label={t('map.consentClose')} title={t('map.consentClose')}>×</button>
    </div>
    <p>{t('map.consentBody')}</p>
    <div class="actions">
      <button class="primary" onclick={accept}>{t('map.consentAccept')}</button>
      <button onclick={decline}>{t('map.consentDecline')}</button>
    </div>
    <button class="link" onclick={onshowprivacy}>{t('map.consentPrivacyLink')}</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed; left: 12px; bottom: 12px; z-index: 40;
    width: min(380px, calc(100vw - 24px));
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px;
    background: var(--panel); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    animation: bannerin 0.28s ease both;
  }
  @keyframes bannerin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .banner { animation: none; } }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .head strong { font-size: 12.5px; }
  .x {
    flex: none; padding: 0 6px; font-size: 16px; line-height: 1;
    background: none; border: 0; color: var(--muted); cursor: pointer;
  }
  .x:hover { color: var(--text); }

  .banner p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); }

  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
  .actions button {
    padding: 6px 12px; font-size: 12px;
    background: var(--input-bg); color: var(--text);
    border: 1px solid var(--line); border-radius: 7px; cursor: pointer;
  }
  .actions button:hover { border-color: var(--accent); }
  .actions button.primary {
    background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-weight: 600;
  }

  .link {
    align-self: flex-start; padding: 0;
    background: none; border: 0; cursor: pointer;
    font-size: 11px; color: var(--accent); text-decoration: underline; text-underline-offset: 2px;
  }
</style>
