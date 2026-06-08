import React, { createContext, useContext, useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase'

const SettingsContext = createContext()

const CACHE_KEY = 'fm_settings_cache_v3'
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

const DEFAULT_SETTINGS = {
  complaint_types: {
    items: [
      'Water locked mobile service',
      'Display replacement',
      'Battery replacement',
      'Battery & coil replacement',
      'Touch glass crack replacement',
      'Charging board replacement',
      'Charging pin fixing',
      'Speaker replacement',
      'Mike replacement service',
      'Motherboard EMMC work',
      'Power IC work',
      'General cleaning',
      'Power button strips replacement inner',
      'Power button strips replacement outer',
      'Volume strip replacement inner',
      'Volume strip replacement outer',
      'Ringer loud speaker replacement',
      'Middle frame replacement',
      'Full body panel Bezel',
      'Back door replacement',
      'Network complaint fix',
      'Tamper glass replacement',
      'Mobile pouch',
      'Watch battery replacement',
      'Watch charging issue or dead',
      'Bluetooth earphone battery replacement',
      'Bluetooth earphone charging issues or dead',
      'Other'
    ]
  },
  pre_delivery_checklist: {
    items: [
      'Front Camera (Clear dust)',
      'Rear Camera (Clear dust)',
      'Earpiece Speaker',
      'Microphone',
      'Loudspeaker',
      'Clean Speaker Filter',
      'Proximity Sensor',
      'Change New Filter if Needed & Possible',
      'Power Button',
      'Volume Buttons',
      'Display Clarity',
      'Mobile Data',
      'Bluetooth',
      'Wi-Fi',
      'Check & Clean Paste and Glue',
      'White Spots on Display',
      'Frame Bent Check (Replace if Needed)',
      'Got Approval from Customer for Additional Services'
    ]
  },
  brands: {
    items: [
      'Samsung', 'Apple', 'Xiaomi', 'Realme', 'OPPO',
      'Vivo', 'OnePlus', 'Nokia', 'Motorola', 'Tecno',
      'Infinix', 'IQOO', 'Nothing', 'Others'
    ]
  },
  accessories: {
    items: [
      'SIM Card',
      'Memory Card',
      'Back Cover',
      'Charger',
      'Earphones',
      'Box',
      'Cable',
      'Adapter',
      'Screen Guard',
      'Other'
    ]
  },
  models: {
    Samsung: ['Galaxy A52', 'Galaxy A53', 'Galaxy A54', 'Galaxy S21', 'Galaxy S22', 'Galaxy S23', 'Galaxy M32', 'Galaxy M33', 'Galaxy F13', 'Galaxy F14'],
    Apple: ['iPhone 11', 'iPhone 12', 'iPhone 12 Mini', 'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 14', 'iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Pro'],
    Xiaomi: ['Redmi 10', 'Redmi 11', 'Redmi Note 11', 'Redmi Note 12', 'Poco X4', 'Poco X5', 'Poco M4', 'Poco M5'],
    Realme: ['Realme 9', 'Realme 10', 'Realme 11', 'Realme C30', 'Realme C33', 'Realme C55', 'Realme Narzo 50'],
    OPPO: ['OPPO A17', 'OPPO A57', 'OPPO A77', 'OPPO A96', 'OPPO Reno 8', 'OPPO Reno 10'],
    Vivo: ['Vivo Y16', 'Vivo Y22', 'Vivo Y35', 'Vivo T1', 'Vivo T2', 'Vivo V25', 'Vivo V27'],
    OnePlus: ['OnePlus Nord CE 2', 'OnePlus Nord CE 3', 'OnePlus Nord 3', 'OnePlus 11', 'OnePlus 11R'],
    Nokia: ['Nokia C21', 'Nokia C31', 'Nokia G21', 'Nokia G42'],
    Motorola: ['Moto G32', 'Moto G42', 'Moto G52', 'Moto G62', 'Moto G73', 'Moto Edge 40'],
    Tecno: ['Tecno Spark 10', 'Tecno Spark 20', 'Tecno Pop 7', 'Tecno Camon 20'],
    Infinix: ['Infinix Hot 20', 'Infinix Hot 30', 'Infinix Note 12', 'Infinix Note 30'],
    Others: []
  },
  ram_options: {
    items: ["1GB", "2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"]
  },
  rom_options: {
    items: ["8GB", "16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"]
  },
  shop_details: {
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
  },
  device_checklist: {
    common: [
      { label: "Display Clarity", type: "working_notworking", category: "Display" },
      { label: "White Spots on Display", type: "yes_no", category: "Display" },
      { label: "Display Replaced", type: "yes_no", category: "Display" },
      { label: "Physical Damage / Bent", type: "yes_no", category: "Physical" }
    ],
    iphone: [
      { label: "Face ID / Touch ID", type: "working_notworking", category: "Security" },
      { label: "iCloud Lock Check", type: "yes_no", category: "Security" },
      { label: "Battery Health %", type: "working_notworking", category: "Battery" },
      { label: "True Tone Display", type: "working_notworking", category: "Display" },
      { label: "Front Camera (Clear dust)", type: "working_notworking", category: "Camera" },
      { label: "Rear Camera (Clear dust)", type: "working_notworking", category: "Camera" },
      { label: "Earpiece Speaker", type: "working_notworking", category: "Audio" },
      { label: "Loudspeaker", type: "working_notworking", category: "Audio" },
      { label: "Microphone", type: "working_notworking", category: "Audio" },
      { label: "Mobile Data", type: "working_notworking", category: "Connectivity" },
      { label: "Bluetooth", type: "working_notworking", category: "Connectivity" },
      { label: "Wi-Fi", type: "working_notworking", category: "Connectivity" },
      { label: "Power Button", type: "working_notworking", category: "Physical" },
      { label: "Volume Buttons", type: "working_notworking", category: "Physical" },
      { label: "Mute Switch", type: "working_notworking", category: "Physical" },
      { label: "Lightning / USB-C Port", type: "working_notworking", category: "Physical" },
      { label: "SIM Slot", type: "working_notworking", category: "SIM" },
      { label: "Flashlight", type: "working_notworking", category: "Physical" }
    ],
    android: [
      { label: "Fingerprint Sensor", type: "working_notworking", category: "Security" },
      { label: "Face Unlock", type: "working_notworking", category: "Security" },
      { label: "Front Camera (Clear dust)", type: "working_notworking", category: "Camera" },
      { label: "Rear Camera (Clear dust)", type: "working_notworking", category: "Camera" },
      { label: "Earpiece Speaker", type: "working_notworking", category: "Audio" },
      { label: "Loudspeaker", type: "working_notworking", category: "Audio" },
      { label: "Microphone", type: "working_notworking", category: "Audio" },
      { label: "Mobile Data", type: "working_notworking", category: "Connectivity" },
      { label: "Bluetooth", type: "working_notworking", category: "Connectivity" },
      { label: "Wi-Fi", type: "working_notworking", category: "Connectivity" },
      { label: "Power Button", type: "working_notworking", category: "Physical" },
      { label: "Volume Buttons", type: "working_notworking", category: "Physical" },
      { label: "Charging Port", type: "working_notworking", category: "Physical" },
      { label: "SIM Slot 1", type: "working_notworking", category: "SIM" },
      { label: "SIM Slot 2", type: "working_notworking", category: "SIM" },
      { label: "SD Card Slot", type: "working_notworking", category: "SIM" },
      { label: "Flashlight", type: "working_notworking", category: "Physical" },
      { label: "Proximity Sensor", type: "working_notworking", category: "Physical" }
    ]
  }
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        const age = Date.now() - timestamp
        if (age < CACHE_EXPIRY_MS) {
          setSettings(data)
          setLoading(false)
          return
        }
      }

      const keys = ['complaint_types', 'pre_delivery_checklist', 'brands', 'accessories', 'models', 'ram_options', 'rom_options', 'device_checklist', 'shop_details']
      const docs = await Promise.all(
        keys.map(key => getDoc(doc(db, 'settings', key)))
      )

      const newSettings = {}
      const missingKeys = []

      docs.forEach((docSnap, i) => {
        const key = keys[i]
        if (docSnap.exists()) {
          if (key === 'shop_details') {
            newSettings[key] = { ...DEFAULT_SETTINGS.shop_details, ...docSnap.data() }
          } else {
            newSettings[key] = docSnap.data()
          }
        } else {
          newSettings[key] = DEFAULT_SETTINGS[key]
          missingKeys.push(key)
        }
      })

      if (missingKeys.length > 0) {
        await Promise.all(
          missingKeys.map(key => setDoc(doc(db, 'settings', key), DEFAULT_SETTINGS[key]))
        )
      }

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: newSettings,
        timestamp: Date.now()
      }))

      setSettings(newSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      setSettings(DEFAULT_SETTINGS)
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = async (key, items) => {
    try {
      if (key === 'models') {
        await setDoc(doc(db, 'settings', key), items)
      } else if (key === 'device_checklist') {
        await setDoc(doc(db, 'settings', key), items)
      } else if (key === 'shop_details') {
        await setDoc(doc(db, 'settings', key), items)
      } else {
        await setDoc(doc(db, 'settings', key), { items })
      }
      const newSettings = { ...settings, [key]: key === 'models' || key === 'device_checklist' || key === 'shop_details' ? items : { items } }
      setSettings(newSettings)
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: newSettings,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('Failed to update setting:', error)
      throw error
    }
  }

  const clearCache = async () => {
    localStorage.removeItem(CACHE_KEY)
    await loadSettings()
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        updateSetting,
        clearCache,
        shopDetails: { ...DEFAULT_SETTINGS.shop_details, ...settings.shop_details },
        complaintTypes: settings.complaint_types?.items || [],
        preDeliveryChecklist: settings.pre_delivery_checklist?.items || [],
        brands: settings.brands?.items || [],
        accessories: settings.accessories?.items || [],
        models: settings.models || {},
        ramOptions: settings.ram_options?.items || ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"],
        romOptions: settings.rom_options?.items || ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB"],
        deviceChecklist: settings.device_checklist || { common: [], iphone: [], android: [] }
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)

export function normalizeChecklistItems(checklist, brand) {
  if (!checklist) return []
  if (Array.isArray(checklist)) return checklist.flatMap(c => c.items || [])
  if ('common' in checklist || 'iphone' in checklist || 'android' in checklist) {
    const isApple = brand?.toLowerCase() === 'apple'
    const common = checklist.common || []
    const specific = isApple ? (checklist.iphone || []) : (checklist.android || [])
    return [...common, ...specific]
  }
  if (checklist.categories) return checklist.categories.flatMap(c => c.items || [])
  return Object.values(checklist).flat()
}

export function isBrandBasedChecklist(checklist) {
  if (!checklist) return false
  if (Array.isArray(checklist)) return false
  return 'common' in checklist || 'iphone' in checklist || 'android' in checklist
}
