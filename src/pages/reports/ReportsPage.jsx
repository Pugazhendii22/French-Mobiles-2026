import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/common/Layout';

const ReportsPage = () => {
  const { userRole } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeTab, setActiveTab] = useState('Sales');

  // Master Data
  const [sales, setSales] = useState([]);
  const [serviceOrders, setServiceOrders] = useState([]);
  const [secondHand, setSecondHand] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (userRole && userRole !== 'admin') {
      navigate('/dashboard');
      return;
    }

    const fetchAll = async () => {
      try {
        const [salSnap, srvSnap, shSnap, prdSnap, custSnap] = await Promise.all([
          getDocs(collection(db, 'sales')),
          getDocs(collection(db, 'service_orders')),
          getDocs(collection(db, 'second_hand_mobiles')),
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'customers')),
        ]);

        const sal = []; salSnap.forEach(d => sal.push({ id: d.id, ...d.data() }));
        const srv = []; srvSnap.forEach(d => srv.push({ id: d.id, ...d.data() }));
        const sh = []; shSnap.forEach(d => sh.push({ id: d.id, ...d.data() }));
        const prd = []; prdSnap.forEach(d => prd.push({ id: d.id, ...d.data() }));
        const cst = []; custSnap.forEach(d => cst.push({ id: d.id, ...d.data() }));

        setSales(sal);
        setServiceOrders(srv);
        setSecondHand(sh);
        setProducts(prd);
        setCustomers(cst);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    fetchAll();
  }, [userRole, navigate]);

  // Filters
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = dateStr.split('T')[0];
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };

  const handlePrintSection = async (sectionId) => {
    if (printing) return;
    setPrinting(true);

    try {
      // Re-fetch fresh data from Firestore before printing
      const [salSnap, srvSnap, shSnap, prdSnap, custSnap] = await Promise.all([
        getDocs(collection(db, 'sales')),
        getDocs(collection(db, 'service_orders')),
        getDocs(collection(db, 'second_hand_mobiles')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'customers')),
      ]);
      const sal = []; salSnap.forEach(d => sal.push({ id: d.id, ...d.data() }));
      const srv = []; srvSnap.forEach(d => srv.push({ id: d.id, ...d.data() }));
      const sh = [];  shSnap.forEach(d  => sh.push({ id: d.id, ...d.data() }));
      const prd = []; prdSnap.forEach(d => prd.push({ id: d.id, ...d.data() }));
      const cst = []; custSnap.forEach(d => cst.push({ id: d.id, ...d.data() }));
      setSales(sal); setServiceOrders(srv); setSecondHand(sh); setProducts(prd); setCustomers(cst);

      // Small delay so React can re-render with fresh data before we snapshot innerHTML
      await new Promise(r => setTimeout(r, 200));

      const sectionContent = document.getElementById(sectionId).innerHTML;

      // Remove any existing overlay
      const existing = document.getElementById('report-print-overlay');
      if (existing) existing.remove();

      const printDiv = document.createElement('div');
      printDiv.id = 'report-print-overlay';
      printDiv.innerHTML = `
        <style>
          #report-print-overlay {
            font-family: Arial, sans-serif;
            font-size: 12px;
            color: #000;
            padding: 15mm;
            background: white;
          }
          #report-print-overlay h2 { font-size: 16px; margin: 16px 0 8px 0; border-bottom: 2px solid #000; padding-bottom: 4px; }
          #report-print-overlay h3 { font-size: 13px; margin: 12px 0 6px 0; }
          #report-print-overlay p { margin-bottom: 4px; }
          #report-print-overlay table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          #report-print-overlay th { background: #f0f0f0; font-weight: bold; text-align: left; padding: 6px 8px; border: 1px solid #ccc; font-size: 11px; }
          #report-print-overlay td { padding: 5px 8px; border: 1px solid #ccc; font-size: 11px; }
          #report-print-overlay tr:nth-child(even) { background: #f9f9f9; }
          #report-print-overlay .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          #report-print-overlay .stat-card { border: 1px solid #ccc; padding: 8px; text-align: center; border-radius: 4px; }
          #report-print-overlay .stat-label { font-size: 10px; color: #666; }
          #report-print-overlay .stat-value { font-size: 16px; font-weight: bold; }
          #report-print-overlay .hidden { display: block !important; }
        </style>
        <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px;">
          <h1 style="font-size:20px;font-weight:bold;margin-bottom:4px;">FRENCH MOBILES</h1>
          <p style="font-size:12px;margin-bottom:2px;">Management Report</p>
          <p style="font-size:11px;color:#666;">Generated: ${new Date().toLocaleString('en-IN')}</p>
        </div>
        ${sectionContent}
      `;
      document.body.appendChild(printDiv);

      setTimeout(() => {
        window.print();
        setTimeout(() => {
          printDiv.remove();
          setPrinting(false);
        }, 1000);
      }, 800);
    } catch (err) {
      console.error('Print error:', err);
      setPrinting(false);
    }
  };

  if (loading) return (
    <Layout title="Management Reports" pageType="list">
      <div className="p-4 md:p-8 text-center text-gray-500">Loading reports...</div>
    </Layout>
  );

  const currentDateTime = new Date().toLocaleString();

  // --- SALES REPORT CALCS ---
  const filteredSales = sales.filter(s => inRange(s.createdAt));
  const totalSalesRev = filteredSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  let newProdRev = 0; let shRev = 0;
  let payCash = 0; let payUpi = 0; let payCard = 0; let paySplit = 0;
  let totalSalesProfit = 0; let totalSalesDiscount = 0; let totalWalletCredited = 0;

  filteredSales.forEach(s => {
    if (s.saleType === 'New Product') newProdRev += Number(s.totalAmount) || 0;
    else shRev += Number(s.totalAmount) || 0;

    if (s.paymentMethod === 'Cash') payCash += Number(s.totalAmount) || 0;
    else if (s.paymentMethod === 'UPI') payUpi += Number(s.totalAmount) || 0;
    else if (s.paymentMethod === 'Card') payCard += Number(s.totalAmount) || 0;
    else if (s.paymentMethod === 'Split') paySplit += Number(s.totalAmount) || 0;

    totalSalesProfit += Number(s.totalProfit) || 0;
    totalSalesDiscount += Number(s.discount) || 0;
    totalWalletCredited += Number(s.walletCredited) || 0;
  });

  // --- SERVICE REPORT CALCS ---
  const filteredSrv = serviceOrders.filter(s => inRange(s.createdAt));
  const totalSrvRev = filteredSrv.reduce((sum, s) => sum + (Number(s.estimatedPrice) || 0), 0);
  const totalSrvProfit = filteredSrv.reduce((sum, s) => sum + (Number(s.serviceProfit) || 0), 0);
  const srvStatus = { completed: 0, pending: 0, returned: 0 };
  filteredSrv.forEach(s => {
    if (s.status === 'Completed') srvStatus.completed++;
    else if (s.status === 'Returned') srvStatus.returned++;
    else srvStatus.pending++;
  });

  // --- INVENTORY REPORT CALCS ---
  const shAvailable = secondHand.filter(s => s.status !== 'sold').length;
  const shSold = secondHand.filter(s => s.status === 'sold').length;
  const prodInStock = products.filter(p => p.status === 'in stock').length;
  const prodLowStock = products.filter(p => p.status === 'low stock').length;
  const prodOutStock = products.filter(p => p.status === 'out of stock').length;

  // --- CUSTOMER REPORT CALCS ---
  const filteredCust = customers.filter(c => inRange(c.createdAt));
  const regularCust = customers.filter(c => c.isRegular).length;

  return (
    <Layout title="Management Reports" pageType="list">
      <div className="min-h-screen bg-[#f8fafc] pb-20 flex-1 min-w-0">
      <div className="px-4 md:px-8 py-4 max-w-7xl mx-auto print:p-0 flex-1 min-w-0">
        <div className="flex flex-col md:flex-row gap-3 mb-6 bg-white rounded-2xl p-4 border border-[#e2e8f0] shadow-sm no-print break-words">
          <div className="flex-1">
            <label className="text-xs font-bold text-[#64748b] uppercase mb-1 block">From Date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full border border-[#e2e8f0] rounded-xl px-4 py-2.5 focus:border-[#002395] break-words" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-bold text-[#64748b] uppercase mb-1 block">To Date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full border border-[#e2e8f0] rounded-xl px-4 py-2.5 focus:border-[#002395] break-words" />
          </div>
          <div className="flex items-end">
            <button onClick={() => {setFromDate(''); setToDate('');}} className="w-full md:w-auto bg-[#002395] text-white rounded-xl px-6 py-2.5 font-semibold break-words">Clear Filters</button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-print">
          <nav className="flex gap-2">
            {['Sales', 'Service', 'Inventory', 'Customers'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${activeTab === tab ? 'bg-[#002395] text-white' : 'bg-white border border-[#e2e8f0] text-[#64748b]'}`}
              >
                {tab} Report
              </button>
            ))}
          </nav>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4 break-words">
          <div className="flex justify-between items-center mb-6 no-print">
            <h2 className="text-2xl font-bold text-gray-900">{activeTab} Report</h2>
            <button
              onClick={() => handlePrintSection(`section-${activeTab}`)}
              disabled={!dataLoaded || printing}
              className="bg-[#002395] text-white px-5 py-2.5 rounded-xl hover:bg-[#001a7a] flex items-center no-print disabled:opacity-60 disabled:cursor-not-allowed font-semibold transition break-words"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              {printing ? 'Preparing...' : !dataLoaded ? 'Loading...' : 'Print Report'}
            </button>
          </div>

          <div id="report-print-area">
            <div id="section-Sales" className={activeTab !== 'Sales' ? 'hidden' : ''}>
              <h2 className="text-lg font-bold border-b mb-4 hidden print:block">Sales Report</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4 stats-grid">
                <h3 className="text-md font-semibold mb-4 hidden print:block">Sales Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Sales</p><p className="text-xl font-bold text-[#002395] stat-value">{filteredSales.length}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Revenue</p><p className="text-xl font-bold text-[#002395] stat-value">₹{totalSalesRev}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">New Product Rev</p><p className="text-xl font-bold text-[#002395] stat-value">₹{newProdRev}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">2nd-Hand Rev</p><p className="text-xl font-bold text-[#002395] stat-value">₹{shRev}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Profit</p><p className="text-xl font-bold text-green-600 stat-value">₹{totalSalesProfit}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Discounts</p><p className="text-xl font-bold text-[#ED2939] stat-value">₹{totalSalesDiscount}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Wallet Credits</p><p className="text-xl font-bold text-[#002395] stat-value">₹{totalWalletCredited}</p></div>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4">
                <h3 className="border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase mb-4 flex items-center justify-between">Payment Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-sm text-[#64748b] flex-shrink-0">Cash</span>
                    <div className="flex-1 bg-[#f8fafc] rounded-full h-3"><div className="bg-[#002395] h-3 rounded-full" style={{ width: `${totalSalesRev ? (payCash / totalSalesRev) * 100 : 0}%` }}></div></div>
                    <span className="text-sm font-bold text-[#0f172a] w-8 text-right flex-shrink-0">{payCash ? Math.round(payCash / 1000) : 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-sm text-[#64748b] flex-shrink-0">UPI</span>
                    <div className="flex-1 bg-[#f8fafc] rounded-full h-3"><div className="bg-[#002395] h-3 rounded-full" style={{ width: `${totalSalesRev ? (payUpi / totalSalesRev) * 100 : 0}%` }}></div></div>
                    <span className="text-sm font-bold text-[#0f172a] w-8 text-right flex-shrink-0">{payUpi ? Math.round(payUpi / 1000) : 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-sm text-[#64748b] flex-shrink-0">Card</span>
                    <div className="flex-1 bg-[#f8fafc] rounded-full h-3"><div className="bg-[#002395] h-3 rounded-full" style={{ width: `${totalSalesRev ? (payCard / totalSalesRev) * 100 : 0}%` }}></div></div>
                    <span className="text-sm font-bold text-[#0f172a] w-8 text-right flex-shrink-0">{payCard ? Math.round(payCard / 1000) : 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-sm text-[#64748b] flex-shrink-0">Split</span>
                    <div className="flex-1 bg-[#f8fafc] rounded-full h-3"><div className="bg-[#002395] h-3 rounded-full" style={{ width: `${totalSalesRev ? (paySplit / totalSalesRev) * 100 : 0}%` }}></div></div>
                    <span className="text-sm font-bold text-[#0f172a] w-8 text-right flex-shrink-0">{paySplit ? Math.round(paySplit / 1000) : 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4">
                <h3 className="border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase mb-4 flex items-center justify-between">Sales List</h3>
                <div className="w-full overflow-x-auto">
                  <table className="w-full" style={{minWidth: '600px'}}>
                    <thead className="bg-[#002395] text-white text-xs font-bold uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Invoice</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Customer</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredSales.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 text-sm break-words">{new Date(s.createdAt).toLocaleDateString()}</td>
                          <td className="px-3 py-2 text-sm break-words">{s.invoiceNumber}</td>
                          <td className="px-3 py-2 text-sm break-words">{s.customerName}</td>
                          <td className="px-3 py-2 text-sm break-words font-bold">₹{s.totalAmount}</td>
                        </tr>
                      ))}
                      {filteredSales.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-3 py-2 text-sm break-words text-center text-gray-500">No sales found in this range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div id="section-Service" className={activeTab !== 'Service' ? 'hidden' : ''}>
              <h2 className="text-lg font-bold border-b mb-4 hidden print:block">Service Report</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4 stats-grid">
                <h3 className="text-md font-semibold mb-4 hidden print:block">Service Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Orders</p><p className="text-xl font-bold text-[#002395] stat-value">{filteredSrv.length}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Revenue</p><p className="text-xl font-bold text-[#002395] stat-value">₹{totalSrvRev}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Service Profit</p><p className="text-xl font-bold text-green-600 stat-value">₹{totalSrvProfit}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words">
                    <p className="text-xs text-[#64748b] mb-1 stat-label">Status Overview</p>
                    <p className="text-sm mt-1">Completed: <span className="font-bold">{srvStatus.completed}</span> | Pending: <span className="font-bold">{srvStatus.pending}</span> | Returned: <span className="font-bold">{srvStatus.returned}</span></p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4">
                <h3 className="border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase mb-4 flex items-center justify-between">Service Orders List</h3>
                <div className="w-full overflow-x-auto">
                  <table className="w-full" style={{minWidth: '600px'}}>
                    <thead className="bg-[#002395] text-white text-xs font-bold uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Order</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Customer</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Status</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Advance Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredSrv.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 text-sm break-words">{new Date(s.createdAt).toLocaleDateString()}</td>
                          <td className="px-3 py-2 text-sm break-words">{s.orderNumber}</td>
                          <td className="px-3 py-2 text-sm break-words">{s.customerName}</td>
                          <td className="px-3 py-2 text-sm break-words">
                            <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#002395]">
                              {s.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm break-words font-bold">₹{s.estimatedPrice || 0}</td>
                          <td className="px-3 py-2 text-sm break-words">₹{s.advancePaid || 0}</td>
                        </tr>
                      ))}
                      {filteredSrv.length === 0 && (
                        <tr>
                          <td colSpan="6" className="px-3 py-2 text-sm break-words text-center text-gray-500">No service orders found in this range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div id="section-Inventory" className={activeTab !== 'Inventory' ? 'hidden' : ''}>
              <h2 className="text-lg font-bold border-b mb-4 hidden print:block">Inventory Report</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4 stats-grid">
                <h3 className="border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase mb-4 flex items-center justify-between">Second-Hand Mobiles Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Available</p><p className="text-xl font-bold text-[#002395] stat-value">{shAvailable}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Sold</p><p className="text-xl font-bold text-[#002395] stat-value">{shSold}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Repaired Before Sale</p><p className="text-xl font-bold text-[#ED2939] stat-value">{secondHand.filter(s => s.wasRepaired).length}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Repair Costs</p><p className="text-xl font-bold text-[#ED2939] stat-value">₹{secondHand.reduce((sum, s) => sum + (Number(s.repairCost) || 0), 0)}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Avg Profit/Mobile</p><p className="text-xl font-bold text-green-600 stat-value">₹{secondHand.length > 0 ? Math.round(secondHand.reduce((sum, s) => sum + (Number(s.profit) || 0), 0) / secondHand.length) : 0}</p></div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4 stats-grid">
                <h3 className="border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase mb-4 flex items-center justify-between">Products (Accessories/New)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">In Stock</p><p className="text-xl font-bold text-[#002395] stat-value">{prodInStock}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Low Stock</p><p className="text-xl font-bold text-[#002395] stat-value">{prodLowStock}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Out of Stock</p><p className="text-xl font-bold text-[#002395] stat-value">{prodOutStock}</p></div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4">
                <h3 className="border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase mb-4 flex items-center justify-between">Available Second-Hand Devices</h3>
                <div className="w-full overflow-x-auto">
                  <table className="w-full" style={{minWidth: '600px'}}>
                    <thead className="bg-[#002395] text-white text-xs font-bold uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Brand/Model</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Specs</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Price</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secondHand.filter(s => s.status !== 'sold').map(s => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 text-sm break-words">{s.brand} {s.model}</td>
                          <td className="px-3 py-2 text-sm break-words">{s.ram} / {s.rom}</td>
                          <td className="px-3 py-2 text-sm break-words font-bold">₹{s.salePrice}</td>
                          <td className={`px-3 py-2 text-sm break-words font-bold ${(Number(s.profit) || 0) >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>₹{Number(s.profit) || 0}</td>
                        </tr>
                      ))}
                      {secondHand.filter(s => s.status !== 'sold').length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-3 py-2 text-sm break-words text-center text-gray-500">No devices available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div id="section-Customers" className={activeTab !== 'Customers' ? 'hidden' : ''}>
              <h2 className="text-lg font-bold border-b mb-4 hidden print:block">Customers Report</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 md:p-6 mb-4 stats-grid">
                <h3 className="text-md font-semibold mb-4 hidden print:block">Customer Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Total Customers</p><p className="text-xl font-bold text-[#002395] stat-value">{customers.length}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">New (in range)</p><p className="text-xl font-bold text-[#002395] stat-value">{filteredCust.length}</p></div>
                  <div className="bg-white rounded-xl p-4 border border-[#e2e8f0] shadow-sm text-center stat-card break-words"><p className="text-xs text-[#64748b] mb-1 stat-label">Regular Customers</p><p className="text-xl font-bold text-[#002395] stat-value">{regularCust}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="fixed bottom-20 left-4 right-4 md:hidden no-print z-40">
        <button
          onClick={() => handlePrintSection(`section-${activeTab}`)}
          disabled={!dataLoaded || printing}
          className="w-full bg-[#002395] text-white rounded-xl py-3 font-bold shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <i className="fas fa-print mr-2"></i>Print Full Report
        </button>
      </div>
      </div>
    </Layout>
  );
};

export default ReportsPage;
