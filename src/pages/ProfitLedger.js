import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { jsPDF } from 'jspdf';
import { format, parseISO } from 'date-fns';
import { 
  Box, Button, Typography, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, 
  CircularProgress, Alert, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
  Grid, Avatar, Divider
} from '@mui/material';
import { 
  PictureAsPdf, DateRange, FilterAlt, MoreVert, Lock, 
  Assessment, AttachMoney, TrendingUp, CalendarToday 
} from '@mui/icons-material';

// ─── SAFE DATE HELPER ───
const safeFormatDate = (dateVal) => {
  if (!dateVal) return '';
  try {
    if (typeof dateVal === 'string') {
       if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
       return format(parseISO(dateVal), 'yyyy-MM-dd');
    }
    if (dateVal && typeof dateVal.toDate === 'function') {
      return format(dateVal.toDate(), 'yyyy-MM-dd');
    }
    return format(new Date(dateVal), 'yyyy-MM-dd');
  } catch (e) {
    return '';
  }
};

const ProfitLedger = () => {
  // ─── STATIC PASSWORD STATE ───
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // State management
  const [profitEntries, setProfitEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [currentEntry, setCurrentEntry] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  // Firestore collections
  const invoicesCollectionRef = collection(db, 'invoices');
  const profitLedgerCollectionRef = collection(db, 'profitLedger');

  // ─── STATIC PASSWORD CHECK ───
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'Mani1499') {
      setAuthenticated(true);
      setAuthError('');
      setPassword('');
    } else {
      setAuthError('Incorrect password. Please try again.');
    }
  };

  // Fetch profit entries
  const fetchProfitEntries = useCallback(async () => {
    if (!authenticated) return;
    
    setLoading(true);
    setError(null); 
    try {
      const profitQuery = query(profitLedgerCollectionRef, orderBy('date', 'desc'));
      const profitSnapshot = await getDocs(profitQuery);
      
      if (profitSnapshot.size > 0) {
        const entries = profitSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: safeFormatDate(doc.data().date)
        }));
        setProfitEntries(entries);
      } else {
        // Fallback if profitLedger is empty
        const invoiceQuery = query(invoicesCollectionRef, orderBy('createdAt', 'desc'));
        const invoiceSnapshot = await getDocs(invoiceQuery);
        
        const entries = invoiceSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            invoiceNumber: data.invoiceNumber || 'N/A',
            customerName: data.customerName,
            date: safeFormatDate(data.date || data.createdAt),
            ticketType: data.ticketType,
            amount: parseFloat(data.totalAmount) || 0,
            profit: parseFloat(data.profit) || 0,
            source: 'invoice'
          };
        });
        setProfitEntries(entries);
      }
    } catch (err) {
      console.error('Error fetching profit ledger:', err);

      // Fallback if profitLedger read is denied by Firestore rules
      try {
        const q = query(invoicesCollectionRef, orderBy('createdAt', 'desc'));
        const s = await getDocs(q);

        setProfitEntries(s.docs.map(d => {
          const x = d.data();
          return {
            id: d.id,
            invoiceNumber: x.invoiceNumber || 'N/A',
            customerName: x.customerName || '',
            date: safeFormatDate(x.date || x.createdAt),
            ticketType: x.ticketType || '',
            amount: Number(x.totalAmount) || 0,
            profit: Number(x.profit) || 0,
            source: 'invoice'
          };
        }));

        setError(null); // Clear error since fallback succeeded
      } catch (e) {
        console.error('Error fetching invoices:', e);
        setError('Unable to load ledger. Check database permissions.');
      }
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  // Apply date filter
  const applyDateFilter = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const q = query(
        profitLedgerCollectionRef,
        where('date', '>=', dateRange.startDate),
        where('date', '<=', dateRange.endDate),
        orderBy('date', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const entries = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: safeFormatDate(doc.data().date)
      }));

      setProfitEntries(entries);
      setFilterDialogOpen(false);
    } catch (err) {
      console.error('Error filtering by date:', err);
      setError('Failed to filter entries. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, authenticated]);

  const calculateTotals = () => {
    return profitEntries.reduce((acc, entry) => {
      acc.totalAmount += entry.amount || 0;
      acc.totalProfit += entry.profit || 0;
      return acc;
    }, { totalAmount: 0, totalProfit: 0 });
  };

  const exportToPDF = useCallback(() => {
    if (!authenticated) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const { totalAmount, totalProfit } = calculateTotals();

      doc.setFontSize(18); doc.setTextColor(40);
      doc.text('TRAVELWINGS - PROFIT LEDGER', 105, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text('FF6 PARASAN SAMUDHRI MAHAL, OPP FATHIMA COLLEGE', 105, 20, { align: 'center' });
      doc.text('MADURAI', 105, 25, { align: 'center' });
      doc.text('GSTIN: 33DLJPS5802R1ZK', 105, 30, { align: 'center' });

      doc.setFontSize(12);
      doc.text(`From: ${dateRange.startDate} To: ${dateRange.endDate}`, 105, 40, { align: 'center' });

      doc.setFillColor(200, 200, 200);
      doc.rect(15, 50, 180, 10, 'F');
      doc.setTextColor(0); doc.setFontSize(10);
      doc.text('Date', 20, 55); doc.text('Invoice #', 40, 55); doc.text('Customer', 70, 55);
      doc.text('Service', 120, 55); doc.text('Amount (₹)', 150, 55); doc.text('Profit (₹)', 180, 55);

      let y = 65;
      profitEntries.forEach((entry) => {
        if (y > 270) {
          doc.addPage(); y = 20;
          doc.setFillColor(200, 200, 200); doc.rect(15, y - 10, 180, 10, 'F');
          doc.setTextColor(0);
          doc.text('Date', 20, y - 5); doc.text('Invoice #', 40, y - 5); doc.text('Customer', 70, y - 5);
          doc.text('Service', 120, y - 5); doc.text('Amount (₹)', 150, y - 5); doc.text('Profit (₹)', 180, y - 5);
          y += 15;
        }

        doc.text(entry.date, 20, y); doc.text(entry.invoiceNumber?.toString() || 'N/A', 40, y);
        doc.text(entry.customerName || '-', 70, y); doc.text(entry.ticketType || '-', 120, y);
        doc.text((entry.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), 150, y);
        doc.text((entry.profit || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), 180, y);
        y += 10;
      });

      doc.setFontSize(12); doc.setDrawColor(0); doc.setLineWidth(0.5);
      doc.line(15, y, 195, y); y += 10;
      doc.text('TOTALS:', 120, y);
      doc.text(totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }), 150, y);
      doc.text(totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 }), 180, y);

      doc.setFontSize(10);
      doc.text('Generated on: ' + format(new Date(), 'yyyy-MM-dd hh:mm a'), 105, 285, { align: 'center' });
      doc.text('© TravelWings Accounting System', 105, 290, { align: 'center' });

      doc.save(`profit_ledger_${dateRange.startDate}_to_${dateRange.endDate}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [profitEntries, dateRange, authenticated]);

  const handleMenuOpen = (event, entry) => { setAnchorEl(event.currentTarget); setCurrentEntry(entry); };
  const handleMenuClose = () => { setAnchorEl(null); setCurrentEntry(null); };

  useEffect(() => { if (authenticated) fetchProfitEntries(); }, [fetchProfitEntries, authenticated]);

  const { totalAmount, totalProfit } = calculateTotals();

  // ─── Custom Theme Styles ───
  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2, backgroundColor: '#fff',
      '& fieldset': { borderColor: '#e0e0e0' },
      '&:hover fieldset': { borderColor: '#1976d2' },
    }
  };

  // ─── STATIC PASSWORD SCREEN (GATEKEEPER) ───
  if (!authenticated) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Paper elevation={0} sx={{ p: 5, maxWidth: 400, width: '100%', borderRadius: 3, border: '1px solid #e0e0e0', textAlign: 'center' }}>
          <Avatar sx={{ bgcolor: '#e3f2fd', color: '#1976d2', width: 80, height: 80, mx: 'auto', mb: 3 }}>
            <Lock fontSize="large" />
          </Avatar>
          <Typography variant="h5" fontWeight="bold" gutterBottom>Profit Ledger Access</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            This page is restricted to the owner only.
          </Typography>
          
          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Enter Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3, ...inputStyle }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Lock color="primary" /></InputAdornment> }}
            />
            
            {authError && <Alert severity="error" sx={{ mb: 3 }}>{authError}</Alert>}
            
            <Button fullWidth variant="contained" type="submit" size="large" disabled={!password} sx={{ textTransform: 'none', bgcolor: '#1976d2', py: 1.5, borderRadius: 2 }}>
              Unlock Ledger
            </Button>
          </form>
        </Paper>
      </Box>
    );
  }

  // ─── MAIN CONTENT (Shows ONLY if password is correct) ───
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
            Profit Ledger
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Track agency revenue, profit margins, and financial performance.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ─── ACTION BAR ─── */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Button variant="outlined" startIcon={<FilterAlt />} onClick={() => setFilterDialogOpen(true)} sx={{ textTransform: 'none', borderColor: '#1976d2', color: '#1976d2' }}>
              Filter Dates
            </Button>
            <Typography variant="body2" color="text.secondary" fontWeight="500">
              Showing {profitEntries.length} entries
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<PictureAsPdf />} onClick={exportToPDF} disabled={isExporting || profitEntries.length === 0} sx={{ textTransform: 'none', bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}>
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
        </Box>
      </Paper>

      {/* ─── SUMMARY CARDS ─── */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #1976d2' }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Assessment fontSize="small" color="primary" /> Total Invoiced Amount
            </Typography>
            <Typography variant="h4" fontWeight="900" color="text.primary" sx={{ mt: 1 }}>
              ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #2e7d32' }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingUp fontSize="small" color="success" /> Total Recorded Profit
            </Typography>
            <Typography variant="h4" fontWeight="900" color="success.main" sx={{ mt: 1 }}>
              ₹{totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* ─── TABLE SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <TrendingUp fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Profit Records</Typography>
            <Typography variant="body2" color="text.secondary">View detailed profit breakdown by invoice</Typography>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Service</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Profit (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell>
                </TableRow>
              ) : profitEntries.length > 0 ? (
                profitEntries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>{entry.date}</TableCell>
                    <TableCell><Typography fontWeight="500">{entry.invoiceNumber || 'N/A'}</Typography></TableCell>
                    <TableCell>{entry.customerName}</TableCell>
                    <TableCell>{entry.ticketType}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>
                      {entry.amount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell align="right" sx={{ color: entry.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                      {entry.profit?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={(e) => handleMenuOpen(e, entry)}>
                        <MoreVert fontSize="small" />
                      </IconButton>
                      <Menu anchorEl={anchorEl} keepMounted open={Boolean(anchorEl && currentEntry?.id === entry.id)} onClose={handleMenuClose}>
                        <MenuItem onClick={handleMenuClose}>
                          <ListItemIcon><PictureAsPdf fontSize="small" /></ListItemIcon>
                          <ListItemText>View Invoice</ListItemText>
                        </MenuItem>
                      </Menu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">No profit entries found for the selected period.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ─── FILTER DIALOG ─── */}
      <Dialog open={filterDialogOpen} onClose={() => setFilterDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Filter by Date Range</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="primary" /> Start Date
              </Typography>
              <TextField
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                fullWidth
                sx={inputStyle}
              />
            </Box>
            <Box>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="primary" /> End Date
              </Typography>
              <TextField
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                fullWidth
                sx={inputStyle}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFilterDialogOpen(false)} sx={{ textTransform: 'none', color: 'text.secondary' }}>Cancel</Button>
          <Button onClick={applyDateFilter} variant="contained" disabled={!dateRange.startDate || !dateRange.endDate} sx={{ textTransform: 'none', bgcolor: '#1976d2' }}>
            Apply Filter
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfitLedger;