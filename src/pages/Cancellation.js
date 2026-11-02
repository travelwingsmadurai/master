import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Grid, Divider, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, IconButton,
  Tooltip, Avatar, InputAdornment
} from '@mui/material';
import {
  Search, Cancel, CheckCircle, PictureAsPdf, Delete, Receipt, Person,
  CalendarToday, AttachMoney, Warning, Notes, Clear
} from '@mui/icons-material';
import { db } from '../config/firebase';
import {
  collection, query, where, getDocs, addDoc, doc, deleteDoc, writeBatch
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const today = () => new Date().toISOString().slice(0, 10);
const emptyRefund = () => ({
  refundAmount: '', refundReason: '', refundDate: today(), remarks: '',
  paymentMethod: '', cancellationCharges: '', supplierCancellationPayable: ''
});

const Cancellation = () => {
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [cancellations, setCancellations] = useState([]);
  const [refundData, setRefundData] = useState(emptyRefund);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2, backgroundColor: '#fff',
      '& fieldset': { borderColor: '#e0e0e0' },
      '&:hover fieldset': { borderColor: '#1976d2' }
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').toLowerCase().includes(q) ||
      String(c.email || '').toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return customerInvoices;
    return customerInvoices.filter(i =>
      String(i.invoiceNumber || '').toLowerCase().includes(q) ||
      String(i.bookingId || '').toLowerCase().includes(q)
    );
  }, [customerInvoices, invoiceSearch]);

  const netRefundAmount = Math.max(
    0,
    (parseFloat(refundData.refundAmount) || 0) -
    (parseFloat(refundData.cancellationCharges) || 0)
  );

  const formatCurrency = value => {
    const n = Number(value) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: 2
    }).format(n);
  };

  const loadCancellations = async () => {
    const snap = await getDocs(collection(db, 'cancellations'));
    setCancellations(snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [customerSnap] = await Promise.all([
          getDocs(collection(db, 'customers')),
          loadCancellations()
        ]);
        setCustomers(customerSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
      } catch (e) {
        console.error(e);
        setError('Unable to load customers or cancellation history.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const resetSelection = () => {
    setSelectedCustomerId('');
    setCustomerSearch('');
    setInvoiceSearch('');
    setCustomerInvoices([]);
    setInvoiceDetails(null);
    setRefundData(emptyRefund());
  };

  const handleCustomerSelect = async e => {
    const id = e.target.value;
    setSelectedCustomerId(id);
    setInvoiceDetails(null);
    setInvoiceSearch('');
    setCustomerInvoices([]);
    setRefundData(emptyRefund());
    setError('');
    setSuccess('');
    if (!id) return;

    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'invoices'), where('customerId', '==', id)
      ));
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(i => i.status !== 'cancelled')
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setCustomerInvoices(rows);
      if (!rows.length) setError('No active invoices found for this customer.');
    } catch (e) {
      console.error(e);
      setError('Unable to load this customer’s invoices.');
    } finally {
      setLoading(false);
    }
  };

  const selectInvoice = invoice => {
    setInvoiceDetails(invoice);
    const total = Number(invoice.totalAmount ?? invoice.ticketPrice ?? 0);
    setRefundData({
      ...emptyRefund(),
      refundAmount: total.toFixed(2),
      paymentMethod: invoice.paymentMethod || ''
    });
    setError('');
    setSuccess('');
  };

  const handleRefundChange = e => {
    const { name, value } = e.target;
    setRefundData(p => ({ ...p, [name]: value }));
  };

  const validate = () => {
    if (!selectedCustomerId || !invoiceDetails) {
      setError('Select a customer and an active invoice first.');
      return false;
    }
    const refund = Number(refundData.refundAmount);
    const charges = Number(refundData.cancellationCharges || 0);
    const original = Number(invoiceDetails.totalAmount ?? invoiceDetails.ticketPrice ?? 0);
    if (!Number.isFinite(refund) || refund < 0 || refund > original) {
      setError('Refund amount must be between 0 and the original invoice amount.');
      return false;
    }
    if (!Number.isFinite(charges) || charges < 0 || charges > refund) {
      setError('Cancellation charges cannot exceed the refund amount.');
      return false;
    }
    if (!refundData.refundDate) {
      setError('Please select the cancellation date.');
      return false;
    }
    const supplierPayable = Number(refundData.supplierCancellationPayable || 0);
    if (!Number.isFinite(supplierPayable) || supplierPayable < 0) {
      setError('Supplier cancellation payable must be zero or a positive amount.');
      return false;
    }
    return true;
  };

  const processCancellation = async () => {
    if (!validate()) return;
    setConfirmOpen(false);
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const invoiceId = invoiceDetails.id;
      const invoiceNumber = invoiceDetails.invoiceNumber || '';
      const originalAmount = Number(invoiceDetails.totalAmount ?? invoiceDetails.ticketPrice ?? 0);
      const charges = Number(refundData.cancellationCharges || 0);
      const supplierCancellationPayable = Number(refundData.supplierCancellationPayable || 0);
      const refund = Number(refundData.refundAmount || 0);
      const cancellation = {
        invoiceId,
        invoiceNumber,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || invoiceDetails.customerName || '',
        originalAmount,
        refundAmount: refund,
        cancellationCharges: charges,
        netRefundAmount: Math.max(0, refund - charges),
        supplierCancellationPayable,
        refundReason: refundData.refundReason || '',
        refundDate: refundData.refundDate,
        remarks: refundData.remarks || '',
        paymentMethod: refundData.paymentMethod || '',
        status: 'completed',
        deletedInvoice: invoiceDetails,
        createdAt: new Date().toISOString()
      };

      // Keep an audit record, then remove the cancelled invoice and its invoice-ledger rows.
      // Receipt records are deliberately retained: deleting a receipt would erase a real payment.
      const batch = writeBatch(db);
      const invoiceRef = doc(db, 'invoices', invoiceId);
      batch.delete(invoiceRef);

      const ledgerSnap = await getDocs(collection(db, 'accountLedger'));
      ledgerSnap.docs.forEach(d => {
        const x = d.data();
        const matchesInvoice = String(x.invoiceNumber || x.invoiceNo || x.ref || x.reference || '') === String(invoiceNumber);
        const sameCustomer = !x.customerId || x.customerId === selectedCustomerId;
        const type = String(x.type || x.entryType || '').toLowerCase();
        const invoiceEntry = !type || type.includes('invoice') || type.includes('sale');
        if (matchesInvoice && sameCustomer && invoiceEntry) batch.delete(d.ref);
      });

      // If receipts store bill allocations, release only this invoice allocation.
      // The receipt itself and its total payment remain untouched.
      const receiptSnap = await getDocs(query(
        collection(db, 'receipts'), where('customerId', '==', selectedCustomerId)
      ));
      receiptSnap.docs.forEach(d => {
        const data = d.data();
        const patch = {};
        ['allocations', 'billAllocations'].forEach(key => {
          if (Array.isArray(data[key])) {
            const next = data[key].filter(a =>
              String(a.invoiceId || '') !== String(invoiceId) &&
              String(a.invoiceNumber || a.invoiceNo || a.ref || '') !== String(invoiceNumber)
            );
            if (next.length !== data[key].length) patch[key] = next;
          }
        });
        if (Object.keys(patch).length) batch.update(d.ref, patch);
      });

      const cancellationRef = doc(collection(db, 'cancellations'));
      batch.set(cancellationRef, cancellation);
      await batch.commit();

      setCancellations(prev => [{ id: cancellationRef.id, ...cancellation }, ...prev]);
      setCustomerInvoices(prev => prev.filter(i => i.id !== invoiceId));
      setInvoiceDetails(null);
      setRefundData(emptyRefund());
      setSuccess(
        `Invoice ${invoiceNumber} cancelled. Its invoice record and matching invoice-ledger entry were deleted. Existing receipts were preserved.`
      );
    } catch (e) {
      console.error('Cancellation failed:', e);
      setError(e.message || 'Cancellation failed. No changes were confirmed.');
    } finally {
      setLoading(false);
    }
  };

  const generatePdf = cancellation => {
    const pdf = new jsPDF();
    pdf.setFillColor(13, 71, 161);
    pdf.rect(0, 0, 210, 38, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(21);
    pdf.text('TRAVELWINGS', 14, 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('CANCELLATION & REFUND RECORD', 14, 24);
    pdf.setFontSize(8);
    pdf.text('H.O: FF8, First Floor, Parsan Samruthi Mahal, Opp. Fathima College, MADURAI - 18', 14, 30);
    pdf.text('B.O: 40, Vinayagar Koil St., Vinayagapuram, Opp. Lakshmi Narasimmar Temple, RED HILLS, CHENNAI - 600 099', 14, 34);
    pdf.text('Email: twlixm2@gmail.com  |  Phone: 7200266119', 196, 30, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(11);
    const rows = [
      ['Cancellation ID', cancellation.id || ''],
      ['Invoice Number', cancellation.invoiceNumber || ''],
      ['Customer', cancellation.customerName || ''],
      ['Cancellation Date', cancellation.refundDate || ''],
      ['Original Invoice Amount', formatCurrency(cancellation.originalAmount)],
      ['Refund Amount', formatCurrency(cancellation.refundAmount)],
      ['Cancellation Charges', formatCurrency(cancellation.cancellationCharges)],
      ['Net Refund', formatCurrency(cancellation.netRefundAmount)],
      ['Payment Method', cancellation.paymentMethod || 'N/A'],
      ['Reason', cancellation.refundReason || 'Not specified'],
      ['Remarks', cancellation.remarks || '']
    ];
    pdf.autoTable({
      startY: 45,
      head: [['Cancellation Information', 'Details']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [25, 75, 130] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } }
    });
    const y = pdf.lastAutoTable.finalY + 10;
    pdf.autoTable({
      startY: y,
      head: [['Financial Summary', 'Amount (INR)']],
      body: [
        ['Original Invoice Amount', Number(cancellation.originalAmount || 0).toFixed(2)],
        ['Refund Amount', Number(cancellation.refundAmount || 0).toFixed(2)],
        ['Cancellation Charges', Number(cancellation.cancellationCharges || 0).toFixed(2)],
        ['Net Refund Payable', Number(cancellation.netRefundAmount || 0).toFixed(2)]
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [25, 75, 130] },
      columnStyles: { 1: { halign: 'right' } },
      foot: [['Status', 'CANCELLED']]
    });
    pdf.save(`Cancellation_${cancellation.invoiceNumber || 'Record'}.pdf`);
  };

  const deleteCancellationRecord = async id => {
    if (!window.confirm('Delete this cancellation history record? This does not restore the deleted invoice.')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'cancellations', id));
      setCancellations(p => p.filter(x => x.id !== id));
      setSuccess('Cancellation history record deleted. The invoice remains cancelled.');
    } catch (e) {
      console.error(e);
      setError('Unable to delete cancellation history record.');
    } finally {
      setLoading(false);
    }
  };

  const historyFiltered = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return cancellations;
    return cancellations.filter(c =>
      String(c.customerName || '').toLowerCase().includes(q) ||
      String(c.invoiceNumber || '').toLowerCase().includes(q)
    );
  }, [cancellations, customerSearch]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', pb: 4 }}>
      <Box sx={{
        position: 'relative', borderRadius: 3, overflow: 'hidden', mb: 4, px: 4, py: 2.5,
        minHeight: 120, background: 'linear-gradient(90deg, #e3f2fd 0%, #bbdefb 100%)'
      }}>
        <Typography variant="h4" fontWeight="800" color="#0d47a1" gutterBottom>
          TRAVELWINGS
        </Typography>
        <Typography variant="h5" fontWeight="700" color="#173b68" gutterBottom>
          Cancellations & Refunds
        </Typography>
        <Typography color="#424242">
          Search customers, select an invoice and process cancellation with a clear refund summary.
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary" display="block">
          H.O: FF8, First Floor, Parsan Samruthi Mahal, Opp. Fathima College, MADURAI - 18
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          B.O: 40, Vinayagar Koil St., Vinayagapuram, Opp. Lakshmi Narasimmar Temple, RED HILLS, CHENNAI - 600 099
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Email: twlixm2@gmail.com  |  Phone: 7200266119
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#1976d2', width: 54, height: 54 }}><Person /></Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Find Customer & Invoice</Typography>
            <Typography variant="body2" color="text.secondary">Search by customer name, phone, email or invoice number</Typography>
          </Box>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth label="Search customer" value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Type customer name, phone or email"
              sx={inputStyle}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
            />
            <TextField
              select fullWidth label="Select customer" value={selectedCustomerId}
              onChange={handleCustomerSelect} sx={{ ...inputStyle, mt: 2 }}
            >
              <MenuItem value="">Choose customer</MenuItem>
              {filteredCustomers.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name || 'Unnamed'} {c.phone ? `— ${c.phone}` : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth label="Search invoice number" value={invoiceSearch}
              onChange={e => setInvoiceSearch(e.target.value)}
              placeholder="Filter this customer's active invoices"
              disabled={!selectedCustomerId} sx={inputStyle}
              InputProps={{ startAdornment: <InputAdornment position="start"><Receipt /></InputAdornment> }}
            />
            <TextField
              select fullWidth label="Select invoice" value={invoiceDetails?.id || ''}
              onChange={e => {
                const found = customerInvoices.find(i => i.id === e.target.value);
                if (found) selectInvoice(found);
              }}
              disabled={!selectedCustomerId} sx={{ ...inputStyle, mt: 2 }}
            >
              <MenuItem value="">Choose active invoice</MenuItem>
              {filteredInvoices.map(i => (
                <MenuItem key={i.id} value={i.id}>
                  {i.invoiceNumber || i.id} — {formatCurrency(i.totalAmount ?? i.ticketPrice)} — {i.date || 'No date'}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        {selectedCustomer && (
          <Alert severity="info" sx={{ mt: 3 }}>
            Selected customer: <b>{selectedCustomer.name}</b> · {customerInvoices.length} active invoice(s)
          </Alert>
        )}
      </Paper>

      {loading && <Box display="flex" justifyContent="center" my={3}><CircularProgress /></Box>}

      {invoiceDetails && !loading && (
        <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
          <Typography variant="h5" fontWeight="bold" mb={3}>Cancellation Details</Typography>
          <Typography variant="subtitle1" fontWeight="bold" mb={1}>Invoice Summary</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#eef3f8' }}>
                <TableRow>
                  {['Invoice No.', 'Customer', 'Invoice Date', 'Invoice Amount'].map(h =>
                    <TableCell key={h} sx={{ fontWeight: 'bold' }}>{h}</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{invoiceDetails.invoiceNumber || invoiceDetails.id}</TableCell>
                  <TableCell>{selectedCustomer?.name || invoiceDetails.customerName || '-'}</TableCell>
                  <TableCell>{invoiceDetails.date || '-'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{formatCurrency(invoiceDetails.totalAmount ?? invoiceDetails.ticketPrice)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" fontWeight="bold" mb={1}>Refund & Adjustment Details</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: '#eef3f8' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '22%' }}>Particulars</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Entry</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '22%' }}>Particulars</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Entry</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Cancellation Date *</TableCell>
                  <TableCell><TextField fullWidth size="small" type="date" name="refundDate" value={refundData.refundDate} onChange={handleRefundChange} InputLabelProps={{ shrink: true }} sx={inputStyle} /></TableCell>
                  <TableCell>Refund Amount (₹) *</TableCell>
                  <TableCell><TextField fullWidth size="small" type="number" name="refundAmount" value={refundData.refundAmount} onChange={handleRefundChange} inputProps={{ min: 0, step: 0.01 }} sx={inputStyle} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cancellation Charges (₹)</TableCell>
                  <TableCell><TextField fullWidth size="small" type="number" name="cancellationCharges" value={refundData.cancellationCharges} onChange={handleRefundChange} inputProps={{ min: 0, step: 0.01 }} sx={inputStyle} /></TableCell>
                  <TableCell>Net Refund (₹)</TableCell>
                  <TableCell><TextField fullWidth size="small" value={formatCurrency(netRefundAmount)} InputProps={{ readOnly: true }} sx={{ ...inputStyle, bgcolor: '#f0fdf4' }} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Supplier Cancellation Payable (₹)</TableCell>
                  <TableCell>
                    <TextField fullWidth size="small" type="number" name="supplierCancellationPayable"
                      value={refundData.supplierCancellationPayable} onChange={handleRefundChange}
                      inputProps={{ min: 0, step: 0.01 }} sx={inputStyle}
                      helperText="Internal backend amount only; not shown on customer PDF/receipt." />
                  </TableCell>
                  <TableCell>Payment Method</TableCell>
                  <TableCell><TextField fullWidth size="small" name="paymentMethod" value={refundData.paymentMethod} onChange={handleRefundChange} placeholder="Cash / Bank / UPI" sx={inputStyle} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cancellation Reason</TableCell>
                  <TableCell>
                    <TextField select fullWidth size="small" name="refundReason" value={refundData.refundReason} onChange={handleRefundChange} sx={inputStyle}>
                      <MenuItem value="">Select reason (optional)</MenuItem>
                      {['Customer Request', 'Service Not Provided', 'Duplicate Booking', 'Schedule Change', 'Other'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>Remarks</TableCell>
                  <TableCell><TextField fullWidth size="small" multiline minRows={2} name="remarks" value={refundData.remarks} onChange={handleRefundChange} sx={inputStyle} /></TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 'bold' }}>Net Refund Payable</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'error.main', fontSize: '1.05rem' }}>{formatCurrency(netRefundAmount)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Alert severity="warning" sx={{ mt: 3 }}>
            Confirming cancellation permanently deletes this invoice document and its matching invoice entry in Account Ledger. Receipt/payment records are retained so real payments are not erased. A cancellation history record is saved for audit.
          </Alert>
          <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
            <Button variant="outlined" startIcon={<Clear />} onClick={() => setInvoiceDetails(null)}>Clear invoice</Button>
            <Button variant="contained" color="error" startIcon={<Cancel />}
              disabled={loading} onClick={() => { if (validate()) setConfirmOpen(true); }}>
              Review & Cancel Invoice
            </Button>
          </Box>
        </Paper>
      )}

      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={3}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#2e7d32', width: 54, height: 54 }}><Cancel /></Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">Cancellation History</Typography>
              <Typography variant="body2" color="text.secondary">Audit trail of cancelled invoices</Typography>
            </Box>
          </Box>
          <TextField size="small" label="Search history" value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            placeholder="Customer or invoice number" sx={{ minWidth: 260, ...inputStyle }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
        </Box>
        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                {['Invoice No.', 'Customer', 'Date', 'Invoice Amount', 'Refund', 'Charges', 'Net Refund', 'Reason', 'Status', 'Actions'].map(h =>
                  <TableCell key={h} sx={{ fontWeight: 'bold' }}>{h}</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {historyFiltered.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell>{c.invoiceNumber}</TableCell>
                  <TableCell>{c.customerName}</TableCell>
                  <TableCell>{c.refundDate}</TableCell>
                  <TableCell>{formatCurrency(c.originalAmount)}</TableCell>
                  <TableCell>{formatCurrency(c.refundAmount)}</TableCell>
                  <TableCell>{formatCurrency(c.cancellationCharges)}</TableCell>
                  <TableCell sx={{ color: 'error.main', fontWeight: 'bold' }}>{formatCurrency(c.netRefundAmount)}</TableCell>
                  <TableCell>{c.refundReason}</TableCell>
                  <TableCell><Typography variant="caption" sx={{ color: 'success.main', fontWeight: 'bold' }}>{String(c.status || 'completed').toUpperCase()}</Typography></TableCell>
                  <TableCell>
                    <Tooltip title="Export cancellation PDF">
                      <IconButton color="primary" size="small" onClick={() => generatePdf(c)}><PictureAsPdf /></IconButton>
                    </Tooltip>
                    <Tooltip title="Delete history only">
                      <IconButton color="error" size="small" onClick={() => deleteCancellationRecord(c.id)}><Delete /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!historyFiltered.length && (
                <TableRow><TableCell colSpan={10} align="center">No cancellation records found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={confirmOpen} onClose={() => !loading && setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm invoice cancellation</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>Customer: <b>{selectedCustomer?.name}</b></Typography>
          <Typography gutterBottom>Invoice: <b>{invoiceDetails?.invoiceNumber}</b></Typography>
          <Typography gutterBottom>Original amount: <b>{formatCurrency(invoiceDetails?.totalAmount ?? invoiceDetails?.ticketPrice)}</b></Typography>
          <Typography gutterBottom>Refund: <b>{formatCurrency(refundData.refundAmount)}</b></Typography>
          <Typography gutterBottom>Cancellation charges: <b>{formatCurrency(refundData.cancellationCharges)}</b></Typography>
          <Typography color="error" fontWeight="bold" mt={2}>
            This permanently deletes the invoice and its invoice-ledger entry. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={loading}>Go Back</Button>
          <Button onClick={processCancellation} color="error" variant="contained"
            startIcon={<CheckCircle />} disabled={loading}>
            Confirm & Delete Invoice
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Cancellation;