import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, collection, getDocs, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  TextField, Button, Container, Typography, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Snackbar, Alert, CircularProgress,
  Grid, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, InputLabel, FormControl, InputAdornment, Chip,
  TablePagination, Tooltip, Avatar
} from '@mui/material';
import { 
  Edit, Delete, Search, Download, RestoreFromTrash, 
  Person, Phone, Email, LocationOn, Business, Receipt, 
  Notes, Add, FilterList, People, PersonAdd, Clear 
} from '@mui/icons-material';

const CUSTOMER_TYPES = ['Individual', 'Corporate', 'Travel Agency', 'Walk-in'];

const INITIAL_FORM = {
  name: '', phone: '', alternatePhone: '', email: '',
  address: '', city: '', pincode: '', gstNumber: '',
  customerType: 'Individual', notes: ''
};

const UserManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const customersCollectionRef = collection(db, 'customers');

  const showSnackbar = (message, severity = 'success') =>
    setSnackbar({ open: true, message, severity });

  const fetchCustomers = async () => {
    setFetching(true);
    try {
      const snap = await getDocs(customersCollectionRef);
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching customers:', err);
      showSnackbar('Failed to load customers. Please try again.', 'error');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateCustomerId = () => {
    let maxNum = 0;
    for (const c of customers) {
      const m = (c.customerId || '').match(/CUS(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    return `CUS${(maxNum + 1).toString().padStart(4, '0')}`;
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Customer name is required';
    if (!formData.phone.trim()) return 'Phone number is required';
    if (formData.phone && !/^[\d+\-\s()]{7,15}$/.test(formData.phone)) return 'Enter a valid phone number';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Enter a valid email address';
    if (formData.gstNumber && !/^[0-9A-Z]{15}$/i.test(formData.gstNumber)) return 'GST number must be 15 alphanumeric characters';
    if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) return 'Pincode must be 6 digits';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validateForm();
    if (error) { showSnackbar(error, 'error'); return; }

    setLoading(true);
    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), {
          ...formData, updatedAt: serverTimestamp()
        });
        showSnackbar('Customer updated successfully!');
      } else {
        await addDoc(customersCollectionRef, {
          ...formData,
          customerId: generateCustomerId(),
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        showSnackbar('Customer added successfully!');
      }
      await fetchCustomers();
      setFormData(INITIAL_FORM);
      setEditingCustomer(null);
    } catch (err) {
      console.error('Error saving customer:', err);
      showSnackbar(`Failed to ${editingCustomer ? 'update' : 'add'} customer.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '', phone: customer.phone || '', alternatePhone: customer.alternatePhone || '',
      email: customer.email || '', address: customer.address || '', city: customer.city || '',
      pincode: customer.pincode || '', gstNumber: customer.gstNumber || '',
      customerType: customer.customerType || 'Individual', notes: customer.notes || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCustomer(null);
    setFormData(INITIAL_FORM);
  };

  const confirmDelete = async () => {
    try {
      await updateDoc(doc(db, 'customers', customerToDelete.id), {
        isActive: false, updatedAt: serverTimestamp()
      });
      await fetchCustomers();
      showSnackbar(`Customer ${customerToDelete.name} deactivated.`);
    } catch (err) {
      showSnackbar('Failed to deactivate customer.', 'error');
    } finally {
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    }
  };

  const handleRestore = async (customer) => {
    try {
      await updateDoc(doc(db, 'customers', customer.id), {
        isActive: true, updatedAt: serverTimestamp()
      });
      await fetchCustomers();
      showSnackbar(`Customer ${customer.name} restored.`);
    } catch (err) {
      showSnackbar('Failed to restore customer.', 'error');
    }
  };

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return customers
      .filter(c => {
        if (filterStatus === 'active' && c.isActive === false) return false;
        if (filterStatus === 'inactive' && c.isActive !== false) return false;
        if (filterType !== 'all' && c.customerType !== filterType) return false;
        if (!term) return true;
        return ['customerId', 'name', 'phone', 'email'].some(k => (c[k] || '').toLowerCase().includes(term));
      })
      .sort((a, b) => (parseInt((a.customerId || '').replace(/\D/g, '')) || 0) - (parseInt((b.customerId || '').replace(/\D/g, '')) || 0));
  }, [customers, searchTerm, filterType, filterStatus]);

  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredCustomers, page, rowsPerPage]
  );

  const handleExportCSV = () => {
    const headers = ['Customer ID', 'Name', 'Phone', 'Alt Phone', 'Email', 'Type', 'City', 'Pincode', 'GST', 'Status'];
    const rows = filteredCustomers.map(c => [
      c.customerId || '', c.name || '', c.phone || '', c.alternatePhone || '',
      c.email || '', c.customerType || '', c.city || '', c.pincode || '',
      c.gstNumber || '', c.isActive === false ? 'Inactive' : 'Active'
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
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
            Customer Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage your customers, view details and track their transactions.
          </Typography>
        </Box>
      </Box>

      {/* ─── FORM SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <PersonAdd fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter customer details to create a new customer record
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation sx={{ bgcolor: '#e3f2fd', color: '#1976d2', '&:hover': { bgcolor: '#bbdefb' }, textTransform: 'none' }}>
            View All Customers
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="primary" /> Full Name *
              </Typography>
              <TextField name="name" value={formData.name} onChange={handleChange} fullWidth placeholder="Enter full name" sx={inputStyle} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Phone fontSize="small" color="success" /> Phone *
              </Typography>
              <TextField name="phone" value={formData.phone} onChange={handleChange} fullWidth placeholder="Enter phone number" sx={inputStyle} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Phone fontSize="small" color="secondary" /> Alternate Phone
              </Typography>
              <TextField name="alternatePhone" value={formData.alternatePhone} onChange={handleChange} fullWidth placeholder="Enter alternate phone" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Email fontSize="small" color="error" /> Email
              </Typography>
              <TextField name="email" type="email" value={formData.email} onChange={handleChange} fullWidth placeholder="Enter email address" sx={inputStyle} />
            </Grid>

            {/* Row 2 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <People fontSize="small" color="warning" /> Customer Type
              </Typography>
              <FormControl fullWidth sx={inputStyle}>
                <Select name="customerType" value={formData.customerType} onChange={handleChange} displayEmpty>
                  {CUSTOMER_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Receipt fontSize="small" color="info" /> GST Number
              </Typography>
              <TextField name="gstNumber" value={formData.gstNumber} onChange={handleChange} fullWidth placeholder="Enter 15-character GST number" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOn fontSize="small" color="primary" /> City
              </Typography>
              <TextField name="city" value={formData.city} onChange={handleChange} fullWidth placeholder="Enter city" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOn fontSize="small" color="secondary" /> Pincode
              </Typography>
              <TextField name="pincode" value={formData.pincode} onChange={handleChange} fullWidth placeholder="Enter pincode" sx={inputStyle} />
            </Grid>

            {/* Row 3 */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Business fontSize="small" color="success" /> Address
              </Typography>
              <TextField name="address" value={formData.address} onChange={handleChange} fullWidth multiline rows={3} placeholder="Enter complete address" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Notes fontSize="small" color="info" /> Notes
              </Typography>
              <TextField name="notes" value={formData.notes} onChange={handleChange} fullWidth multiline rows={3} placeholder="Enter notes about customer" sx={inputStyle} />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={editingCustomer ? handleCancelEdit : () => setFormData(INITIAL_FORM)} 
              disabled={loading}
              startIcon={<Clear />}
              sx={{ textTransform: 'none', color: 'text.secondary', borderColor: '#e0e0e0', px: 3 }}
            >
              {editingCustomer ? 'Cancel Edit' : 'Clear'}
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}
            >
              {loading ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Add Customer'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ─── LIST SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
              <People fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">Customer List</Typography>
              <Typography variant="body2" color="text.secondary">View and manage all customers ({filteredCustomers.length})</Typography>
            </Box>
          </Box>

          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField 
              size="small"
              placeholder="Search customers..." 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              sx={{ ...inputStyle, width: 250 }}
            />
            <Button variant="outlined" startIcon={<FilterList />} sx={{ textTransform: 'none', color: 'text.secondary', borderColor: '#e0e0e0' }}>Filter</Button>
            <Button variant="contained" startIcon={<Download />} onClick={handleExportCSV} sx={{ textTransform: 'none', bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}>Export</Button>
          </Box>
        </Box>

        {fetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Customer ID</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>City</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedCustomers.length > 0 ? (
                    paginatedCustomers.map(c => (
                      <TableRow key={c.id} hover sx={{ opacity: c.isActive === false ? 0.5 : 1 }}>
                        <TableCell><Typography fontWeight="500">{c.customerId}</Typography></TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        <TableCell>{c.email || '-'}</TableCell>
                        <TableCell>{c.customerType || '-'}</TableCell>
                        <TableCell>{c.city || '-'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={c.isActive === false ? 'Inactive' : 'Active'} color={c.isActive === false ? 'default' : 'success'} />
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Edit">
                            <IconButton color="primary" onClick={() => handleEdit(c)}><Edit fontSize="small" /></IconButton>
                          </Tooltip>
                          {c.isActive === false ? (
                            <Tooltip title="Restore">
                              <IconButton color="success" onClick={() => handleRestore(c)}><RestoreFromTrash fontSize="small" /></IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Deactivate">
                              <IconButton color="error" onClick={() => { setCustomerToDelete(c); setDeleteDialogOpen(true); }}><Delete fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="textSecondary">No customers match your search</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredCustomers.length}
              page={page}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 20, 50, 100]}
            />
          </>
        )}
      </Paper>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Deactivate Customer?</DialogTitle>
        <DialogContent>
          <Typography>
            Deactivate <strong>{customerToDelete?.customerId} — {customerToDelete?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Historical invoices will still reference this customer. You can restore later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Deactivate</Button>
        </DialogActions>
      </Dialog>

      {/* Notification */}
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar(p => ({ ...p, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(p => ({ ...p, open: false }))} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default UserManagement;