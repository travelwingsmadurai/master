// src/pages/Receipt.js — Themed UI + WhatsApp & QR
import React, { useState, useEffect, useRef } from 'react';
import { addDoc, collection, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useReactToPrint } from 'react-to-print';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import { 
  TextField, Button, Box, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, FormControl, 
  Select, MenuItem, IconButton, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Typography, Grid, Avatar, Divider, Tooltip
} from '@mui/material';
import { 
  PictureAsPdf as PictureAsPdfIcon, 
  Edit, Delete, Receipt as ReceiptIcon, 
  Person, CalendarToday, AttachMoney, Payment, AccountBalance,
  Add, Clear, WhatsApp
} from '@mui/icons-material';

function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  function convertLessThanOneThousand(n) {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanOneThousand(n % 100) : '');
  }
  
  if (num === 0) return 'Zero Rupees';
  let rupees = Math.floor(num);
  let paise = Math.round((num - rupees) * 100);
  let words = '';
  
  if (rupees > 0) {
    if (rupees >= 10000000) { words += convertLessThanOneThousand(Math.floor(rupees / 10000000)) + ' Crore '; rupees %= 10000000; }
    if (rupees >= 100000) { words += convertLessThanOneThousand(Math.floor(rupees / 100000)) + ' Lakh '; rupees %= 100000; }
    if (rupees >= 1000) { words += convertLessThanOneThousand(Math.floor(rupees / 1000)) + ' Thousand '; rupees %= 1000; }
    if (rupees > 0) { words += convertLessThanOneThousand(rupees) + ' '; }
    words += 'Rupees';
  }
  if (paise > 0) { if (words !== '') words += ' and '; words += convertLessThanOneThousand(paise) + ' Paise'; }
  return words;
}

