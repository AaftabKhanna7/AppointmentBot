import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, User, AlertTriangle, CheckCircle, Download, Edit2, FileText, Upload, Table, Clock } from 'lucide-react';

// --- Firebase Configuration ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

let app, auth, db, appId;
if (typeof __firebase_config !== 'undefined') {
  const firebaseConfig = JSON.parse(__firebase_config);
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
}

// --- Constants & Options ---
const EAST_DESTINATIONS = [
  "SFC – 7275 - Vaughan",
  "DFC – 7340 - Bolton",
  "MDO – 7364 - Montreal",
  "MDO – 7403 - Woodstock",
  "MDO – 7406 - Moncton",
  "SFC – 7410 - AVRO",
  "FDC – 7411 - AVRO (flatbeds only)"
];

const WEST_DESTINATIONS = [
  "SFC – 7279 - Calgary",
  "DFC – 7347 - Calgary",
  "MDO – 7348 - Surrey",
  "MDO – 7405 - Winnipeg",
  "MDO – 7412 - Acheson",
  "FDC – 7417 - Acheson"
];

const TIME_SLOTS = [
  "8:00 AM - 9:00 AM",
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM"
];

// Paste the URL of your specific logo here:
const CUSTOM_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/The_Home_Depot.svg/120px-The_Home_Depot.svg.png";

// --- Utility Functions ---
const calculateBookingDate = (region) => {
  if (!region) return null;
  const tz = region === 'East' ? 'America/New_York' : 'America/Denver';
  const now = new Date();
  
  // Format based on target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: 'numeric',
    weekday: 'long'
  });
  
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const weekday = parts.find(p => p.type === 'weekday').value;

  const isMissedCutoff = hour >= 14; // 2 PM or later
  const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';

  let popupMessage = null;
  let reviewMessage = "Standard business day appointment.";
  let daysToAdd = 0;

  if (isWeekend && isMissedCutoff) {
    popupMessage = `Notice: You missed the cut off time. Since it is the weekend, the appointment will be booked for next Tuesday.`;
    reviewMessage = "Booked for Next Tuesday (Weekend + Missed Cutoff)";
    daysToAdd = weekday === 'Saturday' ? 3 : 2; 
  } else if (isMissedCutoff) {
    popupMessage = `Notice: You need to book for the next day as you missed the cut off time of 2 PM (${region === 'East' ? 'EST' : 'MST'}).`;
    reviewMessage = "Booked for Next Day (Missed Cutoff)";
    daysToAdd = 1;
  } else if (isWeekend) {
    popupMessage = `Notice: Since it is the weekend, the appointment will be booked for the next business day.`;
    reviewMessage = "Booked for Next Business Day (Weekend Booking)";
    daysToAdd = weekday === 'Saturday' ? 2 : 1;
  } else {
    reviewMessage = "Booked for Today";
  }

  // Calculate the actual logical date string to track slot availability
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysToAdd);
  const targetDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD format

  return {
    tzUsed: region === 'East' ? 'EST' : 'MST',
    hourLocal: hour,
    isMissedCutoff,
    isWeekend,
    popupMessage,
    reviewMessage,
    targetDateStr
  };
};

