import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import EnquiryForm from './EnquiryForm';
import Layout from '../../components/common/Layout';

const EnquiryView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    const fetchEnquiry = async () => {
      try {
        const docRef = doc(db, 'enquiries', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEnquiry({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEnquiry();
  }, [id]);

  const handleUpdate = async (data) => {
    await updateDoc(doc(db, 'enquiries', id), data);
    setEnquiry({ id, ...data });
    setShowEdit(false);
  };

  const handleConvertToSale = async () => {
    if (converting || enquiry?.status === 'Converted') return;
    setConverting(true);
    try {
      await updateDoc(doc(db, 'enquiries', id), { status: 'Converted' });
      navigate('/sales', {
        state: {
          customerName: enquiry.customerName,
          customerPhone: enquiry.customerPhone
        }
      });
    } catch (err) {
      console.error(err);
      alert('Failed to convert to sale');
    } finally {
      setConverting(false);
    }
  };

  const openWhatsApp = () => {
    const phone = enquiry.customerPhone.replace(/\D/g, '');
    const message = `Hi ${enquiry.customerName}, thank you for your enquiry at French Mobiles. We will get back to you shortly regarding ${enquiry.modelEnquired}. - French Mobiles`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  if (loading) return <div className="p-4 md:p-8 text-center">Loading...</div>;
  if (!enquiry) return <div className="p-4 md:p-8 text-center text-red-600">Enquiry not found</div>;

return (
  <Layout title="Enquiry Details" pageType="detail" backTo="/enquiries">
    <div className="px-4 py-4 space-y-4">

      {/* MAIN CARD */}
      <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-5 ${
        enquiry?.seriousness === 'Urgent' ? 'border-[#ED2939]' : 'border-[#002395]'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-[#0f172a]">{enquiry?.customerName}</h2>
            <a href={`tel:${enquiry?.customerPhone}`} className="text-green-600 text-sm mt-0.5 flex items-center">
              <i className="fas fa-phone mr-1"></i>
              {enquiry?.customerPhone}
            </a>
            {enquiry?.modelEnquired && (
              <p className="text-[#002395] font-semibold text-sm mt-1">
                <i className="fas fa-mobile-alt mr-1"></i>
                {enquiry?.modelEnquired}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {enquiry?.seriousness === 'Urgent' && (
              <span className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-2 py-0.5 rounded-full font-medium">
                Urgent
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              enquiry?.status === 'Open' ? 'bg-[#002395]/10 text-[#002395]' :
              enquiry?.status === 'Follow-up' ? 'bg-orange-100 text-orange-700' :
              enquiry?.status === 'Converted' ? 'bg-green-100 text-green-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {enquiry?.status}
            </span>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          
            <button onClick={openWhatsApp} className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-2 rounded-xl text-xs font-semibold">
              <i className="fab fa-whatsapp"></i> WhatsApp
            </button>
          {enquiry?.status !== 'Converted' && (
            <button
              onClick={handleConvertToSale}
              disabled={converting}
              className="flex items-center gap-1.5 bg-[#002395]/10 text-[#002395] px-3 py-2 rounded-xl text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="fas fa-receipt"></i> Convert to Sale
            </button>
          )}
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-xs font-semibold"
          >
            <i className="fas fa-edit"></i> Edit
          </button>
        </div>
      </div>

      {/* ENQUIRY DETAILS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Enquiry Details
        </p>
        <div className="grid grid-cols-2 gap-3">
          {enquiry?.budgetMin && (
            <div>
              <p className="text-xs text-gray-400">Budget</p>
              <p className="font-semibold text-[#0f172a] text-sm">
                ₹{enquiry?.budgetMin}
                {enquiry?.budgetMax && ` - ₹${enquiry?.budgetMax}`}
              </p>
            </div>
          )}
          {enquiry?.medium && (
            <div>
              <p className="text-xs text-gray-400">Source</p>
              <p className="font-semibold text-[#0f172a] text-sm">{enquiry?.medium}</p>
            </div>
          )}
          {enquiry?.requiredWithin && (
            <div>
              <p className="text-xs text-gray-400">Required Within</p>
              <p className="font-semibold text-[#0f172a] text-sm">{enquiry?.requiredWithin}</p>
            </div>
          )}
          {enquiry?.createdAt && (
            <div>
              <p className="text-xs text-gray-400">Date</p>
              <p className="font-semibold text-[#0f172a] text-sm">
                {enquiry?.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
              </p>
            </div>
          )}
        </div>
        {enquiry?.notes && (
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{enquiry?.notes}</p>
          </div>
        )}
      </div>

    </div>

    {/* EDIT MODAL */}
    {showEdit && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
        <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
          </div>
          <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0f172a]">Edit Enquiry</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 p-1">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <EnquiryForm
              initialData={enquiry}
              onSave={handleUpdate}
              onCancel={() => setShowEdit(false)}
            />
          </div>
        </div>
      </div>
    )}
  </Layout>
);
};

export default EnquiryView;
