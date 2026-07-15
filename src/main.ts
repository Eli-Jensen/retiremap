// If the page loads in a hidden tab (opened in background, embedded
// preview), requestAnimationFrame never fires and MapLibre's render loop —
// tile loading, resizing, everything — stalls until the tab is focused.
// Fall back to timer-driven frames while hidden; native rAF when visible.
{
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const timerIds = new Set<number>();
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    if (!document.hidden) return nativeRaf(cb);
    const id = window.setTimeout(() => {
      timerIds.delete(id);
      cb(performance.now());
    }, 33);
    timerIds.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    if (timerIds.delete(id)) window.clearTimeout(id);
    else nativeCancel(id);
  };
}

import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
