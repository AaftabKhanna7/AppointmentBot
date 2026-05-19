import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, UploadCloud, FileText, CheckCircle2, AlertTriangle, Edit, Paperclip, Calendar, Clock, LayoutDashboard, Download, ArrowLeft, Mail, FolderUp, Reply } from 'lucide-react';

const EAST_DESTINATIONS = [
  "SFC - 7275 - Vaughan", "DFC - 7340 - Bolton", "MDO - 7364 - Montreal",
  "MDO - 7403 - Woodstock", "MDO - 7406 - Moncton", "SFC - 7410 - AVRO", "FDC - 7411 - AVRO (flatbeds only)"
];

const WEST_DESTINATIONS = [
  "SFC - 7279 - Calgary", "DFC - 7347 - Calgary", "MDO - 7348 - Surrey",
  "MDO - 7405 - Winnipeg", "MDO - 7412 - Acheson", "FDC - 7417 - Acheson"
];

const ALL_TIME_SLOTS = ["8:00 AM - 9:00 AM", "9:00 AM - 10:00 AM", "10:00 AM - 11:00 AM", "11:00 AM - 12:00 PM"];

const CUSTOM_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/The_Home_Depot.svg/120px-The_Home_Depot.svg.png";

// Helper to check cutoff warnings
const checkCutoffTime = (region) => {
  const timeZone = region === 'East' ? 'America/New_York' : 'America/Denver';
  const localDateString = new Date().toLocaleString("en-US", { timeZone });
  const localDate = new Date(localDateString);
  const day = localDate.getDay(); 
  const hour = localDate.getHours();
  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return "Notice: Weekend handling is in effect. Your appointment will be booked for the following Tuesday.";
  } else if (day === 5 && hour >= 14) {
    return "Notice: It is Friday after the 2 PM cut-off time. Your appointment will be booked for the following Tuesday.";
  } else if (hour >= 14) {
    return "Notice: You missed the 2 PM cut-off time. Your appointment will be booked for the next valid business day.";
  }
  return null;
};

// Helper to precisely calculate the Target Date based on Cutoff rules
const calculateTargetDate = (region) => {
  const timeZone = region === 'East' ? 'America/New_York' : 'America/Denver';
  const localDateString = new Date().toLocaleString("en-US", { timeZone });
  const localDate = new Date(localDateString);
  const day = localDate.getDay();
  const hour = localDate.getHours();

  let addDays = 0; // Default to today (before 2 PM)

  if (day === 6) { // Saturday -> Tuesday
    addDays = 3;
  } else if (day === 0) { // Sunday -> Tuesday
    addDays = 2;
  } else if (day === 5 && hour >= 14) { // Friday after 2 PM -> Tuesday
    addDays = 4; 
  } else if (hour >= 14) { // Monday-Thursday after 2 PM -> Next valid business day
    addDays = 1;
  }

  localDate.setDate(localDate.getDate() + addDays);

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const date = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

const Modal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "OK", cancelText = "Cancel", isWarning = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          {isWarning ? <AlertTriangle className="text-amber-500 w-6 h-6" /> : <Bot className="text-[#f96302] w-6 h-6" />}
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        </div>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              {cancelText}
            </button>
          )}
          <button onClick={onConfirm} className="px-4 py-2 bg-[#f96302] hover:bg-[#e05a02] text-white rounded-lg transition-colors font-medium">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  // --- View State ---
  const [viewMode, setViewMode] = useState('vendor'); // 'vendor' | 'admin'

  // --- Vendor Chatbot State ---
  const [messages, setMessages] = useState([{ id: 1, sender: 'bot', text: 'Hello! Do you need to book an appointment?' }]);
  const [step, setStep] = useState('INIT');
  const [data, setData] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [tempIdType, setTempIdType] = useState('Shipment ID');
  const [modalConfig, setModalConfig] = useState({ isOpen: false });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [targetDate, setTargetDate] = useState('');
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  // --- Shared State Variables (Admin) ---
  const [allRequests, setAllRequests] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // --- Admin Reply Modal State ---
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [activeReplyReq, setActiveReplyReq] = useState(null);
  const [replyType, setReplyType] = useState('slot1'); // 'slot1', 'slot2', 'slot3', 'other'
  const [customTimeMsg, setCustomTimeMsg] = useState('');

  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    if (viewMode === 'vendor') {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };
  useEffect(() => scrollToBottom(), [messages, viewMode]);

  // --- Chatbot Engine Logic ---
  const addMessage = (sender, text, isFile = false) => {
    setMessages(prev => [...prev, { id: Date.now(), sender, text, isFile }]);
  };

  const updateData = (key, value) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const handleValidationMessage = (message) => {
    setModalConfig({
      isOpen: true,
      title: "Invalid Input",
      message: message,
      isWarning: true,
      onConfirm: () => setModalConfig({ isOpen: false })
    });
  };

  const handleRestartBooking = () => {
    setMessages([{ id: Date.now(), sender: 'bot', text: 'Hello! Do you need to book an appointment?' }]);
    setStep('INIT');
    setData({});
    setInputValue('');
    setTempIdType('Shipment ID');
    setTargetDate('');
    setEditErrors({});
    setEditData({});
    setModalConfig({ isOpen: false });
  };

  const handleAction = (value, customDisplay = null) => {
    if (value === null) return;
    addMessage('user', customDisplay || value);
    setInputValue('');
    setTimeout(() => processStepLogic(value), 400);
  };

  const processStepLogic = (userValue) => {
    switch (step) {
      case 'INIT':
        if (userValue === 'Yes') {
          updateData('needsAppointment', 'Yes');
          addMessage('bot', 'Great. Is the appointment for East or West?');
          setStep('REGION');
        } else {
          addMessage('bot', 'Okay, let me know if you need anything else!');
          setStep('END');
        }
        break;

      case 'REGION':
        updateData('region', userValue);
        const options = userValue === 'East' ? EAST_DESTINATIONS : WEST_DESTINATIONS;
        addMessage('bot', `Please choose your destination from the following options:`);
        setStep('DESTINATION');
        break;

      case 'DESTINATION':
        updateData('destination', userValue);
        if (userValue.includes('DFC') || userValue.includes('MDO')) {
          addMessage('bot', 'Is it an appliance drop off?');
          setStep('APPLIANCE_DROP');
        } else {
          updateData('applianceDropOff', 'N/A');
          addMessage('bot', 'Is it a Live Load or a Drop Load?');
          setStep('LOAD_TYPE');
        }
        break;

      case 'APPLIANCE_DROP':
        updateData('applianceDropOff', userValue);
        addMessage('bot', 'Is it a Live Load or a Drop Load?');
        setStep('LOAD_TYPE');
        break;

      case 'LOAD_TYPE':
        updateData('loadType', userValue);
        if (userValue === 'Live Load') {
          setModalConfig({
            isOpen: true,
            title: "Live Load Warning",
            message: "Please make sure there are more than 15 single stack pallets.",
            confirmText: "I acknowledge",
            isWarning: true,
            onConfirm: () => {
              updateData('liveLoadAcknowledged', 'Yes');
              setModalConfig({ isOpen: false });
              addMessage('bot', 'Enter Shipment ID or Purchase Order (PO)');
              setStep('ID_ENTRY');
            }
          });
        } else {
          addMessage('bot', 'Enter Shipment ID or Purchase Order (PO)');
          setStep('ID_ENTRY');
        }
        break;

      case 'ID_ENTRY':
        updateData('idType', tempIdType);
        updateData('idValue', userValue);
        addMessage('bot', 'Do you have a BOL Number?');
        setStep('BOL_ASK');
        break;

      case 'BOL_ASK':
        updateData('hasBol', userValue);
        if (userValue === 'Yes') {
          addMessage('bot', 'Please upload your BOL PDF file.');
          setStep('BOL_UPLOAD');
        } else {
          addMessage('bot', 'Enter the SKID Count.');
          setStep('SKID_COUNT');
        }
        break;

      case 'BOL_UPLOAD':
        updateData('bolFile', userValue);
        addMessage('bot', 'Enter the SKID Count.');
        setStep('SKID_COUNT');
        break;

      case 'SKID_COUNT':
        updateData('skidCount', userValue);
        addMessage('bot', 'Enter Vendor/Shipper name.');
        setStep('VENDOR');
        break;

      case 'VENDOR':
        updateData('vendor', userValue);
        addMessage('bot', 'Enter Carrier name.');
        setStep('CARRIER');
        break;

      case 'CARRIER':
        updateData('carrier', userValue);
        addMessage('bot', 'Enter your Email Address.');
        setStep('CARRIER_EMAIL');
        break;

      case 'CARRIER_EMAIL':
        updateData('carrierEmail', userValue);
        addMessage('bot', 'Enter Trailer Number.');
        setStep('TRAILER');
        break;

      case 'TRAILER':
        updateData('trailer', userValue);
        
        // Calculate Target Date and display Warning if past Cutoff
        const tDate = calculateTargetDate(data.region);
        setTargetDate(tDate);
        updateData('appointmentDate', tDate);

        const timeWarning = checkCutoffTime(data.region);
        if (timeWarning) {
          setModalConfig({
            isOpen: true,
            title: "Scheduling Notice",
            message: timeWarning,
            confirmText: "Acknowledge",
            onConfirm: () => {
              updateData('systemTimeWarning', timeWarning);
              setModalConfig({ isOpen: false });
              addMessage('bot', `Please select your 1st choice time slot for ${data.destination} on ${tDate}:`);
              setStep('TIME_SLOT_1');
            }
          });
        } else {
          addMessage('bot', `Please select your 1st choice time slot for ${data.destination} on ${tDate}:`);
          setStep('TIME_SLOT_1');
        }
        break;

      case 'TIME_SLOT_1':
        updateData('timeSlot1', userValue);
        addMessage('bot', `Great! Now select your 2nd choice time slot:`);
        setStep('TIME_SLOT_2');
        break;

      case 'TIME_SLOT_2':
        updateData('timeSlot2', userValue);
        addMessage('bot', `And finally, select your 3rd choice time slot:`);
        setStep('TIME_SLOT_3');
        break;

      case 'TIME_SLOT_3':
        updateData('timeSlot3', userValue);
        addMessage('bot', 'Please review all the information entered. Are you ready to submit your request?');
        setStep('SUBMIT');
        break;

      case 'SUBMIT':
        if (userValue === 'Yes') {
          addMessage('bot', 'Excellent! Preparing your email draft...');
          setStep('DONE');
        } else {
          setEditData(data);
          setEditModalOpen(true);
        }
        break;

      default:
        break;
    }
  };

  const handleTextInputSubmit = () => {
    if (!inputValue.trim()) return;
    
    if (step === 'ID_ENTRY') {
      if (tempIdType === 'Shipment ID' && !/^6100\d{4}$/.test(inputValue)) {
        return handleValidationMessage("Please enter the correct Shipment ID. It must be exactly 8 digits and start with '6100'.");
      }
      if (tempIdType === 'PO' && !/^([348]\d{7}|5\d{8})$/.test(inputValue)) {
        return handleValidationMessage("Please enter the correct Purchase Order (PO). It must be 8 digits starting with 3, 4, or 8, OR 9 digits starting with 5.");
      }
      return handleAction(inputValue, `${tempIdType}: ${inputValue}`);
    }
    
    if (step === 'SKID_COUNT') {
      const num = parseInt(inputValue, 10);
      if (isNaN(num) || num <= 0 || num >= 999) {
        return handleValidationMessage("Please enter a valid number below 999.");
      }
    }

    if (step === 'CARRIER_EMAIL') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputValue)) {
        return handleValidationMessage("Please enter a valid email address.");
      }
    }

    handleAction(inputValue);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return handleValidationMessage("Please upload a valid PDF file.");
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target.result.split(',')[1];
        updateData('bolFileData', base64String); 
        handleAction(file.name, `Uploaded: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Email Generation Logic (Vendor) ---
  const getCSVContent = (exportData) => {
    const rows = [
      ["Field", "Value"],
      ["Appointment Needed", exportData.needsAppointment || ''],
      ["Region", exportData.region || ''],
      ["Destination", exportData.destination || ''],
      ["Date", exportData.appointmentDate || ''],
      ["1st Choice Time Slot", exportData.timeSlot1 || ''],
      ["2nd Choice Time Slot", exportData.timeSlot2 || ''],
      ["3rd Choice Time Slot", exportData.timeSlot3 || ''],
      ["Appliance Drop Off", exportData.applianceDropOff || ''],
      ["Load Type", exportData.loadType || ''],
      ["Live Load Acknowledged", exportData.liveLoadAcknowledged || 'N/A'],
      ["ID Type", exportData.idType || ''],
      ["ID Value", exportData.idValue || ''],
      ["Has BOL", exportData.hasBol || ''],
      ["BOL File", exportData.bolFile || 'N/A'],
      ["SKID Count", exportData.skidCount || ''],
      ["Vendor/Shipper", exportData.vendor || ''],
      ["Carrier", exportData.carrier || ''],
      ["Carrier Email", exportData.carrierEmail || ''],
      ["Trailer Number", exportData.trailer || ''],
      ["System Notice (Cutoff)", exportData.systemTimeWarning || 'None']
    ];
    return rows.map(e => e.map(item => `"${(item||'').toString().replace(/"/g, '""')}"`).join(",")).join("\r\n");
  };

  const handleEmailBooking = () => {
    const subject = `Load Booking Request - ${data.idValue || ''}`;
    let bodyText = `Please find the load booking details below:\r\n\r\n`;
    bodyText += `Region: ${data.region || ''}\r\n`;
    bodyText += `Destination: ${data.destination || ''}\r\n`;
    bodyText += `Target Date: ${data.appointmentDate || ''}\r\n`;
    bodyText += `1st Choice Time Slot: ${data.timeSlot1 || ''}\r\n`;
    bodyText += `2nd Choice Time Slot: ${data.timeSlot2 || ''}\r\n`;
    bodyText += `3rd Choice Time Slot: ${data.timeSlot3 || ''}\r\n`;
    if (data.applianceDropOff && data.applianceDropOff !== 'N/A') bodyText += `Appliance Drop Off: ${data.applianceDropOff}\r\n`;
    bodyText += `Load Type: ${data.loadType || ''}\r\n`;
    bodyText += `ID Type: ${data.idType || ''} (${data.idValue || ''})\r\n`;
    bodyText += `Has BOL: ${data.hasBol || ''} ${data.bolFile ? `(${data.bolFile})` : ''}\r\n`;
    bodyText += `SKID Count: ${data.skidCount || ''}\r\n`;
    bodyText += `Vendor/Shipper: ${data.vendor || ''}\r\n`;
    bodyText += `Carrier: ${data.carrier || ''}\r\n`;
    bodyText += `Carrier Email: ${data.carrierEmail || ''}\r\n`;
    bodyText += `Trailer Number: ${data.trailer || ''}\r\n`;

    const csvData = getCSVContent(data);
    const base64CSV = btoa(unescape(encodeURIComponent("\uFEFF" + csvData))); 
    const boundary = "----=_NextPart_" + Date.now().toString(16);

    const emlContent = [
      `To: CalgaryAppts@homedepot.com`,
      `Subject: ${subject}`,
      `X-Unsent: 1`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      bodyText,
      ``,
      `--${boundary}`,
      `Content-Type: text/csv; name="booking_request_${data.idValue || 'export'}.csv"`,
      `Content-Disposition: attachment; filename="booking_request_${data.idValue || 'export'}.csv"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64CSV
    ];

    if (data.bolFileData && data.bolFile) {
      emlContent.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="${data.bolFile}"`,
        `Content-Disposition: attachment; filename="${data.bolFile}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        data.bolFileData
      );
    }
    emlContent.push(`--${boundary}--`);

    const blob = new Blob([emlContent.join('\r\n')], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Booking_Request_${data.idValue || 'Export'}.eml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const validateEditForm = () => {
    let errors = {};
    if (editData.idType === 'Shipment ID' && !/^6100\d{4}$/.test(editData.idValue)) {
      errors.idValue = "Shipment ID must be 8 digits starting with 6100.";
    }
    if (editData.idType === 'PO' && !/^([348]\d{7}|5\d{8})$/.test(editData.idValue)) {
      errors.idValue = "PO must be 8 digits starting with 3,4,8 or 9 digits starting with 5.";
    }
    const skidNum = parseInt(editData.skidCount, 10);
    if (isNaN(skidNum) || skidNum <= 0 || skidNum >= 999) {
      errors.skidCount = "SKID Count must be a number below 999.";
    }
    if (editData.carrierEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editData.carrierEmail)) {
      errors.carrierEmail = "Please enter a valid email address.";
    }
    
    const choices = [editData.timeSlot1, editData.timeSlot2, editData.timeSlot3].filter(Boolean);
    if (choices.length === 3 && new Set(choices).size !== 3) {
      errors.timeSlots = "Time slot choices must be unique.";
    }

    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveEdits = () => {
    if (validateEditForm()) {
      setData(editData);
      setEditModalOpen(false);
      addMessage('bot', 'Information updated. Are you ready to submit your request now?');
      setStep('SUBMIT');
    }
  };

  // --- Admin Bulk Compiler Logic ---
  const parseFileContent = (fileText, fileName) => {
    const req = { 
      id: fileName + Date.now().toString(), 
      timestamp: new Date().toISOString() 
    };

    // Clean up text (strip null bytes which are common when UTF-16LE .msg files are read as UTF-8)
    const cleanText = fileText.replace(/\u0000/g, '');

    // Method 1: Look for exact "Key","Value" pairs 
    // This perfectly extracts the CSV attachment data even if it's deeply embedded in a binary Outlook .msg file!
    const extractedData = {};
    const pairRegex = /"([^"]+)","([^"]*)"/g;
    let match;
    
    while ((match = pairRegex.exec(cleanText)) !== null) {
      extractedData[match[1]] = match[2];
    }

    if (extractedData["Destination"] || extractedData["ID Value"]) {
      req.needsAppointment = extractedData["Appointment Needed"];
      req.region = extractedData["Region"];
      req.destination = extractedData["Destination"];
      req.appointmentDate = extractedData["Date"];
      req.timeSlot1 = extractedData["1st Choice Time Slot"];
      req.timeSlot2 = extractedData["2nd Choice Time Slot"];
      req.timeSlot3 = extractedData["3rd Choice Time Slot"];
      req.applianceDropOff = extractedData["Appliance Drop Off"];
      req.loadType = extractedData["Load Type"];
      req.idType = extractedData["ID Type"];
      req.idValue = extractedData["ID Value"];
      req.hasBol = extractedData["Has BOL"];
      req.skidCount = extractedData["SKID Count"];
      req.vendor = extractedData["Vendor/Shipper"];
      req.carrier = extractedData["Carrier"];
      req.carrierEmail = extractedData["Carrier Email"];
      req.trailer = extractedData["Trailer Number"];
    } 
    // Method 2: Fallback for Base64 encoded CSVs in raw .eml files
    else {
      const base64Regex = /filename="appointment_booking.*?\.csv"[\s\S]*?Content-Transfer-Encoding:\s*base64\s*([a-zA-Z0-9+/=\r\n]+)/i;
      const b64Match = cleanText.match(base64Regex);
      
      if (b64Match && b64Match[1]) {
        try {
          const decodedStr = atob(b64Match[1].replace(/\s/g, ''));
          const decodedClean = decodedStr.replace(/\u0000/g, '');
          const b64Extracted = {};
          while ((match = pairRegex.exec(decodedClean)) !== null) {
            b64Extracted[match[1]] = match[2];
          }
          if (b64Extracted["Destination"] || b64Extracted["ID Value"]) {
            req.needsAppointment = b64Extracted["Appointment Needed"];
            req.region = b64Extracted["Region"];
            req.destination = b64Extracted["Destination"];
            req.appointmentDate = b64Extracted["Date"];
            req.timeSlot1 = b64Extracted["1st Choice Time Slot"];
            req.timeSlot2 = b64Extracted["2nd Choice Time Slot"];
            req.timeSlot3 = b64Extracted["3rd Choice Time Slot"];
            req.applianceDropOff = b64Extracted["Appliance Drop Off"];
            req.loadType = b64Extracted["Load Type"];
            req.idType = b64Extracted["ID Type"];
            req.idValue = b64Extracted["ID Value"];
            req.hasBol = b64Extracted["Has BOL"];
            req.skidCount = b64Extracted["SKID Count"];
            req.vendor = b64Extracted["Vendor/Shipper"];
            req.carrier = b64Extracted["Carrier"];
            req.carrierEmail = b64Extracted["Carrier Email"];
            req.trailer = b64Extracted["Trailer Number"];
          }
        } catch (e) {
           console.error("Base64 decode failed", e);
        }
      }
      
      // Method 3: Regex plain text body (if all else fails)
      if (!req.destination && !req.idValue) {
        const extract = (key) => {
          const regex = new RegExp(`${key}:?\\s*([A-Za-z0-9_ \\-\\(\\)\\.@]*)`, 'i');
          const m = cleanText.match(regex);
          return m ? m[1].trim() : '';
        };
        req.region = extract("Region");
        req.destination = extract("Destination");
        req.appointmentDate = extract("Target Date");
        req.timeSlot1 = extract("1st Choice Time Slot");
        req.timeSlot2 = extract("2nd Choice Time Slot");
        req.timeSlot3 = extract("3rd Choice Time Slot");
        req.applianceDropOff = extract("Appliance Drop Off");
        req.loadType = extract("Load Type");
        
        let idLine = extract("ID Type");
        if(idLine && idLine.includes('(')) {
           req.idType = idLine.split('(')[0].trim();
           req.idValue = idLine.split('(')[1].replace(')', '').trim();
        } else {
           req.idType = idLine;
           req.idValue = extract("ID Value"); 
        }

        req.hasBol = extract("Has BOL");
        req.skidCount = extract("SKID Count");
        req.vendor = extract("Vendor/Shipper");
        req.carrier = extract("Carrier");
        req.carrierEmail = extract("Carrier Email");
        req.trailer = extract("Trailer Number");
      }
    }

    req.status = req.loadType === 'Live Load' ? 'Needs Scheduling (Live)' : 'Auto-Trackable (Drop)';
    
    // Validate that we found at least one key field to prevent empty rows
    if (req.idValue || req.destination || req.carrier) {
        return req;
    }
    return null;
  };

  const handleAdminFileUpload = (files) => {
    if (!files || !files.length) return;

    const parsedRequests = [];
    let processedCount = 0;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        let text = event.target.result;
        text = text.replace(/^\uFEFF/, ''); // Strip BOM if present
        
        const newReq = parseFileContent(text, file.name);
        if (newReq) {
          parsedRequests.push(newReq);
        }
        
        processedCount++;
        if (processedCount === files.length) {
          updateAdminTable(parsedRequests);
        }
      };
      // Read as text ensures we can parse raw emails (.eml), text blobs from .msg, or .csv files natively
      reader.readAsText(file);
    });
  };

  const updateAdminTable = (newReqs) => {
    setAllRequests(prev => {
      const combined = [...prev, ...newReqs];
      return combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });
  };

  // --- Easter Egg Logic ---
  const handleHeaderDoubleClick = () => {
    const fireConfetti = () => {
      if (window.confetti) {
        window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      }
    };

    if (window.confetti) {
      fireConfetti();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
      script.onload = fireConfetti;
      document.head.appendChild(script);
    }

    setShowEasterEgg(true);
    setTimeout(() => setShowEasterEgg(false), 2000);
  };

  // --- Admin Sending Confirmations ---
  const openReplyModal = (req) => {
    if (!req.carrierEmail) {
      alert("No email address was provided by the carrier for this request.");
      return;
    }
    setActiveReplyReq(req);
    setReplyType('slot1');
    setCustomTimeMsg('');
    setReplyModalOpen(true);
  };

  const generateReplyEmail = () => {
    const req = activeReplyReq;
    if (!req) return;

    let selectedTime = '';
    let isCustom = false;
    if (replyType === 'slot1') selectedTime = req.timeSlot1;
    else if (replyType === 'slot2') selectedTime = req.timeSlot2;
    else if (replyType === 'slot3') selectedTime = req.timeSlot3;
    else {
      selectedTime = customTimeMsg;
      isCustom = true;
    }

    const subject = `Confirmation: Load Booking Request - ${req.idValue || 'N/A'}`;
    let bodyText = `Hello,\r\n\r\nRegarding your load booking request for ${req.destination || ''}:\r\n\r\n`;
    bodyText += `ID/PO: ${req.idValue || 'N/A'}\r\n`;
    bodyText += `Target Date: ${req.appointmentDate || 'N/A'}\r\n\r\n`;

    if (isCustom) {
       bodyText += `Unfortunately, your requested time preferences are not available. Are you good to proceed with the following proposed time?\r\n\r\nProposed Time: ${selectedTime}\r\n\r\nPlease confirm if this works for you.\r\n\r\n`;
    } else {
       bodyText += `Your appointment has been confirmed for the following time slot:\r\n\r\nConfirmed Time: ${selectedTime}\r\n\r\n`;
    }

    bodyText += `Thank you,\r\nHome Depot Planning Team`;

    const emlContent = [
      `To: ${req.carrierEmail}`,
      `Subject: ${subject}`,
      `X-Unsent: 1`, // Opens as a draft in Outlook
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      bodyText
    ].join('\r\n');

    // Create a downloadable blob to completely bypass the Home Depot portal iframe restrictions
    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Reply_${req.idValue || 'Booking'}.eml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setReplyModalOpen(false);
    setActiveReplyReq(null);
  };

  const exportAdminToExcel = async () => {
    try {
      await new Promise((resolve, reject) => {
        if (window.XLSX) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const formattedData = allRequests.map(req => ({
        "Status": req.status || "Pending",
        "Target Date": req.appointmentDate || "",
        "Region": req.region || "",
        "Destination": req.destination || "",
        "ID Type": req.idType || "",
        "ID Value": req.idValue || "",
        "Load Type": req.loadType || "",
        "Appliance Drop": req.applianceDropOff || "N/A",
        "Carrier": req.carrier || "",
        "Carrier Email": req.carrierEmail || "",
        "Vendor": req.vendor || "",
        "Trailer": req.trailer || "",
        "SKIDs": req.skidCount || "",
        "1st Choice": req.timeSlot1 || "",
        "2nd Choice": req.timeSlot2 || "",
        "3rd Choice": req.timeSlot3 || "",
        "BOL Provided": req.hasBol || ""
      }));

      const worksheet = window.XLSX.utils.json_to_sheet(formattedData);
      worksheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 25 }]; 
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "Compiled Requests");
      window.XLSX.writeFile(workbook, `Compiled_Booking_Requests_${new Date().toISOString().split('T')[0]}.xlsx`);
      
    } catch (e) {
      console.error("Export Error:", e);
      alert("Failed to export dashboard data.");
    }
  };

  // --- Rendering UI Sections ---
  const renderInputControls = () => {
    if (step === 'END' || step === 'DONE') return null;

    if (step === 'INIT' || step === 'APPLIANCE_DROP' || step === 'BOL_ASK') {
      return (
        <div className="flex gap-4 p-4 bg-slate-50 border-t justify-center">
          <button onClick={() => handleAction('Yes')} className="px-6 py-2 bg-[#f96302] text-white rounded-full font-medium hover:bg-[#e05a02] transition shadow-sm">Yes</button>
          <button onClick={() => handleAction('No')} className="px-6 py-2 bg-slate-200 text-slate-800 rounded-full font-medium hover:bg-slate-300 transition shadow-sm">No</button>
        </div>
      );
    }

    if (step === 'REGION') {
      return (
        <div className="flex gap-4 p-4 bg-slate-50 border-t justify-center">
          <button onClick={() => handleAction('East')} className="px-6 py-2 bg-[#f96302] text-white rounded-full font-medium hover:bg-[#e05a02] transition shadow-sm">East</button>
          <button onClick={() => handleAction('West')} className="px-6 py-2 bg-[#f96302] text-white rounded-full font-medium hover:bg-[#e05a02] transition shadow-sm">West</button>
        </div>
      );
    }

    if (step === 'DESTINATION') {
      const options = data.region === 'East' ? EAST_DESTINATIONS : WEST_DESTINATIONS;
      return (
        <div className="flex flex-col gap-2 p-4 bg-slate-50 border-t">
          {options.map(opt => (
            <button key={opt} onClick={() => handleAction(opt)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-left hover:bg-orange-50 transition w-full max-w-md mx-auto shadow-sm">
              {opt}
            </button>
          ))}
        </div>
      );
    }

    if (step === 'LOAD_TYPE') {
      return (
        <div className="flex gap-4 p-4 bg-slate-50 border-t justify-center">
          <button onClick={() => handleAction('Live Load')} className="px-6 py-2 bg-[#f96302] text-white rounded-full font-medium hover:bg-[#e05a02] transition shadow-sm">Live Load</button>
          <button onClick={() => handleAction('Drop Load')} className="px-6 py-2 bg-slate-600 text-white rounded-full font-medium hover:bg-slate-700 transition shadow-sm">Drop Load</button>
        </div>
      );
    }

    if (step === 'BOL_UPLOAD') {
      return (
        <div className="flex gap-4 p-4 bg-slate-50 border-t justify-center items-center">
          <label className="flex items-center gap-2 px-6 py-3 bg-[#f96302] text-white rounded-lg font-medium hover:bg-[#e05a02] transition cursor-pointer shadow-sm">
            <UploadCloud className="w-5 h-5" /> Upload PDF
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      );
    }

    if (step.startsWith('TIME_SLOT_')) {
      let availableSlots = ALL_TIME_SLOTS;
      if (step === 'TIME_SLOT_2') {
        availableSlots = ALL_TIME_SLOTS.filter(s => s !== data.timeSlot1);
      } else if (step === 'TIME_SLOT_3') {
        availableSlots = ALL_TIME_SLOTS.filter(s => s !== data.timeSlot1 && s !== data.timeSlot2);
      }

      return (
        <div className="flex flex-col gap-3 p-4 bg-slate-50 border-t items-center w-full">
           <div className="text-sm font-bold text-slate-600 flex items-center gap-2 mb-2">
             <Calendar className="w-4 h-4"/> Schedule Date: {targetDate}
           </div>
           <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {availableSlots.map(slot => (
                <button key={slot} onClick={() => handleAction(slot)} className="px-4 py-3 bg-white border-2 border-orange-200 text-orange-800 rounded-lg font-medium hover:bg-orange-50 transition flex items-center justify-center gap-2 shadow-sm">
                  <Clock className="w-4 h-4"/> {slot}
                </button>
              ))}
           </div>
        </div>
      );
    }

    if (step === 'SUBMIT') {
      return (
        <div className="flex flex-col gap-4 p-4 bg-slate-50 border-t">
          <div className="max-w-lg mx-auto w-full bg-white border border-orange-100 rounded-xl p-4 shadow-sm text-sm text-slate-700 mb-2">
            <h4 className="font-bold border-b pb-2 mb-2 flex items-center gap-2 text-orange-900"><FileText className="w-4 h-4"/> Review Data</h4>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              <span className="text-slate-500 text-right">Date:</span><span className="font-bold text-orange-700">{data.appointmentDate}</span>
              <span className="text-slate-500 text-right">1st Choice:</span><span className="font-bold text-orange-700">{data.timeSlot1}</span>
              <span className="text-slate-500 text-right">2nd Choice:</span><span className="font-bold text-orange-700">{data.timeSlot2}</span>
              <span className="text-slate-500 text-right">3rd Choice:</span><span className="font-bold text-orange-700">{data.timeSlot3}</span>
              <span className="text-slate-500 text-right">Region:</span><span className="font-medium">{data.region}</span>
              <span className="text-slate-500 text-right">Destination:</span><span className="font-medium">{data.destination}</span>
              {data.applianceDropOff !== 'N/A' && <><span className="text-slate-500 text-right">Appliance Drop:</span><span className="font-medium">{data.applianceDropOff}</span></>}
              <span className="text-slate-500 text-right">Load Type:</span><span className="font-medium">{data.loadType}</span>
              <span className="text-slate-500 text-right">ID Type:</span><span className="font-medium">{data.idType} ({data.idValue})</span>
              <span className="text-slate-500 text-right">BOL:</span><span className="font-medium">{data.hasBol} {data.bolFile && `(${data.bolFile})`}</span>
              <span className="text-slate-500 text-right">SKIDs:</span><span className="font-medium">{data.skidCount}</span>
              <span className="text-slate-500 text-right">Vendor:</span><span className="font-medium">{data.vendor}</span>
              <span className="text-slate-500 text-right">Carrier:</span><span className="font-medium">{data.carrier}</span>
              <span className="text-slate-500 text-right">Email:</span><span className="font-medium">{data.carrierEmail}</span>
              <span className="text-slate-500 text-right">Trailer:</span><span className="font-medium">{data.trailer}</span>
            </div>
          </div>
          <div className="flex gap-4 justify-center">
            <button onClick={() => handleAction('Yes')} className="px-6 py-2 bg-green-600 text-white rounded-full font-medium hover:bg-green-700 transition flex items-center gap-2 shadow-sm">
              <Mail className="w-5 h-5"/> Yes, Request via Email
            </button>
            <button onClick={() => handleAction('No')} className="px-6 py-2 bg-slate-200 text-slate-800 rounded-full font-medium hover:bg-slate-300 transition flex items-center gap-2 shadow-sm">
              <Edit className="w-5 h-5"/> No, Edit Data
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 bg-white border-t flex gap-2 items-center">
        {step === 'ID_ENTRY' && (
          <select value={tempIdType} onChange={(e) => setTempIdType(e.target.value)} className="border-slate-300 rounded-lg p-3 bg-slate-50 focus:ring-2 focus:ring-[#f96302] outline-none">
            <option value="Shipment ID">Shipment ID</option>
            <option value="PO">Purchase Order</option>
          </select>
        )}
        <input
          type={step === 'SKID_COUNT' ? 'number' : step === 'CARRIER_EMAIL' ? 'email' : 'text'}
          className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#f96302] outline-none shadow-sm"
          placeholder={
            step === 'ID_ENTRY' ? (tempIdType === 'Shipment ID' ? '6100XXXX' : 'Enter PO Number...') : 
            step === 'CARRIER_EMAIL' ? 'example@domain.com...' :
            'Type your answer...'
          }
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleTextInputSubmit()}
        />
        <button onClick={handleTextInputSubmit} className="p-3 bg-[#f96302] text-white rounded-lg hover:bg-[#e05a02] transition flex-shrink-0 shadow-sm">
          <Send className="w-5 h-5" />
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-[#f96302] text-white p-4 shadow-md z-10 flex justify-between items-center relative">
        <div 
          className="flex items-center gap-3 cursor-pointer select-none transition-transform active:scale-95" 
          onDoubleClick={handleHeaderDoubleClick}
          title="Double click me!"
        >
          <img src={CUSTOM_LOGO_URL} alt="Company Logo" className="h-10 w-10 object-contain bg-white p-1 shadow-sm rounded" onError={(e) => { e.target.style.display = 'none'; }} />
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide">Load Booking Assistant</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {viewMode === 'vendor' ? (
             <button onClick={() => setViewMode('admin')} className="flex items-center gap-2 bg-orange-800 bg-opacity-30 hover:bg-opacity-50 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-orange-400">
               <LayoutDashboard className="w-4 h-4"/> Admin Compiler
             </button>
           ) : (
             <button onClick={() => setViewMode('vendor')} className="flex items-center gap-2 bg-white text-[#f96302] hover:bg-orange-50 px-3 py-1.5 rounded-full text-xs font-bold transition-colors">
               <ArrowLeft className="w-4 h-4"/> Back to Chat
             </button>
           )}
        </div>
      </header>

      {/* Easter Egg Toast */}
      {showEasterEgg && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-[100] animate-in slide-in-from-top-4 fade-in duration-300 flex flex-col items-center gap-1 border border-slate-700">
          <span className="text-2xl mb-1">🎉</span>
          <p className="font-bold text-center text-lg">Made by Aaftab khanna</p>
          <p className="text-sm text-center text-slate-300">Aaftabkhanna007@outlook.com</p>
        </div>
      )}

      {/* --- Admin View (The Compiler) --- */}
      {viewMode === 'admin' ? (
        <main 
          className={`flex-1 overflow-y-auto p-6 transition-colors relative ${isDragging ? 'bg-blue-50' : 'bg-slate-100'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleAdminFileUpload(Array.from(e.dataTransfer.files));
            }
          }}
        >
           {/* Drag and Drop Overlay */}
           {isDragging && (
              <div className="absolute inset-0 bg-blue-100/90 z-50 flex flex-col items-center justify-center rounded-xl pointer-events-none border-4 border-dashed border-blue-500 m-4">
                <UploadCloud className="w-20 h-20 text-blue-600 mb-4 animate-bounce" />
                <h2 className="text-3xl font-bold text-blue-800 text-center">Drop Emails Here</h2>
                <p className="text-blue-600 mt-2 font-medium">Release to instantly read and compile all files (.eml, .msg, .csv)</p>
              </div>
           )}

           <div className="max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Email File Compiler</h2>
                  <p className="text-sm text-slate-500">Select or Drag-and-Drop emails directly from your inbox into this window.</p>
                </div>
                
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-colors cursor-pointer">
                     <FolderUp className="w-5 h-5" /> Import Files
                     <input type="file" multiple accept=".csv,.eml,.msg,.txt" className="hidden" onChange={(e) => handleAdminFileUpload(Array.from(e.target.files))} />
                  </label>
                  <button onClick={() => setAllRequests([])} className="flex items-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg shadow-sm font-medium transition-colors">
                     Clear Table
                  </button>
                  <button onClick={exportAdminToExcel} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-colors">
                     <Download className="w-5 h-5" /> Export All to Excel
                  </button>
                </div>
              </div>

              {/* Table Area */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                  <table className="w-full text-sm text-left relative">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3">ID / PO</th>
                        <th className="px-4 py-3">Destination</th>
                        <th className="px-4 py-3">Load Type</th>
                        <th className="px-4 py-3">Target Date</th>
                        <th className="px-4 py-3">Time Preferences</th>
                        <th className="px-4 py-3">Carrier Email</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allRequests.length === 0 ? (
                        <tr>
                           <td colSpan="8" className="px-4 py-16 text-center">
                              <div className="flex flex-col items-center justify-center text-slate-400">
                                 <UploadCloud className="w-16 h-16 mb-4 text-slate-300" />
                                 <p className="text-lg font-medium text-slate-500">No requests compiled yet.</p>
                                 <p className="text-sm mt-1">Download the CSV files from your emails and select them above.</p>
                              </div>
                           </td>
                        </tr>
                      ) : (
                        allRequests.map((req, idx) => (
                          <tr key={req.id || idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{req.idValue}</td>
                            <td className="px-4 py-3 text-slate-600">{req.destination?.split(' - ')[1] || req.destination}</td>
                            <td className="px-4 py-3 text-slate-600">{req.loadType}</td>
                            <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{req.appointmentDate}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                               <div className="flex flex-col gap-0.5">
                                 <span>1. {req.timeSlot1}</span>
                                 {req.timeSlot2 && <span className="text-slate-400">2. {req.timeSlot2}</span>}
                                 {req.timeSlot3 && <span className="text-slate-400">3. {req.timeSlot3}</span>}
                               </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]">{req.carrierEmail}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide ${req.status?.includes('Drop') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {req.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button 
                                onClick={() => openReplyModal(req)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-medium text-xs transition-colors border border-blue-200"
                              >
                                <Reply className="w-3.5 h-3.5" /> Reply
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
           </div>
        </main>
      ) : (

      /* --- Vendor Chat View --- */
      <>
        <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[85%] gap-3 items-end ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'user' ? 'bg-[#f96302] text-white shadow-sm' : 'bg-orange-100 text-[#f96302] shadow-sm'}`}>
                  {msg.sender === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div className={`px-4 py-3 rounded-2xl shadow-sm text-[15px] ${msg.sender === 'user' ? 'bg-[#f96302] text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'}`}>
                  {msg.isFile ? <span className="flex items-center gap-2"><Paperclip className="w-4 h-4"/> {msg.text}</span> : msg.text}
                </div>
              </div>
            </div>
          ))}
          {step === 'DONE' && (
            <div className="flex justify-center mt-6 mb-4">
              <div className="bg-green-50 text-green-900 px-6 py-6 rounded-xl border border-green-200 flex flex-col items-center gap-3 text-center max-w-md w-full shadow-sm">
                <CheckCircle2 className="w-12 h-12 text-green-600 mb-1" />
                <h3 className="font-bold text-lg">Draft Generated Successfully</h3>
                <p className="text-sm text-green-700 mb-2">
                  Your load booking data has been structured.
                </p>
                
                <div className="flex flex-col gap-3 mt-4 w-full">
                  <button onClick={handleEmailBooking} className="px-4 py-3 bg-[#f96302] text-white rounded-lg text-sm font-medium hover:bg-[#e05a02] flex flex-col items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer border-none outline-none">
                    <div className="flex items-center gap-2 text-base">
                      <Mail className="w-5 h-5" /> Download Email Draft
                    </div>
                    <span className="text-xs text-orange-100 font-normal mt-1">Click the downloaded file to open in Outlook</span>
                  </button>
                  <button onClick={handleRestartBooking} className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
                    Start New Booking
                  </button>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>
        {renderInputControls()}
      </>
      )}

      {/* --- Modals --- */}
      <Modal {...modalConfig} />

      {/* Admin Reply Modal */}
      {replyModalOpen && activeReplyReq && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center gap-2 text-blue-700">
              <Reply className="w-5 h-5"/>
              <h3 className="font-bold text-lg">Send Confirmation to Carrier</h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
               <p className="text-sm text-slate-600">Select the confirmed time slot for <strong>{activeReplyReq.carrier}</strong> (ID: {activeReplyReq.idValue}):</p>
               <div className="flex flex-col gap-3">
                 <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${replyType === 'slot1' ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}>
                   <input type="radio" name="replyType" value="slot1" checked={replyType === 'slot1'} onChange={() => setReplyType('slot1')} className="text-blue-600" />
                   <div><span className="font-medium text-slate-800">1st Choice:</span> <span className="text-slate-600">{activeReplyReq.timeSlot1}</span></div>
                 </label>
                 {activeReplyReq.timeSlot2 && (
                   <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${replyType === 'slot2' ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}>
                     <input type="radio" name="replyType" value="slot2" checked={replyType === 'slot2'} onChange={() => setReplyType('slot2')} className="text-blue-600" />
                     <div><span className="font-medium text-slate-800">2nd Choice:</span> <span className="text-slate-600">{activeReplyReq.timeSlot2}</span></div>
                   </label>
                 )}
                 {activeReplyReq.timeSlot3 && (
                   <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${replyType === 'slot3' ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}>
                     <input type="radio" name="replyType" value="slot3" checked={replyType === 'slot3'} onChange={() => setReplyType('slot3')} className="text-blue-600" />
                     <div><span className="font-medium text-slate-800">3rd Choice:</span> <span className="text-slate-600">{activeReplyReq.timeSlot3}</span></div>
                   </label>
                 )}
                 <label className={`flex flex-col gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${replyType === 'other' ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}>
                   <div className="flex items-center gap-3">
                     <input type="radio" name="replyType" value="other" checked={replyType === 'other'} onChange={() => setReplyType('other')} className="text-blue-600" />
                     <span className="font-medium text-slate-800">Other / Propose New Time</span>
                   </div>
                   {replyType === 'other' && (
                     <input 
                       type="text" 
                       className="mt-2 border border-slate-300 p-2.5 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full text-sm transition-all" 
                       placeholder="e.g. Next Tuesday at 2:00 PM"
                       value={customTimeMsg}
                       onChange={(e) => setCustomTimeMsg(e.target.value)}
                     />
                   )}
                 </label>
               </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
               <button onClick={() => setReplyModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancel</button>
               <button 
                 onClick={generateReplyEmail} 
                 disabled={replyType === 'other' && !customTimeMsg.trim()} 
                 className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
               >
                 Generate Draft
               </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="font-bold text-lg flex items-center gap-2 text-[#f96302]"><Edit className="w-5 h-5"/> Edit General Information</h3>
            </div>
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {editErrors.timeSlots && (
                <div className="col-span-full mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p>{editErrors.timeSlots}</p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">1st Choice Slot</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.timeSlot1} onChange={e => setEditData({...editData, timeSlot1: e.target.value})}>
                  {ALL_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">2nd Choice Slot</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.timeSlot2} onChange={e => setEditData({...editData, timeSlot2: e.target.value})}>
                  {ALL_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">3rd Choice Slot</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.timeSlot3} onChange={e => setEditData({...editData, timeSlot3: e.target.value})}>
                  {ALL_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Region</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.region} onChange={e => setEditData({...editData, region: e.target.value, destination: (e.target.value === 'East' ? EAST_DESTINATIONS[0] : WEST_DESTINATIONS[0])})}>
                  <option value="East">East</option><option value="West">West</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Destination</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.destination} onChange={e => setEditData({...editData, destination: e.target.value})}>
                  {(editData.region === 'East' ? EAST_DESTINATIONS : WEST_DESTINATIONS).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {(editData.destination?.includes('DFC') || editData.destination?.includes('MDO')) && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Appliance Drop Off</label>
                  <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.applianceDropOff} onChange={e => setEditData({...editData, applianceDropOff: e.target.value})}>
                    <option value="Yes">Yes</option><option value="No">No</option>
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Load Type</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.loadType} onChange={e => setEditData({...editData, loadType: e.target.value})}>
                  <option value="Live Load">Live Load</option><option value="Drop Load">Drop Load</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">ID Type</label>
                <select className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.idType} onChange={e => setEditData({...editData, idType: e.target.value})}>
                  <option value="Shipment ID">Shipment ID</option><option value="PO">Purchase Order</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">ID Value</label>
                <input type="text" className={`w-full border p-2 rounded outline-none ${editErrors.idValue ? 'border-red-500' : 'focus:border-[#f96302]'}`} value={editData.idValue} onChange={e => setEditData({...editData, idValue: e.target.value})}/>
                {editErrors.idValue && <p className="text-red-500 text-xs">{editErrors.idValue}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">SKID Count</label>
                <input type="number" className={`w-full border p-2 rounded outline-none ${editErrors.skidCount ? 'border-red-500' : 'focus:border-[#f96302]'}`} value={editData.skidCount} onChange={e => setEditData({...editData, skidCount: e.target.value})}/>
                {editErrors.skidCount && <p className="text-red-500 text-xs">{editErrors.skidCount}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Vendor/Shipper</label>
                <input type="text" className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.vendor} onChange={e => setEditData({...editData, vendor: e.target.value})}/>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Carrier</label>
                <input type="text" className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.carrier} onChange={e => setEditData({...editData, carrier: e.target.value})}/>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Carrier Email</label>
                <input type="text" className={`w-full border p-2 rounded outline-none ${editErrors.carrierEmail ? 'border-red-500' : 'focus:border-[#f96302]'}`} value={editData.carrierEmail || ''} onChange={e => setEditData({...editData, carrierEmail: e.target.value})}/>
                {editErrors.carrierEmail && <p className="text-red-500 text-xs">{editErrors.carrierEmail}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Trailer Number</label>
                <input type="text" className="w-full border p-2 rounded focus:border-[#f96302] outline-none" value={editData.trailer} onChange={e => setEditData({...editData, trailer: e.target.value})}/>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 rounded-b-xl flex justify-end gap-3">
               <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">Cancel</button>
               <button onClick={saveEdits} className="px-4 py-2 bg-[#f96302] text-white rounded-lg hover:bg-[#e05a02] font-bold shadow-sm">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}