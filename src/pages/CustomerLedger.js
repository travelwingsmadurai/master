import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { format, startOfYear, endOfYear } from 'date-fns';
import {
  Typography, Paper, FormControl, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Box,
  Button, CircularProgress, Alert, TextField, Grid, Avatar
} from '@mui/material';
import { 
  PictureAsPdf, Print, Person, CalendarToday, 
  AccountBalanceWallet, Receipt, AccountBalance 
} from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useReactToPrint } from 'react-to-print';

const CustomerLedger = () => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Set default dates to the current year
  const [startDate, setStartDate] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfYear(new Date()), 'yyyy-MM-dd'));

  const ledgerRef = useRef();

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, 'customers'));
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError('Failed to load customers.');
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!selectedCustomer) return;
    
    const fetchLedger = async () => {
      setLoading(true);
      setError(null);
      try {
        const [invSnap, recSnap] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('customerId', '==', selectedCustomer))),
          getDocs(query(collection(db, 'receipts'), where('customerId', '==', selectedCustomer)))
        ]);

        const invoices = invSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            date: data.date,
            type: 'Invoice',
            ref: data.invoiceNumber,
            debit: parseFloat(data.totalAmount) || 0,
            credit: 0,
            status: data.status
          };
        }).filter(i => i.status !== 'cancelled');

        const receipts = recSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            date: data.date,
            type: 'Receipt',
            ref: data.receiptNo,
            debit: 0,
            credit: parseFloat(data.amount) || 0,
          };
        });

        const merged = [...invoices, ...receipts].sort((a, b) => new Date(a.date) - new Date(b.date));
        setAllTransactions(merged);
      } catch (err) {
        console.error(err);
        setError('Failed to load ledger data.');
      } finally {
        setLoading(false);
      }
    };
    fetchLedger();
  }, [selectedCustomer]);

  const { transactions, openingBalance, closingBalance } = useMemo(() => {
    if (allTransactions.length === 0) return { transactions: [], openingBalance: 0, closingBalance: 0 };
    
    let opening = 0;
    allTransactions.filter(t => t.date < startDate).forEach(t => {
      opening += (t.debit - t.credit);
    });

    const rangeTxns = allTransactions.filter(t => t.date >= startDate && t.date <= endDate);
    
    let running = opening;
    const withBalance = rangeTxns.map(t => {
      running += (t.debit - t.credit);
      return { ...t, balance: running };
    });

    return { transactions: withBalance, openingBalance: opening, closingBalance: running };
  }, [allTransactions, startDate, endDate]);

  const customerInfo = customers.find(c => c.id === selectedCustomer);
  const handlePrint = useReactToPrint({ content: () => ledgerRef.current });

  const generatePDF = () => {
    if (!customerInfo) return;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('TRAVELWINGS - CUSTOMER LEDGER', 105, 15, { align: 'center' });
    
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Customer: ${customerInfo.name}`, 15, 25);
    doc.text(`Period: ${startDate} to ${endDate}`, 15, 30);
    doc.text(`Opening Balance: Rs. ${openingBalance.toFixed(2)}`, 15, 35);

    const tableData = transactions.map(t => [
      t.date, t.type, t.ref, t.debit.toFixed(2), t.credit.toFixed(2), t.balance.toFixed(2)
    ]);

    doc.autoTable({
      startY: 45,
      head: [['Date', 'Type', 'Ref No', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)']],
      body: tableData,
      headStyles: { fillColor: [25, 118, 210] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });

    doc.text(`Closing Balance: Rs. ${closingBalance.toFixed(2)}`, 15, doc.lastAutoTable.finalY + 10);
    doc.save(`Ledger_${customerInfo.name}_${startDate}_to_${endDate}.pdf`);
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
            Customer Ledger
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            View detailed debit, credit, and running balances for each customer.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* ─── FILTER SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={4}>
          <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
            <AccountBalanceWallet fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Select Customer & Date Range</Typography>
            <Typography variant="body2" color="text.secondary">Filter the ledger to view specific periods</Typography>
          </Box>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Person fontSize="small" color="primary" /> Select Customer
            </Typography>
            <FormControl fullWidth sx={inputStyle}>
              <Select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} displayEmpty>
                <MenuItem value="" disabled><em>Select a customer</em></MenuItem>
                {customers.map(c => <MenuItem key={c.id} value={c.id}>{c.name} ({c.phone})</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarToday fontSize="small" color="success" /> Start Date
            </Typography>
            <TextField type="date" fullWidth value={startDate} onChange={e => setStartDate(e.target.value)} sx={inputStyle} />
          </Grid>
          
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarToday fontSize="small" color="error" /> End Date
            </Typography>
            <TextField type="date" fullWidth value={endDate} onChange={e => setEndDate(e.target.value)} sx={inputStyle} />
          </Grid>
        </Grid>
      </Paper>

      {loading && <Box display="flex" justifyContent="center" mt={4} mb={4}><CircularProgress /></Box>}

      {selectedCustomer && !loading && (
        <>
          {/* ─── SUMMARY CARDS ─── */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #1976d2' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">Opening Balance (Brought Forward)</Typography>
                <Typography variant="h4" fontWeight="900" color="text.primary" sx={{ mt: 1 }}>
                  ₹{openingBalance.toFixed(2)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: `6px solid ${closingBalance > 0 ? '#d32f2f' : '#2e7d32'}` }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">Closing Balance</Typography>
                <Typography variant="h4" fontWeight="900" color={closingBalance > 0 ? 'error.main' : 'success.main'} sx={{ mt: 1 }}>
                  ₹{closingBalance.toFixed(2)}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* ─── TABLE SECTION ─── */}
          <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
                  <Receipt fontSize="large" />
                </Avatar>
                <Box>
                  <Typography variant="h5" fontWeight="bold">Transaction History</Typography>
                  <Typography variant="body2" color="text.secondary">Ledger for {customerInfo?.name}</Typography>
                </Box>
              </Box>
              <Box display="flex" gap={2}>
                <Button startIcon={<Print />} onClick={handlePrint} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary', px: 3 }} variant="outlined">
                  Print
                </Button>
                <Button startIcon={<PictureAsPdf />} variant="contained" onClick={generatePDF} sx={{ textTransform: 'none', bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' }, px: 3 }}>
                  Export PDF
                </Button>
              </Box>
            </Box>

            <TableContainer ref={ledgerRef}>
              <Table>
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Ref No</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Debit (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Credit (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Balance (₹)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 'bold' }}>Opening Balance</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{openingBalance.toFixed(2)}</TableCell>
                  </TableRow>
                  {transactions.map((t, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ 
                          px: 1, py: 0.5, borderRadius: 1, fontWeight: 'bold',
                          bgcolor: t.type === 'Invoice' ? '#e3f2fd' : '#e8f5e9',
                          color: t.type === 'Invoice' ? '#1976d2' : '#2e7d32'
                        }}>
                          {t.type}
                        </Typography>
                      </TableCell>
                      <TableCell>{t.ref}</TableCell>
                      <TableCell align="right" sx={{ color: t.debit > 0 ? 'error.main' : 'inherit' }}>{t.debit > 0 ? t.debit.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right" sx={{ color: t.credit > 0 ? 'success.main' : 'inherit' }}>{t.credit > 0 ? t.credit.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t.balance.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><Typography color="textSecondary">No transactions found for this date range.</Typography></TableCell></TableRow>
                  )}
                  <TableRow sx={{ bgcolor: '#f0f4f8' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 'bold', color: '#0d47a1' }}>Closing Balance</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', color: '#0d47a1' }}>{closingBalance.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default CustomerLedger;