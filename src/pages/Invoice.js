// src/pages/Invoice.js — Cloudinary Invoice Document Upload
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { addDoc, collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadInvoice } from '../cloudinaryUpload';
import { useReactToPrint } from 'react-to-print';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  TextField, Button, Typography, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Select,
  MenuItem, FormControl, Grid, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Chip, Avatar, Divider, Tooltip
} from '@mui/material';
import {
  Print, PictureAsPdf, Edit, Delete, PersonAdd, Person, Add,
  Receipt, CalendarToday, Flight, AttachMoney, Business, Group, Clear,
  Search as SearchIcon, CloudUpload, Download // Changed Description to Download
} from '@mui/icons-material';

// ──────────────────────────── Helpers ────────────────────────────
const SERVICE_TYPES = ['Flight', 'Train', 'Bus', 'Hotel', 'Package', 'VISA', 'Passport', 'Other'];

const emptyItem = () => ({
  serviceType: 'Flight',
  description: '',
  ticketNumber: '',
  sellingAmount: '',
  providerCost: ''
});

const getDisplayItems = (inv) => {
  if (!inv) return [];
  if (Array.isArray(inv.items) && inv.items.length > 0) return inv.items;
  if (inv.ticketType || inv.ticketPrice != null || inv.airlinePayable != null) {
    return [{
      serviceType: inv.ticketType || '',
      description: '',
      ticketNumber: inv.ticketNumber || '',
      sellingAmount: parseFloat(inv.ticketPrice) || 0,
      providerCost: parseFloat(inv.airlinePayable) || 0
    }];
  }
  return [];
};

const fmtINR = (n) =>
  (parseFloat(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function numberToWords(num) {
  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const double = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const amount = parseFloat(num) || 0;
  let rupees = Math.floor(amount);
  let paise = Math.round((amount - rupees) * 100);

  const toHundreds = (n) => {
    if (n === 0) return '';
    if (n < 10) return single[n];
    if (n < 20) return double[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const rem = n % 10;
      return tens[ten] + (rem ? ' ' + single[rem] : '');
    }
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return single[h] + ' Hundred' + (rem ? ' and ' + toHundreds(rem) : '');
  };

  let words = '';
  if (rupees === 0) {
    words = 'Zero';
  } else {
    const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
    const lakh = Math.floor(rupees / 100000); rupees %= 100000;
    const thousand = Math.floor(rupees / 1000); rupees %= 1000;
    const hundred = Math.floor(rupees / 100);
    const remainder = rupees % 100;

    if (crore > 0) words += toHundreds(crore) + ' Crore ';
    if (lakh > 0) words += toHundreds(lakh) + ' Lakh ';
    if (thousand > 0) words += toHundreds(thousand) + ' Thousand ';
    if (hundred > 0) words += toHundreds(hundred) + ' Hundred ';
    if (remainder > 0) words += toHundreds(remainder);
  }

  let paiseWords = '';
  if (paise > 0) paiseWords = ' and ' + toHundreds(paise) + ' Paise';
  return words.trim() + ' Rupees' + paiseWords + ' Only';
}

// ──────────────────────────── Printable invoice ────────────────────────────
const PrintableInvoice = React.forwardRef(({ invoice }, ref) => {
  if (!invoice) return null;
  const items = getDisplayItems(invoice);

  return (
    <div
      id="printable-invoice"
      ref={ref}
      style={{
        padding: '20px', fontFamily: 'Arial', width: '190mm',
        boxSizing: 'border-box', margin: '0 auto', backgroundColor: 'white', color: '#000'
      }}
    >
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
        <h3 style={{ margin: '5px 0' }}>INVOICE</h3>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px 10px', fontWeight: 'bold', width: '150px' }}>Invoice No:</td>
            <td style={{ padding: '8px 10px' }}>{invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>Date:</td>
            <td style={{ padding: '8px 10px' }}>{invoice.date}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ margin: '15px 0' }}>
        <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Customer Name:</p>
        <p style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{invoice.customerName}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0', border: '1px solid #ddd' }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Description</th>
            <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const label = it.description
              ? `${it.serviceType} — ${it.description}`
              : (it.serviceType || 'Service');
            return (
              <tr key={i}>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                  {label}
                  {it.ticketNumber ? <span style={{ color: '#888' }}> (Ticket: {it.ticketNumber})</span> : null}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>
                  {fmtINR(it.sellingAmount)}
                </td>
              </tr>
            );
          })}
          {invoice.additionalItems?.map((item, i) => (
            <tr key={`add-${i}`}>
              <td style={{ padding: '10px', border: '1px solid #ddd' }}>{item.description}</td>
              <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>
                {fmtINR(item.amount)}
              </td>
            </tr>
          ))}
          {parseFloat(invoice.handlingCharge || 0) > 0 && (
            <tr>
              <td style={{ padding: '10px', border: '1px solid #ddd' }}>Handling Charge</td>
              <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>
                {fmtINR(invoice.handlingCharge)}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Total:</td>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>
              ₹{fmtINR(invoice.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ margin: '20px 0' }}>
        <p><strong>Amount in Words:</strong> {numberToWords(invoice.totalAmount)}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '30px' }}>
        
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
              <tr><td style={{ padding: '2px 8px 2px 0' }}><strong>GPAY No</strong></td><td style={{ padding: '2px 0' }}>: 72 00266119</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <p style={{ fontSize: '12px', marginBottom: '8px' }}><strong>Scan to pay via UPI</strong></p>
          <img src="/QR.jpeg" alt="UPI QR" style={{ width: '100px', height: '100px', border: '1px solid #ccc', padding: '5px', borderRadius: '8px' }} />
        </div>
        
        <div style={{ textAlign: 'right', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <p style={{ margin: 0 }}>For "TRAVELWINGS"</p>
          <img src="/signature.png" alt="Signature" style={{ height: '60px', objectFit: 'contain', margin: '10px 0' }} />
          <p style={{ margin: 0 }}>Authorised Signatory</p>
        </div>
      </div>
    </div>
  );
});

