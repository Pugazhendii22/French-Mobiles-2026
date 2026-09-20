import { useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, increment, query, where, limit, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { creditWallet, debitWallet } from '../../utils/walletUtils';
import { nextDailyNumber } from '../../utils/counters';
import { invalidateCustomers } from '../../utils/customerCache';
import SalesForm from '../../pages/sales/SalesForm';

const NewSaleModal = ({ isOpen = true, modalOnly = false, onClose, prefillData, onSuccess }) => {
  const { currentUser } = useAuth();

  const generateInvoiceNumber = () =>
    nextDailyNumber({
      kind: 'invoice',
      prefixLabel: 'INV',
      collectionName: 'sales',
      field: 'invoiceNumber',
    });

  const handleSaveSale = async (data) => {
    const invoiceNumber = await generateInvoiceNumber();

    // Resolve customer ID. Look the phone up directly - scanning every customer
    // document costs a read per customer on every single sale.
    let customerId = data.customerId;
    const existingCust = data.customerPhone
      ? (await getDocs(query(
          collection(db, 'customers'),
          where('phone', '==', data.customerPhone),
          limit(1)
        ))).docs[0]
      : undefined;

    if (customerId && !existingCust) {
      // customerId already set from autocomplete
    } else if (existingCust) {
      customerId = existingCust.id;
    } else {
      // Auto-create customer if phone is new
      invalidateCustomers();
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

    // Check the wallet BEFORE writing the sale. Debiting afterwards meant a
    // failed debit left a sale recorded as paid with wallet money that was
    // never taken off the customer's balance.
    const walletUsed = Number(data.walletUsed) || 0;
    if (walletUsed > 0 && customerId) {
      const custSnap = await getDoc(doc(db, 'customers', customerId));
      const balance = Number(custSnap.data()?.walletBalance) || 0;
      if (balance < walletUsed) {
        throw new Error(`Wallet balance is only ₹${balance}. Reduce the wallet amount and try again.`);
      }
    }

    const docRef = await addDoc(collection(db, 'sales'), newSale);

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
    <div className="bg-[#f1f5f9] w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[94dvh] md:h-auto md:max-h-[90vh] overflow-hidden shadow-2xl">

      {/* Grab handle */}
      <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0 bg-white">
        <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
      </div>

      <div className="flex-shrink-0 px-4 pt-2 pb-3 bg-white border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#0f172a] truncate">New Sale</h3>
          <p className="text-xs text-gray-400">Scan a label or add items by hand</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100 shrink-0"
          aria-label="Close"
        >
          <i className="fas fa-times text-lg"></i>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 pb-safe">
        <SalesForm onSave={handleSaveSale} onCancel={onClose} prefillData={prefillData} />
      </div>
    </div>
  );

  if (modalOnly) {
    return modalContent;
  }

  return (
    <div className="fixed z-50 inset-0 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
      <div className="fixed inset-0" onClick={onClose}></div>
      <div className="relative w-full md:max-w-2xl md:px-4">{modalContent}</div>
    </div>
  );
};

export default NewSaleModal;
