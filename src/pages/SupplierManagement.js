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
  Business, Add, FilterList, People, Clear,
  Person, Phone, Email, LocationOn, Receipt, 
  AccountBalance, CreditCard, Notes, LocalShipping, Schedule
} from '@mui/icons-material';

const SUPPLIER_TYPES = ['Airline', 'Hotel', 'Transport', 'DMC', 'Visa Services', 'Insurance', 'Other'];
const PAYMENT_TERMS = ['Advance', 'On Delivery', 'Net 15', 'Net 30', 'Net 60'];

const INITIAL_FORM = {
  name: '', contactPerson: '', phone: '', email: '',
  address: '', city: '', pincode: '', gstNumber: '',
  supplierType: 'Airline', paymentTerms: 'Advance',
  bankName: '', accountNumber: '', ifscCode: '', notes: ''
};

const SupplierManagement = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const suppliersCollectionRef = collection(db, 'suppliers');

  const showSnackbar = (message, severity = 'success') =>
    setSnackbar({ open: true, message, severity });

  const fetchSuppliers = async () => {
    setFetching(true);
    try {
      const snap = await getDocs(suppliersCollectionRef);
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      showSnackbar('Failed to load suppliers. Please try again.', 'error');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateSupplierId = () => {
    let maxNum = 0;
    for (const s of suppliers) {
      const m = (s.supplierId || '').match(/SUP(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    return `SUP${(maxNum + 1).toString().padStart(4, '0')}`;
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Supplier name is required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      return 'Enter a valid email address';
    if (formData.gstNumber && !/^[0-9A-Z]{15}$/i.test(formData.gstNumber))
      return 'GST number must be 15 alphanumeric characters';
    if (formData.pincode && !/^\d{6}$/.test(formData.pincode))
      return 'Pincode must be 6 digits';
    if (formData.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(formData.ifscCode))
      return 'Enter a valid IFSC code (e.g. HDFC0001234)';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validateForm();
    if (error) { showSnackbar(error, 'error'); return; }

    setLoading(true);
    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
          ...formData, updatedAt: serverTimestamp()
        });
        showSnackbar('Supplier updated successfully!');
      } else {
        await addDoc(suppliersCollectionRef, {
          ...formData,
          supplierId: generateSupplierId(),
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        showSnackbar('Supplier added successfully!');
      }
      await fetchSuppliers();
      setFormData(INITIAL_FORM);
      setEditingSupplier(null);
    } catch (err) {
      console.error('Error saving supplier:', err);
      showSnackbar(`Failed to ${editingSupplier ? 'update' : 'add'} supplier.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '', contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '', email: supplier.email || '', address: supplier.address || '',
      city: supplier.city || '', pincode: supplier.pincode || '', gstNumber: supplier.gstNumber || '',
      supplierType: supplier.supplierType || 'Airline', paymentTerms: supplier.paymentTerms || 'Advance',
      bankName: supplier.bankName || '', accountNumber: supplier.accountNumber || '',
      ifscCode: supplier.ifscCode || '', notes: supplier.notes || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingSupplier(null);
    setFormData(INITIAL_FORM);
  };

  const confirmDelete = async () => {
    try {
      await updateDoc(doc(db, 'suppliers', supplierToDelete.id), {
        isActive: false, updatedAt: serverTimestamp()
      });
      await fetchSuppliers();
      showSnackbar(`Supplier ${supplierToDelete.name} deactivated.`);
    } catch (err) {
      showSnackbar('Failed to deactivate supplier.', 'error');
    } finally {
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    }
  };

  const handleRestore = async (supplier) => {
    try {
      await updateDoc(doc(db, 'suppliers', supplier.id), {
        isActive: true, updatedAt: serverTimestamp()
      });
      await fetchSuppliers();
      showSnackbar(`Supplier ${supplier.name} restored.`);
    } catch (err) {
      showSnackbar('Failed to restore supplier.', 'error');
    }
  };

  const filteredSuppliers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return suppliers
      .filter(s => {
        if (filterStatus === 'active' && s.isActive === false) return false;
        if (filterStatus === 'inactive' && s.isActive !== false) return false;
        if (filterType !== 'all' && s.supplierType !== filterType) return false;
        if (!term) return true;
        return ['supplierId', 'name', 'contactPerson', 'phone', 'email']
          .some(k => (s[k] || '').toLowerCase().includes(term));
      })
      .sort((a, b) => (parseInt((a.supplierId || '').replace(/\D/g, '')) || 0) - (parseInt((b.supplierId || '').replace(/\D/g, '')) || 0));
  }, [suppliers, searchTerm, filterType, filterStatus]);

  const paginatedSuppliers = useMemo(
    () => filteredSuppliers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredSuppliers, page, rowsPerPage]
  );

  const handleExportCSV = () => {
    const headers = ['Supplier ID', 'Name', 'Contact', 'Phone', 'Email', 'Type', 'Terms', 'City', 'GST', 'Status'];
    const rows = filteredSuppliers.map(s => [
      s.supplierId || '', s.name || '', s.contactPerson || '', s.phone || '',
      s.email || '', s.supplierType || '', s.paymentTerms || '',
      s.city || '', s.gstNumber || '', s.isActive === false ? 'Inactive' : 'Active'
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  // ─── Custom Theme Styles (Primary Blue) ───
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
            Supplier Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage your suppliers, view details and track their transactions.
          </Typography>
        </Box>
      </Box>

      {/* ─── FORM SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <Business fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter supplier details to create a new supplier record
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation sx={{ bgcolor: '#e3f2fd', color: '#1976d2', '&:hover': { bgcolor: '#bbdefb' }, textTransform: 'none' }}>
            View All Suppliers
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Business fontSize="small" color="primary" /> Supplier Name *
              </Typography>
              <TextField name="name" value={formData.name} onChange={handleChange} fullWidth placeholder="Enter supplier name" sx={inputStyle} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="info" /> Contact Person
              </Typography>
              <TextField name="contactPerson" value={formData.contactPerson} onChange={handleChange} fullWidth placeholder="Enter contact person" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Phone fontSize="small" color="success" /> Phone
              </Typography>
              <TextField name="phone" value={formData.phone} onChange={handleChange} fullWidth placeholder="Enter phone number" sx={inputStyle} />
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
                <LocalShipping fontSize="small" color="warning" /> Supplier Type
              </Typography>
              <FormControl fullWidth sx={inputStyle}>
                <Select name="supplierType" value={formData.supplierType} onChange={handleChange} displayEmpty>
                  {SUPPLIER_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Schedule fontSize="small" color="secondary" /> Payment Terms
              </Typography>
              <FormControl fullWidth sx={inputStyle}>
                <Select name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} displayEmpty>
                  {PAYMENT_TERMS.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
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

            {/* Row 3 */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOn fontSize="small" color="secondary" /> Pincode
              </Typography>
              <TextField name="pincode" value={formData.pincode} onChange={handleChange} fullWidth placeholder="Enter pincode" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccountBalance fontSize="small" color="primary" /> Bank Name
              </Typography>
              <TextField name="bankName" value={formData.bankName} onChange={handleChange} fullWidth placeholder="Enter bank name" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CreditCard fontSize="small" color="warning" /> Account Number
              </Typography>
              <TextField name="accountNumber" value={formData.accountNumber} onChange={handleChange} fullWidth placeholder="Enter account number" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccountBalance fontSize="small" color="success" /> IFSC Code
              </Typography>
              <TextField name="ifscCode" value={formData.ifscCode} onChange={handleChange} fullWidth placeholder="Enter IFSC code" sx={inputStyle} />
            </Grid>

            {/* Row 4 */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Business fontSize="small" color="success" /> Address
              </Typography>
              <TextField name="address" value={formData.address} onChange={handleChange} fullWidth multiline rows={2} placeholder="Enter complete address" sx={inputStyle} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Notes fontSize="small" color="info" /> Notes
              </Typography>
              <TextField name="notes" value={formData.notes} onChange={handleChange} fullWidth multiline rows={2} placeholder="Enter notes about supplier" sx={inputStyle} />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={editingSupplier ? handleCancelEdit : () => setFormData(INITIAL_FORM)} 
              disabled={loading}
              startIcon={<Clear />}
              sx={{ textTransform: 'none', color: 'text.secondary', borderColor: '#e0e0e0', px: 3 }}
            >
              {editingSupplier ? 'Cancel Edit' : 'Clear'}
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}
            >
              {loading ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Add Supplier'}
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
              <Typography variant="h5" fontWeight="bold">Supplier List</Typography>
              <Typography variant="body2" color="text.secondary">View and manage all suppliers ({filteredSuppliers.length})</Typography>
            </Box>
          </Box>

          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField 
              size="small"
              placeholder="Search suppliers..." 
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
                    <TableCell sx={{ fontWeight: 'bold' }}>Supplier ID</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Contact</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Terms</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedSuppliers.length > 0 ? (
                    paginatedSuppliers.map(s => (
                      <TableRow key={s.id} hover sx={{ opacity: s.isActive === false ? 0.5 : 1 }}>
                        <TableCell><Typography fontWeight="500">{s.supplierId}</Typography></TableCell>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.contactPerson || '-'}</TableCell>
                        <TableCell>{s.phone || '-'}</TableCell>
                        <TableCell>{s.supplierType || '-'}</TableCell>
                        <TableCell>{s.paymentTerms || '-'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={s.isActive === false ? 'Inactive' : 'Active'} color={s.isActive === false ? 'default' : 'success'} />
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Edit">
                            <IconButton color="primary" onClick={() => handleEdit(s)}><Edit fontSize="small" /></IconButton>
                          </Tooltip>
                          {s.isActive === false ? (
                            <Tooltip title="Restore">
                              <IconButton color="success" onClick={() => handleRestore(s)}><RestoreFromTrash fontSize="small" /></IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Deactivate">
                              <IconButton color="error" onClick={() => { setSupplierToDelete(s); setDeleteDialogOpen(true); }}><Delete fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="textSecondary">No suppliers match your search</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredSuppliers.length}
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
        <DialogTitle>Deactivate Supplier?</DialogTitle>
        <DialogContent>
          <Typography>
            Deactivate <strong>{supplierToDelete?.supplierId} — {supplierToDelete?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Historical invoices will still reference this supplier. You can restore later.
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

export default SupplierManagement;