/**
 * Nomenclador de Calles y Barrios — Cara pública
 * Lógica de búsqueda, renderizado y navegación
 */

// ──────────────────────────────────────────────
// Estado global
// ──────────────────────────────────────────────

const LIMITE = 50;

const estado = {
    tab:    'calles',   // 'calles' | 'barrios'
    zona:   '',         // '' | 'Norte' | 'Sur' | 'Sin zona'
    offset: { calles: 0, barrios: 0 },
    total:  { calles: 0, barrios: 0 },
    cargando: false
};

// ──────────────────────────────────────────────
// Debounce
// ──────────────────────────────────────────────

let _debounceTimer = null;

function buscarConDelay() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => buscar(false), 300);
}

// ──────────────────────────────────────────────
// Búsqueda principal
// ──────────────────────────────────────────────

async function buscar(append = false) {
    if (estado.cargando) return;
    estado.cargando = true;

    const tab = estado.tab;
    const q   = document.getElementById(`input-${tab}`).value.trim();

    if (!append) {
        estado.offset[tab] = 0;
        mostrarSkeleton(tab);
    } else {
        document.getElementById(`mas-${tab}`).disabled = true;
        document.getElementById(`mas-${tab}`).textContent = 'Cargando...';
    }

    try {
        let url = `/api/public/${tab}?limit=${LIMITE}&offset=${estado.offset[tab]}`;
        if (q)                              url += `&q=${encodeURIComponent(q)}`;
        if (tab === 'barrios' && estado.zona) url += `&zona=${encodeURIComponent(estado.zona)}`;

        const res  = await fetch(url);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error al consultar la API');

        estado.total[tab]   = data.total;
        estado.offset[tab] += data.data.length;

        if (!append) ocultarSkeleton(tab);

        if (tab === 'calles') renderCalles(data.data, append);
        else                  renderBarrios(data.data, append);

        actualizarContador(tab, data.total);
        actualizarBotonMas(tab, data);

    } catch (err) {
        console.error('✗ Error en búsqueda:', err);
        if (!append) ocultarSkeleton(tab);
        mostrarEstadoVacio(tab, '⚠ Error al cargar resultados. Intente nuevamente.');
    } finally {
        estado.cargando = false;
        if (append) {
            const btn = document.getElementById(`mas-${tab}`);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Cargar más resultados';
            }
        }
    }
}

function cargarMas() {
    buscar(true);
}

// ──────────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────────

function iniciarTabs() {
    const indicador = document.querySelector('.tab-indicator');

    function moverIndicador(btn) {
        if (!indicador) return;
        indicador.style.left  = btn.offsetLeft + 'px';
        indicador.style.width = btn.offsetWidth + 'px';
    }

    // Posición inicial sin transición
    const tabActiva = document.querySelector('.tab.active');
    if (tabActiva && indicador) {
        indicador.style.transition = 'none';
        moverIndicador(tabActiva);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { indicador.style.transition = ''; });
        });
    }

    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab === estado.tab) return;

            // Desactivar tab anterior
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('[role="tabpanel"]').forEach(p => { p.hidden = true; });

            // Activar nuevo tab
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            document.getElementById(`panel-${tab}`).hidden = false;

            moverIndicador(btn);
            estado.tab = tab;

            // Resetear input y dar foco
            const input = document.getElementById(`input-${tab}`);
            input.value = '';
            input.focus();

            // Buscar con el tab nuevo
            buscar(false);
        });
    });
}

// ──────────────────────────────────────────────
// Filtros de zona (solo barrios)
// ──────────────────────────────────────────────

function filtrarZona(btn) {
    document.querySelectorAll('.filtro-zona').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    estado.zona = btn.dataset.zona;
    buscar(false);
}

// ──────────────────────────────────────────────
// Render: Calles
// ──────────────────────────────────────────────

const SVG_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
</svg>`;

const SVG_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
</svg>`;

