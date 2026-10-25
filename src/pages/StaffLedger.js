import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Select, MenuItem, 
  FormControl, CircularProgress, Button, IconButton, 
  Alert, TextField, Grid, Avatar, Divider
} from '@mui/material';
import { 
  Print as PrintIcon, 
  PictureAsPdf as PdfIcon, 
  Lock as LockIcon,
  Person,
  Assessment,
  AttachMoney,
  TrendingUp,
  ConfirmationNumber,
  Clear
} from '@mui/icons-material';
import { useReactToPrint } from 'react-to-print';
import { jsPDF } from 'jspdf';

const StaffLedger = () => {
  // Authentication state
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Application state
  const [staffMembers, setStaffMembers] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ledgerRef = useRef();

  // Handle authentication
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

  // Fetch staff members
  useEffect(() => {
    if (!authenticated) return;

    const fetchStaff = async () => {
      try {
        setLoading(true);
        const staffSnapshot = await getDocs(collection(db, 'staff'));
        const staffData = staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStaffMembers(staffData);
      } catch (err) {
        setError('Failed to load staff members');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
  }, [authenticated]);

  // Fetch invoices for selected staff
  useEffect(() => {
    if (!authenticated || !selectedStaff) return;
    
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'invoices'),
          where('staffId', '==', selectedStaff)
        );
        const invoiceSnapshot = await getDocs(q);
        const invoiceData = invoiceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInvoices(invoiceData);
      } catch (err) {
        setError('Failed to load invoices');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [selectedStaff, authenticated]);

  const handleStaffChange = (e) => {
    setSelectedStaff(e.target.value);
  };

  // Calculate totals
  const calculateTotals = () => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.totalAmount) || 0), 0);
    const totalProfit = invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.profit) || 0), 0);
    const totalTickets = invoices.reduce((sum, invoice) => sum + (parseInt(invoice.ticketCount) || 0), 0);
    
    return { totalAmount, totalProfit, totalTickets };
  };

  const { totalAmount, totalProfit, totalTickets } = calculateTotals();

  // Print functionality
  const handlePrint = useReactToPrint({
    content: () => ledgerRef.current,
    pageStyle: `
      @page { size: A4; margin: 10mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; }
        table { width: 100%; border-collapse: collapse; }
        th { background-color: #f0f0f0 !important; }
      }
    `,
    onBeforeGetContent: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, 200);
      });
    }
  });

  // PDF export functionality
  const handleExportPDF = () => {
    if (!authenticated || !selectedStaff) return;

    const staff = staffMembers.find(s => s.id === selectedStaff);
    if (!staff) return;

    const doc = new jsPDF();
    
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('TRAVELWINGS - STAFF LEDGER', 105, 15, { align: 'center' });
    
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Staff: ${staff.name}`, 15, 25);
    doc.text(`Designation: ${staff.designation || 'N/A'}`, 15, 30);
    doc.text(`Phone: ${staff.phone || 'N/A'}`, 15, 35);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 15, 40);
    
    doc.setFillColor(245, 245, 245);
    doc.rect(15, 50, 180, 10, 'F');
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text('Invoice #', 20, 55);
    doc.text('Date', 40, 55);
    doc.text('Customer', 70, 55);
    doc.text('Type', 110, 55);
    doc.text('Tickets', 130, 55);
    doc.text('Amount (₹)', 150, 55);
    doc.text('Profit (₹)', 180, 55);
    
    let yPos = 65;
    invoices.forEach((invoice, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.text(invoice.invoiceNumber.toString(), 20, yPos);
      doc.text(invoice.date, 40, yPos);
      doc.text(invoice.customerName, 70, yPos);
      doc.text(invoice.ticketType, 110, yPos);
      doc.text((invoice.ticketCount || 1).toString(), 130, yPos);
      doc.text(parseFloat(invoice.totalAmount || 0).toFixed(2), 150, yPos);
      doc.text(parseFloat(invoice.profit || 0).toFixed(2), 180, yPos);
      
      yPos += 10;
    });
    
    yPos += 10;
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Totals:', 110, yPos);
    doc.text(totalTickets.toString(), 130, yPos);
    doc.text(totalAmount.toFixed(2), 150, yPos);
    doc.text(totalProfit.toFixed(2), 180, yPos);
    
    doc.save(`staff_ledger_${staff.name}.pdf`);
  };

  // ─── Custom Theme Styles ───
  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2, backgroundColor: '#fff',
      '& fieldset': { borderColor: '#e0e0e0' },
      '&:hover fieldset': { borderColor: '#1976d2' },
    }
  };

  // ─── LOGIN SCREEN ───
  if (!authenticated) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Paper elevation={0} sx={{ p: 5, maxWidth: 400, width: '100%', borderRadius: 3, border: '1px solid #e0e0e0', textAlign: 'center' }}>
          <Avatar sx={{ bgcolor: '#e3f2fd', color: '#1976d2', width: 80, height: 80, mx: 'auto', mb: 3 }}>
            <LockIcon fontSize="large" />
          </Avatar>
          <Typography variant="h5" fontWeight="bold" gutterBottom>Staff Ledger Access</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            This page is restricted to authorized personnel only.
          </Typography>
          
          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Enter Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3, ...inputStyle }}
              InputProps={{ startAdornment: <LockIcon sx={{ color: 'text.secondary', mr: 1 }} /> }}
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

  // ─── MAIN CONTENT ───
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
            Staff Ledger
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Track staff performance, sales, and generated profit.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* ─── FILTER SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={4}>
          <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
            <Person fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Select Staff Member</Typography>
            <Typography variant="body2" color="text.secondary">Choose a staff member to view their ledger</Typography>
          </Box>
        </Box>

        <Grid container spacing={3} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Person fontSize="small" color="primary" /> Staff Member
            </Typography>
            <FormControl fullWidth sx={inputStyle}>
              <Select value={selectedStaff} onChange={handleStaffChange} displayEmpty>
                <MenuItem value="" disabled><em>Select a staff member</em></MenuItem>
                {staffMembers.map((staff) => (
                  <MenuItem key={staff.id} value={staff.id}>
                    {staff.name} ({staff.designation || 'Staff'})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid size={{ xs: 12, md: 6 }}>
            {selectedStaff && (
              <Box display="flex" gap={2} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} sx={{ mt: { xs: 2, md: 3 } }}>
                <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} disabled={loading || invoices.length === 0} sx={{ textTransform: 'none', borderColor: '#1976d2', color: '#1976d2', px: 3 }}>
                  Print
                </Button>
                <Button variant="contained" startIcon={<PdfIcon />} onClick={handleExportPDF} disabled={loading || invoices.length === 0} sx={{ textTransform: 'none', bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' }, px: 3 }}>
                  Export PDF
                </Button>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* ─── SUMMARY CARDS & TABLE ─── */}
      {selectedStaff && !loading && (
        <>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #1976d2' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ConfirmationNumber fontSize="small" color="primary" /> Total Tickets
                </Typography>
                <Typography variant="h4" fontWeight="900" color="text.primary" sx={{ mt: 1 }}>{totalTickets}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #ed6c02' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AttachMoney fontSize="small" color="warning" /> Total Sales Amount
                </Typography>
                <Typography variant="h4" fontWeight="900" color="warning.main" sx={{ mt: 1 }}>₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e0e0e0', borderLeft: '6px solid #2e7d32' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingUp fontSize="small" color="success" /> Total Profit
                </Typography>
                <Typography variant="h4" fontWeight="900" color="success.main" sx={{ mt: 1 }}>₹{totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
              </Paper>
            </Grid>
          </Grid>

          <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
            <Box display="flex" alignItems="center" gap={2} mb={3}>
              <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
                <Assessment fontSize="large" />
              </Avatar>
              <Box>
                <Typography variant="h5" fontWeight="bold">{staffMembers.find(s => s.id === selectedStaff)?.name}'s Ledger</Typography>
                <Typography variant="body2" color="text.secondary">
                  Designation: {staffMembers.find(s => s.id === selectedStaff)?.designation || 'N/A'} | Phone: {staffMembers.find(s => s.id === selectedStaff)?.phone || 'N/A'}
                </Typography>
              </Box>
            </Box>

            <TableContainer ref={ledgerRef}>
              <Table>
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Invoice #</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Tickets</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Profit (₹)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.length > 0 ? (
                    <>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id} hover>
                          <TableCell><Typography fontWeight="500">{invoice.invoiceNumber}</Typography></TableCell>
                          <TableCell>{invoice.date}</TableCell>
                          <TableCell>{invoice.customerName}</TableCell>
                          <TableCell>{invoice.ticketType}</TableCell>
                          <TableCell align="right">{invoice.ticketCount || 1}</TableCell>
                          <TableCell align="right">
                            {parseFloat(invoice.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell align="right" sx={{ color: invoice.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                            {parseFloat(invoice.profit || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell colSpan={4} align="right"><Typography fontWeight="bold">Totals:</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight="bold">{totalTickets}</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight="bold">{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</Typography></TableCell>
                        <TableCell align="right" sx={{ color: totalProfit >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                          {totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <Typography color="textSecondary">No invoices found for this staff member.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {!selectedStaff && !loading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">Please select a staff member to view their ledger</Typography>
        </Box>
      )}
    </Box>
  );
};

export default StaffLedger;