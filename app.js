// =========================================================================
// ⚠️ URL WEB APP GOOGLE APPS SCRIPT ANDA ⚠️
const API_URL = "https://script.google.com/macros/s/AKfycby6Y90YFPeIoTFYNtuhyr9MJCmKTMIS4SH2nmXK8LBnCCLbHs4J9Ry5po0t2l7pYFl8/exec";
// =========================================================================

// CORE API FETCH DENGAN ERROR HANDLING CANGGIH
async function fetchAPI(action, payload = {}) {
    payload.action = action;

    const urlEncodedData = new URLSearchParams();
    urlEncodedData.append('data', JSON.stringify(payload));

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: urlEncodedData,
            redirect: 'follow'
        });

        if (!response.ok) throw new Error("HTTP Status " + response.status);

        const textResponse = await response.text();

        if (textResponse.trim().startsWith('<') || textResponse.includes('<!DOCTYPE html>')) {
            console.error("Server merespons dengan HTML, bukan JSON.");
            throw new Error("ERROR AKSES: Pastikan Deployment 'Who has access' diatur ke 'Anyone' (Siapa saja).");
        }

        try {
            return JSON.parse(textResponse);
        } catch (e) {
            throw new Error("Format balasan server rusak.");
        }

    } catch (err) {
        console.error("Fetch API Error: ", err);
        throw new Error(err.message.includes("ERROR AKSES") ? err.message : "Koneksi ke server gagal.");
    }
}

// STATE MANAGEMENT
let currentUser = null;
let html5QrcodeScanner = null;
let isScanning = false;
let localScanCount = 0;
let appSettings = { appName: 'Aplikasi Presensi Santri' };

// IN-MEMORY CACHE
let dataSiswaCache = [];
let rekapCache = [];
let filterOptionsCache = { kelas: [], pengawas: [], kegiatan: [] };
let currentRekapMode = 'harian'; // 'harian' | 'bulanan'

window.onload = async () => {
    initDateControls();
    populateDropdowns();
    await loadInitialSettings();
    const savedSession = sessionStorage.getItem('zettbotUser');
    if (savedSession) {
        currentUser = JSON.parse(savedSession);
        initApp();
    }
};

function initDateControls() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const todayStr = (new Date(now - tzOffset)).toISOString().slice(0, 10);
    const filterTgl = document.getElementById('filterTanggal');
    if (filterTgl) filterTgl.value = todayStr;

    const filterBln = document.getElementById('filterBulan');
    if (filterBln) filterBln.value = String(now.getMonth() + 1);

    const filterThn = document.getElementById('filterTahun');
    if (filterThn) {
        const curYear = now.getFullYear();
        filterThn.innerHTML = '';
        for (let y = curYear - 1; y <= curYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.innerText = y;
            if (y === curYear) opt.selected = true;
            filterThn.appendChild(opt);
        }
    }
}

async function loadInitialSettings() {
    try {
        const res = await fetchAPI('getSettings');
        if (res.success) {
            appSettings = res.data;
            applySettingsToUI();
            const btnLog = document.getElementById('btnLogin');
            btnLog.innerText = "Masuk Sistem";
            btnLog.disabled = false;
        } else {
            document.getElementById('btnLogin').innerText = "Gagal Konek Server";
            showToast("Gagal mengambil pengaturan dari server.", true);
        }
    } catch (err) {
        document.getElementById('btnLogin').innerText = "Gagal Konek Server";
        showToast(err.message, true);
    }
}

function applySettingsToUI() {
    document.title = appSettings.appName;
    document.querySelectorAll('.app-title-display').forEach(el => el.innerText = appSettings.appName);
    const setAppInput = document.getElementById('setAppName');
    if (setAppInput) setAppInput.value = appSettings.appName;
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.querySelector('#toastMsg').innerText = msg;
    toast.querySelector('i').className = isError ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle';
    toast.querySelector('i').style.color = isError ? 'var(--danger)' : 'var(--primary)';
    toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function switchTab(viewId, btnElement) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.remove('hidden');
    if (btnElement) btnElement.classList.add('active');
    if (viewId !== 'viewScan' && isScanning) stopScanner();

    if (viewId === 'viewDataSiswa') loadDataSiswa();
    if (viewId === 'viewCetakKartu') renderKartuQR();
    if (viewId === 'viewRekap') {
        loadFilterOptions();
        loadRekapData();
    }
    if (viewId === 'viewSettings') loadDataUsers();
}

async function handleLogin() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = document.getElementById('btnLogin');
    btn.innerHTML = '<span class="loader"></span> Proses...';
    btn.disabled = true;

    try {
        const res = await fetchAPI('login', { username: u, password: p });
        btn.innerHTML = 'Masuk Sistem';
        btn.disabled = false;
        if (res.success) {
            currentUser = res.userData;
            sessionStorage.setItem('zettbotUser', JSON.stringify(currentUser));
            showToast('Login Berhasil! Ahlan wa Sahlan, ' + currentUser.nama);
            initApp();
        } else {
            showToast(res.message, true);
        }
    } catch (err) {
        btn.innerHTML = 'Masuk Sistem';
        btn.disabled = false;
        showToast(err.message, true);
    }
}

