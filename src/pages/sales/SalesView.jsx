import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { generateInvoiceHTML } from '../../utils/generateInvoiceHTML';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/common/Layout';
import { Section, MoneyRow, Chip, InfoRow, InfoGrid } from '../../components/common/ui';
import { paymentChipClass, isFinanceMethod } from '../../utils/paymentMethods';

const SalesView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { shopDetails } = useSettings();
  const { currentUser, userDisplayName, userRole } = useAuth();
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


  if (loading) return (
    <Layout title="Sale Details" pageType="detail" backTo="/sales">
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-32 animate-pulse" />)}
      </div>
    </Layout>
  );

  if (!sale) return (
    <Layout title="Sale Details" pageType="detail" backTo="/sales">
      <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0]">
        <i className="fas fa-receipt text-4xl text-gray-200 mb-3 block"></i>
        <p className="text-gray-500 font-semibold text-sm">Sale not found</p>
      </div>
    </Layout>
  );

  const isPaid = !(sale?.balanceDue > 0);
  const payMethodChip = paymentChipClass(sale?.paymentMethod);
  const financed = Boolean(sale?.isFinanced || sale?.financeProvider) || isFinanceMethod(sale?.paymentMethod);

  return (
    <Layout title="Sale Details" pageType="detail" backTo="/sales">
      <div className="max-w-3xl mx-auto space-y-3">

        {/* ── HERO ── */}
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-4 ${isPaid ? 'border-green-500' : 'border-[#ED2939]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-[#002395] font-mono">{sale?.invoiceNumber}</p>
              <h2 className="text-lg font-bold text-[#0f172a] mt-0.5 leading-tight">{sale?.customerName}</h2>
              {sale?.customerPhone && (
                <a href={`tel:${sale.customerPhone}`} className="inline-flex items-center gap-1.5 text-green-600 font-semibold text-sm mt-1">
                  <i className="fas fa-phone text-xs"></i>{sale.customerPhone}
                </a>
              )}
              <p className="text-gray-400 text-[11px] mt-1">
                {sale?.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-bold text-[#002395] leading-tight">₹{sale?.totalAmount}</p>
              <div className="flex flex-col items-end gap-1 mt-1.5">
                <Chip className={payMethodChip}>{sale?.paymentMethod}</Chip>
                <Chip className={isPaid ? 'bg-green-100 text-green-700' : 'bg-[#ED2939]/10 text-[#ED2939]'}>
                  {isPaid ? 'Paid' : `Due ₹${sale?.balanceDue}`}
                </Chip>
              </div>
            </div>
          </div>

          {/* ── ACTIONS ── */}
          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            {sale?.balanceDue > 0 && userRole?.toLowerCase() === 'admin' && (
              <button
                onClick={() => {
                  setDuePaymentAmount(Number(sale.balanceDue) || 0);
                  setDuePaymentMethod(sale.paymentMethod || 'Cash');
                  setDueError('');
                  setShowDueDialog(true);
                }}
                className="w-full bg-[#ED2939] text-white py-3 rounded-xl text-sm font-bold"
              >
                <i className="fas fa-wallet mr-2"></i>Collect ₹{sale?.balanceDue} Due
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={handlePrintInvoice}
                className="flex-1 bg-[#002395]/10 text-[#002395] py-2.5 rounded-xl text-xs font-bold"
              >
                <i className="fas fa-print mr-1.5"></i>Print Invoice
              </button>
              {sale?.linkedServiceOrderId && (
                <button
                  onClick={() => navigate(`/service/${sale?.linkedServiceOrderId}`)}
                  className="flex-1 bg-purple-50 text-purple-700 py-2.5 rounded-xl text-xs font-bold"
                >
                  <i className="fas fa-link mr-1.5"></i>Service Order
                </button>
              )}
            </div>

            {sale?.balanceDue > 0 && userRole?.toLowerCase() !== 'admin' && (
              <p className="flex items-center justify-center gap-1.5 bg-gray-100 text-gray-500 py-2.5 rounded-xl text-xs font-semibold">
                <i className="fas fa-lock"></i> Only an admin can record due payments
              </p>
            )}
          </div>
        </div>

        {/* ── ITEMS ── */}
        <Section icon="fa-box" title="Items" hint={`${sale?.items?.length || 0} on this bill`}>
          <div className="space-y-2">
            {sale?.items?.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#0f172a] text-sm">{item.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {item.quantity} × ₹{item.unitPrice}
                  </p>
                  {item.imei && <p className="text-[11px] text-gray-400 break-all">IMEI {item.imei}</p>}
                </div>
                <p className="font-bold text-[#0f172a] text-sm shrink-0">₹{item.total}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── PAYMENT ── */}
        <Section icon="fa-indian-rupee-sign" title="Payment">
          <MoneyRow label="Subtotal" value={`₹${sale?.subtotal}`} />
          {sale?.discount > 0 && (
            <MoneyRow label="Discount" value={`- ₹${sale?.discount}`} tone="good" />
          )}
          {sale?.discountCategory && sale?.discountCategory !== 'manual' && (
            <p className="text-[11px] text-green-600 mt-1">
              <i className="fas fa-tag mr-1"></i>
              {sale.discountCategory === 'family' ? 'Family Discount' :
               sale.discountCategory === 'friends' ? 'Friends Discount' :
               'Regular Customer Discount'}
            </p>
          )}
          {sale?.walletUsed > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#002395]"><i className="fas fa-wallet mr-1"></i>Wallet Used</span>
              <span className="font-medium text-[#002395]">- ₹{sale?.walletUsed}</span>
            </div>
          )}
          <MoneyRow label="Total" value={`₹${sale?.totalAmount}`} strong divider />
          <MoneyRow label="Amount Paid" value={`₹${sale?.amountPaid}`} tone="good" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Balance Due</span>
            <span className={sale?.balanceDue > 0 ? 'text-[#ED2939]' : 'text-green-600'}>
              {sale?.balanceDue > 0 ? `₹${sale?.balanceDue}` : 'Fully Paid ✓'}
            </span>
          </div>

          {financed && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mt-3">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2">
                <i className="fas fa-file-invoice-dollar mr-1.5"></i>
                {sale?.financeProvider || sale?.paymentMethod}
              </p>
              <InfoGrid>
                <InfoRow label="Loan / App No." value={sale?.financeLoanNumber || '-'} mono />
                <InfoRow label="Down Payment" value={`₹${sale?.downPayment || 0}`} />
                <InfoRow label="Financed" value={`₹${sale?.financedAmount || 0}`} />
              </InfoGrid>
              <p className="text-[11px] text-indigo-700 mt-2">
                Customer owes nothing. ₹{sale?.financedAmount || 0} is due to the shop from{' '}
                {sale?.financeProvider || sale?.paymentMethod}.
              </p>
            </div>
          )}

          {sale?.paymentMethod === 'Split' && (
            <div className="bg-gray-50 rounded-xl p-3 mt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Cash</span><span>₹{sale?.splitCash}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>UPI</span><span>₹{sale?.splitUpi}</span>
              </div>
            </div>
          )}

          {(sale?.totalProfit !== undefined || sale?.walletCredited > 0) && (
            <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
              {sale?.totalProfit !== undefined && (
                <div className="flex justify-between text-sm">
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
            </div>
          )}
        </Section>

        {/* ── NOTES ── */}
        {sale?.notes && (
          <Section icon="fa-note-sticky" title="Notes">
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{sale?.notes}</p>
          </Section>
        )}

        {/* ── DUE PAYMENT SHEET ── */}
        {showDueDialog && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl pb-safe">
              <div className="md:hidden flex justify-center pt-2.5 pb-1">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#0f172a]">Collect Due</h3>
                  <p className="text-xs text-gray-400">Balance due ₹{sale?.balanceDue}</p>
                </div>
                <button onClick={() => setShowDueDialog(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400" aria-label="Close">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                {dueError && (
                  <div className="bg-red-50 border border-red-200 text-[#ED2939] rounded-xl px-4 py-3 text-sm font-medium">
                    <i className="fas fa-exclamation-circle mr-2"></i>{dueError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-[#64748b] mb-1.5">Amount to pay</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    step="1"
                    value={duePaymentAmount}
                    onChange={e => setDuePaymentAmount(e.target.value)}
                    className="w-full border border-[#e2e8f0] focus:border-[#002395] rounded-xl px-4 py-3 text-lg font-bold text-center focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748b] mb-1.5">Payment method</label>
                  <div className="flex bg-gray-100 rounded-xl p-1">
                    {['Cash', 'UPI', 'Card'].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDuePaymentMethod(m)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                          duePaymentMethod === m ? 'bg-[#002395] text-white shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
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
                  className="w-full bg-[#002395] text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-60"
                >
                  {dueProcessing ? 'Processing...' : 'Pay Now'}
                </button>
                <button
                  onClick={() => setShowDueDialog(false)}
                  className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default SalesView;
