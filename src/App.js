import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner'; 
import ErrorBoundary from './components/ErrorBoundary'; 

// Lazy load pages for better performance
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const SupplierManagement = lazy(() => import('./pages/SupplierManagement'));
const Invoice = lazy(() => import('./pages/Invoice'));
const Outstanding = lazy(() => import('./pages/Outstanding'));
const Receipt = lazy(() => import('./pages/Receipt'));
const PaymentVoucher = lazy(() => import('./pages/PaymentVoucher'));
const ProfitLedger = lazy(() => import('./pages/ProfitLedger'));
const BankLedger = lazy(() => import('./pages/BankLedger'));
const StaffManagement = lazy(() => import('./pages/StaffManagement'));
const Cancellation = lazy(() => import('./pages/Cancellation'));
const StaffLedger = lazy(() => import('./pages/StaffLedger'));
const CustomerReport = lazy(() => import('./pages/CustomerReport'));
const CustomerLedger = lazy(() => import('./pages/CustomerLedger')); // ADDED FOR PHASE 7
const Reconciliation = lazy(() => import('./pages/Reconciliation')); // ADDED FOR PHASE 7
const NotFound = lazy(() => import('./pages/NotFound')); 

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public Route */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="user-management" element={<UserManagement />} />
              <Route path="supplier-management" element={<SupplierManagement />} />
              <Route path="invoice" element={<Invoice />} />
              <Route path="outstanding" element={<Outstanding />} />
              <Route path="receipt" element={<Receipt />} />
              <Route path="payment-voucher" element={<PaymentVoucher />} />
              <Route path="profit-ledger" element={<ProfitLedger />} />
              <Route path="bank-ledger" element={<BankLedger />} />
              <Route path="staff-management" element={<StaffManagement />} />
              <Route path="cancellation" element={<Cancellation />} />
              <Route path="staff-ledger" element={<StaffLedger />} />
              <Route path="customer-report" element={<CustomerReport />} />
              
              {/* ADDED FOR PHASE 7 */}
              <Route path="customer-ledger" element={<CustomerLedger />} />
              <Route path="reconciliation" element={<Reconciliation />} />
              
              {/* 404 Page - Catch-all route */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;