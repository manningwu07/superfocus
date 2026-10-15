export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node: HTMLElementTagNameMap[K] = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

interface HTMLElementConstructor<T extends HTMLElement> {
  new (): T;
}

export function requireElement<T extends HTMLElement>(
  selector: string,
  expected: HTMLElementConstructor<T>,
): T {
  const node: Element | null = document.querySelector(selector);
  if (!(node instanceof expected)) {
    throw new Error(`Missing required ${expected.name}: ${selector}`);
  }
  return node;
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

export function formatTime(value: string): string {
  const date: Date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return formatter.format(date);
}

export function isExtensionPage(): boolean {
  return typeof chrome !== "undefined" && chrome.runtime?.id !== undefined;
}

export async function openSettings(): Promise<void> {
  if (isExtensionPage()) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  window.location.assign("/");
}
