// src/pages/Receipt.js — Themed UI + QR & Print
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { addDoc, collection, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadInvoice } from '../cloudinaryUpload';
import { useReactToPrint } from 'react-to-print';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import { 
  TextField, Button, Box, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, FormControl, 
  Select, MenuItem, IconButton, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Typography, Grid, Avatar, Divider, Tooltip
} from '@mui/material';
import { 
  PictureAsPdf as PictureAsPdfIcon, 
  Edit, Delete, Receipt as ReceiptIcon, 
  Person, CalendarToday, AttachMoney, Payment, AccountBalance,
  Add, Clear, Print, CloudUpload, Download
} from '@mui/icons-material';

// ──────────────────────────── Helpers ────────────────────────────
function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  function convertLessThanOneThousand(n) {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanOneThousand(n % 100) : '');
  }
  
  if (num === 0) return 'Zero Rupees';
  let rupees = Math.floor(num);
  let paise = Math.round((num - rupees) * 100);
  let words = '';
  
  if (rupees > 0) {
    if (rupees >= 10000000) { words += convertLessThanOneThousand(Math.floor(rupees / 10000000)) + ' Crore '; rupees %= 10000000; }
    if (rupees >= 100000) { words += convertLessThanOneThousand(Math.floor(rupees / 100000)) + ' Lakh '; rupees %= 100000; }
    if (rupees >= 1000) { words += convertLessThanOneThousand(Math.floor(rupees / 1000)) + ' Thousand '; rupees %= 1000; }
    if (rupees > 0) { words += convertLessThanOneThousand(rupees) + ' '; }
    words += 'Rupees';
  }
  if (paise > 0) { if (words !== '') words += ' and '; words += convertLessThanOneThousand(paise) + ' Paise'; }
  return words;
}

// ──────────────────────────── Printable Receipt ────────────────────────────
const PrintableReceipt = React.forwardRef(({ receipt }, ref) => {
  if (!receipt) return null;

  return (
    <div
      id="printable-receipt"
      ref={ref}
      style={{
        padding: '20px', fontFamily: 'Arial', width: '190mm',
        boxSizing: 'border-box', margin: '0 auto', backgroundColor: 'white', color: '#000'
      }}
    >
      {/* Header with Logo */}
      <div style={{ position: 'relative', minHeight: '80px' }}>
        <img src="/logo.jpg" alt="Logo" style={{ position: 'absolute', top: 0, right: 0, height: '70px', objectFit: 'contain' }} />
        <h2 style={{ textAlign: 'center', marginBottom: '5px', paddingTop: '10px' }}>TRAVELWINGS</h2>
        <div style={{ textAlign: 'center', marginTop: '0', color: '#555', fontSize: '10px', lineHeight: 1.45 }}>
          <div><strong>H.O:</strong> FF8, First Floor, Parsan Samruthi Mahal, Opp. Fathima College, MADURAI - 18.</div>
          <div><strong>B.O:</strong> 40, Vinayagar Koil St., Vinayagapuram, Opp. Lakshmi Narasimmar Temple, RED HILLS, CHENNAI - 600 099.</div>
          <div>Email: twlixm2@gmail.com | Phone: 7200266119</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        <h3 style={{ margin: '5px 0' }}>RECEIPT</h3>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px 10px', fontWeight: 'bold', width: '150px' }}>Receipt No:</td>
            <td style={{ padding: '8px 10px' }}>{receipt.receiptNo}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>Date:</td>
            <td style={{ padding: '8px 10px' }}>{receipt.date}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ margin: '15px 0' }}>
        <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Received Thanks TO:</p>
        <p style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{receipt.customerName}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0', border: '1px solid #ddd' }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Description</th>
            <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', border: '1px solid #ddd' }}>
               Received via {receipt.paymentMode}
              {receipt.paymentName ? ` (Ref: ${receipt.paymentName})` : ''}
            </td>
            <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>
              {parseFloat(receipt.amount || 0).toFixed(2)}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Total:</td>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>
              ₹{parseFloat(receipt.amount || 0).toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>



      <div style={{ margin: '20px 0' }}>
        <p><strong>Amount in Words:</strong> {numberToWords(parseFloat(receipt.amount || 0))}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '30px' }}>
        
        {/* Bank Details */}
        <div style={{ fontSize: '12px', flex: 1 }}>
          <p style={{ fontStyle: 'italic', marginBottom: '8px' }}>
            *(Bank Transfer Subject to Realisation)*
          </p>
          <table style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>AC No</strong></td><td style={{ padding: '2px 0' }}>: 42719516722</td></tr>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>AC Name</strong></td><td style={{ padding: '2px 0' }}>: Travel wings</td></tr>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>Bank</strong></td><td style={{ padding: '2px 0' }}>: SBI Bank</td></tr>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>Branch</strong></td><td style={{ padding: '2px 0' }}>: Andalpuram</td></tr>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>City</strong></td><td style={{ padding: '2px 0' }}>: Madurai</td></tr>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>IFS Code</strong></td><td style={{ padding: '2px 0' }}>: SBIN 0018158</td></tr>
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>GPAY No</strong></td><td style={{ padding: '2px 0' }}>: 7200266119</td></tr>
            </tbody>
          </table>
        </div>

        {/* QR Code */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <p style={{ fontSize: '12px', marginBottom: '8px' }}><strong>Scan to pay via UPI</strong></p>
          <img src="/QR.jpeg" alt="UPI QR" style={{ width: '100px', height: '100px', border: '1px solid #ccc', padding: '5px', borderRadius: '8px' }} />
        </div>
        
        {/* Signature */}
        <div style={{ textAlign: 'right', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <p style={{ margin: 0 }}>For "TRAVELWINGS"</p>
          <img src="/signature.png" alt="Signature" style={{ height: '60px', objectFit: 'contain', margin: '10px 0' }} />
          <p style={{ margin: 0 }}>Authorised Signatory</p>
        </div>
      </div>
    </div>
  );
});

