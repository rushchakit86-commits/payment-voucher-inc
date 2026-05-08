// ========== State ==========
let currentInvoiceId = null;
let projects = [];

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadProjects();
  checkGoogleStatus();
  checkAIStatus();

  // Set default date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inv_date').value = today;
  document.getElementById('vcr_date').value = today;

  // Add first item row
  addItemRow();
  addAccountRow();
  addAccountRow();
});

// ========== Navigation ==========
function showPage(page) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  // Load data for the page
  if (page === 'dashboard') loadDashboard();
  if (page === 'invoices') loadInvoices();
  if (page === 'vouchers') loadVouchers();
  if (page === 'projects') loadProjectsList();
  if (page === 'search') loadSearchFilters();
}

// ========== Toast Notifications ==========
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ========== Modal ==========
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ========== API Helpers ==========
async function api(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

function formatMoney(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status) {
  const map = {
    pending: '<span class="status-badge status-pending">รอดำเนินการ</span>',
    completed: '<span class="status-badge status-completed">เสร็จแล้ว</span>',
    draft: '<span class="status-badge status-draft">ร่าง</span>'
  };
  return map[status] || `<span class="status-badge">${status}</span>`;
}

// ========== Dashboard ==========
async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    document.getElementById('statInvoices').textContent = data.totalInvoices;
    document.getElementById('statVouchers').textContent = data.totalVouchers;
    document.getElementById('statAmount').textContent = '฿' + formatMoney(data.totalAmount);
    document.getElementById('statPending').textContent = data.pendingInvoices;
    document.getElementById('invoiceCount').textContent = data.totalInvoices;
    document.getElementById('voucherCount').textContent = data.totalVouchers;

    // Project summary
    const pBody = document.getElementById('projectSummaryBody');
    pBody.innerHTML = data.projectSummary.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.invoice_count}</td>
        <td class="amount">${formatMoney(p.total_amount)}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="empty-state"><p>ยังไม่มีข้อมูล</p></td></tr>';

    // Recent invoices
    const rBody = document.getElementById('recentInvoicesBody');
    rBody.innerHTML = data.recentInvoices.map(inv => `
      <tr>
        <td>${inv.invoice_number}</td>
        <td>${inv.project_name || '-'}</td>
        <td>${inv.seller_name}</td>
        <td>${formatDate(inv.invoice_date)}</td>
        <td class="amount">${formatMoney(inv.grand_total)}</td>
        <td>${statusBadge(inv.status)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state"><p>ยังไม่มีเอกสาร</p></td></tr>';
  } catch (e) { }
}

// ========== Projects ==========
async function loadProjects() {
  try {
    projects = await api('/api/projects');
    updateProjectDropdowns();
  } catch (e) { }
}

function updateProjectDropdowns() {
  const selects = ['inv_project_id', 'invoiceProjectFilter', 'searchProject'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const firstOpt = el.querySelector('option');
    el.innerHTML = '';
    el.appendChild(firstOpt);
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      el.appendChild(opt);
    });
  });
}

async function loadProjectsList() {
  try {
    const projectsList = await api('/api/projects');
    const invoices = await api('/api/invoices');

    const body = document.getElementById('projectsBody');
    body.innerHTML = projectsList.map(p => {
      const cnt = invoices.filter(i => i.project_id === p.id).length;
      return `
        <tr>
          <td>${p.id}</td>
          <td><strong>${p.name}</strong></td>
          <td>${p.description || '-'}</td>
          <td>${cnt}</td>
          <td>${formatDate(p.created_at)}</td>
        </tr>
      `;
    }).join('');
  } catch (e) { }
}

function openProjectModal() { openModal('projectModal'); }

async function submitProject(event) {
  event.preventDefault();
  try {
    await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('proj_name').value,
        description: document.getElementById('proj_desc').value
      })
    });
    showToast('เพิ่มโปรเจคสำเร็จ');
    closeModal('projectModal');
    document.getElementById('projectForm').reset();
    loadProjects();
    loadProjectsList();
  } catch (e) { }
}

async function quickAddProject() {
  const name = prompt('ชื่อโปรเจค:');
  if (!name) return;
  try {
    const result = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: '' })
    });
    showToast('เพิ่มโปรเจค "' + name + '" สำเร็จ');
    await loadProjects();
    document.getElementById('inv_project_id').value = result.id;
  } catch (e) { }
}

// ========== Invoices ==========
async function loadInvoices() {
  try {
    const invoices = await api('/api/invoices');
    renderInvoices(invoices);
  } catch (e) { }
}

function renderInvoices(invoices) {
  const body = document.getElementById('invoicesBody');
  if (!invoices.length) {
    body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">📄</div><p>ยังไม่มีใบกำกับภาษี</p></div></td></tr>';
    return;
  }
  body.innerHTML = invoices.map((inv, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${inv.invoice_number}</strong></td>
      <td>${inv.project_name || '-'}</td>
      <td>${inv.seller_name}</td>
      <td>${formatDate(inv.invoice_date)}</td>
      <td class="amount">${formatMoney(inv.grand_total)}</td>
      <td>${statusBadge(inv.status)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewInvoice(${inv.id})">👁️</button>
        <button class="btn btn-success btn-sm" onclick="createVoucherFrom(${inv.id})">💳</button>
        <button class="btn btn-danger btn-sm" onclick="deleteInvoice(${inv.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function searchInvoices() {
  const search = document.getElementById('invoiceSearch').value;
  const projectId = document.getElementById('invoiceProjectFilter').value;
  const status = document.getElementById('invoiceStatusFilter').value;

  let url = `/api/invoices?search=${encodeURIComponent(search)}`;
  if (projectId) url += `&project_id=${projectId}`;
  if (status) url += `&status=${status}`;

  try {
    const invoices = await api(url);
    renderInvoices(invoices);
  } catch (e) { }
}

function openInvoiceModal() {
  loadProjects();
  openModal('invoiceModal');
}

// Items table
function addItemRow() {
  const body = document.getElementById('itemsBody');
  const rowNum = body.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${rowNum}</td>
    <td><input type="text" placeholder="รายการสินค้า/บริการ" class="item-desc"></td>
    <td><input type="number" value="1" min="1" class="item-qty" onchange="calcItemRow(this)"></td>
    <td><input type="number" step="0.01" value="0" class="item-price" onchange="calcItemRow(this)"></td>
    <td><input type="number" step="0.01" value="0" class="item-amount" readonly style="background:var(--gray-50)"></td>
    <td><button type="button" class="remove-item" onclick="this.closest('tr').remove();calcItemsTotal()">&times;</button></td>
  `;
  body.appendChild(tr);
}

