// URL SERVER APPS SCRIPT ANDA
const API_URL = "https://script.google.com/macros/s/AKfycbwWIQp6o5xg2trNQL9_2O12jczX9QNWBGdy8-DmsmsRgtd3QJelr5Gte5Rc2QXXfqbZ/exec"; 

// CORE API FETCH
async function fetchAPI(action, payload = {}) {
  payload.action = action;
  const urlEncodedData = new URLSearchParams();
  urlEncodedData.append('data', JSON.stringify(payload));

  try {
    const response = await fetch(API_URL, {
      method: 'POST', body: urlEncodedData, redirect: 'follow' 
    });
    if (!response.ok) throw new Error("HTTP Status " + response.status);
    return await response.json();
  } catch (err) {
    console.error("Fetch API Error: ", err);
    throw new Error("Koneksi ke server gagal.");
  }
}

// STATE MANAGEMENT
let currentUser = null; let html5QrcodeScanner = null; let isScanning = false; let localScanCount = 0;
let appSettings = { useLogo: 'true', logoUrl: '', appName: 'Aplikasi Presensi' };

window.onload = async () => {
  await loadInitialSettings();
  const savedSession = sessionStorage.getItem('zettbotUser');
  if (savedSession) { currentUser = JSON.parse(savedSession); initApp(); }
};

async function loadInitialSettings() {
  try {
    const res = await fetchAPI('getSettings');
    if(res.success) {
      appSettings = res.data;
      applySettingsToUI();
      const btnLog = document.getElementById('btnLogin');
      btnLog.innerText = "Masuk Sistem"; btnLog.disabled = false;
    }
  } catch (err) {
    document.getElementById('btnLogin').innerText = "Gagal Konek Server";
    showToast("Gagal mengambil pengaturan logo.", true);
  }
}

function applySettingsToUI() {
  document.title = appSettings.appName;
  document.querySelectorAll('.app-title-display').forEach(el => el.innerText = appSettings.appName);
  
  const loginLogo = document.getElementById('loginLogo');
  const navLogo = document.getElementById('navLogo');
  
  if(appSettings.useLogo === 'true' || appSettings.useLogo === true) {
    if(appSettings.logoUrl) {
      loginLogo.src = appSettings.logoUrl; navLogo.src = appSettings.logoUrl;
      loginLogo.classList.remove('hidden'); navLogo.classList.remove('hidden');
    }
  } else {
    loginLogo.classList.add('hidden'); navLogo.classList.add('hidden');
  }

  document.getElementById('setAppName').value = appSettings.appName;
  document.getElementById('setUseLogo').value = appSettings.useLogo.toString();
  document.getElementById('setLogoUrl').value = appSettings.logoUrl;
  toggleLogoInput();
}

function toggleLogoInput() {
  const isUse = document.getElementById('setUseLogo').value === 'true';
  document.getElementById('logoUrlGroup').style.display = isUse ? 'block' : 'none';
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.querySelector('#toastMsg').innerText = msg;
  toast.querySelector('i').className = isError ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle';
  toast.querySelector('i').style.color = isError ? 'var(--danger)' : 'var(--neon-green)';
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--neon-green)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function switchTab(viewId, btnElement) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId).classList.remove('hidden');
  if(btnElement) btnElement.classList.add('active');
  if(viewId !== 'viewScan' && isScanning) stopScanner();
  
  if(viewId === 'viewDataSiswa') loadDataSiswa();
  if(viewId === 'viewCetakKartu') renderKartuQR();
  if(viewId === 'viewRekap') loadRekapData();
  if(viewId === 'viewSettings') loadDataUsers();
}

async function handleLogin() {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  const btn = document.getElementById('btnLogin');
  btn.innerHTML = '<span class="loader"></span> Proses...'; btn.disabled = true;

  try {
    const res = await fetchAPI('login', { username: u, password: p });
    btn.innerHTML = 'Masuk Sistem'; btn.disabled = false;
    if (res.success) {
      currentUser = res.userData; sessionStorage.setItem('zettbotUser', JSON.stringify(currentUser));
      showToast('Login Berhasil!'); initApp();
    } else showToast(res.message, true);
  } catch (err) {
    btn.innerHTML = 'Masuk Sistem'; btn.disabled = false; showToast(err.message, true);
  }
}

function logout() { sessionStorage.removeItem('zettbotUser'); location.reload(); }

function initApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('lblUser').innerText = currentUser.nama;
  document.getElementById('lblRole').innerText = currentUser.role;

  let htmlMenu = '<div class="tab-btn active" onclick="switchTab(\'viewScan\', this)"><i class="fas fa-camera"></i> Scan</div>' +
                 '<div class="tab-btn" onclick="switchTab(\'viewRekap\', this)"><i class="fas fa-file-alt"></i> Laporan</div>';
  if (currentUser.role === 'Admin') {
    htmlMenu += '<div class="tab-btn" onclick="switchTab(\'viewDataSiswa\', this)"><i class="fas fa-users"></i> Siswa</div>' +
                '<div class="tab-btn" onclick="switchTab(\'viewCetakKartu\', this)"><i class="fas fa-id-badge"></i> Cetak</div>'+
                '<div class="tab-btn" onclick="switchTab(\'viewSettings\', this)"><i class="fas fa-cogs"></i> Pengaturan</div>';
  }
  document.getElementById('menuTabs').innerHTML = htmlMenu;
  switchTab('viewScan', document.getElementById('menuTabs').firstElementChild);
}

function toggleCustomKegiatan() {
  const val = document.getElementById('kegiatanSelect').value;
  if(val === 'CUSTOM') document.getElementById('kegiatanCustom').classList.remove('hidden');
  else document.getElementById('kegiatanCustom').classList.add('hidden');
}

function startScanner() {
  document.getElementById('btnStartScan').classList.add('hidden');
  document.getElementById('btnStopScan').classList.remove('hidden');
  const statusBox = document.getElementById('scanStatus');
  statusBox.classList.remove('hidden', 'status-success', 'status-error');
  statusBox.innerHTML = 'Meminta izin kamera...';

  const selectedCam = document.getElementById('kameraSelect').value; 

  html5QrcodeScanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  
  html5QrcodeScanner.start({ facingMode: selectedCam }, config, onScanSuccess)
  .then(() => { isScanning = true; statusBox.innerHTML = 'Kamera aktif.'; })
  .catch(err => {
    statusBox.className = 'scan-status status-error';
    statusBox.innerHTML = 'Gagal membuka kamera pilihan Anda. Pastikan izin browser diberikan.';
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
    });
  }
}

let lastScannedData = null; let blockScan = false;
async function onScanSuccess(decodedText) {
  if (blockScan || decodedText === lastScannedData) return;
  blockScan = true; lastScannedData = decodedText;
  
  const statusBox = document.getElementById('scanStatus');
  statusBox.className = 'scan-status'; statusBox.innerHTML = '<span class="loader" style="width:15px;height:15px;border-width:2px;"></span> Memproses...';

  let kegiatan = document.getElementById('kegiatanSelect').value;
  if(kegiatan === 'CUSTOM') {
     kegiatan = document.getElementById('kegiatanCustom').value;
     if(!kegiatan) kegiatan = "Kegiatan Lainnya"; 
  }
  
  try {
    const res = await fetchAPI('scan', { qrData: decodedText, kegiatan: kegiatan, pengawas: currentUser.nama });
    if(res.success) {
      statusBox.className = 'scan-status status-success'; statusBox.innerHTML = '<i class="fas fa-check"></i> ' + res.message;
      appendLiveScanTable(res.scanData); showToast(res.message);
    } else {
      statusBox.className = 'scan-status status-error'; statusBox.innerHTML = '<i class="fas fa-times"></i> ' + res.message;
    }
  } catch (err) {
    statusBox.className = 'scan-status status-error'; statusBox.innerHTML = 'Koneksi Terputus.';
  }
  setTimeout(() => { blockScan = false; }, 1500);
}

function appendLiveScanTable(data) {
  localScanCount++; document.getElementById('liveCounter').innerText = localScanCount;
  const tbody = document.querySelector('#tableLiveScan tbody');
  const tr = document.createElement('tr'); tr.style.background = 'rgba(0, 255, 170, 0.1)';
  tr.innerHTML = `<td>${data.waktu}</td><td><strong>${data.nama}</strong></td><td>${data.kelas}</td>`;
  tbody.insertBefore(tr, tbody.firstChild);
  setTimeout(() => { tr.style.background = 'transparent'; }, 2000);
}

async function simpanPengaturan() {
  const btn = document.getElementById('btnSaveSet');
  const useLogo = document.getElementById('setUseLogo').value;
  const logoUrl = document.getElementById('setLogoUrl').value;
  const appName = document.getElementById('setAppName').value;

  btn.innerHTML = '<span class="loader"></span> Menyimpan...';
  try {
    const res = await fetchAPI('saveSettings', { useLogo, logoUrl, appName });
    btn.innerHTML = '<i class="fas fa-save"></i> Simpan Pengaturan';
    if(res.success) { showToast(res.message); loadInitialSettings(); } 
    else showToast("Gagal menyimpan.", true);
  } catch(e) { btn.innerHTML = '<i class="fas fa-save"></i> Simpan Pengaturan'; showToast("Error koneksi.", true); }
}

