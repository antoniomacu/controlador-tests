import { useRegisterSW } from 'virtual:pwa-register/preact';

/** Always mounted (so the service worker registers once); hidden during a test. */
export function UpdatePrompt({ hidden }: { hidden: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh || hidden) return null;
  return (
    <div class="banner update" role="status">
      Actualización lista
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Recargar
      </button>
    </div>
  );
}
