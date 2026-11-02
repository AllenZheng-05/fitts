// Copying text from the renderer: the Clipboard API when the document is focused and allowed,
// else the old `execCommand('copy')` path from a hidden textarea (it works from a click handler
// without the window having OS focus, which the Clipboard API needs). Resolves to whether the
// text was copied, so a "copied" toast is never a lie.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Not focused, or not allowed: the fallback below.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
