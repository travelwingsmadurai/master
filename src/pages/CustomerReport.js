import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format, startOfYear, endOfYear } from 'date-fns';
import { 
  Box, Typography, FormControl, Select, MenuItem, 
  Button, CircularProgress, Alert, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, TextField, Grid, Avatar
} from '@mui/material';
import { 
  PictureAsPdf as PdfIcon, Person, CalendarToday, 
  Warning, AccountBalanceWallet, Assessment 
} from '@mui/icons-material';

const CustomerReport = () => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [outstandings, setOutstandings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  // Set default dates to the current year
  const [startDate, setStartDate] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfYear(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, 'customers'));
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError('Failed to load customers.');
      } finally {
        setLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!selectedCustomer) return;

    const fetchOutstandingData = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'outstandings'), where('customerId', '==', selectedCustomer.id));
        const snap = await getDocs(q);
        
        const rawData = snap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            date: data.date || new Date().toISOString(),
            totalAmount: parseFloat(data.totalAmount || 0),
            amountPaid: parseFloat(data.amountPaid || 0),
            remainingAmount: parseFloat(data.remainingAmount || 0),
            description: data.description || `Invoice ${data.invoiceId?.substring(0, 8) || ''}`
          };
        });

        // 1. Filter by Date Range first
        const filteredData = rawData.filter(d => d.date >= startDate && d.date <= endDate);

        // 2. Consolidate multiple partial payments into a single row per invoice
        const map = new Map();
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(record => {
          map.set(record.invoiceId, record); // Latest record within the date range overwrites
        });
        
        const consolidated = Array.from(map.values());
        setOutstandings(consolidated);
        
        const total = consolidated.reduce((sum, out) => sum + out.remainingAmount, 0);
        setTotalOutstanding(total);
      } catch (err) {
        setError('Failed to load outstanding details.');
      } finally {
        setLoading(false);
      }
    };
    fetchOutstandingData();
  }, [selectedCustomer, startDate, endDate]);

  const handleCustomerChange = (e) => {
    setSelectedCustomer(customers.find(c => c.id === e.target.value) || null);
  };

  const generatePDFReport = () => {
    if (!selectedCustomer) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('TRAVELWINGS', pageWidth / 2, y, { align: 'center' });
    y += 15;
    doc.setFontSize(12);
    doc.text('CUSTOMER OUTSTANDING REPORT', pageWidth / 2, y, { align: 'center' });
    y += 10;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${selectedCustomer.name}`, 15, y); y += 6;
    doc.text(`Phone: ${selectedCustomer.phone || 'N/A'}`, 15, y); y += 6;
    doc.text(`Period: ${startDate} to ${endDate}`, 15, y); y += 15;

    const tableData = outstandings.filter(o => o.remainingAmount > 0).map(o => [
      o.invoiceId?.substring(0, 8),
      format(new Date(o.date), 'dd-MM-yyyy'),
      o.totalAmount.toFixed(2),
      o.amountPaid.toFixed(2),
      o.remainingAmount.toFixed(2)
    ]);

    if (tableData.length > 0) {
      doc.autoTable({
        startY: y,
        head: [['Invoice', 'Date', 'Total', 'Paid', 'Due']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [25, 118, 210] },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
       doc.text('No outstanding records found for this period.', 15, y);
       y += 10;
    }

    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`Total Outstanding: Rs. ${totalOutstanding.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
    doc.save(`${selectedCustomer.name}_Outstanding_${startDate}_to_${endDate}.pdf`);
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
            Customer Outstanding Report
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            View customer dues, payment history, and generate detailed reports.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* ─── FILTER SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={4}>
          <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
            <Assessment fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Select Customer & Date Range</Typography>
            <Typography variant="body2" color="text.secondary">Filter to generate specific reports</Typography>
          </Box>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Person fontSize="small" color="primary" /> Select Customer
            </Typography>
            <FormControl fullWidth sx={inputStyle}>
              <Select value={selectedCustomer?.id || ''} onChange={handleCustomerChange} displayEmpty>
                <MenuItem value="" disabled><em>Select a customer</em></MenuItem>
                {customers.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
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

      {/* ─── SUMMARY & TABLE ─── */}
      {selectedCustomer && (
        <>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #d32f2f' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Warning fontSize="small" color="error" /> Total Outstanding
                </Typography>
                <Typography variant="h4" fontWeight="900" color="error.main" sx={{ mt: 1 }}>
                  ₹{totalOutstanding.toFixed(2)}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
                  <AccountBalanceWallet fontSize="large" />
                </Avatar>
                <Box>
                  <Typography variant="h5" fontWeight="bold">Outstanding Invoices</Typography>
                  <Typography variant="body2" color="text.secondary">Details for {selectedCustomer?.name}</Typography>
                </Box>
              </Box>
              <Button variant="contained" startIcon={<PdfIcon />} onClick={generatePDFReport} sx={{ textTransform: 'none', bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' }, px: 3 }}>
                Download PDF
              </Button>
            </Box>

            {loading ? (
               <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Invoice</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Total (₹)</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Paid (₹)</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Due (₹)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {outstandings.filter(o => o.remainingAmount > 0).map(o => (
                      <TableRow key={o.id} hover>
                        <TableCell><Typography fontWeight="500">{o.invoiceId?.substring(0, 8)}</Typography></TableCell>
                        <TableCell>{format(new Date(o.date), 'dd-MM-yyyy')}</TableCell>
                        <TableCell align="right">{o.totalAmount.toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{o.amountPaid.toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>{o.remainingAmount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {outstandings.filter(o => o.remainingAmount > 0).length === 0 && (
                      <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No outstanding dues for this period.</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
};

export default CustomerReport;