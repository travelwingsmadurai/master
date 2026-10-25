import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Container, Typography, TextField, Dialog, DialogTitle, DialogContent, 
  DialogActions, MenuItem, Select, InputLabel, FormControl, Box, IconButton,
  Tooltip
} from '@mui/material';
import { 
  PictureAsPdf, Add, Receipt, Payment, Cancel, DateRange, 
  Edit, Delete, Search, FilterList, Clear 
} from '@mui/icons-material';
import { addDoc, collection, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

// Use native date input instead of MUI DatePicker
const DatePickerInput = ({ label, value, onChange }) => (
  <TextField
    label={label}
    type="date"
    fullWidth
    variant="standard"
    InputLabelProps={{ shrink: true }}
    value={value}
    onChange={onChange}
  />
);

const BankLedger = () => {
  const [accountData, setAccountData] = useState({
    ledgerName: 'Travels Wings',
    currentMonth: '',
    openingBalance: 0,
    transactions: [],
    totals: {
      akbDr: 0,
      akbCr: 0,
      bill: 0,
      earning: 0,
      balance: 0
    }
  });

  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [openDateRangeDialog, setOpenDateRangeDialog] = useState(false);
  const [openFilterDialog, setOpenFilterDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split('T')[0],
    name: '',
    amount: '',
    type: 'receipt',
    bill: '',
    earning: '',
    reference: ''
  });

  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const [filters, setFilters] = useState({
    reference: '',
    type: '',
    startDate: '',
    endDate: ''
  });

  // Set current month in format "Month YYYY"
  useEffect(() => {
    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    setAccountData(prev => ({
      ...prev,
      currentMonth: `${month} ${year}`
    }));
  }, []);

  // Fetch transactions from Firestore
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const transactionsRef = collection(db, 'bankLedger');
        const q = query(transactionsRef, orderBy('date'));
        const querySnapshot = await getDocs(q);
        
        const transactions = [];
        querySnapshot.forEach((doc) => {
          transactions.push({ id: doc.id, ...doc.data() });
        });

        // Calculate opening balance (last month's closing balance)
        let openingBalance = 0;
        if (transactions.length > 0) {
          const lastTransaction = transactions[transactions.length - 1];
          if (lastTransaction.type === 'closing') {
            openingBalance = lastTransaction.balance;
          }
        }

        setAccountData(prev => ({
          ...prev,
          openingBalance,
          transactions: transactions.filter(t => t.type !== 'closing')
        }));
        
        calculateTotals();
      } catch (error) {
        console.error("Error fetching transactions: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  // Calculate totals whenever transactions change
  useEffect(() => {
    calculateTotals();
  }, [accountData.transactions]);

  const calculateTotals = () => {
    const totals = {
      akbDr: 0,
      akbCr: 0,
      bill: 0,
      earning: 0
    };

    accountData.transactions.forEach(transaction => {
      if (transaction.akbDr) totals.akbDr += transaction.akbDr;
      if (transaction.akbCr) totals.akbCr += transaction.akbCr;
      if (transaction.bill) totals.bill += transaction.bill;
      if (transaction.earning) totals.earning += transaction.earning;
    });

    totals.balance = accountData.openingBalance + totals.akbDr - totals.akbCr;

    setAccountData(prev => ({
      ...prev,
      totals
    }));
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleAddTransaction = async () => {
    try {
      const transaction = {
        date: newTransaction.date,
        name: newTransaction.name,
        akbDr: newTransaction.type === 'payment' || newTransaction.type === 'cancellation' ? parseFloat(newTransaction.amount) : null,
        akbCr: newTransaction.type === 'receipt' ? parseFloat(newTransaction.amount) : null,
        bill: newTransaction.bill ? parseFloat(newTransaction.bill) : null,
        earning: newTransaction.type === 'receipt' && newTransaction.bill && newTransaction.amount 
          ? parseFloat(newTransaction.bill) - parseFloat(newTransaction.amount) 
          : null,
        type: newTransaction.type,
        reference: newTransaction.reference,
        createdAt: new Date().toISOString()
      };

      // Add to Firestore
      const docRef = await addDoc(collection(db, 'bankLedger'), transaction);
      
      // Update local state
      setAccountData(prev => ({
        ...prev,
        transactions: [...prev.transactions, { id: docRef.id, ...transaction }]
      }));

      resetTransactionForm();
      setOpenDialog(false);
    } catch (error) {
      console.error("Error adding transaction: ", error);
    }
  };

  const handleUpdateTransaction = async () => {
    try {
      const transaction = {
        date: newTransaction.date,
        name: newTransaction.name,
        akbDr: newTransaction.type === 'payment' || newTransaction.type === 'cancellation' ? parseFloat(newTransaction.amount) : null,
        akbCr: newTransaction.type === 'receipt' ? parseFloat(newTransaction.amount) : null,
        bill: newTransaction.bill ? parseFloat(newTransaction.bill) : null,
        earning: newTransaction.type === 'receipt' && newTransaction.bill && newTransaction.amount 
          ? parseFloat(newTransaction.bill) - parseFloat(newTransaction.amount) 
          : null,
        type: newTransaction.type,
        reference: newTransaction.reference
      };

      // Update in Firestore
      await updateDoc(doc(db, 'bankLedger', editingTransaction.id), transaction);
      
      // Update local state
      setAccountData(prev => ({
        ...prev,
        transactions: prev.transactions.map(t => 
          t.id === editingTransaction.id ? { ...t, ...transaction } : t
        )
      }));

      resetTransactionForm();
      setOpenDialog(false);
      setEditingTransaction(null);
    } catch (error) {
      console.error("Error updating transaction: ", error);
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'bankLedger', id));
      
      // Update local state
      setAccountData(prev => ({
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id)
      }));
    } catch (error) {
      console.error("Error deleting transaction: ", error);
    }
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setNewTransaction({
      date: transaction.date,
      name: transaction.name,
      amount: transaction.akbDr ? transaction.akbDr.toString() : transaction.akbCr.toString(),
      type: transaction.type,
      bill: transaction.bill ? transaction.bill.toString() : '',
      earning: transaction.earning ? transaction.earning.toString() : '',
      reference: transaction.reference || ''
    });
    setOpenDialog(true);
  };

  const resetTransactionForm = () => {
    setNewTransaction({
      date: new Date().toISOString().split('T')[0],
      name: '',
      amount: '',
      type: 'receipt',
      bill: '',
      earning: '',
      reference: ''
    });
  };

  const handleBillChange = (e) => {
    const billValue = e.target.value;
    setNewTransaction({
      ...newTransaction,
      bill: billValue,
      earning: billValue && newTransaction.amount ? (parseFloat(billValue) - parseFloat(newTransaction.amount)) : ''
    });
  };

  const handleAmountChange = (e) => {
    const amountValue = e.target.value;
    setNewTransaction({
      ...newTransaction,
      amount: amountValue,
      earning: newTransaction.bill && amountValue ? (parseFloat(newTransaction.bill) - parseFloat(amountValue)) : ''
    });
  };

  const generatePDF = (startDate = null, endDate = null, filteredData = null) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm'
    });

    // Use filtered data if provided, otherwise use all transactions
    let transactionsToExport = filteredData || accountData.transactions;
    let dateRangeTitle = accountData.currentMonth;
    
    // Apply date range filter if provided
    if (startDate && endDate) {
      transactionsToExport = transactionsToExport.filter(transaction => {
        return transaction.date >= startDate && transaction.date <= endDate;
      });
      
      dateRangeTitle = `${startDate} to ${endDate}`;
    }

    // Calculate totals for exported transactions
    const exportTotals = {
      akbDr: 0,
      akbCr: 0,
      bill: 0,
      earning: 0
    };

    transactionsToExport.forEach(transaction => {
      if (transaction.akbDr) exportTotals.akbDr += transaction.akbDr;
      if (transaction.akbCr) exportTotals.akbCr += transaction.akbCr;
      if (transaction.bill) exportTotals.bill += transaction.bill;
      if (transaction.earning) exportTotals.earning += transaction.earning;
    });

    exportTotals.balance = accountData.openingBalance + exportTotals.akbDr - exportTotals.akbCr;

    // Header styling
    const headerStyles = {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    };

    // Table headers
    const headers = [
      { title: 'Date', dataKey: 'date' },
      { title: 'Name', dataKey: 'name' },
      { title: 'Reference', dataKey: 'reference' },
      { title: 'Debit (₹)', dataKey: 'akbDr' },
      { title: 'Credit (₹)', dataKey: 'akbCr' },
      { title: 'Bill (₹)', dataKey: 'bill' },
      { title: 'Earning (₹)', dataKey: 'earning' },
      { title: 'Type', dataKey: 'type' }
    ];

    // Prepare data for the table
    const tableData = transactionsToExport.map(transaction => ({
      date: transaction.date,
      name: transaction.name,
      reference: transaction.reference || '-',
      akbDr: transaction.akbDr ? formatNumber(transaction.akbDr) : '-',
      akbCr: transaction.akbCr ? formatNumber(transaction.akbCr) : '-',
      bill: transaction.bill ? formatNumber(transaction.bill) : '-',
      earning: transaction.earning ? formatNumber(transaction.earning) : '-',
      type: transaction.type === 'receipt' ? 'Receipt' : 
            transaction.type === 'payment' ? 'Payment' : 
            transaction.type === 'cancellation' ? 'Cancellation' : ''
    }));

    // Add title and header
    doc.setFontSize(16);
    doc.setTextColor(41, 128, 185);
    doc.setFont('helvetica', 'bold');
    doc.text(`${accountData.ledgerName} - Account Statement`, 148, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Period: ${dateRangeTitle}`, 148, 22, { align: 'center' });
    doc.text(`Opening Balance: ₹${formatNumber(accountData.openingBalance)}`, 14, 30);

    // Create the table
    doc.autoTable({
      startY: 35,
      head: [headers.map(header => header.title)],
      headStyles: headerStyles,
      body: tableData.map(row => headers.map(header => row[header.dataKey])),
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 40 },
        2: { cellWidth: 30 },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
        7: { cellWidth: 20, halign: 'center' }
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { top: 35 }
    });

    // Add totals row
    const lastTable = doc.lastAutoTable;
    const finalY = lastTable.finalY + 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Totals:', 100, finalY);
    doc.text(exportTotals.akbDr ? `₹${formatNumber(exportTotals.akbDr)}` : '-', 100 + 25 + 40 + 30, finalY, { align: 'right' });
    doc.text(exportTotals.akbCr ? `₹${formatNumber(exportTotals.akbCr)}` : '-', 100 + 25 + 40 + 30 + 25, finalY, { align: 'right' });
    doc.text(exportTotals.bill ? `₹${formatNumber(exportTotals.bill)}` : '-', 100 + 25 + 40 + 30 + 25 + 25, finalY, { align: 'right' });
    doc.text(exportTotals.earning ? `₹${formatNumber(exportTotals.earning)}` : '-', 100 + 25 + 40 + 30 + 25 + 25 + 25, finalY, { align: 'right' });

    // Add closing balance
    doc.text('Closing Balance:', 100, finalY + 10);
    doc.text(`₹${formatNumber(exportTotals.balance)}`, 100 + 25 + 40 + 30, finalY + 10, { align: 'right' });

    // Add footer
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 200);
    doc.text('© Travels Wings Accounting System', 275, 200, { align: 'right' });

    // Save the PDF
    const fileName = startDate && endDate 
      ? `${accountData.ledgerName.replace(' ', '_')}_Statement_${startDate}_to_${endDate}.pdf`
      : `${accountData.ledgerName.replace(' ', '_')}_Statement_${accountData.currentMonth.replace(' ', '_')}.pdf`;
    
    doc.save(fileName);
  };

  const handleGenerateWithDateRange = () => {
    if (dateRange.startDate && dateRange.endDate) {
      generatePDF(dateRange.startDate, dateRange.endDate);
      setOpenDateRangeDialog(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...accountData.transactions];
    
    if (filters.reference) {
      filtered = filtered.filter(t => 
        t.reference && t.reference.toLowerCase().includes(filters.reference.toLowerCase())
      );
    }
    
    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }
    
    if (filters.startDate && filters.endDate) {
      filtered = filtered.filter(t => 
        t.date >= filters.startDate && t.date <= filters.endDate
      );
    }
    
    generatePDF(null, null, filtered);
    setOpenFilterDialog(false);
  };

  const clearFilters = () => {
    setFilters({
      reference: '',
      type: '',
      startDate: '',
      endDate: ''
    });
  };

  const fetchTransactionDetails = async (reference, type) => {
    try {
      // This is a placeholder - you would implement actual API calls to your systems
      // to fetch details based on reference number
      let details = {};
      
      if (type === 'receipt') {
        // Simulate fetching receipt details
        details = {
          name: 'Sample Passenger',
          amount: '10000',
          bill: '10500'
        };
      } else if (type === 'payment') {
        // Simulate fetching payment details
        details = {
          name: 'Sample Vendor',
          amount: '5000'
        };
      } else if (type === 'cancellation') {
        // Simulate fetching cancellation details
        details = {
          name: 'Cancelled Passenger',
          amount: '7500'
        };
      }
      
      setNewTransaction(prev => ({
        ...prev,
        name: details.name,
        amount: details.amount,
        bill: details.bill || '',
        earning: details.bill && details.amount ? (parseFloat(details.bill) - parseFloat(details.amount)) : ''
      }));
      
    } catch (error) {
      console.error("Error fetching transaction details: ", error);
    }
  };

  const filteredTransactions = accountData.transactions.filter(transaction => {
    return (
      (!filters.reference || (transaction.reference && transaction.reference.toLowerCase().includes(filters.reference.toLowerCase()))) &&
      (!filters.type || transaction.type === filters.type) &&
      (!filters.startDate || !filters.endDate || (transaction.date >= filters.startDate && transaction.date <= filters.endDate))
    );
  });

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Account Statement Generator
      </Typography>
      
      <Typography variant="h6" gutterBottom>
        {accountData.ledgerName} - {accountData.currentMonth}
      </Typography>
      
      <Typography variant="subtitle1" gutterBottom>
        Opening Balance: ₹{formatNumber(accountData.openingBalance)}
      </Typography>
      
      <Box sx={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Receipt />}
          onClick={() => {
            setNewTransaction(prev => ({ ...prev, type: 'receipt' }));
            setEditingTransaction(null);
            setOpenDialog(true);
          }}
        >
          Add Receipt
        </Button>
        
        <Button
          variant="contained"
          color="secondary"
          startIcon={<Payment />}
          onClick={() => {
            setNewTransaction(prev => ({ ...prev, type: 'payment' }));
            setEditingTransaction(null);
            setOpenDialog(true);
          }}
        >
          Add Payment
        </Button>
        
        <Button
          variant="contained"
          color="error"
          startIcon={<Cancel />}
          onClick={() => {
            setNewTransaction(prev => ({ ...prev, type: 'cancellation' }));
            setEditingTransaction(null);
            setOpenDialog(true);
          }}
        >
          Add Cancellation
        </Button>
        
        <Button
          variant="contained"
          startIcon={<PictureAsPdf />}
          onClick={() => generatePDF()}
          disabled={loading}
        >
          Generate Full PDF
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<DateRange />}
          onClick={() => setOpenDateRangeDialog(true)}
          disabled={loading}
        >
          Export Date Range
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<FilterList />}
          onClick={() => setOpenFilterDialog(true)}
          disabled={loading}
          sx={{ ml: 'auto' }}
        >
          Filter
        </Button>
        
        {(filters.reference || filters.type || filters.startDate || filters.endDate) && (
          <Tooltip title="Clear Filters">
            <IconButton onClick={clearFilters}>
              <Clear />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      
      {loading ? (
        <Typography variant="body1">Loading transactions...</Typography>
      ) : (
        <>
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell align="right">Debit (₹)</TableCell>
                  <TableCell align="right">Credit (₹)</TableCell>
                  <TableCell align="right">Bill (₹)</TableCell>
                  <TableCell align="right">Earning (₹)</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTransactions.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.reference}</TableCell>
                    <TableCell align="right">{formatNumber(row.akbDr)}</TableCell>
                    <TableCell align="right">{formatNumber(row.akbCr)}</TableCell>
                    <TableCell align="right">{formatNumber(row.bill)}</TableCell>
                    <TableCell align="right">{formatNumber(row.earning)}</TableCell>
                    <TableCell>
                      {row.type === 'receipt' ? 'Receipt' : 
                       row.type === 'payment' ? 'Payment' : 
                       row.type === 'cancellation' ? 'Cancellation' :
                       row.type === 'opening' ? 'Opening' : ''}
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleEditTransaction(row)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDeleteTransaction(row.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} align="right"><strong>Total</strong></TableCell>
                  <TableCell align="right"><strong>{formatNumber(accountData.totals.akbDr)}</strong></TableCell>
                  <TableCell align="right"><strong>{formatNumber(accountData.totals.akbCr)}</strong></TableCell>
                  <TableCell align="right"><strong>{formatNumber(accountData.totals.bill)}</strong></TableCell>
                  <TableCell align="right"><strong>{formatNumber(accountData.totals.earning)}</strong></TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={7} align="right"><strong>Closing Balance</strong></TableCell>
                  <TableCell colSpan={2} align="right"><strong>{formatNumber(accountData.totals.balance)}</strong></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      
      {/* Add/Edit Transaction Dialog */}
      <Dialog open={openDialog} onClose={() => {
        setOpenDialog(false);
        setEditingTransaction(null);
        resetTransactionForm();
      }}>
        <DialogTitle>
          {editingTransaction ? 'Edit Transaction' : 
           newTransaction.type === 'receipt' ? 'Add New Receipt' : 
           newTransaction.type === 'payment' ? 'Add New Payment' : 
           'Add New Cancellation'}
        </DialogTitle>
        <DialogContent>
          <DatePickerInput
            label="Date"
            value={newTransaction.date}
            onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
          />
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              margin="dense"
              label="Reference Number"
              type="text"
              fullWidth
              variant="standard"
              value={newTransaction.reference}
              onChange={(e) => setNewTransaction({...newTransaction, reference: e.target.value})}
            />
            <Tooltip title="Fetch details by reference">
              <IconButton 
                onClick={() => fetchTransactionDetails(newTransaction.reference, newTransaction.type)}
                disabled={!newTransaction.reference}
              >
                <Search />
              </IconButton>
            </Tooltip>
          </Box>
          
          <TextField
            margin="dense"
            label="Name"
            type="text"
            fullWidth
            variant="standard"
            value={newTransaction.name}
            onChange={(e) => setNewTransaction({...newTransaction, name: e.target.value})}
          />
          
          <TextField
            margin="dense"
            label="Amount"
            type="number"
            fullWidth
            variant="standard"
            value={newTransaction.amount}
            onChange={handleAmountChange}
          />
          
          {newTransaction.type === 'receipt' && (
            <>
              <TextField
                margin="dense"
                label="Bill Amount"
                type="number"
                fullWidth
                variant="standard"
                value={newTransaction.bill}
                onChange={handleBillChange}
              />
              <TextField
                margin="dense"
                label="Earning"
                type="number"
                fullWidth
                variant="standard"
                value={newTransaction.earning}
                InputProps={{
                  readOnly: true,
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpenDialog(false);
            setEditingTransaction(null);
            resetTransactionForm();
          }}>Cancel</Button>
          <Button onClick={editingTransaction ? handleUpdateTransaction : handleAddTransaction}>
            {editingTransaction ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Date Range Selection Dialog */}
      <Dialog open={openDateRangeDialog} onClose={() => setOpenDateRangeDialog(false)}>
        <DialogTitle>Select Date Range for Export</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 2, my: 2 }}>
            <DatePickerInput
              label="Start Date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
            />
            <DatePickerInput
              label="End Date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDateRangeDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleGenerateWithDateRange}
            disabled={!dateRange.startDate || !dateRange.endDate}
          >
            Generate PDF
          </Button>
        </DialogActions>
      </Dialog>

      {/* Filter Dialog */}
      <Dialog open={openFilterDialog} onClose={() => setOpenFilterDialog(false)}>
        <DialogTitle>Filter Transactions</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Reference Number"
            type="text"
            fullWidth
            variant="standard"
            value={filters.reference}
            onChange={(e) => setFilters({...filters, reference: e.target.value})}
          />
          
          <FormControl fullWidth margin="dense" variant="standard">
            <InputLabel>Transaction Type</InputLabel>
            <Select
              value={filters.type}
              onChange={(e) => setFilters({...filters, type: e.target.value})}
            >
              <MenuItem value="">All Types</MenuItem>
              <MenuItem value="receipt">Receipt</MenuItem>
              <MenuItem value="payment">Payment</MenuItem>
              <MenuItem value="cancellation">Cancellation</MenuItem>
            </Select>
          </FormControl>
          
          <Box sx={{ display: 'flex', gap: 2, my: 2 }}>
            <DatePickerInput
              label="Start Date"
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
            />
            <DatePickerInput
              label="End Date"
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenFilterDialog(false)}>Cancel</Button>
          <Button onClick={applyFilters}>Apply Filters</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default BankLedger;