function calcItemRow(el) {
  const row = el.closest('tr');
  const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
  const price = parseFloat(row.querySelector('.item-price').value) || 0;
  row.querySelector('.item-amount').value = (qty * price).toFixed(2);
  calcItemsTotal();
}

function calcItemsTotal() {
  let total = 0;
  document.querySelectorAll('#itemsBody .item-amount').forEach(el => {
    total += parseFloat(el.value) || 0;
  });
  document.getElementById('inv_before_vat').value = total.toFixed(2);
  calcInvoiceTotal();
}

function calcInvoiceTotal() {
  const beforeVat = parseFloat(document.getElementById('inv_before_vat').value) || 0;
  const discount = parseFloat(document.getElementById('inv_discount').value) || 0;
  const taxable = beforeVat - discount;
  const vat = taxable * 0.07;
  const grandTotal = taxable + vat;
  const wht = parseFloat(document.getElementById('inv_wht').value) || 0;
  const net = grandTotal - wht;

  document.getElementById('inv_vat').value = vat.toFixed(2);
  document.getElementById('inv_grand_total').value = grandTotal.toFixed(2);
  document.getElementById('inv_net').value = net.toFixed(2);
}

function showFileName(input, labelId) {
  const label = document.getElementById(labelId);
  if (input.files.length > 0) {
    label.textContent = input.files[0].name;
  }
}

async function submitInvoice(event) {
  event.preventDefault();

  // Collect items
  const items = [];
  document.querySelectorAll('#itemsBody tr').forEach(row => {
    const desc = row.querySelector('.item-desc').value;
    if (desc) {
      items.push({
        description: desc,
        quantity: parseFloat(row.querySelector('.item-qty').value) || 1,
        unit_price: parseFloat(row.querySelector('.item-price').value) || 0,
        amount: parseFloat(row.querySelector('.item-amount').value) || 0
      });
    }
  });

  const formData = new FormData();
  formData.append('project_id', document.getElementById('inv_project_id').value);
  formData.append('invoice_number', document.getElementById('inv_number').value);
  formData.append('invoice_date', document.getElementById('inv_date').value);
  formData.append('seller_name', document.getElementById('inv_seller').value);
  formData.append('seller_tax_id', document.getElementById('inv_tax_id').value);
  formData.append('seller_branch', document.getElementById('inv_branch').value);
  formData.append('total_before_vat', document.getElementById('inv_before_vat').value);
  formData.append('vat_amount', document.getElementById('inv_vat').value);
  formData.append('discount', document.getElementById('inv_discount').value);
  formData.append('grand_total', document.getElementById('inv_grand_total').value);
  formData.append('withholding_tax', document.getElementById('inv_wht').value);
  formData.append('net_total', document.getElementById('inv_net').value);
  formData.append('notes', document.getElementById('inv_notes').value);
  formData.append('items', JSON.stringify(items));

  const fileInput = document.getElementById('inv_file');
  if (fileInput.files.length > 0) {
    formData.append('file', fileInput.files[0]);
  }

  try {
    await fetch('/api/invoices', { method: 'POST', body: formData }).then(r => r.json());
    showToast('บันทึกใบกำกับภาษีสำเร็จ');
    closeModal('invoiceModal');
    document.getElementById('invoiceForm').reset();
    document.getElementById('itemsBody').innerHTML = '';
    document.getElementById('inv_file_name').textContent = '';
    addItemRow();
    loadInvoices();
    loadDashboard();
  } catch (e) { }
}

