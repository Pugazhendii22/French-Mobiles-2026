import { useState, useEffect } from 'react';
import { money } from '@/shared/ui/uiTokens';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import { generateInvoiceHTML } from '../../utils/generateInvoiceHTML';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import Layout from '@/shared/ui/Layout';
import { Section, MoneyRow, Chip, InfoRow, InfoGrid } from '@/shared/ui/ui';
import { paymentChipClass, isFinanceMethod } from '../../utils/paymentMethods';
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';

const SalesView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { shopDetails } = useSettings();
  const { currentUser, userDisplayName, userRole } = useAuth();
  const [sale, setSale] = useState(null);
  const { sheetProps: dueSheet, handleProps: dueHandle } = useSheetDismiss({ onDismiss: () => setShowDueDialog(false) });
  const [loading, setLoading] = useState(true);
  const [printError, setPrintError] = useState('');
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
    setPrintError('')
    /* Checked before it is used. A phone blocks a pop-up it did not ask for and
       hands back null, and writing to that threw - so pressing Print did nothing
       at all, with nothing on screen to say why. */
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      setPrintError('The browser blocked the print window. Allow pop-ups for this site, then print again.')
      return
    }
    try {
      printWindow.document.open()
      printWindow.document.write(generateInvoiceHTML(sale, shopDetails, userDisplayName || currentUser?.email))
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 600)
    } catch (err) {
      console.error('Invoice print failed:', err)
      printWindow.close()
      setPrintError('Could not print the invoice: ' + (err?.message || err))
    }
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

        {/* ── WHAT WAS SOLD, AND WHAT IS STILL OWED ──
            The answers someone opens a bill for, before any scrolling: who
            bought it, what the bill came to, what they have handed over and
            what is left. The breakdown stays in Payment below.

            The total used to be the only figure here and the balance was a
            chip beside it, so "how much is still owed" - the reason anyone
            opens a sale that is not settled - was the smallest thing on the
            card. */}
        <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border-l-4 ${isPaid ? 'border-green-500' : 'border-[#ED2939]'}`}>
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-[#002395] font-mono">{sale?.invoiceNumber}</p>
              <h2 className="text-lg font-bold text-[#0f172a] mt-0.5 leading-tight truncate">{sale?.customerName}</h2>
              {sale?.customerPhone && (
                <a href={`tel:${sale.customerPhone}`} className="inline-flex items-center gap-1.5 text-green-600 font-semibold text-sm mt-1">
                  <i className="fas fa-phone text-xs" aria-hidden="true"></i>{sale.customerPhone}
                </a>
              )}
              <p className="text-[#64748b] text-[11px] mt-1">
                {sale?.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Chip className={payMethodChip}>{sale?.paymentMethod}</Chip>
              <Chip className={isPaid ? 'bg-green-100 text-green-700' : 'bg-[#ED2939]/10 text-[#ED2939]'}>
                {isPaid ? 'Paid' : 'Unpaid'}
              </Chip>
            </div>
          </div>

          {/* The money, in the order the shop asks about it. */}
          <div className="flex items-stretch border-t border-[#f1f4f9] text-center">
            <div className="flex-1 py-3">
              <p className="text-[11px] text-[#64748b]">Bill</p>
              <p className="text-[15px] font-bold text-[#0f172a] tabular-nums mt-0.5">{money(sale?.totalAmount)}</p>
            </div>
            <div className="flex-1 py-3 border-x border-[#f1f4f9]">
              <p className="text-[11px] text-[#64748b]">Paid</p>
              <p className="text-[15px] font-bold text-[#002395] tabular-nums mt-0.5">{money(sale?.amountPaid)}</p>
            </div>
            <div className="flex-1 py-3">
              <p className="text-[11px] text-[#64748b]">Still owed</p>
              <p className={`text-[15px] font-bold tabular-nums mt-0.5 ${isPaid ? 'text-green-700' : 'text-[#ED2939]'}`}>
                {money(sale?.balanceDue)}
              </p>
            </div>
          </div>

          {/* One thing to do here, and quieter ways to do the rest. Printing and
              the link across to the service order were two tinted blocks beside
              the one button that mattered, all three shouting equally. */}
          <div className="px-4 py-3 border-t border-[#f1f4f9]">
            {sale?.balanceDue > 0 && userRole?.toLowerCase() === 'admin' && (
              <button
                onClick={() => {
                  setDuePaymentAmount(Number(sale.balanceDue) || 0);
                  setDuePaymentMethod(sale.paymentMethod || 'Cash');
                  setDueError('');
                  setShowDueDialog(true);
                }}
                className="w-full bg-[#ED2939] text-white py-3 rounded-xl text-[15px] font-bold"
              >
                Collect {money(sale?.balanceDue)} now
              </button>
            )}

            <div className={`flex items-center justify-center gap-4 ${sale?.balanceDue > 0 && userRole?.toLowerCase() === 'admin' ? 'mt-2.5' : ''}`}>
              <button
                onClick={handlePrintInvoice}
                className="text-[13px] font-semibold text-[#002395] py-1.5"
              >
                Print invoice
              </button>
              {sale?.linkedServiceOrderId && (
                <>
                  <span aria-hidden="true" className="text-[#e2e8f0]">·</span>
                  <button
                    onClick={() => navigate(`/service/${sale?.linkedServiceOrderId}`)}
                    className="text-[13px] font-semibold text-[#002395] py-1.5"
                  >
                    Open the service order
                  </button>
                </>
              )}
            </div>

            {printError && (
              <p className="text-center text-[12px] text-[#ED2939] mt-2">{printError}</p>
            )}

            {sale?.balanceDue > 0 && userRole?.toLowerCase() !== 'admin' && (
              <p className="text-center text-[12px] text-[#64748b] mt-2">
                {money(sale?.balanceDue)} is still owed on this bill. Only an admin can record a payment against it.
              </p>
            )}
          </div>
        </div>

        {/* ── ITEMS ── */}
        <Section
          icon="fa-box"
          title="Items"
          hint="What was sold and what each line went for. Completing this sale took products out of stock and marked any second-hand handset on it as sold."
        >
          <div className="space-y-2">
            {sale?.items?.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#0f172a] text-sm">{item.name}</p>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    {item.quantity} × {money(item.unitPrice)}
                  </p>
                  {item.imei && <p className="text-[11px] text-[#64748b] break-all">IMEI {item.imei}</p>}
                </div>
                <p className="font-bold text-[#0f172a] text-sm shrink-0">{money(item.total)}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── PAYMENT ── */}
        <Section
          icon="fa-indian-rupee-sign"
          title="Payment"
          hint="How the bill was settled. Wallet credit comes off what the customer hands over, so it is not money in the till - and profit is what is left after cost, not what was taken."
        >
          <MoneyRow label="Subtotal" value={money(sale?.subtotal)} />
          {sale?.discount > 0 && (
            <MoneyRow label="Discount" value={`- ${money(sale?.discount)}`} tone="good" />
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
              <span className="font-medium text-[#002395]">- {money(sale?.walletUsed)}</span>
            </div>
          )}
          <MoneyRow label="Total" value={money(sale?.totalAmount)} strong divider />
          <MoneyRow label="Amount Paid" value={money(sale?.amountPaid)} tone="good" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Balance Due</span>
            <span className={sale?.balanceDue > 0 ? 'text-[#ED2939]' : 'text-green-600'}>
              {sale?.balanceDue > 0 ? `${money(sale?.balanceDue)}` : 'Fully Paid ✓'}
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
                <InfoRow label="Down Payment" value={money(sale?.downPayment || 0)} />
                <InfoRow label="Financed" value={money(sale?.financedAmount || 0)} />
              </InfoGrid>
              <p className="text-[11px] text-indigo-700 mt-2">
                Customer owes nothing. {money(sale?.financedAmount || 0)} is due to the shop from{' '}
                {sale?.financeProvider || sale?.paymentMethod}.
              </p>
            </div>
          )}

          {sale?.paymentMethod === 'Split' && (
            <div className="bg-gray-50 rounded-xl p-3 mt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Cash</span><span>{money(sale?.splitCash)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>UPI</span><span>{money(sale?.splitUpi)}</span>
              </div>
            </div>
          )}

          {(sale?.totalProfit !== undefined || sale?.walletCredited > 0) && (
            <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
              {sale?.totalProfit !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748b]">Profit</span>
                  <span className={`font-semibold ${(sale?.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>
                    {money(sale?.totalProfit || 0)}
                  </span>
                </div>
              )}
              {sale?.walletCredited > 0 && (
                <div className="flex justify-between text-xs text-[#002395]">
                  <span><i className="fas fa-wallet mr-1"></i>Wallet Credited</span>
                  <span>+{money(sale?.walletCredited)}</span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── NOTES ── */}
        {sale?.notes && (
          <Section
            icon="fa-note-sticky"
            title="Notes"
            hint="For the shop only. Unlike a service order's suggestions, nothing here is printed on the customer's invoice."
          >
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{sale?.notes}</p>
          </Section>
        )}

        {/* ── DUE PAYMENT SHEET ── */}
        {showDueDialog && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div {...dueSheet} className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl pb-safe">
              <div {...dueHandle} aria-label="Drag down to close" className="md:hidden flex justify-center pt-2.5 pb-1">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#0f172a]">Collect Due</h3>
                  <p className="text-xs text-[#64748b]">Balance due {money(sale?.balanceDue)}</p>
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
