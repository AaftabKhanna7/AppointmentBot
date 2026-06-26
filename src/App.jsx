import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Calendar, Clock, LayoutDashboard, Download, ArrowLeft, Mail, FolderUp, Reply, MapPin, Truck, UserCircle, Save, Plus, X, MessageSquare, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, Database } from 'lucide-react';

const EAST_DESTINATIONS = [
  "SFC - 7275 - Vaughan", "DFC - 7340 - Bolton", "MDO - 7364 - Montreal",
  "MDO - 7403 - Woodstock", "MDO - 7406 - Moncton", "SFC - 7410 - AVRO", "FDC - 7411 - AVRO (flatbeds only)"
];

const WEST_DESTINATIONS = [
  "SFC - 7279 - Calgary", "DFC - 7347 - Calgary", "MDO - 7348 - Surrey",
  "MDO - 7405 - Winnipeg", "MDO - 7412 - Acheson", "FDC - 7417 - Acheson"
];

const ALL_TIME_SLOTS = [
  "8:00 AM - 9:00 AM", "9:00 AM - 10:00 AM", "10:00 AM - 11:00 AM", 
  "11:00 AM - 12:00 PM", "12:00 PM - 1:00 PM", "1:00 PM - 2:00 PM", 
  "2:00 PM - 3:00 PM", "3:00 PM - 4:00 PM", "4:00 PM - 5:00 PM", 
  "5:00 PM - 6:00 PM", "6:00 PM - 7:00 PM", "7:00 PM - 8:00 PM"
];

// Helper to get available time slots for a given date in the specific region
const getAvailableTimeSlots = (dateStr, region) => {
  const allSlots = ALL_TIME_SLOTS;
  if (!dateStr || !region) return allSlots;

  const timeZone = region === 'East' ? 'America/New_York' : 'America/Denver';
  const now = new Date(new Date().toLocaleString("en-US", { timeZone }));

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${date}`;

  if (dateStr === todayStr) {
    const currentHour = now.getHours();
    return allSlots.filter(slot => {
      const match = slot.match(/^(\d+):/);
      if (match) {
        let startHour = parseInt(match[1], 10);
        if (slot.includes('PM') && startHour !== 12) {
          startHour += 12;
        }
        if (slot.includes('AM') && startHour === 12) {
          startHour = 0;
        }
        return startHour > currentHour;
      }
      return true;
    });
  }
  return allSlots;
};

// Helper to get today's date in local region time for strict date picking
const getTodayString = (region) => {
  const timeZone = region === 'East' ? 'America/New_York' : 'America/Denver';
  const localDateString = new Date().toLocaleString("en-US", { timeZone: timeZone || 'America/New_York' });
  const localDate = new Date(localDateString);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const date = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

// Helper to check cutoff warnings
const checkCutoffTime = (region) => {
  const timeZone = region === 'East' ? 'America/New_York' : 'America/Denver';
  const localDateString = new Date().toLocaleString("en-US", { timeZone });
  const localDate = new Date(localDateString);
  const day = localDate.getDay(); 
  const hour = localDate.getHours();
  const isWeekend = day === 0 || day === 6;

  if (isWeekend || day === 1) {
    return "Notice: Weekend/Monday handling is in effect. Standard appointments will default to the next valid business day.";
  } else if (day === 5 && hour >= 14) {
    return "Notice: It is Friday after the 2 PM cut-off time. Standard appointments will default to Tuesday.";
  } else if (hour >= 14) {
    return "Notice: You missed the 2 PM cut-off time. Standard appointments will default to the next valid business day.";
  }
  return null;
};

// Helper to precisely calculate the Target Date based on Cutoff rules
const calculateTargetDate = (region) => {
  const timeZone = region === 'East' ? 'America/New_York' : 'America/Denver';
  const localDateString = new Date().toLocaleString("en-US", { timeZone });
  const localDate = new Date(localDateString);
  const hour = localDate.getHours();

  let addDays = 0; 
  if (hour >= 14) {
    addDays += 1;
  }
  
  localDate.setDate(localDate.getDate() + addDays);
  
  while (true) {
    let targetDay = localDate.getDay();
    let targetMonth = localDate.getMonth();
    let targetDateNum = localDate.getDate();
    
    const isWeekend = targetDay === 0 || targetDay === 6;
    const isMonday = targetDay === 1;
    const isCanadaDay = targetMonth === 6 && targetDateNum === 1;

    if (isWeekend || isMonday || isCanadaDay) {
      localDate.setDate(localDate.getDate() + 1);
    } else {
      break;
    }
  }

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const date = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

// Helper to safely format SAP TM dates (MM/DD/YYYY) into HTML5 Input dates (YYYY-MM-DD)
const formatTmDate = (dateStr) => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  
  // Handle Excel Serial Date (e.g., 46182 for Jun 9 2026)
  if (!isNaN(str) && Number(str) > 20000) {
     const d = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
     return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str; // Already YYYY-MM-DD
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
       // Assumes MM/DD/YYYY from SAP
       return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }
  return str;
};

// Helper to parse Excel Serial Times into standard 12-hour AM/PM format
const formatTmTime = (timeStr) => {
  if (!timeStr) return '';
  const str = String(timeStr).trim();

  // Handle Excel Serial Time (e.g., 0.979166667 for 11:30 PM)
  if (!isNaN(str) && Number(str) >= 0 && Number(str) <= 1) {
     const totalSeconds = Math.round(Number(str) * 86400);
     let hours = Math.floor(totalSeconds / 3600);
     const minutes = Math.floor((totalSeconds % 3600) / 60);
     const ampm = hours >= 12 ? 'PM' : 'AM';
     hours = hours % 12 || 12;
     return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
  }
  return str;
};

// Unified helper function for real-time date validation
const checkDateError = (dateStr, region) => {
  if (!dateStr) return null;
  const minAllowedDate = region ? calculateTargetDate(region) : '';
  const selectedDate = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = selectedDate.getDay();
  const month = selectedDate.getMonth();
  const dateNum = selectedDate.getDate();

  if (dayOfWeek === 0 || dayOfWeek === 6) return 'Appointments cannot be booked on weekends.';
  if (dayOfWeek === 1) return 'Appointments cannot be booked on Mondays.';
  if (month === 6 && dateNum === 1) return 'Appointments cannot be booked on Canada Day (July 1st).';
  if (minAllowedDate && dateStr < minAllowedDate) return `Must meet cutoff. Earliest date is ${minAllowedDate}.`;

  const available = getAvailableTimeSlots(dateStr, region);
  if (available.length === 0) {
     return `All available time slots for this date have passed. Please select a future date.`;
  }
  
  return null;
};

// Unified helper function for real-time time slot validation
const checkTimeSlotError = (dateStr, timeSlot, region) => {
  if (!timeSlot || !dateStr) return null;
  const availableSlots = getAvailableTimeSlots(dateStr, region);
  if (!availableSlots.includes(timeSlot)) {
    return `The selected time slot has already passed.`;
  }
  return null;
};

const initialFormState = {
  needsAppointment: 'Yes',
  region: '',
  destination: '',
  applianceDropOff: 'N/A',
  loadType: '',
  liveLoadAcknowledged: false,
  ids: [{ identifiers: [{ type: 'Shipment ID', value: '' }], date: '', timeSlot: '', skidCount: '', comments: '' }],
  hasBol: '',
  bolFiles: [],
  vendor: '',
  carrier: '',
  carrierEmail: '',
  carrierCCs: [],
  trailer: '',
  systemTimeWarning: 'None'
};

export default function App() {
  const [viewMode, setViewMode] = useState('vendor'); 
  const [formStep, setFormStep] = useState('EDIT'); 
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});

  const [allRequests, setAllRequests] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [activeReplyReq, setActiveReplyReq] = useState(null);

  // --- Bulk Reply State ---
  const [bulkReplyModalOpen, setBulkReplyModalOpen] = useState(false);

  // --- Filter State ---
  const [filters, setFilters] = useState({
    status: '',
    vendor: '',
    carrier: '',
    idValue: '',
    destination: '',
    appointmentDate: '',
    skidCount: '',
    timeSlot1: '',
    confirmedTime: '',
    appointmentId: ''
  });

  // --- Sort & Selection State ---
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'asc' });
  const [selectedIds, setSelectedIds] = useState(new Set());

  // --- UI Error State ---
  const [tmExportError, setTmExportError] = useState(false);

  useEffect(() => {
    if (formData.region) {
      const tDate = calculateTargetDate(formData.region);
      const warning = checkCutoffTime(formData.region);
      setFormData(prev => ({ 
        ...prev, 
        systemTimeWarning: warning || 'None',
        destination: '',
        ids: prev.ids.map(idObj => ({ ...idObj, date: tDate }))
      }));
    }
  }, [formData.region]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleIdChange = (index, field, val) => {
    const newIds = [...formData.ids];
    newIds[index][field] = val;
    setFormData(prev => ({ ...prev, ids: newIds }));
    
    if (formErrors[`id_${index}_${field}`]) {
      setFormErrors(prev => ({ ...prev, [`id_${index}_${field}`]: null }));
    }
  };

  const handleIdentifierChange = (shipmentIndex, identIndex, field, val) => {
    const newIds = [...formData.ids];
    newIds[shipmentIndex].identifiers[identIndex][field] = val;
    setFormData(prev => ({ ...prev, ids: newIds }));
    
    if (formErrors[`id_${shipmentIndex}_ident_${identIndex}_value`]) {
      setFormErrors(prev => ({ ...prev, [`id_${shipmentIndex}_ident_${identIndex}_value`]: null }));
    }
  };

  const handleCCChange = (index, value) => {
    const newCCs = [...formData.carrierCCs];
    newCCs[index] = value;
    setFormData(prev => ({ ...prev, carrierCCs: newCCs }));
    if (formErrors[`carrierCC_${index}`]) {
      setFormErrors(prev => ({ ...prev, [`carrierCC_${index}`]: null }));
    }
  };

  const addCCField = () => {
    setFormData(prev => ({ ...prev, carrierCCs: [...prev.carrierCCs, ''] }));
  };

  const removeCCField = (index) => {
    setFormData(prev => ({
      ...prev,
      carrierCCs: prev.carrierCCs.filter((_, i) => i !== index)
    }));
  };

  const addIdentifier = (shipmentIndex) => {
    const newIds = [...formData.ids];
    newIds[shipmentIndex].identifiers.push({ type: 'PO', value: '' });
    setFormData(prev => ({ ...prev, ids: newIds }));
  };

  const removeIdentifier = (shipmentIndex, identIndex) => {
    const newIds = [...formData.ids];
    newIds[shipmentIndex].identifiers.splice(identIndex, 1);
    setFormData(prev => ({ ...prev, ids: newIds }));
  };

  const addIdField = () => {
    const defaultDate = formData.region ? calculateTargetDate(formData.region) : '';
    setFormData(prev => ({ 
      ...prev, 
      ids: [...prev.ids, { identifiers: [{ type: 'Shipment ID', value: '' }], date: defaultDate, timeSlot: '', skidCount: '', comments: '' }]
    }));
  };

  const removeIdField = (index) => setFormData(prev => ({ ...prev, ids: prev.ids.filter((_, i) => i !== index)}));

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    let hasError = false;
    const readPromises = files.map(file => {
      return new Promise((resolve) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          hasError = true;
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64String = event.target.result.split(',')[1];
          resolve({ name: file.name, data: base64String });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(results => {
      const validFiles = results.filter(r => r !== null);
      if (hasError) {
        setFormErrors(prev => ({ ...prev, bolFiles: "One or more files were not PDFs and were ignored." }));
      } else {
        setFormErrors(prev => ({ ...prev, bolFiles: null }));
      }
      if (validFiles.length > 0) {
        setFormData(prev => ({ ...prev, bolFiles: [...prev.bolFiles, ...validFiles] }));
      }
    });
    
    e.target.value = null;
  };

  const validateForm = () => {
    let errors = {};
    if (!formData.region) errors.region = "Please select a region.";
    if (!formData.destination) errors.destination = "Please select a destination.";
    
    const needsApplianceSelection = formData.destination.includes('DFC') || formData.destination.includes('MDO');
    if (needsApplianceSelection && (!formData.applianceDropOff || formData.applianceDropOff === 'N/A')) {
      errors.applianceDropOff = "Please specify if this is an appliance drop off.";
    }

    if (!formData.loadType) errors.loadType = "Please select a load type.";
    if (formData.loadType === 'Live Load' && !formData.liveLoadAcknowledged && formData.applianceDropOff !== 'Yes') {
      errors.liveLoadAcknowledged = "You must acknowledge the skid limit for Live Loads.";
    }

    let totalSkids = 0;

    formData.ids.forEach((idObj, index) => {
      idObj.identifiers.forEach((ident, identIdx) => {
        if (ident.type === 'Shipment ID' && !/^6100\d{4}$/.test(ident.value) && ident.value !== '99999') {
          errors[`id_${index}_ident_${identIdx}_value`] = `Shipment ID #${identIdx + 1} must be exactly 8 digits and start with '6100', or be '99999'.`;
        } else if (ident.type === 'PO' && !/^([348]\d{7}|5\d{8})$/.test(ident.value) && ident.value !== '99999') {
          errors[`id_${index}_ident_${identIdx}_value`] = `PO #${identIdx + 1} must be 8 digits (starts with 3,4,8) OR 9 digits (starts with 5), or be '99999'.`;
        } else if (!ident.value) {
          errors[`id_${index}_ident_${identIdx}_value`] = `ID/PO value is required.`;
        }
      });

      if (!idObj.date) {
        errors[`id_${index}_date`] = `Date is required for Shipment #${index + 1}.`;
      } else {
        const dateErr = checkDateError(idObj.date, formData.region);
        if (dateErr) {
          errors[`id_${index}_date`] = dateErr;
        }
      }

      if (!idObj.timeSlot) {
        errors[`id_${index}_timeSlot`] = `Time slot is required for Shipment #${index + 1}.`;
      } else {
        const timeErr = checkTimeSlotError(idObj.date, idObj.timeSlot, formData.region);
        if (timeErr) {
          errors[`id_${index}_timeSlot`] = timeErr;
        }
      }
      
      const skidNum = parseInt(idObj.skidCount, 10);
      if (isNaN(skidNum) || skidNum <= 0 || skidNum >= 999) {
        errors[`id_${index}_skidCount`] = `Valid SKID count required for Shipment #${index + 1}.`;
      } else {
        totalSkids += skidNum;
        if (formData.loadType === 'Live Load' && skidNum > 15 && formData.applianceDropOff !== 'Yes') {
          errors[`id_${index}_skidCount`] = `Live loads cannot exceed 15 skids per shipment.`;
        }
      }
    });

    const maxAllowedSkids = 15 * formData.ids.length;
    if (formData.loadType === 'Live Load' && totalSkids > maxAllowedSkids && formData.applianceDropOff !== 'Yes') {
      errors.loadType = `If you selected more than 15 skids per shipment (total > ${maxAllowedSkids}), it will automatically be converted into a drop load. Please change to Drop Load.`;
    }

    if (!formData.hasBol) errors.hasBol = "Please specify if you have a BOL.";
    if (formData.hasBol === 'Yes' && formData.bolFiles.length === 0) {
      errors.bolFiles = "Please upload at least one BOL PDF file.";
    }

    if (!formData.vendor) errors.vendor = "Vendor/Shipper name is required.";
    if (!formData.carrier) errors.carrier = "Carrier name is required.";
    if (!formData.carrierEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.carrierEmail)) {
      errors.carrierEmail = "A valid email address is required.";
    }
    
    if (formData.carrierCCs && formData.carrierCCs.length > 0) {
      formData.carrierCCs.forEach((cc, index) => {
        if (cc.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cc.trim())) {
          errors[`carrierCC_${index}`] = "A valid email address is required.";
        }
      });
    }

    if (!formData.trailer) errors.trailer = "Trailer Number is required.";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setFormStep('SUCCESS');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTimeout(() => {
        const errorElement = document.querySelector('.border-red-500, .bg-red-50, .text-red-500');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  const handleRestartBooking = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setFormStep('EDIT');
  };

  const getCSVContent = (exportData) => {
    const bolNames = exportData.bolFiles.map(f => f.name).join('; ');
    
    const rows = [
      ["Field", "Value"],
      ["Appointment Needed", exportData.needsAppointment || ''],
      ["Region", exportData.region || ''],
      ["Destination", exportData.destination || ''],
      ["Appliance Drop Off", exportData.applianceDropOff || ''],
      ["Load Type", exportData.loadType || ''],
      ["Live Load Acknowledged", exportData.liveLoadAcknowledged ? 'Yes' : 'N/A'],
      ["Has BOL", exportData.hasBol || ''],
      ["BOL File", bolNames || 'N/A'],
      ["Vendor/Shipper", exportData.vendor || ''],
      ["Carrier", exportData.carrier || ''],
      ["Carrier Email", exportData.carrierEmail || ''],
      ["Carrier CC", (exportData.carrierCCs || []).filter(c => c.trim()).join(', ')],
      ["Trailer Number", exportData.trailer || ''],
      ["System Notice (Cutoff)", exportData.systemTimeWarning !== 'None' ? exportData.systemTimeWarning : 'None']
    ];

    exportData.ids.forEach((idObj, index) => {
      const n = index + 1;
      const combinedValues = idObj.identifiers.map(i => i.value).join(', ');
      const identStrings = idObj.identifiers.map(i => `${i.type}: ${i.value}`).join(' | ');

      rows.push([`ID ${n} - Type`, idObj.identifiers[0]?.type || '']);
      rows.push([`ID ${n} - Value`, combinedValues]);
      rows.push([`ID ${n} - Identifiers Detailed`, identStrings]);
      rows.push([`ID ${n} - Date`, idObj.date || '']);
      rows.push([`ID ${n} - Time Slot`, idObj.timeSlot || '']);
      rows.push([`ID ${n} - Skid Count`, idObj.skidCount || '']);
      rows.push([`ID ${n} - Comments`, idObj.comments || '']);
    });

    return rows.map(e => e.map(item => `"${(item||'').toString().replace(/"/g, '""')}"`).join(",")).join("\r\n");
  };

  const handleEmailBooking = () => {
    const firstId = formData.ids[0]?.identifiers[0]?.value || '';
    const titleSuffix = formData.ids.length > 1 || formData.ids[0]?.identifiers.length > 1 ? ' & others' : '';
    const subject = `Load Booking Request - ${firstId}${titleSuffix} - ${formData.destination}`;
    
    let bodyText = `Please find the load booking details below:\r\n\r\n`;
    bodyText += `Region: ${formData.region || ''}\r\n`;
    bodyText += `Destination: ${formData.destination || ''}\r\n`;
    if (formData.applianceDropOff && formData.applianceDropOff !== 'N/A') bodyText += `Appliance Drop Off: ${formData.applianceDropOff}\r\n`;
    bodyText += `Load Type: ${formData.loadType || ''}\r\n`;
    
    const bolNames = formData.bolFiles.map(f => f.name).join(', ');
    bodyText += `Has BOL: ${formData.hasBol || ''} ${formData.bolFiles.length > 0 ? `(${bolNames})` : ''}\r\n`;
    
    const validCCs = (formData.carrierCCs || []).filter(c => c.trim()).join(', ');

    bodyText += `Vendor/Shipper: ${formData.vendor || ''}\r\n`;
    bodyText += `Carrier: ${formData.carrier || ''}\r\n`;
    bodyText += `Carrier Email: ${formData.carrierEmail || ''}\r\n`;
    if (validCCs) bodyText += `Carrier CC: ${validCCs}\r\n`;
    bodyText += `Trailer Number: ${formData.trailer || ''}\r\n\r\n`;

    bodyText += `--- Shipments / POs ---\r\n`;
    formData.ids.forEach((idObj, index) => {
      const identStrings = idObj.identifiers.map(i => `${i.type}: ${i.value}`).join(', ');
      bodyText += `\r\n[#${index + 1}] Identifiers: ${identStrings}\r\n`;
      bodyText += `Date: ${idObj.date} | Preferred Time: ${idObj.timeSlot} | SKIDs: ${idObj.skidCount}\r\n`;
      if (idObj.comments) bodyText += `Comments: ${idObj.comments}\r\n`;
    });
    bodyText += `\r\n-----------------------\r\n`;

    const csvData = getCSVContent(formData);
    const base64CSV = btoa(unescape(encodeURIComponent("\uFEFF" + csvData))); 
    const boundary = "----=_NextPart_" + Date.now().toString(16);

    const toEmail = formData.region === 'East' ? 'TorontoAppts@homedepot.com' : 'CalgaryAppts@homedepot.com';

    const emlContent = [
      `To: ${toEmail}`,
      ...(validCCs ? [`Cc: ${validCCs}`] : []),
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
      `Content-Type: text/csv; name="booking_request_${firstId || 'export'}.csv"`,
      `Content-Disposition: attachment; filename="booking_request_${firstId || 'export'}.csv"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64CSV
    ];

    formData.bolFiles.forEach(fileObj => {
      emlContent.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="${fileObj.name}"`,
        `Content-Disposition: attachment; filename="${fileObj.name}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        fileObj.data
      );
    });

    emlContent.push(`--${boundary}--`);

    const blob = new Blob([emlContent.join('\r\n')], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Booking_Request_${firstId || 'Export'}.eml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Admin Bulk Compiler Logic ---
  const parseFileContent = (fileText, fileName = "") => {
    let cleanText = fileText.replace(/\u0000/g, '');
    const extractedData = {};

    let emailDate = new Date();
    const dateMatch = cleanText.match(/^Date:\s*(.+)$/m);
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1].trim());
      if (!isNaN(parsedDate.getTime())) emailDate = parsedDate;
    }

    let originalSubject = fileName.replace(/\.[^/.]+$/, ""); 
    const subjMatch = cleanText.match(/^Subject:\s*(.+)$/im);
    if (subjMatch) {
      originalSubject = subjMatch[1].trim();
    }

    let originalMessageId = "";
    const msgIdMatch = cleanText.match(/^Message-ID:\s*(.+)$/im);
    if (msgIdMatch) {
      originalMessageId = msgIdMatch[1].trim();
    }

    if (fileName.toLowerCase().endsWith('.csv')) {
        const lines = cleanText.split(/\r?\n/);
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const key = parts[0].replace(/"/g, '').trim();
                const val = parts.slice(1).join(',').replace(/"/g, '').trim();
                extractedData[key] = val;
            }
        });
    } else {
        const b64Regex = /([A-Za-z0-9+/]{100,}={0,2})/g;
        let b64match;
        while ((b64match = b64Regex.exec(cleanText)) !== null) {
           try {
              const decoded = atob(b64match[1]);
              if (decoded.includes('Destination') || decoded.includes('Region')) {
                  cleanText += "\n" + decoded.replace(/\u0000/g, ''); 
              }
           } catch(e) {}
        }

        const pairRegex = /"([^"]+)","([^"]*)"/g;
        let match;
        while ((match = pairRegex.exec(cleanText)) !== null) {
          extractedData[match[1]] = match[2];
        }
    }

    const requests = [];
    let i = 1;
    while (extractedData[`ID ${i} - Value`]) {
      const req = { 
        id: fileName + Date.now().toString() + "_" + i, 
        sourceFile: fileName,
        originalSubject: originalSubject,
        originalMessageId: originalMessageId,
        timestamp: emailDate.toISOString(),
        displayTime: emailDate.toLocaleString(),
        status: 'Requested',
        region: extractedData["Region"],
        destination: extractedData["Destination"],
        applianceDropOff: extractedData["Appliance Drop Off"],
        loadType: extractedData["Load Type"],
        hasBol: extractedData["Has BOL"],
        bolFile: extractedData["BOL File"],
        vendor: extractedData["Vendor/Shipper"],
        carrier: extractedData["Carrier"],
        carrierEmail: extractedData["Carrier Email"],
        carrierEmailCC: extractedData["Carrier CC"],
        trailer: extractedData["Trailer Number"],
        idType: extractedData[`ID ${i} - Type`],
        idValue: extractedData[`ID ${i} - Value`],
        appointmentDate: formatTmDate(extractedData[`ID ${i} - Date`]),
        timeSlot1: formatTmTime(extractedData[`ID ${i} - Time Slot`]),
        skidCount: extractedData[`ID ${i} - Skid Count`],
        comments: extractedData[`ID ${i} - Comments`],
        confirmedDate: formatTmDate(extractedData[`ID ${i} - Date`]) || '',
        confirmedTimeSlot: formatTmTime(extractedData[`ID ${i} - Time Slot`]) || '',
        appointmentId: '',
        exceptionFlag: false
      };
      
      if (req.loadType === 'Live Load' && parseInt(req.skidCount, 10) > 15 && req.applianceDropOff !== 'Yes') {
        req.exceptionFlag = true;
      }

      requests.push(req);
      i++;
    }

    if (requests.length === 0 && (extractedData["Destination"] || extractedData["ID Value"])) {
      const req = { 
        id: fileName + Date.now().toString(), 
        sourceFile: fileName,
        originalSubject: originalSubject,
        originalMessageId: originalMessageId,
        timestamp: emailDate.toISOString(),
        displayTime: emailDate.toLocaleString(),
        status: 'Requested',
        needsAppointment: extractedData["Appointment Needed"],
        region: extractedData["Region"],
        destination: extractedData["Destination"],
        appointmentDate: formatTmDate(extractedData["Date"]),
        timeSlot1: formatTmTime(extractedData["1st Choice Time Slot"] || extractedData["Time Slot"]),
        applianceDropOff: extractedData["Appliance Drop Off"],
        loadType: extractedData["Load Type"],
        idType: extractedData["ID Type"],
        idValue: extractedData["ID Value"],
        hasBol: extractedData["Has BOL"],
        skidCount: extractedData["SKID Count"],
        vendor: extractedData["Vendor/Shipper"],
        carrier: extractedData["Carrier"],
        carrierEmail: extractedData["Carrier Email"],
        carrierEmailCC: extractedData["Carrier CC"],
        trailer: extractedData["Trailer Number"],
        confirmedDate: formatTmDate(extractedData["Date"]) || '',
        confirmedTimeSlot: formatTmTime(extractedData["1st Choice Time Slot"] || extractedData["Time Slot"]) || '',
        appointmentId: '',
        exceptionFlag: false
      };

      if (req.loadType === 'Live Load' && parseInt(req.skidCount, 10) > 15 && req.applianceDropOff !== 'Yes') {
        req.exceptionFlag = true;
      }
      requests.push(req);
    }

    return requests;
  };

  const handleAdminFileUpload = (files) => {
    if (!files || !files.length) return;

    const parsedRequests = [];
    let processedCount = 0;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        let text = event.target.result;
        text = text.replace(/^\uFEFF/, ''); 
        
        const newReqs = parseFileContent(text, file.name);
        if (newReqs && newReqs.length > 0) {
          parsedRequests.push(...newReqs);
        }
        
        processedCount++;
        if (processedCount === files.length) {
          updateAdminTable(parsedRequests);
        }
      };
      reader.readAsText(file);
    });
  };

  const handleTMSyncUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // Dynamically load XLSX library for parsing the export file
      await new Promise((resolve, reject) => {
        if (window.XLSX) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Force the parser to return the formatted text strings (e.g. "11:30:00 PM") 
          // instead of Excel's underlying serial numbers.
          const json = window.XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }); 
          
          if (json.length === 0) {
            setTmExportError(true);
            alert("Error: The uploaded TM Export file is empty.");
            return;
          }

          const headers = Object.keys(json[0]);
          const hasRequiredColumns = headers.includes('Freight Order') || headers.includes('Purchasing Doc.');
          const hasApptIdColumn = headers.includes('Appointment ID');

          if (!hasRequiredColumns || !hasApptIdColumn) {
             setTmExportError(true);
             alert("Error: Invalid file format.\n\nPlease ensure you are uploading the official SAP TM Export. The file must contain 'Appointment ID' and either 'Freight Order' or 'Purchasing Doc.' columns.");
             return;
          }
          
          setTmExportError(false);
          let syncCount = 0;
          let missingIdCount = 0;
          
          setAllRequests(prev => prev.map(req => {
            const reqIdentifiers = req.idValue.split(',').map(s => s.trim());
            const tmRow = json.find(row => {
              const tmFo = row['Freight Order'] ? String(row['Freight Order']).trim() : null;
              const tmPo = row['Purchasing Doc.'] ? String(row['Purchasing Doc.']).trim() : null;
              
              // 1. Check for standard exact match
              if ((tmFo && tmFo !== '99999' && reqIdentifiers.includes(tmFo)) || 
                  (tmPo && tmPo !== '99999' && reqIdentifiers.includes(tmPo))) {
                return true;
              }

              // 2. Check for "99999" fallback match in Comments
              if (tmFo === '99999' || tmPo === '99999') {
                 const comments = row['Comments'] ? String(row['Comments']).trim() : '';
                 const poMatch = comments.match(/PO\s*(\d+)/i);
                 if (poMatch && poMatch[1] && reqIdentifiers.includes(poMatch[1])) {
                     return true;
                 }
              }
              
              return false;
            });

            if (tmRow) {
              syncCount++;
              const apptId = tmRow['Appointment ID'] ? String(tmRow['Appointment ID']).trim() : '';
              if (!apptId) missingIdCount++;

              let finalSkidCount = tmRow['Number of Skids'] != null && tmRow['Number of Skids'] !== "" 
                ? String(tmRow['Number of Skids']) 
                : req.skidCount;

              const tmFo = tmRow['Freight Order'] ? String(tmRow['Freight Order']).trim() : null;
              const tmPo = tmRow['Purchasing Doc.'] ? String(tmRow['Purchasing Doc.']).trim() : null;

              if (tmFo === '99999' || tmPo === '99999') {
                 const comments = tmRow['Comments'] ? String(tmRow['Comments']).trim() : '';
                 const pcsMatch = comments.match(/(\d+)\s*PCS/i);
                 if (pcsMatch && pcsMatch[1]) {
                    finalSkidCount = pcsMatch[1];
                 }
              }

              return {
                ...req,
                appointmentId: apptId || req.appointmentId || '',
                // Ensure TM Export only updates the APPT ID and nothing else related to dates
                skidCount: finalSkidCount,
                vendor: tmRow['Vendor Name'] || req.vendor,
                carrier: tmRow['SCAC Code'] || tmRow['Carrier'] || req.carrier,
                loadType: tmRow['Type'] || req.loadType,
                destination: tmRow['Facility Name'] ? `${tmRow['Facility ID']} - ${tmRow['Facility Name']}` : req.destination,
                comments: tmRow['Comments'] || req.comments,
                tmSyncError: !apptId,
                validationError: false
              };
            }
            return req;
          }));

          alert(`Success! TM Export has been successfully synced.\n\nMatched and updated ${syncCount} request(s) on your board.${missingIdCount > 0 ? `\n\nWARNING: ${missingIdCount} matched record(s) are missing an Appointment ID in the export.` : ''}`);
        } catch (err) {
          console.error(err);
          setTmExportError(true);
          alert("Error parsing the TM Export file. Please ensure it is a valid CSV or XLSX format.");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setTmExportError(true);
      alert("Failed to load Excel parsing library.");
    }
    e.target.value = null;
  };

  const updateAdminTable = (newReqs) => {
    setAllRequests(prev => {
      const existingIds = new Set(prev.filter(r => r.status === 'Requested').map(r => r.idValue));
      const filteredNewReqs = newReqs.filter(r => !existingIds.has(r.idValue));
      
      const combined = [...prev, ...filteredNewReqs];
      return combined;
    });
  };

  const removeRequest = (idToRemove) => {
    setAllRequests(prev => prev.filter(req => req.id !== idToRemove));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(idToRemove);
      return next;
    });
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
    if (sortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 text-[#f96302]" />;
    return <ArrowDown className="w-3 h-3 text-[#f96302]" />;
  };

  const processedRequests = [...allRequests]
    .filter(req => {
      if (filters.status && req.status !== filters.status) return false;
      if (filters.vendor && !(req.vendor || '').toLowerCase().includes(filters.vendor.toLowerCase())) return false;
      if (filters.carrier && !(req.carrier || '').toLowerCase().includes(filters.carrier.toLowerCase())) return false;
      if (filters.idValue && !req.idValue.toLowerCase().includes(filters.idValue.toLowerCase())) return false;
      if (filters.destination && !req.destination.toLowerCase().includes(filters.destination.toLowerCase())) return false;
      if (filters.appointmentDate && req.appointmentDate !== filters.appointmentDate) return false;
      if (filters.skidCount && !req.skidCount.toString().includes(filters.skidCount)) return false;
      if (filters.timeSlot1 && !req.timeSlot1.toLowerCase().includes(filters.timeSlot1.toLowerCase())) return false;
      if (filters.confirmedTime && !(req.confirmedTimeSlot || '').toLowerCase().includes(filters.confirmedTime.toLowerCase())) return false;
      if (filters.appointmentId && !(req.appointmentId || '').toLowerCase().includes(filters.appointmentId.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'skidCount') {
        aValue = parseInt(aValue, 10) || 0;
        bValue = parseInt(bValue, 10) || 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const visiblePending = processedRequests.filter(r => r.status === 'Requested');
  const isAllSelected = visiblePending.length > 0 && visiblePending.every(r => selectedIds.has(r.id));
  const selectedPendingReqs = processedRequests.filter(r => r.status === 'Requested' && selectedIds.has(r.id));
  const selectedPendingCount = selectedPendingReqs.length;

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allVisiblePendingIds = processedRequests
        .filter(req => req.status === 'Requested')
        .map(req => req.id);
      setSelectedIds(new Set([...selectedIds, ...allVisiblePendingIds]));
    } else {
      const visibleIds = new Set(processedRequests.map(req => req.id));
      const nextSelected = new Set([...selectedIds].filter(id => !visibleIds.has(id)));
      setSelectedIds(nextSelected);
    }
  };

  const toggleSelection = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

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

  const openReplyModal = (req) => {
    if (!req.carrierEmail) {
      alert("No email address was provided by the carrier for this request.");
      return;
    }
    setActiveReplyReq(req);
    setReplyModalOpen(true);
  };

  const generateReplyEmail = () => {
    const req = activeReplyReq;
    if (!req) return;

    let subject = req.originalSubject || `Load Booking Request - ${req.idValue || 'N/A'}`;
    if (!subject.toUpperCase().startsWith('RE:')) {
      subject = `RE: ${subject}`;
    }

    const finalConfDate = req.confirmedDate || req.appointmentDate;
    const finalConfTime = req.confirmedTimeSlot || req.timeSlot1;
    const isCustom = finalConfDate !== req.appointmentDate || (finalConfTime !== req.timeSlot1);

    let bodyText = `Hello,\r\n\r\nRegarding your load booking request for ${req.destination || ''}:\r\n\r\n`;
    bodyText += `ID/PO: ${req.idValue || 'N/A'}\r\n`;
    bodyText += `Appointment ID: ${req.appointmentId || 'N/A'}\r\n\r\n`;

    if (isCustom) {
       bodyText += `Unfortunately, your requested preferences are not available. Are you good to proceed with the following proposed time?\r\n\r\n`;
       bodyText += `Proposed Date: ${finalConfDate}\r\n`;
       bodyText += `Proposed Time: ${finalConfTime}\r\n\r\n`;
       bodyText += `Please confirm if this works for you.\r\n\r\n`;
    } else {
       bodyText += `Your appointment has been confirmed for the following time slot:\r\n\r\n`;
       bodyText += `Confirmed Date: ${finalConfDate}\r\n`;
       bodyText += `Confirmed Time: ${finalConfTime}\r\n\r\n`;
    }
    bodyText += `Thank you,\r\nHome Depot Appointments Team`;

    const emlContent = [
      `To: ${req.carrierEmail}`,
      ...(req.carrierEmailCC ? [`Cc: ${req.carrierEmailCC}`] : []),
      `Subject: ${subject}`,
      `X-Unsent: 1`, 
      ...(req.originalMessageId ? [
        `In-Reply-To: ${req.originalMessageId}`,
        `References: ${req.originalMessageId}`
      ] : []),
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      bodyText
    ].join('\r\n');

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Reply_${req.sourceFile ? req.sourceFile.replace(/\.[^/.]+$/, "") : req.idValue}.eml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setReplyModalOpen(false);
    setActiveReplyReq(null);
    
    setAllRequests(prev => prev.map(item => 
      item.id === req.id 
        ? { ...item, status: isCustom ? 'Countered' : 'Scheduled' } 
        : item
    ));
  };

  const generateBulkReplyEmail = async () => {
    if (selectedPendingCount === 0) return;

    let updatedRequests = [...allRequests];

    const groupedReqs = {};
    selectedPendingReqs.forEach(req => {
      const key = req.carrierEmail ? req.carrierEmail.toLowerCase().trim() : `${req.vendor}_${req.carrier}`;
      if (!groupedReqs[key]) groupedReqs[key] = [];
      groupedReqs[key].push(req);
    });

    for (const key in groupedReqs) {
       const group = groupedReqs[key];
       const firstReq = group[0];
       const carrierEmail = firstReq.carrierEmail;
       const groupCCs = [...new Set(group.map(r => r.carrierEmailCC).filter(Boolean).flatMap(cc => cc.split(',').map(s => s.trim())))].join(', ');
       let hasCustom = false;

       let subject = firstReq.originalSubject || `Load Booking Request - ${firstReq.idValue || 'N/A'}`;
       if (!subject.toUpperCase().startsWith('RE:')) {
         subject = `RE: ${subject}`;
       }
       if (group.length > 1) {
         subject = `RE: Load Booking Request Confirmations (${group.length} Shipments) - ${firstReq.destination}`;
       }

       let bodyText = `Hello,\r\n\r\nRegarding your load booking request(s):\r\n\r\n`;

       group.forEach(req => {
         const finalConfDate = req.confirmedDate || req.appointmentDate;
         const finalConfTime = req.confirmedTimeSlot || req.timeSlot1;
         const isCustom = finalConfDate !== req.appointmentDate || (finalConfTime !== req.timeSlot1);
         if (isCustom) hasCustom = true;

         bodyText += `--- ID/PO: ${req.idValue || 'N/A'} ---\r\n`;
         bodyText += `Destination: ${req.destination || ''}\r\n`;
         bodyText += `Appointment ID: ${req.appointmentId || 'N/A'}\r\n`;
         
         if (isCustom) {
            bodyText += `Status: Countered - Requested time unavailable.\r\n`;
            bodyText += `Proposed Date: ${finalConfDate}\r\n`;
            bodyText += `Proposed Time: ${finalConfTime}\r\n\r\n`;
         } else {
            bodyText += `Status: Confirmed\r\n`;
            bodyText += `Confirmed Date: ${finalConfDate}\r\n`;
            bodyText += `Confirmed Time: ${finalConfTime}\r\n\r\n`;
         }

         updatedRequests = updatedRequests.map(item => 
           item.id === req.id 
             ? { ...item, status: isCustom ? 'Countered' : 'Scheduled' } 
             : item
         );
       });

       if (hasCustom) {
          bodyText += `Please confirm if the proposed times work for you.\r\n\r\n`;
       }

       bodyText += `Thank you,\r\nHome Depot Central Scheduling`;

       const emlContent = [
         `To: ${carrierEmail || ''}`,
         ...(groupCCs ? [`Cc: ${groupCCs}`] : []),
         `Subject: ${subject}`,
         `X-Unsent: 1`, 
         ...(firstReq.originalMessageId ? [
           `In-Reply-To: ${firstReq.originalMessageId}`,
           `References: ${firstReq.originalMessageId}`
         ] : []),
         `Content-Type: text/plain; charset="UTF-8"`,
         ``,
         bodyText
       ].join('\r\n');

       const blob = new Blob([emlContent], { type: 'message/rfc822' });
       const url = URL.createObjectURL(blob);
       const link = document.createElement("a");
       link.href = url;
       
       link.download = `Reply_Consolidated_${firstReq.carrier ? firstReq.carrier.replace(/[^a-z0-9]/gi, '_') : 'Carrier'}.eml`;
       
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       URL.revokeObjectURL(url);

       await new Promise(resolve => setTimeout(resolve, 300));
    }

    setAllRequests(updatedRequests);
    setBulkReplyModalOpen(false);
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      selectedPendingReqs.forEach(req => next.delete(req.id));
      return next;
    });
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'Scheduled': return 'bg-green-100 text-green-800 border-green-200';
      case 'Countered': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Requested': default: return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const exportBoardToCSV = () => {
    if (allRequests.length === 0) {
      alert("The board is empty. Nothing to export.");
      return;
    }

    const headers = [
      "System ID", "Source File", "Timestamp", "Status", "Region", "Destination", 
      "Load Type", "Vendor", "Carrier", "Carrier Email", "Carrier CC", "Trailer",
      "ID Type", "ID Value", "Target Date", "Skids", "Pref Time",
      "Confirmed Date", "Confirmed Time", "Appt ID", "Exception", "Comments"
    ];

    const rows = allRequests.map(req => [
      req.id, req.sourceFile, req.timestamp, req.status, req.region, req.destination,
      req.loadType, req.vendor, req.carrier, req.carrierEmail, req.carrierEmailCC, req.trailer,
      req.idType, req.idValue, req.appointmentDate, req.skidCount, req.timeSlot1,
      req.confirmedDate, req.confirmedTimeSlot, req.appointmentId, req.exceptionFlag, req.comments
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(item => `"${(item || '').toString().replace(/"/g, '""')}"`).join(","))
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Compiler_Debug_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const currentDestinationOptions = formData.region === 'East' ? EAST_DESTINATIONS : (formData.region === 'West' ? WEST_DESTINATIONS : []);
  const needsApplianceSelection = formData.destination.includes('DFC') || formData.destination.includes('MDO');

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="bg-[#f96302] text-white p-4 shadow-md z-10 flex justify-between items-center relative">
        <div 
          className="flex items-center gap-3 cursor-pointer select-none transition-transform active:scale-95" 
          onDoubleClick={handleHeaderDoubleClick}
          title="Double click me!"
        >
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide">Load Booking Assistant</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {viewMode === 'vendor' ? (
             <button onClick={() => setViewMode('admin')} className="flex items-center gap-2 bg-orange-800 bg-opacity-30 hover:bg-opacity-50 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-orange-400">
               <LayoutDashboard className="w-4 h-4"/> Email Compiler
             </button>
           ) : (
             <button onClick={() => setViewMode('vendor')} className="flex items-center gap-2 bg-white text-[#f96302] hover:bg-orange-50 px-3 py-1.5 rounded-full text-xs font-bold transition-colors">
               <ArrowLeft className="w-4 h-4"/> Back to Form
             </button>
           )}
        </div>
      </header>

      {showEasterEgg && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-[100] animate-in slide-in-from-top-4 fade-in duration-300 flex flex-col items-center gap-1 border border-slate-700">
          <span className="text-2xl mb-1">🎉</span>
          <p className="font-bold text-center text-lg">Made by Aaftab khanna</p>
          <p className="text-sm text-center text-slate-300">Aaftabkhanna007@outlook.com</p>
        </div>
      )}

      {/* --- Admin View --- */}
      {viewMode === 'admin' && (
        <main 
          className={`flex-1 overflow-y-auto p-6 transition-colors relative ${isDragging ? 'bg-blue-50' : 'bg-slate-100'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            let filesToProcess = [];
            if (e.dataTransfer.items) {
               for (let i = 0; i < e.dataTransfer.items.length; i++) {
                  if (e.dataTransfer.items[i].kind === 'file') {
                     const file = e.dataTransfer.items[i].getAsFile();
                     if (file) filesToProcess.push(file);
                  }
               }
            } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
               filesToProcess = Array.from(e.dataTransfer.files);
            }
            if (filesToProcess.length > 0) handleAdminFileUpload(filesToProcess);
            else alert("No valid files detected. Please drag and drop actual files from Classic Outlook.");
          }}
        >
           {isDragging && (
              <div className="absolute inset-0 bg-blue-100/90 z-50 flex flex-col items-center justify-center rounded-xl pointer-events-none border-4 border-dashed border-blue-500 m-4">
                <UploadCloud className="w-20 h-20 text-blue-600 mb-4 animate-bounce" />
                <h2 className="text-3xl font-bold text-blue-800 text-center">Drop Emails Here</h2>
                <p className="text-blue-600 mt-2 font-medium">Release to instantly read and compile all files (.eml, .msg, .csv)</p>
              </div>
           )}

           <div className="max-w-[105rem] mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Email Compiler</h2>
                  <p className="text-sm text-slate-500">Drag-and-drop files directly from Classic Outlook here. They will be sorted oldest to newest (FIFO).</p>
                </div>
                <div className="flex gap-2">
                  <label className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-colors cursor-pointer ${tmExportError ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                     {tmExportError ? <AlertTriangle className="w-5 h-5 text-white" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />} Upload TM Export
                     <input type="file" accept=".csv,.xlsx" className="hidden" onChange={handleTMSyncUpload} />
                  </label>
                  <button 
                    onClick={() => {
                      if (selectedPendingCount === 0) {
                        alert("Please select at least one 'Requested' item using the checkboxes on the left to reply to.");
                        return;
                      }

                      // Validation: Check for missing Appt IDs
                      const missingFields = selectedPendingReqs.filter(r => !r.appointmentId?.trim());
                      
                      if (missingFields.length > 0) {
                        setAllRequests(prev => prev.map(req => {
                          if (missingFields.find(m => m.id === req.id)) {
                            return { ...req, validationError: true };
                          }
                          return req;
                        }));
                        alert("Please enter an Appointment ID for all selected requests before replying.");
                        return;
                      }

                      setBulkReplyModalOpen(true);
                    }} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-colors"
                  >
                     <Reply className="w-5 h-5" /> Reply Selected ({selectedPendingCount})
                  </button>
                  <button onClick={exportBoardToCSV} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-lg shadow-sm font-medium transition-colors">
                     <Download className="w-5 h-5" /> Export
                  </button>
                  <button onClick={() => { setAllRequests([]); setSelectedIds(new Set()); }} className="flex items-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg shadow-sm font-medium transition-colors">
                     Clear Board
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                  <table className="w-full text-sm text-left relative">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3 w-10 text-center">
                          <input 
                            type="checkbox" 
                            className="accent-[#f96302] w-4 h-4 rounded cursor-pointer"
                            checked={isAllSelected}
                            onChange={handleSelectAll}
                            disabled={visiblePending.length === 0}
                            title="Select all filtered pending requests"
                          />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('timestamp')}>
                          <div className="flex items-center gap-1">Received {getSortIcon('timestamp')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('status')}>
                          <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('vendor')}>
                          <div className="flex items-center gap-1">Vendor {getSortIcon('vendor')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('carrier')}>
                          <div className="flex items-center gap-1">Carrier {getSortIcon('carrier')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('idValue')}>
                          <div className="flex items-center gap-1">ID / PO {getSortIcon('idValue')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('destination')}>
                          <div className="flex items-center gap-1">Destination {getSortIcon('destination')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('appointmentDate')}>
                          <div className="flex items-center gap-1">Target Date {getSortIcon('appointmentDate')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('skidCount')}>
                          <div className="flex items-center gap-1">Skids {getSortIcon('skidCount')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('timeSlot1')}>
                          <div className="flex items-center gap-1">Pref Time {getSortIcon('timeSlot1')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none text-[#f96302]">
                          <div className="flex items-center gap-1">Confirmed Time</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none text-[#f96302]" onClick={() => requestSort('appointmentId')}>
                          <div className="flex items-center gap-1">Appt ID {getSortIcon('appointmentId')}</div>
                        </th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                      {/* --- Filter Row --- */}
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2">
                          <select className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                            <option value="">All</option>
                            <option value="Requested">Requested</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Countered">Countered</option>
                          </select>
                        </th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Vendor..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.vendor} onChange={e => setFilters({...filters, vendor: e.target.value})} />
                        </th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Carrier..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.carrier} onChange={e => setFilters({...filters, carrier: e.target.value})} />
                        </th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter ID..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.idValue} onChange={e => setFilters({...filters, idValue: e.target.value})} />
                        </th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Dest..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.destination} onChange={e => setFilters({...filters, destination: e.target.value})} />
                        </th>
                        <th className="px-2 py-2">
                          <input type="date" className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.appointmentDate} onChange={e => setFilters({...filters, appointmentDate: e.target.value})} />
                        </th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Skids..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.skidCount} onChange={e => setFilters({...filters, skidCount: e.target.value})} />
                        </th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Time..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.timeSlot1} onChange={e => setFilters({...filters, timeSlot1: e.target.value})} />
                        </th>
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Appt ID..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.appointmentId} onChange={e => setFilters({...filters, appointmentId: e.target.value})} />
                        </th>
                        <th className="px-2 py-2 text-center">
                           <button onClick={() => setFilters({status: '', vendor: '', carrier: '', idValue: '', destination: '', appointmentDate: '', skidCount: '', timeSlot1: '', confirmedTime: '', appointmentId: ''})} className="w-full px-2 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-600 text-xs font-medium transition-colors flex justify-center items-center gap-1">
                             <X className="w-3.5 h-3.5"/> Clear
                           </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allRequests.length === 0 ? (
                        <tr>
                           <td colSpan="13" className="px-4 py-16 text-center">
                              <div className="flex flex-col items-center justify-center text-slate-400">
                                 <UploadCloud className="w-16 h-16 mb-4 text-slate-300" />
                                 <p className="text-lg font-medium text-slate-500">No requests compiled yet.</p>
                                 <p className="text-sm mt-1">Download the CSV files from your emails and select them above.</p>
                              </div>
                           </td>
                        </tr>
                      ) : processedRequests.length === 0 ? (
                        <tr>
                           <td colSpan="13" className="px-4 py-16 text-center text-slate-500 font-medium">
                              No requests match your current filters.
                           </td>
                        </tr>
                      ) : (
                        processedRequests.map((req, idx) => (
                          <tr key={req.id || idx} className={`transition-colors ${req.status !== 'Requested' ? 'bg-slate-50 opacity-75' : 'hover:bg-slate-50'}`}>
                            <td className="px-4 py-3 text-center">
                              {req.status === 'Requested' ? (
                                <input 
                                  type="checkbox" 
                                  className="accent-[#f96302] w-4 h-4 rounded cursor-pointer"
                                  checked={selectedIds.has(req.id)}
                                  onChange={() => toggleSelection(req.id)}
                                />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-slate-300 mx-auto" />
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{req.displayTime}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(req.status)}`}>
                                {req.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[120px]" title={req.vendor}>{req.vendor || '--'}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[120px]" title={req.carrier}>{req.carrier || '--'}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{req.idValue}</td>
                            <td className="px-4 py-3 text-slate-600">{req.destination?.split(' - ')[1] || req.destination}</td>
                            <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{req.appointmentDate}</td>
                            
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 font-medium">{req.skidCount}</span>
                                {req.exceptionFlag && (
                                  <AlertCircle className="w-4 h-4 text-red-500" title="Exception: Exceeds Skid Limit for Live Load" />
                                )}
                              </div>
                            </td>
                            
                            <td className="px-4 py-3 text-xs text-slate-600 min-w-[120px]">
                               {req.timeSlot1}
                            </td>

                            <td className="px-4 py-3 min-w-[160px]">
                              {req.status === 'Requested' ? (
                                <div className="flex flex-col gap-1.5">
                                  <input 
                                    type="date" 
                                    value={req.confirmedDate || ''} 
                                    onChange={(e) => {
                                      setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, confirmedDate: e.target.value, validationError: false } : r));
                                    }}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:border-[#f96302] transition-colors"
                                  />
                                  <select 
                                    value={req.confirmedTimeSlot || ''} 
                                    onChange={(e) => {
                                      setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, confirmedTimeSlot: e.target.value, validationError: false } : r));
                                    }}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:border-[#f96302] transition-colors"
                                  >
                                    <option value="">-- Select Time --</option>
                                    {ALL_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                                    {req.confirmedTimeSlot && !ALL_TIME_SLOTS.includes(req.confirmedTimeSlot) && (
                                      <option value={req.confirmedTimeSlot}>{req.confirmedTimeSlot} (SAP)</option>
                                    )}
                                  </select>
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="text-slate-800 font-medium text-xs">{req.confirmedDate || req.appointmentDate}</span>
                                  <span className="text-slate-500 text-[10px]">{req.confirmedTimeSlot || req.timeSlot1}</span>
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 min-w-[120px]">
                              {req.status === 'Requested' ? (
                                <div className="relative">
                                  <input 
                                    type="text" 
                                    value={req.appointmentId || ''} 
                                    onChange={(e) => {
                                      setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, appointmentId: e.target.value, tmSyncError: false, validationError: false } : r));
                                    }}
                                    placeholder="Enter Appt ID..."
                                    className={`w-full px-2 py-1.5 border rounded text-xs outline-none focus:border-[#f96302] transition-colors ${(req.tmSyncError || (req.validationError && !req.appointmentId?.trim())) ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}
                                  />
                                  {req.tmSyncError && <AlertCircle className="w-3 h-3 text-red-500 absolute right-2 top-2" title="Missing Appointment ID from TM Sync" />}
                                </div>
                              ) : (
                                <span className="text-slate-800 font-medium text-xs">{req.appointmentId || '--'}</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-center">
                              {req.status === 'Requested' ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button 
                                    onClick={() => {
                                      if (!req.appointmentId?.trim()) {
                                        setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, validationError: true } : r));
                                        alert("Please enter an Appointment ID before replying.");
                                        return;
                                      }
                                      openReplyModal(req);
                                    }} 
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-colors border bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                                  >
                                    <Reply className="w-3.5 h-3.5" /> Reply
                                  </button>
                                  <button onClick={() => removeRequest(req.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Remove Request">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Processed</span>
                              )}
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
      )}

      {/* Admin Single Reply Modal */}
      {replyModalOpen && activeReplyReq && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center gap-2 text-blue-700">
              <Reply className="w-5 h-5"/>
              <h3 className="font-bold text-lg">Send Confirmation to Carrier</h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
               <p className="text-sm text-slate-600">You are about to generate a confirmation draft for <strong>{activeReplyReq.carrier}</strong>.</p>
               
               {activeReplyReq.exceptionFlag && (
                 <div className="bg-red-50 text-red-800 p-3 rounded-md border border-red-200 text-sm flex items-start gap-2">
                   <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                   <p><strong>Exception:</strong> This request exceeds skid limits for a Live Load. You may need to counter this request.</p>
                 </div>
               )}

               <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                 <div className="flex justify-between">
                   <span className="text-sm font-semibold text-slate-700">ID / PO:</span>
                   <span className="text-sm text-slate-800">{activeReplyReq.idValue}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-sm font-semibold text-slate-700">Confirmed Date:</span>
                   <span className="text-sm text-slate-800">{activeReplyReq.confirmedDate || activeReplyReq.appointmentDate}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-sm font-semibold text-slate-700">Confirmed Time:</span>
                   <span className="text-sm text-slate-800">{activeReplyReq.confirmedTimeSlot || activeReplyReq.timeSlot1}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-sm font-semibold text-slate-700">Appointment ID:</span>
                   <span className="text-sm text-slate-800">{activeReplyReq.appointmentId}</span>
                 </div>
               </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
               <button onClick={() => setReplyModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancel</button>
               <button onClick={generateReplyEmail} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm transition-colors">
                 Generate Draft & Mark Processed
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Bulk Reply All Modal */}
      {bulkReplyModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center gap-2 text-blue-700">
              <Reply className="w-5 h-5"/>
              <h3 className="font-bold text-lg">Send Bulk Confirmations</h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
               <p className="text-sm text-slate-600">You are about to generate combined confirmation drafts for <strong>{selectedPendingCount}</strong> request(s) consolidated into <strong>{new Set(selectedPendingReqs.map(r => r.carrierEmail ? r.carrierEmail.toLowerCase().trim() : `${r.vendor}_${r.carrier}`)).size}</strong> email thread(s) by carrier.</p>
               
               <div className="bg-blue-50 text-blue-800 p-3 rounded-md border border-blue-200 text-sm">
                 <strong>Note:</strong> Generating multiple drafts will trigger multiple file downloads. Please allow your browser to "Download Multiple Files" if prompted at the top of your screen.
               </div>

               <p className="text-sm text-slate-600 mt-2">The emails will be generated using the exact <strong>Confirmed Time</strong> and <strong>Appointment ID</strong> you entered for each row in the table.</p>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
               <button onClick={() => setBulkReplyModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancel</button>
               <button onClick={generateBulkReplyEmail} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm flex items-center gap-2 transition-colors">
                 <Download className="w-4 h-4"/> Generate Drafts & Mark Processed
               </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Vendor View (The Web Form) --- */}
      {viewMode === 'vendor' && formStep === 'EDIT' && (
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <form onSubmit={handleFormSubmit} className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-12">
            <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex items-center gap-3">
              <FileText className="text-[#f96302] w-6 h-6" />
              <h2 className="text-xl font-bold text-orange-900">New Load Booking Request</h2>
            </div>

            <div className="p-6 space-y-8">
              
              {/* SECTION 1: LOCATION */}
              <section>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> 1. Location Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Region <span className="text-red-500">*</span></label>
                    <div className="flex gap-4">
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.region === 'East' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                        <input type="radio" name="region" value="East" className="hidden" checked={formData.region === 'East'} onChange={handleInputChange} />
                        East
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.region === 'West' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                        <input type="radio" name="region" value="West" className="hidden" checked={formData.region === 'West'} onChange={handleInputChange} />
                        West
                      </label>
                    </div>
                    {formErrors.region && <p className="text-red-500 text-xs mt-1">{formErrors.region}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Destination <span className="text-red-500">*</span></label>
                    <select 
                      name="destination" 
                      value={formData.destination} 
                      onChange={handleInputChange}
                      disabled={!formData.region}
                      className={`w-full p-3 border rounded-lg outline-none transition-colors disabled:bg-slate-100 disabled:cursor-not-allowed ${formErrors.destination ? 'border-red-500 bg-red-50' : 'focus:border-[#f96302] focus:ring-1 focus:ring-[#f96302]'}`}
                    >
                      <option value="">-- Select Facility --</option>
                      {currentDestinationOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {formErrors.destination && <p className="text-red-500 text-xs mt-1">{formErrors.destination}</p>}
                  </div>

                  {needsApplianceSelection && (
                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <label className="block text-sm font-bold text-slate-700">Is this an appliance drop off? <span className="text-red-500">*</span></label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                          <input type="radio" name="applianceDropOff" value="Yes" checked={formData.applianceDropOff === 'Yes'} onChange={handleInputChange} className="accent-[#f96302]" /> Yes
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                          <input type="radio" name="applianceDropOff" value="No" checked={formData.applianceDropOff === 'No'} onChange={handleInputChange} className="accent-[#f96302]" /> No
                        </label>
                      </div>
                      {formErrors.applianceDropOff && <p className="text-red-500 text-xs mt-1">{formErrors.applianceDropOff}</p>}
                    </div>
                  )}
                </div>
              </section>

              <hr className="border-slate-100" />

              {/* SECTION 2: SHIPMENT & PO DETAILS */}
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" /> 2. Shipment Details
                  </h3>
                </div>

                {formData.systemTimeWarning !== 'None' && (
                  <div className="mb-4 text-xs text-amber-700 bg-amber-50 px-3 py-3 rounded-md border border-amber-200">
                    <AlertTriangle className="inline-block w-4 h-4 mr-1 -mt-0.5" />
                    <strong>System Notice:</strong> {formData.systemTimeWarning}
                  </div>
                )}

                <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700">Trailer Load Type <span className="text-red-500">*</span></label>
                    <div className="flex gap-4">
                      <label className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.loadType === 'Live Load' ? 'border-[#f96302] bg-orange-50' : 'hover:bg-slate-50'}`}>
                        <input type="radio" name="loadType" value="Live Load" className="hidden" checked={formData.loadType === 'Live Load'} onChange={handleInputChange} />
                        <span className={`font-bold ${formData.loadType === 'Live Load' ? 'text-orange-900' : 'text-slate-700'}`}>Live Load</span>
                      </label>
                      <label className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.loadType === 'Drop Load' ? 'border-[#f96302] bg-orange-50' : 'hover:bg-slate-50'}`}>
                        <input type="radio" name="loadType" value="Drop Load" className="hidden" checked={formData.loadType === 'Drop Load'} onChange={handleInputChange} />
                        <span className={`font-bold ${formData.loadType === 'Drop Load' ? 'text-orange-900' : 'text-slate-700'}`}>Drop Load</span>
                      </label>
                    </div>
                    {formErrors.loadType && <p className="text-red-500 text-xs mt-1">{formErrors.loadType}</p>}
                    
                    {formData.loadType === 'Live Load' && formData.applianceDropOff !== 'Yes' && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-amber-800 font-medium">Live Load Warning</p>
                          <p className="text-xs text-amber-700 mt-1 mb-2">Live loads must be 15 skids or less per shipment (Max {15 * formData.ids.length} total for this request). If you select more than this limit, it will automatically be converted into a drop load.</p>
                          <label className="flex items-center gap-2 text-sm text-amber-900 font-medium cursor-pointer">
                            <input type="checkbox" name="liveLoadAcknowledged" checked={formData.liveLoadAcknowledged} onChange={handleInputChange} className="accent-amber-600 w-4 h-4 rounded" />
                            I acknowledge
                          </label>
                          {formErrors.liveLoadAcknowledged && <p className="text-red-500 text-xs mt-1">{formErrors.liveLoadAcknowledged}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {formData.ids.map((idObj, index) => {
                    const currentDateError = idObj.date ? checkDateError(idObj.date, formData.region) : null;
                    const currentTimeError = idObj.timeSlot ? checkTimeSlotError(idObj.date, idObj.timeSlot, formData.region) : null;
                    
                    return (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-sm relative">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-slate-800">Shipment / PO #{index + 1}</h4>
                        {formData.ids.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeIdField(index)} 
                            className="text-red-500 hover:text-red-700 bg-white border p-1 rounded transition-colors"
                            title="Remove item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        <div className="space-y-3 md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Identification <span className="text-red-500">*</span></label>
                          {idObj.identifiers.map((ident, identIdx) => (
                            <div key={identIdx} className="flex gap-2 items-start">
                              <select 
                                value={ident.type} 
                                onChange={(e) => handleIdentifierChange(index, identIdx, 'type', e.target.value)} 
                                className="w-1/3 p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:border-[#f96302] text-sm shadow-sm"
                              >
                                <option value="Shipment ID">Shipment ID</option>
                                <option value="PO">Purchase Order</option>
                              </select>
                              <div className="flex-1 flex flex-col">
                                <div className="flex gap-2">
                                  <input 
                                    type="text" 
                                    value={ident.value} 
                                    onChange={(e) => handleIdentifierChange(index, identIdx, 'value', e.target.value)} 
                                    placeholder={ident.type === 'Shipment ID' ? '6100XXXX' : 'PO Number...'}
                                    className={`flex-1 p-2.5 border rounded-lg outline-none shadow-sm text-sm transition-colors ${formErrors[`id_${index}_ident_${identIdx}_value`] ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                                  />
                                  {identIdx > 0 && (
                                    <button 
                                      type="button" 
                                      onClick={() => removeIdentifier(index, identIdx)} 
                                      className="px-3 py-2.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                      title="Remove ID/PO"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                {formErrors[`id_${index}_ident_${identIdx}_value`] && <p className="text-red-500 text-xs mt-1">{formErrors[`id_${index}_ident_${identIdx}_value`]}</p>}
                              </div>
                            </div>
                          ))}
                          <button 
                            type="button" 
                            onClick={() => addIdentifier(index)} 
                            className="text-sm text-[#f96302] font-semibold hover:underline flex items-center gap-1 mt-1 w-max"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add another ID/PO to this shipment
                          </button>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Preferred Date <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                              <input 
                                type="date" 
                                min={formData.region ? calculateTargetDate(formData.region) : ''}
                                value={idObj.date} 
                                onChange={(e) => handleIdChange(index, 'date', e.target.value)} 
                                className={`w-full pl-9 p-2.5 border rounded-lg outline-none shadow-sm text-sm transition-colors ${(formErrors[`id_${index}_date`] || currentDateError) ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300 focus:border-[#f96302]'}`}
                              />
                            </div>
                            {currentDateError && (
                              <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-800 font-medium">{currentDateError}</p>
                              </div>
                            )}
                            {!currentDateError && formErrors[`id_${index}_date`] && <p className="text-red-500 text-xs mt-1">{formErrors[`id_${index}_date`]}</p>}
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Preferred Time Slot <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <Clock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                              <select 
                                value={idObj.timeSlot} 
                                onChange={(e) => handleIdChange(index, 'timeSlot', e.target.value)} 
                                className={`w-full pl-9 p-2.5 border rounded-lg outline-none shadow-sm text-sm bg-white transition-colors ${(formErrors[`id_${index}_timeSlot`] || currentTimeError) ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300 focus:border-[#f96302]'}`}
                              >
                                <option value="">-- Select Time --</option>
                                {ALL_TIME_SLOTS.map(s => {
                                  const isAvailable = getAvailableTimeSlots(idObj.date, formData.region).includes(s);
                                  return (
                                    <option key={s} value={s} disabled={!isAvailable}>
                                      {s} {!isAvailable ? '(Passed)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            {currentTimeError && (
                              <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-800 font-medium">{currentTimeError}</p>
                              </div>
                            )}
                            {!currentTimeError && formErrors[`id_${index}_timeSlot`] && <p className="text-red-500 text-xs mt-1">{formErrors[`id_${index}_timeSlot`]}</p>}
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">SKID Count <span className="text-red-500">*</span></label>
                            <input 
                              type="number" 
                              value={idObj.skidCount} 
                              onChange={(e) => handleIdChange(index, 'skidCount', e.target.value)} 
                              placeholder="e.g. 12"
                              className={`w-full p-2.5 border rounded-lg outline-none shadow-sm text-sm transition-colors ${formErrors[`id_${index}_skidCount`] ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                            />
                            {formErrors[`id_${index}_skidCount`] && <p className="text-red-500 text-xs mt-1">{formErrors[`id_${index}_skidCount`]}</p>}
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide flex justify-between">
                              <span>Comments</span> <span className="font-normal text-slate-400 lowercase">(Optional)</span>
                            </label>
                            <div className="relative">
                              <MessageSquare className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                              <input 
                                type="text" 
                                value={idObj.comments} 
                                onChange={(e) => handleIdChange(index, 'comments', e.target.value)} 
                                placeholder="Any specific notes..."
                                className="w-full pl-9 p-2.5 border border-slate-300 rounded-lg outline-none shadow-sm text-sm transition-colors focus:border-[#f96302]"
                              />
                            </div>
                          </div>

                        </div>
                      </div>
                    )})}
                  </div>

                <div className="mt-4 text-center">
                  <button 
                    type="button" 
                    onClick={addIdField} 
                    className="px-4 py-2 border-2 border-orange-200 text-orange-800 bg-orange-50 font-bold rounded-lg hover:bg-orange-100 transition-colors inline-flex items-center gap-2 shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Add Another Shipment / PO
                  </button>
                </div>
              </section>

              <hr className="border-slate-100" />

              {/* SECTION 3: CARRIER DETAILS */}
              <section>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <UserCircle className="w-4 h-4" /> 3. Carrier & Admin Details
                </h3>

                <div className="mb-6 space-y-2 p-4 bg-slate-50 rounded-lg border border-slate-100 shadow-sm">
                  <label className="block text-sm font-bold text-slate-700">Do you have a BOL Number for this trailer? <span className="text-red-500">*</span></label>
                  <div className="flex gap-6 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input type="radio" name="hasBol" value="Yes" checked={formData.hasBol === 'Yes'} onChange={handleInputChange} className="accent-[#f96302]" /> Yes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input type="radio" name="hasBol" value="No" checked={formData.hasBol === 'No'} onChange={handleInputChange} className="accent-[#f96302]" /> No
                    </label>
                  </div>
                  {formErrors.hasBol && <p className="text-red-500 text-xs mt-1">{formErrors.hasBol}</p>}

                  {formData.hasBol === 'Yes' && (
                    <div className="mt-2 space-y-2">
                      <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-sm w-max text-sm font-medium">
                        <UploadCloud className="w-4 h-4 text-[#f96302]" /> 
                        Upload BOL PDF(s)
                        <input type="file" accept=".pdf" multiple className="hidden" onChange={handleFileUpload} />
                      </label>
                      {formErrors.bolFiles && <p className="text-red-500 text-xs mt-2">{formErrors.bolFiles}</p>}
                      
                      {formData.bolFiles.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-3">
                          {formData.bolFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-sm max-w-md shadow-sm">
                              <span className="truncate pr-3 text-slate-700 font-medium flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400" /> {file.name}
                              </span>
                              <button type="button" onClick={() => removeBolFile(idx)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Remove File">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Vendor / Shipper Name <span className="text-red-500">*</span></label>
                    <input 
                      type="text" name="vendor" value={formData.vendor} onChange={handleInputChange} placeholder="Vendor name"
                      className={`w-full p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors.vendor ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                    />
                    {formErrors.vendor && <p className="text-red-500 text-xs mt-1">{formErrors.vendor}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Carrier Name <span className="text-red-500">*</span></label>
                    <input 
                      type="text" name="carrier" value={formData.carrier} onChange={handleInputChange} placeholder="Carrier name"
                      className={`w-full p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors.carrier ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                    />
                    {formErrors.carrier && <p className="text-red-500 text-xs mt-1">{formErrors.carrier}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Carrier Email Address <span className="text-red-500">*</span></label>
                    <input 
                      type="email" name="carrierEmail" value={formData.carrierEmail} onChange={handleInputChange} placeholder="dispatch@carrier.com"
                      className={`w-full p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors.carrierEmail ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                    />
                    {formErrors.carrierEmail && <p className="text-red-500 text-xs mt-1">{formErrors.carrierEmail}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Trailer Number <span className="text-red-500">*</span></label>
                    <input 
                      type="text" name="trailer" value={formData.trailer} onChange={handleInputChange} placeholder="Trailer #"
                      className={`w-full p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors.trailer ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                    />
                    {formErrors.trailer && <p className="text-red-500 text-xs mt-1">{formErrors.trailer}</p>}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-700 flex justify-between">
                      <span>Carrier CC Email(s)</span> <span className="font-normal text-slate-400 lowercase">(Optional)</span>
                    </label>
                    {formData.carrierCCs.map((cc, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <div className="flex-1 flex flex-col">
                          <div className="flex gap-2">
                            <input 
                              type="email" 
                              value={cc} 
                              onChange={(e) => handleCCChange(index, e.target.value)} 
                              placeholder="cc@carrier.com"
                              className={`flex-1 p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors[`carrierCC_${index}`] ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                            />
                            <button 
                              type="button" 
                              onClick={() => removeCCField(index)} 
                              className="px-4 py-3 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remove CC"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          {formErrors[`carrierCC_${index}`] && <p className="text-red-500 text-xs mt-1">{formErrors[`carrierCC_${index}`]}</p>}
                        </div>
                      </div>
                    ))}
                    <button 
                      type="button" 
                      onClick={addCCField} 
                      className="text-sm text-[#f96302] font-semibold hover:underline flex items-center gap-1 mt-1 w-max"
                    >
                      <Plus className="w-3.5 h-3.5" /> CC Another Email Address
                    </button>
                  </div>

                </div>
              </section>

            </div>

            <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
              <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-[#f96302] text-white rounded-lg font-bold hover:bg-[#e05a02] transition-colors shadow-sm text-lg">
                <Save className="w-5 h-5" /> Review & Submit
              </button>
            </div>
          </form>
        </main>
      )}

      {/* --- Vendor View (Success Screen) --- */}
      {viewMode === 'vendor' && formStep === 'SUCCESS' && (
        <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center bg-slate-50">
           <div className="bg-white px-8 py-10 rounded-2xl border border-green-100 flex flex-col items-center gap-4 text-center max-w-md w-full shadow-lg">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              
              <h3 className="font-bold text-2xl text-slate-800">Draft Generated!</h3>
              <p className="text-slate-600 mb-4">
                Your load booking data has been structured and is ready to send.
              </p>
              
              <div className="flex flex-col gap-3 mt-2 w-full">
                <button onClick={handleEmailBooking} className="px-4 py-4 bg-[#f96302] text-white rounded-xl text-sm font-bold hover:bg-[#e05a02] flex flex-col items-center justify-center gap-1 shadow-md transition-colors cursor-pointer border-none outline-none hover:-translate-y-0.5 transform">
                  <div className="flex items-center gap-2 text-lg">
                    <Mail className="w-5 h-5" /> Download Email Draft
                  </div>
                  <span className="text-xs text-orange-100 font-normal mt-1">Click the downloaded file to open in Outlook</span>
                </button>

                <button onClick={handleRestartBooking} className="mt-4 px-4 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">
                  Start New Booking
                </button>
              </div>
            </div>
        </main>
      )}

    </div>
  );
}