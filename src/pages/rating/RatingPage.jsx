import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const RatingPage = () => {
  const { token } = useParams();
  const [ratingDoc, setRatingDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchRating = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'ratings', token));
        if (!docSnap.exists()) {
          setError('Invalid or expired link');
        } else {
          const data = docSnap.data();
          if (data.isUsed) {
            setSuccess(true);
          }
          setRatingDoc(data);
        }
      } catch (err) {
        console.error("Error fetching rating link:", err);
        setError('An error occurred. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchRating();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      alert("Please select a star rating first.");
      return;
    }

    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'ratings', token), {
        rating: rating,
        comment: comment,
        status: 'submitted',
        submittedAt: Timestamp.now(),
        isUsed: true
      });
      setSuccess(true);
    } catch (err) {
      console.error("Error submitting rating:", err);
      alert("Failed to submit rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
  <div className="min-h-screen bg-[#f8fafc]">

    {/* HEADER */}
    <div className="bg-[#002395] px-4 py-6 text-center">
      <p className="text-white/70 text-xs uppercase tracking-widest mb-1">French Mobiles</p>
      <h1 className="text-white font-bold text-xl">Rate Our Service</h1>
    </div>

    <div className="px-4 py-6 max-w-md mx-auto space-y-4">

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-[#002395] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <i className="fas fa-exclamation-circle text-4xl text-red-400 mb-3 block"></i>
          <h2 className="text-lg font-bold text-red-900 mb-2">Oops!</h2>
          <p className="text-red-600">{error}</p>
        </div>
      ) : success || ratingDoc?.isUsed ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-check text-green-600 text-3xl"></i>
          </div>
          <h2 className="text-xl font-bold text-[#0f172a] mb-2">Thank You! 🎉</h2>
          <p className="text-gray-500 text-sm">Your feedback helps us serve you better.</p>
        </div>
      ) : (
        <>
          {/* SERVICE INFO */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Service Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400">Device</p>
                <p className="font-semibold text-[#0f172a] text-sm">
                  {ratingDoc.brand} {ratingDoc.model}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Technician</p>
                <p className="font-semibold text-[#0f172a] text-sm">{ratingDoc.technicianName}</p>
              </div>
            </div>
          </div>

          {/* WALLET BALANCE */}
          {ratingDoc.walletBalance > 0 && (
            <div className="bg-[#002395]/5 rounded-xl p-3 text-center">
              <i className="fas fa-wallet text-[#002395] mr-2"></i>
              <span className="text-sm font-semibold text-[#002395]">
                Your wallet balance: ₹{ratingDoc.walletBalance}
              </span>
            </div>
          )}

          {/* STAR RATING */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-center font-semibold text-[#0f172a] mb-4">
              How was your experience?
            </p>
            <div className="flex justify-center gap-3 mb-2">
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="transition active:scale-90"
                >
                  <i className={`fas fa-star text-4xl ${
                    star <= rating ? 'text-yellow-400' : 'text-gray-200'
                  }`}></i>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-sm text-gray-500">
                {rating === 1 ? 'Poor' :
                 rating === 2 ? 'Fair' :
                 rating === 3 ? 'Good' :
                 rating === 4 ? 'Very Good' :
                 'Excellent!'}
              </p>
            )}
          </div>

          {/* COMMENT */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tell us more (optional)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>

          {/* SUBMIT */}
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="w-full bg-[#002395] text-white rounded-xl py-3 font-bold text-base disabled:opacity-50 active:scale-95 transition"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </>
      )}

    </div>
  </div>
);
};

export default RatingPage;