export default function App() {
  // --- Auth & Data State ---
  const [user, setUser] = useState(null);
  const [allBookings, setAllBookings] = useState([]);

  // --- UI State Management ---
  const [step, setStep] = useState(1);
  const [history, setHistory] = useState([]);
  const [data, setData] = useState({
    needAppointment: null,
    region: null,
    destination: null,
    isApplianceDropOff: null,
    loadType: null,
    idType: 'Shipment ID',
    idValue: '',
    hasBol: null,
    bolFile: null,
    skidCount: '',
    vendorName: '',
    carrierName: '',
    trailerNumber: '',
    selectedSlot: ''
  });

  // Modals & Popups
  const [errorMsg, setErrorMsg] = useState(null);
  const [showLiveLoadWarning, setShowLiveLoadWarning] = useState(false);
  const [timeWarning, setTimeWarning] = useState(null);
  const [calculatedTime, setCalculatedTime] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const chatEndRef = useRef(null);

  // --- Firebase Initialization Effects ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth failed:", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    // Public collection since slots are shared across all carriers
    const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bookings');
    
    const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
      const fetchedBookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllBookings(fetchedBookings);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, step]);

  // --- Derived State for Slots ---
  const availableSlots = useMemo(() => {
    if (!calculatedTime?.targetDateStr || !data.destination) return TIME_SLOTS;
    
    const bookedForDayAndDest = allBookings
      .filter(b => b.date === calculatedTime.targetDateStr && b.destination === data.destination)
      .map(b => b.slot);

    return TIME_SLOTS.filter(slot => !bookedForDayAndDest.includes(slot));
  }, [allBookings, calculatedTime, data.destination]);

  // --- Core Chat Engine ---
  const getQuestionText = (s) => {
    switch(s) {
      case 1: return "Do you need to book an appointment?";
      case 2: return "Is the appointment for East or West?";
      case 3: return "Choose destination";
      case 4: return "Is it an appliance drop off?";
      case 5: return "Is it a Live Load or a Drop Load?";
      case 6: return "Enter Shipment ID or Purchase Order (PO)";
      case 7: return "Do you have a BOL Number?";
      case 8: return "Enter the SKID Count (Must be under 999).";
      case 9: return "Enter Vendor/Shipper name.";
      case 10: return "Enter Carrier name.";
      case 11: return "Enter Trailer Number.";
      case 12: return `Based on scheduling rules, your booking date is ${calculatedTime?.targetDateStr}. Please select an available time slot.`;
      case 13: return "Please review all the information entered. Are you ready to submit?";
      default: return "";
    }
  };

  const advanceChat = (field, value, displayAnswer) => {
    setData(prev => ({ ...prev, [field]: value }));
    setHistory(prev => [...prev, {
      question: getQuestionText(step),
      answer: displayAnswer
    }]);

    let nextStep = step + 1;

    // Custom Pathing Logic
    if (step === 3) {
      const isDfcMdo = (value || '').includes('DFC') || (value || '').includes('MDO');
      if (!isDfcMdo) nextStep = 5; // Skip appliance drop off
    }

    // Timezone Check occurs right before showing available slots (Step 12)
    if (nextStep === 12) {
      const timeInfo = calculateBookingDate(field === 'region' ? value : data.region);
      setCalculatedTime(timeInfo);
      if (timeInfo.popupMessage) {
        setTimeWarning({ message: timeInfo.popupMessage, next: 12 });
        return; // Pause advancement until warning is acknowledged
      }
    }

    setStep(nextStep);
  };

  // --- Excel Generation & Submission Engine ---
  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      // 1. Save Booking to Firebase
      if (db && user) {
        const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bookings');
        await addDoc(bookingsRef, {
          date: calculatedTime.targetDateStr,
          destination: data.destination,
          slot: data.selectedSlot,
          userId: user.uid,
          timestamp: new Date().toISOString()
        });
      }

      // 2. Generate Excel
      await new Promise((resolve, reject) => {
        if (window.XLSX) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const exportData = [
        { "Booking Field": "Region", "Entered Value": data.region || 'N/A' },
        { "Booking Field": "Destination", "Entered Value": data.destination || 'N/A' },
        { "Booking Field": "Load Type", "Entered Value": data.loadType || 'N/A' }
      ];

      if (data.loadType === 'Live Load') {
        exportData.push({ "Booking Field": "Live Load Acknowledgement", "Entered Value": "Confirmed >15 single stack pallets" });
      }

      if (data.isApplianceDropOff !== null) {
        exportData.push({ "Booking Field": "Appliance Drop Off", "Entered Value": data.isApplianceDropOff });
      }

      exportData.push(
        { "Booking Field": data.idType, "Entered Value": data.idValue || 'N/A' },
        { "Booking Field": "BOL Status", "Entered Value": data.hasBol ? `Uploaded: ${data.bolFile}` : 'No BOL provided' },
        { "Booking Field": "Skid Count", "Entered Value": data.skidCount || 'N/A' },
        { "Booking Field": "Vendor / Shipper", "Entered Value": data.vendorName || 'N/A' },
        { "Booking Field": "Carrier Name", "Entered Value": data.carrierName || 'N/A' },
        { "Booking Field": "Trailer Number", "Entered Value": data.trailerNumber || 'N/A' },
        { "Booking Field": "", "Entered Value": "" }, // Blank separator row
        { "Booking Field": "Booking Date", "Entered Value": calculatedTime?.targetDateStr || 'N/A' },
        { "Booking Field": "Confirmed Time Slot", "Entered Value": data.selectedSlot || 'N/A' },
        { "Booking Field": "System Scheduling Note", "Entered Value": calculatedTime?.reviewMessage || 'N/A' },
        { "Booking Field": "Timezone Applied", "Entered Value": calculatedTime?.tzUsed || 'N/A' }
      );

      const worksheet = window.XLSX.utils.json_to_sheet(exportData);
      worksheet['!cols'] = [{ wch: 30 }, { wch: 50 }];

      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "Booking Summary");
      
      window.XLSX.writeFile(workbook, `Booking_Summary_${data.idValue || 'Export'}.xlsx`);
      setSubmitSuccess(true);
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to generate Excel file or reserve slot. Please check your connection.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- Rendering the Current Input ---
  const renderCurrentInput = () => {
    if (step === 13 || submitSuccess) return null; // Handled separately

    switch(step) {
      case 1: return (
        <div className="flex gap-4">
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => advanceChat('needAppointment', 'Yes', 'Yes')}>Yes</button>
          <button className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300" onClick={() => setErrorMsg("Booking cancelled. You can close this window.")}>No</button>
        </div>
      );
      case 2: return (
        <div className="flex gap-4">
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => advanceChat('region', 'East', 'East')}>East</button>
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => advanceChat('region', 'West', 'West')}>West</button>
        </div>
      );
      case 3: return (
        <div className="flex flex-col gap-3 max-w-sm">
          <select id="input-dest" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" defaultValue="">
            <option value="" disabled>Select destination...</option>
            {(data.region === 'East' ? EAST_DESTINATIONS : WEST_DESTINATIONS).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02] w-full" onClick={() => {
            const val = document.getElementById('input-dest').value;
            if (!val || !val.trim()) { setErrorMsg("Please provide a destination."); return; }
            advanceChat('destination', val, val);
          }}>Submit Destination</button>
        </div>
      );
      case 4: return (
        <div className="flex gap-4">
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => advanceChat('isApplianceDropOff', 'Yes', 'Yes')}>Yes</button>
          <button className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50" onClick={() => advanceChat('isApplianceDropOff', 'No', 'No')}>No</button>
        </div>
      );
      case 5: return (
        <div className="flex gap-4">
          <button className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700" onClick={() => setShowLiveLoadWarning(true)}>Live Load</button>
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => advanceChat('loadType', 'Drop Load', 'Drop Load')}>Drop Load</button>
        </div>
      );
      case 6: return (
        <div className="flex flex-col gap-3 max-w-sm">
          <select id="input-idType" className="p-3 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500" defaultValue={data.idType} onChange={(e) => setData({...data, idType: e.target.value})}>
            <option value="Shipment ID">Shipment ID</option>
            <option value="Purchase Order (PO)">Purchase Order (PO)</option>
          </select>
          <input id="input-idValue" type="text" placeholder={`Enter ${data.idType}`} className="p-3 border border-gray-300 rounded-md uppercase focus:ring-orange-500 focus:border-orange-500" />
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02] w-full" onClick={() => {
            const val = document.getElementById('input-idValue').value.trim();
            if (data.idType === 'Shipment ID' && !/^6100\d{4}$/.test(val)) {
              setErrorMsg("Please enter the correct Shipment ID (Must be 8 digits starting with 6100)."); return;
            }
            if (data.idType === 'Purchase Order (PO)' && !/^([348]\d{7}|5\d{8})$/.test(val)) {
              setErrorMsg("Please enter the correct Purchase Order (PO). Must be 8 digits starting with 3, 4, or 8, OR 9 digits starting with 5."); return;
            }
            advanceChat('idValue', val, `${data.idType}: ${val}`);
          }}>Submit ID</button>
        </div>
      );
      case 7: 
        if (data.hasBol === null) {
          return (
            <div className="flex gap-4">
              <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => setData({...data, hasBol: true})}>Yes</button>
              <button className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50" onClick={() => advanceChat('hasBol', false, 'No BOL provided')}>No</button>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-3 max-w-sm">
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-md text-center bg-gray-50 cursor-pointer hover:bg-gray-100">
              <Upload className="mx-auto text-gray-400 mb-2" />
              <input type="file" accept=".pdf" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" id="input-bolFile" />
            </div>
            <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02] w-full" onClick={() => {
              const fileInput = document.getElementById('input-bolFile');
              if (!fileInput.files.length) { setErrorMsg("Please upload a PDF file."); return; }
              const fileName = fileInput.files[0].name;
              setData(prev => ({...prev, bolFile: fileName}));
              advanceChat('hasBol', true, `Yes (Uploaded: ${fileName})`);
            }}>Submit Document</button>
          </div>
        );
      case 8: return (
        <div className="flex gap-2 max-w-sm">
          <input id="input-skid" type="number" min="1" max="998" placeholder="Number of skids" className="flex-1 p-3 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
          <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => {
            const val = document.getElementById('input-skid').value;
            const num = parseInt(val, 10);
            if (isNaN(num) || num <= 0 || num >= 999) { setErrorMsg("Please enter a valid number under 999."); return; }
            advanceChat('skidCount', num, `${num} Skids`);
          }}>Submit</button>
        </div>
      );
      case 9:
      case 10:
      case 11:
        const fields = { 9: 'vendorName', 10: 'carrierName', 11: 'trailerNumber' };
        const fKey = fields[step];
        return (
          <div className="flex gap-2 max-w-sm">
            <input id={`input-${fKey}`} type="text" placeholder="Enter text..." className="flex-1 p-3 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            <button className="px-6 py-2 bg-[#f96302] text-white rounded-md hover:bg-[#e05a02]" onClick={() => {
              const val = document.getElementById(`input-${fKey}`).value.trim();
              if (!val) { setErrorMsg("This field cannot be empty."); return; }
              advanceChat(fKey, val, val);
            }}>Submit</button>
          </div>
        );
      case 12: 
        if (availableSlots.length === 0) {
          return (
            <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-md">
               <strong>No slots available</strong> for {calculatedTime?.targetDateStr}. Please contact the facility directly to coordinate scheduling.
            </div>
          );
        }
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg">
            {availableSlots.map(slot => (
              <button 
                key={slot} 
                className="px-4 py-3 border border-[#f96302] text-[#f96302] bg-white rounded-md hover:bg-orange-50 hover:shadow-sm font-medium transition-colors flex items-center justify-center gap-2"
                onClick={() => advanceChat('selectedSlot', slot, slot)}
              >
                <Clock size={18} /> {slot}
              </button>
            ))}
          </div>
        );
    }
  };

  // --- Edit Review Logic ---
  const handleSaveEdit = () => {
    let newVal = document.getElementById('edit-input-val')?.value;
    if (typeof newVal === 'string') newVal = newVal.trim();
    
    let updates = { [editingField]: newVal };

    // Validations during edit
    if (editingField === 'skidCount') {
      const num = parseInt(newVal, 10);
      if (isNaN(num) || num <= 0 || num >= 999) { setErrorMsg("Skid count must be a number under 999."); return; }
      updates.skidCount = num;
    }
    if (editingField === 'idValue') {
      const currentType = document.getElementById('edit-idType').value;
      if (currentType === 'Shipment ID' && !/^6100\d{4}$/.test(newVal)) { setErrorMsg("Shipment ID must be 8 digits starting with 6100."); return; }
      if (currentType === 'Purchase Order (PO)' && !/^([348]\d{7}|5\d{8})$/.test(newVal)) { setErrorMsg("PO must be 8 digits starting with 3, 4, 8 or 9 digits starting with 5."); return; }
      updates.idType = currentType;
    }
    
    // Cascading resets
    if (editingField === 'region' && newVal !== data.region) updates.destination = '';
    if (editingField === 'destination') {
      const isDfcMdo = newVal.includes('DFC') || newVal.includes('MDO');
      if (!isDfcMdo) updates.isApplianceDropOff = null;
      // Also reset time slot if destination changes
      updates.selectedSlot = '';
      if (step === 13) setStep(12); // Send back to slot selection
    }

    setData(prev => ({...prev, ...updates}));
    setEditingField(null);
  };

  const DetailRow = ({ label, value, fieldKey }) => (
    <div className="flex justify-between items-center py-3 border-b border-gray-100 group">
      <div>
        <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="block text-sm text-gray-900 mt-1 font-medium">{value || <span className="text-gray-400 italic">Not applicable</span>}</span>
      </div>
      {!isExporting && fieldKey && (
        <button onClick={() => setEditingField(fieldKey)} className="text-[#f96302] hover:text-[#e05a02] p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Edit2 size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans text-gray-800">
      
      {/* Modals Overlay */}
      {(errorMsg || showLiveLoadWarning || timeWarning || editingField) && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
          
          {/* Error Modal */}
          {errorMsg && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border-l-4 border-red-500">
              <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2"><AlertTriangle className="text-red-500"/> Validation Error</h3>
              <p className="text-gray-600 mb-6">{errorMsg}</p>
              <div className="flex justify-end"><button className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 font-medium" onClick={() => setErrorMsg(null)}>Dismiss</button></div>
            </div>
          )}

          {/* Time Warning Modal */}
          {timeWarning && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border-l-4 border-orange-500">
              <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2"><CheckCircle className="text-orange-500"/> Scheduling Notice</h3>
              <p className="text-gray-600 mb-6">{timeWarning.message}</p>
              <div className="flex justify-end">
                <button className="px-6 py-2 bg-[#f96302] text-white rounded hover:bg-[#e05a02] font-medium" onClick={() => {
                  const next = timeWarning.next;
                  setTimeWarning(null);
                  setStep(next);
                }}>Acknowledge</button>
              </div>
            </div>
          )}

          {/* Live Load Warning Modal */}
          {showLiveLoadWarning && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border-l-4 border-amber-500">
              <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2"><AlertTriangle className="text-amber-500"/> Live Load Requirement</h3>
              <p className="text-gray-600 mb-6 font-medium bg-amber-50 p-3 rounded">Please make sure there are more than 15 single stack pallets.</p>
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium" onClick={() => setShowLiveLoadWarning(false)}>Cancel</button>
                <button className="px-6 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-medium" onClick={() => {
                  setShowLiveLoadWarning(false);
                  advanceChat('loadType', 'Live Load', 'Live Load (Acknowledged >15 single stack pallets)');
                }}>I Acknowledge</button>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {editingField && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border-t-4 border-orange-500">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Edit2 size={18}/> Edit Information</h3>
              <div className="mb-6">
                
                {/* Custom Edit Inputs based on field type */}
                {editingField === 'region' && (
                  <select id="edit-input-val" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.region}>
                    <option>East</option><option>West</option>
                  </select>
                )}
                {editingField === 'destination' && (
                  <select id="edit-input-val" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.destination}>
                    {(data.region === 'East' ? EAST_DESTINATIONS : WEST_DESTINATIONS).map(d => <option key={d}>{d}</option>)}
                  </select>
                )}
                {editingField === 'isApplianceDropOff' && (
                  <select id="edit-input-val" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.isApplianceDropOff}>
                    <option>Yes</option><option>No</option>
                  </select>
                )}
                {editingField === 'loadType' && (
                  <select id="edit-input-val" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.loadType}>
                    <option>Drop Load</option><option>Live Load</option>
                  </select>
                )}
                {editingField === 'idValue' && (
                  <div className="flex flex-col gap-3">
                    <select id="edit-idType" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.idType}>
                      <option>Shipment ID</option><option>Purchase Order (PO)</option>
                    </select>
                    <input id="edit-input-val" type="text" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.idValue} />
                  </div>
                )}
                {['vendorName', 'carrierName', 'trailerNumber'].includes(editingField) && (
                  <input id="edit-input-val" type="text" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data[editingField]} />
                )}
                {editingField === 'skidCount' && (
                  <input id="edit-input-val" type="number" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.skidCount} />
                )}
                {editingField === 'selectedSlot' && (
                  <select id="edit-input-val" className="w-full p-3 border rounded focus:ring-orange-500 focus:border-orange-500" defaultValue={data.selectedSlot}>
                    {/* Add current slot back so they don't lose it if they are just viewing, but merge with available */}
                    {[...new Set([data.selectedSlot, ...availableSlots])].filter(Boolean).map(s => <option key={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium" onClick={() => setEditingField(null)}>Cancel</button>
                <button className="px-6 py-2 bg-[#f96302] text-white rounded hover:bg-[#e05a02] font-medium" onClick={handleSaveEdit}>Save Changes</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Interface Container */}
      <div className="w-full max-w-3xl bg-white shadow-xl rounded-xl overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#f96302] text-white p-5 flex items-center gap-4">
          <img 
            src={CUSTOM_LOGO_URL} 
            alt="Company Logo" 
            className="h-12 w-12 object-contain bg-white p-1 shadow-sm rounded"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide">Load Booking Assistant</h1>
            <p className="text-xs text-orange-100 mt-1">Enterprise Logistics Operations</p>
          </div>
        </div>

        {/* Chat / Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col gap-6">
          
          {/* Ongoing Chat View */}
          {step < 13 && !submitSuccess && (
            <>
              {history.map((h, i) => (
                <div key={i} className="flex flex-col gap-4">
                  {/* Bot Bubble */}
                  <div className="flex w-full">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3 mt-1"><Bot size={18} className="text-[#f96302]" /></div>
                    <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-none shadow-sm text-gray-700 text-sm">{h.question}</div>
                  </div>
                  {/* User Bubble */}
                  <div className="flex w-full justify-end">
                    <div className="bg-[#f96302] text-white p-4 rounded-2xl rounded-tr-none shadow-sm text-sm ml-3 font-medium">{h.answer}</div>
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center ml-3 mt-1"><User size={18} className="text-gray-600" /></div>
                  </div>
                </div>
              ))}
              
              {/* Active Question */}
              <div className="flex w-full">
                <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3 mt-1 animate-pulse"><Bot size={18} className="text-[#f96302]" /></div>
                <div className="bg-white border border-orange-200 p-4 rounded-2xl rounded-tl-none shadow-sm text-gray-800 text-sm font-medium border-l-4 border-l-[#f96302]">
                  {getQuestionText(step)}
                </div>
              </div>
              <div className="pl-11 mt-2">
                {renderCurrentInput()}
              </div>
            </>
          )}

          {/* Review & Submit View */}
          {(step === 13 || submitSuccess) && (
            <div id="pdf-export-area" className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                <FileText className="text-[#f96302]" size={28} />
                <h2 className="text-2xl font-bold text-gray-900">Booking Summary</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                <DetailRow label="Region" value={data.region} fieldKey="region" />
                <DetailRow label="Destination" value={data.destination} fieldKey="destination" />
                <DetailRow label="Load Type" value={data.loadType} fieldKey="loadType" />
                {data.isApplianceDropOff !== null && <DetailRow label="Appliance Drop Off" value={data.isApplianceDropOff} fieldKey="isApplianceDropOff" />}
                
                {data.loadType === 'Live Load' && (
                  <div className="col-span-1 md:col-span-2 text-sm text-amber-800 bg-amber-50 p-3 rounded-md border border-amber-200 my-2 flex gap-2 items-center">
                    <CheckCircle size={16} className="text-amber-600"/>
                    <span><strong>Live Load Acknowledgement:</strong> Confirmed there are more than 15 single stack pallets.</span>
                  </div>
                )}

                <DetailRow label={data.idType} value={data.idValue} fieldKey="idValue" />
                <DetailRow label="BOL Status" value={data.hasBol ? `Uploaded: ${data.bolFile}` : 'No BOL provided'} fieldKey={null} />
                <DetailRow label="Skid Count" value={data.skidCount} fieldKey="skidCount" />
                <DetailRow label="Vendor / Shipper" value={data.vendorName} fieldKey="vendorName" />
                <DetailRow label="Carrier Name" value={data.carrierName} fieldKey="carrierName" />
                <DetailRow label="Trailer Number" value={data.trailerNumber} fieldKey="trailerNumber" />
                
                <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-gray-100">
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 flex items-start gap-3">
                    <CheckCircle className="text-[#f96302] mt-0.5" size={20} />
                    <div className="w-full">
                      <span className="block text-sm font-bold text-orange-900">Final Schedule & Slot Assignment</span>
                      
                      <div className="flex justify-between items-center mt-2 p-2 bg-white rounded border border-orange-100">
                         <div>
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Booking Date</span>
                            <span className="block text-sm font-medium">{calculatedTime?.targetDateStr}</span>
                         </div>
                         <div className="text-right group">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Selected Time Slot</span>
                            <div className="flex items-center justify-end gap-2">
                               <span className="block text-sm font-bold text-[#f96302]">{data.selectedSlot}</span>
                               {!isExporting && (
                                  <button onClick={() => setEditingField('selectedSlot')} className="text-orange-500 hover:text-orange-700 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Edit2 size={14} />
                                  </button>
                               )}
                            </div>
                         </div>
                      </div>

                      <span className="block text-xs text-orange-700 mt-2">{calculatedTime?.reviewMessage} ({calculatedTime?.tzUsed})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Footer Actions (Hidden during Excel generation or after success) */}
        {step === 13 && !submitSuccess && !isExporting && (
          <div className="bg-white border-t p-5 flex flex-col gap-3">
             <div className="text-sm text-gray-600 mb-1 font-medium flex items-center gap-2">
                <Bot size={16}/> Are you ready to confirm your slot and submit this appointment?
             </div>
             <div className="flex justify-end gap-4">
               <button className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50 flex items-center gap-2" onClick={() => setErrorMsg("Please click the 'Edit' pencil icon next to any row above to modify your entries.")}>
                 No, I need to edit
               </button>
               <button className="px-6 py-2 bg-[#f96302] text-white font-medium rounded hover:bg-[#e05a02] flex items-center gap-2" onClick={exportToExcel}>
                 <Table size={18} /> Yes, Confirm Slot & Export
               </button>
             </div>
          </div>
        )}

        {/* Success Footer */}
        {submitSuccess && (
          <div className="bg-orange-50 border-t border-orange-200 p-5 flex justify-between items-center">
             <div className="flex items-center gap-3 text-orange-800">
                <CheckCircle size={24} />
                <span className="font-bold">Slot Confirmed & Exported</span>
             </div>
             <button className="px-4 py-2 bg-white border border-orange-300 text-[#f96302] rounded hover:bg-orange-100 text-sm font-medium" onClick={() => window.location.reload()}>
                Start New Booking
             </button>
          </div>
        )}

        {/* Loading Overlay for Excel */}
        {isExporting && (
           <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f96302] mb-4"></div>
              <p className="text-orange-800 font-medium">Securing Slot & Generating Excel...</p>
           </div>
        )}

      </div>
    </div>
  );
}