async function viewInvoice(id) {
  try {
    currentInvoiceId = id;
    const inv = await api(`/api/invoices/${id}`);
    const content = document.getElementById('invoiceDetailContent');

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <p style="color:var(--gray-500);font-size:13px">เลขที่ใบกำกับภาษี</p>
          <p style="font-weight:700;font-size:18px">${inv.invoice_number}</p>
        </div>
        <div>
          <p style="color:var(--gray-500);font-size:13px">วันที่</p>
          <p style="font-weight:600">${formatDate(inv.invoice_date)}</p>
        </div>
        <div>
          <p style="color:var(--gray-500);font-size:13px">โปรเจค</p>
          <p style="font-weight:600">${inv.project_name || '-'}</p>
        </div>
        <div>
          <p style="color:var(--gray-500);font-size:13px">สถานะ</p>
          <p>${statusBadge(inv.status)}</p>
        </div>
      </div>

      <div style="background:var(--gray-50);padding:16px;border-radius:var(--radius);margin-bottom:16px">
        <p style="font-weight:600;margin-bottom:8px">ผู้ขาย</p>
        <p>${inv.seller_name}</p>
        <p style="color:var(--gray-500);font-size:13px">เลขภาษี: ${inv.seller_tax_id || '-'} | สาขา: ${inv.seller_branch || '-'}</p>
      </div>

      ${inv.items && inv.items.length ? `
      <table style="margin-bottom:16px">
        <thead><tr><th>#</th><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">จำนวนเงิน</th></tr></thead>
        <tbody>
          ${inv.items.map(item => `
            <tr><td>${item.item_no}</td><td>${item.description}</td><td class="amount">${item.quantity}</td><td class="amount">${formatMoney(item.unit_price)}</td><td class="amount">${formatMoney(item.amount)}</td></tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}

      <div style="background:var(--primary-light);padding:16px;border-radius:var(--radius)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <p>มูลค่าก่อน VAT:</p><p class="amount">${formatMoney(inv.total_before_vat)}</p>
          <p>ภาษีมูลค่าเพิ่ม (VAT):</p><p class="amount">${formatMoney(inv.vat_amount)}</p>
          <p>ส่วนลด:</p><p class="amount">${formatMoney(inv.discount)}</p>
          <p style="font-weight:700;font-size:16px">ยอดรวมทั้งสิ้น:</p><p class="amount" style="font-weight:700;font-size:16px">${formatMoney(inv.grand_total)}</p>
        </div>
      </div>

      ${inv.google_drive_url ? `<p style="margin-top:12px"><a href="${inv.google_drive_url}" target="_blank" class="btn btn-outline btn-sm">📎 ดูไฟล์ใน Google Drive</a></p>` : ''}
      ${inv.notes ? `<p style="margin-top:12px;color:var(--gray-500)">หมายเหตุ: ${inv.notes}</p>` : ''}
    `;

    openModal('invoiceDetailModal');
  } catch (e) { }
}

async function deleteInvoice(id) {
  if (!confirm('ต้องการลบใบกำกับภาษีนี้หรือไม่?')) return;
  try {
    await api(`/api/invoices/${id}`, { method: 'DELETE' });
    showToast('ลบสำเร็จ');
    loadInvoices();
    loadDashboard();
  } catch (e) { }
}

// ========== Vouchers ==========
async function loadVouchers() {
  try {
    const vouchers = await api('/api/vouchers');
    renderVouchers(vouchers);
  } catch (e) { }
}

function renderVouchers(vouchers) {
  const body = document.getElementById('vouchersBody');
  if (!vouchers.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">💳</div><p>ยังไม่มีใบสำคัญจ่ายเงิน</p></div></td></tr>';
    return;
  }
  body.innerHTML = vouchers.map((v, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${v.voucher_number}</strong></td>
      <td>${v.payee_name}</td>
      <td>${formatDate(v.voucher_date)}</td>
      <td class="amount">${formatMoney(v.net_amount)}</td>
      <td>${statusBadge(v.status)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewVoucher(${v.id})" title="ดูรายละเอียด">👁️</button>
        <button class="btn btn-outline btn-sm" onclick="editVoucher(${v.id})" title="แก้ไข">✏️</button>
        <button class="btn btn-primary btn-sm" onclick="printVoucherById(${v.id})" title="พิมพ์">🖨️</button>
        <button class="btn btn-sm" onclick="deleteVoucher(${v.id}, '${v.voucher_number}')" title="ลบ" style="background:#ef4444;color:white">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function searchVouchers() {
  const search = document.getElementById('voucherSearch').value;
  try {
    const vouchers = await api(`/api/vouchers?search=${encodeURIComponent(search)}`);
    renderVouchers(vouchers);
  } catch (e) { }
}

async function deleteVoucher(id, voucherNumber) {
  if (!confirm(`ยืนยันลบใบสำคัญจ่าย ${voucherNumber} หรือไม่?\n\nการลบจะไม่สามารถกู้คืนได้`)) return;
  try {
    await api(`/api/vouchers/${id}`, { method: 'DELETE' });
    showToast(`ลบใบสำคัญจ่าย ${voucherNumber} สำเร็จ`);
    loadVouchers();
    loadDashboard();
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการลบ: ' + e.message, 'error');
  }
}

async function editVoucher(id) {
  try {
    const v = await api(`/api/vouchers/${id}`);

    // เติมข้อมูลในฟอร์ม
    document.getElementById('vcr_date').value = v.voucher_date || '';
    document.getElementById('vcr_invoice_id').value = v.invoice_id || '';
    document.getElementById('vcr_payee').value = v.payee_name || '';
    document.getElementById('vcr_description').value = v.description || '';
    document.getElementById('vcr_amount').value = v.amount || '';
    document.getElementById('vcr_vat').value = v.vat_amount || '';
    document.getElementById('vcr_wht').value = v.withholding_tax || '';
    document.getElementById('vcr_net').value = v.net_amount || '';
    document.getElementById('vcr_payment_method').value = v.payment_method || 'cash';
    document.getElementById('vcr_prepared_by').value = v.prepared_by || '';
    document.getElementById('vcr_approved_by').value = v.approved_by || '';
    document.getElementById('vcr_received_by').value = v.received_by || '';
    document.getElementById('vcr_checked_by').value = v.checked_by || '';

    // เติมข้อมูลเช็ค
    if (v.payment_method === 'cheque') {
      document.getElementById('vcr_cheque_info').value = [v.bank_name, v.bank_branch, v.cheque_number].filter(Boolean).join('/');
    } else {
      document.getElementById('vcr_cheque_info').value = '';
    }

    // เติมรายการบัญชี
    const accountsBody = document.getElementById('accountsBody');
    accountsBody.innerHTML = '';
    if (v.accounts && v.accounts.length > 0) {
      v.accounts.forEach(acc => {
        addAccountRow();
        const rows = accountsBody.querySelectorAll('tr');
        const lastRow = rows[rows.length - 1];
        const inputs = lastRow.querySelectorAll('input');
        if (inputs[0]) inputs[0].value = acc.account_code || '';
        if (inputs[1]) inputs[1].value = acc.account_name || '';
        if (inputs[2]) inputs[2].value = acc.debit || '';
        if (inputs[3]) inputs[3].value = acc.credit || '';
      });
    } else {
      addAccountRow();
      addAccountRow();
    }

    // เปลี่ยนหัวข้อ modal และเก็บ ID ที่กำลังแก้ไข
    const modal = document.getElementById('voucherModal');
    const title = modal.querySelector('h2') || modal.querySelector('.modal-title');
    if (title) title.textContent = 'แก้ไขใบสำคัญจ่าย: ' + v.voucher_number;

    // เก็บ editing ID ไว้ที่ฟอร์ม
    document.getElementById('voucherForm').dataset.editId = id;

    loadInvoicesForVoucher();
    openModal('voucherModal');
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + e.message, 'error');
  }
}

function openVoucherModal() {
  // Reset สำหรับสร้างใหม่
  delete document.getElementById('voucherForm').dataset.editId;
  const modal = document.getElementById('voucherModal');
  const title = modal.querySelector('h2') || modal.querySelector('.modal-title');
  if (title) title.textContent = 'สร้างใบสำคัญจ่ายเงิน';
  document.getElementById('voucherForm').reset();
  document.getElementById('accountsBody').innerHTML = '';
  addAccountRow();
  addAccountRow();

  loadInvoicesForVoucher();
  openModal('voucherModal');
}

async function loadInvoicesForVoucher() {
  try {
    const invoices = await api('/api/invoices');
    const select = document.getElementById('vcr_invoice_id');
    select.innerHTML = '<option value="">-- ไม่เลือก / กรอกเอง --</option>';
    invoices.forEach(inv => {
      const opt = document.createElement('option');
      opt.value = inv.id;
      opt.textContent = `${inv.invoice_number} - ${inv.seller_name} (${formatMoney(inv.grand_total)} บาท)`;
      select.appendChild(opt);
    });
  } catch (e) { }
}

async function fillFromInvoice(invoiceId) {
  if (!invoiceId) return;
  try {
    const inv = await api(`/api/invoices/${invoiceId}`);
    document.getElementById('vcr_payee').value = inv.seller_name;
    document.getElementById('vcr_amount').value = inv.total_before_vat;
    document.getElementById('vcr_vat').value = inv.vat_amount;
    document.getElementById('vcr_wht').value = inv.withholding_tax || 0;
    document.getElementById('vcr_net').value = inv.grand_total;

    // Build description from items
    if (inv.items && inv.items.length) {
      document.getElementById('vcr_description').value = inv.items.map(i => i.description).join('\n');
    }

    calcVoucherTotal();
  } catch (e) { }
}

function createVoucherFrom(invoiceId) {
  openVoucherModal();
  setTimeout(() => {
    document.getElementById('vcr_invoice_id').value = invoiceId;
    fillFromInvoice(invoiceId);
  }, 300);
}

function createVoucherFromInvoice() {
  closeModal('invoiceDetailModal');
  createVoucherFrom(currentInvoiceId);
}

function calcVoucherTotal() {
  const amount = parseFloat(document.getElementById('vcr_amount').value) || 0;
  const vat = parseFloat(document.getElementById('vcr_vat').value) || 0;
  const wht = parseFloat(document.getElementById('vcr_wht').value) || 0;
  document.getElementById('vcr_net').value = (amount + vat - wht).toFixed(2);
}

function toggleChequeFields() {
  const method = document.getElementById('vcr_payment_method').value;
  document.getElementById('chequeFields').style.display = method === 'cheque' ? 'block' : 'none';
}

// Account rows
function addAccountRow() {
  const body = document.getElementById('accountsBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="รหัส" class="acc-code"></td>
    <td><input type="text" placeholder="ชื่อบัญชี" class="acc-name"></td>
    <td><input type="number" step="0.01" value="0" class="acc-debit"></td>
    <td><input type="number" step="0.01" value="0" class="acc-credit"></td>
    <td><button type="button" class="remove-item" onclick="this.closest('tr').remove()">&times;</button></td>
  `;
  body.appendChild(tr);
}

async function submitVoucher(event) {
  event.preventDefault();

  const accounts = [];
  document.querySelectorAll('#accountsBody tr').forEach(row => {
    const code = row.querySelector('.acc-code').value;
    const name = row.querySelector('.acc-name').value;
    if (code || name) {
      accounts.push({
        account_code: code,
        account_name: name,
        debit: parseFloat(row.querySelector('.acc-debit').value) || 0,
        credit: parseFloat(row.querySelector('.acc-credit').value) || 0
      });
    }
  });

  const chequeInfo = document.getElementById('vcr_cheque_info').value;
  let bankName = '', bankBranch = '', chequeNumber = '';
  if (chequeInfo) {
    const parts = chequeInfo.split('/');
    bankName = parts[0] || '';
    bankBranch = parts[1] || '';
    chequeNumber = parts[2] || '';
  }

  const data = {
    voucher_date: document.getElementById('vcr_date').value,
    invoice_id: document.getElementById('vcr_invoice_id').value || null,
    payee_name: document.getElementById('vcr_payee').value,
    description: document.getElementById('vcr_description').value,
    amount: document.getElementById('vcr_amount').value,
    vat_amount: document.getElementById('vcr_vat').value,
    withholding_tax: document.getElementById('vcr_wht').value,
    net_amount: document.getElementById('vcr_net').value,
    payment_method: document.getElementById('vcr_payment_method').value,
    bank_name: bankName,
    bank_branch: bankBranch,
    cheque_number: chequeNumber,
    prepared_by: document.getElementById('vcr_prepared_by').value,
    approved_by: document.getElementById('vcr_approved_by').value,
    received_by: document.getElementById('vcr_received_by').value,
    checked_by: document.getElementById('vcr_checked_by').value,
    accounts: JSON.stringify(accounts)
  };

  try {
    const editId = document.getElementById('voucherForm').dataset.editId;
    let result;

    if (editId) {
      // แก้ไข
      result = await api(`/api/vouchers/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      showToast('แก้ไขใบสำคัญจ่ายสำเร็จ');
    } else {
      // สร้างใหม่
      result = await api('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      showToast(`สร้างใบสำคัญจ่ายเงิน ${result.voucher_number} สำเร็จ`);
    }

    closeModal('voucherModal');
    delete document.getElementById('voucherForm').dataset.editId;
    document.getElementById('voucherForm').reset();
    document.getElementById('accountsBody').innerHTML = '';
    addAccountRow();
    addAccountRow();

    // Update invoice status (สร้างใหม่เท่านั้น)
    if (!editId && data.invoice_id) {
      await api(`/api/invoices/${data.invoice_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
    }

    loadVouchers();
    loadDashboard();
  } catch (e) { }
}

async function viewVoucher(id) {
  try {
    const v = await api(`/api/vouchers/${id}`);
    const content = document.getElementById('voucherDetailContent');

    content.innerHTML = `
      <div id="voucherPrintArea">
        <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid var(--gray-800);padding-bottom:16px">
          <h2 style="font-size:16px">บริษัท ไอเอ็นซี เทคโนโลยี จำกัด</h2>
          <h1 style="font-size:20px;margin-top:8px">ใบสำคัญจ่ายเงิน</h1>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:16px">
          <div>
            <p><strong>เลขที่:</strong> ${v.voucher_number}</p>
            <p><strong>จ่ายให้แก่:</strong> ${v.payee_name}</p>
          </div>
          <div style="text-align:right">
            <p><strong>วันที่:</strong> ${formatDate(v.voucher_date)}</p>
            ${v.invoice_number ? `<p><strong>อ้างอิง:</strong> ${v.invoice_number}</p>` : ''}
          </div>
        </div>

        <table style="margin-bottom:16px">
          <thead><tr><th style="text-align:left">รายการ</th><th style="text-align:right">จำนวนเงิน</th></tr></thead>
          <tbody>
            <tr><td>${v.description || '-'}</td><td class="amount">${formatMoney(v.amount)}</td></tr>
          </tbody>
        </table>

        <div style="background:var(--gray-50);padding:16px;border-radius:var(--radius);margin-bottom:16px">
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
            <p>จำนวนเงิน:</p><p class="amount">${formatMoney(v.amount)}</p>
            <p>ภาษีมูลค่าเพิ่ม:</p><p class="amount">${formatMoney(v.vat_amount)}</p>
            <p>ภาษีหัก ณ ที่จ่าย:</p><p class="amount">${formatMoney(v.withholding_tax)}</p>
            <p style="font-weight:700;font-size:16px;border-top:2px solid var(--gray-300);padding-top:8px">จำนวนเงินสุทธิ:</p>
            <p class="amount" style="font-weight:700;font-size:16px;border-top:2px solid var(--gray-300);padding-top:8px">${formatMoney(v.net_amount)}</p>
          </div>
        </div>

        ${v.payment_method === 'cheque' ? `
        <p style="margin-bottom:16px"><strong>เช็ค:</strong> ${v.bank_name} / ${v.bank_branch} / เลขที่ ${v.cheque_number}</p>
        ` : `<p style="margin-bottom:16px"><strong>วิธีชำระ:</strong> ${v.payment_method === 'cash' ? 'เงินสด' : 'โอนเงิน'}</p>`}

        ${v.accounts && v.accounts.length ? `
        <table style="margin-bottom:16px">
          <thead><tr><th>รหัสบัญชี</th><th>ชื่อบัญชี</th><th style="text-align:right">เดบิต</th><th style="text-align:right">เครดิต</th></tr></thead>
          <tbody>
            ${v.accounts.map(a => `
              <tr><td>${a.account_code}</td><td>${a.account_name}</td><td class="amount">${a.debit ? formatMoney(a.debit) : ''}</td><td class="amount">${a.credit ? formatMoney(a.credit) : ''}</td></tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:32px;text-align:center">
          <div>
            <p style="border-top:1px solid var(--gray-400);padding-top:8px;margin-top:48px">จัดทำโดย</p>
            <p style="font-weight:600">${v.prepared_by || '.....................'}</p>
          </div>
          <div>
            <p style="border-top:1px solid var(--gray-400);padding-top:8px;margin-top:48px">อนุมัติและจ่ายเงินโดย</p>
            <p style="font-weight:600">${v.approved_by || '.....................'}</p>
          </div>
          <div>
            <p style="border-top:1px solid var(--gray-400);padding-top:8px;margin-top:48px">รับเงินโดย</p>
            <p style="font-weight:600">${v.received_by || '.....................'}</p>
          </div>
          <div>
            <p style="border-top:1px solid var(--gray-400);padding-top:8px;margin-top:48px">ตรวจสอบและบันทึกบัญชีโดย</p>
            <p style="font-weight:600">${v.checked_by || '.....................'}</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('printVoucherBtn').setAttribute('data-id', id);
    openModal('voucherDetailModal');
  } catch (e) { }
}

function printVoucher() {
  const area = document.getElementById('voucherPrintArea');
  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <html><head><title>ใบสำคัญจ่ายเงิน</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Sarabun', sans-serif; padding: 32px; color: #111; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px; border: 1px solid #ccc; }
      th { background: #f3f4f6; }
      .amount { text-align: right; font-family: monospace; }
      h1, h2 { margin: 0; }
    </style>
    </head><body>${area.innerHTML}</body></html>
  `);
  printWin.document.close();
  setTimeout(() => { printWin.print(); }, 500);
}

async function printVoucherById(id) {
  await viewVoucher(id);
  setTimeout(() => printVoucher(), 500);
}

// ========== Search ==========
function loadSearchFilters() { loadProjects(); }

async function globalSearchDocs() {
  const search = document.getElementById('globalSearch').value;
  const projectId = document.getElementById('searchProject').value;
  const dateFrom = document.getElementById('searchDateFrom').value;
  const dateTo = document.getElementById('searchDateTo').value;

  let url = `/api/invoices?search=${encodeURIComponent(search)}`;
  if (projectId) url += `&project_id=${projectId}`;
  if (dateFrom) url += `&date_from=${dateFrom}`;
  if (dateTo) url += `&date_to=${dateTo}`;

  try {
    const invoices = await api(url);
    const vouchers = await api(`/api/vouchers?search=${encodeURIComponent(search)}`);

    const results = [
      ...invoices.map(i => ({ type: 'ใบกำกับภาษี', number: i.invoice_number, project: i.project_name || '-', detail: i.seller_name, date: i.invoice_date, amount: i.grand_total, action: `viewInvoice(${i.id})` })),
      ...vouchers.map(v => ({ type: 'ใบสำคัญจ่าย', number: v.voucher_number, project: '-', detail: v.payee_name, date: v.voucher_date, amount: v.net_amount, action: `viewVoucher(${v.id})` }))
    ];

    document.getElementById('searchResultCount').textContent = results.length;
    document.getElementById('searchResults').style.display = 'block';

    const body = document.getElementById('searchResultsBody');
    body.innerHTML = results.map(r => `
      <tr>
        <td><span class="status-badge ${r.type === 'ใบกำกับภาษี' ? 'status-pending' : 'status-completed'}">${r.type}</span></td>
        <td><strong>${r.number}</strong></td>
        <td>${r.project}</td>
        <td>${r.detail}</td>
        <td>${formatDate(r.date)}</td>
        <td class="amount">${formatMoney(r.amount)}</td>
        <td><button class="btn btn-outline btn-sm" onclick="${r.action}">👁️ ดู</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7"><div class="empty-state"><p>ไม่พบผลการค้นหา</p></div></td></tr>';
  } catch (e) { }
}

// ========== Google Status ==========
async function checkGoogleStatus() {
  try {
    const status = await api('/api/google/status');
    const el = document.getElementById('googleStatus');
    if (status.connected) {
      el.innerHTML = '<span class="status-dot connected"></span>Google: เชื่อมต่อแล้ว';
    } else if (status.configured) {
      el.innerHTML = '<span class="status-dot disconnected"></span><a href="/auth/google" style="color:var(--primary-light)">เชื่อมต่อ Google</a>';
    } else {
      el.innerHTML = '<span class="status-dot disconnected"></span>Google: ไม่ได้ตั้งค่า';
    }
  } catch (e) { }
}

// ========== AI Status ==========
async function checkAIStatus() {
  try {
    const status = await api('/api/ai/status');
    const el = document.getElementById('aiStatus');
    if (el) {
      if (status.available) {
        el.innerHTML = '<span class="status-dot connected"></span>AI: ' + status.provider;
      } else {
        el.innerHTML = '<span class="status-dot disconnected"></span>AI: ใช้ regex (ตั้งค่า API Key เพื่อใช้ AI Vision)';
      }
    }
  } catch (e) { }
}

// ========== AI Vision - สกัดข้อมูล ==========
async function extractFromFile() {
  const fileInput = document.getElementById('inv_file');
  if (!fileInput.files.length) {
    showToast('กรุณาเลือกไฟล์ก่อนใช้ AI สกัดข้อมูล', 'error');
    return;
  }

  const btn = document.getElementById('extractBtn');
  const status = document.getElementById('extractStatus');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังสกัดข้อมูล...';
  status.textContent = 'กรุณารอสักครู่ AI กำลังอ่านเอกสาร...';

  // Show progress timer
  let seconds = 0;
  const progressMessages = [
    'กำลังแปลงเอกสารเป็นภาพ...',
    'AI กำลังวิเคราะห์เอกสาร...',
    'กำลังอ่านข้อมูลภาษาไทย...',
    'กำลังสกัดตัวเลขและรายการ...',
    'เกือบเสร็จแล้ว รอสักครู่...'
  ];
  const timer = setInterval(() => {
    seconds++;
    const msgIdx = Math.min(Math.floor(seconds / 15), progressMessages.length - 1);
    status.textContent = progressMessages[msgIdx] + ' (' + seconds + ' วินาที)';
  }, 1000);

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout
    const res = await fetch('/api/extract', { method: 'POST', body: formData, signal: controller.signal });
    clearTimeout(timeoutId);
    clearInterval(timer);
    const data = await res.json();

    if (!data.success) {
      showToast('ไม่สามารถสกัดข้อมูลได้: ' + (data.error || 'ไม่ทราบสาเหตุ'), 'error');
      status.textContent = 'สกัดข้อมูลไม่สำเร็จ';
      return;
    }

    // เติมข้อมูลลงฟอร์ม
    if (data.invoice_number) document.getElementById('inv_number').value = data.invoice_number;
    if (data.invoice_date) document.getElementById('inv_date').value = data.invoice_date;
    if (data.seller_name) document.getElementById('inv_seller').value = data.seller_name;
    if (data.seller_tax_id) document.getElementById('inv_tax_id').value = data.seller_tax_id;
    if (data.seller_branch) document.getElementById('inv_branch').value = data.seller_branch;

    // เติมรายการสินค้า
    if (data.items && data.items.length > 0) {
      document.getElementById('itemsBody').innerHTML = '';
      data.items.forEach(item => {
        addItemRow();
        const rows = document.getElementById('itemsBody').querySelectorAll('tr');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.item-desc').value = item.description || '';
        lastRow.querySelector('.item-qty').value = item.quantity || 1;
        lastRow.querySelector('.item-price').value = item.unit_price || 0;
        lastRow.querySelector('.item-amount').value = item.amount || 0;
      });
    }

    // เติมจำนวนเงิน — พร้อม validation แก้ไขตัวเลขที่ AI สกัดผิด
    let beforeVat = parseFloat(data.total_before_vat) || 0;
    let vatAmt = parseFloat(data.vat_amount) || 0;
    let grandTotal = parseFloat(data.grand_total) || 0;
    const discountAmt = parseFloat(data.discount) || 0;

    // กรณี 1: AI สลับ total_before_vat กับ grand_total (grand_total ต้อง >= total_before_vat)
    if (grandTotal > 0 && beforeVat > 0 && grandTotal < beforeVat) {
      console.log('[Validation] Swapped totals detected, fixing: before=' + beforeVat + ' grand=' + grandTotal);
      const temp = grandTotal;
      grandTotal = beforeVat;
      beforeVat = temp;
    }

    // กรณี 2: ตรวจว่า VAT ≈ 7% ของ beforeVat หรือไม่
    if (beforeVat > 0 && vatAmt > 0) {
      const expectedVat = Math.round((beforeVat - discountAmt) * 0.07 * 100) / 100;
      const vatDiff = Math.abs(vatAmt - expectedVat);
      if (vatDiff > 1) {
        // VAT ไม่ตรง — ลองเช็คว่า beforeVat เป็นราคารวม VAT หรือเปล่า
        const calcBeforeVat = Math.round((grandTotal > 0 ? grandTotal : beforeVat) / 1.07 * 100) / 100;
        const calcVat = Math.round(calcBeforeVat * 0.07 * 100) / 100;
        const calcGrand = Math.round((calcBeforeVat + calcVat) * 100) / 100;

        // ตรวจว่า VAT จาก AI ใกล้เคียง calcVat หรือไม่ (ราคารวม VAT)
        if (Math.abs(vatAmt - calcVat) < 2) {
          console.log('[Validation] Price appears VAT-inclusive, recalculating: before=' + calcBeforeVat + ' vat=' + calcVat + ' grand=' + calcGrand);
          beforeVat = calcBeforeVat;
          vatAmt = calcVat;
          grandTotal = calcGrand;
        } else {
          // คำนวณ VAT ใหม่จาก beforeVat
          console.log('[Validation] VAT mismatch, recalculating: expected=' + expectedVat + ' got=' + vatAmt);
          vatAmt = expectedVat;
          grandTotal = Math.round((beforeVat - discountAmt + vatAmt) * 100) / 100;
        }
      }
    }

    // กรณี 3: ถ้ายังไม่มี grandTotal ให้คำนวณ
    if (grandTotal <= 0 && beforeVat > 0) {
      if (vatAmt <= 0) vatAmt = Math.round((beforeVat - discountAmt) * 0.07 * 100) / 100;
      grandTotal = Math.round((beforeVat - discountAmt + vatAmt) * 100) / 100;
    }

    // อัปเดตรายการสินค้าให้ตรงกับ beforeVat (ถ้ามี 1 รายการ)
    const itemRows = document.getElementById('itemsBody').querySelectorAll('tr');
    if (itemRows.length === 1) {
      const amountField = itemRows[0].querySelector('.item-amount');
      const priceField = itemRows[0].querySelector('.item-price');
      if (amountField && parseFloat(amountField.value) !== beforeVat) {
        amountField.value = beforeVat.toFixed(2);
        if (priceField) priceField.value = beforeVat.toFixed(2);
      }
    }

    document.getElementById('inv_before_vat').value = beforeVat.toFixed(2);
    document.getElementById('inv_vat').value = vatAmt.toFixed(2);
    if (discountAmt) document.getElementById('inv_discount').value = discountAmt;
    document.getElementById('inv_grand_total').value = grandTotal.toFixed(2);

    // คำนวณ net
    const wht = parseFloat(document.getElementById('inv_wht').value) || 0;
    document.getElementById('inv_net').value = (grandTotal - wht).toFixed(2);

    const confidenceText = {
      high: '✅ ความมั่นใจสูง - กรุณาตรวจสอบข้อมูลอีกครั้ง',
      medium: '⚠️ ความมั่นใจปานกลาง - กรุณาตรวจสอบและแก้ไขข้อมูล',
      low: '❗ ความมั่นใจต่ำ - อาจต้องกรอกข้อมูลเพิ่มเติมเอง'
    };

    let method = data.extraction_method || '';
    if (method.startsWith('ollama')) method = '(Ollama Vision)';
    else if (method.startsWith('gemini')) method = '(Google Gemini)';
    else if (method === 'anthropic') method = '(Claude AI)';
    else if (method === 'regex') method = '(Regex)';
    else if (method === 'regex-fallback') method = '(Regex - AI ไม่พร้อม)';
    else method = '(' + method + ')';
    status.textContent = (confidenceText[data.confidence] || 'สกัดข้อมูลสำเร็จ') + ' ' + method;
    showToast('สกัดข้อมูลสำเร็จ ' + method + ' - กรุณาตรวจสอบข้อมูล', 'success');

  } catch (err) {
    clearInterval(timer);
    const errMsg = err.name === 'AbortError' ? 'หมดเวลา (3 นาที) - ลองใหม่อีกครั้ง' : err.message;
    showToast('เกิดข้อผิดพลาด: ' + errMsg, 'error');
    status.textContent = 'เกิดข้อผิดพลาด: ' + errMsg;
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 AI สกัดข้อมูลอัตโนมัติ';
  }
}

// ========== Number to Thai Words ==========
function numberToThaiWords(num) {
  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  if (num === 0) return 'ศูนย์บาทถ้วน';

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  function convertGroup(n) {
    if (n === 0) return '';
    const str = n.toString();
    let result = '';
    const len = str.length;
    for (let i = 0; i < len; i++) {
      const d = parseInt(str[i]);
      const pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && len > 1) { result += 'เอ็ด'; }
      else if (pos === 1 && d === 1) { result += 'สิบ'; }
      else if (pos === 1 && d === 2) { result += 'ยี่สิบ'; }
      else { result += digits[d] + positions[pos]; }
    }
    return result;
  }

  let result = '';
  if (intPart >= 1000000) {
    result += convertGroup(Math.floor(intPart / 1000000)) + 'ล้าน';
    result += convertGroup(intPart % 1000000);
  } else {
    result += convertGroup(intPart);
  }

  result += 'บาท';
  if (decPart > 0) {
    result += convertGroup(decPart) + 'สตางค์';
  } else {
    result += 'ถ้วน';
  }

  return result;
}