async function loadDataUsers() {
  const tbody = document.querySelector('#tableUsers tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><span class="loader"></span> Memuat akun...</td></tr>';
  try {
    const res = await fetchAPI('getUsers');
    if (res.success) {
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5">Kosong.</td></tr>'; return; }
      let html = '';
      res.data.forEach(u => {
        html += `<tr><td>${u.id}</td><td>${u.nama}</td><td>${u.username}</td><td><span class="user-profile" style="font-size:0.75rem;">${u.role}</span></td>
                 <td><button class="btn btn-danger" style="padding: 5px 10px;" onclick="hapusAkun('${u.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
      });
      tbody.innerHTML = html;
    }
  } catch(e) {}
}

async function tambahAkunBaru() {
  const nama = document.getElementById('akNama').value;
  const user = document.getElementById('akUser').value;
  const pass = document.getElementById('akPass').value;
  const role = document.getElementById('akRole').value;
  if(!nama || !user || !pass) { showToast('Lengkapi semua data!', true); return; }

  const btn = document.getElementById('btnTambahAkun');
  btn.innerHTML = '<span class="loader"></span> Memproses...';
  try {
    const res = await fetchAPI('addUser', { nama, username: user, password: pass, role });
    btn.innerHTML = 'Simpan Akun Baru';
    if(res.success) {
      showToast(res.message); loadDataUsers();
      document.getElementById('formAkunBaru').classList.add('hidden');
      document.getElementById('akNama').value=''; document.getElementById('akUser').value=''; document.getElementById('akPass').value='';
    } else showToast(res.message, true);
  } catch(e) { btn.innerHTML = 'Simpan Akun Baru'; showToast('Error koneksi', true); }
}

async function hapusAkun(id) {
  if(!confirm('Yakin ingin menghapus akun ID '+id+'?')) return;
  try { const res = await fetchAPI('delUser', { id }); if(res.success) { showToast(res.message); loadDataUsers(); } else showToast(res.message, true); } catch(e) {}
}

let dataSiswaCache = [];
function toggleBatchPaste() { document.getElementById('batchArea').classList.toggle('hidden'); }

async function loadDataSiswa() {
  document.querySelector('#tableSiswa tbody').innerHTML = '<tr><td colspan="4" style="text-align: center;"><span class="loader"></span> Memuat...</td></tr>';
  try { const res = await fetchAPI('getSiswa'); if (res.success) { dataSiswaCache = res.data; renderTabelSiswa(dataSiswaCache); } } catch(e) {}
}

function renderTabelSiswa(dataArray) {
  const tbody = document.querySelector('#tableSiswa tbody');
  if (dataArray.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada data siswa.</td></tr>'; return; }
  let html = '';
  dataArray.forEach(item => {
    html += `<tr><td>${item.id}</td><td>${item.nama}</td><td><span class="user-profile" style="font-size:0.75rem;">${item.kelas}</span></td>
             <td><button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" onclick="hapusSiswa('${item.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
  });
  tbody.innerHTML = html;
}

function filterTabelSiswa() {
  const keyword = document.getElementById('searchSiswa').value.toLowerCase();
  const filtered = dataSiswaCache.filter(item => item.nama.toLowerCase().includes(keyword) || item.kelas.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword));
  renderTabelSiswa(filtered);
}

async function prosesBatchImport() {
  const text = document.getElementById('pasteData').value;
  if (!text) { showToast('Data kosong', true); return; }
  const btn = document.querySelector('#batchArea .btn-primary');
  btn.innerHTML = '<span class="loader"></span> Memproses...';
  try {
    const res = await fetchAPI('batchSiswa', { text: text });
    btn.innerHTML = 'Simpan Data Batch';
    if(res.success) { showToast(res.message); document.getElementById('pasteData').value = ''; toggleBatchPaste(); loadDataSiswa(); } 
    else showToast(res.message, true);
  } catch (e) { btn.innerHTML = 'Simpan Data Batch'; showToast('Error', true); }
}

async function hapusSiswa(id) {
  if(!confirm('Hapus siswa ID ' + id + '?')) return;
  try { const res = await fetchAPI('delSiswa', { id: id }); if(res.success) { showToast(res.message); loadDataSiswa(); } } catch(e) {}
}

async function renderKartuQR() {
  if(dataSiswaCache.length === 0) {
    try { const res = await fetchAPI('getSiswa'); if(res.success) { dataSiswaCache = res.data; generateCardsDOM(); } } catch(e) {}
  } else generateCardsDOM();
}

function generateCardsDOM() {
  const area = document.getElementById('printArea');
  const filterKelas = document.getElementById('filterKelasKartu') ? document.getElementById('filterKelasKartu').value : 'ALL';
  area.innerHTML = '';
  const filteredData = filterKelas === 'ALL' ? dataSiswaCache : dataSiswaCache.filter(s => s.kelas === filterKelas);
  
  if(filteredData.length === 0) { 
    area.innerHTML = '<p class="text-muted">Tidak ada data untuk dicetak.</p>'; return; 
  }

  const logoToUse = (appSettings.useLogo === 'true' && appSettings.logoUrl) ? appSettings.logoUrl : '';

  filteredData.forEach(item => {
    const card = document.createElement('div'); 
    card.className = 'qr-id-card';
    
    let headerHTML = '';
    if (logoToUse) {
      headerHTML = `<img src="${logoToUse}" class="card-logo" alt="Logo">`;
    } else {
      headerHTML = `<div style="font-weight:bold; font-size:0.8rem; margin-bottom:5px;">${appSettings.appName}</div>`;
    }
    
    const textHTML = `
      ${headerHTML}
      <strong style="font-size:0.75rem; color:#444; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 5px; width: 100%; display:block;">KARTU PRESENSI</strong>
      <canvas id="qr-${item.id}"></canvas>
      <h4>${item.nama}</h4>
      <p>Kelas: ${item.kelas}<br>ID: ${item.id}</p>
    `;
    
    card.innerHTML = textHTML;
    area.appendChild(card);
    
    new QRious({ 
      element: document.getElementById(`qr-${item.id}`), 
      value: item.qr_payload, 
      size: 130, 
      backgroundAlpha: 0, 
      foreground: 'black', 
      level: 'H' 
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
   const selectKartu = document.getElementById('filterKelasKartu');
   if(selectKartu) selectKartu.addEventListener('change', generateCardsDOM);
});

let rekapCache = [];
async function loadRekapData() {
  document.querySelector('#tableRekap tbody').innerHTML = '<tr><td colspan="6" style="text-align: center;"><span class="loader"></span> Memuat...</td></tr>';
  try {
    const res = await fetchAPI('getRekap');
    if (res.success) {
      rekapCache = res.data;
      if(!document.getElementById('filterTanggal').value) {
          const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000;
          document.getElementById('filterTanggal').value = (new Date(now - tzOffset)).toISOString().slice(0,10);
      }
      filterTabelRekap(); 
    }
  } catch(e) {}
}

function filterTabelRekap() {
  const valTgl = document.getElementById('filterTanggal').value;
  const valKeg = document.getElementById('filterKegiatanRekap').value;
  let targetTgl = "";
  if(valTgl) { const parts = valTgl.split('-'); if(parts.length === 3) targetTgl = parts[2] + '/' + parts[1] + '/' + parts[0]; }
  const filtered = rekapCache.filter(item => {
    return (!targetTgl || item.tanggal === targetTgl) && (valKeg === 'ALL' || item.kegiatan === valKeg);
  });
  renderTabelRekap(filtered);
}

function renderTabelRekap(dataArray) {
  const tbody = document.querySelector('#tableRekap tbody');
  if (dataArray.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Tidak ada data presensi.</td></tr>'; return; }
  let html = '';
  dataArray.forEach(item => {
    html += `<tr><td>${item.tanggal}</td><td>${item.waktu}</td><td><strong>${item.nama}</strong></td>
             <td><span class="user-profile" style="font-size:0.75rem;">${item.kelas}</span></td><td>${item.kegiatan}</td>
             <td><i class="fas fa-user-shield text-muted"></i> ${item.pengawas}</td></tr>`;
  });
  tbody.innerHTML = html;
}

function downloadPDFRekap() {
  showToast("Menyiapkan dokumen PDF...");
  const table = document.getElementById('tableRekap');
  const printArea = document.createElement('div');
  printArea.innerHTML = `
    <div style="text-align:center; margin-bottom:20px; font-family:sans-serif;">
      <h2>Laporan Presensi - ${appSettings.appName}</h2>
      <p style="color:#555;">Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</p>
    </div>
  `;
  
  const clonedTable = table.cloneNode(true);
  clonedTable.style.width = '100%';
  clonedTable.style.borderCollapse = 'collapse';
  clonedTable.style.fontFamily = 'sans-serif';
  clonedTable.style.fontSize = '12px';
  
  clonedTable.querySelectorAll('th, td').forEach(el => {
     el.style.border = '1px solid #000';
     el.style.padding = '8px';
     el.style.color = '#000';
  });
  clonedTable.querySelectorAll('th').forEach(el => {
     el.style.backgroundColor = '#f0f0f0';
  });
  
  printArea.appendChild(clonedTable);
  printArea.style.padding = '20px';
  printArea.style.backgroundColor = '#fff';

  const opt = {
    margin:       10,
    filename:     `Rekap_Presensi_${new Date().getTime()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(printArea).save().then(() => {
    showToast("PDF berhasil diunduh!");
  }).catch(err => {
    showToast("Gagal memproses PDF.", true);
  });
}
