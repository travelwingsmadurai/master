// src/pages/PaymentVoucher.js — Themed UI (Phase 8 logic preserved)
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { addDoc, collection, getDocs, doc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useReactToPrint } from 'react-to-print';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  TextField, Button, Typography, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, FormControl,
  Select, MenuItem, IconButton, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, InputAdornment, TablePagination, Avatar
} from '@mui/material';
import {
  PictureAsPdf as PictureAsPdfIcon, Edit, Delete,
  Search, Clear as ClearIcon,
  Business, Receipt, AttachMoney, CalendarToday, LocationOn, 
  AccountBalance, Payment, Notes, Add, AccountBalanceWallet
} from '@mui/icons-material';

// ─────────────────────────── Number → words ───────────────────────────
function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanOneThousand(n) {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanOneThousand(n % 100) : '');
  }

  function convert(n) {
    if (n === 0) return 'Zero';
    let result = '';
    if (Math.floor(n / 10000000) > 0) { result += convertLessThanOneThousand(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
    if (Math.floor(n / 100000) > 0) { result += convertLessThanOneThousand(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
    if (Math.floor(n / 1000) > 0) { result += convertLessThanOneThousand(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
    if (n > 0) { if (result !== '') result += ' '; result += convertLessThanOneThousand(n); }
    return result.trim();
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = convert(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + convertLessThanOneThousand(paise) + ' Paise';
  return result;
}

const fmt = (n) => {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PAYMENT_METHODS = ['Bank Transfer', 'Cheque', 'Cash', 'Online Payment', 'UPI'];

const EMPTY_FORM = () => ({
  supplierId: '',
  supplierName: '',
  supplierGstin: '',
  amount: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  place: 'Tamilnadu (33)',
  voucherNo: '',
  bankName: '',
  paymentMethod: 'Bank Transfer',
  description: '',
  gstin: '33DLJPS5802R1ZK'
});

const PaymentVoucher = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [voucherToDelete, setVoucherToDelete] = useState(null);
  const voucherRef = useRef();

  const [formData, setFormData] = useState({ ...EMPTY_FORM(), voucherNo: '' });

  // ── search / filter / pagination (client-side) ──
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const suppliersCollectionRef = collection(db, 'suppliers');
  const vouchersCollectionRef = collection(db, 'supplierPaymentVouchers');

  const generateVoucherNo = async () => {
    const year = new Date().getFullYear();
    const counterRef = doc(db, 'counters', `vouchers_${year}`);
    try {
      const nextCount = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let next = 1;
        if (counterDoc.exists()) {
          next = counterDoc.data().current + 1;
          transaction.update(counterRef, { current: next });
        } else {
          transaction.set(counterRef, { current: 1 });
        }
        return next;
      });
      return `PV-${year}-${nextCount.toString().padStart(4, '0')}`;
    } catch (err) {
      console.error('Counter error:', err);
      return `PV-${year}-${Date.now()}`;
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setFetching(true);
      try {
        const [suppliersSnap, vouchersSnap] = await Promise.all([
          getDocs(suppliersCollectionRef),
          getDocs(vouchersCollectionRef)
        ]);
        const suppliersList = suppliersSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        setSuppliers(suppliersList);

        const list = vouchersSnap.docs.map(d => ({
          ...d.data(),
          id: d.id,
          amount: parseFloat(d.data().amount) || 0
        })).sort((a, b) => (parseInt(b.voucherNo, 10) || 0) - (parseInt(a.voucherNo, 10) || 0));

        setVouchers(list);
        const nextNo = await generateVoucherNo();
        setFormData(prev => ({ ...prev, voucherNo: nextNo }));
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again.');
      } finally {
        setFetching(false);
      }
    };
    fetchData();
  }, []);

  const activeSuppliers = useMemo(
    () => suppliers.filter(s => s.isActive !== false || s.id === formData.supplierId),
    [suppliers, formData.supplierId]
  );

  const filteredVouchers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return vouchers.filter(v => {
      if (filterMethod !== 'all' && (v.paymentMethod || '') !== filterMethod) return false;
      if (filterStartDate && (v.date || '') < filterStartDate) return false;
      if (filterEndDate && (v.date || '') > filterEndDate) return false;
      if (!term) return true;
      return (
        String(v.voucherNo || '').toLowerCase().includes(term) ||
        String(v.supplierName || '').toLowerCase().includes(term) ||
        String(v.description || '').toLowerCase().includes(term)
      );
    });
  }, [vouchers, searchTerm, filterMethod, filterStartDate, filterEndDate]);

  const paginatedVouchers = useMemo(
    () => filteredVouchers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredVouchers, page, rowsPerPage]
  );

  const filteredTotals = useMemo(() => {
    const total = filteredVouchers.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);
    return { count: filteredVouchers.length, total };
  }, [filteredVouchers]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterMethod('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(0);
  };

  const handleSupplierChange = (e) => {
    const supplierId = e.target.value;
    const supplier = suppliers.find(s => s.id === supplierId) || null;
    setSelectedSupplier(supplier);
    setFormData(prev => ({
      ...prev,
      supplierId,
      bankName: supplier?.bankName || prev.bankName
    }));
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetForm = async () => {
    const nextNo = await generateVoucherNo();
    setFormData({
      ...EMPTY_FORM(),
      voucherNo: nextNo
    });
    setSelectedSupplier(null);
    setEditingId(null);
    setError(null);
  };

  const validateVoucher = () => {
    if (!formData.supplierId) return 'Please select a supplier';
    const supplier = suppliers.find(s => s.id === formData.supplierId);
    if (!supplier) return 'Selected supplier no longer exists. Please reselect.';
    if (!editingId && supplier.isActive === false)
      return 'Selected supplier is inactive. Please choose an active supplier.';

    if (!formData.amount) return 'Please enter a payment amount';
    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) return 'Amount must be a valid number';
    if (amount <= 0) return 'Amount must be greater than zero';

    if (!formData.date) return 'Please select a payment date';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.date)) return 'Payment date must be in YYYY-MM-DD format';

    if (!formData.place || !formData.place.trim()) return 'Please enter place of supply';
    if (!formData.bankName || !formData.bankName.trim()) return 'Please enter bank name';
    if (!formData.paymentMethod) return 'Please select a payment method';

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const validationError = validateVoucher();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const amount = parseFloat(formData.amount);
      const existing = editingId ? vouchers.find(v => v.id === editingId) : null;

      const voucherData = {
        supplierId: formData.supplierId,
        supplierName: selectedSupplier?.name || formData.supplierName || '',
        supplierGstin: selectedSupplier?.gstNumber || formData.supplierGstin || '',
        amount: amount.toFixed(2),
        date: formData.date,
        place: formData.place.trim(),
        voucherNo: formData.voucherNo,
        bankName: formData.bankName.trim(),
        paymentMethod: formData.paymentMethod,
        description: (formData.description || '').trim(),
        gstin: formData.gstin,
        status: 'Paid',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'supplierPaymentVouchers', editingId), voucherData);
      } else {
        await addDoc(vouchersCollectionRef, voucherData);
      }

      const snap = await getDocs(vouchersCollectionRef);
      const fresh = snap.docs.map(d => ({
        ...d.data(), id: d.id,
        amount: parseFloat(d.data().amount) || 0
      })).sort((a, b) => (parseInt(b.voucherNo, 10) || 0) - (parseInt(a.voucherNo, 10) || 0));

      setVouchers(fresh);
      await resetForm();
    } catch (err) {
      console.error('Error saving voucher:', err);
      setError(err.message || 'Failed to save voucher. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (voucher) => {
    setError(null);
    const supplier = suppliers.find(s => s.id === voucher.supplierId) || null;
    setSelectedSupplier(supplier);
    setEditingId(voucher.id);
    setFormData({
      supplierId: voucher.supplierId || '',
      supplierName: voucher.supplierName || '',
      supplierGstin: voucher.supplierGstin || '',
      amount: (parseFloat(voucher.amount) || 0).toFixed(2),
      date: voucher.date || format(new Date(), 'yyyy-MM-dd'),
      place: voucher.place || 'Tamilnadu (33)',
      voucherNo: String(voucher.voucherNo ?? ''),
      bankName: voucher.bankName || '',
      paymentMethod: voucher.paymentMethod || 'Bank Transfer',
      description: voucher.description || '',
      gstin: voucher.gstin || '33DLJPS5802R1ZK'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (voucher) => { setVoucherToDelete(voucher); setDeleteDialogOpen(true); };

  const confirmDelete = async () => {
    if (!voucherToDelete) return;
    try {
      await deleteDoc(doc(db, 'supplierPaymentVouchers', voucherToDelete.id));
      const snap = await getDocs(vouchersCollectionRef);
      const fresh = snap.docs.map(d => ({
        ...d.data(), id: d.id,
        amount: parseFloat(d.data().amount) || 0
      })).sort((a, b) => (parseInt(b.voucherNo, 10) || 0) - (parseInt(a.voucherNo, 10) || 0));
      setVouchers(fresh);

      if (editingId === voucherToDelete.id) {
        await resetForm();
      }
      setDeleteDialogOpen(false);
      setVoucherToDelete(null);
    } catch (err) {
      console.error('Error deleting voucher:', err);
      setError('Failed to delete voucher. Please try again.');
    }
  };

  const generatePDF = (voucher) => {
    const pdf = new jsPDF();

    pdf.setProperties({
      title: `Payment Voucher - ${voucher.voucherNo}`,
      subject: 'Supplier Payment',
      author: 'Travelwings',
      keywords: 'payment, voucher, supplier',
      creator: 'Travelwings'
    });

    pdf.setFontSize(12);
    pdf.setTextColor(40);
    pdf.text('GSTIN : ' + (voucher.gstin || '33DLJPS5802R1ZK'), 105, 15, { align: 'center' });

    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('"TRAVELWINGS"', 105, 25, { align: 'center' });

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('F56 PARASAN SAMUDHRI MAHAL, OPP FATHIMA COLLEGE', 105, 32, { align: 'center' });
    pdf.text('MADURAI', 105, 38, { align: 'center' });

    pdf.setDrawColor(0);
    pdf.setLineWidth(0.5);
    pdf.line(20, 45, 190, 45);

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PAYMENT VOUCHER', 105, 55, { align: 'center' });

    const tableData = [
      ['Voucher No.', voucher.voucherNo || 'N/A'],
      ['Date', voucher.date || 'N/A'],
      ['Supplier Name', voucher.supplierName || 'N/A'],
      ['Supplier GSTIN', voucher.supplierGstin || 'N/A'],
      ['Place of Supply', voucher.place || 'Tamilnadu (33)'],
      ['Bank Name', voucher.bankName || 'N/A'],
      ['Payment Method', voucher.paymentMethod || 'Bank Transfer'],
      ['Amount (₹)', fmt(voucher.amount)]
    ];
    if (voucher.description) tableData.push(['Description', voucher.description]);

    autoTable(pdf, {
      startY: 60,
      head: [['Field', 'Value']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      styles: { cellPadding: 5, fontSize: 10, valign: 'middle' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { cellWidth: 'auto' } },
      margin: { left: 20, right: 20 }
    });

    const amountInWords = numberToWords(parseFloat(voucher.amount) || 0) + ' Only';
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Amount in Words:', 20, pdf.lastAutoTable.finalY + 15);
    pdf.setFont('helvetica', 'normal');
    pdf.text(amountInWords, 60, pdf.lastAutoTable.finalY + 15);

    if (voucher.paymentMethod && voucher.paymentMethod !== 'Cash') {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.text(`( ${voucher.paymentMethod} Subject to Realisation )`, 20, pdf.lastAutoTable.finalY + 25);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('For "TRAVELWINGS"', 150, pdf.lastAutoTable.finalY + 40);
    pdf.text('Authorised Signatory', 150, pdf.lastAutoTable.finalY + 50);

    pdf.setDrawColor(0);
    pdf.setLineWidth(0.5);
    pdf.rect(10, 10, 190, 277);

    const safeName = String(voucher.supplierName || 'Unknown').replace(/[^\w-]+/g, '_');
    pdf.save(`PaymentVoucher_${voucher.voucherNo}_${safeName}.pdf`);
  };

  const PrintVoucher = React.forwardRef(({ voucher }, ref) => {
    if (!voucher) return null;
    return (
      <div ref={ref} style={{
        padding: '20px', fontFamily: 'Arial',
        position: 'absolute', left: '-9999px', top: 0,
        width: '210mm', margin: '0 auto',
        backgroundColor: 'white', border: '1px solid #000'
      }}>
        <p style={{ textAlign: 'center', marginBottom: '5px', fontSize: '12px' }}>
          GSTIN : {voucher.gstin || '33DLJPS5802R1ZK'}
        </p>
        <h2 style={{ textAlign: 'center', marginTop: '0', fontSize: '16px', fontWeight: 'bold' }}>"TRAVELWINGS"</h2>
        <p style={{ textAlign: 'center', fontSize: '10px' }}>F56 PARASAN SAMUDHRI MAHAL, OPP FATHIMA COLLEGE</p>
        <p style={{ textAlign: 'center', fontSize: '10px', marginBottom: '20px' }}>MADURAI</p>

        <h3 style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>
          PAYMENT VOUCHER
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ backgroundColor: '#2980b9', color: 'white' }}>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Field</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Voucher No.</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.voucherNo}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Date</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.date}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Supplier Name</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.supplierName}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Supplier GSTIN</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.supplierGstin || 'N/A'}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Place of Supply</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.place || 'Tamilnadu (33)'}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Bank Name</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.bankName}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Payment Method</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.paymentMethod || 'Bank Transfer'}</td></tr>
            <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Amount (₹)</td><td style={{ border: '1px solid #000', padding: '5px' }}>{fmt(voucher.amount)}</td></tr>
            {voucher.description && (
              <tr><td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Description</td><td style={{ border: '1px solid #000', padding: '5px' }}>{voucher.description}</td></tr>
            )}
          </tbody>
        </table>

        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>
          Amount in Words: <span style={{ fontWeight: 'normal' }}>{numberToWords(parseFloat(voucher.amount) || 0)} Only</span>
        </p>

        {voucher.paymentMethod && voucher.paymentMethod !== 'Cash' && (
          <p style={{ marginBottom: '20px', fontStyle: 'italic', fontSize: '0.9em' }}>
            ( {voucher.paymentMethod} Subject to Realisation )
          </p>
        )}

        <div style={{ marginTop: '50px', textAlign: 'right' }}>
          <p>For "TRAVELWINGS"</p>
          <p style={{ marginTop: '30px' }}>Authorised Signatory</p>
        </div>
      </div>
    );
  });

  const handlePrint = useReactToPrint({ content: () => voucherRef.current });

  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2, backgroundColor: '#fff',
      '& fieldset': { borderColor: '#e0e0e0' },
      '&:hover fieldset': { borderColor: '#1976d2' },
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto', pb: 4 }}>
      
      {/* ─── HERO BANNER ─── */}
      <Box sx={{
        position: 'relative', borderRadius: 3, overflow: 'hidden', mb: 4, px: 4, py: 2.5,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 120,
        background: 'linear-gradient(90deg, #e3f2fd 0%, #bbdefb 100%)',
      }}>
        <Box sx={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%',
          backgroundImage: "url('/travel-banner.png.png')",
          backgroundSize: 'cover', backgroundPosition: 'center right',
          maskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
        }} />

        <Box sx={{ zIndex: 1, maxWidth: '60%' }}>
          <Typography variant="h4" fontWeight="800" color="#0d47a1" gutterBottom>
            Supplier Payment Vouchers
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage payments to suppliers and track cash outflows.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ─── FORM SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <AccountBalanceWallet fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingId ? `Edit Payment Voucher #${formData.voucherNo}` : 'Create New Payment Voucher'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter payment details to issue a new voucher
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation sx={{ bgcolor: '#e3f2fd', color: '#1976d2', '&:hover': { bgcolor: '#bbdefb' }, textTransform: 'none' }}>
            View All Vouchers
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Business fontSize="small" color="primary" /> Supplier *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required>
                <Select name="supplierId" value={formData.supplierId} onChange={handleSupplierChange} disabled={loading || fetching} displayEmpty>
                  <MenuItem value="" disabled><em>Select a supplier</em></MenuItem>
                  {activeSuppliers.map((supplier) => (
                    <MenuItem key={supplier.id} value={supplier.id}>
                      {supplier.name}{supplier.phone ? ` (${supplier.phone})` : ''}{supplier.isActive === false ? ' [Inactive]' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Receipt fontSize="small" color="info" /> Voucher No *
              </Typography>
              <TextField name="voucherNo" value={formData.voucherNo} onChange={handleChange} fullWidth sx={inputStyle} disabled={loading || !!editingId} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney fontSize="small" color="success" /> Amount (₹) *
              </Typography>
              <TextField name="amount" type="number" value={formData.amount} onChange={handleChange} fullWidth placeholder="0.00" sx={inputStyle} inputProps={{ min: 0.01, step: 0.01 }} disabled={loading} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="warning" /> Date *
              </Typography>
              <TextField name="date" type="date" value={formData.date} onChange={handleChange} fullWidth sx={inputStyle} InputLabelProps={{ shrink: true }} required disabled={loading} />
            </Grid>

            {/* Row 2 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOn fontSize="small" color="secondary" /> Place of Supply *
              </Typography>
              <TextField name="place" value={formData.place} onChange={handleChange} fullWidth sx={inputStyle} required disabled={loading} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccountBalance fontSize="small" color="primary" /> Bank Name *
              </Typography>
              <TextField name="bankName" value={formData.bankName} onChange={handleChange} fullWidth sx={inputStyle} required disabled={loading} helperText={formData.supplierId ? 'Auto-filled from supplier' : ''} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Payment fontSize="small" color="info" /> Payment Method *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required>
                <Select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} disabled={loading}>
                  {PAYMENT_METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Notes fontSize="small" color="error" /> Description (Optional)
              </Typography>
              <TextField name="description" value={formData.description} onChange={handleChange} fullWidth sx={inputStyle} multiline rows={1} disabled={loading} placeholder="Enter description" />
            </Grid>
          </Grid>

          {selectedSupplier && (
            <Box sx={{ mt: 3, p: 2, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" color="primary">Supplier Info:</Typography>
              <Typography variant="body2">Contact: {selectedSupplier.contactPerson || 'N/A'} | Phone: {selectedSupplier.phone || 'N/A'} | GSTIN: {selectedSupplier.gstNumber || 'N/A'}</Typography>
              {selectedSupplier.bankName && <Typography variant="body2">Bank: {selectedSupplier.bankName} {selectedSupplier.accountNumber ? `| A/C: ${selectedSupplier.accountNumber}` : ''} {selectedSupplier.ifscCode ? `| IFSC: ${selectedSupplier.ifscCode}` : ''}</Typography>}
            </Box>
          )}

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            {editingId && (
              <Button variant="outlined" onClick={resetForm} disabled={loading} startIcon={<ClearIcon />} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary', px: 3 }}>
                Cancel
              </Button>
            )}
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading || fetching || activeSuppliers.length === 0}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}
            >
              {loading ? 'Saving...' : (editingId ? 'Update Voucher' : 'Save Voucher')}
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<PictureAsPdfIcon />}
              onClick={() => generatePDF({
                ...formData,
                supplierName: selectedSupplier?.name || formData.supplierName || '',
                supplierGstin: selectedSupplier?.gstNumber || formData.supplierGstin || ''
              })}
              disabled={!formData.supplierId || loading}
              sx={{ textTransform: 'none', borderColor: '#1976d2', color: '#1976d2', px: 3 }}
            >
              Export PDF
            </Button>
          </Box>
        </Box>
      </Paper>

      <div style={{ display: 'none' }}>
        <PrintVoucher ref={voucherRef} voucher={{
          ...formData,
          supplierName: selectedSupplier?.name || formData.supplierName || '',
          supplierGstin: selectedSupplier?.gstNumber || formData.supplierGstin || ''
        }} />
      </div>

      {/* ─── FILTER BAR ─── */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth size="small" placeholder="Search vouchers..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(0); }} sx={inputStyle} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small" sx={inputStyle}>
              <Select value={filterMethod} displayEmpty onChange={e => { setFilterMethod(e.target.value); setPage(0); }}>
                <MenuItem value="all">All Methods</MenuItem>
                {PAYMENT_METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField label="From" type="date" size="small" fullWidth value={filterStartDate} onChange={e => { setFilterStartDate(e.target.value); setPage(0); }} sx={inputStyle} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField label="To" type="date" size="small" fullWidth value={filterEndDate} onChange={e => { setFilterEndDate(e.target.value); setPage(0); }} sx={inputStyle} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Button fullWidth variant="outlined" startIcon={<ClearIcon />} onClick={handleResetFilters} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary' }}>Clear</Button>
          </Grid>
        </Grid>
      </Paper>

      {/* ─── TOTALS ─── */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: '#e3f2fd', color: '#0d47a1', borderRadius: 3, border: '1px solid #bbdefb' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="body1"><strong>Vouchers:</strong> {filteredTotals.count}</Typography>
          <Typography variant="body1"><strong>Total Amount:</strong> ₹{fmt(filteredTotals.total)}</Typography>
        </Box>
      </Paper>

      {/* ─── LIST SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <AccountBalanceWallet fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Payment Vouchers</Typography>
            <Typography variant="body2" color="text.secondary">View and manage all supplier payments</Typography>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Voucher No</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Supplier</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Payment Method</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fetching ? (
                <TableRow><TableCell colSpan={6} align="center"><CircularProgress sx={{ my: 2 }} /></TableCell></TableRow>
              ) : paginatedVouchers.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center">No vouchers found</TableCell></TableRow>
              ) : (
                paginatedVouchers.map((voucher) => (
                  <TableRow key={voucher.id} hover>
                    <TableCell><Typography fontWeight="500">{voucher.voucherNo}</Typography></TableCell>
                    <TableCell>{voucher.supplierName || '—'}</TableCell>
                    <TableCell>{voucher.date}</TableCell>
                    <TableCell>{voucher.paymentMethod || 'Bank Transfer'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(voucher.amount)}</TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleEdit(voucher)} color="primary" size="small" disabled={loading}><Edit fontSize="small" /></IconButton>
                      <IconButton onClick={() => handleDelete(voucher)} color="error" size="small" disabled={loading}><Delete fontSize="small" /></IconButton>
                      <IconButton onClick={() => generatePDF(voucher)} color="secondary" size="small" disabled={loading}><PictureAsPdfIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredVouchers.length}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete voucher #{voucherToDelete?.voucherNo}?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PaymentVoucher;