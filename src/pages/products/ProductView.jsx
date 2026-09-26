import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase/firebase';
import ProductForm from './ProductForm';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { generateLabelHTML } from '../../utils/printLabel.jsx';
import PrinterSelector from '../../components/PrinterSelector';
import Layout from '../../components/common/Layout';
import ImageModal from '../../components/common/ImageModal';
import { imageThumb } from '../../utils/imageUrl';
import { invalidateCollection } from '../../utils/collectionCache';

const ProductView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [labelEntry, setLabelEntry] = useState(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [assigningLabel, setAssigningLabel] = useState(false);
  const [showPrinter, setShowPrinter] = useState(false);
  const [labelHTML, setLabelHTML] = useState('');
  const [showProductImage, setShowProductImage] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [showAllModels, setShowAllModels] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const fetchProduct = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'products', id));
      if (docSnap.exists()) setProduct({ id: docSnap.id, ...docSnap.data() });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchLabel = async () => {
    const snap = await getDocs(query(collection(db, 'label_registry'), where('referenceId', '==', id), where('labelType', '==', 'product')));
    if (!snap.empty) setLabelEntry(snap.docs[0].data());
  };

  useEffect(() => { fetchProduct(); fetchLabel(); }, [id]);

  const handleUpdate = async (data) => {
    await updateDoc(doc(db, 'products', id), data);
    invalidateCollection('products');
    setProduct({ id, ...data });
    return id;
  };

  const openLabelDialog = async () => {
    const next = await getLabelNumber();
    setLabelInput(String(next));
    setShowLabelDialog(true);
  };

  const confirmAssign = async () => {
    setAssigningLabel(true);
    try {
      const labelData = {
        labelNumber: Number(labelInput),
        labelType: 'product',
        referenceId: id,
        assignedBy: auth.currentUser?.uid || 'unknown',
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          productName: product.name || '',
          brand: product.brand || '',
          category: product.category || '',
          sku: product.sku || '',
          purchasePrice: Number(product.purchasePrice || 0),
          salePrice: Number(product.salePrice || 0),
          stockQuantity: Number(product.stock || 0),
          imageUrl: product.imageUrl || '',
          notes: product.notes || '',
          createdBy: product.createdBy || '',
          createdAt: product.createdAt || '',
        }
      };
      await addDoc(collection(db, 'label_registry'), labelData);
      setLabelEntry(labelData);
      setShowLabelDialog(false);
    } catch (err) { console.error(err); alert('Failed to assign label.'); }
    finally { setAssigningLabel(false); }
  };

  if (loading) return <div className="p-4 md:p-8 text-center">Loading...</div>;
  if (!product) return <div className="p-4 md:p-8 text-center text-red-600">Product not found</div>;

  return (
    <Layout title="Product Detail" pageType="detail" backTo="/products">
      <div className="min-h-screen bg-[#f8fafc] pb-24">

        {/* HEADER */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
          <button onClick={() => navigate('/products')} className="text-[#002395] p-1">
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <h1 className="text-lg font-bold text-[#0f172a] flex-1">Product Details</h1>
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* MAIN CARD */}
          <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-5 ${
            product?.status === 'out of stock' ? 'border-[#ED2939]' :
            product?.status === 'low stock' ? 'border-orange-500' :
            'border-green-500'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-[#0f172a]">{product?.name}</h2>
                <p className="text-gray-400 text-sm mt-0.5">
                  {product?.brand && `${product?.brand} · `}{product?.category}
                </p>
                {product?.sku && (
                  <p className="text-gray-400 text-xs mt-0.5">SKU: {product?.sku}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    product?.status === 'out of stock' ? 'bg-red-100 text-[#ED2939]' :
                    product?.status === 'low stock' ? 'bg-orange-100 text-orange-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {(product?.status || '').charAt(0).toUpperCase() + (product?.status || '').slice(1)}
                  </span>
                  <span className="text-sm font-semibold text-gray-600">
                    {product?.stock} units
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#002395]">₹{product?.salePrice}</p>
                {product?.purchasePrice && (
                  <p className="text-xs text-gray-400">Cost: ₹{product?.purchasePrice}</p>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 bg-[#002395]/10 text-[#002395] px-3 py-2 rounded-xl text-xs font-semibold"
              >
                <i className="fas fa-edit"></i> Edit
              </button>
              {Number(product?.stock || 0) > 0 && (
                <button
                  onClick={() => {
                    navigate('/sales', {
                      state: {
                        items: [
                          {
                            type: 'New',
                            itemId: product.id,
                            name: product.name,
                            quantity: 1,
                            unitPrice: Number(product.salePrice || product.price || 0),
                            purchaseCost: Number(product.purchasePrice || 0),
                            repairCost: 0,
                            imei: ''
                          }
                        ]
                      }
                    });
                  }}
                  className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-green-700 transition"
                >
                  <i className="fas fa-shopping-cart"></i> Sell Product
                </button>
              )}
              {labelEntry ? (
                <button
                  onClick={() => {
                    const html = generateLabelHTML(labelEntry)
                    setLabelHTML(html)
                    setShowPrinter(true)
                  }}
                  className="flex items-center gap-1.5 bg-[#ED2939]/10 text-[#ED2939] px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  <i className="fas fa-print"></i> Print #{labelEntry.labelNumber}
                </button>
              ) : (
                <button
                  onClick={openLabelDialog}
                  className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  <i className="fas fa-tag"></i> Assign Label
                </button>
              )}
            </div>
          </div>

          {/* PRODUCT INFO */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Product Info
            </p>
            <div className="grid grid-cols-2 gap-3">
              {product?.brand && (
                <div>
                  <p className="text-xs text-gray-400">Brand</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{product?.brand}</p>
                </div>
              )}
              {product?.category && (
                <div>
                  <p className="text-xs text-gray-400">Category</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{product?.category}</p>
                </div>
              )}
              {product?.purchasePrice && (
                <div>
                  <p className="text-xs text-gray-400">Purchase Price</p>
                  <p className="font-semibold text-[#0f172a] text-sm">₹{product?.purchasePrice}</p>
                </div>
              )}
              {product?.threshold && (
                <div>
                  <p className="text-xs text-gray-400">Low Stock Alert</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{product?.threshold} units</p>
                </div>
              )}
            </div>
            {product?.notes && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{product?.notes}</p>
              </div>
            )}
          </div>

          {/* COMPATIBLE MODELS */}
          {product?.compatibleModels?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Compatible Models ({product?.compatibleModels?.length})
              </p>
              <div className="relative mb-3">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Search models..."
                  value={modelSearchQuery}
                  onChange={e => setModelSearchQuery(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
              {(() => {
                const models = product?.compatibleModels || [];
                const filtered = models.filter(m => (m || '').toLowerCase().includes(modelSearchQuery.toLowerCase()));
                const displayed = showAllModels || modelSearchQuery ? filtered : filtered.slice(0, 20);
                if (filtered.length === 0) return <p className="text-gray-400 text-sm">No models found</p>;
                return (
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {displayed.map((model, i) => (
                        <span key={i} className="bg-[#002395]/10 text-[#002395] text-xs px-2.5 py-1 rounded-lg font-medium">
                          {model}
                        </span>
                      ))}
                    </div>
                    {!showAllModels && !modelSearchQuery && filtered.length > 20 && (
                      <button onClick={() => setShowAllModels(true)} className="mt-3 text-xs text-[#002395] font-semibold">
                        Show all ({filtered.length})
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* PRODUCT IMAGE */}
          {product?.imageUrl && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Photo
              </p>
              {showProductImage ? (
                <div className="relative">
                  <img
                    src={imageThumb(product?.imageUrl, 400)}
                    loading="lazy"
                    decoding="async"
                    alt={product?.name}
                    className="w-full h-48 object-contain rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                      setViewerUrl(product?.imageUrl);
                      setViewerTitle(product?.name || 'Product Photo');
                      setViewerOpen(true);
                    }}
                  />
                  <button
                    onClick={() => setShowProductImage(false)}
                    className="absolute top-1 right-1 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                  >
                    Hide
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowProductImage(true)}
                  className="w-full h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-[#002395] text-sm font-medium"
                >
                  <i className="fas fa-image"></i> View Photo
                </button>
              )}
            </div>
          )}

        </div>

        {/* LABEL DIALOG */}
        {showLabelDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="fixed inset-0" onClick={() => setShowLabelDialog(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="text-xl font-bold text-[#0f172a] mb-2">Assign Label Number</h3>
              <p className="text-[#64748b] text-sm mb-4">Assigning to <strong className="text-[#0f172a]">{product?.name}</strong>.</p>
              <input type="number" inputMode="numeric" pattern="[0-9]*" value={labelInput} onChange={e => setLabelInput(e.target.value)} className="w-full border-2 border-[#e2e8f0] focus:border-[#002395] outline-none rounded-xl px-4 py-3 text-2xl font-bold text-center mb-6 text-[#0f172a]" />
              <div className="flex flex-col gap-3">
                <button onClick={confirmAssign} disabled={assigningLabel} className="w-full bg-[#002395] text-white py-3 rounded-xl font-bold disabled:opacity-50">
                  {assigningLabel ? 'Assigning...' : `Confirm #${labelInput}`}
                </button>
                <button onClick={() => setShowLabelDialog(false)} className="w-full bg-white border-2 border-[#e2e8f0] text-[#64748b] py-3 rounded-xl font-bold">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showEdit && (
          <ProductForm initialData={product} onSave={handleUpdate} onCancel={() => setShowEdit(false)} />
        )}

        <PrinterSelector
          isOpen={showPrinter}
          onClose={() => setShowPrinter(false)}
          htmlContent={labelHTML}
          labelEntry={labelEntry}
          title="Print Label"
        />

        <ImageModal
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          imageUrl={viewerUrl}
          title={viewerTitle}
        />

      </div>
    </Layout>
  );
};

export default ProductView;
