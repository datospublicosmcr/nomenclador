/**
 * Nomenclador — Panel de Administración
 * Utilidades compartidas para todas las páginas del admin
 */

const API_URL = '/api';
let _toastTimer = null;

const App = {
    token:    localStorage.getItem('nomenclador_token'),
    usuario:  JSON.parse(localStorage.getItem('nomenclador_usuario')  || 'null'),
    permisos: JSON.parse(localStorage.getItem('nomenclador_permisos') || '[]')
};

// ──────────────────────────────────────────────
// API helper
// ──────────────────────────────────────────────

async function api(endpoint, options = {}) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            ...options.headers
        },
        ...options
    };

    if (App.token) {
        config.headers['Authorization'] = `Bearer ${App.token}`;
    }

    let url = `${API_URL}${endpoint}`;
    if (!options.method || options.method === 'GET') {
        const sep = endpoint.includes('?') ? '&' : '?';
        url += `${sep}_t=${Date.now()}`;
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            logout();
            throw new Error('Sesión expirada. Inicie sesión nuevamente.');
        }
        throw new Error(data.error || 'Error en la petición');
    }

    return data;
}

// ──────────────────────────────────────────────
// Autenticación
// ──────────────────────────────────────────────

async function checkAuth() {
    if (!App.token) {
        window.location.href = '/admin/index.html';
        return false;
    }
    try {
        const data = await api('/auth/me');
        App.usuario  = data.usuario;
        App.permisos = data.permisos;
        localStorage.setItem('nomenclador_usuario',  JSON.stringify(data.usuario));
        localStorage.setItem('nomenclador_permisos', JSON.stringify(data.permisos));
        return true;
    } catch {
        logout();
        return false;
    }
}

function logout() {
    localStorage.removeItem('nomenclador_token');
    localStorage.removeItem('nomenclador_usuario');
    localStorage.removeItem('nomenclador_permisos');
    App.token    = null;
    App.usuario  = null;
    App.permisos = [];
    window.location.href = '/admin/index.html';
}

function hasPermission(modulo, tipo = 'ver') {
    if (!App.usuario) return false;
    if (App.usuario.es_superadmin) return true;
    const p = App.permisos.find(p => p.codigo === modulo);
    if (!p) return false;
    return tipo === 'editar' ? p.puede_editar : p.puede_ver;
}

// ──────────────────────────────────────────────
// Toast
// ──────────────────────────────────────────────

const _TOAST_ICONS = {
    success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    error:   '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    info:    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
};

function showToast(mensaje, tipo = 'info') {
    let toast = document.getElementById('_toastAdmin');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = '_toastAdmin';
        toast.className = 'toast-admin';
        toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg><span></span>`;
        document.body.appendChild(toast);
    }
    toast.querySelector('svg').innerHTML = _TOAST_ICONS[tipo] || _TOAST_ICONS.info;
    toast.querySelector('span').textContent = mensaje;
    toast.className = `toast-admin ${tipo}`;
    void toast.offsetWidth;
    toast.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

// ──────────────────────────────────────────────
// Header usuario
// ──────────────────────────────────────────────

function actualizarHeaderUsuario() {
    const u = App.usuario;
    if (!u) return;
    const nombre = u.nombre || u.username;
    const el = id => document.getElementById(id);
    if (el('headerUserName')) el('headerUserName').textContent = nombre;
    if (el('headerUserRole')) el('headerUserRole').textContent = u.es_superadmin ? 'Superadministrador' : 'Usuario';
    if (el('headerAvatar'))   el('headerAvatar').textContent   = getInitials(nombre);
}

// ──────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggle  = document.getElementById('sidebarToggle');

    if (!sidebar || !overlay || !toggle) return;

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('visible');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        }
    });
}

function setActiveLink(href) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === href);
    });
}

// ──────────────────────────────────────────────
// Modales
// ──────────────────────────────────────────────

function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('visible'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('visible'); document.body.style.overflow = ''; }
}

function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.classList.remove('visible');
                document.body.style.overflow = '';
            }
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.visible').forEach(m => {
                m.classList.remove('visible');
                document.body.style.overflow = '';
            });
        }
    });
}

// ──────────────────────────────────────────────
// Utilidades
// ──────────────────────────────────────────────

function getInitials(nombre) {
    if (!nombre) return '?';
    const words = nombre.trim().split(' ').filter(Boolean);
    return words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : nombre.substring(0, 2).toUpperCase();
}

function formatDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ──────────────────────────────────────────────
// Init automático
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initModals();
});
