export class TouchTestTool {
    constructor() {
        this.panel = null;
        this.events = [];
        this.listeners = [];
    }

    createUI() {
        if (this.panel) return this.panel;

        const panel = document.createElement('div');
        panel.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'width:280px',
            'max-height:360px',
            'overflow:auto',
            'padding:12px',
            'border-radius:12px',
            'border:1px solid rgba(255,255,255,.2)',
            'background:rgba(0,0,0,.78)',
            'color:white',
            'font:12px/1.4 system-ui,sans-serif',
            'box-shadow:0 12px 30px rgba(0,0,0,.35)',
        ].join(';');

        const title = document.createElement('div');
        title.textContent = 'Touch Test Tool';
        title.style.cssText = 'font-weight:700;margin-bottom:8px';

        const log = document.createElement('div');
        log.style.cssText = 'display:flex;flex-direction:column;gap:4px';

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.cssText = [
            'margin-top:10px',
            'width:100%',
            'border:0',
            'border-radius:8px',
            'padding:6px 8px',
            'background:rgba(255,255,255,.16)',
            'color:white',
            'cursor:pointer',
        ].join(';');
        closeButton.addEventListener('click', () => this.destroy());

        panel.append(title, log, closeButton);
        document.body.appendChild(panel);
        this.panel = panel;

        const record = (event) => {
            const point = event.touches?.[0] || event.changedTouches?.[0] || event;
            this.events.unshift({
                type: event.type,
                x: Math.round(point.clientX || 0),
                y: Math.round(point.clientY || 0),
                time: new Date().toLocaleTimeString(),
            });
            this.events = this.events.slice(0, 12);
            log.innerHTML = this.events
                .map(item => `<div>${item.time} ${item.type} (${item.x}, ${item.y})</div>`)
                .join('');
        };

        ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(type => {
            document.addEventListener(type, record, { passive: true });
            this.listeners.push({ type, record });
        });

        return panel;
    }

    destroy() {
        this.listeners.forEach(({ type, record }) => {
            document.removeEventListener(type, record);
        });
        this.listeners = [];
        this.panel?.remove();
        this.panel = null;
    }
}
