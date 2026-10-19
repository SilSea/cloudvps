declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: Record<string, unknown>)
    scaleViewport: boolean
    resizeSession: boolean
    focusOnClick: boolean
    disconnect(): void
    sendCredentials(credentials: { username?: string; password?: string; target?: string }): void
  }
}