// ──────────────────────────── Main Component ────────────────────────────
const Receipt = () => {
  const [customers, setCustomers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentInvoices, setAdjustmentInvoices] = useState([]);
  const [adjustmentRows, setAdjustmentRows] = useState({});
  const [adjustmentSearch, setAdjustmentSearch] = useState('');
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  
  // Print State
  const [printReceipt, setPrintReceipt] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const printTimeoutRef = useRef(null);

  // Base64 states for PDF generation
  const [logoBase64, setLogoBase64] = useState(null);
  const [qrBase64, setQrBase64] = useState(null);
  const [signatureBase64, setSignatureBase64] = useState(null);

  // Quick-add Customer
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });

  const receiptRef = useRef();

  const [formData, setFormData] = useState({
    customerId: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'),
    receiptNo: '', paymentMode: 'Cash', paymentName: '',
    docName: '', docUrl: '', docPublicId: '', docResourceType: ''
  });

  const customersCollectionRef = collection(db, 'customers');
  const receiptsCollectionRef = collection(db, 'receipts');
  const ledgerCollectionRef = collection(db, 'accountLedger');

  // Load images for PDF safely
  useEffect(() => {
    const loadImage = async (path, setter) => {
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('File is not an image');
        
        const reader = new FileReader();
        reader.onloadend = () => setter(reader.result);
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn(`Failed to load image for PDF: ${path}`, err.message);
      }
    };
    loadImage('/logo.jpg', setLogoBase64);
    loadImage('/QR.jpeg', setQrBase64);
    loadImage('/signature.png', setSignatureBase64);
  }, []);

  const generateReceiptNo = (list = receipts) => {
    if (list.length === 0) return '1';
    let max = 0;
    list.forEach(r => {
      const digits = String(r.receiptNo).replace(/\D/g, '');
      if (digits) max = Math.max(max, parseInt(digits, 10));
    });
    return (max + 1).toString();
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [customersData, receiptsData] = await Promise.all([
          getDocs(customersCollectionRef),
          getDocs(receiptsCollectionRef)
        ]);
        
        setCustomers(customersData.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        
        const sorted = receiptsData.docs.map(doc => ({ 
          ...doc.data(), id: doc.id, amount: parseFloat(doc.data().amount) || 0
        })).sort((a, b) => (parseInt(b.receiptNo) || 0) - (parseInt(a.receiptNo) || 0));
        
        setReceipts(sorted);
        setFormData(prev => ({ ...prev, receiptNo: generateReceiptNo(sorted) }));
      } catch (err) {
        setError('Failed to load data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCustomerChange = (e) => {
    const customerId = e.target.value;
    setSelectedCustomer(customers.find(c => c.id === customerId) || null);
    setFormData({ ...formData, customerId });
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const resetForm = (list = receipts) => {
    setFormData({
      customerId: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'),
      receiptNo: generateReceiptNo(list), paymentMode: 'Cash', paymentName: '',
      docName: '', docUrl: '', docPublicId: '', docResourceType: ''
    });
    setSelectedCustomer(null);
    setEditingId(null);
    setError(null);
  };

  // ── Cloudinary receipt document upload (same helper/configuration as Invoice.js) ──
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError({ message: 'Only PDF, JPG and PNG files are allowed.', severity: 'error' });
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError({ message: 'File size exceeds 10 MB. Please choose a smaller file.', severity: 'error' });
      e.target.value = '';
      return;
    }

    setIsUploadingDocument(true);
    setError(null);
    try {
      const result = await uploadInvoice(file);
      if (!result?.secure_url || !result?.public_id) {
        throw new Error('Cloudinary did not return a valid file URL.');
      }
      setFormData(prev => ({
        ...prev,
        docName: file.name,
        docUrl: result.secure_url,
        docPublicId: result.public_id,
        docResourceType: result.resource_type || (file.type === 'application/pdf' ? 'raw' : 'image')
      }));
      setError({ message: 'Receipt attachment uploaded successfully!', severity: 'success' });
    } catch (err) {
      console.error('Receipt document upload failed:', err);
      setError({ message: err.message || 'Failed to upload receipt attachment.', severity: 'error' });
    } finally {
      setIsUploadingDocument(false);
      e.target.value = '';
    }
  };

  const downloadDocument = (docUrl, docName, legacyDocData) => {
    const url = docUrl || legacyDocData;
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = docName || 'Receipt-Document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Quick-add Customer ──
  const handleSaveNewCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    try {
      const docRef = await addDoc(customersCollectionRef, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim(),
        isActive: true,
        createdAt: new Date().toISOString()
      });
      const created = {
        id: docRef.id,
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim(),
        isActive: true
      };
      setCustomers(prev => [...prev, created]);
      setSelectedCustomer(created);
      setFormData(prev => ({ ...prev, customerId: docRef.id }));
      setNewCustomer({ name: '', phone: '', email: '' });
      setCustomerDialogOpen(false);
      setError({ message: 'Customer added successfully!', severity: 'success' });
    } catch (err) {
      console.error('Add customer failed:', err);
      setError('Failed to add customer. Please try again.');
    }
  };

  // Save is a two-step process: open bill-wise allocation first, then confirm.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || savingReceipt) return;
    setError(null);
    try {
      if (!formData.customerId || !formData.amount || !formData.date) throw new Error('Please fill all required fields');
      const amount = Number(formData.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');

      const [invoiceSnap, receiptSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('customerId', '==', formData.customerId))),
        getDocs(query(collection(db, 'receipts'), where('customerId', '==', formData.customerId)))
      ]);
      const existingReceipts = receiptSnap.docs
        .filter(d => d.id !== editingId)
        .map(d => d.data());

      const paidByInvoice = {};
      existingReceipts.forEach(r => (r.allocations || []).forEach(a => {
        const id = a.invoiceId;
        paidByInvoice[id] = (paidByInvoice[id] || 0) + (Number(a.amount) || 0);
      }));

      const invoices = invoiceSnap.docs.map(d => {
        const data = d.data();
        const total = Number(data.totalAmount) || 0;
        const paid = paidByInvoice[d.id] || 0;
        const oldAllocation = (receipts.find(r => r.id === editingId)?.allocations || [])
          .filter(a => a.invoiceId === d.id).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
        const outstanding = Math.max(0, total - paid);
        return {
          id: d.id,
          invoiceNumber: data.invoiceNumber || d.id,
          date: data.date || '',
          dueDate: data.dueDate || data.date || '',
          total,
          paid: paid,
          outstanding: outstanding + oldAllocation,
          status: data.status
        };
      }).filter(i => i.status !== 'cancelled' && i.outstanding > 0)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const oldRows = {};
      (receipts.find(r => r.id === editingId)?.allocations || []).forEach(a => {
        oldRows[a.invoiceId] = { amount: String(a.amount), date: a.date || formData.date, reference: a.reference || '' };
      });
      setAdjustmentInvoices(invoices);
      setAdjustmentRows(oldRows);
      setAdjustmentSearch('');
      setAdjustmentOpen(true);
    } catch (err) {
      setError(err.message || 'Unable to load customer invoices for adjustment.');
    }
  };

  const changeAllocation = (invoiceId, field, value) => {
    setAdjustmentRows(prev => ({
      ...prev,
      [invoiceId]: { ...(prev[invoiceId] || { amount: '', date: formData.date, reference: '' }), [field]: value }
    }));
  };

  const allocationTotal = Object.values(adjustmentRows).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const receiptAmount = Number(formData.amount) || 0;
  const remainingReceipt = Math.max(0, receiptAmount - allocationTotal);

  const confirmSaveReceipt = async () => {
    if (savingReceipt) return;
    setError(null);
    const allocations = adjustmentInvoices
      .filter(inv => Number(adjustmentRows[inv.id]?.amount) > 0)
      .map(inv => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(adjustmentRows[inv.id].amount).toFixed(2),
        date: adjustmentRows[inv.id].date || formData.date,
        reference: adjustmentRows[inv.id].reference || inv.invoiceNumber
      }));

    if (allocationTotal - receiptAmount > 0.009) {
      setError('Allocated amount cannot be greater than the receipt amount.');
      return;
    }
    for (const a of allocations) {
      const inv = adjustmentInvoices.find(i => i.id === a.invoiceId);
      if (Number(a.amount) - inv.outstanding > 0.009) {
        setError(`Allocation for invoice ${a.invoiceNumber} exceeds its outstanding balance.`);
        return;
      }
    }

    setSavingReceipt(true);
    try {
      const now = new Date().toISOString();
      const receiptData = {
        ...formData,
        customerName: selectedCustomer?.name || '',
        customerPhone: selectedCustomer?.phone || '',
        amount: receiptAmount.toFixed(2),
        allocations,
        unallocatedAmount: remainingReceipt.toFixed(2),
        updatedAt: now
      };
      const batch = writeBatch(db);
      let receiptRef;
      if (editingId) {
        receiptRef = doc(db, 'receipts', editingId);
        batch.update(receiptRef, receiptData);
      } else {
        receiptRef = doc(collection(db, 'receipts'));
        batch.set(receiptRef, { ...receiptData, createdAt: now });
      }

      const ledgerQuery = query(ledgerCollectionRef, where('receiptNo', '==', formData.receiptNo), where('type', '==', 'receipt'));
      const ledgerSnap = await getDocs(ledgerQuery);
      const ledgerData = {
        ...receiptData,
        type: 'receipt',
        amount: receiptAmount,
        receiptId: receiptRef.id,
        entryDate: now
      };
      if (ledgerSnap.empty) {
        const ledgerRef = doc(collection(db, 'accountLedger'));
        batch.set(ledgerRef, ledgerData);
      } else {
        ledgerSnap.docs.forEach(d => batch.update(doc(db, 'accountLedger', d.id), ledgerData));
      }
      await batch.commit();

      const snap = await getDocs(receiptsCollectionRef);
      const fresh = snap.docs.map(d => ({ ...d.data(), id: d.id, amount: parseFloat(d.data().amount) || 0 }))
        .sort((a, b) => (parseInt(b.receiptNo) || 0) - (parseInt(a.receiptNo) || 0));
      setReceipts(fresh);
      setAdjustmentOpen(false);
      resetForm(fresh);
      setError({ message: `Receipt ${editingId ? 'updated' : 'created'} and allocations saved successfully.`, severity: 'success' });
    } catch (err) {
      console.error('Receipt save failed:', err);
      setError(err.message || 'Failed to save receipt and allocations.');
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleEdit = (receipt) => {
    setSelectedCustomer(customers.find(c => c.id === receipt.customerId) || null);
    setEditingId(receipt.id);
    setFormData({
      customerId: receipt.customerId, amount: receipt.amount.toString(), date: receipt.date,
      receiptNo: receipt.receiptNo, paymentMode: receipt.paymentMode || 'Cash', paymentName: receipt.paymentName || '',
      docName: receipt.docName || '', docUrl: receipt.docUrl || '',
      docPublicId: receipt.docPublicId || '', docResourceType: receipt.docResourceType || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'receipts', receiptToDelete.id));
      
      const q = query(ledgerCollectionRef, where('receiptNo', '==', receiptToDelete.receiptNo), where('type', '==', 'receipt'));
      const ledgerSnap = await getDocs(q);
      for (const lDoc of ledgerSnap.docs) {
        await deleteDoc(doc(db, 'accountLedger', lDoc.id));
      }

      const snap = await getDocs(receiptsCollectionRef);
      const fresh = snap.docs.map(d => ({ ...d.data(), id: d.id, amount: parseFloat(d.data().amount) || 0 }))
        .sort((a, b) => (parseInt(b.receiptNo) || 0) - (parseInt(a.receiptNo) || 0));
      
      setReceipts(fresh);
      setDeleteDialogOpen(false);
      if (editingId === receiptToDelete.id) resetForm(fresh);
      setError({ message: 'Receipt deleted successfully!', severity: 'success' });
    } catch (err) {
      setError('Failed to delete receipt.');
    }
  };

  // ─── Build a preview receipt from current form ───
  const buildPreviewReceipt = () => {
    return {
      id: editingId || 'preview',
      receiptNo: formData.receiptNo || 'PREVIEW',
      customerId: formData.customerId,
      customerName: selectedCustomer?.name || '',
      customerPhone: selectedCustomer?.phone || '',
      date: formData.date,
      amount: formData.amount || 0,
      paymentMode: formData.paymentMode,
      paymentName: formData.paymentName,
      docName: formData.docName || '',
      docUrl: formData.docUrl || '',
      docPublicId: formData.docPublicId || '',
      docResourceType: formData.docResourceType || ''
    };
  };

  // ─── CORE PDF GENERATION FUNCTION ───
  const buildPDF = (receipt) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Logo (Top Right)
      try {
        if (logoBase64) {
          doc.addImage(logoBase64, 'JPEG', 160, 10, 35, 15);
        }
      } catch (e) {
        console.warn('Logo failed to render in PDF', e);
      }

      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text('TRAVELWINGS', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('H.O: FF8, First Floor, Parsan Samruthi Mahal, Opp. Fathima College, MADURAI - 18.', pageWidth / 2, 25, { align: 'center' });
      doc.text('B.O: 40, Vinayagar Koil St., Vinayagapuram, Opp. Lakshmi Narasimmar Temple,', pageWidth / 2, 30, { align: 'center' });
      doc.text('RED HILLS, CHENNAI - 600 099.', pageWidth / 2, 34, { align: 'center' });
      doc.text('Email: twlixm2@gmail.com | Phone: 7200266119', pageWidth / 2, 39, { align: 'center' });
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('RECEIPT', pageWidth / 2, 49, { align: 'center' });
      let y = 59;
      const rows = [
        ['Receipt No:', receipt.receiptNo], 
        ['Date:', receipt.date],
        ['Customer Name:', receipt.customerName], 
        ['Amount (₹):', parseFloat(receipt.amount).toFixed(2)],
        ['Payment Mode:', receipt.paymentMode || 'Cash']
      ];
      if (receipt.paymentName) rows.push(['Reference:', receipt.paymentName]);

      doc.setFontSize(11);
      rows.forEach(([label, val]) => {
        doc.setFont('helvetica', 'bold'); doc.text(label, 20, y);
        doc.setFont('helvetica', 'normal'); doc.text(String(val), 60, y);
        y += 8;
      });

      y += 5;
      doc.setFont('helvetica', 'bold'); doc.text('Amount in Words:', 20, y);
      doc.setFont('helvetica', 'normal'); 
      const words = doc.splitTextToSize(numberToWords(parseFloat(receipt.amount)), 120);
      doc.text(words, 60, y);
      y += (words.length * 5);
      
      if (receipt.paymentMode !== 'Cash') {
        y += 5; doc.setFont('helvetica', 'italic'); doc.text(`(${receipt.paymentMode} Subject to Realisation)`, 20, y);
      }

      // Bank Details
      y += 15;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('*(Bank Transfer Subject to Realisation)*', 20, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const bankY = y + 8;
      doc.text('AC No        : 42719516722', 20, bankY);
      doc.text('AC Name      : Travel wings', 20, bankY + 5);
      doc.text('Bank         : SBI Bank', 20, bankY + 10);
      doc.text('Branch       : Andalpuram', 20, bankY + 15);
      doc.text('City         : Madurai', 20, bankY + 20);
      doc.text('IFS Code     : SBIN 0018158', 20, bankY + 25);
      doc.text('GPAY No      : 7200266119', 20, bankY + 30);

      // QR Code
      doc.setFont('helvetica', 'bold');
      doc.text('Scan to pay via UPI', 90, bankY);
      try {
        if (qrBase64) doc.addImage(qrBase64, 'JPEG', 90, bankY + 5, 30, 30);
      } catch (e) { console.warn('QR failed', e); }

      // Signature
      doc.setFont('helvetica', 'normal');
      doc.text('For "TRAVELWINGS"', 150, bankY);
      try {
         if (signatureBase64) doc.addImage(signatureBase64, 'PNG', 145, bankY + 5, 35, 15);
      } catch (e) { console.warn('Signature failed', e); }
      doc.text('Authorised Signatory', 150, bankY + 25);

      return doc;
    } catch (err) {
      console.error(err);
      setError({ message: 'Failed to generate PDF.', severity: 'error' });
      return null;
    }
  };

  const generatePDF = (receipt) => {
    setIsExporting(true);
    const doc = buildPDF(receipt);
    if (doc) {
      doc.save(`Receipt_${receipt.receiptNo}.pdf`);
    }
    setIsExporting(false);
  };

  // ─── PRINT LOGIC ───
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${printReceipt?.receiptNo || 'TravelWings'}`,
    onBeforePrint: async () => {
      if (!receiptRef.current) throw new Error('Receipt content is not ready for printing');
    },
    onAfterPrint: () => {
      setIsPrinting(false);
      setPrintReceipt(null);
      if (printTimeoutRef.current) clearTimeout(printTimeoutRef.current);
    },
    onPrintError: (location, error) => {
      console.error(`Print error (${location}):`, error);
      setIsPrinting(false);
      setPrintReceipt(null);
      setError({ message: `Unable to print receipt: ${error.message || 'Please try again.'}`, severity: 'error' });
    },
    pageStyle: `
      @page { size: A4; margin: 10mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body * { visibility: hidden; }
        #printable-receipt, #printable-receipt * { visibility: visible; }
        #printable-receipt { position: absolute; left: 0; top: 0; width: 190mm !important; margin: 0 !important; padding: 0 !important; }
        img { max-width: 100%; }
      }
    `
  });

  const triggerPrint = useCallback((receipt) => {
    if (!receipt) { setError('Invalid receipt data'); return; }
    if (isPrinting) return;

    setPrintReceipt(receipt);
    setIsPrinting(true);

    if (printTimeoutRef.current) clearTimeout(printTimeoutRef.current);
    printTimeoutRef.current = setTimeout(() => {
      setIsPrinting(false);
      setPrintReceipt(null);
    }, 10000);
  }, [isPrinting]);

  useEffect(() => {
    if (!printReceipt || !isPrinting) return;
    const timer = setTimeout(async () => {
      try {
        if (!receiptRef.current) throw new Error('Printable receipt element not found');
        await handlePrint();
      } catch (err) {
        console.error('Print failed:', err);
        setIsPrinting(false);
        setPrintReceipt(null);
        setError({ message: `Print failed: ${err.message || 'Please check browser settings.'}`, severity: 'error' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [printReceipt, isPrinting, handlePrint]);

  const handlePreviewPrint = () => {
    if (!formData.customerId) { setError('Please select a customer first'); return; }
    triggerPrint(buildPreviewReceipt());
  };

  const handlePreviewExport = () => {
    if (!formData.customerId) { setError('Please select a customer first'); return; }
    generatePDF(buildPreviewReceipt());
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

  const addBtnStyle = {
    bgcolor: '#1976d2', color: '#fff', borderRadius: 2, height: 56,
    '&:hover': { bgcolor: '#1565c0' }, flexShrink: 0, textTransform: 'none',
    px: 2, whiteSpace: 'nowrap', minWidth: 'auto'
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
            Receipt Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Manage customer payments, issue receipts and track cash flow.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity={error.severity || 'error'} sx={{ mb: 3 }} onClose={() => setError(null)}>{error.message || error}</Alert>}

      {/* ─── FORM SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <ReceiptIcon fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editingId ? 'Edit Receipt' : 'Create New Receipt'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter payment details to record a new transaction
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Row 1 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="success" /> Select Customer *
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormControl fullWidth sx={inputStyle} required>
                    <Select name="customerId" value={formData.customerId} onChange={handleCustomerChange} displayEmpty disabled={loading}>
                      <MenuItem value="" disabled><em>Select a customer</em></MenuItem>
                      {customers.filter(c => c.isActive !== false || c.id === formData.customerId).map(c => (
                        <MenuItem key={c.id} value={c.id}>{c.name} {c.isActive === false ? '[Inactive]' : ''}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Button variant="contained" onClick={() => setCustomerDialogOpen(true)} sx={addBtnStyle}>
                  + Add
                </Button>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ReceiptIcon fontSize="small" color="primary" /> Receipt No *
              </Typography>
              <TextField name="receiptNo" value={formData.receiptNo} onChange={handleChange} fullWidth sx={inputStyle} disabled={loading || !!editingId} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="warning" /> Date *
              </Typography>
              <TextField name="date" type="date" value={formData.date} onChange={handleChange} fullWidth sx={inputStyle} InputLabelProps={{ shrink: true }} disabled={loading} required />
            </Grid>

            {/* Row 2 */}
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney fontSize="small" color="success" /> Amount (₹) *
              </Typography>
              <TextField name="amount" type="number" value={formData.amount} onChange={handleChange} fullWidth placeholder="0.00" sx={inputStyle} inputProps={{ min: 0.01, step: 0.01 }} disabled={loading} required />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Payment fontSize="small" color="info" /> Payment Mode *
              </Typography>
              <FormControl fullWidth sx={inputStyle} required>
                <Select name="paymentMode" value={formData.paymentMode} onChange={handleChange} disabled={loading}>
                  {['Cash', 'Cheque', 'SBI Bank', 'UPI', 'Credit Card', 'Debit Card'].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {formData.paymentMode !== 'Cash' && (
              <Grid size={{ xs: 12, md: 6, lg: 4 }}>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccountBalance fontSize="small" color="secondary" /> Payment Reference / Cheque No
                </Typography>
                <TextField name="paymentName" value={formData.paymentName} onChange={handleChange} fullWidth placeholder="Enter reference number" sx={inputStyle} disabled={loading} />
              </Grid>
            )}
          </Grid>

          {/* ─── Receipt Attachment Upload ─── */}
          <Box sx={{ mt: 3, p: 2, border: '1px dashed #90caf9', borderRadius: 2, bgcolor: '#f8fbff' }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
              <Box>
                <Typography fontWeight="bold">Receipt Attachment</Typography>
                <Typography variant="caption" color="text.secondary">
                  Upload supporting document or payment proof (PDF, JPG or PNG; maximum 10 MB).
                </Typography>
                {formData.docName && (
                  <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }}>
                    Attached: {formData.docName}
                  </Typography>
                )}
              </Box>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Button component="label" variant="contained"
                  startIcon={isUploadingDocument ? <CircularProgress size={18} color="inherit" /> : <CloudUpload />}
                  disabled={isUploadingDocument || loading || savingReceipt} sx={{ textTransform: 'none' }}>
                  {isUploadingDocument ? 'Uploading...' : formData.docUrl ? 'Replace Attachment' : 'Upload Attachment'}
                  <input hidden type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={handleDocUpload} />
                </Button>
                {formData.docUrl && (
                  <Button variant="outlined" startIcon={<Download />}
                    onClick={() => downloadDocument(formData.docUrl, formData.docName)} sx={{ textTransform: 'none' }}>
                    View / Download
                  </Button>
                )}
                {formData.docUrl && (
                  <Button color="error" variant="text"
                    onClick={() => setFormData(prev => ({ ...prev, docName: '', docUrl: '', docPublicId: '', docResourceType: '' }))}
                    sx={{ textTransform: 'none' }}>
                    Remove
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* ─── Action Buttons ─── */}
          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
            <Button 
              variant="outlined" 
              onClick={() => resetForm()} 
              disabled={loading}
              startIcon={<Clear />}
              sx={{ textTransform: 'none', color: 'text.secondary', borderColor: '#e0e0e0', px: 3 }}
            >
              Clear
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}
            >
              {loading ? 'Saving...' : editingId ? 'Update Receipt' : 'Save Receipt'}
            </Button>
            <Button
              variant="outlined"
              onClick={handlePreviewExport}
              disabled={isExporting || loading}
              startIcon={isExporting ? <CircularProgress size={20} /> : <PictureAsPdfIcon />}
              sx={{ textTransform: 'none', borderColor: '#2e7d32', color: '#2e7d32', px: 4, '&:hover': { borderColor: '#1b5e20', bgcolor: '#e8f5e9' } }}
            >
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
            <Button
              variant="outlined"
              onClick={handlePreviewPrint}
              disabled={isPrinting || loading}
              startIcon={isPrinting ? <CircularProgress size={20} /> : <Print />}
              sx={{ textTransform: 'none', borderColor: '#ed6c02', color: '#ed6c02', px: 4, '&:hover': { borderColor: '#e65100', bgcolor: '#fff3e0' } }}
            >
              {isPrinting ? 'Printing...' : 'Print'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ─── LIST SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} mb={3} flexWrap="wrap">
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}><ReceiptIcon fontSize="large" /></Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">Receipt History</Typography>
              <Typography variant="body2" color="text.secondary">Search by customer name, receipt number or invoice number</Typography>
            </Box>
          </Box>
          <TextField size="small" value={historySearch} onChange={e => setHistorySearch(e.target.value)}
            placeholder="Search customer / receipt / invoice..." sx={{ minWidth: { xs: '100%', sm: 340 } }} />
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Receipt No.</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Mode</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount (₹)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Attachment</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receipts.filter(r => {
                const term = historySearch.trim().toLowerCase();
                if (!term) return true;
                return [r.customerName, r.receiptNo, ...(r.allocations || []).map(a => a.invoiceNumber)]
                  .some(v => String(v || '').toLowerCase().includes(term));
              }).map(r => (
                <TableRow key={r.id} hover>
                  <TableCell><Typography fontWeight="500">{r.receiptNo}</Typography></TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.paymentMode}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{r.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    {r.docUrl ? (
                      <Tooltip title={`View / download ${r.docName || 'attachment'}`}>
                        <IconButton color="primary" size="small" onClick={() => downloadDocument(r.docUrl, r.docName)}>
                          <Download fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : <Typography variant="caption" color="text.secondary">No file</Typography>}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Print Receipt">
                        <IconButton color="warning" onClick={() => triggerPrint(r)} size="small" disabled={isPrinting}>
                          <Print fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Export PDF">
                        <IconButton onClick={() => generatePDF(r)} color="secondary" size="small" disabled={isExporting}>
                          <PictureAsPdfIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit Receipt">
                        <IconButton onClick={() => handleEdit(r)} color="primary" size="small">
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Receipt">
                        <IconButton onClick={() => { setReceiptToDelete(r); setDeleteDialogOpen(true); }} color="error" size="small">
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">No receipts found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ─── Bill-wise Customer Ledger Adjustment ─── */}
      <Dialog open={adjustmentOpen} onClose={() => !savingReceipt && setAdjustmentOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ bgcolor: '#e65100', color: '#fff', fontWeight: 800 }}>
          Bill-by-Bill Adjustment of Receipt Amount
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Typography fontWeight="bold" color="secondary.main">Account: {selectedCustomer?.name || '-'}</Typography>
            <Typography fontWeight="bold" color="secondary.main">Receipt Amount: ₹{receiptAmount.toFixed(2)}</Typography>
          </Box>
          <TextField fullWidth size="small" label="Search invoice number" value={adjustmentSearch}
            onChange={e => setAdjustmentSearch(e.target.value)} sx={{ mb: 2 }} />
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 430 }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow sx={{ '& th': { bgcolor: '#f4f5f7', fontWeight: 800 } }}>
                <TableCell width="5%">S No.</TableCell><TableCell>Invoice / Ref.</TableCell><TableCell>Date</TableCell>
                <TableCell align="right">Bill Amount (₹)</TableCell><TableCell align="right">Previous Credit (₹)</TableCell>
                <TableCell align="right">Outstanding (₹)</TableCell><TableCell width="16%">Adjust Amount (₹)</TableCell>
                <TableCell width="16%">Adjustment Date</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {adjustmentInvoices.filter(inv => String(inv.invoiceNumber).toLowerCase().includes(adjustmentSearch.toLowerCase())).map((inv, idx) => (
                  <TableRow key={inv.id} hover>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell><Typography fontWeight={700}>{inv.invoiceNumber}</Typography><Typography variant="caption" color="text.secondary">{inv.id}</Typography></TableCell>
                    <TableCell>{inv.date || '-'}</TableCell>
                    <TableCell align="right">{inv.total.toFixed(2)}</TableCell>
                    <TableCell align="right">{inv.paid.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>{inv.outstanding.toFixed(2)}</TableCell>
                    <TableCell><TextField size="small" type="number" fullWidth value={adjustmentRows[inv.id]?.amount || ''}
                      inputProps={{ min: 0, max: inv.outstanding, step: '0.01' }} onChange={e => changeAllocation(inv.id, 'amount', e.target.value)} /></TableCell>
                    <TableCell><TextField size="small" type="date" fullWidth value={adjustmentRows[inv.id]?.date || formData.date}
                      onChange={e => changeAllocation(inv.id, 'date', e.target.value)} InputLabelProps={{ shrink: true }} /></TableCell>
                  </TableRow>
                ))}
                {adjustmentInvoices.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>No open invoices found for this customer. You can still save the receipt as unallocated credit.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12, md: 4 }}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="caption">Receipt Amount</Typography><Typography variant="h6" fontWeight={800}>₹{receiptAmount.toFixed(2)}</Typography></Paper></Grid>
            <Grid size={{ xs: 12, md: 4 }}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="caption">Total Allocated (Credit)</Typography><Typography variant="h6" color="success.main" fontWeight={800}>₹{allocationTotal.toFixed(2)}</Typography></Paper></Grid>
            <Grid size={{ xs: 12, md: 4 }}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="caption">Unallocated Amount</Typography><Typography variant="h6" color={remainingReceipt > 0.009 ? 'warning.main' : 'success.main'} fontWeight={800}>₹{remainingReceipt.toFixed(2)}</Typography></Paper></Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2 }}>
            Enter the credit amount against each invoice. The adjustment date is stored with each allocation. The receipt is recorded once in Customer Ledger; allocations are saved as bill-wise details and are not added as duplicate credits.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAdjustmentOpen(false)} disabled={savingReceipt}>Back to Receipt</Button>
          <Button variant="contained" onClick={confirmSaveReceipt} disabled={savingReceipt || allocationTotal - receiptAmount > 0.009}
            startIcon={savingReceipt ? <CircularProgress size={18} color="inherit" /> : <Add />}>
            {savingReceipt ? 'Saving...' : 'Confirm & Save Receipt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Dialogs ─── */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Receipt?</DialogTitle>
        <DialogContent>
          <Typography>This will also remove the entry from the Account Ledger. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={customerDialogOpen} onClose={() => setCustomerDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Customer</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Name *" value={newCustomer.name}
            onChange={(e) => setNewCustomer(p => ({ ...p, name: e.target.value }))}
            sx={{ mt: 1 }} autoFocus
          />
          <TextField
            fullWidth label="Phone" value={newCustomer.phone}
            onChange={(e) => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth label="Email" value={newCustomer.email}
            onChange={(e) => setNewCustomer(p => ({ ...p, email: e.target.value }))}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCustomerDialogOpen(false); setNewCustomer({ name: '', phone: '', email: '' }); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveNewCustomer}
            disabled={!newCustomer.name.trim()}
            sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}
          >
            Save Customer
          </Button>
        </DialogActions>
      </Dialog>

      <PrintableReceipt ref={receiptRef} receipt={printReceipt} key={printReceipt?.id || 'default'} />
    </Box>
  );
};

export default Receipt;