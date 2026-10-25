import React, { useState, useEffect } from 'react';
import { addDoc, collection, getDocs, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  TextField, Button, Typography, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Snackbar, Alert, CircularProgress,
  Grid, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, InputLabel, FormControl, Avatar
} from '@mui/material';
import { 
  Edit, Delete, Person, Email, Phone, Badge, LocationOn, 
  CalendarToday, AttachMoney, AdminPanelSettings, CreditCard, Add, Clear
} from '@mui/icons-material';

const StaffManagement = () => {
  // State management
  const [staffMembers, setStaffMembers] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    role: 'employee',
    joiningDate: new Date().toISOString().split('T')[0],
    salary: '',
    emergencyContact: '',
    aadharNumber: '',
    panNumber: ''
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [editingStaff, setEditingStaff] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  const staffCollectionRef = collection(db, 'staff');

  useEffect(() => {
    const fetchStaff = async () => {
      setFetching(true);
      try {
        const querySnapshot = await getDocs(staffCollectionRef);
        const staffData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        staffData.sort((a, b) => a.staffId.localeCompare(b.staffId));
        setStaffMembers(staffData);
      } catch (error) {
        console.error('Error fetching staff:', error);
        showSnackbar('Failed to load staff. Please try again.', 'error');
      } finally {
        setFetching(false);
      }
    };
    fetchStaff();
  }, []);

  const showSnackbar = (message, severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateStaffId = () => {
    if (staffMembers.length === 0) return 'STAFF0001';
    const lastStaffId = staffMembers[staffMembers.length - 1].staffId;
    const numericPart = parseInt(lastStaffId.replace('STAFF', ''), 10);
    const nextNumber = numericPart + 1;
    return `STAFF${nextNumber.toString().padStart(4, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      showSnackbar('Please fill in all required fields', 'error');
      return;
    }

    if (formData.aadharNumber && !/^\d{12}$/.test(formData.aadharNumber)) {
      showSnackbar('Aadhar number must be 12 digits', 'error');
      return;
    }

    if (formData.panNumber && !/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(formData.panNumber)) {
      showSnackbar('PAN must be in format ABCDE1234F', 'error');
      return;
    }

    setLoading(true);
    try {
      if (editingStaff) {
        await updateDoc(doc(db, 'staff', editingStaff.id), {
          ...formData, updatedAt: serverTimestamp()
        });
        showSnackbar('Staff updated successfully!', 'success');
      } else {
        await addDoc(staffCollectionRef, {
          ...formData, staffId: generateStaffId(),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        showSnackbar('Staff added successfully!', 'success');
      }

      const querySnapshot = await getDocs(staffCollectionRef);
      const staffData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      staffData.sort((a, b) => a.staffId.localeCompare(b.staffId));
      setStaffMembers(staffData);

      setFormData({
        name: '', email: '', phone: '', address: '', role: 'employee',
        joiningDate: new Date().toISOString().split('T')[0], salary: '',
        emergencyContact: '', aadharNumber: '', panNumber: ''
      });
      setEditingStaff(null);
    } catch (error) {
      console.error('Error saving staff:', error);
      showSnackbar(`Failed to ${editingStaff ? 'update' : 'add'} staff.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name, email: staff.email, phone: staff.phone,
      address: staff.address || '', role: staff.role || 'employee',
      joiningDate: staff.joiningDate || new Date().toISOString().split('T')[0],
      salary: staff.salary || '', emergencyContact: staff.emergencyContact || '',
      aadharNumber: staff.aadharNumber || '', panNumber: staff.panNumber || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingStaff(null);
    setFormData({
      name: '', email: '', phone: '', address: '', role: 'employee',
      joiningDate: new Date().toISOString().split('T')[0], salary: '',
      emergencyContact: '', aadharNumber: '', panNumber: ''
    });
  };

  const handleDelete = (staff) => {
    setStaffToDelete(staff);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'staff', staffToDelete.id));
      const querySnapshot = await getDocs(staffCollectionRef);
      const staffData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      staffData.sort((a, b) => a.staffId.localeCompare(b.staffId));
      setStaffMembers(staffData);
      showSnackbar('Staff deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting staff:', error);
      showSnackbar('Failed to delete staff.', 'error');
    } finally {
      setDeleteDialogOpen(false);
      setStaffToDelete(null);
    }
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
            Staff Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage your staff members, roles, and internal records.
          </Typography>
        </Box>
      </Box>

      {/* ─── FORM SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <Person fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter staff details to create a new employee record
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation sx={{ bgcolor: '#e3f2fd', color: '#1976d2', '&:hover': { bgcolor: '#bbdefb' }, textTransform: 'none' }}>
            View All Staff
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="primary" /> Full Name *
              </Typography>
              <TextField name="name" value={formData.name} onChange={handleChange} fullWidth placeholder="Enter full name" sx={inputStyle} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Email fontSize="small" color="error" /> Email *
              </Typography>
              <TextField name="email" type="email" value={formData.email} onChange={handleChange} fullWidth placeholder="Enter email address" sx={inputStyle} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Phone fontSize="small" color="success" /> Phone *
              </Typography>
              <TextField name="phone" value={formData.phone} onChange={handleChange} fullWidth placeholder="Enter phone number" sx={inputStyle} required />
            </Grid>

            {/* Row 2 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AdminPanelSettings fontSize="small" color="warning" /> Role *
              </Typography>
              <FormControl fullWidth sx={inputStyle}>
                <Select name="role" value={formData.role} onChange={handleChange} displayEmpty>
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="manager">Manager</MenuItem>
                  <MenuItem value="employee">Employee</MenuItem>
                  <MenuItem value="accountant">Accountant</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="info" /> Joining Date
              </Typography>
              <TextField name="joiningDate" type="date" value={formData.joiningDate} onChange={handleChange} fullWidth sx={inputStyle} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney fontSize="small" color="success" /> Salary (₹)
              </Typography>
              <TextField name="salary" type="number" value={formData.salary} onChange={handleChange} fullWidth placeholder="Enter salary" sx={inputStyle} inputProps={{ min: 0 }} />
            </Grid>

            {/* Row 3 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CreditCard fontSize="small" color="secondary" /> Aadhar Number
              </Typography>
              <TextField name="aadharNumber" value={formData.aadharNumber} onChange={handleChange} fullWidth placeholder="12 digit Aadhar number" sx={inputStyle} inputProps={{ maxLength: 12 }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Badge fontSize="small" color="primary" /> PAN Number
              </Typography>
              <TextField name="panNumber" value={formData.panNumber} onChange={handleChange} fullWidth placeholder="Format: ABCDE1234F" sx={inputStyle} inputProps={{ maxLength: 10 }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Phone fontSize="small" color="info" /> Emergency Contact
              </Typography>
              <TextField name="emergencyContact" value={formData.emergencyContact} onChange={handleChange} fullWidth placeholder="Emergency contact number" sx={inputStyle} />
            </Grid>

            {/* Row 4 */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOn fontSize="small" color="error" /> Address
              </Typography>
              <TextField name="address" value={formData.address} onChange={handleChange} fullWidth multiline rows={2} placeholder="Enter complete address" sx={inputStyle} />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={editingStaff ? handleCancelEdit : () => setFormData({
                name: '', email: '', phone: '', address: '', role: 'employee',
                joiningDate: new Date().toISOString().split('T')[0], salary: '',
                emergencyContact: '', aadharNumber: '', panNumber: ''
              })} 
              disabled={loading}
              startIcon={<Clear />}
              sx={{ textTransform: 'none', color: 'text.secondary', borderColor: '#e0e0e0', px: 3 }}
            >
              {editingStaff ? 'Cancel Edit' : 'Clear'}
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}
            >
              {loading ? 'Saving...' : editingStaff ? 'Update Staff' : 'Add Staff'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ─── LIST SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <Person fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Staff List</Typography>
            <Typography variant="body2" color="text.secondary">View and manage all staff members ({staffMembers.length})</Typography>
          </Box>
        </Box>

        {fetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Staff ID</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Joining Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {staffMembers.length > 0 ? (
                  staffMembers.map((staff) => (
                    <TableRow key={staff.id} hover>
                      <TableCell><Typography fontWeight="500">{staff.staffId}</Typography></TableCell>
                      <TableCell>{staff.name}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{staff.role}</TableCell>
                      <TableCell>{staff.email}</TableCell>
                      <TableCell>{staff.phone}</TableCell>
                      <TableCell>{new Date(staff.joiningDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <IconButton color="primary" onClick={() => handleEdit(staff)}>
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton color="error" onClick={() => handleDelete(staff)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="textSecondary">No staff members found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete staff member {staffToDelete?.staffId} - {staffToDelete?.name}?
          </Typography>
          <Typography color="error" sx={{ mt: 1 }}>This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" startIcon={<Delete />}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default StaffManagement;