import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/common/Layout';
import { Section } from '../../components/common/ui';
import { buildCustomerImport } from '../../utils/parseVCards';
import { invalidateCustomers } from '../../utils/customerCache';

const BATCH_SIZE = 400;   // Firestore allows 500 writes per batch

const Stat = ({ label, value, tone = '' }) => (
  <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
    <span className="text-xs text-gray-500">{label}</span>
    <span className={`text-sm font-bold ${tone || 'text-[#0f172a]'}`}>{value}</span>
  </div>
);

const ImportContacts = () => {
  const { userRole } = useAuth();
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [written, setWritten] = useState(0);
  const [done, setDone] = useState(false);

  if (userRole !== 'admin') return <Navigate to="/dashboard" replace />;

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setResult(null);
    setDone(false);
    setWritten(0);
    setFileName(file.name);
    setReading(true);
    try {
      const text = await file.text();

      // Existing numbers, so re-running the import cannot create duplicates
      const snap = await getDocs(collection(db, 'customers'));
      const existing = [];
      snap.forEach(d => { if (d.data().phone) existing.push(d.data().phone); });

      setResult(buildCustomerImport(text, existing));
    } catch (err) {
      console.error(err);
      setError('Could not read that file. Make sure it is a .vcf contacts export.');
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    if (!result?.customers?.length) return;
    setImporting(true);
    setError('');
    try {
      const rows = result.customers;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const c of rows.slice(i, i + BATCH_SIZE)) {
          batch.set(doc(collection(db, 'customers')), {
            name: c.name,
            phone: c.phone,
            alternatePhone: c.alternatePhone || '',
            walletBalance: 0,
            walletHistory: [],
            source: 'contacts_import',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        await batch.commit();
        setWritten(Math.min(i + BATCH_SIZE, rows.length));
      }
      invalidateCustomers();
      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Import stopped: ' + err.message + ' (contacts already added were saved)');
    } finally {
      setImporting(false);
    }
  };

  const stats = result?.stats;
  const progress = stats?.ready ? Math.round((written / stats.ready) * 100) : 0;

  return (
    <Layout title="Import Contacts" pageType="form" backTo="/admin/settings">
      <div className="max-w-2xl mx-auto space-y-3">

        <Section icon="fa-address-book" title="Import from phone contacts" hint="Only Indian mobile numbers are added">
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            Export your contacts as a <strong>.vcf</strong> file from your phone, then choose it below.
            The file is read on this device only &mdash; it is never uploaded anywhere.
          </p>

          <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl py-6 cursor-pointer">
            <i className="fas fa-file-import text-[#002395] text-xl"></i>
            <span className="text-sm text-[#002395] font-bold mt-2">
              {fileName || 'Choose .vcf file'}
            </span>
            <input
              type="file"
              accept=".vcf,text/vcard,text/x-vcard"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
          </label>

          {reading && (
            <p className="text-sm text-[#002395] font-semibold mt-3 text-center">
              <i className="fas fa-circle-notch fa-spin mr-2"></i>Reading contacts...
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-[#ED2939] px-4 py-3 rounded-xl text-sm font-medium mt-3">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
            </div>
          )}
        </Section>

        {stats && (
          <Section icon="fa-list-check" title="What will be added">
            <div className="bg-[#002395]/5 border border-[#002395]/20 rounded-xl px-4 py-3 mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-[#002395]">Ready to add</span>
              <span className="text-2xl font-bold text-[#002395]">{stats.ready}</span>
            </div>

            <div className="space-y-2">
              <Stat label="Contacts in file" value={stats.cards} />
              <Stat label="Skipped - no Indian mobile number" value={stats.withoutIndianNumber} tone="text-gray-400" />
              <Stat label="Skipped - duplicate number in file" value={stats.duplicatesInFile} tone="text-gray-400" />
              <Stat label="Skipped - already a customer" value={stats.alreadyInApp} tone="text-gray-400" />
              {stats.unnamed > 0 && (
                <Stat label="Saved under their number (no name)" value={stats.unnamed} tone="text-orange-600" />
              )}
            </div>

            {!done && (
              <button
                onClick={handleImport}
                disabled={importing || !stats.ready}
                className="w-full bg-[#002395] text-white rounded-xl py-3.5 text-sm font-bold mt-4 disabled:opacity-50"
              >
                {importing
                  ? `Adding... ${written} of ${stats.ready}`
                  : `Add ${stats.ready} customers`}
              </button>
            )}

            {importing && (
              <div className="mt-3">
                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-[#002395] h-2 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  Keep this screen open until it finishes
                </p>
              </div>
            )}

            {done && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mt-4 text-center">
                <i className="fas fa-check-circle text-green-600 text-xl"></i>
                <p className="text-sm font-bold text-green-700 mt-1">
                  {written} customers added
                </p>
              </div>
            )}
          </Section>
        )}

      </div>
    </Layout>
  );
};

export default ImportContacts;