function logout() {
    sessionStorage.removeItem('zettbotUser');
    location.reload();
}

function initApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('lblUser').innerText = currentUser.nama;

    // Kompatibilitas role: Tampilkan 'Pengawas' sebagai 'Guru Ngaji'
    const roleTampil = (currentUser.role === 'Pengawas' ? 'Guru Ngaji' : currentUser.role);
    document.getElementById('lblRole').innerText = roleTampil;

    let htmlMenu = '<div class="tab-btn active" onclick="switchTab(\'viewScan\', this)"><i class="fas fa-camera"></i> Scan</div>' +
        '<div class="tab-btn" onclick="switchTab(\'viewRekap\', this)"><i class="fas fa-file-alt"></i> Laporan</div>';
    
    if (currentUser.role === 'Admin') {
        htmlMenu += '<div class="tab-btn" onclick="switchTab(\'viewDataSiswa\', this)"><i class="fas fa-users"></i> Santri</div>' +
            '<div class="tab-btn" onclick="switchTab(\'viewCetakKartu\', this)"><i class="fas fa-id-badge"></i> Cetak Kartu</div>' +
            '<div class="tab-btn" onclick="switchTab(\'viewSettings\', this)"><i class="fas fa-cogs"></i> Pengaturan</div>';
    }
    
    document.getElementById('menuTabs').innerHTML = htmlMenu;
    populateDropdowns();
    switchTab('viewScan', document.getElementById('menuTabs').firstElementChild);
    loadFilterOptions();
    updateDashboardStats();
    // Pre-load data santri dan rekap untuk mengisi metrik dashboard
    if (dataSiswaCache.length === 0) loadDataSiswa();
    if (rekapCache.length === 0) loadRekapData();
}

// -------------------------------------------------------------
// DASHBOARD QUICK STATS
// -------------------------------------------------------------
function updateDashboardStats() {
    // 1. Total Santri
    const elTotal = document.getElementById('statTotalSantri');
    if (elTotal) elTotal.innerText = dataSiswaCache.length;

    // 2. Presensi Hari Ini (Unique ID Santri yang hadir pada hari ini)
    const elHadir = document.getElementById('statHadirHariIni');
    if (elHadir) {
        const now = new Date();
        const tzOffset = now.getTimezoneOffset() * 60000;
        const todayParts = (new Date(now - tzOffset)).toISOString().slice(0, 10).split('-');
        const todayStr = todayParts[2] + '/' + todayParts[1] + '/' + todayParts[0];

        const hadirSet = new Set();
        rekapCache.forEach(r => {
            if (r.tanggal === todayStr && r.id_siswa) {
                hadirSet.add(r.id_siswa);
            }
        });
        elHadir.innerText = hadirSet.size;
    }

    // 3. Sesi Kegiatan Aktif
    syncKegiatanStat();

    // 4. Guru Ngaji
    const elGuru = document.getElementById('statGuruNgaji');
    if (elGuru && currentUser) {
        elGuru.innerText = currentUser.nama;
    }
}

function syncKegiatanStat() {
    const elKeg = document.getElementById('statKegiatanAktif');
    const selectKeg = document.getElementById('kegiatanSelect');
    const customKeg = document.getElementById('kegiatanCustom');
    if (!elKeg || !selectKeg) return;

    if (selectKeg.value === 'CUSTOM') {
        elKeg.innerText = customKeg && customKeg.value.trim() ? customKeg.value.trim() : 'Kegiatan Khusus';
    } else {
        elKeg.innerText = selectKeg.value;
    }
}

// -------------------------------------------------------------
// FILTER OPTIONS & MASTER SYNC
// -------------------------------------------------------------
async function loadFilterOptions() {
    try {
        const res = await fetchAPI('getOptions');
        if (res.success && res.data) {
            filterOptionsCache = res.data;
            populateDropdowns();
        }
    } catch (e) {
        console.warn("Gagal memuat filter options:", e);
    }
}

function populateDropdowns() {
    const populateSelect = (selectId, list, defaultLabel) => {
        const el = document.getElementById(selectId);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = `<option value="ALL">${defaultLabel}</option>`;
        list.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.innerText = item;
            el.appendChild(opt);
        });
        if (list.includes(currentVal)) el.value = currentVal;
    };

    populateSelect('filterKelasRekap', filterOptionsCache.kelas, 'Semua Kelas');
    populateSelect('filterKelasKartu', filterOptionsCache.kelas, 'Semua Kelas');
    populateSelect('filterPengawasRekap', filterOptionsCache.pengawas, 'Semua Guru Ngaji');

    // Populasikan daftar kegiatan lengkap (Default + dari server)
    const defaultKegiatan = ['Subuh Berjama\'ah', 'Dzuhur Berjama\'ah', 'Maghrib Mengaji', 'Mengaji Sore'];
    const mergedKegiatan = Array.from(new Set([...defaultKegiatan, ...(filterOptionsCache.kegiatan || [])]));
    populateSelect('filterKegiatanRekap', mergedKegiatan, 'Semua Kegiatan');
}

