import React, { useState, useEffect } from 'react';
import {
  Container, Typography, TextField, Button, Paper, Box, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
  IconButton, Tooltip, Avatar
} from '@mui/material';
import { 
  Search, Cancel, CheckCircle, PictureAsPdf, Edit, Delete, 
  Receipt, Person, CalendarToday, AttachMoney, Warning, Notes, Clear
} from '@mui/icons-material';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const Cancellation = () => {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openConfirmDialog, setOpenConfirmDialog] = useState(false);
  const [cancellations, setCancellations] = useState([]);
  const [editingCancellation, setEditingCancellation] = useState(null);

  const [refundData, setRefundData] = useState({
    refundAmount: '',
    refundReason: '',
    refundDate: new Date().toISOString().split('T')[0],
    remarks: '',
    paymentMethod: '',
    cancellationCharges: ''
  });

  useEffect(() => {
    const fetchCancellations = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'cancellations'));
        const cancellationsData = querySnapshot.docs.map(doc => ({
          id: doc.id, ...doc.data()
        })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setCancellations(cancellationsData);
      } catch (err) {
        console.error('Error fetching cancellations:', err);
      }
    };
    fetchCancellations();
  }, []);

  const calculateNetRefundAmount = () => {
    const refundAmount = parseFloat(refundData.refundAmount) || 0;
    const cancellationCharges = parseFloat(refundData.cancellationCharges) || 0;
    return Math.max(0, refundAmount - cancellationCharges);
  };

  const netRefundAmount = calculateNetRefundAmount();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setRefundData(prev => ({ ...prev, [name]: value }));
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '₹0.00' : new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(num).replace('₹', '₹ ');
  };

  const handleSearch = async () => {
    if (!invoiceNumber.trim()) return setError('Please enter an invoice number');

    setLoading(true);
    setError('');
    setSuccess('');
    setInvoiceDetails(null);

    try {
      const q = query(collection(db, 'invoices'), where('invoiceNumber', '==', invoiceNumber));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return setError('Invoice not found');
      
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      
      if (data.status === 'cancelled') return setError('This invoice is already cancelled.');

      setInvoiceDetails(data);
      setRefundData(prev => ({
        ...prev,
        refundAmount: data.totalAmount?.toString() || data.ticketPrice?.toString() || '',
        paymentMethod: data.paymentMethod || ''
      }));

    } catch (err) {
      console.error('Error fetching invoice:', err);
      setError('Error fetching invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!invoiceDetails) return setError('Please search for a valid invoice first'), false;

    const refundAmt = parseFloat(refundData.refundAmount) || 0;
    const cancelCharges = parseFloat(refundData.cancellationCharges) || 0;
    const originalAmt = parseFloat(invoiceDetails.totalAmount || invoiceDetails.ticketPrice) || 0;

    if (!refundData.refundAmount || isNaN(refundAmt)) return setError('Please enter a valid refund amount'), false;
    if (refundAmt > originalAmt) return setError('Refund amount cannot exceed original invoice amount'), false;
    if (cancelCharges > refundAmt) return setError('Cancellation charges cannot exceed refund amount'), false;
    if (!refundData.refundReason) return setError('Please select a refund reason'), false;

    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    setOpenConfirmDialog(true);
  };

  const generatePdf = (cancellation) => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('TRAVELWINGS - CANCELLATION RECEIPT', 105, 20, { align: 'center' });
    
    doc.setFontSize(12); doc.setFont('helvetica', 'normal');
    doc.text(`Invoice Number: ${cancellation.invoiceNumber}`, 20, 40);
    doc.text(`Customer Name: ${cancellation.customerName}`, 20, 50);
    doc.text(`Refund Date: ${cancellation.refundDate}`, 20, 60);
    
    doc.text(`Original Amount: ${formatCurrency(cancellation.originalAmount)}`, 20, 80);
    doc.text(`Refund Amount: ${formatCurrency(cancellation.refundAmount)}`, 20, 90);
    doc.text(`Cancellation Charges: ${formatCurrency(cancellation.cancellationCharges)}`, 20, 100);
    doc.text(`Net Refund: ${formatCurrency(cancellation.netRefundAmount)}`, 20, 110);
    doc.text(`Payment Method: ${cancellation.paymentMethod}`, 20, 120);
    doc.text(`Reason: ${cancellation.refundReason}`, 20, 130);
    
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Refund ID: ${cancellation.refundId}`, 105, 160, { align: 'center' });
    doc.text('Thank you for your business!', 105, 170, { align: 'center' });
    
    doc.save(`Cancellation_${cancellation.invoiceNumber}.pdf`);
  };

  const confirmRefund = async () => {
    setOpenConfirmDialog(false);
    setLoading(true);
    setError('');

    try {
      if (!invoiceDetails) throw new Error('Invoice details not available');

      const refundId = `REF${Math.floor(Math.random() * 10000)}`;
      const cancellationData = {
        invoiceNumber: invoiceDetails.invoiceNumber || '',
        customerName: invoiceDetails.customerName || '',
        originalAmount: invoiceDetails.totalAmount || invoiceDetails.ticketPrice || 0,
        ...refundData,
        refundAmount: netRefundAmount,
        netRefundAmount: netRefundAmount,
        refundId,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'cancellations'), cancellationData);
      
      // Update Invoice Status to Cancelled (Optional but recommended based on past phases)
      if (invoiceDetails.id) {
        await updateDoc(doc(db, 'invoices', invoiceDetails.id), { status: 'cancelled' });
      }
      
      setSuccess(`Refund successful! Refund ID: ${refundId}`);
      setCancellations(prev => [{ id: docRef.id, ...cancellationData }, ...prev]);
      
      // Reset form
      setInvoiceNumber('');
      setInvoiceDetails(null);
      setRefundData({
        refundAmount: '', refundReason: '', refundDate: new Date().toISOString().split('T')[0],
        remarks: '', paymentMethod: '', cancellationCharges: ''
      });

    } catch (err) {
      console.error('Refund error:', err);
      setError(err.message || 'Error processing refund');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cancellation) => {
    setEditingCancellation(cancellation);
    setInvoiceNumber(cancellation.invoiceNumber);
    setRefundData({
      refundAmount: cancellation.refundAmount.toString(),
      refundReason: cancellation.refundReason,
      refundDate: cancellation.refundDate,
      remarks: cancellation.remarks,
      paymentMethod: cancellation.paymentMethod,
      cancellationCharges: cancellation.cancellationCharges.toString()
    });
    setInvoiceDetails({
      invoiceNumber: cancellation.invoiceNumber,
      customerName: cancellation.customerName,
      totalAmount: cancellation.originalAmount,
      paymentMethod: cancellation.paymentMethod
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateCancellation = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'cancellations', editingCancellation.id), {
        ...refundData,
        refundAmount: netRefundAmount,
        netRefundAmount: netRefundAmount
      });

      setCancellations(prev => prev.map(item => 
        item.id === editingCancellation.id ? 
        { ...item, ...refundData, refundAmount: netRefundAmount, netRefundAmount } : 
        item
      ));

      setSuccess('Cancellation updated successfully!');
      setEditingCancellation(null);
      setInvoiceNumber('');
      setInvoiceDetails(null);
      setRefundData({
        refundAmount: '', refundReason: '', refundDate: new Date().toISOString().split('T')[0],
        remarks: '', paymentMethod: '', cancellationCharges: ''
      });
    } catch (err) {
      console.error('Error updating cancellation:', err);
      setError('Error updating cancellation');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this cancellation?')) {
      try {
        await deleteDoc(doc(db, 'cancellations', id));
        setCancellations(prev => prev.filter(item => item.id !== id));
        setSuccess('Cancellation deleted successfully!');
      } catch (err) {
        console.error('Error deleting cancellation:', err);
        setError('Error deleting cancellation');
      }
    }
  };

  // ─── Custom Theme Styles ───
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
            Cancellations & Refunds
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage invoice cancellations, process refunds, and track adjustments.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ─── SEARCH SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <Search fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingCancellation ? 'Edit Cancellation' : 'Search Invoice'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter an invoice number to process a cancellation or refund
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Receipt fontSize="small" color="primary" /> Invoice Number
            </Typography>
            <TextField
              fullWidth
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g., TM-2024-0001"
              disabled={loading || !!editingCancellation}
              sx={inputStyle}
            />
          </Box>
          
          {!editingCancellation ? (
            <Button
              variant="contained"
              onClick={handleSearch}
              startIcon={<Search />}
              disabled={loading || !invoiceNumber.trim()}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', height: 56, px: 4 }}
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="warning"
              onClick={() => {
                setEditingCancellation(null); setInvoiceNumber(''); setInvoiceDetails(null); setError('');
                setRefundData({ refundAmount: '', refundReason: '', refundDate: new Date().toISOString().split('T')[0], remarks: '', paymentMethod: '', cancellationCharges: '' });
              }}
              sx={{ textTransform: 'none', height: 56, px: 4 }}
            >
              Cancel Edit
            </Button>
          )}
        </Box>
      </Paper>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* ─── FORM SECTION ─── */}
      {(invoiceDetails || editingCancellation) && !loading && (
        <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
          
          {/* Invoice Details Info Box */}
          <Box sx={{ mb: 4, p: 3, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>Invoice Details</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Invoice Number</Typography>
                <Typography fontWeight="bold">{invoiceDetails?.invoiceNumber}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Customer Name</Typography>
                <Typography fontWeight="bold">{invoiceDetails?.customerName}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Original Amount</Typography>
                <Typography fontWeight="bold">{formatCurrency(invoiceDetails?.totalAmount || invoiceDetails?.ticketPrice)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Payment Method</Typography>
                <Typography fontWeight="bold">{invoiceDetails?.paymentMethod || 'N/A'}</Typography>
              </Grid>
            </Grid>
          </Box>

          <Typography variant="h6" fontWeight="bold" mb={3}>Refund Details</Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="warning" /> Refund Date *
              </Typography>
              <TextField name="refundDate" type="date" fullWidth value={refundData.refundDate} onChange={handleInputChange} sx={inputStyle} InputLabelProps={{ shrink: true }} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney fontSize="small" color="success" /> Refund Amount (₹) *
              </Typography>
              <TextField name="refundAmount" type="number" fullWidth value={refundData.refundAmount} onChange={handleInputChange} sx={inputStyle} inputProps={{ min: 0, step: 0.01 }} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Warning fontSize="small" color="error" /> Cancellation Charges (₹)
              </Typography>
              <TextField name="cancellationCharges" type="number" fullWidth value={refundData.cancellationCharges} onChange={handleInputChange} sx={inputStyle} inputProps={{ min: 0, step: 0.01 }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckCircle fontSize="small" color="success" /> Net Refund Amount
              </Typography>
              <TextField fullWidth value={formatCurrency(netRefundAmount)} disabled sx={{ ...inputStyle, bgcolor: '#e8f5e9' }} InputProps={{ readOnly: true }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Receipt fontSize="small" color="primary" /> Payment Method
              </Typography>
              <TextField fullWidth value={refundData.paymentMethod} disabled sx={inputStyle} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Warning fontSize="small" color="warning" /> Refund Reason *
              </Typography>
              <TextField select fullWidth name="refundReason" value={refundData.refundReason} onChange={handleInputChange} sx={inputStyle} required>
                <MenuItem value="" disabled><em>Select a reason</em></MenuItem>
                <MenuItem value="Customer Request">Customer Request</MenuItem>
                <MenuItem value="Service Not Provided">Service Not Provided</MenuItem>
                <MenuItem value="Duplicate Payment">Duplicate Payment</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </TextField>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Notes fontSize="small" color="info" /> Remarks
              </Typography>
              <TextField name="remarks" multiline rows={2} fullWidth value={refundData.remarks} onChange={handleInputChange} sx={inputStyle} />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" onClick={() => { setEditingCancellation(null); setInvoiceDetails(null); setInvoiceNumber(''); setError(''); }} startIcon={<Clear />} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary', px: 3 }}>
              Clear
            </Button>
            <Button variant="contained" color={editingCancellation ? "warning" : "error"} onClick={editingCancellation ? updateCancellation : handleSubmit} startIcon={<Cancel />} disabled={loading} sx={{ textTransform: 'none', px: 4 }}>
              {loading ? 'Processing...' : editingCancellation ? 'Update Cancellation' : 'Process Refund'}
            </Button>
          </Box>
        </Paper>
      )}

      {/* ─── HISTORY SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <Cancel fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Recent Cancellations</Typography>
            <Typography variant="body2" color="text.secondary">View and manage all processed refunds</Typography>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice No.</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Refund Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Refund Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cancellations.map((cancellation) => (
                <TableRow key={cancellation.id} hover>
                  <TableCell><Typography fontWeight="500">{cancellation.invoiceNumber}</Typography></TableCell>
                  <TableCell>{cancellation.customerName}</TableCell>
                  <TableCell>{cancellation.refundDate}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                    {formatCurrency(cancellation.netRefundAmount)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', px: 1, py: 0.5, borderRadius: 1, fontWeight: 'bold' }}>
                      Completed
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Generate PDF">
                      <IconButton onClick={() => generatePdf(cancellation)} color="primary" size="small"><PictureAsPdf fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton onClick={() => handleEdit(cancellation)} color="warning" size="small"><Edit fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton onClick={() => handleDelete(cancellation.id)} color="error" size="small"><Delete fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {cancellations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">No cancellations found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ─── CONFIRM DIALOG ─── */}
      <Dialog open={openConfirmDialog} onClose={() => setOpenConfirmDialog(false)}>
        <DialogTitle>Confirm Refund</DialogTitle>
        <DialogContent>
          <Typography gutterBottom><b>Invoice:</b> {invoiceDetails?.invoiceNumber || 'N/A'}</Typography>
          <Typography gutterBottom><b>Customer:</b> {invoiceDetails?.customerName || 'N/A'}</Typography>
          <Typography gutterBottom><b>Ticket Price:</b> {formatCurrency(invoiceDetails?.totalAmount || invoiceDetails?.ticketPrice)}</Typography>
          <Typography gutterBottom><b>Cancellation Charges:</b> {formatCurrency(refundData.cancellationCharges)}</Typography>
          <Typography fontWeight="bold" mt={2} color="error.main" variant="h6">
            Net Refund Amount: {formatCurrency(netRefundAmount)}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConfirmDialog(false)}>Cancel</Button>
          <Button onClick={confirmRefund} color="error" variant="contained" startIcon={<CheckCircle />}>
            Confirm Refund
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Cancellation;