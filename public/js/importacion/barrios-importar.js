/**
 * Nomenclador — Importación masiva de Barrios desde CSV
 *
 * Flujo de 3 pasos:
 *   1. Subir CSV → parsear en cliente
 *   2. Preview   → mostrar nuevos/actualizar/sin cambios/eliminados/errores
 *   3. Confirmar → aplicar seleccionados
 *
 * Clave única: id_barrio (PK manual, obligatorio en CSV).
 */

const ImportarBarrios = {

    // ── Estado ──
    nuevos:        [],
    actualizar:    [],
    sinCambios:    [],
    duplicadosCSV: [],
    eliminados:    [],
    errores:       [],
    estadisticas:  {},
    seleccionNuevos:     new Set(),
    seleccionActualizar: new Set(),
    seleccionReactivar:  new Set(),
    tabActual:     'nuevos',
    resultadoImportacion: null,

    // ── Abrir / cerrar ──

    abrirModal() {
        this.resetearEstado();
        document.getElementById('modalImportarBarrios').classList.add('show');
        this.mostrarPaso(1);
    },

    cerrarModal() {
        document.getElementById('modalImportarBarrios').classList.remove('show');
        this.resetearEstado();
    },

    resetearEstado() {
        this.nuevos = []; this.actualizar = []; this.sinCambios = [];
        this.duplicadosCSV = []; this.eliminados = []; this.errores = [];
        this.estadisticas = {};
        this.seleccionNuevos     = new Set();
        this.seleccionActualizar = new Set();
        this.seleccionReactivar  = new Set();
        this.tabActual = 'nuevos';
        this.resultadoImportacion = null;

        const fi = document.getElementById('ib-file');
        if (fi) fi.value = '';
        const prev = document.getElementById('ib-archivo-preview');
        if (prev) prev.innerHTML = '';
        const ck = document.getElementById('ib-check-confirm');
        if (ck) ck.checked = false;
        const btn = document.getElementById('ib-btn-procesar');
        if (btn) { btn.disabled = true; btn.innerHTML = 'Procesar CSV'; }
    },

    // ── Pasos ──

    mostrarPaso(paso) {
        document.querySelectorAll('#modalImportarBarrios .importar-paso').forEach((p, i) => {
            p.classList.toggle('active', i + 1 === paso);
        });
        document.querySelectorAll('#modalImportarBarrios .paso-indicador').forEach((ind, i) => {
            ind.classList.remove('active', 'completado');
            if (i + 1 === paso) ind.classList.add('active');
            else if (i + 1 < paso) ind.classList.add('completado');
        });
        document.querySelectorAll('#modalImportarBarrios .paso-separador').forEach((sep, i) => {
            sep.classList.toggle('completado', i + 1 < paso);
        });

        const show = (id, val) => { const el = document.getElementById(id); if (el) el.style.display = val ? 'inline-flex' : 'none'; };
        show('ib-btn-procesar',  paso === 1);
        show('ib-btn-volver1',   paso === 2);
        show('ib-btn-siguiente', paso === 2);
        show('ib-btn-volver2',   paso === 3);
        show('ib-btn-aplicar',   paso === 3);

        if (paso === 3) {
            const btn = document.getElementById('ib-btn-aplicar');
            if (btn) btn.disabled = true;
            this.renderizarPaso3();
        }
    },

    // ── Paso 1: subir CSV ──

    onArchivoSeleccionado(input) {
        const file = input.files[0];
        const prev = document.getElementById('ib-archivo-preview');
        const btn  = document.getElementById('ib-btn-procesar');
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            prev.innerHTML = `<div class="archivo-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/>
                </svg>
                El archivo debe ser .csv</div>`;
            btn.disabled = true;
            return;
        }

        const mb = (file.size / 1048576).toFixed(2);
        prev.innerHTML = `<div class="archivo-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <div><div class="archivo-nombre">${escapeHtml(file.name)}</div><div class="archivo-size">${mb} MB</div></div>
        </div>`;
        btn.disabled = false;
    },

    async procesarCSV() {
        const input = document.getElementById('ib-file');
        const file  = input.files[0];
        if (!file) return;

        const btn = document.getElementById('ib-btn-procesar');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Procesando…';

        try {
            const texto     = await this._leerArchivo(file);
            const registros = this._parsearCSV(texto);

            if (registros.length === 0) throw new Error('El CSV está vacío o no tiene el formato esperado');

            const resultado = await api('/barrios/importar/preview', {
                method: 'POST',
                body: JSON.stringify({ registros })
            });

            this.nuevos        = resultado.nuevos        || [];
            this.actualizar    = resultado.actualizar    || [];
            this.sinCambios    = resultado.sinCambios    || [];
            this.duplicadosCSV = resultado.duplicadosCSV || [];
            this.eliminados    = resultado.eliminados    || [];
            this.errores       = resultado.errores       || [];
            this.estadisticas  = resultado.estadisticas  || {};

            this.nuevos.forEach((_, i)     => this.seleccionNuevos.add(i));
            this.actualizar.forEach((_, i) => this.seleccionActualizar.add(i));

            this.mostrarPaso(2);
            this.renderizarEstadisticas();
            this.renderizarTabs();
            this.cambiarTab('nuevos');

        } catch (err) {
            showToast(err.message || 'Error al procesar el CSV', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Procesar CSV';
        }
    },

    _leerArchivo(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload  = e => resolve(e.target.result);
            r.onerror = () => reject(new Error('Error al leer el archivo'));
            r.readAsText(file, 'UTF-8');
        });
    },

    _parsearCSV(texto) {
        const lineas = texto.split(/\r?\n/).filter(l => l.trim());
        if (lineas.length < 2) return [];

        const headers = this._parsearLinea(lineas[0]).map(h => h.toLowerCase().trim());

        const alias = {
            id_barrio:            ['id_barrio', 'id', 'codigo', 'cod'],
            zona_barrio:          ['zona_barrio', 'zona'],
            nombre_barrio:        ['nombre_barrio', 'nombre', 'barrio'],
            ordenanza_barrio:     ['ordenanza_barrio', 'ordenanza'],
            resolucion_barrio:    ['resolucion_barrio', 'resolucion', 'resolución'],
            observaciones_barrio: ['observaciones_barrio', 'observaciones', 'obs']
        };

        const idx = {};
        for (const [campo, a] of Object.entries(alias)) {
            const i = headers.findIndex(h => a.includes(h));
            if (i !== -1) idx[campo] = i;
        }

        if (idx.id_barrio     === undefined) throw new Error('No se encontró la columna "id_barrio" en el CSV');
        if (idx.nombre_barrio === undefined) throw new Error('No se encontró la columna "nombre_barrio" en el CSV');
        if (idx.zona_barrio   === undefined) throw new Error('No se encontró la columna "zona_barrio" en el CSV');

        return lineas.slice(1).map(l => {
            const vals = this._parsearLinea(l);
            return {
                id_barrio:            vals[idx.id_barrio]            || '',
                zona_barrio:          idx.zona_barrio   !== undefined ? vals[idx.zona_barrio]   || '' : '',
                nombre_barrio:        vals[idx.nombre_barrio]         || '',
                ordenanza_barrio:     idx.ordenanza_barrio  !== undefined ? vals[idx.ordenanza_barrio]  || '' : '',
                resolucion_barrio:    idx.resolucion_barrio !== undefined ? vals[idx.resolucion_barrio] || '' : '',
                observaciones_barrio: idx.observaciones_barrio !== undefined ? vals[idx.observaciones_barrio] || '' : ''
            };
        }).filter(r => r.id_barrio.toString().trim() || r.nombre_barrio.trim());
    },

    _parsearLinea(linea) {
        const vals = []; let cur = ''; let enComillas = false;
        for (let i = 0; i < linea.length; i++) {
            const c = linea[i]; const n = linea[i + 1];
            if (enComillas) {
                if (c === '"' && n === '"') { cur += '"'; i++; }
                else if (c === '"') enComillas = false;
                else cur += c;
            } else {
                if (c === '"') enComillas = true;
                else if (c === ',') { vals.push(cur.trim()); cur = ''; }
                else cur += c;
            }
        }
        vals.push(cur.trim());
        return vals;
    },

    // ── Paso 2: preview ──

    renderizarEstadisticas() {
        const el = document.getElementById('ib-stats');
        if (!el) return;
        const s = this.estadisticas;
        let h = '<div class="stat-cards">';
        h += `<div class="stat-card-imp nuevos"><div class="stat-valor">${s.nuevos||0}</div><div class="stat-label">Nuevos</div></div>`;
        h += `<div class="stat-card-imp actualizar"><div class="stat-valor">${s.actualizar||0}</div><div class="stat-label">Actualizar</div></div>`;
        h += `<div class="stat-card-imp sin-cambios"><div class="stat-valor">${s.sin_cambios||0}</div><div class="stat-label">Sin cambios</div></div>`;
        if (s.eliminados    > 0) h += `<div class="stat-card-imp eliminados"><div class="stat-valor">${s.eliminados}</div><div class="stat-label">Eliminados</div></div>`;
        if (s.duplicados_csv > 0) h += `<div class="stat-card-imp duplicados"><div class="stat-valor">${s.duplicados_csv}</div><div class="stat-label">Dup. CSV</div></div>`;
        if (s.errores       > 0) h += `<div class="stat-card-imp errores"><div class="stat-valor">${s.errores}</div><div class="stat-label">Errores</div></div>`;
        el.innerHTML = h + '</div>';
    },

    renderizarTabs() {
        const el = document.getElementById('ib-tabs');
        if (!el) return;
        const t = this.tabActual;
        let h = '';
        h += `<button class="tab-btn tab-nuevos ${t==='nuevos'?'active':''}" onclick="ImportarBarrios.cambiarTab('nuevos')">Nuevos (${this.nuevos.length})</button>`;
        h += `<button class="tab-btn tab-actualizar ${t==='actualizar'?'active':''}" onclick="ImportarBarrios.cambiarTab('actualizar')">Actualizar (${this.actualizar.length})</button>`;
        h += `<button class="tab-btn ${t==='sinCambios'?'active':''}" onclick="ImportarBarrios.cambiarTab('sinCambios')">Sin cambios (${this.sinCambios.length})</button>`;
        if (this.eliminados.length > 0)
            h += `<button class="tab-btn tab-eliminados ${t==='eliminados'?'active':''}" onclick="ImportarBarrios.cambiarTab('eliminados')">Eliminados (${this.eliminados.length})</button>`;
        if (this.duplicadosCSV.length > 0)
            h += `<button class="tab-btn ${t==='duplicadosCSV'?'active':''}" onclick="ImportarBarrios.cambiarTab('duplicadosCSV')">Dup. CSV (${this.duplicadosCSV.length})</button>`;
        if (this.errores.length > 0)
            h += `<button class="tab-btn tab-errores ${t==='errores'?'active':''}" onclick="ImportarBarrios.cambiarTab('errores')">Errores (${this.errores.length})</button>`;
        el.innerHTML = h;
    },

    cambiarTab(tab) {
        this.tabActual = tab;
        this.renderizarTabs();
        this.renderizarContenidoTab();
    },

    renderizarContenidoTab() {
        const el = document.getElementById('ib-tabla');
        if (!el) return;
        switch (this.tabActual) {
            case 'nuevos':        this._tablaNuevos(el);      break;
            case 'actualizar':    this._tablaActualizar(el);  break;
            case 'sinCambios':    this._tablaSinCambios(el);  break;
            case 'eliminados':    this._tablaEliminados(el);  break;
            case 'duplicadosCSV': this._tablaDuplicados(el);  break;
            case 'errores':       this._tablaErrores(el);     break;
        }
        this._actualizarInfo();
    },

    _tablaNuevos(el) {
        if (!this.nuevos.length) { el.innerHTML = '<div class="tabla-vacia">No hay barrios nuevos para importar</div>'; return; }
        const todos = this.nuevos.length === this.seleccionNuevos.size;
        let h = `<div class="tabla-acciones">
            <label class="checkbox-todos"><input type="checkbox" ${todos?'checked':''} onchange="ImportarBarrios._toggleTodos('nuevos',this.checked)"> Seleccionar todos</label>
            <span class="seleccionados">${this.seleccionNuevos.size} de ${this.nuevos.length}</span></div>
            <div class="tabla-scroll"><table class="tabla-importar">
            <thead><tr><th class="col-check"></th><th>ID</th><th>Zona</th><th>Nombre</th><th>Ordenanza</th></tr></thead><tbody>`;
        this.nuevos.forEach((item, i) => {
            const s = this.seleccionNuevos.has(i);
            const d = item.datosCSV;
            h += `<tr class="${s?'seleccionado':''}">
                <td class="col-check"><input type="checkbox" ${s?'checked':''} onchange="ImportarBarrios._toggleSel('nuevos',${i},this.checked)"></td>
                <td><strong>${d.id_barrio}</strong></td>
                <td>${escapeHtml(d.zona_barrio)}</td>
                <td>${escapeHtml(d.nombre_barrio)}</td>
                <td>${d.ordenanza_barrio ? escapeHtml(d.ordenanza_barrio) : '<span class="valor-vacio">—</span>'}</td>
            </tr>`;
        });
        el.innerHTML = h + '</tbody></table></div>';
    },

    _tablaActualizar(el) {
        if (!this.actualizar.length) { el.innerHTML = '<div class="tabla-vacia">No hay barrios para actualizar</div>'; return; }
        const todos = this.actualizar.length === this.seleccionActualizar.size;
        let h = `<div class="tabla-acciones">
            <label class="checkbox-todos"><input type="checkbox" ${todos?'checked':''} onchange="ImportarBarrios._toggleTodos('actualizar',this.checked)"> Seleccionar todos</label>
            <span class="seleccionados">${this.seleccionActualizar.size} de ${this.actualizar.length}</span></div>
            <div class="tabla-scroll"><table class="tabla-importar">
            <thead><tr><th class="col-check"></th><th>ID</th><th>Nombre</th><th>Campo</th><th>Valor actual (BD)</th><th>Valor nuevo (CSV)</th></tr></thead><tbody>`;
        this.actualizar.forEach((item, i) => {
            const s = this.seleccionActualizar.has(i);
            item.cambios.forEach((cambio, j) => {
                const clsInicio = j === 0 && i > 0 ? 'fila-inicio-registro' : '';
                h += `<tr class="${s?'seleccionado':''} ${clsInicio}">
                    ${j===0 ? `<td class="col-check" rowspan="${item.cambios.length}"><input type="checkbox" ${s?'checked':''} onchange="ImportarBarrios._toggleSel('actualizar',${i},this.checked)"></td>
                    <td rowspan="${item.cambios.length}"><strong>${item.datosBD.id_barrio}</strong></td>
                    <td rowspan="${item.cambios.length}">${escapeHtml(item.datosBD.nombre_barrio)}</td>` : ''}
                    <td>${cambio.label}</td>
                    <td><span class="valor-anterior">${escapeHtml(cambio.valorBD)||'(vacío)'}</span></td>
                    <td><span class="valor-nuevo">${escapeHtml(cambio.valorCSV)||'(vacío)'}</span></td>
                </tr>`;
            });
        });
        el.innerHTML = h + '</tbody></table></div>';
    },

    _tablaSinCambios(el) {
        if (!this.sinCambios.length) { el.innerHTML = '<div class="tabla-vacia">No hay barrios sin cambios</div>'; return; }
        let h = '<div class="tabla-scroll"><table class="tabla-importar"><thead><tr><th>ID</th><th>Zona</th><th>Nombre</th></tr></thead><tbody>';
        this.sinCambios.forEach(item => {
            h += `<tr><td>${item.id_barrio}</td><td>${escapeHtml(item.zona_barrio)}</td><td>${escapeHtml(item.nombre_barrio)}</td></tr>`;
        });
        el.innerHTML = h + '</tbody></table></div>';
    },

    _tablaEliminados(el) {
        if (!this.eliminados.length) { el.innerHTML = '<div class="tabla-vacia">No hay barrios eliminados encontrados</div>'; return; }
        const todos = this.eliminados.length === this.seleccionReactivar.size;
        let h = `<div style="margin-bottom:12px;padding:10px 14px;background:#fef3c7;border-radius:8px;color:#92400e;font-size:0.83rem">
            <strong>Estos barrios fueron eliminados anteriormente.</strong> Si los seleccionás, serán reactivados con los datos del CSV.</div>
            <div class="tabla-acciones">
            <label class="checkbox-todos"><input type="checkbox" ${todos?'checked':''} onchange="ImportarBarrios._toggleTodos('reactivar',this.checked)"> Seleccionar todos</label>
            <span class="seleccionados">${this.seleccionReactivar.size} de ${this.eliminados.length}</span></div>
            <div class="tabla-scroll"><table class="tabla-importar">
            <thead><tr><th class="col-check"></th><th>ID</th><th>Nombre en BD</th><th>Nombre en CSV</th><th>Zona CSV</th></tr></thead><tbody>`;
        this.eliminados.forEach((item, i) => {
            const s = this.seleccionReactivar.has(i);
            h += `<tr class="${s?'seleccionado':''}">
                <td class="col-check"><input type="checkbox" ${s?'checked':''} onchange="ImportarBarrios._toggleSel('reactivar',${i},this.checked)"></td>
                <td>${item.datosBD.id_barrio}</td>
                <td><span class="valor-anterior">${escapeHtml(item.datosBD.nombre_barrio)}</span></td>
                <td><span class="valor-nuevo">${escapeHtml(item.datosCSV.nombre_barrio)}</span></td>
                <td>${escapeHtml(item.datosCSV.zona_barrio)}</td>
            </tr>`;
        });
        el.innerHTML = h + '</tbody></table></div>';
    },

    _tablaDuplicados(el) {
        if (!this.duplicadosCSV.length) { el.innerHTML = '<div class="tabla-vacia">No hay duplicados</div>'; return; }
        let h = `<div style="margin-bottom:12px;padding:10px 14px;background:#fee2e2;border-radius:8px;color:#b91c1c;font-size:0.83rem">
            <strong>Estos id_barrio aparecen más de una vez en el CSV.</strong> Corregí el archivo y volvé a importar.</div>
            <div class="tabla-scroll"><table class="tabla-importar">
            <thead><tr><th>ID</th><th>Fila</th><th>Nombre</th><th>Zona</th></tr></thead><tbody>`;
        this.duplicadosCSV.forEach(dup => {
            dup.registros.forEach((reg, j) => {
                h += `<tr class="fila-error">
                    ${j===0?`<td rowspan="${dup.registros.length}"><strong>${dup.id_barrio}</strong></td>`:''}
                    <td>${reg.fila}</td><td>${escapeHtml(reg.nombre_barrio)}</td><td>${escapeHtml(reg.zona_barrio)}</td>
                </tr>`;
            });
        });
        el.innerHTML = h + '</tbody></table></div>';
    },

    _tablaErrores(el) {
        if (!this.errores.length) { el.innerHTML = '<div class="tabla-vacia">No hay errores</div>'; return; }
        let h = '<div class="tabla-scroll"><table class="tabla-importar"><thead><tr><th>Fila</th><th>ID</th><th>Nombre</th><th>Error</th></tr></thead><tbody>';
        this.errores.forEach(err => {
            h += `<tr class="fila-error">
                <td>${err.fila}</td>
                <td>${err.registro?.id_barrio||'—'}</td>
                <td>${err.registro?.nombre_barrio ? escapeHtml(err.registro.nombre_barrio) : '—'}</td>
                <td style="color:var(--danger)">${escapeHtml(err.error)}</td>
            </tr>`;
        });
        el.innerHTML = h + '</tbody></table></div>';
    },

    // ── Selección ──

    _toggleTodos(tipo, checked) {
        const map = { nuevos: 'seleccionNuevos', actualizar: 'seleccionActualizar', reactivar: 'seleccionReactivar' };
        const src = { nuevos: this.nuevos, actualizar: this.actualizar, reactivar: this.eliminados };
        if (checked) src[tipo].forEach((_, i) => this[map[tipo]].add(i));
        else this[map[tipo]].clear();
        this.renderizarContenidoTab();
    },

    _toggleSel(tipo, index, checked) {
        const map = { nuevos: 'seleccionNuevos', actualizar: 'seleccionActualizar', reactivar: 'seleccionReactivar' };
        if (checked) this[map[tipo]].add(index);
        else         this[map[tipo]].delete(index);
        this.renderizarContenidoTab();
    },

    _actualizarInfo() {
        const total = this.seleccionNuevos.size + this.seleccionActualizar.size + this.seleccionReactivar.size;
        const el = document.getElementById('ib-info-sel');
        if (el) el.textContent = `${total} registro${total !== 1 ? 's' : ''} seleccionado${total !== 1 ? 's' : ''} para importar`;
    },

    // ── Paso 3: confirmación ──

    irAPaso3() {
        const total = this.seleccionNuevos.size + this.seleccionActualizar.size + this.seleccionReactivar.size;
        if (total === 0) { showToast('Seleccioná al menos un registro para importar', 'info'); return; }
        this.mostrarPaso(3);
    },

    renderizarPaso3() {
        const el = document.getElementById('ib-paso3-contenido');
        if (!el) return;

        const nSel = this.nuevos.filter((_, i)    => this.seleccionNuevos.has(i));
        const aSel = this.actualizar.filter((_, i) => this.seleccionActualizar.has(i));
        const rSel = this.eliminados.filter((_, i) => this.seleccionReactivar.has(i));

        let h = '<div class="confirmacion-scroll" id="ib-scroll-confirm">';

        if (nSel.length) {
            h += `<div class="confirmacion-seccion"><div class="confirmacion-titulo">➕ Se insertarán ${nSel.length} barrios nuevos</div><div class="confirmacion-lista">`;
            nSel.forEach(item => {
                h += `<div class="confirmacion-item" style="border-left-color:#1d4ed8">
                    <span class="item-interno">ID ${item.datosCSV.id_barrio}</span>
                    <span class="item-nombre">${escapeHtml(item.datosCSV.nombre_barrio)}</span>
                    <span style="font-size:0.75rem;color:var(--gray-400)">${escapeHtml(item.datosCSV.zona_barrio)}</span></div>`;
            });
            h += '</div></div>';
        }

        if (aSel.length) {
            h += `<div class="confirmacion-seccion"><div class="confirmacion-titulo">✏️ Se actualizarán ${aSel.length} barrios</div><div class="confirmacion-lista">`;
            aSel.forEach(item => {
                h += `<div class="confirmacion-item" style="border-left-color:#f59e0b">
                    <span class="item-interno">ID ${item.datosBD.id_barrio}</span>
                    <span class="item-nombre">${escapeHtml(item.datosBD.nombre_barrio)}</span>
                    <div class="item-cambios">`;
                item.cambios.forEach(c => {
                    h += `<div class="item-cambio">${c.label}: <span class="valor-anterior">${escapeHtml(c.valorBD)||'(vacío)'}</span> → <span class="valor-nuevo">${escapeHtml(c.valorCSV)||'(vacío)'}</span></div>`;
                });
                h += '</div></div>';
            });
            h += '</div></div>';
        }

        if (rSel.length) {
            h += `<div class="confirmacion-seccion"><div class="confirmacion-titulo">🔄 Se reactivarán ${rSel.length} barrios eliminados</div><div class="confirmacion-lista">`;
            rSel.forEach(item => {
                h += `<div class="confirmacion-item" style="border-left-color:#be185d">
                    <span class="item-interno">ID ${item.datosCSV.id_barrio}</span>
                    <span class="item-nombre">${escapeHtml(item.datosCSV.nombre_barrio)}</span></div>`;
            });
            h += '</div></div>';
        }

        h += `</div>
            <div class="confirmacion-footer">
                <label class="checkbox-confirmacion disabled" id="ib-label-confirm">
                    <input type="checkbox" id="ib-check-confirm" disabled onchange="ImportarBarrios._toggleConfirm(this.checked)">
                    <span>Revisé los cambios y confirmo que deseo aplicar la importación</span>
                </label>
            </div>`;

        el.innerHTML = h;
        this._initScrollDetector();
    },

    _initScrollDetector() {
        const scroll = document.getElementById('ib-scroll-confirm');
        const ck     = document.getElementById('ib-check-confirm');
        const lbl    = document.getElementById('ib-label-confirm');
        if (!scroll || !ck || !lbl) return;
        const unlock = () => { lbl.classList.remove('disabled'); ck.disabled = false; };
        if (scroll.scrollHeight <= scroll.clientHeight + 10) { unlock(); return; }
        scroll.addEventListener('scroll', () => {
            if (scroll.scrollHeight - scroll.scrollTop <= scroll.clientHeight + 50) unlock();
        });
    },

    _toggleConfirm(checked) {
        const btn = document.getElementById('ib-btn-aplicar');
        if (btn) btn.disabled = !checked;
    },

    volverPaso1() { this.mostrarPaso(1); },
    volverPaso2() { this.mostrarPaso(2); },

    // ── Aplicar ──

    async aplicarImportacion() {
        const nSel = this.nuevos.filter((_, i)    => this.seleccionNuevos.has(i));
        const aSel = this.actualizar.filter((_, i) => this.seleccionActualizar.has(i));
        const rSel = this.eliminados.filter((_, i) => this.seleccionReactivar.has(i));

        const btn = document.getElementById('ib-btn-aplicar');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Aplicando…';

        try {
            const resultado = await api('/barrios/importar/aplicar', {
                method: 'POST',
                body: JSON.stringify({ nuevos: nSel, actualizar: aSel, reactivar: rSel })
            });
            this.resultadoImportacion = resultado.resultados;
            this._mostrarResultado(resultado);
        } catch (err) {
            showToast(err.message || 'Error al aplicar la importación', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Aplicar Importación';
        }
    },

    _mostrarResultado(resultado) {
        const el = document.getElementById('ib-paso3-contenido');
        const r  = resultado.resultados.resumen;

        let stats = `<div class="resultado-stat insertados"><div class="stat-numero">${r.total_insertados}</div><div class="stat-texto">Insertados</div></div>
                     <div class="resultado-stat actualizados"><div class="stat-numero">${r.total_actualizados}</div><div class="stat-texto">Actualizados</div></div>`;
        if (r.total_reactivados > 0) stats += `<div class="resultado-stat revisar"><div class="stat-numero">${r.total_reactivados}</div><div class="stat-texto">Reactivados</div></div>`;
        if (r.total_errores     > 0) stats += `<div class="resultado-stat errores"><div class="stat-numero">${r.total_errores}</div><div class="stat-texto">Errores</div></div>`;

        el.innerHTML = `
            <div class="resultado-importacion">
                <div class="resultado-icono">✅</div>
                <h3>Importación completada</h3>
                <p>${escapeHtml(resultado.mensaje)}</p>
                <div class="resultado-stats">${stats}</div>
                <div class="resultado-acciones">
                    <button class="btn btn-secondary" onclick="ImportarBarrios._descargarReporte()">Descargar reporte XLSX</button>
                    <button class="btn btn-primary" onclick="ImportarBarrios.finalizarImportacion()"
                            style="background:var(--barrio);border-color:var(--barrio)">Cerrar</button>
                </div>
            </div>`;

        const btnV2 = document.getElementById('ib-btn-volver2');
        const btnAp = document.getElementById('ib-btn-aplicar');
        if (btnV2) btnV2.style.display = 'none';
        if (btnAp) btnAp.style.display = 'none';
    },

    async finalizarImportacion() {
        this.cerrarModal();
        if (typeof cargarBarrios === 'function') await cargarBarrios();
    },

    // ── Reporte XLSX ──

    _descargarReporte() {
        if (!this.resultadoImportacion) { showToast('No hay datos del reporte', 'info'); return; }
        const res = this.resultadoImportacion;
        const wb  = XLSX.utils.book_new();

        const wsIns = XLSX.utils.json_to_sheet(
            res.insertados?.length
                ? res.insertados.map(i => ({ 'ID': i.id_barrio, 'Nombre': i.nombre_barrio }))
                : [{ 'ID': '', 'Nombre': 'No se insertaron barrios' }]
        );
        wsIns['!cols'] = [{ wch: 8 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsIns, 'Insertados');

        let dataAct = [];
        if (res.actualizados?.length) {
            res.actualizados.forEach(a => a.cambios.forEach((c, i) => {
                dataAct.push({ 'ID': i===0?a.id_barrio:'', 'Nombre': i===0?a.nombre_barrio:'',
                    'Campo': c.campo, 'Valor anterior': c.valor_anterior||'', 'Valor nuevo': c.valor_nuevo||'' });
            }));
        } else dataAct = [{ 'ID': '', 'Nombre': 'No se actualizaron barrios', 'Campo': '', 'Valor anterior': '', 'Valor nuevo': '' }];
        const wsAct = XLSX.utils.json_to_sheet(dataAct);
        wsAct['!cols'] = [{ wch: 8 }, { wch: 35 }, { wch: 15 }, { wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsAct, 'Actualizados');

        if (res.reactivados?.length) {
            const wsR = XLSX.utils.json_to_sheet(res.reactivados.map(r => ({ 'ID': r.id_barrio, 'Nombre': r.nombre_barrio })));
            wsR['!cols'] = [{ wch: 8 }, { wch: 45 }];
            XLSX.utils.book_append_sheet(wb, wsR, 'Reactivados');
        }

        if (res.errores?.length) {
            const wsE = XLSX.utils.json_to_sheet(res.errores.map(e => ({ 'Tipo': e.tipo, 'ID': e.id_barrio||'', 'Nombre': e.nombre||'', 'Error': e.error })));
            wsE['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 35 }, { wch: 50 }];
            XLSX.utils.book_append_sheet(wb, wsE, 'Errores');
        }

        XLSX.writeFile(wb, `reporte_barrios_${new Date().toISOString().slice(0,10)}.xlsx`);
        showToast('Reporte descargado', 'success');
    }
};
