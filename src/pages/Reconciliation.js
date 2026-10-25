import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  Box, Container, Typography, Paper, Button, CircularProgress,
  Alert, List, ListItem, ListItemText, ListItemIcon, Divider
} from '@mui/material';
import { CheckCircle, Warning } from '@mui/icons-material';

const Reconciliation = () => {
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState([]);
  const [checked, setChecked] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    setIssues([]);
    try {
      const [invSnap, recSnap, ledgSnap, outSnap] = await Promise.all([
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'receipts')),
        getDocs(collection(db, 'accountLedger')),
        getDocs(collection(db, 'outstandings'))
      ]);

      const invoices = invSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      const receipts = recSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      const ledger = ledgSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      const outstandings = outSnap.docs.map(d => ({ ...d.data(), id: d.id }));

      const foundIssues = [];

      // 1. Invoice Math & Duplicate Check
      const invNumbers = new Set();
      invoices.forEach(inv => {
        if (invNumbers.has(inv.invoiceNumber)) {
          foundIssues.push({ type: 'Duplicate', msg: `Duplicate Invoice Number: ${inv.invoiceNumber}` });
        }
        invNumbers.add(inv.invoiceNumber);

        // Math check
        const itemsTotal = (inv.items || []).reduce((s, i) => s + (parseFloat(i.sellingAmount) || 0), 0);
        const addTotal = (inv.additionalItems || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        const handling = parseFloat(inv.handlingCharge) || 0;
        const calculatedTotal = itemsTotal + addTotal + handling;

        if (Math.abs(calculatedTotal - (parseFloat(inv.totalAmount) || 0)) > 1) {
          foundIssues.push({ type: 'Math Error', msg: `Invoice ${inv.invoiceNumber} Total Mismatch. Stored: ₹${inv.totalAmount}, Calculated: ₹${calculatedTotal.toFixed(2)}` });
        }
      });

      // 2. Receipt Number Duplicates
      const recNumbers = new Set();
      receipts.forEach(rec => {
        if (recNumbers.has(rec.receiptNo)) {
          foundIssues.push({ type: 'Duplicate', msg: `Duplicate Receipt Number: ${rec.receiptNo}` });
        }
        recNumbers.add(rec.receiptNo);
      });

      // 3. Missing Ledger Entries for Receipts
      receipts.forEach(rec => {
        const hasLedger = ledger.find(l => l.receiptNo === rec.receiptNo && l.type === 'receipt');
        if (!hasLedger) {
          foundIssues.push({ type: 'Missing Link', msg: `Receipt #${rec.receiptNo} is missing from the Account Ledger.` });
        }
      });

      // 4. Outstanding vs Paid Invoices
      const consolidatedOut = new Map();
      outstandings.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(o => consolidatedOut.set(o.invoiceId, o));
      
      invoices.forEach(inv => {
        const out = consolidatedOut.get(inv.id);
        if (inv.status === 'paid' && out && out.remainingAmount > 0) {
          foundIssues.push({ type: 'Status Mismatch', msg: `Invoice ${inv.invoiceNumber} is marked PAID but has an outstanding balance of ₹${out.remainingAmount}` });
        }
        if (inv.status === 'active' && out && out.remainingAmount <= 0) {
          foundIssues.push({ type: 'Status Mismatch', msg: `Invoice ${inv.invoiceNumber} is marked ACTIVE but outstanding balance is ₹0.` });
        }
      });

      setIssues(foundIssues);
    } catch (err) {
      console.error(err);
      alert('Audit failed to run. Check console.');
    } finally {
      setLoading(false);
      setChecked(true);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>Data Reconciliation</Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        This tool scans your database for mathematical inconsistencies, duplicate document numbers, and missing ledger entries. It does not modify any data.
      </Typography>

      <Button variant="contained" size="large" onClick={runAudit} disabled={loading} sx={{ mb: 4 }}>
        {loading ? <CircularProgress size={24} /> : 'Run Audit'}
      </Button>

      {checked && issues.length === 0 && (
        <Alert severity="success" icon={<CheckCircle />}>
          Database is clean! No mathematical or linking inconsistencies found.
        </Alert>
      )}

      {issues.length > 0 && (
        <Paper elevation={2}>
          <List>
            {issues.map((issue, idx) => (
              <React.Fragment key={idx}>
                <ListItem>
                  <ListItemIcon><Warning color="error" /></ListItemIcon>
                  <ListItemText 
                    primary={issue.msg} 
                    secondary={`Issue Type: ${issue.type}`}
                    primaryTypographyProps={{ color: 'error.main', fontWeight: 'bold' }}
                  />
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}
    </Container>
  );
};

export default Reconciliation;