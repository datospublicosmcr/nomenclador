/**
 * Nomenclador — Módulo de Barrios (Admin)
 */

// ──────────────────────────────────────────────
// Estado
// ──────────────────────────────────────────────

const State = {
    barrios:       [],
    paginacion:    { total: 0, pagina: 1, limite: 25, totalPaginas: 0 },
    buscar:        '',
    zona:          '',
    buscarTimer:   null,
    barrioActual:  null,   // objeto completo del barrio seleccionado
    modo:          null,   // 'ver' | 'editar' | 'nuevo'
    guardando:     false,
    eliminandoId:  null,
    puedoEditar:   false
};

const ZONAS_BADGE = {
    'Norte':    'norte',
    'Sur':      'sur',
    'Sin zona': 'sin-zona'
};

// ──────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await checkAuth();
    if (!ok) return;

    actualizarHeaderUsuario();

    if (!hasPermission('barrios', 'ver')) {
        document.querySelector('.modulo-container').innerHTML =
            '<div style="padding:40px;color:var(--danger)">Sin permiso para ver este módulo.</div>';
        return;
    }

    State.puedoEditar = hasPermission('barrios', 'editar');

    if (!State.puedoEditar) {
        document.getElementById('btnNuevoBarrio').hidden = true;
        document.getElementById('btnImportar').hidden    = true;
    }

    await cargarBarrios();

    document.addEventListener('click', e => {
        if (!e.target.closest('#dropdownExportar')) cerrarDropdowns();
    });
});

// ──────────────────────────────────────────────
// Carga de datos
// ──────────────────────────────────────────────

async function cargarBarrios() {
    try {
        const params = new URLSearchParams({
            pagina: State.paginacion.pagina,
            limite: State.paginacion.limite
        });
        if (State.buscar) params.set('buscar', State.buscar);
        if (State.zona)   params.set('zona',   State.zona);

        const data = await api(`/barrios?${params}`);
        State.barrios    = data.data;
        State.paginacion = data.paginacion;

        renderizarLista();
        renderizarPaginacion();
        actualizarTotalInfo();
    } catch (err) {
        showToast(err.message || 'Error al cargar barrios', 'error');
    }
}

// ──────────────────────────────────────────────
// Render: lista
// ──────────────────────────────────────────────

function renderizarLista() {
    const container = document.getElementById('listaBarrios');

    if (State.barrios.length === 0) {
        container.innerHTML = `
            <div style="padding:32px;text-align:center;color:var(--gray-400);font-size:0.88rem">
                ${State.buscar || State.zona ? 'Sin resultados para los filtros aplicados.' : 'No hay barrios cargados.'}
            </div>`;
        return;
    }

    container.innerHTML = State.barrios.map(b => {
        const activo    = State.barrioActual && State.barrioActual.id_barrio === b.id_barrio;
        const badgeClass = ZONAS_BADGE[b.zona_barrio] || 'sin-zona';
        return `
        <div class="lista-item${activo ? ' active' : ''}"
             onclick="seleccionarBarrio(${b.id_barrio})"
             role="listitem"
             tabindex="0"
             onkeydown="if(event.key==='Enter')seleccionarBarrio(${b.id_barrio})"
             aria-label="${escapeHtml(b.nombre_barrio)}">
            <div class="lista-item-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
            </div>
            <div class="lista-item-body">
                <div class="lista-item-nombre">${escapeHtml(b.nombre_barrio)}</div>
                <div class="lista-item-meta">ID ${b.id_barrio}</div>
            </div>
            <span class="zona-badge ${badgeClass}">${escapeHtml(b.zona_barrio)}</span>
        </div>`;
    }).join('');
}

// ──────────────────────────────────────────────
// Render: paginación
// ──────────────────────────────────────────────

function renderizarPaginacion() {
    const { pagina, totalPaginas } = State.paginacion;
    const el = document.getElementById('paginacion');

    if (totalPaginas <= 1) { el.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="cambiarPagina(${pagina - 1})" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>`;

    const delta = 2;
    let pages = new Set([1, totalPaginas]);
    for (let i = Math.max(1, pagina - delta); i <= Math.min(totalPaginas, pagina + delta); i++) pages.add(i);
    const sorted = [...pages].sort((a, b) => a - b);

    let prev = 0;
    for (const p of sorted) {
        if (p - prev > 1) html += `<span class="page-btn" style="cursor:default;border:none">…</span>`;
        html += `<button class="page-btn${p === pagina ? ' active' : ''}" onclick="cambiarPagina(${p})" aria-label="Página ${p}" ${p === pagina ? 'aria-current="page"' : ''}>${p}</button>`;
        prev = p;
    }

    html += `<button class="page-btn" onclick="cambiarPagina(${pagina + 1})" ${pagina === totalPaginas ? 'disabled' : ''} aria-label="Siguiente">›</button>`;
    el.innerHTML = html;
}

function actualizarTotalInfo() {
    const { total } = State.paginacion;
    document.getElementById('totalBarrios').textContent =
        total === 0 ? 'Sin resultados'
        : total === 1 ? '1 barrio'
        : `${total.toLocaleString('es-AR')} barrios`;
}

// ──────────────────────────────────────────────
// Selección / detalle
// ──────────────────────────────────────────────

async function seleccionarBarrio(id) {
    if (State.modo === 'nuevo' || State.modo === 'editar') {
        if (!confirm('¿Descartar cambios sin guardar?')) return;
    }
    try {
        const barrio = await api(`/barrios/${id}`);
        State.barrioActual = barrio;
        State.modo = 'ver';
        renderizarLista();
        mostrarDetalle();
    } catch (err) {
        showToast(err.message || 'Error al cargar el barrio', 'error');
    }
}

function mostrarDetalle() {
    document.getElementById('detalleVacio').hidden     = true;
    document.getElementById('detalleContenido').hidden = false;

    const b    = State.barrioActual;
    const modo = State.modo;

    // Badge y título
    const badge = document.getElementById('badgeModo');
    if (modo === 'ver') {
        badge.textContent = 'Visualización';
        badge.className   = 'badge-modo visualizacion';
    } else if (modo === 'editar') {
        badge.textContent = 'Edición';
        badge.className   = 'badge-modo edicion';
    } else {
        badge.textContent = 'Nuevo barrio';
        badge.className   = 'badge-modo creacion';
    }

    document.getElementById('detalleTitulo').textContent = modo === 'nuevo' ? 'Nuevo Barrio' : (b ? b.nombre_barrio : '—');

    // Campos
    const readonly = modo === 'ver';
    const inputId  = document.getElementById('inputIdBarrio');
    const inputNom = document.getElementById('inputNombreBarrio');
    const selZona  = document.getElementById('selectZona');
    const inputOrd = document.getElementById('inputOrdenanza');
    const inputRes = document.getElementById('inputResolucion');
    const inputObs = document.getElementById('inputObservaciones');

    // id_barrio: editable solo en creación
    inputId.readOnly  = modo !== 'nuevo';
    inputNom.readOnly = readonly;
    selZona.disabled  = readonly;
    inputOrd.readOnly = readonly;
    inputRes.readOnly = readonly;
    inputObs.readOnly = readonly;

    inputId.value  = b ? b.id_barrio  : '';
    inputNom.value = b ? (b.nombre_barrio        || '') : '';
    inputOrd.value = b ? (b.ordenanza_barrio      || '') : '';
    inputRes.value = b ? (b.resolucion_barrio     || '') : '';
    inputObs.value = b ? (b.observaciones_barrio  || '') : '';

    selZona.value = b ? (b.zona_barrio || '') : '';

    // Hint del id
    document.getElementById('hintId').textContent = modo === 'editar'
        ? 'El ID no puede modificarse una vez creado'
        : 'Número único de identificación del barrio';

    // Metadata
    const secMeta = document.getElementById('seccionMeta');
    if (modo === 'nuevo') {
        secMeta.hidden = true;
    } else {
        secMeta.hidden = false;
        document.getElementById('metaCreado').textContent        = b ? formatDate(b.created_at)  : '—';
        document.getElementById('metaCreadoPor').textContent     = b ? (b.created_by  || '—')    : '—';
        document.getElementById('metaModificado').textContent    = b ? formatDate(b.updated_at)  : '—';
        document.getElementById('metaModificadoPor').textContent = b ? (b.updated_by  || '—')    : '—';
    }

    renderizarAcciones();
}

function renderizarAcciones() {
    const header = document.getElementById('detalleAcciones');
    const footer = document.getElementById('detalleFooter');
    const modo   = State.modo;

    if (modo === 'ver') {
        header.innerHTML = State.puedoEditar ? `
            <button class="btn btn-danger btn-sm" onclick="confirmarEliminarBarrio()">Eliminar</button>
            <button class="btn btn-primary btn-sm" onclick="editarBarrio()"
                    style="background:var(--barrio);border-color:var(--barrio)">Editar</button>` : '';
        footer.innerHTML = '';
    } else {
        header.innerHTML = '';
        footer.innerHTML = `
            <button class="btn btn-secondary" onclick="cancelarEdicion()">Cancelar</button>
            <button class="btn btn-primary" onclick="guardarBarrio()" id="btnGuardar"
                    style="background:var(--barrio);border-color:var(--barrio)">Guardar</button>`;
    }
}

// ──────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────

function nuevoBarrio() {
    if (!State.puedoEditar) return;
    State.barrioActual = null;
    State.modo = 'nuevo';
    renderizarLista();
    mostrarDetalle();
    document.getElementById('inputIdBarrio').focus();
}

function editarBarrio() {
    State.modo = 'editar';
    mostrarDetalle();
    document.getElementById('inputNombreBarrio').focus();
}

function cancelarEdicion() {
    if (State.modo === 'nuevo') {
        State.modo = null;
        State.barrioActual = null;
        document.getElementById('detalleVacio').hidden     = false;
        document.getElementById('detalleContenido').hidden = true;
        renderizarLista();
    } else {
        State.modo = 'ver';
        mostrarDetalle();
    }
}

async function guardarBarrio() {
    if (State.guardando) return;

    const idRaw   = document.getElementById('inputIdBarrio').value.trim();
    const nombre  = document.getElementById('inputNombreBarrio').value.trim();
    const zona    = document.getElementById('selectZona').value;
    const ord     = document.getElementById('inputOrdenanza').value.trim();
    const res     = document.getElementById('inputResolucion').value.trim();
    const obs     = document.getElementById('inputObservaciones').value.trim();

    // Validaciones
    if (State.modo === 'nuevo') {
        const idNum = parseInt(idRaw, 10);
        if (!idRaw || isNaN(idNum) || idNum <= 0) {
            showToast('El ID del barrio es requerido y debe ser un entero positivo', 'error');
            document.getElementById('inputIdBarrio').focus();
            return;
        }
    }

    if (!nombre) {
        showToast('El nombre del barrio es requerido', 'error');
        document.getElementById('inputNombreBarrio').focus();
        return;
    }

    if (!zona) {
        showToast('Debe seleccionar una zona', 'error');
        document.getElementById('selectZona').focus();
        return;
    }

    const body = {
        nombre_barrio:        nombre,
        zona_barrio:          zona,
        ordenanza_barrio:     ord  || null,
        resolucion_barrio:    res  || null,
        observaciones_barrio: obs  || null
    };
    if (State.modo === 'nuevo') body.id_barrio = parseInt(idRaw, 10);

    State.guardando = true;
    const btn = document.getElementById('btnGuardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    try {
        if (State.modo === 'nuevo') {
            const resp = await api('/barrios', { method: 'POST', body: JSON.stringify(body) });
            showToast('Barrio creado correctamente', 'success');
            State.paginacion.pagina = 1;
            await cargarBarrios();
            if (resp.id_barrio) await seleccionarBarrio(resp.id_barrio);
        } else {
            await api(`/barrios/${State.barrioActual.id_barrio}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Barrio actualizado correctamente', 'success');
            await cargarBarrios();
            await seleccionarBarrio(State.barrioActual.id_barrio);
        }
    } catch (err) {
        showToast(err.message || 'Error al guardar', 'error');
        State.guardando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    } finally {
        State.guardando = false;
    }
}

function confirmarEliminarBarrio() {
    if (!State.barrioActual || !State.puedoEditar) return;
    State.eliminandoId = State.barrioActual.id_barrio;
    document.getElementById('modalEliminarMsg').textContent =
        `¿Eliminar el barrio "${State.barrioActual.nombre_barrio}" (ID ${State.barrioActual.id_barrio})? Esta acción es reversible desde la base de datos.`;
    openModal('modalEliminar');
}

async function confirmarEliminar() {
    if (!State.eliminandoId) return;
    const btn = document.getElementById('btnConfirmarEliminar');
    btn.disabled    = true;
    btn.textContent = 'Eliminando…';
    try {
        await api(`/barrios/${State.eliminandoId}`, { method: 'DELETE' });
        closeModal('modalEliminar');
        showToast('Barrio eliminado correctamente', 'success');
        State.barrioActual = null;
        State.eliminandoId = null;
        State.modo         = null;
        document.getElementById('detalleVacio').hidden     = false;
        document.getElementById('detalleContenido').hidden = true;
        State.paginacion.pagina = 1;
        await cargarBarrios();
    } catch (err) {
        showToast(err.message || 'Error al eliminar', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Eliminar';
    }
}

// ──────────────────────────────────────────────
// Búsqueda, zona y paginación
// ──────────────────────────────────────────────

function buscarConDelay() {
    clearTimeout(State.buscarTimer);
    State.buscarTimer = setTimeout(() => {
        State.buscar = document.getElementById('inputBuscar').value.trim();
        State.paginacion.pagina = 1;
        cargarBarrios();
    }, 350);
}

function filtrarZona(btn) {
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.zona = btn.dataset.zona;
    State.paginacion.pagina = 1;
    cargarBarrios();
}

function cambiarPagina(pagina) {
    if (pagina < 1 || pagina > State.paginacion.totalPaginas) return;
    State.paginacion.pagina = pagina;
    cargarBarrios();
}

// ──────────────────────────────────────────────
// Exportación
// ──────────────────────────────────────────────

async function exportarCSV() {
    cerrarDropdowns();
    try {
        const data = await api('/barrios/exportar');
        const rows = data.data;
        if (!rows.length) { showToast('No hay barrios para exportar', 'info'); return; }

        const header = 'id_barrio,zona_barrio,nombre_barrio,ordenanza_barrio,resolucion_barrio,observaciones_barrio';
        const lines  = rows.map(r =>
            [r.id_barrio, r.zona_barrio, r.nombre_barrio,
             r.ordenanza_barrio ?? '', r.resolucion_barrio ?? '', r.observaciones_barrio ?? '']
                .map(v => `"${String(v).replace(/"/g, '""')}"`)
                .join(',')
        );
        const csv  = '﻿' + [header, ...lines].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        descargarBlob(blob, 'barrios.csv');
        showToast('CSV exportado', 'success');
    } catch (err) {
        showToast(err.message || 'Error al exportar', 'error');
    }
}

async function exportarXLSX() {
    cerrarDropdowns();
    try {
        const data = await api('/barrios/exportar');
        const rows = data.data;
        if (!rows.length) { showToast('No hay barrios para exportar', 'info'); return; }

        const wsData = [
            ['ID Barrio', 'Zona', 'Nombre del Barrio', 'Ordenanza', 'Resolución', 'Observaciones'],
            ...rows.map(r => [
                r.id_barrio, r.zona_barrio, r.nombre_barrio,
                r.ordenanza_barrio ?? '', r.resolucion_barrio ?? '', r.observaciones_barrio ?? ''
            ])
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Barrios');
        XLSX.writeFile(wb, 'barrios.xlsx');
        showToast('XLSX exportado', 'success');
    } catch (err) {
        showToast(err.message || 'Error al exportar', 'error');
    }
}

function descargarBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────
// Dropdown
// ──────────────────────────────────────────────

function toggleDropdown(id) {
    const menu = document.getElementById(id + 'Menu');
    if (!menu) return;
    const isOpen = menu.classList.contains('show');
    cerrarDropdowns();
    if (!isOpen) menu.classList.add('show');
}

function cerrarDropdowns() {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
}

// ──────────────────────────────────────────────
// Importar (stub — implementado en Fase 16)
// ──────────────────────────────────────────────

function abrirImportarModal() {
    ImportarBarrios.abrirModal();
}
