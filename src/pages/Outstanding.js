import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc, 
  onSnapshot, query 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { 
  TextField, Button, Typography, Box, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, FormControl, 
  Select, MenuItem, IconButton, Dialog, DialogTitle, 
  DialogContent, DialogActions, Alert, CircularProgress,
  Grid, Avatar, Divider
} from '@mui/material';
import { 
  PictureAsPdf as PictureAsPdfIcon, Delete, 
  AccountBalanceWallet, Person, Receipt, 
  AttachMoney, CalendarToday, Warning, Add, Clear
} from '@mui/icons-material';

const Outstanding = () => {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [outstandings, setOutstandings] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  
  const [formData, setFormData] = useState({
    customerId: '',
    invoiceId: '',
    amountPaid: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [outstandingToDelete, setOutstandingToDelete] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [customersData, invoicesData] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'invoices'))
      ]);

      setCustomers(customersData.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setInvoices(invoicesData.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id, totalAmount: parseFloat(data.totalAmount) || 0 };
      }));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError('Failed to load data. Please try again.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();

    const unsubscribeOutstandings = onSnapshot(query(collection(db, 'outstandings')), (snapshot) => {
      const updated = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          totalAmount: parseFloat(data.totalAmount) || 0,
          amountPaid: parseFloat(data.amountPaid) || 0,
          remainingAmount: parseFloat(data.remainingAmount) || 0
        };
      });
      setOutstandings(updated);
    });

    const unsubscribeInvoices = onSnapshot(query(collection(db, 'invoices')), (snapshot) => {
      const updated = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id, totalAmount: parseFloat(data.totalAmount) || 0 };
      });
      setInvoices(updated);
    });

    return () => { unsubscribeOutstandings(); unsubscribeInvoices(); };
  }, [fetchInitialData]);

  const consolidatedOutstandings = useMemo(() => {
    const map = new Map();
    const sorted = [...outstandings].sort((a, b) => new Date(a.date) - new Date(b.date));
    sorted.forEach(record => map.set(record.invoiceId, record));
    return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [outstandings]);

  const handleCustomerChange = (e) => {
    const customerId = e.target.value;
    setSelectedCustomer(customers.find(c => c.id === customerId) || null);
    setFormData({ ...formData, customerId, invoiceId: '', amountPaid: '' });
    setSelectedInvoice(null);
  };

  const handleInvoiceChange = (e) => {
    const invoiceId = e.target.value;
    const invoice = invoices.find(i => i.id === invoiceId);
    setSelectedInvoice(invoice);
    
    const existing = consolidatedOutstandings.find(o => o.invoiceId === invoiceId);
    
    setFormData({ 
      ...formData, 
      invoiceId,
      amountPaid: existing ? '0' : (invoice ? invoice.totalAmount.toString() : '0') 
    });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setFormData({ customerId: '', invoiceId: '', amountPaid: '', date: format(new Date(), 'yyyy-MM-dd') });
    setSelectedCustomer(null);
    setSelectedInvoice(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!selectedInvoice) return setError('Please select an invoice');

    try {
      const amountToPay = parseFloat(formData.amountPaid) || 0;
      if (amountToPay <= 0) throw new Error('Payment amount must be greater than zero');

      const existing = consolidatedOutstandings.find(o => o.invoiceId === selectedInvoice.id);
      
      const previouslyPaid = existing ? existing.amountPaid : 0;
      const newTotalPaid = previouslyPaid + amountToPay;
      const remaining = selectedInvoice.totalAmount - newTotalPaid;

      if (remaining < -0.01) {
        throw new Error(`Overpayment detected. Remaining balance is ₹${(selectedInvoice.totalAmount - previouslyPaid).toFixed(2)}`);
      }

      const outstandingData = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        invoiceId: selectedInvoice.id,
        totalAmount: selectedInvoice.totalAmount,
        amountPaid: newTotalPaid,
        remainingAmount: Math.max(0, remaining),
        date: formData.date,
      };

      if (existing) {
        await updateDoc(doc(db, 'outstandings', existing.id), outstandingData);
        
        // Clean up legacy duplicates
        const duplicates = outstandings.filter(o => o.invoiceId === selectedInvoice.id && o.id !== existing.id);
        for (const dup of duplicates) {
           await deleteDoc(doc(db, 'outstandings', dup.id));
        }
      } else {
        await addDoc(collection(db, 'outstandings'), outstandingData);
      }

      if (remaining <= 0) {
        await updateDoc(doc(db, 'invoices', selectedInvoice.id), { status: 'paid' });
      } else if (newTotalPaid > 0) {
        await updateDoc(doc(db, 'invoices', selectedInvoice.id), { status: 'partially_paid' });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving outstanding:', error);
      setError(error.message || 'Failed to save payment.');
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'outstandings', outstandingToDelete.id));
      
      const invoice = invoices.find(i => i.id === outstandingToDelete.invoiceId);
      if (invoice) {
        await updateDoc(doc(db, 'invoices', invoice.id), { status: 'active' });
      }
      setDeleteDialogOpen(false);
      setOutstandingToDelete(null);
    } catch (error) {
      setError('Failed to delete record.');
    }
  };

  const generatePDF = () => {
    const outstandingRecords = consolidatedOutstandings.filter(r => r.remainingAmount > 0);
    const customerMap = {};
    outstandingRecords.forEach(r => {
      customerMap[r.customerName] = (customerMap[r.customerName] || 0) + r.remainingAmount;
    });

    const tableData = Object.entries(customerMap).map(([name, amt]) => [
      name, 
      { content: amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), styles: { halign: 'right', textColor: [211, 47, 47] } }
    ]);
    const total = Object.values(customerMap).reduce((s, a) => s + a, 0);
    
    tableData.push([
      { content: 'TOTAL OUTSTANDING', styles: { fontStyle: 'bold' } }, 
      { content: total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold', textColor: [211, 47, 47] } }
    ]);

    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('OUTSTANDING PAYMENTS REPORT', 105, 15, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 105, 22, { align: 'center' });
    
    doc.autoTable({ 
      startY: 30, 
      head: [['Customer', 'Outstanding (₹)']], 
      body: tableData,
      headStyles: { fillColor: [25, 118, 210] }
    });
    doc.save(`outstanding_report_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
  };

  const summary = consolidatedOutstandings.reduce((acc, r) => {
    acc.total += r.totalAmount;
    acc.paid += r.amountPaid;
    acc.remaining += r.remainingAmount;
    return acc;
  }, { total: 0, paid: 0, remaining: 0 });

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
            Outstanding Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Track unpaid invoices, record partial payments, and manage balances.
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
              <Typography variant="h5" fontWeight="bold">Record Payment</Typography>
              <Typography variant="body2" color="text.secondary">Enter payment details against a specific invoice</Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation startIcon={<PictureAsPdfIcon />} onClick={generatePDF} disabled={summary.remaining === 0} sx={{ bgcolor: '#2e7d32', color: '#fff', '&:hover': { bgcolor: '#1b5e20' }, textTransform: 'none' }}>
            Export PDF
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="primary" /> Select Customer *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required>
                <Select name="customerId" value={formData.customerId} onChange={handleCustomerChange} displayEmpty>
                  <MenuItem value="" disabled><em>Select a customer</em></MenuItem>
                  {customers.filter(c => c.isActive !== false || c.id === formData.customerId).map(c => (
                    <MenuItem key={c.id} value={c.id}>{c.name} ({c.phone}) {c.isActive === false ? '[Inactive]' : ''}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Receipt fontSize="small" color="info" /> Select Invoice *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required disabled={!selectedCustomer}>
                <Select name="invoiceId" value={formData.invoiceId} onChange={handleInvoiceChange} displayEmpty>
                  <MenuItem value="" disabled><em>Select an invoice</em></MenuItem>
                  {invoices
                    .filter(i => i.customerId === selectedCustomer?.id && (i.status === 'active' || i.status === 'partially_paid' || i.id === formData.invoiceId))
                    .map(inv => {
                      const exist = consolidatedOutstandings.find(o => o.invoiceId === inv.id);
                      const due = exist ? exist.remainingAmount : inv.totalAmount;
                      return <MenuItem key={inv.id} value={inv.id}>{inv.invoiceNumber} - Due: ₹{due.toFixed(2)}</MenuItem>;
                    })}
                </Select>
              </FormControl>
            </Grid>

            {selectedInvoice && (
              <>
                <Grid size={{ xs: 12, md: 6, lg: 3 }}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AttachMoney fontSize="small" color="success" /> New Payment Amount (₹) *
                  </Typography>
                  <TextField 
                    name="amountPaid" type="number" 
                    value={formData.amountPaid} onChange={handleChange} 
                    fullWidth sx={inputStyle} required 
                    inputProps={{ min: 0.01, step: 0.01 }} 
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6, lg: 3 }}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CalendarToday fontSize="small" color="warning" /> Date *
                  </Typography>
                  <TextField 
                    name="date" type="date" 
                    value={formData.date} onChange={handleChange} 
                    fullWidth sx={inputStyle} InputLabelProps={{ shrink: true }} required 
                  />
                </Grid>
              </>
            )}
          </Grid>

          {selectedInvoice && (
            <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e0e0e0' }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">Invoice Total</Typography>
                  <Typography fontWeight="bold">₹{selectedInvoice.totalAmount.toFixed(2)}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="error.main">Current Due</Typography>
                  <Typography fontWeight="bold" color="error.main">₹{(consolidatedOutstandings.find(o => o.invoiceId === selectedInvoice.id)?.remainingAmount || selectedInvoice.totalAmount).toFixed(2)}</Typography>
                </Grid>
              </Grid>
            </Box>
          )}

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" onClick={resetForm} disabled={loading} startIcon={<Clear />} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary', px: 3 }}>
              Clear
            </Button>
            <Button type="submit" variant="contained" disabled={loading || !selectedInvoice} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />} sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}>
              {loading ? 'Saving...' : 'Save Payment'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ─── SUMMARY CARDS ─── */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #1976d2' }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">Total Invoiced</Typography>
            <Typography variant="h5" fontWeight="900" color="text.primary">₹{summary.total.toFixed(2)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #2e7d32' }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">Total Paid</Typography>
            <Typography variant="h5" fontWeight="900" color="success.main">₹{summary.paid.toFixed(2)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #d32f2f' }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">Total Outstanding</Typography>
            <Typography variant="h5" fontWeight="900" color="error.main">₹{summary.remaining.toFixed(2)}</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* ─── TABLE SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <AccountBalanceWallet fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Outstanding Records</Typography>
            <Typography variant="body2" color="text.secondary">View and manage all invoice payment histories</Typography>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Total Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount Paid (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Remaining (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Last Update</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {consolidatedOutstandings.map(r => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell><Typography fontWeight="500">{invoices.find(i => i.id === r.invoiceId)?.invoiceNumber || r.invoiceId.substring(0,6)}</Typography></TableCell>
                  <TableCell align="right">{r.totalAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>{r.amountPaid.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: r.remainingAmount > 0 ? 'error.main' : 'success.main', fontWeight: 'bold' }}>
                    {r.remainingAmount.toFixed(2)}
                  </TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>
                    <IconButton color="error" onClick={() => { setOutstandingToDelete(r); setDeleteDialogOpen(true); }} disabled={loading} size="small">
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {consolidatedOutstandings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">No payment records found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ─── DELETE DIALOG ─── */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Payment Record?</DialogTitle>
        <DialogContent>
          <Typography>This will remove the payment history for this invoice and revert the invoice status back to <b>Active</b>.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ textTransform: 'none', color: 'text.secondary' }}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Outstanding;