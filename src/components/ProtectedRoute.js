import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../config/firebase';
import { CircularProgress, Box, Typography, Container } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import React, { useState, useEffect } from 'react';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const [user, loading, error] = useAuthState(auth);
  const [userRole, setUserRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserRole = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role);
          }
        } catch (err) {
          console.error('Error fetching user role:', err);
        } finally {
          setRoleLoading(false);
        }
      }
    };

    fetchUserRole();
  }, [user]);

  if (loading || roleLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress size={60} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography color="error">Error: {error.message}</Typography>
      </Container>
    );
  }

  if (!user) {
    // Redirect to login if not authenticated
    navigate('/login');
    return null;
  }

  if (requiredRole && userRole !== requiredRole) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h5" color="error">
          Unauthorized: You don't have permission to access this page
        </Typography>
        <Typography variant="body1" sx={{ mt: 2 }}>
          Required role: {requiredRole}
        </Typography>
      </Container>
    );
  }

  return children;
};

export default ProtectedRoute;