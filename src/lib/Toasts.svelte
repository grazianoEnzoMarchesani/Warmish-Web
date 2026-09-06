<script lang="ts">
  import { toasts, dismiss } from './toast.svelte';
  import { t } from './i18n.svelte';
</script>

<div class="toasts" role="region" aria-label={t('toasts.region')}>
  {#each toasts as item (item.id)}
    <div class="toast {item.kind}" role={item.kind === 'error' ? 'alert' : 'status'}>
      <p class="msg">{item.message}</p>
      {#if item.progress}
        <progress value={item.progress.done} max={item.progress.total}></progress>
      {/if}
      {#if item.kind !== 'progress'}
        <button class="x" onclick={() => dismiss(item.id)} aria-label={t('toasts.dismiss')}>×</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed; right: 16px; bottom: 40px; z-index: 60;
    display: flex; flex-direction: column; gap: 8px;
    max-width: min(360px, calc(100vw - 32px));
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 8px 10px;
    padding: 10px 12px;
    background: var(--panel); border: 1px solid var(--line);
    border-left: 3px solid var(--muted);
    border-radius: var(--radius-sm); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    font-size: 12.5px; line-height: 1.4; color: var(--text);
  }
  .toast.success { border-left-color: #4caf7d; }
  .toast.error { border-left-color: #ff6b6b; }
  .toast.info { border-left-color: var(--focus); }
  .toast.progress { border-left-color: var(--accent); }
  .msg { margin: 0; }
  progress {
    grid-column: 1 / -1; width: 100%; height: 4px; border: 0; border-radius: 999px;
    accent-color: var(--accent); background: var(--line);
  }
  progress::-webkit-progress-bar { background: var(--line); border-radius: 999px; }
  progress::-webkit-progress-value { background: var(--accent); border-radius: 999px; }
  .x {
    background: transparent; border: 0; color: var(--muted); cursor: pointer;
    font-size: 15px; line-height: 1; padding: 0 2px;
  }
  .x:hover { color: var(--text); }
</style>
