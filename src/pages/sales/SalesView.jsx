import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { generateInvoiceHTML } from '../../utils/generateInvoiceHTML';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/common/Layout';

const SalesView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { shopDetails } = useSettings();
  const { currentUser, userDisplayName } = useAuth();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [showDueDialog, setShowDueDialog] = useState(false);
  const [duePaymentAmount, setDuePaymentAmount] = useState(0);
  const [duePaymentMethod, setDuePaymentMethod] = useState('Cash');
  const [dueProcessing, setDueProcessing] = useState(false);
  const [dueError, setDueError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'sales', id));
        if (docSnap.exists()) setSale({ id: docSnap.id, ...docSnap.data() });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handlePrintInvoice = () => {
    const htmlContent = generateInvoiceHTML(sale, shopDetails, userDisplayName || currentUser?.email)
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    printWindow.document.open()
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 600)
  }


  if (loading) return <div className="p-4 md:p-8 text-center">Loading...</div>;
  if (!sale) return <div className="p-4 md:p-8 text-center text-red-600">Sale not found</div>;

return (
  <Layout title="Sale Details" pageType="detail" backTo="/sales">
    <div className="min-h-screen bg-[#f8fafc] pb-24">

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
        <button onClick={() => navigate('/sales')} className="text-[#002395] p-1">
        <i className="fas fa-arrow-left text-lg"></i>
      </button>
      <h1 className="text-lg font-bold text-[#0f172a] flex-1">Sale Details</h1>
    </div>

    <div className="px-4 py-4 space-y-4">

      {/* SALE SUMMARY CARD */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#002395] font-mono">{sale?.invoiceNumber}</p>
            <h2 className="text-xl font-bold text-[#0f172a] mt-1">{sale?.customerName}</h2>
            {sale?.customerPhone && (
              <a href={`tel:${sale.customerPhone}`} className="flex items-center gap-2 text-green-600 font-semibold text-sm mt-0.5">
                <i className="fas fa-phone text-green-500 mr-1"></i>
                {sale.customerPhone}
              </a>
            )}
            <p className="text-gray-400 text-xs mt-1">
              {sale?.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-2xl font-bold text-[#002395]">₹{sale?.totalAmount}</p>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
              sale?.paymentMethod === 'Cash' ? 'bg-green-100 text-green-700' :
              sale?.paymentMethod === 'UPI' ? 'bg-blue-100 text-blue-700' :
              sale?.paymentMethod === 'Card' ? 'bg-purple-100 text-purple-700' :
              'bg-orange-100 text-orange-700'
            }`}>
              {sale?.paymentMethod}
            </span>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handlePrintInvoice}
            className="flex items-center gap-1.5 bg-[#002395]/10 text-[#002395] px-3 py-2 rounded-xl text-xs font-semibold"
          >
            <i className="fas fa-print"></i> Print Invoice
          </button>
          {sale?.balanceDue > 0 && (
            <button
              onClick={() => {
                setDuePaymentAmount(Number(sale.balanceDue) || 0);
                setDuePaymentMethod(sale.paymentMethod || 'Cash');
                setDueError('');
                setShowDueDialog(true);
              }}
              className="flex items-center gap-1.5 bg-[#ED2939]/10 text-[#ED2939] px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <i className="fas fa-wallet"></i> Pay Due
            </button>
          )}
          {sale?.linkedServiceOrderId && (
            <button
              onClick={() => navigate(`/service/${sale?.linkedServiceOrderId}`)}
              className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <i className="fas fa-link"></i> Service Order
            </button>
          )}
        </div>
      </div>

      {/* ITEMS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Items
        </p>
        <div className="space-y-3">
          {sale?.items?.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#0f172a] text-sm">{item.name}</p>
                {item.imei && (
                  <p className="text-xs text-gray-400">IMEI: {item.imei}</p>
                )}
                <p className="text-xs text-gray-400">Qty: {item.quantity} × ₹{item.unitPrice}</p>
              </div>
              <p className="font-bold text-[#0f172a] text-sm ml-3">₹{item.total}</p>
            </div>
          ))}
        </div>
      </div>

      {/* PAYMENT SUMMARY */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Payment
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium">₹{sale?.subtotal}</span>
          </div>
          {sale?.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Discount</span>
              <span className="font-medium text-green-600">- ₹{sale?.discount}</span>
            </div>
          )}
          {sale?.discountCategory && sale?.discountCategory !== 'manual' && (
            <p className="text-xs text-green-600 mt-1">
              <i className="fas fa-tag mr-1"></i>
              {sale.discountCategory === 'family' ? 'Family Discount' :
               sale.discountCategory === 'friends' ? 'Friends Discount' :
               'Regular Customer Discount'}
            </p>
          )}
          {sale?.walletUsed > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#002395]">
                <i className="fas fa-wallet mr-1"></i>Wallet Used
              </span>
              <span className="font-medium text-[#002395]">- ₹{sale?.walletUsed}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-2 mt-2">
            <span>Total</span>
            <span className="text-[#002395]">₹{sale?.totalAmount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount Paid</span>
            <span className="font-medium text-green-600">₹{sale?.amountPaid}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span>Balance Due</span>
            <span className={sale?.balanceDue > 0 ? 'text-[#ED2939]' : 'text-green-600'}>
              {sale?.balanceDue > 0 ? `₹${sale?.balanceDue}` : 'Fully Paid ✓'}
            </span>
          </div>
          {sale?.totalProfit !== undefined && (
            <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-400">Profit</span>
              <span className={`font-semibold ${(sale?.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>
                ₹{sale?.totalProfit || 0}
              </span>
            </div>
          )}
          {sale?.walletCredited > 0 && (
            <div className="flex justify-between text-xs text-[#002395]">
              <span><i className="fas fa-wallet mr-1"></i>Wallet Credited</span>
              <span>+₹{sale?.walletCredited}</span>
            </div>
          )}
          {sale?.paymentMethod === 'Split' && (
            <div className="bg-gray-50 rounded-xl p-3 mt-2 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Cash</span>
                <span>₹{sale?.splitCash}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>UPI</span>
                <span>₹{sale?.splitUpi}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NOTES */}
      {sale?.notes && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            Notes
          </p>
          <p className="text-sm text-gray-600">{sale?.notes}</p>
        </div>
      )}

      {showDueDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center px-4 py-4">
          <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#0f172a]">Pay Due Amount</h3>
                <p className="text-xs text-gray-500">Balance due: ₹{sale?.balanceDue}</p>
              </div>
              <button onClick={() => setShowDueDialog(false)} className="text-gray-400 p-2">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {dueError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  {dueError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount to pay</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  step="1"
                  value={duePaymentAmount}
                  onChange={e => setDuePaymentAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
                <select
                  value={duePaymentMethod}
                  onChange={e => setDuePaymentMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    const amount = Number(duePaymentAmount);
                    const due = Number(sale?.balanceDue || 0);
                    if (!amount || amount <= 0) {
                      setDueError('Enter a valid payment amount.');
                      return;
                    }
                    if (amount > due) {
                      setDueError('Payment cannot exceed due amount.');
                      return;
                    }
                    setDueError('');
                    setDueProcessing(true);
                    try {
                      const newPaid = Number(sale?.amountPaid || 0) + amount;
                      const newDue = Math.max(0, Number(sale?.totalAmount || 0) - newPaid);
                      await updateDoc(doc(db, 'sales', id), {
                        amountPaid: newPaid,
                        balanceDue: newDue
                      });
                      setSale(prev => ({ ...prev, amountPaid: newPaid, balanceDue: newDue }));
                      setShowDueDialog(false);
                    } catch (err) {
                      console.error(err);
                      setDueError('Failed to update payment. Please try again.');
                    } finally {
                      setDueProcessing(false);
                    }
                  }}
                  disabled={dueProcessing}
                  className="flex-1 bg-[#002395] text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {dueProcessing ? 'Processing...' : 'Pay Now'}
                </button>
                <button
                  onClick={() => setShowDueDialog(false)}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  </div>
  </Layout>
);

};

export default SalesView;