// ──────────────────────────── Main component ────────────────────────────
const Invoice = () => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [staffMembers, setStaffMembers] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  const [formData, setFormData] = useState({
    customerId: '',
    staffId: '',
    supplierId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    handlingCharge: '',
    airlineName: '',
    passengers: [],
    additionalItems: [],
    docData: '', // Legacy Base64 attachment support
    docName: '',
    docUrl: '',
    docPublicId: '',
    docResourceType: ''
  });

  const [items, setItems] = useState([emptyItem()]);
  const [itemForm, setItemForm] = useState({ description: '', amount: '' });
  const [passengerForm, setPassengerForm] = useState({ name: '' });

  const [invoices, setInvoices] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [error, setError] = useState(null);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPassengerForm, setShowPassengerForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);

  // Base64 states for PDF generation
  const [logoBase64, setLogoBase64] = useState(null);
  const [qrBase64, setQrBase64] = useState(null);
  const [signatureBase64, setSignatureBase64] = useState(null);

  // ── Quick-add Customer / Supplier dialogs ──
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', supplierType: '', phone: '' });

  // ── Search ──
  const [searchTerm, setSearchTerm] = useState('');

  const invoiceRef = useRef();
  const formRef = useRef();
  const printTimeoutRef = useRef(null);

  const customersCollectionRef = collection(db, 'customers');
  const staffCollectionRef = collection(db, 'staff');
  const suppliersCollectionRef = collection(db, 'suppliers');
  const invoicesCollectionRef = collection(db, 'invoices');

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

  const generateInvoiceNumber = async () => {
    const year = new Date().getFullYear();
    const counterRef = doc(db, 'counters', `invoices_${year}`);
    try {
      const nextCount = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let next = 1;
        if (counterDoc.exists()) {
          next = counterDoc.data().current + 1;
          transaction.update(counterRef, { current: next });
        } else {
          transaction.set(counterRef, { current: 1 });
        }
        return next;
      });
      return `TM-${year}-${nextCount.toString().padStart(4, '0')}`;
    } catch (err) {
      console.error('Counter error:', err);
      return `TM-${year}-${Date.now()}`;
    }
  };

  const totals = useMemo(() => {
    const itemsSellingTotal = items.reduce((s, i) => s + (parseFloat(i.sellingAmount) || 0), 0);
    const itemsProviderTotal = items.reduce((s, i) => s + (parseFloat(i.providerCost) || 0), 0);
    const additionalTotal = formData.additionalItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const handling = parseFloat(formData.handlingCharge) || 0;
    const invoiceTotal = itemsSellingTotal + handling + additionalTotal;
    return { itemsSellingTotal, itemsProviderTotal, additionalTotal, handling, invoiceTotal };
  }, [items, formData.additionalItems, formData.handlingCharge]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [cust, staff, supp, inv] = await Promise.all([
          getDocs(customersCollectionRef),
          getDocs(staffCollectionRef),
          getDocs(suppliersCollectionRef),
          getDocs(query(invoicesCollectionRef, orderBy('invoiceNumber', 'desc')))
        ]);
        setCustomers(cust.docs.map(d => ({ ...d.data(), id: d.id })));
        setStaffMembers(staff.docs.map(d => ({ ...d.data(), id: d.id })));
        setSuppliers(supp.docs.map(d => ({ ...d.data(), id: d.id })));
        setInvoices(inv.docs.map(d => ({ ...d.data(), id: d.id })));
        setNextInvoiceNumber(await generateInvoiceNumber());
      } catch (err) {
        setError('Failed to load data. Please try again.');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const activeCustomers = customers.filter(c => c.isActive !== false || c.id === formData.customerId);
  const activeSuppliers = suppliers.filter(s => s.isActive !== false || s.id === formData.supplierId);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.trim().toLowerCase();
    return invoices.filter(inv =>
      (inv.customerName || '').toLowerCase().includes(term) ||
      (inv.invoiceNumber || '').toLowerCase().includes(term)
    );
  }, [invoices, searchTerm]);

  const handleCustomerChange = (e) => {
    const customerId = e.target.value;
    setSelectedCustomer(customers.find(c => c.id === customerId) || null);
    setFormData({ ...formData, customerId });
  };
  const handleStaffChange = (e) => {
    const staffId = e.target.value;
    setSelectedStaff(staffMembers.find(s => s.id === staffId) || null);
    setFormData({ ...formData, staffId });
  };
  const handleSupplierChange = (e) => {
    const supplierId = e.target.value;
    const supplier = suppliers.find(s => s.id === supplierId);
    setFormData(prev => ({
      ...prev,
      supplierId,
      airlineName: supplier?.name || prev.airlineName
    }));
  };
  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handlePassengerChange = (e) => {
    const { name, value } = e.target;
    setPassengerForm(prev => ({ ...prev, [name]: value }));
  };
  const handleItemFormChange = (e) => {
    const { name, value } = e.target;
    setItemForm(prev => ({ ...prev, [name]: value }));
  };

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  };
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => {
    setItems(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const addAdditionalItem = () => {
    if (!itemForm.description.trim() || !itemForm.amount) {
      setError('Item description and amount are required');
      return;
    }
    if (parseFloat(itemForm.amount) < 0) {
      setError('Item amount cannot be negative');
      return;
    }
    setFormData(prev => ({
      ...prev,
      additionalItems: [...prev.additionalItems, {
        description: itemForm.description.trim(),
        amount: parseFloat(itemForm.amount) || 0
      }]
    }));
    setItemForm({ description: '', amount: '' });
    setShowItemForm(false);
  };
  const removeAdditionalItem = (idx) => {
    setFormData(prev => ({
      ...prev,
      additionalItems: prev.additionalItems.filter((_, i) => i !== idx)
    }));
  };

  const addPassenger = () => {
    if (!passengerForm.name.trim()) {
      setError('Passenger name is required');
      return;
    }
    setFormData(prev => ({
      ...prev,
      passengers: [...prev.passengers, { name: passengerForm.name.trim() }]
    }));
    setPassengerForm({ name: '' });
    setShowPassengerForm(false);
  };
  const removePassenger = (idx) => {
    setFormData(prev => ({
      ...prev,
      passengers: prev.passengers.filter((_, i) => i !== idx)
    }));
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

  // ── Quick-add Supplier ──
  const handleSaveNewSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    try {
      const docRef = await addDoc(suppliersCollectionRef, {
        name: newSupplier.name.trim(),
        supplierType: newSupplier.supplierType.trim(),
        phone: newSupplier.phone.trim(),
        isActive: true,
        createdAt: new Date().toISOString()
      });
      const created = {
        id: docRef.id,
        name: newSupplier.name.trim(),
        supplierType: newSupplier.supplierType.trim(),
        phone: newSupplier.phone.trim(),
        isActive: true
      };
      setSuppliers(prev => [...prev, created]);
      setFormData(prev => ({
        ...prev,
        supplierId: docRef.id,
        airlineName: created.name
      }));
      setNewSupplier({ name: '', supplierType: '', phone: '' });
      setSupplierDialogOpen(false);
      setError({ message: 'Supplier added successfully!', severity: 'success' });
    } catch (err) {
      console.error('Add supplier failed:', err);
      setError('Failed to add supplier. Please try again.');
    }
  };

  // ── Cloudinary document upload ──
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF, JPG and PNG files are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10 MB. Please choose a smaller file.');
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
        docData: '',
        docName: file.name,
        docUrl: result.secure_url,
        docPublicId: result.public_id,
        docResourceType: result.resource_type || (file.type === 'application/pdf' ? 'raw' : 'image')
      }));
      setError({ message: 'Document uploaded to Cloudinary successfully!', severity: 'success' });
    } catch (err) {
      console.error('Cloudinary upload failed:', err);
      setError(err.message || 'Failed to upload document to Cloudinary.');
    } finally {
      setIsUploadingDocument(false);
      e.target.value = '';
    }
  };

  // ── Download/open invoice attachment ──
  const downloadDocument = (docUrl, docName, legacyDocData) => {
    if (docUrl) {
      const link = document.createElement('a');
      link.href = docUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = docName || 'Invoice-Document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Support older invoices that still contain Base64 attachments.
    if (legacyDocData) {
      const link = document.createElement('a');
      link.href = legacyDocData;
      link.download = docName || 'Invoice-Document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const resetForm = async () => {
    setFormData({
      customerId: '', staffId: '', supplierId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      handlingCharge: '', airlineName: '', passengers: [], additionalItems: [],
      docData: '', docName: '', docUrl: '', docPublicId: '', docResourceType: ''
    });
    setItems([emptyItem()]);
    setItemForm({ description: '', amount: '' });
    setPassengerForm({ name: '' });
    setSelectedCustomer(null);
    setSelectedStaff(null);
    setEditing(false);
    setCurrentInvoice(null);
    setShowPassengerForm(false);
    setShowItemForm(false);
    setError(null);

    const nextNum = await generateInvoiceNumber();
    setNextInvoiceNumber(nextNum);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!formData.customerId) {
      setError('Please select a customer');
      return;
    }

    const cleanItems = items
      .map(it => ({
        serviceType: (it.serviceType || '').trim() || 'Flight',
        description: (it.description || '').trim(),
        ticketNumber: (it.ticketNumber || '').trim(),
        sellingAmount: Math.max(0, parseFloat(it.sellingAmount) || 0),
        providerCost: Math.max(0, parseFloat(it.providerCost) || 0)
      }))
      .filter(it => it.sellingAmount > 0 || it.providerCost > 0 || it.ticketNumber || it.description);

    if (cleanItems.length === 0) {
      setError('Add at least one service item with a selling amount');
      return;
    }

    const itemsSellingTotal = cleanItems.reduce((s, i) => s + i.sellingAmount, 0);
    const itemsProviderTotal = cleanItems.reduce((s, i) => s + i.providerCost, 0);
    const additionalTotal = formData.additionalItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const handling = parseFloat(formData.handlingCharge) || 0;
    const invoiceTotal = itemsSellingTotal + handling + additionalTotal;

    setLoading(true);
    try {
      const nowISO = new Date().toISOString();
      const invoiceData = {
        customerId: formData.customerId,
        customerName: selectedCustomer?.name || '',
        customerPhone: selectedCustomer?.phone || '',
        staffId: formData.staffId || '',
        staffName: selectedStaff?.name || '',
        supplierId: formData.supplierId || '',
        airlineName: formData.airlineName || '',
        date: formData.date,
        invoiceNumber: editing ? currentInvoice.invoiceNumber : nextInvoiceNumber,
        handlingCharge: handling,
        additionalItems: formData.additionalItems,
        passengers: formData.passengers,
        items: cleanItems,
        ticketType: cleanItems.length === 1 ? cleanItems[0].serviceType : 'Multiple',
        ticketNumber: cleanItems.length === 1 ? cleanItems[0].ticketNumber : '',
        ticketPrice: Number(itemsSellingTotal.toFixed(2)),
        airlinePayable: Number(itemsProviderTotal.toFixed(2)),
        ticketCount: cleanItems.length,
        totalAmount: Number(invoiceTotal.toFixed(2)),
        status: editing ? (currentInvoice.status || 'active') : 'active',
        createdAt: editing ? (currentInvoice.createdAt || nowISO) : nowISO,
        updatedAt: nowISO,
        // Keep legacy Base64 data for existing attachments; new uploads use Cloudinary.
        docData: formData.docData || '',
        docName: formData.docName || '',
        docUrl: formData.docUrl || '',
        docPublicId: formData.docPublicId || '',
        docResourceType: formData.docResourceType || ''
      };

      if (editing && currentInvoice) {
        await updateDoc(doc(db, 'invoices', currentInvoice.id), invoiceData);
        setError({ message: 'Invoice updated successfully!', severity: 'success' });
      } else {
        await addDoc(invoicesCollectionRef, invoiceData);
        setError({ message: 'Invoice added successfully!', severity: 'success' });
      }

      const snap = await getDocs(query(invoicesCollectionRef, orderBy('invoiceNumber', 'desc')));
      setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      await resetForm();
    } catch (err) {
      console.error('Error saving invoice:', err);
      setError(`Failed to ${editing ? 'update' : 'save'} invoice. File might be too large.`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (inv) => {
    setSelectedCustomer(customers.find(c => c.id === inv.customerId) || null);
    setSelectedStaff(staffMembers.find(s => s.id === inv.staffId) || null);

    setFormData({
      customerId: inv.customerId || '',
      staffId: inv.staffId || '',
      supplierId: inv.supplierId || '',
      date: inv.date || format(new Date(), 'yyyy-MM-dd'),
      handlingCharge: inv.handlingCharge != null ? String(inv.handlingCharge) : '',
      airlineName: inv.airlineName || '',
      passengers: Array.isArray(inv.passengers) ? inv.passengers : [],
      additionalItems: Array.isArray(inv.additionalItems) ? inv.additionalItems : [],
      docData: inv.docData || '',
      docName: inv.docName || '',
      docUrl: inv.docUrl || '',
      docPublicId: inv.docPublicId || '',
      docResourceType: inv.docResourceType || ''
    });

    if (Array.isArray(inv.items) && inv.items.length > 0) {
      setItems(inv.items.map(i => ({
        serviceType: i.serviceType || 'Flight',
        description: i.description || '',
        ticketNumber: i.ticketNumber || '',
        sellingAmount: i.sellingAmount != null ? String(i.sellingAmount) : '',
        providerCost: i.providerCost != null ? String(i.providerCost) : ''
      })));
    } else {
      setItems([{
        serviceType: inv.ticketType || 'Flight',
        description: '',
        ticketNumber: inv.ticketNumber || '',
        sellingAmount: inv.ticketPrice != null ? String(inv.ticketPrice) : '',
        providerCost: inv.airlinePayable != null ? String(inv.airlinePayable) : ''
      }]);
    }

    setEditing(true);
    setCurrentInvoice(inv);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (inv) => {
    setCurrentInvoice(inv);
    setDeleteDialogOpen(true);
  };
  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'invoices', currentInvoice.id));
      const snap = await getDocs(query(invoicesCollectionRef, orderBy('invoiceNumber', 'desc')));
      setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      setError({ message: 'Invoice deleted successfully!', severity: 'success' });
    } catch (err) {
      console.error('Error deleting invoice:', err);
      setError('Failed to delete invoice. Please try again.');
    } finally {
      setDeleteDialogOpen(false);
      setCurrentInvoice(null);
    }
  };

  const buildPreviewInvoice = () => {
    const cleanItems = items
      .map(it => ({
        serviceType: (it.serviceType || '').trim() || 'Flight',
        description: (it.description || '').trim(),
        ticketNumber: (it.ticketNumber || '').trim(),
        sellingAmount: Math.max(0, parseFloat(it.sellingAmount) || 0),
        providerCost: Math.max(0, parseFloat(it.providerCost) || 0)
      }))
      .filter(it => it.sellingAmount > 0 || it.providerCost > 0 || it.ticketNumber || it.description);

    const itemsSellingTotal = cleanItems.reduce((s, i) => s + i.sellingAmount, 0);
    const additionalTotal = formData.additionalItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const handling = parseFloat(formData.handlingCharge) || 0;
    const invoiceTotal = itemsSellingTotal + handling + additionalTotal;

    return {
      id: editing ? currentInvoice?.id : 'preview',
      invoiceNumber: editing ? currentInvoice?.invoiceNumber : (nextInvoiceNumber || 'PREVIEW'),
      customerId: formData.customerId,
      customerName: selectedCustomer?.name || '',
      customerPhone: selectedCustomer?.phone || '',
      staffId: formData.staffId || '',
      staffName: selectedStaff?.name || '',
      supplierId: formData.supplierId || '',
      airlineName: formData.airlineName || '',
      date: formData.date,
      handlingCharge: handling,
      additionalItems: formData.additionalItems,
      passengers: formData.passengers,
      items: cleanItems,
      ticketType: cleanItems.length === 1 ? cleanItems[0].serviceType : 'Multiple',
      ticketNumber: cleanItems.length === 1 ? cleanItems[0].ticketNumber : '',
      ticketPrice: itemsSellingTotal,
      airlinePayable: 0,
      ticketCount: cleanItems.length,
      totalAmount: invoiceTotal
    };
  };

  const generatePDF = (inv) => {
    if (!inv?.id) { setError('Invalid invoice data'); return null; }
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      try {
        if (logoBase64) pdf.addImage(logoBase64, 'JPEG', 160, 10, 35, 15);
      } catch (e) { console.warn('Logo failed', e); }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(40);
      pdf.text('TRAVELWINGS', 105, 20, { align: 'center' });
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text('H.O: FF8, First Floor, Parsan Samruthi Mahal, Opp. Fathima College, MADURAI - 18.', 105, 25, { align: 'center' });
      pdf.text('B.O: 40, Vinayagar Koil St., Vinayagapuram, Opp. Lakshmi Narasimmar Temple,', 105, 30, { align: 'center' });
      pdf.text('RED HILLS, CHENNAI - 600 099.', 105, 34, { align: 'center' });
      pdf.text('Email: twlixm2@gmail.com | Phone: 7200266119', 105, 39, { align: 'center' });

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INVOICE', 105, 49, { align: 'center' });

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Invoice No: ${inv.invoiceNumber}`, 20, 59);
      pdf.text(`Date: ${inv.date}`, 20, 64);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Customer Name:', 20, 74);
      pdf.setFont('helvetica', 'normal');
      pdf.text(inv.customerName || '', 20, 80);

      let currentY = 85;
      if (inv.customerPhone) {
        pdf.setFontSize(10);
        pdf.text(`Phone: ${inv.customerPhone}`, 20, currentY);
        currentY += 5;
        pdf.setFontSize(12);
      }

      const displayItems = getDisplayItems(inv);
      const tableData = [];
      displayItems.forEach(it => {
        const label = it.description
          ? `${it.serviceType} — ${it.description}${it.ticketNumber ? ` (${it.ticketNumber})` : ''}`
          : `${it.serviceType}${it.ticketNumber ? ` (${it.ticketNumber})` : ''}`;
        tableData.push([label, parseFloat(it.sellingAmount || 0).toFixed(2)]);
      });
      (inv.additionalItems || []).forEach(it => {
        tableData.push([it.description, parseFloat(it.amount || 0).toFixed(2)]);
      });
      if (parseFloat(inv.handlingCharge || 0) > 0) {
        tableData.push(['Handling Charge', parseFloat(inv.handlingCharge).toFixed(2)]);
      }
      tableData.push(['Total', parseFloat(inv.totalAmount || 0).toFixed(2)]);

      const startY = currentY + 10;
      pdf.autoTable({
        startY: startY,
        head: [['Description', 'Amount (₹)']],
        body: tableData,
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 15 }
      });

      const finalY = pdf.lastAutoTable.finalY + 15;

      pdf.setFont('helvetica', 'normal');
      pdf.text(`Amount in Words: ${numberToWords(inv.totalAmount)}`, 20, finalY);

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.text('*(Bank Transfer Subject to Realisation)*', 20, finalY + 10);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const bankY = finalY + 18;
      pdf.text('AC No        : 42719516722', 20, bankY);
      pdf.text('AC Name      : Travel wings', 20, bankY + 5);
      pdf.text('Bank         : SBI Bank', 20, bankY + 10);
      pdf.text('Branch       : Andalpuram', 20, bankY + 15);
      pdf.text('City         : Madurai', 20, bankY + 20);
      pdf.text('IFS Code     : SBIN 0018158', 20, bankY + 25);
      pdf.text('GPAY No      : 72 00266119', 20, bankY + 30);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Scan to pay via UPI', 90, bankY);
      try {
        if (qrBase64) pdf.addImage(qrBase64, 'JPEG', 90, bankY + 5, 30, 30);
      } catch (e) { console.warn('QR failed', e); }

      pdf.setFont('helvetica', 'normal');
      pdf.text('For "TRAVELWINGS"', 150, bankY);
      try {
         if (signatureBase64) pdf.addImage(signatureBase64, 'PNG', 145, bankY + 5, 35, 15);
      } catch (e) { console.warn('Signature failed', e); }
      pdf.text('Authorised Signatory', 150, bankY + 25);

      return pdf;
    } catch (err) {
      console.error('PDF export error:', err);
      setError({ message: `Failed to generate PDF: ${err.message}`, severity: 'error' });
      return null;
    }
  };

  const handleExportPDF = (inv) => {
    setIsExporting(true);
    const pdf = generatePDF(inv);
    if (pdf) {
      pdf.save(`invoice_${inv.invoiceNumber}.pdf`);
    }
    setIsExporting(false);
  };

  const handlePreviewExport = () => {
    if (!formData.customerId) { setError('Please select a customer first'); return; }
    const preview = buildPreviewInvoice();
    if (preview.items.length === 0) { setError('Add at least one service item'); return; }
    handleExportPDF(preview);
  };

  const handlePrint = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: `Invoice_${printInvoice?.invoiceNumber || 'TravelWings'}`,
    onBeforePrint: async () => {
      if (!invoiceRef.current) throw new Error('Invoice content is not ready for printing');
    },
    onAfterPrint: () => {
      setIsPrinting(false);
      setPrintInvoice(null);
      if (printTimeoutRef.current) clearTimeout(printTimeoutRef.current);
    },
    onPrintError: (location, error) => {
      console.error(`Print error (${location}):`, error);
      setIsPrinting(false);
      setPrintInvoice(null);
      setError({ message: `Unable to print invoice: ${error.message || 'Please try again.'}`, severity: 'error' });
    },
    pageStyle: `
      @page { size: A4; margin: 10mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body * { visibility: hidden; }
        #printable-invoice, #printable-invoice * { visibility: visible; }
        #printable-invoice { position: absolute; left: 0; top: 0; width: 190mm !important; margin: 0 !important; padding: 0 !important; }
        img { max-width: 100%; }
      }
    `
  });

  const triggerPrint = useCallback((inv) => {
    if (!inv) { setError('Invalid invoice data'); return; }
    if (isPrinting) return;

    setPrintInvoice(inv);
    setIsPrinting(true);

    if (printTimeoutRef.current) clearTimeout(printTimeoutRef.current);
    printTimeoutRef.current = setTimeout(() => {
      setIsPrinting(false);
      setPrintInvoice(null);
    }, 10000);
  }, [isPrinting]);

  useEffect(() => {
    if (!printInvoice || !isPrinting) return;
    const timer = setTimeout(async () => {
      try {
        if (!invoiceRef.current) throw new Error('Printable invoice element not found');
        await handlePrint();
      } catch (err) {
        console.error('Print failed:', err);
        setIsPrinting(false);
        setPrintInvoice(null);
        setError({ message: `Print failed: ${err.message || 'Please check browser settings.'}`, severity: 'error' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [printInvoice, isPrinting, handlePrint]);

  const handlePreviewPrint = () => {
    if (!formData.customerId) { setError('Please select a customer first'); return; }
    const preview = buildPreviewInvoice();
    if (preview.items.length === 0) { setError('Add at least one service item'); return; }
    triggerPrint(preview);
  };

  const inputStyle = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#fff',
      '& fieldset': { borderColor: '#e0e0e0' },
      '&:hover fieldset': { borderColor: '#1976d2' },
    },
    // Hide the browser's up/down spinner arrows in numeric amount fields.
    '& input[type=number]': {
      MozAppearance: 'textfield',
      '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
        WebkitAppearance: 'none',
        margin: 0
      }
    }
  };

  const addBtnStyle = {
    bgcolor: '#1976d2', color: '#fff', borderRadius: 2, height: 56,
    '&:hover': { bgcolor: '#1565c0' }, flexShrink: 0, textTransform: 'none',
    px: 2, whiteSpace: 'nowrap', minWidth: 'auto'
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto', pb: 4 }}>
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
            Invoice Management
          </Typography>
          <Typography variant="subtitle1" color="#424242" fontWeight="500">
            Create, edit and manage agency invoices and multi-item bookings.
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity={error.severity || 'error'} sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error.message || error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ p: 4, mb: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#1976d2', width: 56, height: 56 }}>
              <Receipt fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                {editing ? `Edit Invoice #${currentInvoice?.invoiceNumber}` : 'Create New Invoice'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter invoice details, select items, and calculate totals
              </Typography>
            </Box>
          </Box>
          {!editing && nextInvoiceNumber && (
            <Button variant="contained" disableElevation sx={{ bgcolor: '#e3f2fd', color: '#1976d2', '&:hover': { bgcolor: '#bbdefb' }, textTransform: 'none' }}>
              Next No: {nextInvoiceNumber}
            </Button>
          )}
        </Box>

        <Box component="form" onSubmit={handleSubmit} ref={formRef}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="primary" /> Select Customer *
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormControl fullWidth sx={inputStyle} required>
                    <Select name="customerId" value={formData.customerId} onChange={handleCustomerChange} displayEmpty>
                      <MenuItem value="" disabled><em>Select a customer</em></MenuItem>
                      {activeCustomers.map(c => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}{c.phone ? ` (${c.phone})` : ''}{c.isActive === false ? ' — Inactive' : ''}
                        </MenuItem>
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
                <Group fontSize="small" color="info" /> Select Staff (Optional)
              </Typography>
              <FormControl fullWidth sx={inputStyle}>
                <Select name="staffId" value={formData.staffId} onChange={handleStaffChange} displayEmpty>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {staffMembers.map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name} ({s.designation || s.role || 'Staff'})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Business fontSize="small" color="warning" /> Supplier (Optional)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormControl fullWidth sx={inputStyle}>
                    <Select name="supplierId" value={formData.supplierId} onChange={handleSupplierChange} displayEmpty>
                      <MenuItem value=""><em>None (free-text)</em></MenuItem>
                      {activeSuppliers.map(s => (
                        <MenuItem key={s.id} value={s.id}>
                          {s.name}{s.supplierType ? ` — ${s.supplierType}` : ''}{s.isActive === false ? ' [Inactive]' : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Button variant="contained" onClick={() => setSupplierDialogOpen(true)} sx={addBtnStyle}>
                  + Add
                </Button>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="success" /> Date *
              </Typography>
              <TextField name="date" type="date" value={formData.date} onChange={handleHeaderChange} fullWidth sx={inputStyle} required InputLabelProps={{ shrink: true }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Flight fontSize="small" color="secondary" /> Airline/Provider Name
              </Typography>
              <TextField name="airlineName" value={formData.airlineName} onChange={handleHeaderChange} fullWidth placeholder="Enter airline or provider name" sx={inputStyle} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney fontSize="small" color="error" /> Handling Charge (₹)
              </Typography>
              <TextField name="handlingCharge" type="number" value={formData.handlingCharge} onChange={handleHeaderChange} fullWidth placeholder="0.00" sx={inputStyle} inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
          </Grid>

          {selectedCustomer && (
            <Box sx={{ mt: 2, p: 2, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" color="primary">Selected Customer Info:</Typography>
              <Typography variant="body2">Phone: {selectedCustomer.phone || 'N/A'} | Email: {selectedCustomer.email || 'N/A'}</Typography>
            </Box>
          )}

          <Divider sx={{ my: 4 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" fontWeight="bold">Service Items ({items.length})</Typography>
            <Button variant="outlined" startIcon={<Add />} onClick={addItem} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary' }}>
              Add Service Item
            </Button>
          </Box>

          {items.map((it, idx) => (
            <Paper key={idx} elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid #e0e0e0', borderLeft: '4px solid #1976d2' }}>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 2 }}>
                  <FormControl fullWidth size="small" sx={inputStyle}>
                    <Select value={it.serviceType} onChange={e => updateItem(idx, 'serviceType', e.target.value)}>
                      {SERVICE_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField label="Description" size="small" fullWidth value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)} sx={inputStyle} />
                </Grid>
                <Grid size={{ xs: 12, md: 2 }}>
                  <TextField label="Ticket / Ref No" size="small" fullWidth value={it.ticketNumber} onChange={e => updateItem(idx, 'ticketNumber', e.target.value)} sx={inputStyle} />
                </Grid>
                <Grid size={{ xs: 6, md: 2 }}>
                  <TextField label="Selling (₹)" size="small" type="number" fullWidth value={it.sellingAmount} inputProps={{ min: 0, step: 0.01 }} onChange={e => updateItem(idx, 'sellingAmount', e.target.value)} sx={inputStyle} />
                </Grid>
                <Grid size={{ xs: 6, md: 2 }}>
                  <TextField label="Supplier Amount (₹)" size="small" type="number" fullWidth value={it.providerCost} inputProps={{ min: 0, step: 0.01 }} onChange={e => updateItem(idx, 'providerCost', e.target.value)} sx={inputStyle} />
                </Grid>
                <Grid size={{ xs: 12, md: 1 }}>
                  <Tooltip title={items.length === 1 ? 'At least one item required' : 'Remove item'}>
                    <span>
                      <IconButton color="error" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                        <Delete />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Grid>
              </Grid>
            </Paper>
          ))}

          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Additional Items / Charges</Typography>
            {formData.additionalItems.length > 0 && (
              <Box sx={{ mb: 2 }}>
                {formData.additionalItems.map((item, idx) => (
                  <Chip key={idx} label={`${item.description} — ₹${fmtINR(item.amount)}`} onDelete={() => removeAdditionalItem(idx)} sx={{ mr: 1, mb: 1, bgcolor: '#e3f2fd', color: '#1976d2' }} />
                ))}
              </Box>
            )}
            {showItemForm ? (
              <Box sx={{ p: 2, border: '1px dashed #1976d2', borderRadius: 2, mb: 2, bgcolor: '#f8fafc' }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 8 }}>
                    <TextField label="Item Description" name="description" value={itemForm.description} onChange={handleItemFormChange} fullWidth sx={inputStyle} required />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField label="Amount (₹)" name="amount" type="number" value={itemForm.amount} onChange={handleItemFormChange} fullWidth sx={inputStyle} required inputProps={{ min: 0, step: 0.01 }} />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button variant="outlined" onClick={() => { setShowItemForm(false); setItemForm({ description: '', amount: '' }); }}>Cancel</Button>
                  <Button variant="contained" onClick={addAdditionalItem} sx={{ bgcolor: '#1976d2' }}>Add Item</Button>
                </Box>
              </Box>
            ) : (
              <Button variant="outlined" startIcon={<Add />} onClick={() => setShowItemForm(true)} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary' }}>
                Add Additional Item
              </Button>
            )}
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Passenger Details</Typography>
            {formData.passengers.length > 0 && (
              <Box sx={{ mb: 2 }}>
                {formData.passengers.map((p, idx) => (
                  <Chip key={idx} avatar={<Avatar sx={{ bgcolor: '#1976d2' }}><Person /></Avatar>} label={p.name} onDelete={() => removePassenger(idx)} sx={{ mr: 1, mb: 1 }} />
                ))}
              </Box>
            )}
            {showPassengerForm ? (
              <Box sx={{ p: 2, border: '1px dashed #1976d2', borderRadius: 2, mb: 2, bgcolor: '#f8fafc' }}>
                <TextField label="Passenger Name" name="name" value={passengerForm.name} onChange={handlePassengerChange} fullWidth sx={inputStyle} required />
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button variant="outlined" onClick={() => { setShowPassengerForm(false); setPassengerForm({ name: '' }); }}>Cancel</Button>
                  <Button variant="contained" onClick={addPassenger} sx={{ bgcolor: '#1976d2' }}>Add Passenger</Button>
                </Box>
              </Box>
            ) : (
              <Button variant="outlined" startIcon={<PersonAdd />} onClick={() => setShowPassengerForm(true)} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary' }}>
                Add Passenger
              </Button>
            )}
          </Box>

          <Paper elevation={0} sx={{ p: 3, mt: 4, backgroundColor: '#f8fafc', borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Items Selling</Typography>
                <Typography variant="subtitle1" fontWeight="bold">₹{fmtINR(totals.itemsSellingTotal)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Additional</Typography>
                <Typography variant="subtitle1" fontWeight="bold">₹{fmtINR(totals.additionalTotal)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Handling</Typography>
                <Typography variant="subtitle1" fontWeight="bold">₹{fmtINR(totals.handling)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="primary" fontWeight="bold">Invoice Total</Typography>
                <Typography variant="h5" fontWeight="900" color="primary">₹{fmtINR(totals.invoiceTotal)}</Typography>
              </Grid>
            </Grid>
          </Paper>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {editing && (
              <Button variant="outlined" onClick={resetForm} disabled={loading} startIcon={<Clear />} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary', px: 3 }}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="contained" size="large" disabled={loading || isUploadingDocument} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />} sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}>
              {loading ? 'Saving...' : (editing ? 'Update Invoice' : 'Save Invoice')}
            </Button>

            <Button
              variant="outlined"
              size="large"
              onClick={handlePreviewExport}
              disabled={isExporting || loading}
              startIcon={isExporting ? <CircularProgress size={20} /> : <PictureAsPdf />}
              sx={{ textTransform: 'none', borderColor: '#2e7d32', color: '#2e7d32', px: 4, '&:hover': { borderColor: '#1b5e20', bgcolor: '#e8f5e9' } }}
            >
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
            {/* FIXED: Document Upload Button using component="label" */}
            <Button 
              variant="outlined" 
              component="label"
              disabled={loading || isUploadingDocument} 
              startIcon={isUploadingDocument ? <CircularProgress size={18} /> : <CloudUpload />} 
              sx={{ textTransform: 'none', borderColor: '#9c27b0', color: '#9c27b0', px: 4, '&:hover': { borderColor: '#7b1fa2', bgcolor: '#f3e5f5' } }}
            >
              {isUploadingDocument ? 'Uploading...' : (formData.docName ? 'Change Document' : 'Upload Document')}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                hidden
                onChange={handleDocUpload}
              />
            </Button>

            <Button
              variant="outlined"
              size="large"
              onClick={handlePreviewPrint}
              disabled={isPrinting || loading}
              startIcon={isPrinting ? <CircularProgress size={20} /> : <Print />}
              sx={{ textTransform: 'none', borderColor: '#ed6c02', color: '#ed6c02', px: 4, '&:hover': { borderColor: '#e65100', bgcolor: '#fff3e0' } }}
            >
              {isPrinting ? 'Printing...' : 'Print'}
            </Button>
          </Box>
          
          {formData.docName && (
            <Box sx={{ mt: 2, textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                Attached: {formData.docName} (Cloudinary, max 10 MB)
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
              <Receipt fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold">Recent Invoices</Typography>
              <Typography variant="body2" color="text.secondary">View and manage all created invoices</Typography>
            </Box>
          </Box>
          <TextField
            size="small"
            placeholder="Search by customer name or invoice #"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
            sx={{ ...inputStyle, minWidth: 320 }}
          />
        </Box>

        {loading && invoices.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Invoice #</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Service</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Items</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="right">Amount (₹)</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredInvoices.length > 0 ? filteredInvoices.map(inv => {
                  const itemCount = (inv.items && inv.items.length) || inv.ticketCount || 1;
                  return (
                    <TableRow key={inv.id} hover>
                      <TableCell><Typography fontWeight="500">{inv.invoiceNumber}</Typography></TableCell>
                      <TableCell>{inv.customerName}</TableCell>
                      <TableCell>{inv.date}</TableCell>
                      <TableCell>{inv.ticketType || '-'}</TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={itemCount} color={itemCount > 1 ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmtINR(inv.totalAmount)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Tooltip title="Edit Invoice">
                            <IconButton color="primary" onClick={() => handleEdit(inv)} size="small">
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Invoice">
                            <IconButton color="error" onClick={() => handleDelete(inv)} size="small">
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Print Invoice">
                            <IconButton color="warning" onClick={() => triggerPrint(inv)} size="small" disabled={isPrinting}>
                              <Print fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Download PDF">
                            <IconButton color="success" onClick={() => handleExportPDF(inv)} size="small" disabled={isExporting}>
                              <PictureAsPdf fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {(inv.docUrl || inv.docData) && (
                            <Tooltip title={`Download Document (${inv.docName || 'File'})`}>
                              <IconButton color="info" onClick={() => downloadDocument(inv.docUrl, inv.docName, inv.docData)} size="small">
                                <Download fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    {searchTerm ? 'No invoices match your search' : 'No invoices found'}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete invoice #{currentInvoice?.invoiceNumber}?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={customerDialogOpen} onClose={() => setCustomerDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Customer</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer(p => ({ ...p, name: e.target.value }))} sx={{ mt: 1 }} autoFocus />
          <TextField fullWidth label="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer(p => ({ ...p, phone: e.target.value }))} sx={{ mt: 2 }} />
          <TextField fullWidth label="Email" value={newCustomer.email} onChange={(e) => setNewCustomer(p => ({ ...p, email: e.target.value }))} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCustomerDialogOpen(false); setNewCustomer({ name: '', phone: '', email: '' }); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveNewCustomer} disabled={!newCustomer.name.trim()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
            Save Customer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={supplierDialogOpen} onClose={() => setSupplierDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Supplier</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name *" value={newSupplier.name} onChange={(e) => setNewSupplier(p => ({ ...p, name: e.target.value }))} sx={{ mt: 1 }} autoFocus />
          <TextField fullWidth label="Supplier Type" value={newSupplier.supplierType} onChange={(e) => setNewSupplier(p => ({ ...p, supplierType: e.target.value }))} placeholder="e.g. Airline, Hotel, Transport" sx={{ mt: 2 }} />
          <TextField fullWidth label="Phone" value={newSupplier.phone} onChange={(e) => setNewSupplier(p => ({ ...p, phone: e.target.value }))} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSupplierDialogOpen(false); setNewSupplier({ name: '', supplierType: '', phone: '' }); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveNewSupplier} disabled={!newSupplier.name.trim()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
            Save Supplier
          </Button>
        </DialogActions>
      </Dialog>

      <PrintableInvoice ref={invoiceRef} invoice={printInvoice} key={printInvoice?.id || 'default'} />
    </Box>
  );
};

export default Invoice;