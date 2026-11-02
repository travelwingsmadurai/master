import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import {
  TextField, Button, Typography, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  MenuItem, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, CircularProgress, Grid, Avatar,
  Divider, Chip
} from '@mui/material';
import {
  PictureAsPdf as PictureAsPdfIcon, Delete,
  AccountBalanceWallet, Person, Receipt,
  CalendarToday, Add, Clear, Search, Save, Print, Visibility
} from '@mui/icons-material';

const money = (value) => (Number(value) || 0).toFixed(2);

const dateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate) return format(value.toDate(), 'yyyy-MM-dd');
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, 'yyyy-MM-dd');
  }
  return '';
};

const Outstanding = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [outstandings, setOutstandings] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today);
  const [paymentDate, setPaymentDate] = useState(today);
  const [allocations, setAllocations] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [outstandingToDelete, setOutstandingToDelete] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAllOutstanding, setShowAllOutstanding] = useState(false);
  const [allOutstandingRows, setAllOutstandingRows] = useState([]);
  const [outstandingSearch, setOutstandingSearch] = useState('');
  const [savedReports, setSavedReports] = useState([]);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [customerSnap, invoiceSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'invoices'))
      ]);
      setCustomers(customerSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setInvoices(invoiceSnap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        totalAmount: Number(d.data().totalAmount) || 0
      })));
    } catch (e) {
      console.error('Error fetching outstanding data:', e);
      setError('Failed to load customers and invoices. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
    const stopOutstandings = onSnapshot(query(collection(db, 'outstandings')), snap => {
      setOutstandings(snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        totalAmount: Number(d.data().totalAmount) || 0,
        amountPaid: Number(d.data().amountPaid) || 0,
        remainingAmount: Number(d.data().remainingAmount) || 0
      })));
    }, e => {
      console.error('Outstanding listener error:', e);
      setError('Unable to load outstanding payment records.');
    });
    const stopInvoices = onSnapshot(query(collection(db, 'invoices')), snap => {
      setInvoices(snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        totalAmount: Number(d.data().totalAmount ?? d.data().ticketPrice ?? 0)
      })));
    }, e => console.error('Invoice listener error:', e));
    const stopReports = onSnapshot(collection(db, 'outstandingReports'), snap => {
      setSavedReports(snap.docs.map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))));
    }, e => console.error('Outstanding report listener error:', e));
    const stopReceipts = onSnapshot(collection(db, 'receipts'), snap => {
      setReceipts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, e => console.error('Receipt listener error:', e));
    return () => {
      stopOutstandings();
      stopInvoices();
      stopReports();
      stopReceipts();
    };
  }, [fetchInitialData]);

  const consolidatedOutstandings = useMemo(() => {
    const map = new Map();
    [...outstandings]
      .sort((a, b) => dateValue(a.date).localeCompare(dateValue(b.date)))
      .forEach(record => map.set(record.invoiceId, record));
    return [...map.values()];
  }, [outstandings]);

  const getInvoiceDue = (inv) => {
    const invoiceTotal = Math.max(0, Number(inv.totalAmount) || 0);
    const outstandingRecord = consolidatedOutstandings.find(o => o.invoiceId === inv.id);
    const outstandingPaid = outstandingRecord ? Math.max(0, Number(outstandingRecord.amountPaid) || 0) : 0;
    const invoicePaid = Math.max(0, Number(
      inv.paidAmount ?? inv.amountPaid ?? inv.receivedAmount ?? inv.totalPaid ?? 0
    ) || 0);

    // Read bill-wise receipt allocations. Support common field names used by receipt forms.
    let receiptAllocated = 0;
    receipts.forEach(receipt => {
      const allocationLists = Array.isArray(receipt.allocations) && receipt.allocations.length
        ? receipt.allocations
        : (Array.isArray(receipt.billAllocations) ? receipt.billAllocations : []);
      allocationLists.forEach(allocation => {
        const matchesInvoice =
          String(allocation.invoiceId || allocation.billId || '') === String(inv.id) ||
          (
            String(allocation.invoiceNumber || allocation.invoiceNo || allocation.billNumber || allocation.ref || '') !== '' &&
            String(allocation.invoiceNumber || allocation.invoiceNo || allocation.billNumber || allocation.ref) === String(inv.invoiceNumber || '')
          );
        if (matchesInvoice) {
          receiptAllocated += Math.max(0, Number(
            allocation.amount ?? allocation.allocatedAmount ?? allocation.paidAmount ?? allocation.receivedAmount ?? 0
          ) || 0);
        }
      });
    });

    // The same receipt may be represented in invoice fields or the outstanding record.
    // Use the greatest known paid total rather than adding duplicate representations.
    const paid = Math.min(invoiceTotal, Math.max(outstandingPaid, invoicePaid, receiptAllocated));
    return { paid, due: Math.max(0, invoiceTotal - paid), outstandingRecord };
  };

  const overdueDaysFor = (invoiceDate) => {
    const billDate = dateValue(invoiceDate);
    if (!billDate) return 0;
    const start = new Date(`${billDate}T00:00:00`);
    const now = new Date(`${today}T00:00:00`);
    return Math.max(0, Math.floor((now - start) / 86400000));
  };

  const buildAllOutstandingRows = () => invoices
    .filter(inv => inv.status !== 'cancelled')
    .map(inv => {
      const { paid, due } = getInvoiceDue(inv);
      const customer = customers.find(c => c.id === inv.customerId);
      const invoiceDate = dateValue(inv.date || inv.invoiceDate || inv.createdAt);
      const dueDate = invoiceDate;
      const overdueDays = overdueDaysFor(dueDate);
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        customerId: inv.customerId || '',
        customerName: customer?.name || inv.customerName || 'Unknown Customer',
        phone: customer?.phone || inv.customerPhone || '',
        invoiceDate,
        dueDate,
        totalAmount: Number(inv.totalAmount) || 0,
        amountPaid: paid,
        remainingAmount: due,
        overdueDays,
        overdueLabel: overdueDays > 0 ? `Overdue Day ${overdueDays}` : 'Not overdue'
      };
    })
    .filter(row => row.remainingAmount > 0.009)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.customerName.localeCompare(b.customerName));

  const refreshAllOutstanding = () => {
    const rows = buildAllOutstandingRows();
    setAllOutstandingRows(rows);
    setShowAllOutstanding(true);
    if (!rows.length) setSuccess('No unpaid invoice balances were found.');
  };

  const filteredAllOutstanding = allOutstandingRows.filter(row => {
    const q = outstandingSearch.trim().toLowerCase();
    return !q || [row.customerName, row.phone, row.invoiceNumber]
      .some(value => String(value || '').toLowerCase().includes(q));
  });

  const allOutstandingTotal = allOutstandingRows.reduce((sum, row) => sum + row.remainingAmount, 0);

  const saveOutstandingReport = async () => {
    const rows = buildAllOutstandingRows();
    if (!rows.length) {
      setError('There are no outstanding balances to save.');
      return;
    }
    try {
      setSaving(true);
      const report = {
        title: `Outstanding Report - ${today}`,
        asOfDate: today,
        totalBills: rows.length,
        totalOutstanding: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
        rows,
        savedAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'outstandingReports'), report);
      setAllOutstandingRows(rows);
      setShowAllOutstanding(true);
      setSuccess('Outstanding report saved successfully.');
    } catch (e) {
      console.error('Save outstanding report error:', e);
      setError('Unable to save the outstanding report.');
    } finally {
      setSaving(false);
    }
  };

  const exportOutstandingRowsPDF = (rows, filename = 'outstanding_report') => {
    const pdf = new jsPDF({ orientation: 'landscape' });
    const total = rows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('OUTSTANDING PAYMENTS REPORT', 148, 14, { align: 'center' });
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`As of ${today} | Total outstanding: INR ${money(total)}`, 148, 21, { align: 'center' });
    pdf.autoTable({
      startY: 27,
      head: [['Customer', 'Phone', 'Invoice No.', 'Invoice Date', 'Due Date', 'Invoice Amount', 'Paid', 'Pending', 'Overdue']],
      body: rows.map(row => [
        row.customerName, row.phone || '-', row.invoiceNumber, row.invoiceDate || '-', row.dueDate || '-',
        money(row.totalAmount), money(row.amountPaid), money(row.remainingAmount),
        row.overdueDays > 0 ? `Day ${row.overdueDays}` : 'Not overdue'
      ]),
      foot: [['', '', '', '', '', '', '', `TOTAL ${money(total)}`, '']],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [25, 75, 130] },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }
    });
    pdf.save(`${filename}_${today.replace(/-/g, '')}.pdf`);
  };

  const printOutstandingRows = (rows) => {
    const total = rows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0);
    const win = window.open('', '_blank');
    if (!win) {
      setError('Please allow pop-ups to print the outstanding report.');
      return;
    }
    const html = `<html><head><title>Outstanding Report</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#222}
      h2{text-align:center;margin-bottom:5px}p{text-align:center;margin-top:0}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #bbb;padding:7px;font-size:11px;text-align:left}
      th{background:#eaf1f8} .num{text-align:right}
    </style></head><body><h2>OUTSTANDING PAYMENTS REPORT</h2>
    <p>As of ${today} | Total outstanding: ₹${money(total)}</p>
    <table><thead><tr><th>Customer</th><th>Phone</th><th>Invoice No.</th><th>Invoice Date</th><th>Due Date</th><th>Invoice Amount</th><th>Paid</th><th>Pending</th><th>Overdue</th></tr></thead>
    <tbody>${rows.map(row => `<tr><td>${row.customerName}</td><td>${row.phone || '-'}</td><td>${row.invoiceNumber}</td><td>${row.invoiceDate || '-'}</td><td>${row.dueDate || '-'}</td><td class="num">${money(row.totalAmount)}</td><td class="num">${money(row.amountPaid)}</td><td class="num">${money(row.remainingAmount)}</td><td>${row.overdueDays > 0 ? `Day ${row.overdueDays}` : 'Not overdue'}</td></tr>`).join('')}</tbody></table>
    <script>window.onload=()=>window.print()</script></body></html>`;
    win.document.write(html);
    win.document.close();
  };

  const invoiceRows = useMemo(() => {
    if (!selectedCustomer || !fromDate || !toDate || fromDate > toDate) return [];
    return invoices
      .filter(inv => {
        const invDate = dateValue(inv.date);
        return inv.customerId === selectedCustomer &&
          inv.status !== 'cancelled' &&
          invDate >= fromDate && invDate <= toDate;
      })
      .map(inv => {
        const { paid, due, outstandingRecord } = getInvoiceDue(inv);
        return {
          ...inv, paid, due, outstandingRecord,
          overdueDays: overdueDaysFor(inv.date || inv.invoiceDate || inv.createdAt),
          dueDate: dateValue(inv.date || inv.invoiceDate || inv.createdAt)
        };
      })
      .filter(inv => inv.due > 0.009)
      .sort((a, b) => dateValue(a.date).localeCompare(dateValue(b.date)));
  }, [selectedCustomer, fromDate, toDate, invoices, consolidatedOutstandings, receipts]);

  const totalDueShown = invoiceRows.reduce((sum, inv) => sum + inv.due, 0);
  const totalAllocated = invoiceRows.reduce(
    (sum, inv) => sum + Math.max(0, Number(allocations[inv.id]) || 0), 0
  );

  const customerName = customers.find(c => c.id === selectedCustomer)?.name || '';

  const handleCustomerChange = (e) => {
    setSelectedCustomer(e.target.value);
    setAllocations({});
    setError('');
    setSuccess('');
  };

  const handleAllocationChange = (invoiceId, value) => {
    setAllocations(prev => ({ ...prev, [invoiceId]: value }));
    setError('');
    setSuccess('');
  };

  const clearSelection = () => {
    setSelectedCustomer('');
    setFromDate('');
    setToDate(today);
    setPaymentDate(today);
    setAllocations({});
    setError('');
    setSuccess('');
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedCustomer) return setError('Please select a customer.');
    if (!fromDate || !toDate) return setError('Please select both From Date and To Date.');
    if (fromDate > toDate) return setError('From Date cannot be later than To Date.');
    if (!paymentDate) return setError('Please select the payment date.');

    const selectedRows = invoiceRows
      .map(inv => ({ ...inv, allocation: Number(allocations[inv.id]) || 0 }))
      .filter(inv => inv.allocation > 0);

    if (!selectedRows.length) {
      return setError('Enter an adjustment amount against at least one outstanding bill.');
    }

    for (const inv of selectedRows) {
      if (!Number.isFinite(inv.allocation) || inv.allocation <= 0) {
        return setError(`Enter a valid adjustment for invoice ${inv.invoiceNumber || inv.id}.`);
      }
      if (inv.allocation - inv.due > 0.009) {
        return setError(
          `Adjustment for ${inv.invoiceNumber || inv.id} exceeds its due amount of ₹${money(inv.due)}.`
        );
      }
    }

    try {
      setSaving(true);
      const batch = writeBatch(db);

      selectedRows.forEach(inv => {
        const newPaid = inv.paid + inv.allocation;
        const remaining = Math.max(0, inv.totalAmount - newPaid);
        const data = {
          customerId: selectedCustomer,
          customerName,
          invoiceId: inv.id,
          totalAmount: inv.totalAmount,
          amountPaid: newPaid,
          remainingAmount: remaining,
          date: paymentDate
        };

        if (inv.outstandingRecord) {
          batch.update(doc(db, 'outstandings', inv.outstandingRecord.id), data);
        } else {
          const newRef = doc(collection(db, 'outstandings'));
          batch.set(newRef, data);
        }

        batch.update(doc(db, 'invoices', inv.id), {
          status: remaining <= 0.009 ? 'paid' : 'partially_paid'
        });

        outstandings
          .filter(o => o.invoiceId === inv.id && o.id !== inv.outstandingRecord?.id)
          .forEach(duplicate => batch.delete(doc(db, 'outstandings', duplicate.id)));
      });

      await batch.commit();
      setAllocations({});
      setSuccess(`Payment adjustment of ₹${money(selectedRows.reduce((s, r) => s + r.allocation, 0))} saved across ${selectedRows.length} bill(s).`);
    } catch (e) {
      console.error('Error saving payment allocation:', e);
      setError(e.message || 'Failed to save payment adjustments.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!outstandingToDelete) return;
    try {
      setSaving(true);
      await deleteDoc(doc(db, 'outstandings', outstandingToDelete.id));
      const invoice = invoices.find(i => i.id === outstandingToDelete.invoiceId);
      if (invoice) {
        await updateDoc(doc(db, 'invoices', invoice.id), { status: 'active' });
      }
      setDeleteDialogOpen(false);
      setOutstandingToDelete(null);
      setSuccess('Outstanding payment record deleted.');
    } catch (e) {
      setError('Failed to delete record.');
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = () => {
    const rows = buildAllOutstandingRows();
    exportOutstandingRowsPDF(rows, 'outstanding_records');
  };

  const summary = invoices
    .filter(inv => inv.status !== 'cancelled')
    .reduce((acc, inv) => {
      const { paid, due } = getInvoiceDue(inv);
      acc.total += Number(inv.totalAmount) || 0;
      acc.paid += paid;
      acc.remaining += due;
      return acc;
    }, { total: 0, paid: 0, remaining: 0 });

  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#fff'
    }
  };

  return (
    <Box sx={{ maxWidth: 1500, mx: 'auto', pb: 4 }}>
      <Box sx={{
        borderRadius: 3, overflow: 'hidden', mb: 3, px: 4, py: 3,
        background: 'linear-gradient(90deg, #e3f2fd 0%, #bbdefb 100%)'
      }}>
        <Typography variant="h4" fontWeight={800} color="#0d47a1">
          Outstanding Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Select a customer and bill date range, review the outstanding bills, allocate the payment, and save in one step.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 3, border: '1px solid #e0e0e0', borderRadius: 3 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Avatar sx={{ bgcolor: '#1976d2', width: 48, height: 48 }}>
            <AccountBalanceWallet />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Bill Matching & Payment Adjustment</Typography>
            <Typography variant="body2" color="text.secondary">
              Step 1: Select customer · Step 2: Choose bill dates · Step 3: Enter bill-wise adjustment · Step 4: Save payment
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={2} alignItems="end">
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">
              <Person fontSize="inherit" /> SELECT CUSTOMER *
            </Typography>
            <TextField
              select fullWidth value={selectedCustomer} onChange={handleCustomerChange}
              sx={inputStyle} placeholder="Select customer" disabled={loading}
            >
              <MenuItem value="" disabled>Select a customer</MenuItem>
              {customers.filter(c => c.isActive !== false || c.id === selectedCustomer).map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` (${c.phone})` : ''}{c.isActive === false ? ' [Inactive]' : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">FROM DATE *</Typography>
            <TextField
              type="date" fullWidth value={fromDate} onChange={e => {
                setFromDate(e.target.value);
                setAllocations({});
              }}
              sx={inputStyle} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">TO DATE *</Typography>
            <TextField
              type="date" fullWidth value={toDate} onChange={e => {
                setToDate(e.target.value);
                setAllocations({});
              }}
              sx={inputStyle} InputLabelProps={{ shrink: true }} inputProps={{ min: fromDate || undefined }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">PAYMENT DATE *</Typography>
            <TextField
              type="date" fullWidth value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              sx={inputStyle} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Button fullWidth variant="outlined" startIcon={<Clear />} onClick={clearSelection} sx={{ height: 56, textTransform: 'none' }}>
              Clear
            </Button>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={2}>
          <Box>
            <Typography variant="h6" fontWeight="bold">Outstanding Bill Matching</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedCustomer && fromDate && toDate
                ? `${customerName} · Bills dated ${fromDate} to ${toDate}`
                : 'Select a customer and both dates to display matching outstanding bills.'}
            </Typography>
          </Box>
          {invoiceRows.length > 0 && <Chip color="info" label={`${invoiceRows.length} outstanding bill(s)`} />}
        </Box>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f4f7fb' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Due Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Overdue</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice No.</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Bill Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Previously Paid (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Outstanding (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 170 }} align="right">Adjustment Now (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Balance After (₹)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoiceRows.map(inv => {
                const amount = Math.max(0, Number(allocations[inv.id]) || 0);
                const after = Math.max(0, inv.due - amount);
                return (
                  <TableRow key={inv.id} hover>
                    <TableCell>{dateValue(inv.date) || '-'}</TableCell>
                    <TableCell>{inv.dueDate || dateValue(inv.date) || '-'}</TableCell>
                    <TableCell>
                      <Chip size="small" color={inv.overdueDays > 0 ? 'error' : 'success'}
                        label={inv.overdueDays > 0 ? `Day ${inv.overdueDays}` : 'Not overdue'} />
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={600}>{inv.invoiceNumber || inv.id.slice(0, 8)}</Typography>
                    </TableCell>
                    <TableCell align="right">{money(inv.totalAmount)}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>{money(inv.paid)}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>{money(inv.due)}</TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number" size="small" value={allocations[inv.id] ?? ''}
                        onChange={e => handleAllocationChange(inv.id, e.target.value)}
                        inputProps={{ min: 0, max: inv.due, step: '0.01' }}
                        placeholder="0.00" sx={{ width: 145 }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', color: after > 0.009 ? 'error.main' : 'success.main' }}>
                      {money(after)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {selectedCustomer && fromDate && toDate && fromDate <= toDate && invoiceRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    No outstanding bills found for this customer in the selected date range.
                  </TableCell>
                </TableRow>
              )}
              {(!selectedCustomer || !fromDate || !toDate) && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Choose customer, From Date and To Date to load bill matching.
                  </TableCell>
                </TableRow>
              )}
              {fromDate && toDate && fromDate > toDate && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3, color: 'error.main' }}>
                    From Date must be earlier than or equal to To Date.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Total Outstanding in Date Range</Typography>
              <Typography variant="h6" fontWeight="bold" color="error.main">₹{money(totalDueShown)}</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Total Adjustment / Payment</Typography>
              <Typography variant="h6" fontWeight="bold" color="success.main">₹{money(totalAllocated)}</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Remaining After Adjustment</Typography>
              <Typography variant="h6" fontWeight="bold">₹{money(Math.max(0, totalDueShown - totalAllocated))}</Typography>
            </Paper>
          </Grid>
        </Grid>

        <Box display="flex" justifyContent="flex-end" mt={3}>
          <Button
            variant="contained" size="large" onClick={handleSavePayment}
            disabled={saving || loading || invoiceRows.length === 0 || totalAllocated <= 0}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Add />}
            sx={{ textTransform: 'none', px: 4 }}
          >
            {saving ? 'Saving...' : 'Save Payment Adjustment'}
          </Button>
        </Box>
      </Paper>


      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 3, border: '1px solid #d7e2ef', borderRadius: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h5" fontWeight="bold">All Customers - Outstanding Overview</Typography>
            <Typography variant="body2" color="text.secondary">
              Invoice date is the last allowed date. The next day is Overdue Day 1, followed by Day 2, Day 3, and so on.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<Visibility />} onClick={refreshAllOutstanding}>
            Show All Outstanding
          </Button>
        </Box>
        {showAllOutstanding && (
          <Box mt={3}>
            <Grid container spacing={2} mb={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">Total Pending</Typography>
                  <Typography variant="h5" fontWeight="bold" color="error.main">₹{money(allOutstandingTotal)}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">Pending Bills</Typography>
                  <Typography variant="h5" fontWeight="bold">{allOutstandingRows.length}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">Overdue Bills</Typography>
                  <Typography variant="h5" fontWeight="bold" color="error.main">{allOutstandingRows.filter(r => r.overdueDays > 0).length}</Typography>
                </Paper>
              </Grid>
            </Grid>
            <Box display="flex" gap={1.5} flexWrap="wrap" mb={2}>
              <TextField size="small" label="Search customer / invoice" value={outstandingSearch}
                onChange={e => setOutstandingSearch(e.target.value)} sx={{ minWidth: 260 }} />
              <Button variant="outlined" startIcon={<Save />} onClick={saveOutstandingReport} disabled={saving || !allOutstandingRows.length}>Save Report</Button>
              <Button variant="outlined" startIcon={<PictureAsPdfIcon />}
                onClick={() => exportOutstandingRowsPDF(filteredAllOutstanding)} disabled={!filteredAllOutstanding.length}>Export PDF</Button>
              <Button variant="outlined" startIcon={<Print />}
                onClick={() => printOutstandingRows(filteredAllOutstanding)} disabled={!filteredAllOutstanding.length}>Print</Button>
            </Box>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f4f7fb' }}>
                  <TableRow>
                    {['Customer', 'Phone', 'Invoice No.', 'Invoice Date', 'Due Date', 'Invoice Amount', 'Paid', 'Pending', 'Overdue'].map(label =>
                      <TableCell key={label} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{label}</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAllOutstanding.map(row => (
                    <TableRow key={row.invoiceId} hover>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.phone || '-'}</TableCell>
                      <TableCell>{row.invoiceNumber}</TableCell>
                      <TableCell>{row.invoiceDate || '-'}</TableCell>
                      <TableCell>{row.dueDate || '-'}</TableCell>
                      <TableCell align="right">{money(row.totalAmount)}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main' }}>{money(row.amountPaid)}</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>{money(row.remainingAmount)}</TableCell>
                      <TableCell><Chip size="small" color={row.overdueDays > 0 ? 'error' : 'success'}
                        label={row.overdueDays > 0 ? `Overdue Day ${row.overdueDays}` : 'Not overdue'} /></TableCell>
                    </TableRow>
                  ))}
                  {!filteredAllOutstanding.length && <TableRow><TableCell colSpan={9} align="center">No pending invoice balances found.</TableCell></TableRow>}
                  {!!filteredAllOutstanding.length && <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell colSpan={7} align="right" sx={{ fontWeight: 'bold' }}>TOTAL PENDING</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                      {money(filteredAllOutstanding.reduce((sum, row) => sum + row.remainingAmount, 0))}
                    </TableCell><TableCell />
                  </TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
        <Divider sx={{ my: 3 }} />
        <Typography variant="h6" fontWeight="bold" mb={1}>Saved Outstanding Reports</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f4f7fb' }}>
              <TableRow>
                <TableCell>Saved Date</TableCell><TableCell>Report Name</TableCell>
                <TableCell align="right">Bills</TableCell><TableCell align="right">Total Outstanding (₹)</TableCell>
                <TableCell align="center">Options</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {savedReports.map(report => (
                <TableRow key={report.id}>
                  <TableCell>{dateValue(report.savedAt) || report.asOfDate || '-'}</TableCell>
                  <TableCell>{report.title || 'Outstanding Report'}</TableCell>
                  <TableCell align="right">{report.totalBills || report.rows?.length || 0}</TableCell>
                  <TableCell align="right">{money(report.totalOutstanding)}</TableCell>
                  <TableCell align="center">
                    <Button size="small" onClick={() => {
                      setAllOutstandingRows(report.rows || []);
                      setOutstandingSearch('');
                      setShowAllOutstanding(true);
                    }}>View</Button>
                    <Button size="small" onClick={() => exportOutstandingRowsPDF(report.rows || [], 'saved_outstanding')}>PDF</Button>
                    <Button size="small" onClick={() => printOutstandingRows(report.rows || [])}>Print</Button>
                    <IconButton size="small" color="error" onClick={async () => {
                      if (!window.confirm('Delete this saved outstanding report?')) return;
                      await deleteDoc(doc(db, 'outstandingReports', report.id));
                    }}><Delete fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!savedReports.length && <TableRow><TableCell colSpan={5} align="center">No saved reports yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid #e0e0e0', borderLeft: '5px solid #1976d2', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">Total Invoiced</Typography>
            <Typography variant="h5" fontWeight={800}>₹{money(summary.total)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid #e0e0e0', borderLeft: '5px solid #2e7d32', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">Total Paid</Typography>
            <Typography variant="h5" fontWeight={800} color="success.main">₹{money(summary.paid)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid #e0e0e0', borderLeft: '5px solid #d32f2f', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">Total Outstanding</Typography>
            <Typography variant="h5" fontWeight={800} color="error.main">₹{money(summary.remaining)}</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: '1px solid #e0e0e0', borderRadius: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar sx={{ bgcolor: '#2e7d32' }}><AccountBalanceWallet /></Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">Outstanding Records</Typography>
              <Typography variant="body2" color="text.secondary">Current invoice-wise payment balances</Typography>
            </Box>
          </Box>
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={generatePDF} sx={{ textTransform: 'none' }}>
            Export PDF
          </Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f4f7fb' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Bill Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Paid (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Remaining (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Invoice Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Overdue</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {buildAllOutstandingRows().map(r => (
                <TableRow key={r.invoiceId} hover>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>{r.invoiceNumber}</TableCell>
                  <TableCell align="right">{money(r.totalAmount)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>{money(r.amountPaid)}</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>{money(r.remainingAmount)}</TableCell>
                  <TableCell>{r.invoiceDate || '-'}</TableCell>
                  <TableCell><Chip size="small" color={r.overdueDays > 0 ? 'error' : 'success'} label={r.overdueDays > 0 ? `Overdue Day ${r.overdueDays}` : 'Not overdue'} /></TableCell>
                  <TableCell>
                    {(() => {
                      const record = consolidatedOutstandings.find(x => x.invoiceId === r.invoiceId);
                      return record ? <IconButton color="error" size="small" onClick={() => {
                        setOutstandingToDelete(record);
                        setDeleteDialogOpen(true);
                      }} disabled={saving}><Delete fontSize="small" /></IconButton> : '-';
                    })()}
                  </TableCell>
                </TableRow>
              ))}
              {buildAllOutstandingRows().length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>No outstanding invoice balances found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Payment Record?</DialogTitle>
        <DialogContent>
          <Typography>
            This removes the saved payment adjustment for this invoice and resets its status to Active. Continue only if this payment entry is incorrect.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disabled={saving}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Outstanding;