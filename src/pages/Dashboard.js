import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  Box, Container, Typography, Grid, Paper, TextField, Button,
  CircularProgress, Alert, Avatar
} from '@mui/material';
import { 
  Download as DownloadIcon, 
  TrendingUp, 
  Receipt as ReceiptIcon, 
  Payment as PaymentIcon, 
  Assessment as AssessmentIcon, 
  Warning as WarningIcon,
  Dashboard as DashboardIcon
} from '@mui/icons-material';

const Dashboard = () => {
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [outstandings, setOutstandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [invSnap, recSnap, vouchSnap, outSnap] = await Promise.all([
          getDocs(collection(db, 'invoices')),
          getDocs(collection(db, 'receipts')),
          getDocs(collection(db, 'supplierPaymentVouchers')),
          getDocs(collection(db, 'outstandings'))
        ]);

        setInvoices(invSnap.docs.map(d => ({ ...d.data(), id: d.id })));
        setReceipts(recSnap.docs.map(d => ({ ...d.data(), id: d.id })));
        setVouchers(vouchSnap.docs.map(d => ({ ...d.data(), id: d.id })));
        setOutstandings(outSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      } catch (err) {
        console.error(err);
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const metrics = useMemo(() => {
    const isInRange = (dateStr) => dateStr >= startDate && dateStr <= endDate;

    const filteredInvoices = invoices.filter(i => isInRange(i.date) && i.status !== 'cancelled');
    const filteredReceipts = receipts.filter(r => isInRange(r.date));
    const filteredVouchers = vouchers.filter(v => isInRange(v.date));

    const invoiceRevenue = filteredInvoices.reduce((sum, i) => sum + (parseFloat(i.totalAmount) || 0), 0);
    const recordedProfit = filteredInvoices.reduce((sum, i) => sum + (parseFloat(i.profit) || 0), 0);
    const receiptsCollected = filteredReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const supplierPayments = filteredVouchers.reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);
    
    const map = new Map();
    outstandings.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(o => map.set(o.invoiceId, o));
    const consolidatedOutstanding = Array.from(map.values());
    const totalOutstanding = consolidatedOutstanding.reduce((sum, o) => sum + (parseFloat(o.remainingAmount) || 0), 0);

    return { invoiceRevenue, recordedProfit, receiptsCollected, supplierPayments, totalOutstanding };
  }, [invoices, receipts, vouchers, outstandings, startDate, endDate]);

  const handleExportCSV = () => {
    const csvData = [
      ['Metric', 'Amount (INR)'],
      ['Invoice Revenue', metrics.invoiceRevenue.toFixed(2)],
      ['Receipts Collected', metrics.receiptsCollected.toFixed(2)],
      ['Supplier Payments', metrics.supplierPayments.toFixed(2)],
      ['Recorded Profit', metrics.recordedProfit.toFixed(2)],
      ['Total Outstanding (Live)', metrics.totalOutstanding.toFixed(2)],
      ['Period', `${startDate} to ${endDate}`]
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial_dashboard_${startDate}_to_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#fff',
      '& fieldset': { borderColor: '#e0e0e0' },
      '&:hover fieldset': { borderColor: '#1976d2' },
    }
  };

  const MetricCard = ({ title, value, icon, color }) => (
    <Box sx={{ height: '100%' }}>
      <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {React.cloneElement(icon, { fontSize: 'small', sx: { color } })} {title}
      </Typography>
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          borderRadius: 2, 
          border: '1px solid #e0e0e0',
          bgcolor: '#fff',
          display: 'flex',
          alignItems: 'center',
          height: 56
        }}
      >
        <Typography variant="h5" fontWeight="bold" color="text.primary">
          ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Typography>
      </Paper>
    </Box>
  );

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto', pb: 4 }}>
      
      {/* ─── HERO BANNER (Flight removed) ─── */}
      <Box sx={{
        position: 'relative', 
        borderRadius: 3, 
        overflow: 'hidden', 
        mb: 4, 
        px: 4,
        py: 2.5, 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: 120, 
        background: 'linear-gradient(90deg, #e3f2fd 0%, #bbdefb 100%)', 
      }}>
        <Box sx={{
          position: 'absolute', 
          right: 0, 
          top: 0, 
          bottom: 0, 
          width: '70%',
          backgroundImage: "url('/travel-banner.png.png')", 
          backgroundSize: 'cover', 
          backgroundPosition: 'center right',
          maskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
        }} />

        <Box sx={{ zIndex: 1, maxWidth: '60%' }}>
          <Typography variant="h4" fontWeight="800" color="#0d47a1" gutterBottom>
            Financial Dashboard
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Overview of your agency's financial health and metrics.
          </Typography>
        </Box>
      </Box>

      {/* ─── MAIN CONTENT CARD ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <DashboardIcon fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                Financial Overview
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Filter by date range to view specific metrics
              </Typography>
            </Box>
          </Box>

          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField 
              type="date" 
              size="small" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              InputLabelProps={{ shrink: true }} 
              sx={{ ...inputStyle, width: 160 }}
              InputProps={{
                startAdornment: (
                  <Typography variant="caption" sx={{ mr: 1, color: 'text.secondary' }}>From</Typography>
                )
              }}
            />
            <TextField 
              type="date" 
              size="small" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              InputLabelProps={{ shrink: true }} 
              sx={{ ...inputStyle, width: 160 }}
              InputProps={{
                startAdornment: (
                  <Typography variant="caption" sx={{ mr: 1, color: 'text.secondary' }}>To</Typography>
                )
              }}
            />
            <Button 
              variant="contained" 
              startIcon={<DownloadIcon />} 
              onClick={handleExportCSV} 
              sx={{ textTransform: 'none', bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}
            >
              Export
            </Button>
          </Box>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <MetricCard title="Invoice Revenue" value={metrics.invoiceRevenue} icon={<AssessmentIcon />} color="#1976d2" />
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <MetricCard title="Receipts Collected" value={metrics.receiptsCollected} icon={<ReceiptIcon />} color="#2e7d32" />
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <MetricCard title="Supplier Payments" value={metrics.supplierPayments} icon={<PaymentIcon />} color="#ed6c02" />
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <MetricCard title="Recorded Profit" value={metrics.recordedProfit} icon={<TrendingUp />} color="#9c27b0" />
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <MetricCard title="Total Outstanding (Live)" value={metrics.totalOutstanding} icon={<WarningIcon />} color="#d32f2f" />
          </Grid>
        </Grid>

      </Paper>
    </Box>
  );
};

export default Dashboard;