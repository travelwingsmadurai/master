// src/pages/Invoice.js — Direct WhatsApp Chat & QR
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { addDoc, collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useReactToPrint } from 'react-to-print';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  TextField, Button, Typography, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Select,
  MenuItem, InputLabel, FormControl, Grid, CircularProgress, Alert,
  Menu, ListItemIcon, ListItemText, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Chip, Avatar, Divider, Tooltip
} from '@mui/material';
import { 
  Print, PictureAsPdf, MoreVert, Edit, Delete, PersonAdd, Person, Add, 
  Receipt, CalendarToday, Flight, AttachMoney, Business, Group, Clear,
  WhatsApp 
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
    <div ref={ref} style={{
      padding: '20px', fontFamily: 'Arial', width: '210mm',
      margin: '0 auto', backgroundColor: 'white'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '5px' }}>TRAVELWINGS</h2>
      <p style={{ textAlign: 'center', marginTop: '0', color: '#555' }}>
        F56 PARASAN SAMUDHRI MAHAL, OPP FATHIMA COLLEGE<br />MADURAI
      </p>

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
        <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Billed To:</p>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '30px' }}>
        <div>
          <p style={{ fontStyle: 'italic', fontSize: '12px' }}>
            *(Bank Transfer Subject to Realisation)*
          </p>
          <p style={{ fontSize: '12px', marginTop: '10px' }}><strong>Scan to pay via UPI:</strong></p>
          <img src="/QR.jpeg" alt="UPI QR" style={{ width: '120px', height: '120px', border: '1px solid #ccc', padding: '5px', borderRadius: '8px' }} />
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <p>For "TRAVELWINGS"</p>
          <p style={{ marginTop: '40px' }}>Authorised Signatory</p>
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
    additionalItems: []
  });

  const [items, setItems] = useState([emptyItem()]);
  const [itemForm, setItemForm] = useState({ description: '', amount: '' });
  const [passengerForm, setPassengerForm] = useState({ name: '' });

  const [invoices, setInvoices] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [error, setError] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPassengerForm, setShowPassengerForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);

  const invoiceRef = useRef();
  const formRef = useRef();

  const customersCollectionRef = collection(db, 'customers');
  const staffCollectionRef = collection(db, 'staff');
  const suppliersCollectionRef = collection(db, 'suppliers');
  const invoicesCollectionRef = collection(db, 'invoices');

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
    const profit = invoiceTotal - itemsProviderTotal;
    return { itemsSellingTotal, itemsProviderTotal, additionalTotal, handling, invoiceTotal, profit };
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

  const resetForm = async () => {
    setFormData({
      customerId: '', staffId: '', supplierId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      handlingCharge: '', airlineName: '', passengers: [], additionalItems: []
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
    const profit = invoiceTotal - itemsProviderTotal;

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
        profit: Number(profit.toFixed(2)),
        status: editing ? (currentInvoice.status || 'active') : 'active',
        createdAt: editing ? (currentInvoice.createdAt || nowISO) : nowISO,
        updatedAt: nowISO
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
      setError(`Failed to ${editing ? 'update' : 'save'} invoice. Please try again.`);
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
      additionalItems: Array.isArray(inv.additionalItems) ? inv.additionalItems : []
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

  // ─── CORE PDF GENERATION FUNCTION ───
  const generatePDF = (inv) => {
    if (!inv?.id) { setError('Invalid invoice data'); return null; }
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(40);
      pdf.text('TRAVELWINGS', 105, 20, { align: 'center' });
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('F56 PARASAN SAMUDHRI MAHAL, OPP FATHIMA COLLEGE', 105, 25, { align: 'center' });
      pdf.text('MADURAI', 105, 30, { align: 'center' });

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INVOICE', 105, 40, { align: 'center' });

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Invoice No: ${inv.invoiceNumber}`, 20, 50);
      pdf.text(`Date: ${inv.date}`, 20, 55);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Billed To:', 20, 65);
      pdf.setFont('helvetica', 'normal');
      pdf.text(inv.customerName || '', 20, 71);
      
      let currentY = 76;
      if (inv.customerPhone) {
        pdf.setFontSize(10);
        pdf.text(`Phone: ${inv.customerPhone}`, 20, currentY);
        currentY += 5;
        pdf.setFontSize(12);
      }
      pdf.text(`Staff: ${inv.staffName || 'N/A'}`, 20, currentY);

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

      pdf.setFont('helvetica', 'normal');
      pdf.text(`Amount in Words: ${numberToWords(inv.totalAmount)}`, 20, pdf.lastAutoTable.finalY + 15);

      // ─── ADD QR CODE TO PDF ───
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.text('*(Bank Transfer Subject to Realisation)*', 20, pdf.lastAutoTable.finalY + 25);
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Scan to pay via UPI:', 20, pdf.lastAutoTable.finalY + 35);
      
      pdf.addImage('/QR.jpeg', 'JPEG', 20, pdf.lastAutoTable.finalY + 40, 35, 35);

      pdf.setFont('helvetica', 'normal');
      pdf.text('For "TRAVELWINGS"', 160, pdf.lastAutoTable.finalY + 60);
      pdf.text('Authorised Signatory', 160, pdf.lastAutoTable.finalY + 65);

      return pdf;
    } catch (err) {
      console.error('PDF export error:', err);
      setError({ message: `Failed to generate PDF: ${err.message}`, severity: 'error' });
      return null;
    }
  };

  // ─── EXPORT PDF BUTTON ───
  const handleExportPDF = useCallback((inv) => {
    setIsExporting(true);
    const pdf = generatePDF(inv);
    if (pdf) {
      pdf.save(`invoice_${inv.invoiceNumber}.pdf`);
    }
    setIsExporting(false);
  }, []);

  // ─── WHATSAPP SHARE BUTTON (Downloads PDF + Opens Chat Directly) ───
  const handleShareWhatsApp = (inv) => {
    // 1. Download the PDF first
    const pdf = generatePDF(inv);
    if (pdf) {
      pdf.save(`invoice_${inv.invoiceNumber}.pdf`);
    }

    // 2. Get Phone Number & Clean it
    const customer = customers.find(c => c.id === inv.customerId);
    let phone = customer?.phone || inv.customerPhone || '';
    phone = phone.replace(/\D/g, ''); // Keep only digits
    
    // Add India code if it's a 10-digit number
    if (phone.length === 10) phone = '91' + phone;

    // 3. Prepare Message
    const text = `*Travel Wings - Invoice*\n\n` +
                 `Invoice No: *${inv.invoiceNumber}*\n` +
                 `Date: ${inv.date}\n` +
                 `Customer: ${inv.customerName}\n` +
                 `Total Amount: *₹${fmtINR(inv.totalAmount)}*\n\n` +
                 `(Please find the attached PDF invoice)`;

    // 4. Use setTimeout to ensure download triggers before opening WhatsApp
    // (Prevents browser from blocking the new tab)
    setTimeout(() => {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      setError({ message: 'PDF Downloaded to your computer. Click the 📎 icon in WhatsApp to attach it.', severity: 'info' });
    }, 800);
  };

  const handlePrint = useReactToPrint({
    content: () => invoiceRef.current,
    onBeforeGetContent: () => { setIsPrinting(true); return Promise.resolve(); },
    onAfterPrint: () => { setIsPrinting(false); setPrintInvoice(null); },
    pageStyle: `@page { size: A4; margin: 10mm; } @media print { body { margin: 0; padding: 0; } }`
  });

  const triggerPrint = useCallback((inv) => {
    if (!inv?.id) { setError('Invalid invoice data'); return; }
    setPrintInvoice(inv);
    setTimeout(() => {
      handlePrint().catch(err => { console.error('Print failed:', err); setIsPrinting(false); });
    }, 300);
  }, [handlePrint]);

  const handleMenuOpen = (e, inv) => { setAnchorEl(e.currentTarget); setCurrentInvoice(inv); };
  const handleMenuClose = () => { setAnchorEl(null); setCurrentInvoice(null); };
  const handlePrintFromMenu = () => { if (currentInvoice) triggerPrint(currentInvoice); handleMenuClose(); };
  const handleExportFromMenu = () => { if (currentInvoice) handleExportPDF(currentInvoice); handleMenuClose(); };

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

      {/* ─── MAIN FORM CARD ─── */}
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
            {/* Header Fields */}
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Person fontSize="small" color="primary" /> Select Customer *
              </Typography>
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
            </Grid>
            
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
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

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Business fontSize="small" color="warning" /> Supplier (Optional)
              </Typography>
              <FormControl fullWidth sx={inputStyle}>
                <Select name="supplierId" value={formData.supplierId} onChange={handleSupplierChange} displayEmpty>
                  <MenuItem value=""><em>None (use free-text name)</em></MenuItem>
                  {activeSuppliers.map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}{s.supplierType ? ` — ${s.supplierType}` : ''}{s.isActive === false ? ' [Inactive]' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" color="success" /> Date *
              </Typography>
              <TextField name="date" type="date" value={formData.date} onChange={handleHeaderChange} fullWidth sx={inputStyle} required InputLabelProps={{ shrink: true }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Flight fontSize="small" color="secondary" /> Airline/Provider Name
              </Typography>
              <TextField name="airlineName" value={formData.airlineName} onChange={handleHeaderChange} fullWidth placeholder="Enter airline or provider name" sx={inputStyle} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
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

          {/* ─── Service Items ─── */}
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
                  <TextField label="Provider Cost (₹)" size="small" type="number" fullWidth value={it.providerCost} inputProps={{ min: 0, step: 0.01 }} onChange={e => updateItem(idx, 'providerCost', e.target.value)} sx={inputStyle} />
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

          {/* ─── Additional Items ─── */}
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

          {/* ─── Passengers ─── */}
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

          {/* ─── Totals Summary ─── */}
          <Paper elevation={0} sx={{ p: 3, mt: 4, backgroundColor: '#f8fafc', borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" color="text.secondary">Items Selling</Typography>
                <Typography variant="subtitle1" fontWeight="bold">₹{fmtINR(totals.itemsSellingTotal)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" color="text.secondary">Additional</Typography>
                <Typography variant="subtitle1" fontWeight="bold">₹{fmtINR(totals.additionalTotal)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" color="text.secondary">Handling</Typography>
                <Typography variant="subtitle1" fontWeight="bold">₹{fmtINR(totals.handling)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Provider Cost</Typography>
                <Typography variant="subtitle1" fontWeight="bold" color="text.secondary">₹{fmtINR(totals.itemsProviderTotal)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="caption" color="primary" fontWeight="bold">Invoice Total</Typography>
                <Typography variant="h5" fontWeight="900" color="primary">₹{fmtINR(totals.invoiceTotal)}</Typography>
              </Grid>
            </Grid>
            <Box sx={{
              mt: 2, p: 2, borderRadius: 2, textAlign: 'center',
              backgroundColor: totals.profit > 0 ? '#e8f5e9' : totals.profit < 0 ? '#ffebee' : '#fff8e1',
              border: '1px solid',
              borderColor: totals.profit > 0 ? '#a5d6a7' : totals.profit < 0 ? '#ef9a9a' : '#ffe082'
            }}>
              <Typography variant="subtitle1" fontWeight="bold" color={totals.profit >= 0 ? 'success.main' : 'error.main'}>
                Estimated Profit: ₹{fmtINR(totals.profit)}
              </Typography>
            </Box>
          </Paper>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            {editing && (
              <Button variant="outlined" onClick={resetForm} disabled={loading} startIcon={<Clear />} sx={{ textTransform: 'none', borderColor: '#e0e0e0', color: 'text.secondary', px: 3 }}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="contained" size="large" disabled={loading} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Add />} sx={{ textTransform: 'none', bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, px: 4 }}>
              {loading ? 'Saving...' : (editing ? 'Update Invoice' : 'Save Invoice')}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ─── LIST SECTION ─── */}
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar sx={{ bgcolor: '#2e7d32', width: 56, height: 56 }}>
            <Receipt fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Recent Invoices</Typography>
            <Typography variant="body2" color="text.secondary">View and manage all created invoices</Typography>
          </Box>
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
                  <TableCell sx={{ fontWeight: 'bold' }} align="right">Profit (₹)</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.length > 0 ? invoices.map(inv => {
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
                      <TableCell align="right" sx={{ color: inv.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                        {fmtINR(inv.profit)}
                      </TableCell>
                      <TableCell>
                        {/* ─── FIXED ACTIONS LAYOUT ─── */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Tooltip title="Share via WhatsApp">
                            <IconButton color="success" onClick={() => handleShareWhatsApp(inv)} size="small">
                              <WhatsApp fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
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
                          
                          <Tooltip title="More Options">
                            <IconButton color="default" onClick={(e) => handleMenuOpen(e, inv)} size="small">
                              <MoreVert fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          <Menu anchorEl={anchorEl} keepMounted open={Boolean(anchorEl && currentInvoice?.id === inv.id)} onClose={handleMenuClose}>
                            <MenuItem onClick={handlePrintFromMenu} disabled={isPrinting}>
                              <ListItemIcon><Print fontSize="small" /></ListItemIcon>
                              <ListItemText>{isPrinting ? 'Printing...' : 'Print'}</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={handleExportFromMenu} disabled={isExporting}>
                              <ListItemIcon><PictureAsPdf fontSize="small" /></ListItemIcon>
                              <ListItemText>{isExporting ? 'Exporting...' : 'Export PDF'}</ListItemText>
                            </MenuItem>
                          </Menu>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>No invoices found</TableCell></TableRow>
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

      <PrintableInvoice ref={invoiceRef} invoice={printInvoice} key={printInvoice?.id || 'default'} />
    </Box>
  );
};

export default Invoice;