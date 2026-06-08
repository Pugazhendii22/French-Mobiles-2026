import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { uploadImageToCloudinary } from '../../utils/uploadImage'

const sections = [
  { key: 'complaint_types', label: 'Complaint Types', icon: 'fa-tools', color: '#ED2939' },
  { key: 'pre_delivery_checklist', label: 'Pre-Delivery Checklist', icon: 'fa-clipboard-check', color: '#002395' },
  { key: 'brands', label: 'Mobile Brands', icon: 'fa-mobile-alt', color: '#16a34a' },
  { key: 'accessories', label: 'Accessories List', icon: 'fa-box', color: '#f97316' },
  { key: 'ram_options', label: 'RAM Options', icon: 'fa-memory', color: '#0891b2' },
  { key: 'rom_options', label: 'ROM / Storage Options', icon: 'fa-hdd', color: '#7c3aed' }
]

const SettingsPage = () => {
  const navigate = useNavigate()
  const { currentUser, userRole } = useAuth()
  const { settings, updateSetting, clearCache, shopDetails } = useSettings()
  const [newItemText, setNewItemText] = useState({})
  const [editModal, setEditModal] = useState({ open: false, key: '', index: -1, value: '' })
  const [selectedModelBrand, setSelectedModelBrand] = useState('')
  const [newModelText, setNewModelText] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [checklistTab, setChecklistTab] = useState('common')
  const [selectedCategory, setSelectedCategory] = useState('Display')
  const [customCategories, setCustomCategories] = useState([])
  const [newChecklistItem, setNewChecklistItem] = useState({ label: '', type: 'working_notworking' })
  const [shopForm, setShopForm] = useState(shopDetails || {
    name: "THE FRENCH MOBILES",
    address: "225, Thiruvalluvar Salai, Iyyanar Nagar, Raja Nagar, Pudupalaiyam, Puducherry - 605013",
    phone: "+91 99447 01436",
    hours: "10:00 AM - 9:00 PM",
    gstin: "",
    facebook: "https://www.facebook.com/p/The-French-Mobiles-61558967133157/",
    instagram: "https://www.instagram.com/the_french_mobiles",
    whatsapp: "+91 99447 01436",
    warranty_text: "Mobile handset & Chargers are warranted for the period defined by the respective manufacturers. We are not giving warranty and does not hold out any warranty of product sold. Physical and liquid damages will not be covered under warranty terms.",
    invoice_terms: [
      "Goods once sold will not be taken back.",
      "Warranty as per manufacturer terms only.",
      "Physical and liquid damage not covered under warranty.",
      "Please check all goods before leaving the shop.",
      "The shop will not be responsible for any data loss."
    ],
    service_terms: [
      "No warranty / guarantee for Aftermarket Spare Parts, especially for display components.",
      "The shop will not take responsibility for orders/devices not collected within 30 days.",
      "By agreeing, you allow our company to use your personal details such as your name, phone number, and IMEI number for Customer Support, Service Improvement, and Surveys, while keeping your data safe under Privacy Laws."
    ],
    logo_url: "",
    watermark_text: "THE FRENCH MOBILES",
    user_notice: [
      "Please inspect your device carefully when collecting it from our service center.",
      "Physical and liquid damage will not be covered under warranty terms.",
      "Please keep this receipt and present it when collecting your device.",
      "We are not responsible for any data loss during repair."
    ],
    technician_label: "Repair Engineer",
    footer_message: "Thank you for choosing The French Mobiles!"
  })

  useEffect(() => {
    if (shopDetails) {
      setShopForm(shopDetails)
    }
  }, [shopDetails])

  const handleSaveShopDetails = async () => {
    await updateSetting('shop_details', shopForm)
    alert('Shop details saved!')
  }

  const handleAddInvoiceTerm = async () => {
    const text = newItemText['invoice_terms']?.trim()
    if (!text) return
    const updated = [...(shopForm.invoice_terms || []), text]
    const updatedShopForm = { ...shopForm, invoice_terms: updated }
    setShopForm(updatedShopForm)
    await updateSetting('shop_details', updatedShopForm)
    setNewItemText(prev => ({ ...prev, invoice_terms: '' }))
  }

  const handleDeleteInvoiceTerm = async (index) => {
    const updated = [...(shopForm.invoice_terms || [])]
    updated.splice(index, 1)
    const updatedShopForm = { ...shopForm, invoice_terms: updated }
    setShopForm(updatedShopForm)
    await updateSetting('shop_details', updatedShopForm)
  }

  const handleAddServiceTerm = async () => {
    const text = newItemText['service_terms']?.trim()
    if (!text) return
    const updated = [...(shopForm.service_terms || []), text]
    const updatedShopForm = { ...shopForm, service_terms: updated }
    setShopForm(updatedShopForm)
    await updateSetting('shop_details', updatedShopForm)
    setNewItemText(prev => ({ ...prev, service_terms: '' }))
  }

  const handleDeleteServiceTerm = async (index) => {
    const updated = [...(shopForm.service_terms || [])]
    updated.splice(index, 1)
    const updatedShopForm = { ...shopForm, service_terms: updated }
    setShopForm(updatedShopForm)
    await updateSetting('shop_details', updatedShopForm)
  }

  if (userRole !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  const handleAddItem = async (key) => {
    const text = newItemText[key]?.trim()
    if (!text) return
    const currentItems = settings[key]?.items || []
    await updateSetting(key, [...currentItems, text])
    setNewItemText(prev => ({ ...prev, [key]: '' }))
  }

  const handleDeleteItem = async (key, index) => {
    const currentItems = [...(settings[key]?.items || [])]
    currentItems.splice(index, 1)
    await updateSetting(key, currentItems)
  }

  const handleEditItem = (key, index, value) => {
    setEditModal({ open: true, key, index, value })
  }

  const handleAddModel = async () => {
    const text = newModelText.trim()
    if (!text || !selectedModelBrand) return
    const currentModels = { ...(settings.models || {}) }
    const brandModels = [...(currentModels[selectedModelBrand] || [])]
    brandModels.push(text)
    currentModels[selectedModelBrand] = brandModels
    await updateSetting('models', currentModels)
    setNewModelText('')
  }

  const handleDeleteModel = async (brand, index) => {
    const currentModels = { ...(settings.models || {}) }
    const brandModels = [...(currentModels[brand] || [])]
    brandModels.splice(index, 1)
    currentModels[brand] = brandModels
    await updateSetting('models', currentModels)
  }

  const handleEditModel = (brand, index, value) => {
    setEditModal({ open: true, key: 'models', brand, index, value })
  }

  const handleSaveEdit = async () => {
    const trimmed = editModal.value?.trim()
    if (!trimmed) return
    if (editModal.key === 'models') {
      const currentModels = { ...(settings.models || {}) }
      const brandModels = [...(currentModels[editModal.brand] || [])]
      brandModels[editModal.index] = trimmed
      currentModels[editModal.brand] = brandModels
      await updateSetting('models', currentModels)
    } else if (editModal.key === 'invoice_terms') {
      const updated = [...(shopForm.invoice_terms || [])]
      updated[editModal.index] = trimmed
      const updatedShopForm = { ...shopForm, invoice_terms: updated }
      setShopForm(updatedShopForm)
      await updateSetting('shop_details', updatedShopForm)
    } else if (editModal.key === 'service_terms') {
      const updated = [...(shopForm.service_terms || [])]
      updated[editModal.index] = trimmed
      const updatedShopForm = { ...shopForm, service_terms: updated }
      setShopForm(updatedShopForm)
      await updateSetting('shop_details', updatedShopForm)
    } else {
      const currentItems = [...(settings[editModal.key]?.items || [])]
      currentItems[editModal.index] = trimmed
      await updateSetting(editModal.key, currentItems)
    }
    setEditModal({ open: false, key: '', index: -1, value: '' })
  }

  const handleRefreshCache = async () => {
    setRefreshing(true)
    try {
      await clearCache()
      // Success feedback
      setTimeout(() => {
        setRefreshing(false)
      }, 800)
    } catch (error) {
      console.error(error)
      setRefreshing(false)
    }
  }

  const defaultCategories = ["Display", "Camera", "Audio", "Connectivity", "Physical", "SIM", "Security"]
  const categories = Array.from(new Set([
    ...defaultCategories,
    ...customCategories,
    ...(settings.device_checklist?.[checklistTab] || []).map(item => item.category).filter(Boolean)
  ]))

  const filteredItemsWithIndex = (settings.device_checklist?.[checklistTab] || [])
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter(item => (item.category || 'Display') === selectedCategory)

  const handleAddChecklistItem = async () => {
    const label = newChecklistItem.label.trim()
    if (!label) return
    const checklist = { ...(settings.device_checklist || {}) }
    const tabItems = [...(checklist[checklistTab] || [])]
    tabItems.push({ label, type: newChecklistItem.type, category: selectedCategory })
    checklist[checklistTab] = tabItems
    await updateSetting('device_checklist', checklist)
    setNewChecklistItem({ label: '', type: 'working_notworking' })
  }

  const handleDeleteChecklistItem = async (originalIndex) => {
    const checklist = { ...(settings.device_checklist || {}) }
    const tabItems = [...(checklist[checklistTab] || [])]
    tabItems.splice(originalIndex, 1)
    checklist[checklistTab] = tabItems
    await updateSetting('device_checklist', checklist)
  }

  const handleAddCategory = () => {
    const name = prompt('Enter new category name:')
    if (!name?.trim()) return
    const formattedName = name.trim()
    if (!categories.includes(formattedName)) {
      setCustomCategories(prev => [...prev, formattedName])
    }
    setSelectedCategory(formattedName)
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
        <button onClick={() => navigate(-1)} className="text-[#002395] p-1">
          <i className="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 className="text-lg font-bold text-[#0f172a] flex-1">Settings</h1>
      </div>

      <div className="px-4 py-4 space-y-4">

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-4 border-l-4 border-[#002395] pl-3">
            <i className="fas fa-store mr-2"></i>Shop Details
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Logo</label>
              {shopForm.logo_url ? (
                <div className="flex items-center gap-3">
                  <img src={shopForm.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-xl border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => setShopForm(prev => ({...prev, logo_url: ''}))}
                    className="text-xs text-[#ED2939] font-medium"
                  >
                    Remove Logo
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl h-20 cursor-pointer hover:border-[#002395] transition">
                  <i className="fas fa-image text-xl text-gray-300 mb-1"></i>
                  <span className="text-xs text-gray-400">Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files[0]
                      if (!file) return
                      const url = await uploadImageToCloudinary(file)
                      setShopForm(prev => ({...prev, logo_url: url}))
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
              <input type="text" value={shopForm.name}
                onChange={e => setShopForm(prev => ({...prev, name: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea value={shopForm.address} rows={3}
                onChange={e => setShopForm(prev => ({...prev, address: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={shopForm.phone}
                  onChange={e => setShopForm(prev => ({...prev, phone: e.target.value}))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours</label>
                <input type="text" value={shopForm.hours}
                  onChange={e => setShopForm(prev => ({...prev, hours: e.target.value}))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN (optional)</label>
              <input type="text" value={shopForm.gstin}
                onChange={e => setShopForm(prev => ({...prev, gstin: e.target.value}))}
                placeholder="Enter GSTIN when available"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input type="text" value={shopForm.whatsapp}
                onChange={e => setShopForm(prev => ({...prev, whatsapp: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facebook</label>
              <input type="text" value={shopForm.facebook}
                onChange={e => setShopForm(prev => ({...prev, facebook: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
              <input type="text" value={shopForm.instagram}
                onChange={e => setShopForm(prev => ({...prev, instagram: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Text</label>
              <textarea value={shopForm.warranty_text} rows={3}
                onChange={e => setShopForm(prev => ({...prev, warranty_text: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Footer Message</label>
              <input type="text" value={shopForm.footer_message}
                onChange={e => setShopForm(prev => ({...prev, footer_message: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Watermark Text</label>
              <input type="text" value={shopForm.watermark_text || ''}
                onChange={e => setShopForm(prev => ({...prev, watermark_text: e.target.value}))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <button
              onClick={handleSaveShopDetails}
              className="w-full bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold"
            >
              Save Shop Details
            </button>
          </div>
        </div>

        {sections.map(section => (
          <div key={section.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wide border-l-4 pl-3" style={{ color: section.color, borderColor: section.color }}>
                <i className={`fas ${section.icon} mr-2`}></i>
                {section.label}
              </p>
              <span className="text-xs text-gray-400">{settings[section.key]?.items?.length || 0} items</span>
            </div>

            <div className="space-y-2 mb-3">
              {settings[section.key]?.items?.map((item, index) => (
                <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <span className="flex-1 text-sm text-[#0f172a]">{item}</span>
                  <button onClick={() => handleEditItem(section.key, index, item)} className="text-[#002395] p-1">
                    <i className="fas fa-edit text-xs"></i>
                  </button>
                  <button onClick={() => handleDeleteItem(section.key, index)} className="text-[#ED2939] p-1">
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`Add new ${section.label.toLowerCase()} item...`}
                value={newItemText[section.key] || ''}
                onChange={e => setNewItemText(prev => ({ ...prev, [section.key]: e.target.value }))}
                onKeyPress={e => e.key === 'Enter' && handleAddItem(section.key)}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
              />
              <button onClick={() => handleAddItem(section.key)} className="bg-[#002395] text-white rounded-xl px-4 py-2 text-sm font-semibold">
                Add
              </button>
            </div>
          </div>
        ))}

        {/* INVOICE TERMS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wide border-l-4 pl-3 text-[#002395] border-[#002395]">
              <i className="fas fa-file-invoice mr-2"></i>
              Invoice Terms & Conditions
            </p>
            <span className="text-xs text-gray-400">{(shopForm.invoice_terms || []).length} items</span>
          </div>

          <div className="space-y-2 mb-3">
            {(shopForm.invoice_terms || []).map((item, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="flex-1 text-sm text-[#0f172a]">{item}</span>
                <button onClick={() => handleEditItem('invoice_terms', index, item)} className="text-[#002395] p-1">
                  <i className="fas fa-edit text-xs"></i>
                </button>
                <button onClick={() => handleDeleteInvoiceTerm(index)} className="text-[#ED2939] p-1">
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new invoice term..."
              value={newItemText['invoice_terms'] || ''}
              onChange={e => setNewItemText(prev => ({ ...prev, invoice_terms: e.target.value }))}
              onKeyPress={e => e.key === 'Enter' && handleAddInvoiceTerm()}
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
            />
            <button onClick={handleAddInvoiceTerm} className="bg-[#002395] text-white rounded-xl px-4 py-2 text-sm font-semibold">
              Add
            </button>
          </div>
        </div>

        {/* SERVICE TERMS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wide border-l-4 pl-3 text-[#ED2939] border-[#ED2939]">
              <i className="fas fa-tools mr-2"></i>
              Service Terms & Conditions
            </p>
            <span className="text-xs text-gray-400">{(shopForm.service_terms || []).length} items</span>
          </div>

          <div className="space-y-2 mb-3">
            {(shopForm.service_terms || []).map((item, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="flex-1 text-sm text-[#0f172a]">{item}</span>
                <button onClick={() => handleEditItem('service_terms', index, item)} className="text-[#002395] p-1">
                  <i className="fas fa-edit text-xs"></i>
                </button>
                <button onClick={() => handleDeleteServiceTerm(index)} className="text-[#ED2939] p-1">
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new service term..."
              value={newItemText['service_terms'] || ''}
              onChange={e => setNewItemText(prev => ({ ...prev, service_terms: e.target.value }))}
              onKeyPress={e => e.key === 'Enter' && handleAddServiceTerm()}
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
            />
            <button onClick={handleAddServiceTerm} className="bg-[#002395] text-white rounded-xl px-4 py-2 text-sm font-semibold">
              Add
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-3 border-l-4 border-purple-700 pl-3">
            <i className="fas fa-list mr-2"></i>Mobile Models
          </p>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Brand</label>
            <select
              value={selectedModelBrand}
              onChange={e => setSelectedModelBrand(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
            >
              <option value="">Select brand to manage models</option>
              {(settings.brands?.items || []).map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {selectedModelBrand && (
            <>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {(settings.models?.[selectedModelBrand] || []).map((model, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="flex-1 text-sm text-[#0f172a]">{model}</span>
                    <button
                      onClick={() => handleEditModel(selectedModelBrand, index, model)}
                      className="text-[#002395] p-1"
                    >
                      <i className="fas fa-edit text-xs"></i>
                    </button>
                    <button
                      onClick={() => handleDeleteModel(selectedModelBrand, index)}
                      className="text-[#ED2939] p-1"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                ))}
                {(settings.models?.[selectedModelBrand] || []).length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-3">No models added yet</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Add model for ${selectedModelBrand}...`}
                  value={newModelText}
                  onChange={e => setNewModelText(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleAddModel()}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
                />
                <button
                  onClick={handleAddModel}
                  className="bg-[#002395] text-white rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            <i className="fas fa-clipboard-list mr-2"></i>
            Device Checklist
          </p>

          <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-2 border-b border-gray-100">
            {['common', 'iphone', 'android'].map(tab => (
              <button
                key={tab}
                onClick={() => setChecklistTab(tab)}
                className={`flex-shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  checklistTab === tab
                    ? 'bg-[#002395] text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tab === 'common' ? 'Common' :
                 tab === 'iphone' ? (
                   <><i className="fab fa-apple mr-1"></i>iPhone</>
                 ) : (
                   <><i className="fab fa-android mr-1"></i>Android</>
                 )}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 pl-1">
              Select Category
            </label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    selectedCategory === cat
                      ? 'bg-[#002395] text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
              <button
                onClick={handleAddCategory}
                className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100"
              >
                + Add Category
              </button>
            </div>
          </div>

          <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {filteredItemsWithIndex.map((item) => (
              <div key={item.originalIndex} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="flex-1 text-sm text-[#0f172a]">{item.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  item.type === 'yes_no'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {item.type === 'yes_no' ? 'Yes/No' : 'Working'}
                </span>
                <button
                  onClick={() => handleDeleteChecklistItem(item.originalIndex)}
                  className="text-[#ED2939] p-1 hover:text-red-700"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>
            ))}
            {filteredItemsWithIndex.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-3">No items in this category</p>
            )}
          </div>

          {/* Add new item to category */}
          <div className="space-y-2">
            <input
              type="text"
              placeholder={`Item name for ${selectedCategory}...`}
              value={newChecklistItem.label}
              onChange={e => setNewChecklistItem(prev => ({ ...prev, label: e.target.value }))}
              onKeyPress={e => e.key === 'Enter' && handleAddChecklistItem()}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
            />
            <div className="flex gap-2">
              <select
                value={newChecklistItem.type}
                onChange={e => setNewChecklistItem(prev => ({ ...prev, type: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395] bg-white"
              >
                <option value="working_notworking">Working / Not Working</option>
                <option value="yes_no">Yes / No</option>
              </select>
              <button
                onClick={handleAddChecklistItem}
                className="bg-[#002395] text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-800"
              >
                Add to {selectedCategory}
              </button>
            </div>
          </div>
        </div>

        <button 
          onClick={handleRefreshCache} 
          disabled={refreshing}
          className={`w-full bg-white border border-gray-200 text-gray-500 rounded-2xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${refreshing ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
        >
          <i className={`fas ${refreshing ? 'fa-sync animate-spin text-[#002395]' : 'fa-sync'}`}></i>
          {refreshing ? 'Refreshing Cache...' : 'Refresh Settings Cache'}
        </button>
      </div>

      {editModal.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full md:max-w-lg md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
            <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
            </div>
            <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#0f172a]">Edit Item</h2>
                <button onClick={() => setEditModal({ open: false })} className="text-gray-400 p-1">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <input
                type="text"
                value={editModal.value}
                onChange={e => setEditModal(prev => ({ ...prev, value: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditModal({ open: false })} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={handleSaveEdit} className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPage
