/**
 * Nomenclador — Módulo de Calles (Admin)
 */

// ──────────────────────────────────────────────
// Estado
// ──────────────────────────────────────────────

const State = {
    calles:        [],
    paginacion:    { total: 0, pagina: 1, limite: 25, totalPaginas: 0 },
    buscar:        '',
    buscarTimer:   null,
    calleActual:   null,   // objeto completo de la calle seleccionada
    modo:          null,   // 'ver' | 'editar' | 'nuevo'
    guardando:     false,
    eliminandoId:  null,
    puedoEditar:   false
};

// ──────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await checkAuth();
    if (!ok) return;

    actualizarHeaderUsuario();

    if (!hasPermission('calles', 'ver')) {
        document.querySelector('.modulo-container').innerHTML =
            '<div style="padding:40px;color:var(--danger)">Sin permiso para ver este módulo.</div>';
        return;
    }

    State.puedoEditar = hasPermission('calles', 'editar');

    if (!State.puedoEditar) {
        document.getElementById('btnNuevaCalle').hidden = true;
        document.getElementById('btnImportar').hidden   = true;
    }

    await cargarCalles();

    document.addEventListener('click', e => {
        if (!e.target.closest('#dropdownExportar')) cerrarDropdowns();
    });
});

// ──────────────────────────────────────────────
// Carga de datos
// ──────────────────────────────────────────────

async function cargarCalles() {
    try {
        const params = new URLSearchParams({
            pagina: State.paginacion.pagina,
            limite: State.paginacion.limite
        });
        if (State.buscar) params.set('buscar', State.buscar);

        const data = await api(`/calles?${params}`);
        State.calles     = data.data;
        State.paginacion = data.paginacion;

        renderizarLista();
        renderizarPaginacion();
        actualizarTotalInfo();
    } catch (err) {
        showToast(err.message || 'Error al cargar calles', 'error');
    }
}

// ──────────────────────────────────────────────
// Render: lista
// ──────────────────────────────────────────────

function renderizarLista() {
    const container = document.getElementById('listaCalles');

    if (State.calles.length === 0) {
        container.innerHTML = `
            <div style="padding:32px;text-align:center;color:var(--gray-400);font-size:0.88rem">
                ${State.buscar ? 'Sin resultados para la búsqueda.' : 'No hay calles cargadas.'}
            </div>`;
        return;
    }

    container.innerHTML = State.calles.map(c => {
        const activa = State.calleActual && State.calleActual.id_calle === c.id_calle;
        const ocLabel = c.orden_carga != null
            ? `OC ${c.orden_carga}`
            : 'Sin OC';
        const ocClass = c.orden_carga != null ? '' : 'sin-oc';
        return `
        <div class="lista-item${activa ? ' active' : ''}"
             onclick="seleccionarCalle(${c.id_calle})"
             role="listitem"
             tabindex="0"
             onkeydown="if(event.key==='Enter')seleccionarCalle(${c.id_calle})"
             aria-label="${escapeHtml(c.nombre_calle)}">
            <div class="lista-item-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 13v8"/><path d="M12 3v3"/>
                    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/>
                </svg>
            </div>
            <div class="lista-item-body">
                <div class="lista-item-nombre">${escapeHtml(c.nombre_calle)}</div>
                <div class="lista-item-oc ${ocClass}">${ocLabel}</div>
            </div>
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
    document.getElementById('totalCalles').textContent =
        total === 0 ? 'Sin resultados'
        : total === 1 ? '1 calle'
        : `${total.toLocaleString('es-AR')} calles`;
}

// ──────────────────────────────────────────────
// Selección / detalle
// ──────────────────────────────────────────────

async function seleccionarCalle(id) {
    if (State.modo === 'nuevo' || State.modo === 'editar') {
        if (!confirm('¿Descartar cambios sin guardar?')) return;
    }
    try {
        const calle = await api(`/calles/${id}`);
        State.calleActual = calle;
        State.modo = 'ver';
        renderizarLista();
        mostrarDetalle();
    } catch (err) {
        showToast(err.message || 'Error al cargar la calle', 'error');
    }
}

function mostrarDetalle() {
    document.getElementById('detalleVacio').hidden     = true;
    document.getElementById('detalleContenido').hidden = false;

    const c    = State.calleActual;
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
        badge.textContent = 'Nueva calle';
        badge.className   = 'badge-modo creacion';
    }

    document.getElementById('detalleTitulo').textContent = modo === 'nuevo' ? 'Nueva Calle' : (c ? c.nombre_calle : '—');

    // Campos
    const readonly = modo === 'ver';
    const oc   = document.getElementById('inputOrdenCarga');
    const nom  = document.getElementById('inputNombreCalle');
    const obs  = document.getElementById('inputObservaciones');

    oc.readOnly  = readonly;
    nom.readOnly = readonly;
    obs.readOnly = readonly;

    oc.value  = c && c.orden_carga != null ? c.orden_carga : '';
    nom.value = c ? (c.nombre_calle || '') : '';
    obs.value = c ? (c.observacion_calle || '') : '';

    // Metadata
    const secMeta = document.getElementById('seccionMeta');
    if (modo === 'nuevo') {
        secMeta.hidden = true;
    } else {
        secMeta.hidden = false;
        document.getElementById('metaCreado').textContent       = c ? formatDate(c.created_at)  : '—';
        document.getElementById('metaCreadoPor').textContent    = c ? (c.created_by  || '—')    : '—';
        document.getElementById('metaModificado').textContent   = c ? formatDate(c.updated_at)  : '—';
        document.getElementById('metaModificadoPor').textContent= c ? (c.updated_by  || '—')    : '—';
    }

    // Acciones (header) y footer
    renderizarAcciones();
}

function renderizarAcciones() {
    const header = document.getElementById('detalleAcciones');
    const footer = document.getElementById('detalleFooter');
    const modo   = State.modo;

    if (modo === 'ver') {
        header.innerHTML = State.puedoEditar ? `
            <button class="btn btn-danger btn-sm" onclick="confirmarEliminarCalle()">Eliminar</button>
            <button class="btn btn-primary btn-sm" onclick="editarCalle()">Editar</button>` : '';
        footer.innerHTML = '';
    } else {
        header.innerHTML = '';
        footer.innerHTML = `
            <button class="btn btn-secondary" onclick="cancelarEdicion()">Cancelar</button>
            <button class="btn btn-primary" onclick="guardarCalle()" id="btnGuardar">Guardar</button>`;
    }
}

// ──────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────

function nuevaCalle() {
    if (!State.puedoEditar) return;
    State.calleActual = null;
    State.modo = 'nuevo';
    renderizarLista();
    mostrarDetalle();
    document.getElementById('inputNombreCalle').focus();
}

function editarCalle() {
    State.modo = 'editar';
    mostrarDetalle();
    document.getElementById('inputNombreCalle').focus();
}

function cancelarEdicion() {
    if (State.modo === 'nuevo') {
        State.modo = null;
        State.calleActual = null;
        document.getElementById('detalleVacio').hidden     = false;
        document.getElementById('detalleContenido').hidden = true;
        renderizarLista();
    } else {
        State.modo = 'ver';
        mostrarDetalle();
    }
}

async function guardarCalle() {
    if (State.guardando) return;

    const nombre  = document.getElementById('inputNombreCalle').value.trim();
    const ocRaw   = document.getElementById('inputOrdenCarga').value.trim();
    const obsVal  = document.getElementById('inputObservaciones').value.trim();

    if (!nombre) {
        showToast('El nombre de la calle es requerido', 'error');
        document.getElementById('inputNombreCalle').focus();
        return;
    }

    const orden_carga = ocRaw !== '' ? parseInt(ocRaw, 10) : null;
    if (ocRaw !== '' && isNaN(orden_carga)) {
        showToast('El orden de carga debe ser un número entero', 'error');
        return;
    }

    const body = {
        nombre_calle:      nombre,
        orden_carga:       orden_carga,
        observacion_calle: obsVal || null
    };

    State.guardando = true;
    const btn = document.getElementById('btnGuardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    try {
        if (State.modo === 'nuevo') {
            const res = await api('/calles', { method: 'POST', body: JSON.stringify(body) });
            showToast('Calle creada correctamente', 'success');
            State.paginacion.pagina = 1;
            await cargarCalles();
            // Seleccionar la nueva calle
            if (res.id_calle) await seleccionarCalle(res.id_calle);
        } else {
            await api(`/calles/${State.calleActual.id_calle}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Calle actualizada correctamente', 'success');
            await cargarCalles();
            await seleccionarCalle(State.calleActual.id_calle);
        }
    } catch (err) {
        showToast(err.message || 'Error al guardar', 'error');
        State.guardando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    } finally {
        State.guardando = false;
    }
}

function confirmarEliminarCalle() {
    if (!State.calleActual || !State.puedoEditar) return;
    State.eliminandoId = State.calleActual.id_calle;
    document.getElementById('modalEliminarMsg').textContent =
        `¿Eliminar la calle "${State.calleActual.nombre_calle}"? Esta acción es reversible desde la base de datos.`;
    openModal('modalEliminar');
}

async function confirmarEliminar() {
    if (!State.eliminandoId) return;
    const btn = document.getElementById('btnConfirmarEliminar');
    btn.disabled    = true;
    btn.textContent = 'Eliminando…';
    try {
        await api(`/calles/${State.eliminandoId}`, { method: 'DELETE' });
        closeModal('modalEliminar');
        showToast('Calle eliminada correctamente', 'success');
        State.calleActual  = null;
        State.eliminandoId = null;
        State.modo         = null;
        document.getElementById('detalleVacio').hidden     = false;
        document.getElementById('detalleContenido').hidden = true;
        State.paginacion.pagina = 1;
        await cargarCalles();
    } catch (err) {
        showToast(err.message || 'Error al eliminar', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Eliminar';
    }
}

// ──────────────────────────────────────────────
// Búsqueda y paginación
// ──────────────────────────────────────────────

function buscarConDelay() {
    clearTimeout(State.buscarTimer);
    State.buscarTimer = setTimeout(() => {
        State.buscar = document.getElementById('inputBuscar').value.trim();
        State.paginacion.pagina = 1;
        cargarCalles();
    }, 350);
}

function cambiarPagina(pagina) {
    if (pagina < 1 || pagina > State.paginacion.totalPaginas) return;
    State.paginacion.pagina = pagina;
    cargarCalles();
}

// ──────────────────────────────────────────────
// Exportación
// ──────────────────────────────────────────────

async function exportarCSV() {
    cerrarDropdowns();
    try {
        const data = await api('/calles/exportar');
        const rows = data.data;
        if (!rows.length) { showToast('No hay calles para exportar', 'info'); return; }

        const header = 'orden_carga,nombre_calle,observacion_calle';
        const lines  = rows.map(r =>
            [r.orden_carga ?? '', r.nombre_calle, r.observacion_calle ?? '']
                .map(v => `"${String(v).replace(/"/g, '""')}"`)
                .join(',')
        );
        const csv  = '﻿' + [header, ...lines].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        descargarBlob(blob, 'calles.csv');
        showToast('CSV exportado', 'success');
    } catch (err) {
        showToast(err.message || 'Error al exportar', 'error');
    }
}

async function exportarXLSX() {
    cerrarDropdowns();
    try {
        const data = await api('/calles/exportar');
        const rows = data.data;
        if (!rows.length) { showToast('No hay calles para exportar', 'info'); return; }

        const wsData = [
            ['Orden de Carga', 'Nombre de la Calle', 'Observaciones'],
            ...rows.map(r => [r.orden_carga ?? '', r.nombre_calle, r.observacion_calle ?? ''])
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Calles');
        XLSX.writeFile(wb, 'calles.xlsx');
        showToast('XLSX exportado', 'success');
    } catch (err) {
        showToast(err.message || 'Error al exportar', 'error');
    }
}

function descargarBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
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
// Importar (stub — implementado en Fase 15)
// ──────────────────────────────────────────────

function abrirImportarModal() {
    ImportarCalles.abrirModal();
}
