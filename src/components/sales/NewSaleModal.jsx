import { useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, increment } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { creditWallet, debitWallet } from '../../utils/walletUtils';
import SalesForm from '../../pages/sales/SalesForm';

const NewSaleModal = ({ isOpen = true, modalOnly = false, onClose, prefillData, onSuccess }) => {
  const { currentUser } = useAuth();

  const generateInvoiceNumber = async () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const snapshot = await getDocs(collection(db, 'sales'));
    let count = 1;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.invoiceNumber && data.invoiceNumber.includes(dateStr)) {
        count++;
      }
    });
    return `INV-${dateStr}-${count.toString().padStart(3, '0')}`;
  };

  const handleSaveSale = async (data) => {
    const invoiceNumber = await generateInvoiceNumber();

    // Resolve customer ID
    let customerId = data.customerId;
    const custSnap = await getDocs(collection(db, 'customers'));
    const existingCust = custSnap.docs.find(d => d.data().phone === data.customerPhone);
    if (customerId && !existingCust) {
      // customerId already set from autocomplete
    } else if (existingCust) {
      customerId = existingCust.id;
    } else {
      // Auto-create customer if phone is new
      const newCustRef = await addDoc(collection(db, 'customers'), {
        name: data.customerName,
        phone: data.customerPhone,
        walletBalance: 0,
        walletHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      customerId = newCustRef.id;
    }

    const newSale = {
      ...data,
      customerId,
      invoiceNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update inventory logic
    for (const item of data.items) {
      if (item.type === 'Second-hand') {
        await updateDoc(doc(db, 'second_hand_mobiles', item.itemId), {
          status: 'sold',
          updatedAt: new Date().toISOString()
        });
      } else if (item.type === 'New') {
        try {
          const productRef = doc(db, 'products', item.itemId);
          await updateDoc(productRef, {
            stock: increment(-item.quantity)
          });
        } catch (e) {
          console.error("Error updating product stock", e);
        }
      }
    }

    const docRef = await addDoc(collection(db, 'sales'), newSale);

    // Wallet operations after sale saved
    const walletUsed = Number(data.walletUsed) || 0;
    if (walletUsed > 0 && customerId) {
      await debitWallet(customerId, walletUsed, 'used_in_sale', docRef.id, currentUser.uid);
    }
    const hasDiscount = Number(data.discount) > 0
    const profit = data.totalProfit || 0

    if (!hasDiscount && profit > 0 && customerId) {
      const walletCredit = Math.round(profit * 0.01)
      if (walletCredit > 0) {
        await creditWallet(
          customerId,
          walletCredit,
          'auto_credit',
          docRef.id,
          currentUser.uid
        )
      }
    }

    if (data.linkedServiceOrderId) {
      await updateDoc(doc(db, 'service_orders', data.linkedServiceOrderId), {
        billCreated: true,
        linkedSaleId: docRef.id,
        updatedAt: new Date().toISOString()
      });
    }

    if (onSuccess) onSuccess();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (isOpen === false) return null;

  const modalContent = (
    <div className="relative bg-white rounded-2xl w-full max-w-4xl mx-auto my-8 shadow-2xl border border-[#e2e8f0]">
      <div className="flex items-center justify-between px-6 py-4 bg-[#002395] rounded-t-2xl">
        <h3 className="text-lg font-bold text-white">Create New Sale</h3>
        <button onClick={onClose} className="text-white hover:text-blue-200 p-1 rounded transition">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="overflow-visible flex-1 px-4 py-4">
        <SalesForm onSave={handleSaveSale} onCancel={onClose} prefillData={prefillData} />
      </div>
    </div>
  );

  if (modalOnly) {
    return modalContent;
  }

  return (
    <div className="fixed z-50 inset-0 bg-black/50 overflow-y-auto flex items-start justify-center p-4">
      <div className="fixed inset-0" onClick={onClose}></div>
      {modalContent}
    </div>
  );
};

export default NewSaleModal;