const Receipt = () => {
  const [customers, setCustomers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState(null);
  const receiptRef = useRef();

  const [formData, setFormData] = useState({
    customerId: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'),
    receiptNo: '', paymentMode: 'Cash', paymentName: ''
  });

  const customersCollectionRef = collection(db, 'customers');
  const receiptsCollectionRef = collection(db, 'receipts');
  const ledgerCollectionRef = collection(db, 'accountLedger');

  const generateReceiptNo = (list = receipts) => {
    if (list.length === 0) return '1';
    let max = 0;
    list.forEach(r => {
      const digits = String(r.receiptNo).replace(/\D/g, '');
      if (digits) max = Math.max(max, parseInt(digits, 10));
    });
    return (max + 1).toString();
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [customersData, receiptsData] = await Promise.all([
          getDocs(customersCollectionRef),
          getDocs(receiptsCollectionRef)
        ]);
        
        setCustomers(customersData.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        
        const sorted = receiptsData.docs.map(doc => ({ 
          ...doc.data(), id: doc.id, amount: parseFloat(doc.data().amount) || 0
        })).sort((a, b) => (parseInt(b.receiptNo) || 0) - (parseInt(a.receiptNo) || 0));
        
        setReceipts(sorted);
        setFormData(prev => ({ ...prev, receiptNo: generateReceiptNo(sorted) }));
      } catch (err) {
        setError('Failed to load data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCustomerChange = (e) => {
    const customerId = e.target.value;
    setSelectedCustomer(customers.find(c => c.id === customerId) || null);
    setFormData({ ...formData, customerId });
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const resetForm = (list = receipts) => {
    setFormData({
      customerId: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'),
      receiptNo: generateReceiptNo(list), paymentMode: 'Cash', paymentName: ''
    });
    setSelectedCustomer(null);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    
    try {
      if (!formData.customerId || !formData.amount || !formData.date) throw new Error('Please fill all required fields');
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than zero');

      const receiptData = {
        ...formData,
        customerName: selectedCustomer?.name || '',
        customerPhone: selectedCustomer?.phone || '', // Added for WhatsApp
        amount: amount.toFixed(2),
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'receipts', editingId), receiptData);
        
        const q = query(ledgerCollectionRef, where('receiptNo', '==', formData.receiptNo), where('type', '==', 'receipt'));
        const ledgerSnap = await getDocs(q);
        for (const lDoc of ledgerSnap.docs) {
          await updateDoc(doc(db, 'accountLedger', lDoc.id), {
             ...receiptData, amount: parseFloat(receiptData.amount)
          });
        }
      } else {
        receiptData.createdAt = new Date().toISOString();
        await addDoc(receiptsCollectionRef, receiptData);
        
        await addDoc(ledgerCollectionRef, {
          ...receiptData, type: 'receipt', amount: parseFloat(receiptData.amount), entryDate: new Date().toISOString()
        });
      }

      const snap = await getDocs(receiptsCollectionRef);
      const fresh = snap.docs.map(d => ({ ...d.data(), id: d.id, amount: parseFloat(d.data().amount) || 0 }))
        .sort((a, b) => (parseInt(b.receiptNo) || 0) - (parseInt(a.receiptNo) || 0));
      
      setReceipts(fresh);
      resetForm(fresh);
    } catch (err) {
      setError(err.message || 'Failed to save receipt.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (receipt) => {
    setSelectedCustomer(customers.find(c => c.id === receipt.customerId) || null);
    setEditingId(receipt.id);
    setFormData({
      customerId: receipt.customerId, amount: receipt.amount.toString(), date: receipt.date,
      receiptNo: receipt.receiptNo, paymentMode: receipt.paymentMode || 'Cash', paymentName: receipt.paymentName || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'receipts', receiptToDelete.id));
      
      const q = query(ledgerCollectionRef, where('receiptNo', '==', receiptToDelete.receiptNo), where('type', '==', 'receipt'));
      const ledgerSnap = await getDocs(q);
      for (const lDoc of ledgerSnap.docs) {
        await deleteDoc(doc(db, 'accountLedger', lDoc.id));
      }

      const snap = await getDocs(receiptsCollectionRef);
      const fresh = snap.docs.map(d => ({ ...d.data(), id: d.id, amount: parseFloat(d.data().amount) || 0 }))
        .sort((a, b) => (parseInt(b.receiptNo) || 0) - (parseInt(a.receiptNo) || 0));
      
      setReceipts(fresh);
      setDeleteDialogOpen(false);
      if (editingId === receiptToDelete.id) resetForm(fresh);
    } catch (err) {
      setError('Failed to delete receipt.');
    }
  };

  // ─── CORE PDF GENERATION FUNCTION ───
  const buildPDF = (receipt) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('"TRAVELWINGS"', pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('F56 PARASAN SAMUDHRI MAHAL, OPP FATHIMA COLLEGE', pageWidth / 2, 22, { align: 'center' });
      doc.text('MADURAI', pageWidth / 2, 28, { align: 'center' });
      
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('RECEIPT', pageWidth / 2, 40, { align: 'center' });
      
      let y = 50;
      const rows = [
        ['Receipt No:', receipt.receiptNo], ['Date:', receipt.date],
        ['Customer Name:', receipt.customerName], ['Amount (₹):', parseFloat(receipt.amount).toFixed(2)],
        ['Payment Mode:', receipt.paymentMode || 'Cash']
      ];
      if (receipt.paymentName) rows.push(['Reference:', receipt.paymentName]);

      doc.setFontSize(10);
      rows.forEach(([label, val]) => {
        doc.setFont('helvetica', 'bold'); doc.text(label, 20, y);
        doc.setFont('helvetica', 'normal'); doc.text(String(val), 60, y);
        y += 8;
      });

      y += 5;
      doc.setFont('helvetica', 'bold'); doc.text('Amount in Words:', 20, y);
      doc.setFont('helvetica', 'normal'); doc.text(numberToWords(parseFloat(receipt.amount)), 60, y);
      
      if (receipt.paymentMode !== 'Cash') {
        y += 8; doc.setFont('helvetica', 'italic'); doc.text(`(${receipt.paymentMode} Subject to Realisation)`, 20, y);
      }

      // ─── ADD QR CODE TO PDF ───
      y += 15;
      doc.setFont('helvetica', 'bold');
      doc.text('Scan to pay via UPI:', 20, y);
      doc.addImage('/QR.jpeg', 'JPEG', 20, y + 5, 35, 35);

      // Footer
      doc.setFont('helvetica', 'normal');
      doc.text('For "TRAVELWINGS"', 160, y + 20);
      doc.text('Authorised Signatory', 160, y + 25);

      return doc;
    } catch (err) {
      console.error(err);
      setError('Failed to generate PDF.');
      return null;
    }
  };

  // ─── EXPORT PDF BUTTON ───
  const generatePDF = (receipt) => {
    const doc = buildPDF(receipt);
    if (doc) {
      doc.save(`Receipt_${receipt.receiptNo}.pdf`);
    }
  };

  // ─── WHATSAPP SHARE BUTTON (Downloads PDF + Opens Chat Directly) ───
  const handleShareWhatsApp = (receipt) => {
    // 1. Download the PDF first
    const doc = buildPDF(receipt);
    if (doc) {
      doc.save(`Receipt_${receipt.receiptNo}.pdf`);
    }

    // 2. Get Phone Number & Clean it
    const customer = customers.find(c => c.id === receipt.customerId);
    let phone = customer?.phone || receipt.customerPhone || '';
    phone = phone.replace(/\D/g, ''); // Keep only digits
    
    // Add India code if it's a 10-digit number
    if (phone.length === 10) phone = '91' + phone;

    // 3. Prepare Message
    const text = `*Travel Wings - Receipt*\n\n` +
                 `Receipt No: *${receipt.receiptNo}*\n` +
                 `Date: ${receipt.date}\n` +
                 `Customer: ${receipt.customerName}\n` +
                 `Amount: *₹${parseFloat(receipt.amount).toFixed(2)}*\n\n` +
                 `(Please find the attached PDF receipt)`;

    // 4. Use setTimeout to ensure download triggers before opening WhatsApp
    setTimeout(() => {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      setError({ message: 'PDF Downloaded to your computer. Click the 📎 icon in WhatsApp to attach it.', severity: 'info' });
    }, 800);
  };

  // ─── Custom Theme Styles ───
  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#fff',
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
            Receipt Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage customer payments, issue receipts and track cash flow.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity={error.severity || 'error'} sx={{ mb: 3 }} onClose={() => setError(null)}>{error.message || error}</Alert>}

      {/* ─── FORM SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <ReceiptIcon fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingId ? 'Edit Receipt' : 'Create New Receipt'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter payment details to record a new transaction
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation sx={{ bgcolor: '#e3f2fd', color: '#1976d2', '&:hover': { bgcolor: '#bbdefb' }, textTransform: 'none' }}>
            View All Receipts
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="success" /> Select Customer *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required>
                <Select name="customerId" value={formData.customerId} onChange={handleCustomerChange} displayEmpty disabled={loading}>
                  <MenuItem value="" disabled><em>Select a customer</em></MenuItem>
                  {customers.filter(c => c.isActive !== false || c.id === formData.customerId).map(c => (
                    <MenuItem key={c.id} value={c.id}>{c.name} {c.isActive === false ? '[Inactive]' : ''}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ReceiptIcon fontSize="small" color="primary" /> Receipt No *
              </Typography>
              <TextField name="receiptNo" value={formData.receiptNo} onChange={handleChange} fullWidth sx={inputStyle} disabled={loading || !!editingId} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="warning" /> Date *
              </Typography>
              <TextField name="date" type="date" value={formData.date} onChange={handleChange} fullWidth sx={inputStyle} InputLabelProps={{ shrink: true }} disabled={loading} required />
            </Grid>

            {/* Row 2 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney fontSize="small" color="success" /> Amount (₹) *
              </Typography>
              <TextField name="amount" type="number" value={formData.amount} onChange={handleChange} fullWidth placeholder="0.00" sx={inputStyle} inputProps={{ min: 0.01, step: 0.01 }} disabled={loading} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Payment fontSize="small" color="info" /> Payment Mode *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required>
                <Select name="paymentMode" value={formData.paymentMode} onChange={handleChange} disabled={loading}>
                  {['Cash', 'Cheque', 'Bank Transfer', 'UPI', 'Credit Card', 'Debit Card'].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {formData.paymentMode !== 'Cash' && (
              <Grid size={{ xs: 12, md: 6, lg: 4 }}>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccountBalance fontSize="small" color="secondary" /> Payment Reference / Cheque No
                </Typography>
                <TextField name="paymentName" value={formData.paymentName} onChange={handleChange} fullWidth placeholder="Enter reference number" sx={inputStyle} disabled={loading} />
              </Grid>
            )}
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={() => resetForm()} 
              disabled={loading}
              startIcon={<Clear />}
              sx={{ textTransform: 'none', color: 'text.secondary', borderColor: '#e0e0e0', px: 3 }}
            >
              Clear
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}
            >
              {loading ? 'Saving...' : editingId ? 'Update Receipt' : 'Save Receipt'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ─── LIST SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <ReceiptIcon fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Receipt History</Typography>
            <Typography variant="body2" color="text.secondary">View and manage all issued receipts</Typography>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Receipt No.</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Mode</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receipts.map(r => (
                <TableRow key={r.id} hover>
                  <TableCell><Typography fontWeight="500">{r.receiptNo}</Typography></TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.paymentMode}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{r.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    {/* ─── FIXED ACTIONS LAYOUT ─── */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Share via WhatsApp">
                        <IconButton color="success" onClick={() => handleShareWhatsApp(r)} size="small">
                          <WhatsApp fontSize="small" />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Export PDF">
                        <IconButton onClick={() => generatePDF(r)} color="secondary" size="small">
                          <PictureAsPdfIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Edit Receipt">
                        <IconButton onClick={() => handleEdit(r)} color="primary" size="small">
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Delete Receipt">
                        <IconButton onClick={() => { setReceiptToDelete(r); setDeleteDialogOpen(true); }} color="error" size="small">
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">No receipts found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Receipt?</DialogTitle>
        <DialogContent>
          <Typography>This will also remove the entry from the Account Ledger. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Receipt;