const SVG_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12"/>
</svg>`;

function renderCalles(items, append) {
    const lista = document.getElementById('lista-calles');
    const vacio = document.getElementById('vacio-calles');

    if (!append) lista.innerHTML = '';

    if (items.length === 0 && !append) {
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;

    items.forEach((calle, index) => {
        const tieneOC   = calle.orden_carga !== null && calle.orden_carga !== undefined;
        const badgeHTML = tieneOC
            ? `<div class="badge-oc">${calle.orden_carga}</div>`
            : `<div class="badge-oc sin-oc" aria-label="Sin orden de carga">—</div>`;

        const btnOC = tieneOC
            ? `<button class="btn-copiar"
                       aria-label="Copiar orden de carga ${calle.orden_carga}"
                       onclick="copiar(${JSON.stringify(String(calle.orden_carga))}, this)">
                   ${SVG_COPY} ${calle.orden_carga}
               </button>`
            : '';

        const nombreEsc = escHTML(calle.nombre_calle);
        const obs       = calle.observacion_calle ? `<div class="tarjeta-observacion">${escHTML(calle.observacion_calle)}</div>` : '';

        const article = document.createElement('article');
        article.className = 'tarjeta-calle';
        article.innerHTML = `
            ${badgeHTML}
            <div class="tarjeta-info">
                <div class="tarjeta-nombre">${nombreEsc}</div>
                ${obs}
            </div>
            <div class="tarjeta-acciones">
                ${btnOC}
                <button class="btn-copiar"
                        aria-label="Copiar nombre ${nombreEsc}"
                        onclick="copiar(${JSON.stringify(calle.nombre_calle)}, this)">
                    ${SVG_COPY} nombre
                </button>
            </div>`;

        article.style.animationDelay = `${append ? 0 : Math.min(index * 30, 240)}ms`;
        lista.appendChild(article);
    });
}

// ──────────────────────────────────────────────
// Render: Barrios
// ──────────────────────────────────────────────

const ZONA_CLASS = { 'Norte': 'norte', 'Sur': 'sur', 'Sin zona': 'sin' };

function renderBarrios(items, append) {
    const lista = document.getElementById('lista-barrios');
    const vacio = document.getElementById('vacio-barrios');

    if (!append) lista.innerHTML = '';

    if (items.length === 0 && !append) {
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;

    items.forEach((barrio, index) => {
        const zonaClass = ZONA_CLASS[barrio.zona_barrio] || 'sin';
        const tieneNorma = barrio.ordenanza_barrio || barrio.resolucion_barrio;

        let metaHTML;
        if (tieneNorma) {
            const parts = [];
            if (barrio.ordenanza_barrio)  parts.push(`Ordenanza <strong>${escHTML(barrio.ordenanza_barrio)}</strong>`);
            if (barrio.resolucion_barrio) parts.push(`Resolución <strong>${escHTML(barrio.resolucion_barrio)}</strong>`);
            metaHTML = parts.map(p => `<span>${p}</span>`).join('');
        } else {
            metaHTML = `<span class="tarjeta-barrio-sin-norma">Sin ordenanza registrada</span>`;
        }

        const article = document.createElement('article');
        article.className = 'tarjeta-barrio';
        article.innerHTML = `
            <div class="tarjeta-barrio-header">
                <div class="tarjeta-barrio-nombre">${escHTML(barrio.nombre_barrio)}</div>
                <span class="badge-zona ${zonaClass}">${escHTML(barrio.zona_barrio)}</span>
            </div>
            <div class="tarjeta-barrio-meta">${metaHTML}</div>`;

        article.style.animationDelay = `${append ? 0 : Math.min(index * 30, 240)}ms`;
        lista.appendChild(article);
    });
}

// ──────────────────────────────────────────────
// Skeleton loading
// ──────────────────────────────────────────────

function tarjetaSkeletonHTML() {
    return `<div class="tarjeta-skeleton">
        <div class="skeleton-line skeleton-badge"></div>
        <div class="skeleton-body">
            <div class="skeleton-line skeleton-nombre"></div>
            <div class="skeleton-line skeleton-obs"></div>
        </div>
    </div>`;
}

function mostrarSkeleton(tab) {
    document.getElementById(`lista-${tab}`).innerHTML = Array(5).fill(tarjetaSkeletonHTML()).join('');
    document.getElementById(`vacio-${tab}`).hidden  = true;
    document.getElementById(`mas-${tab}`).hidden    = true;
    document.getElementById(`contador-${tab}`).textContent = '';
}

function ocultarSkeleton(tab) {
    document.getElementById(`lista-${tab}`).innerHTML = '';
}

// ──────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────

function actualizarContador(tab, total) {
    const el = document.getElementById(`contador-${tab}`);
    if (total === 0) {
        el.textContent = 'Sin resultados';
    } else {
        const cargados = estado.offset[tab];
        el.textContent = cargados < total
            ? `${cargados} de ${total} resultado${total !== 1 ? 's' : ''}`
            : `${total} resultado${total !== 1 ? 's' : ''}`;
    }
}

function actualizarBotonMas(tab, data) {
    const btn = document.getElementById(`mas-${tab}`);
    const hayMas = estado.offset[tab] < data.total;
    btn.hidden = !hayMas;
}

function mostrarEstadoVacio(tab, mensaje) {
    const vacio = document.getElementById(`vacio-${tab}`);
    vacio.querySelector('p').textContent = mensaje;
    vacio.hidden = false;
}

function escHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────
// Copiar al portapapeles
// ──────────────────────────────────────────────

let _toastTimer = null;

async function copiar(texto, btn) {
    const ok = await copiarTexto(String(texto));
    if (ok) {
        feedbackBoton(btn, 'ok');
        mostrarToast('Copiado al portapapeles');
    } else {
        feedbackBoton(btn, 'error');
        mostrarToast('No se pudo copiar. Seleccioná y copiá manualmente.');
    }
}

async function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch (e) {
            console.warn('Clipboard API falló, usando fallback:', e);
        }
    }
    return copiarConExecCommand(texto);
}

function copiarConExecCommand(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
}

function feedbackBoton(btn, tipo) {
    const originalHTML = btn.innerHTML;
    if (tipo === 'ok') {
        btn.classList.add('copiado');
        btn.innerHTML = `${SVG_CHECK} copiado`;
        setTimeout(() => { btn.classList.remove('copiado'); btn.innerHTML = originalHTML; }, 1500);
    } else {
        btn.classList.add('error');
        btn.innerHTML = `${SVG_X} error`;
        setTimeout(() => { btn.classList.remove('error'); btn.innerHTML = originalHTML; }, 2000);
    }
}

function mostrarToast(mensaje) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-texto').textContent = mensaje;

    // Reiniciar animación de entrada aunque el toast ya esté visible
    toast.classList.remove('visible');
    void toast.offsetWidth;
    toast.classList.add('visible');

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

// ──────────────────────────────────────────────
// Stats del footer
// ──────────────────────────────────────────────

async function cargarStats() {
    try {
        const res  = await fetch('/api/public/stats');
        const data = await res.json();
        document.getElementById('footer-stats').textContent =
            `${data.calles.toLocaleString('es-AR')} calles · ${data.barrios} barrios`;
    } catch {
        document.getElementById('footer-stats').textContent = '';
    }
}

// ──────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    iniciarTabs();
    buscar(false);
    cargarStats();
});