// -------------------------------------------------------------
// SCANNER LOGIC
// -------------------------------------------------------------
function toggleCustomKegiatan() {
    const val = document.getElementById('kegiatanSelect').value;
    const customInput = document.getElementById('kegiatanCustom');
    if (val === 'CUSTOM') customInput.classList.remove('hidden');
    else customInput.classList.add('hidden');
}

function startScanner() {
    document.getElementById('btnStartScan').classList.add('hidden');
    document.getElementById('btnStopScan').classList.remove('hidden');
    const statusBox = document.getElementById('scanStatus');
    statusBox.classList.remove('hidden', 'status-success', 'status-error');
    statusBox.innerHTML = '<span class="loader"></span> Meminta izin kamera...';

    const selectedCam = document.getElementById('kameraSelect').value;
    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start({ facingMode: selectedCam }, config, onScanSuccess)
        .then(() => {
            isScanning = true;
            statusBox.className = 'scan-status';
            statusBox.innerHTML = '<i class="fas fa-video"></i> Kamera aktif. Arahkan QR santri ke kotak scanner.';
        })
        .catch(err => {
            statusBox.className = 'scan-status status-error';
            statusBox.innerHTML = 'Gagal membuka kamera. Pastikan izin kamera telah diberikan di browser.';
            stopScanner();
        });
}

function stopScanner() {
    if (html5QrcodeScanner && isScanning) {
        html5QrcodeScanner.stop().then(() => {
            isScanning = false;
            document.getElementById('btnStartScan').classList.remove('hidden');
            document.getElementById('btnStopScan').classList.add('hidden');
            document.getElementById('scanStatus').classList.add('hidden');
        }).catch(() => {
            isScanning = false;
            document.getElementById('btnStartScan').classList.remove('hidden');
            document.getElementById('btnStopScan').classList.add('hidden');
        });
    }
}

let lastScannedData = null;
let blockScan = false;

async function onScanSuccess(decodedText) {
    if (blockScan || decodedText === lastScannedData) return;
    blockScan = true;
    lastScannedData = decodedText;

    const statusBox = document.getElementById('scanStatus');
    statusBox.className = 'scan-status';
    statusBox.innerHTML = '<span class="loader"></span> Menyimpan presensi...';

    let kegiatan = document.getElementById('kegiatanSelect').value;
    if (kegiatan === 'CUSTOM') {
        kegiatan = document.getElementById('kegiatanCustom').value.trim();
        if (!kegiatan) kegiatan = "Kegiatan Mengaji";
    }

    try {
        const res = await fetchAPI('scan', {
            qrData: decodedText,
            kegiatan: kegiatan,
            pengawas: currentUser.nama
        });

        if (res.success) {
            statusBox.className = 'scan-status status-success';
            statusBox.innerHTML = '<i class="fas fa-check"></i> ' + res.message;
            appendLiveScanTable(res.scanData);
            showToast(res.message);
        } else {
            statusBox.className = 'scan-status status-error';
            statusBox.innerHTML = '<i class="fas fa-times"></i> ' + res.message;
            showToast(res.message, true);
        }
    } catch (err) {
        statusBox.className = 'scan-status status-error';
        statusBox.innerHTML = 'Koneksi terputus ke server.';
    }

    setTimeout(() => {
        blockScan = false;
        lastScannedData = null;
    }, 2000);
}

function appendLiveScanTable(data) {
    localScanCount++;
    document.getElementById('liveCounter').innerText = localScanCount;
    const tbody = document.querySelector('#tableLiveScan tbody');
    const tr = document.createElement('tr');
    tr.style.background = 'rgba(37, 99, 235, 0.08)';
    tr.innerHTML = `<td><span class="badge-time">${data.waktu}</span></td><td><strong>${data.nama}</strong></td><td><span class="user-profile" style="font-size:0.75rem;">${data.kelas}</span></td>`;
    tbody.insertBefore(tr, tbody.firstChild);
    setTimeout(() => { tr.style.background = 'transparent'; }, 2500);
    updateDashboardStats();
}

// -------------------------------------------------------------
// DATA SISWA MANAGEMENT
// -------------------------------------------------------------
function toggleBatchPaste() {
    document.getElementById('batchArea').classList.toggle('hidden');
}

async function loadDataSiswa() {
    const tbody = document.querySelector('#tableSiswa tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;"><span class="loader"></span> Memuat data santri...</td></tr>';
    try {
        const res = await fetchAPI('getSiswa');
        if (res.success) {
            dataSiswaCache = res.data;
            renderTabelSiswa(dataSiswaCache);
            loadFilterOptions();
            updateDashboardStats();
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Gagal memuat data santri.</td></tr>';
    }
}

function renderTabelSiswa(dataArray) {
    const tbody = document.querySelector('#tableSiswa tbody');
    if (dataArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada data santri.</td></tr>';
        return;
    }
    let html = '';
    dataArray.forEach(item => {
        html += `<tr>
            <td><code>${item.id}</code></td>
            <td><strong>${item.nama}</strong></td>
            <td><span class="user-profile" style="font-size:0.75rem;">${item.kelas}</span></td>
            <td><button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" onclick="hapusSiswa('${item.id}')" title="Hapus"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function filterTabelSiswa() {
    const keyword = document.getElementById('searchSiswa').value.toLowerCase();
    const filtered = dataSiswaCache.filter(item =>
        item.nama.toLowerCase().includes(keyword) ||
        item.kelas.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword)
    );
    renderTabelSiswa(filtered);
}

async function prosesBatchImport() {
    const text = document.getElementById('pasteData').value;
    if (!text.trim()) {
        showToast('Tempelkan teks data terlebih dahulu!', true);
        return;
    }
    const btn = document.querySelector('#batchArea .btn-primary');
    btn.innerHTML = '<span class="loader"></span> Menyimpan...';
    try {
        const res = await fetchAPI('batchSiswa', { text: text });
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Data Batch';
        if (res.success) {
            showToast(res.message);
            document.getElementById('pasteData').value = '';
            toggleBatchPaste();
            loadDataSiswa();
        } else {
            showToast(res.message, true);
        }
    } catch (e) {
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Data Batch';
        showToast('Error koneksi ke server.', true);
    }
}

async function hapusSiswa(id) {
    if (!confirm('Yakin ingin menghapus santri dengan ID ' + id + '?')) return;
    try {
        const res = await fetchAPI('delSiswa', { id });
        if (res.success) {
            showToast(res.message);
            loadDataSiswa();
        } else {
            showToast(res.message, true);
        }
    } catch (e) {
        showToast('Gagal menghapus santri.', true);
    }
}

// -------------------------------------------------------------
// CETAK KARTU QR
// -------------------------------------------------------------
async function renderKartuQR() {
    if (dataSiswaCache.length === 0) {
        try {
            const res = await fetchAPI('getSiswa');
            if (res.success) {
                dataSiswaCache = res.data;
                generateCardsDOM();
            }
        } catch (e) { }
    } else {
        generateCardsDOM();
    }
}

function generateCardsDOM() {
    const area = document.getElementById('printArea');
    const filterKelas = document.getElementById('filterKelasKartu') ? document.getElementById('filterKelasKartu').value : 'ALL';
    area.innerHTML = '';
    const filteredData = filterKelas === 'ALL' ? dataSiswaCache : dataSiswaCache.filter(s => s.kelas === filterKelas);

    if (filteredData.length === 0) {
        area.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 30px;">Tidak ada data santri untuk dicetak.</p>';
        return;
    }

    const logoToUse = "https://i.ibb.co.com/Qjj8Rxtr/logo-sekolah.png";

    filteredData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'qr-id-card';

        card.innerHTML = `
            <div class="id-card-header">
                <img src="${logoToUse}" class="card-logo" alt="Logo">
                <div class="id-card-title">${appSettings.appName}</div>
                <div class="id-card-subtitle">KARTU TANDA SANTRI</div>
            </div>
            <div class="id-card-body">
                <div class="qr-box-frame">
                    <canvas id="qr-${item.id}"></canvas>
                </div>
                <h4 class="id-card-name">${item.nama}</h4>
                <div class="id-card-class-pill">Kelas: ${item.kelas}</div>
                <div class="id-card-id-code">ID: ${item.id}</div>
            </div>
            <div class="id-card-footer">
                <span>Presensi Digital Santri</span>
            </div>
        `;
        area.appendChild(card);

        new QRious({
            element: document.getElementById(`qr-${item.id}`),
            value: item.qr_payload,
            size: 110,
            backgroundAlpha: 0,
            foreground: '#0f172a',
            level: 'H'
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const selectKartu = document.getElementById('filterKelasKartu');
    if (selectKartu) selectKartu.addEventListener('change', generateCardsDOM);
});

// -------------------------------------------------------------
// REKAP & LAPORAN PRESENSI (UPGRADED: MATRIKS BULANAN & GURU NGAJI)
// -------------------------------------------------------------
function setRekapMode(mode) {
    currentRekapMode = mode;
    const btnHarian = document.getElementById('btnModeHarian');
    const btnBulanan = document.getElementById('btnModeBulanan');
    const groupTgl = document.getElementById('filterTanggalGroup');
    const groupBln = document.getElementById('filterBulanGroup');
    const groupThn = document.getElementById('filterTahunGroup');
    const areaHarian = document.getElementById('rekapHarianArea');
    const areaBulanan = document.getElementById('rekapBulananArea');

    if (mode === 'bulanan') {
        btnBulanan.classList.add('active');
        btnHarian.classList.remove('active');
        groupTgl.classList.add('hidden');
        groupBln.classList.remove('hidden');
        groupThn.classList.remove('hidden');
        areaHarian.classList.add('hidden');
        areaBulanan.classList.remove('hidden');
    } else {
        btnHarian.classList.add('active');
        btnBulanan.classList.remove('active');
        groupTgl.classList.remove('hidden');
        groupBln.classList.add('hidden');
        groupThn.classList.add('hidden');
        areaHarian.classList.remove('hidden');
        areaBulanan.classList.add('hidden');
    }

    applyRekapFilter();
}

async function loadRekapData() {
    const tbodyHarian = document.querySelector('#tableRekap tbody');
    tbodyHarian.innerHTML = '<tr><td colspan="6" style="text-align: center;"><span class="loader"></span> Memuat rekap presensi...</td></tr>';
    
    try {
        const [resRekap, resSiswa] = await Promise.all([
            fetchAPI('getRekap'),
            dataSiswaCache.length === 0 ? fetchAPI('getSiswa') : Promise.resolve({ success: true, data: dataSiswaCache })
        ]);

        if (resSiswa.success) dataSiswaCache = resSiswa.data;

        if (resRekap.success) {
            rekapCache = resRekap.data;
            applyRekapFilter();
            updateDashboardStats();
        } else {
            tbodyHarian.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Gagal mengambil data rekap.</td></tr>';
        }
    } catch (e) {
        tbodyHarian.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Koneksi terputus.</td></tr>';
    }
}

function applyRekapFilter() {
    const valKelas = document.getElementById('filterKelasRekap').value;
    const valPengawas = document.getElementById('filterPengawasRekap').value;
    const valKegiatan = document.getElementById('filterKegiatanRekap').value;

    document.getElementById('metaKelas').innerText = valKelas === 'ALL' ? 'Semua Kelas' : valKelas;
    document.getElementById('metaPengawas').innerText = valPengawas === 'ALL' ? 'Semua Guru Ngaji' : valPengawas;

    if (currentRekapMode === 'harian') {
        const valTgl = document.getElementById('filterTanggal').value;
        let targetTgl = "";
        if (valTgl) {
            const parts = valTgl.split('-');
            if (parts.length === 3) targetTgl = parts[2] + '/' + parts[1] + '/' + parts[0];
        }
        document.getElementById('metaPeriode').innerText = targetTgl ? 'Tanggal ' + targetTgl : 'Semua Tanggal';

        const filtered = rekapCache.filter(item => {
            const matchTgl = !targetTgl || item.tanggal === targetTgl;
            const matchKelas = valKelas === 'ALL' || item.kelas === valKelas;
            const matchPengawas = valPengawas === 'ALL' || item.pengawas === valPengawas;
            const matchKeg = valKegiatan === 'ALL' || item.kegiatan === valKegiatan;
            return matchTgl && matchKelas && matchPengawas && matchKeg;
        });

        renderTabelHarian(filtered);

    } else {
        const monthNum = parseInt(document.getElementById('filterBulan').value, 10);
        const yearNum = parseInt(document.getElementById('filterTahun').value, 10);
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        document.getElementById('metaPeriode').innerText = monthNames[monthNum - 1] + ' ' + yearNum;

        renderMatriksBulanan(monthNum, yearNum, valKelas, valPengawas, valKegiatan);
    }
}

function renderTabelHarian(dataArray) {
    const tbody = document.querySelector('#tableRekap tbody');
    if (dataArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Tidak ada data presensi yang sesuai filter.</td></tr>';
        return;
    }
    let html = '';
    dataArray.forEach(item => {
        html += `<tr>
            <td>${item.tanggal}</td>
            <td><code>${item.waktu}</code></td>
            <td><strong>${item.nama}</strong></td>
            <td><span class="user-profile" style="font-size:0.75rem;">${item.kelas}</span></td>
            <td>${item.kegiatan}</td>
            <td><i class="fas fa-user-tie text-muted"></i> ${item.pengawas}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function renderMatriksBulanan(month, year, filterKelas, filterPengawas, filterKegiatan) {
    const thead = document.getElementById('matrixHead');
    const tbody = document.getElementById('matrixBody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const daysInMonth = new Date(year, month, 0).getDate();

    // 1. Header Tabel Matriks (Tanpa Kolom Tempat Ngaji)
    let trHead = '<tr>';
    trHead += '<th class="sticky-col col-no">No</th>';
    trHead += '<th class="sticky-col col-id">ID</th>';
    trHead += '<th class="sticky-col col-nama">Nama Santri</th>';
    trHead += '<th class="col-kelas">Kelas</th>';

    for (let d = 1; d <= daysInMonth; d++) {
        trHead += `<th class="col-day">${d}</th>`;
    }
    trHead += '<th class="col-total">Total Hadir</th></tr>';
    thead.innerHTML = trHead;

    // 2. Filter Daftar Santri
    let daftarSantri = dataSiswaCache.filter(s => {
        return filterKelas === 'ALL' || s.kelas === filterKelas;
    });

    if (daftarSantri.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${daysInMonth + 5}" style="text-align: center; padding: 25px;">Tidak ada data santri untuk filter kelas ini.</td></tr>`;
        return;
    }

    // 3. Petakan Presensi
    const presensiMap = {};

    rekapCache.forEach(log => {
        if (filterPengawas !== 'ALL' && log.pengawas !== filterPengawas) return;
        if (filterKegiatan !== 'ALL' && log.kegiatan !== filterKegiatan) return;

        if (!log.tanggal) return;
        const parts = log.tanggal.split('/');
        if (parts.length === 3) {
            const logDay = parseInt(parts[0], 10);
            const logMonth = parseInt(parts[1], 10);
            const logYear = parseInt(parts[2], 10);

            if (logMonth === month && logYear === year) {
                const sId = log.id_siswa;
                if (!presensiMap[sId]) presensiMap[sId] = {};
                presensiMap[sId][logDay] = {
                    waktu: log.waktu,
                    pengawas: log.pengawas,
                    kegiatan: log.kegiatan
                };
            }
        }
    });

    // 4. Render Baris Santri
    let htmlRows = '';
    daftarSantri.forEach((santri, idx) => {
        let totalHadir = 0;
        let dayCells = '';

        for (let d = 1; d <= daysInMonth; d++) {
            const isHadir = presensiMap[santri.id] && presensiMap[santri.id][d];
            if (isHadir) {
                totalHadir++;
                dayCells += `<td class="cell-check" title="Tgl ${d}: Hadir (${isHadir.kegiatan})"><i class="fas fa-check"></i></td>`;
            } else {
                dayCells += `<td class="cell-empty">-</td>`;
            }
        }

        htmlRows += `<tr>
            <td class="sticky-col col-no">${idx + 1}</td>
            <td class="sticky-col col-id"><code>${santri.id}</code></td>
            <td class="sticky-col col-nama"><strong>${santri.nama}</strong></td>
            <td class="col-kelas"><span class="user-profile" style="font-size:0.7rem;">${santri.kelas}</span></td>
            ${dayCells}
            <td class="col-total"><strong>${totalHadir}</strong></td>
        </tr>`;
    });

    tbody.innerHTML = htmlRows;
}

// -------------------------------------------------------------
// DOWNLOAD LAPORAN PDF (HARIAN & BULANAN LANDSCAPE)
// -------------------------------------------------------------
function unduhLaporanPDF() {
    showToast("Menyiapkan dokumen PDF...");

    const valKelas = document.getElementById('filterKelasRekap').value;
    const valPengawas = document.getElementById('filterPengawasRekap').value;
    const metaPeriode = document.getElementById('metaPeriode').innerText;

    const printContainer = document.createElement('div');
    printContainer.style.padding = '15px';
    printContainer.style.backgroundColor = '#ffffff';
    printContainer.style.color = '#111111';
    printContainer.style.fontFamily = 'Helvetica, Arial, sans-serif';

    const kopHTML = `
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0 0 5px 0; font-size: 18px; color: #111;">${appSettings.appName}</h2>
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 500; color: #444;">
                ${currentRekapMode === 'bulanan' ? 'Laporan Matriks Presensi Bulanan' : 'Laporan Log Presensi Harian'}
            </h3>
            <div style="font-size: 11px; color: #555; display: flex; justify-content: space-around; flex-wrap: wrap; gap: 5px;">
                <span><strong>Kelas:</strong> ${valKelas === 'ALL' ? 'Semua Kelas' : valKelas}</span>
                <span><strong>Guru Ngaji:</strong> ${valPengawas === 'ALL' ? 'Semua Guru Ngaji' : valPengawas}</span>
                <span><strong>Periode:</strong> ${metaPeriode}</span>
            </div>
        </div>
    `;
    printContainer.innerHTML = kopHTML;

    let targetTable;
    let isLandscape = false;
    let pdfFilename = '';

    if (currentRekapMode === 'bulanan') {
        isLandscape = true;
        targetTable = document.getElementById('tableMatrix').cloneNode(true);
        pdfFilename = `Rekap_Bulanan_${valKelas.replace(/\s+/g, '_')}_${metaPeriode.replace(/\s+/g, '_')}.pdf`;

        targetTable.style.width = '100%';
        targetTable.style.borderCollapse = 'collapse';
        targetTable.style.fontSize = '8px';

        targetTable.querySelectorAll('th, td').forEach(el => {
            el.style.border = '0.5px solid #666';
            el.style.padding = '3px 2px';
            el.style.textAlign = 'center';
            el.style.color = '#000';
            el.style.position = 'static';
        });

        targetTable.querySelectorAll('th').forEach(th => {
            th.style.backgroundColor = '#e8f0fe';
            th.style.fontWeight = 'bold';
        });

        targetTable.querySelectorAll('td:nth-child(3)').forEach(td => {
            td.style.textAlign = 'left';
            td.style.paddingLeft = '5px';
        });

        targetTable.querySelectorAll('.cell-check').forEach(td => {
            td.innerHTML = '&#10003;';
            td.style.color = '#059669';
            td.style.fontWeight = 'bold';
        });

    } else {
        isLandscape = false;
        targetTable = document.getElementById('tableRekap').cloneNode(true);
        pdfFilename = `Rekap_Harian_${valKelas.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;

        targetTable.style.width = '100%';
        targetTable.style.borderCollapse = 'collapse';
        targetTable.style.fontSize = '10px';

        targetTable.querySelectorAll('th, td').forEach(el => {
            el.style.border = '0.5px solid #555';
            el.style.padding = '6px';
            el.style.color = '#000';
        });

        targetTable.querySelectorAll('th').forEach(th => {
            th.style.backgroundColor = '#f1f5f9';
            th.style.fontWeight = 'bold';
        });
    }

    printContainer.appendChild(targetTable);

    const footer = document.createElement('div');
    footer.style.marginTop = '15px';
    footer.style.fontSize = '9px';
    footer.style.color = '#666';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.innerHTML = `
        <span>Dicetak dari Sistem Presensi Santri</span>
        <span>Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}</span>
    `;
    printContainer.appendChild(footer);

    const opt = {
        margin: [8, 8, 8, 8],
        filename: pdfFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: isLandscape ? 'landscape' : 'portrait'
        }
    };

    html2pdf().set(opt).from(printContainer).save().then(() => {
        showToast("PDF berhasil diunduh!");
    }).catch(err => {
        console.error("PDF error:", err);
        showToast("Gagal memproses PDF.", true);
    });
}

// -------------------------------------------------------------
// DOWNLOAD LAPORAN CSV (HARIAN & BULANAN DENGAN UTF-8 BOM)
// -------------------------------------------------------------
function escapeCSV(text) {
    if (text === null || text === undefined) return '""';
    const str = String(text).replace(/"/g, '""');
    return '"' + str + '"';
}

function triggerDownloadCSV(filename, csvContent) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("File CSV berhasil diunduh!");
}

function unduhLaporanCSV() {
    const valKelas = document.getElementById('filterKelasRekap').value;
    const valPengawas = document.getElementById('filterPengawasRekap').value;
    const valKegiatan = document.getElementById('filterKegiatanRekap').value;
    const metaPeriode = document.getElementById('metaPeriode').innerText;

    if (currentRekapMode === 'harian') {
        const valTgl = document.getElementById('filterTanggal').value;
        let targetTgl = "";
        if (valTgl) {
            const parts = valTgl.split('-');
            if (parts.length === 3) targetTgl = parts[2] + '/' + parts[1] + '/' + parts[0];
        }

        const filtered = rekapCache.filter(item => {
            const matchTgl = !targetTgl || item.tanggal === targetTgl;
            const matchKelas = valKelas === 'ALL' || item.kelas === valKelas;
            const matchPengawas = valPengawas === 'ALL' || item.pengawas === valPengawas;
            const matchKeg = valKegiatan === 'ALL' || item.kegiatan === valKegiatan;
            return matchTgl && matchKelas && matchPengawas && matchKeg;
        });

        if (filtered.length === 0) {
            showToast("Tidak ada data presensi untuk diunduh.", true);
            return;
        }

        let csv = [
            `Laporan Log Presensi Harian - ${appSettings.appName}`,
            `Kelas: ${valKelas === 'ALL' ? 'Semua Kelas' : valKelas} | Guru Ngaji: ${valPengawas === 'ALL' ? 'Semua Guru Ngaji' : valPengawas} | Periode: ${metaPeriode}`,
            "",
            ["No", "Tanggal", "Waktu", "ID Santri", "Nama Santri", "Kelas", "Kegiatan", "Guru Ngaji"].map(escapeCSV).join(",")
        ];

        filtered.forEach((item, idx) => {
            const row = [
                idx + 1,
                item.tanggal,
                item.waktu,
                item.id_siswa,
                item.nama,
                item.kelas,
                item.kegiatan,
                item.pengawas
            ];
            csv.push(row.map(escapeCSV).join(","));
        });

        const filename = `Rekap_Presensi_Harian_${valKelas.replace(/\s+/g, '_')}_${(targetTgl || 'Semua').replace(/\//g, '-')}.csv`;
        triggerDownloadCSV(filename, csv.join("\r\n"));

    } else {
        const monthNum = parseInt(document.getElementById('filterBulan').value, 10);
        const yearNum = parseInt(document.getElementById('filterTahun').value, 10);
        const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

        let daftarSantri = dataSiswaCache.filter(s => {
            return valKelas === 'ALL' || s.kelas === valKelas;
        });

        if (daftarSantri.length === 0) {
            showToast("Tidak ada data santri untuk diunduh.", true);
            return;
        }

        const presensiMap = {};
        rekapCache.forEach(log => {
            if (valPengawas !== 'ALL' && log.pengawas !== valPengawas) return;
            if (valKegiatan !== 'ALL' && log.kegiatan !== valKegiatan) return;

            if (!log.tanggal) return;
            const parts = log.tanggal.split('/');
            if (parts.length === 3) {
                const logDay = parseInt(parts[0], 10);
                const logMonth = parseInt(parts[1], 10);
                const logYear = parseInt(parts[2], 10);

                if (logMonth === monthNum && logYear === yearNum) {
                    const sId = log.id_siswa;
                    if (!presensiMap[sId]) presensiMap[sId] = {};
                    presensiMap[sId][logDay] = true;
                }
            }
        });

        let csv = [
            `Laporan Matriks Presensi Bulanan - ${appSettings.appName}`,
            `Kelas: ${valKelas === 'ALL' ? 'Semua Kelas' : valKelas} | Guru Ngaji: ${valPengawas === 'ALL' ? 'Semua Guru Ngaji' : valPengawas} | Periode: ${metaPeriode}`,
            ""
        ];

        const headers = ["No", "ID Santri", "Nama Santri", "Kelas"];
        for (let d = 1; d <= daysInMonth; d++) {
            headers.push(`Tgl ${d}`);
        }
        headers.push("Total Hadir");
        csv.push(headers.map(escapeCSV).join(","));

        daftarSantri.forEach((santri, idx) => {
            let totalHadir = 0;
            const row = [idx + 1, santri.id, santri.nama, santri.kelas];

            for (let d = 1; d <= daysInMonth; d++) {
                const isHadir = presensiMap[santri.id] && presensiMap[santri.id][d];
                if (isHadir) {
                    totalHadir++;
                    row.push("Hadir");
                } else {
                    row.push("-");
                }
            }
            row.push(totalHadir);
            csv.push(row.map(escapeCSV).join(","));
        });

        const filename = `Rekap_Presensi_Bulanan_${valKelas.replace(/\s+/g, '_')}_${metaPeriode.replace(/\s+/g, '_')}.csv`;
        triggerDownloadCSV(filename, csv.join("\r\n"));
    }
}

// -------------------------------------------------------------
// SETTINGS & USER MANAGEMENT
// -------------------------------------------------------------
async function simpanPengaturan() {
    const btn = document.getElementById('btnSaveSet');
    const appName = document.getElementById('setAppName').value;

    btn.innerHTML = '<span class="loader"></span> Menyimpan...';
    try {
        const res = await fetchAPI('saveSettings', { useLogo: 'true', logoUrl: '', appName: appName });
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Nama Aplikasi';
        if (res.success) {
            showToast(res.message);
            loadInitialSettings();
        } else {
            showToast("Gagal menyimpan.", true);
        }
    } catch (e) {
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Nama Aplikasi';
        showToast("Error koneksi.", true);
    }
}

async function loadDataUsers() {
    const tbody = document.querySelector('#tableUsers tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><span class="loader"></span> Memuat akun...</td></tr>';
    try {
        const res = await fetchAPI('getUsers');
        if (res.success) {
            if (res.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">Belum ada akun.</td></tr>';
                return;
            }
            let html = '';
            res.data.forEach(u => {
                const roleDisplay = (u.role === 'Pengawas' ? 'Guru Ngaji' : u.role);
                html += `<tr>
                    <td><code>${u.id}</code></td>
                    <td><strong>${u.nama}</strong></td>
                    <td>${u.username}</td>
                    <td><span class="user-profile" style="font-size:0.75rem;">${roleDisplay}</span></td>
                    <td><button class="btn btn-danger" style="padding: 5px 10px;" onclick="hapusAkun('${u.id}')" title="Hapus"><i class="fas fa-trash"></i></button></td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }
    } catch (e) { }
}

async function tambahAkunBaru() {
    const nama = document.getElementById('akNama').value.trim();
    const user = document.getElementById('akUser').value.trim();
    const pass = document.getElementById('akPass').value.trim();
    const role = document.getElementById('akRole').value;
    if (!nama || !user || !pass) {
        showToast('Lengkapi semua data akun!', true);
        return;
    }

    const btn = document.getElementById('btnTambahAkun');
    btn.innerHTML = '<span class="loader"></span> Memproses...';
    try {
        const res = await fetchAPI('addUser', { nama, username: user, password: pass, role });
        btn.innerHTML = '<i class="fas fa-check"></i> Simpan Akun Baru';
        if (res.success) {
            showToast(res.message);
            loadDataUsers();
            loadFilterOptions();
            document.getElementById('formAkunBaru').classList.add('hidden');
            document.getElementById('akNama').value = '';
            document.getElementById('akUser').value = '';
            document.getElementById('akPass').value = '';
        } else {
            showToast(res.message, true);
        }
    } catch (e) {
        btn.innerHTML = '<i class="fas fa-check"></i> Simpan Akun Baru';
        showToast('Error koneksi ke server.', true);
    }
}

async function hapusAkun(id) {
    if (!confirm('Yakin ingin menghapus akun ID ' + id + '?')) return;
    try {
        const res = await fetchAPI('delUser', { id });
        if (res.success) {
            showToast(res.message);
            loadDataUsers();
            loadFilterOptions();
        } else {
            showToast(res.message, true);
        }
    } catch (e) {
        showToast('Gagal menghapus akun.', true);
    }
}
