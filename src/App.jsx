import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Calendar, Clock, LayoutDashboard, Download, ArrowLeft, Mail, Reply, MapPin, Truck, UserCircle, Save, Plus, X, MessageSquare, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, Filter, ChevronDown, RotateCcw, HelpCircle } from 'lucide-react';

const EAST_DESTINATIONS = [
  "SFC - 7275 - Vaughan", "DFC - 7340 - Bolton", "MDO - 7364 - Montreal",
  "MDO - 7403 - Woodstock", "MDO - 7406 - Moncton", "SFC - 7410 - AVRO", "FDC - 7411 - AVRO (flatbeds only)"
];

const WEST_DESTINATIONS = [
  "SFC - 7279 - Calgary", "DFC - 7347 - Calgary", "MDO - 7348 - Surrey",
  "MDO - 7405 - Winnipeg", "MDO - 7412 - Acheson", "FDC - 7417 - Acheson"
];

const ALL_TIME_SLOTS = [
  "8:00 AM", "9:00 AM", "10:00 AM", 
  "11:00 AM", "12:00 PM", "1:00 PM", 
  "2:00 PM", "3:00 PM", "4:00 PM", 
  "5:00 PM", "6:00 PM", "7:00 PM"
];

// Helper to get available time slots for a given date in the specific region
const getAvailableTimeSlots = (dateStr, region) => {
  const allSlots = ALL_TIME_SLOTS;
  if (!dateStr || !region) return allSlots;

  // For DC to DC Transfers, we default to Eastern time for cutoff processing, 
  // or we can deduce it from destination. Safest fallback is Eastern.
  let timeZone = 'America/New_York';
  if (region === 'West') timeZone = 'America/Denver';

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

// Helper to check cutoff warnings
const checkCutoffTime = (region) => {
  let timeZone = 'America/New_York';
  if (region === 'West') timeZone = 'America/Denver';
  
  const localDateString = new Date().toLocaleString("en-US", { timeZone });
  const localDate = new Date(localDateString);
  const day = localDate.getDay(); 
  const hour = localDate.getHours();
  const isWeekend = day === 0 || day === 6;

  if ((day === 5 && hour >= 16) || isWeekend) {
    return "Notice: Requests submitted after Friday 4 PM cannot book for Monday. Earliest standard appointment will be Tuesday.";
  } else if (day === 5 && hour >= 14) {
    return "Notice: It is Friday after the 2 PM cut-off time. Standard appointments will default to Monday.";
  } else if (isWeekend || day === 1) {
    return "Notice: Weekend/Monday handling is in effect. Standard appointments will default to the next valid business day.";
  } else if (hour >= 14) {
    return "Notice: You missed the 2 PM cut-off time. Standard appointments will default to the next valid business day.";
  }
  return null;
};

// Helper to precisely calculate the Target Date based on Cutoff rules
const calculateTargetDate = (region, destination, loadType) => {
  let timeZone = 'America/New_York';
  if (region === 'West') timeZone = 'America/Denver';
  
  const localDateString = new Date().toLocaleString("en-US", { timeZone });
  const localDate = new Date(localDateString);
  const nowForCalc = new Date(localDateString);
  const currentDay = nowForCalc.getDay();
  const currentHour = nowForCalc.getHours();

  let addDays = 1; 
  if (currentHour >= 14) {
    addDays += 1;
  }
  
  localDate.setDate(localDate.getDate() + addDays);
  
  const destStr = destination || '';
  const isVaughan = destStr.includes('7275');
  const isAvroFlatbeds = destStr.includes('7411');
  const isAvro = destStr.includes('7410');
  const isBolton = destStr.includes('7340');
  const isCalgary7279 = destStr.includes('7279');
  const isCalgary7347 = destStr.includes('7347');
  
  const allowsWeekends = isVaughan || isAvroFlatbeds;
  const allowsWeekendDrops = (isAvro || isBolton || isCalgary7279 || isCalgary7347) && loadType === 'Drop Load';

  const isAfterFriday4PM = (currentDay === 5 && currentHour >= 16) || currentDay === 6 || currentDay === 0;

  while (true) {
    let targetDay = localDate.getDay();
    let targetMonth = localDate.getMonth();
    let targetDateNum = localDate.getDate();
    
    const isWeekend = targetDay === 0 || targetDay === 6;
    const isCanadaDay = targetMonth === 6 && targetDateNum === 1;

    let shouldSkip = isCanadaDay;

    if (isWeekend && !allowsWeekends && !allowsWeekendDrops) {
      shouldSkip = true;
    }

    if (isAfterFriday4PM && targetDay === 1) {
      const diffTime = localDate.getTime() - nowForCalc.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 4) {
        shouldSkip = true;
      }
    }

    if (shouldSkip) {
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

const formatTmDate = (dateStr) => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  
  if (!isNaN(str) && Number(str) > 20000) {
     const d = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
     return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str; 
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
       return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }
  return str;
};

const formatTmTime = (timeStr) => {
  if (!timeStr) return '';
  const str = String(timeStr).trim();

  if (!isNaN(str) && Number(str) >= 0 && Number(str) <= 1 && str !== '') {
     const totalSeconds = Math.round(Number(str) * 86400);
     let hours = Math.floor(totalSeconds / 3600);
     const minutes = Math.floor((totalSeconds % 3600) / 60);
     const ampm = hours >= 12 ? 'PM' : 'AM';
     hours = hours % 12 || 12;
     return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
  }
  
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
     let hours = parseInt(timeMatch[1], 10);
     const minutes = timeMatch[2];
     const ampm = hours >= 12 ? 'PM' : 'AM';
     hours = hours % 12 || 12;
     return `${hours}:${minutes} ${ampm}`;
  }

  return str;
};

const formatTo24Hour = (timeStr) => {
  if (!timeStr) return '';
  if (timeStr.toLowerCase().includes('24/7')) return timeStr;
  
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = match[3] ? match[3].toUpperCase() : null;
    
    if (ampm) {
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
    }
    
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return timeStr;
};

const checkDateError = (dateStr, region, destination, loadType) => {
  if (!dateStr) return null;
  const minAllowedDate = region ? calculateTargetDate(region, destination, loadType) : '';
  const selectedDate = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = selectedDate.getDay();
  const month = selectedDate.getMonth();
  const dateNum = selectedDate.getDate();

  const destStr = destination || '';
  const isVaughan = destStr.includes('7275');
  const isAvroFlatbeds = destStr.includes('7411');
  const isAvro = destStr.includes('7410');
  const isBolton = destStr.includes('7340');
  const isMontreal = destStr.includes('7364');
  const isWoodstock = destStr.includes('7403');
  const isMoncton = destStr.includes('7406');
  const isCalgary7279 = destStr.includes('7279');
  const isCalgary7347 = destStr.includes('7347');

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
      if (isVaughan || isAvroFlatbeds) {
          // Allow
      } else if ((isAvro || isBolton || isCalgary7279 || isCalgary7347) && loadType === 'Drop Load') {
          // Allow
      } else if (isMontreal || isWoodstock || isMoncton) {
          return 'Appointments cannot be booked on weekends for this destination.';
      } else {
          return 'Appointments cannot be booked on weekends.';
      }
  }

  let timeZone = 'America/New_York';
  if (region === 'West') timeZone = 'America/Denver';
  
  const nowForCalc = new Date(new Date().toLocaleString("en-US", { timeZone }));
  const currentDay = nowForCalc.getDay();
  const currentHour = nowForCalc.getHours();
  const isAfterFriday4PM = (currentDay === 5 && currentHour >= 16) || currentDay === 6 || currentDay === 0;

  if (dayOfWeek === 1 && isAfterFriday4PM) {
      const diffTime = selectedDate.getTime() - nowForCalc.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 4) {
          return 'Requests submitted after Friday 4 PM cannot be booked for the upcoming Monday.';
      }
  }

  if (month === 6 && dateNum === 1) return 'Appointments cannot be booked on Canada Day (July 1st).';
  
  if (minAllowedDate && dateStr < minAllowedDate) {
      return `Must meet cutoff rules. Earliest date is ${minAllowedDate}.`;
  }

  const available = getAvailableTimeSlots(dateStr, region);
  if (available.length === 0) {
     return `All available time slots for this date have passed. Please select a future date.`;
  }
  
  return null;
};

const checkTimeSlotError = (dateStr, timeSlot, region, is247DropFacility) => {
  if (is247DropFacility) return null; 
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
  origin: '',
  destination: '',
  applianceDropOff: 'N/A',
  applianceFirstMile: 'N/A',
  loadType: '',
  floorLoaded: 'No',
  boltonTrailerType: '',
  liveLoadAcknowledged: false,
  ids: [{ identifiers: [{ type: 'Shipment ID', value: '' }], date: '', timeSlot: '', skidCount: '', comments: '' }],
  
  dcTransferData: {
    seal: '', weight: '', pallets: '', cartons: '', fb: '', fb2: '', bol: '', bol2: '', tu: '', tu2: '', sapBol: '', cube: '', scac: '', tms: '', freezable: 'No', loadOrder: '', preferredDate: '', comments: ''
  },
  
  hasBol: '',
  bolFiles: [],
  hasObtr: '',
  obtrFiles: [],
  
  vendor: '',
  carrier: '',
  carrierEmail: '',
  carrierCCs: [],
  trailer: '',
  systemTimeWarning: 'None'
};

const MultiSelectDropdown = ({ filterKey, label, options, activeDropdown, setActiveDropdown, slotFilters, handleSlotFilterChange, setSlotFilters }) => {
    const isOpen = activeDropdown === filterKey;
    const selectedCount = slotFilters[filterKey]?.length || 0;
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!isOpen) setSearchTerm('');
    }, [isOpen]);

    const filteredOptions = options.filter(opt =>
        String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isAllFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(opt => slotFilters[filterKey]?.includes(opt));

    const handleSelectAllFiltered = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        setSlotFilters(prev => {
            const currentSelected = new Set(prev[filterKey] || []);
            
            if (isAllFilteredSelected) {
                filteredOptions.forEach(opt => currentSelected.delete(opt));
            } else {
                filteredOptions.forEach(opt => currentSelected.add(opt));
            }
            
            return { ...prev, [filterKey]: Array.from(currentSelected) };
        });
    };

    return (
        <div className="relative inline-block text-left mr-3 mb-3">
            <button
                type="button"
                onClick={() => setActiveDropdown(isOpen ? null : filterKey)}
                className={`inline-flex justify-between items-center w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border rounded-lg shadow-sm hover:bg-slate-50 focus:outline-none transition-colors ${selectedCount > 0 ? 'border-[#f96302] ring-1 ring-[#f96302] ring-opacity-20' : 'border-slate-300'}`}
            >
                {label} {selectedCount > 0 && <span className="ml-2 bg-[#f96302] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{selectedCount}</span>}
                <ChevronDown className="w-4 h-4 ml-2 -mr-1 text-slate-400" />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-56 mt-2 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="p-2 border-b border-slate-100 flex flex-col gap-2">
                        <input
                            type="text"
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#f96302] focus:ring-1 focus:ring-[#f96302]"
                            placeholder={`Search ${label}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()} 
                            autoFocus
                        />
                        {filteredOptions.length > 0 && (
                            <button
                                onClick={handleSelectAllFiltered}
                                className="w-full text-left px-2 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors flex items-center justify-between"
                            >
                                <span>{isAllFilteredSelected ? 'Deselect All' : 'Select All'} {searchTerm && 'Matching'}</span>
                                <input 
                                    type="checkbox" 
                                    className="w-3.5 h-3.5 accent-[#f96302] pointer-events-none" 
                                    checked={isAllFilteredSelected} 
                                    readOnly 
                                />
                            </button>
                        )}
                    </div>
                    <div className="p-2 max-h-60 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <p className="p-2 text-sm text-slate-500 italic">No options found</p>
                        ) : (
                            filteredOptions.map((option) => (
                                <label key={option} className="flex items-center p-2 rounded hover:bg-slate-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-[#f96302] bg-slate-100 border-slate-300 rounded focus:ring-[#f96302] accent-[#f96302]"
                                        checked={slotFilters[filterKey]?.includes(option) || false}
                                        onChange={() => handleSlotFilterChange(filterKey, option)}
                                    />
                                    <span className="ml-2 text-sm font-medium text-slate-700 truncate" title={option}>{option}</span>
                                </label>
                            ))
                        )}
                    </div>
                    {selectedCount > 0 && (
                        <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-md">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    setSlotFilters(prev => ({ ...prev, [filterKey]: [] }));
                                }}
                                className="w-full px-2 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function App() {
  const [viewMode, setViewMode] = useState('vendor'); 
  const [formStep, setFormStep] = useState('EDIT'); 
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});

  const [allRequests, setAllRequests] = useState([]);
  const [slotMatrix, setSlotMatrix] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [activeReplyReq, setActiveReplyReq] = useState(null);

  const [bulkReplyModalOpen, setBulkReplyModalOpen] = useState(false);

  const [filters, setFilters] = useState({
    status: '', loadType: '', vendor: '', carrier: '', idValue: '', destination: '', appointmentDate: '', skidCount: '', timeSlot1: '', comments: '', confirmedTime: '', appointmentId: ''
  });

  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'asc' });
  const [slotSortConfig, setSlotSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [slotFilters, setSlotFilters] = useState({ facilityId: [], date: [], status: [], vendorName: [], freightOrder: [], purchasingDoc: [] });

  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  const handleHeaderDoubleClick = () => setShowEasterEgg(prev => !prev);
  
  const requestSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
      setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
      if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
      return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-[#f96302]" /> : <ArrowDown className="w-3 h-3 text-[#f96302]" />;
  };

  const slotRequestSort = (key) => {
      let direction = 'asc';
      if (slotSortConfig.key === key && slotSortConfig.direction === 'asc') direction = 'desc';
      setSlotSortConfig({ key, direction });
  };

  const getSlotSortIcon = (key) => {
      if (slotSortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
      return slotSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-[#f96302]" /> : <ArrowDown className="w-3 h-3 text-[#f96302]" />;
  };

  const removeFile = (idx, fileTypeArray) => {
      setFormData(prev => ({ 
          ...prev, 
          [fileTypeArray]: prev[fileTypeArray].filter((_, i) => i !== idx) 
      }));
  };
  
  const handleTMSyncUpload = (e) => { e.target.value = null; };
  const handleSlotMatrixUpload = (e) => { e.target.value = null; };
  const handleSlotTMSyncUpload = (e) => { e.target.value = null; };

  const removeRequest = (id) => setAllRequests(prev => prev.filter(r => r.id !== id));

  const handleAdminFileUpload = async (files) => {
      let newAllReqs = [];
      for (let file of files) {
          const text = await file.text();
          const reqs = parseFileContent(text, file.name);
          if (Array.isArray(reqs)) newAllReqs = [...newAllReqs, ...reqs];
      }
      setAllRequests(prev => [...prev, ...newAllReqs]);
  };

  const getSapTmComment = (req) => {
      if (req.customSapTmComment !== undefined) return req.customSapTmComment;
      
      const vendor = (req.vendor || '').toUpperCase();
      
      if (req.region === 'DC to DC Transfer') {
          return `DC TO DC TRANSFER\nORIGIN: ${vendor}\nDEST: ${req.destination}\nTMS SHIP ID: ${req.idValue}`;
      }

      const idValues = (req.idValue || '').split(',').map(s => s.trim()).filter(Boolean);
      const firstIdValue = idValues[0] || '';

      if (req.applianceFirstMile === 'Yes') {
          const idPrefixText = (req.idType || '').toUpperCase() === 'SHIPMENT ID' ? 'sid' : 'po';
          const idStr = idValues.length > 1 ? `${idPrefixText} ${firstIdValue} &C` : `${idPrefixText} ${firstIdValue}`;
          const piecesStr = req.floorLoaded === 'Yes' ? 'FLOOR LOADED' : `${req.skidCount || 0} pcs`;
          return `${vendor} MDO APPLIANCE DELIVERY\n${idStr}\n${piecesStr}`;
      }

      const idPrefix = req.idType === 'PO' ? 'PO ' : '';
      const loadTypeIndicator = req.loadType === 'Drop Load' ? '-DROP-' : '-LIVE-';
      const boltonCategory = req.region === 'East' && (req.destination || '').includes('7340') ? `-${req.boltonTrailerType === 'Innovation Centre (IC)' ? 'IC' : req.boltonTrailerType === 'Miscellaneous' ? 'MISC' : 'VENDOR'}-` : '';
      const suffix = boltonCategory || loadTypeIndicator;
      const countLabel = (req.applianceDropOff === 'Yes' || req.applianceFirstMile === 'Yes') ? 'PIECES' : 'SKIDS';
      const skidsStr = req.floorLoaded === 'Yes' ? 'FLOOR LOADED' : `${req.skidCount || 0} ${countLabel}`;
      return `${vendor}\n${idPrefix}${firstIdValue}\n${skidsStr}${suffix}`.trim();
  };

  const processedRequests = useMemo(() => {
      let filtered = allRequests.filter(req => {
          if (filters.status && req.status !== filters.status) return false;
          if (filters.loadType && (filters.loadType === 'Live' ? req.loadType !== 'Live Load' : req.loadType !== 'Drop Load')) return false;
          if (filters.vendor && !String(req.vendor || '').toLowerCase().includes(filters.vendor.toLowerCase())) return false;
          if (filters.carrier && !String(req.carrier || '').toLowerCase().includes(filters.carrier.toLowerCase())) return false;
          if (filters.idValue && !String(req.idValue || '').toLowerCase().includes(filters.idValue.toLowerCase())) return false;
          if (filters.destination && !String(req.destination || '').toLowerCase().includes(filters.destination.toLowerCase())) return false;
          if (filters.appointmentDate && req.appointmentDate !== filters.appointmentDate) return false;
          if (filters.skidCount && !String(req.skidCount || '').toLowerCase().includes(filters.skidCount.toLowerCase())) return false;
          if (filters.timeSlot1 && !String(req.timeSlot1 || '').toLowerCase().includes(filters.timeSlot1.toLowerCase())) return false;
          if (filters.comments && !String(req.comments || '').toLowerCase().includes(filters.comments.toLowerCase())) return false;
          if (filters.appointmentId && !String(req.appointmentId || '').toLowerCase().includes(filters.appointmentId.toLowerCase())) return false;
          return true;
      });
      if (sortConfig.key) {
          filtered.sort((a, b) => {
              if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
              if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return filtered;
  }, [allRequests, filters, sortConfig]);

  const visiblePending = useMemo(() => processedRequests.filter(r => r.status === 'Requested'), [processedRequests]);
  const selectedPendingReqs = useMemo(() => allRequests.filter(r => selectedIds.has(r.id)), [allRequests, selectedIds]);
  const selectedPendingCount = selectedPendingReqs.length;
  const isAllSelected = visiblePending.length > 0 && visiblePending.every(r => selectedIds.has(r.id));

  const toggleSelection = (id) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
  };

  const handleSelectAll = () => {
      if (isAllSelected) {
          const next = new Set(selectedIds);
          visiblePending.forEach(r => next.delete(r.id));
          setSelectedIds(next);
      } else {
          const next = new Set(selectedIds);
          visiblePending.forEach(r => next.add(r.id));
          setSelectedIds(next);
      }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [tmExportError, setTmExportError] = useState(false);

  useEffect(() => {
    if (formData.region) {
      const tDate = calculateTargetDate(formData.region, formData.destination, formData.loadType);
      const warning = checkCutoffTime(formData.region);
      
      setFormData(prev => ({ 
        ...prev, 
        systemTimeWarning: warning || 'None',
        destination: '',
        ids: prev.ids.map(idObj => ({ ...idObj, date: tDate })),
        dcTransferData: { ...prev.dcTransferData, preferredDate: tDate }
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

  const handleDcChange = (field, value) => {
      setFormData(prev => ({
          ...prev,
          dcTransferData: {
              ...prev.dcTransferData,
              [field]: value
          }
      }));
      if (formErrors[`dc_${field}`]) {
          setFormErrors(prev => ({ ...prev, [`dc_${field}`]: null }));
      }
  };

  const handleDcPaste = (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;
      const pastedText = clipboardData.getData('text');

      // Determine if this looks like a full grid paste vs a single field paste
      const isGrid = pastedText.includes('\t') || pastedText.includes('\n') || 
                     (pastedText.toLowerCase().includes('carrier') && pastedText.toLowerCase().includes('trailer'));
      if (!isGrid) return; // Let default paste happen normally for single fields

      e.preventDefault();

      const keyMap = {
          'origin': ['origin'],
          'destination': ['destination'],
          'carrier': ['carrier'],
          'trailer': ['trailer #', 'trailer'],
          'seal': ['seal #', 'seal'],
          'weight': ['weight [lbs]', 'weight'],
          'pallets': ['pallets'],
          'cartons': ['cartons'],
          'fb': ['fb #', 'fb'],
          'fb2': ['fb2 #', 'fb2', 'fb2 ##'],
          'bol': ['bol #', 'bol'],
          'bol2': ['bol2 #', 'bol2'],
          'tu': ['tu #', 'tu'],
          'tu2': ['tu2 #', 'tu2'],
          'sapBol': ['sap bol #', 'sap bol'],
          'cube': ['cube ft3', 'cube'],
          'scac': ['scac'],
          'tms': ['tms ship id', 'tms ship id ', 'tms'],
          'freezable': ['freezable'],
          'loadOrder': ['load order']
      };

      // Split the pasted text by tabs or newlines, ignoring pure whitespace blocks
      const cells = pastedText.split(/[\t\n\r]+/).map(s => s.trim()).filter(Boolean);
      const extracted = {};

      for (let i = 0; i < cells.length; i++) {
          const cell = cells[i].toLowerCase();
          let matchedKey = null;
          
          for (const [stateKey, aliases] of Object.entries(keyMap)) {
              if (aliases.includes(cell)) {
                  matchedKey = stateKey;
                  break;
              }
          }
          
          if (matchedKey && i + 1 < cells.length) {
              // Ensure the next cell isn't another key (which happens when values are blank)
              const nextCellLower = cells[i + 1].toLowerCase();
              const isNextCellAKey = Object.values(keyMap).some(aliases => aliases.includes(nextCellLower));
              
              if (!isNextCellAKey) {
                  extracted[matchedKey] = cells[i + 1];
                  i++; 
              } else {
                  extracted[matchedKey] = ''; 
              }
          }
      }

      setFormData(prev => {
          const newDcData = { ...prev.dcTransferData };
          let newOrigin = prev.origin;
          let newDest = prev.destination;
          let newCarrier = prev.carrier;
          let newTrailer = prev.trailer;

          if (extracted.origin !== undefined) newOrigin = extracted.origin;
          
          if (extracted.destination !== undefined) {
              const allDests = [...EAST_DESTINATIONS, ...WEST_DESTINATIONS];
              const matchedDest = allDests.find(d => d.includes(extracted.destination));
              if (matchedDest) newDest = matchedDest;
          }

          if (extracted.carrier !== undefined) newCarrier = extracted.carrier;
          if (extracted.trailer !== undefined) newTrailer = extracted.trailer;

          if (extracted.seal !== undefined) newDcData.seal = extracted.seal;
          if (extracted.weight !== undefined) newDcData.weight = extracted.weight;
          if (extracted.pallets !== undefined) newDcData.pallets = extracted.pallets;
          if (extracted.cartons !== undefined) newDcData.cartons = extracted.cartons;
          if (extracted.fb !== undefined) newDcData.fb = extracted.fb;
          if (extracted.fb2 !== undefined) newDcData.fb2 = extracted.fb2;
          if (extracted.bol !== undefined) newDcData.bol = extracted.bol;
          if (extracted.bol2 !== undefined) newDcData.bol2 = extracted.bol2;
          if (extracted.tu !== undefined) newDcData.tu = extracted.tu;
          if (extracted.tu2 !== undefined) newDcData.tu2 = extracted.tu2;
          if (extracted.sapBol !== undefined) newDcData.sapBol = extracted.sapBol;
          if (extracted.cube !== undefined) newDcData.cube = extracted.cube;
          if (extracted.scac !== undefined) newDcData.scac = extracted.scac;
          if (extracted.tms !== undefined) newDcData.tms = extracted.tms;
          
          if (extracted.freezable !== undefined) {
              newDcData.freezable = extracted.freezable.toLowerCase().startsWith('y') ? 'Yes' : 'No';
          }
          if (extracted.loadOrder !== undefined) newDcData.loadOrder = extracted.loadOrder;

          return {
              ...prev,
              origin: newOrigin,
              destination: newDest,
              carrier: newCarrier,
              trailer: newTrailer,
              dcTransferData: newDcData
          };
      });

      // Automatically clear validation errors for the matched fields
      setFormErrors(errs => {
          const newErrs = { ...errs };
          if (extracted.origin) delete newErrs.origin;
          if (extracted.destination) delete newErrs.destination;
          if (extracted.carrier) delete newErrs.carrier;
          if (extracted.trailer) delete newErrs.trailer;
          if (extracted.weight) delete newErrs.dc_weight;
          if (extracted.tms) delete newErrs.dc_tms;
          return newErrs;
      });
  };

  const handleIdChange = (index, field, val) => {
    setFormData(prev => {
        const newIds = prev.ids.map((shipment, sIdx) => {
            if (sIdx !== index) return shipment;
            return { ...shipment, [field]: val };
        });
        return { ...prev, ids: newIds };
    });
    
    setFormErrors(prev => {
        if (!prev[`id_${index}_${field}`]) return prev;
        const newErrors = { ...prev };
        delete newErrors[`id_${index}_${field}`];
        return newErrors;
    });
  };

  const handleIdentifierChange = (shipmentIndex, identIndex, field, val) => {
    setFormData(prev => {
        const newIds = prev.ids.map((shipment, sIdx) => {
            if (sIdx !== shipmentIndex) return shipment;
            const newIdentifiers = shipment.identifiers.map((ident, iIdx) => {
                if (iIdx !== identIndex) return ident;
                return { ...ident, [field]: val };
            });
            return { ...shipment, identifiers: newIdentifiers };
        });
        return { ...prev, ids: newIds };
    });
    
    setFormErrors(prev => {
        if (!prev[`id_${shipmentIndex}_ident_${identIndex}_value`]) return prev;
        const newErrors = { ...prev };
        delete newErrors[`id_${shipmentIndex}_ident_${identIndex}_value`];
        return newErrors;
    });
  };

  const handleIdentifierPaste = (e, shipmentIndex, identIndex) => {
    e.preventDefault(); 
    
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    
    const pasteData = clipboardData.getData('text/plain') || clipboardData.getData('Text') || clipboardData.getData('text');
    if (!pasteData) return;

    const pastedItems = pasteData.split(/[\n\r,\t]+/).map(s => s.trim()).filter(Boolean);

    if (pastedItems.length === 0) return;

    setFormData(prev => {
      const newIds = prev.ids.map((shipment, sIdx) => {
        if (sIdx !== shipmentIndex) return shipment;
        
        const newIdentifiers = [...shipment.identifiers];
        const currentType = newIdentifiers[identIndex].type;
        
        newIdentifiers[identIndex] = { ...newIdentifiers[identIndex], value: pastedItems[0] };
        
        if (pastedItems.length > 1) {
            const newIdentifiersToAdd = pastedItems.slice(1).map(val => ({
              type: currentType,
              value: val
            }));
            newIdentifiers.splice(identIndex + 1, 0, ...newIdentifiersToAdd);
        }
        
        return { ...shipment, identifiers: newIdentifiers };
      });
      return { ...prev, ids: newIds };
    });

    setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`id_${shipmentIndex}_ident_${identIndex}_value`];
        return newErrors;
    });
  };

  const handleCCChange = (index, value) => {
    const newCCs = [...formData.carrierCCs];
    newCCs[index] = value;
    setFormData(prev => ({ ...prev, carrierCCs: newCCs }));
    if (formErrors[`carrierCC_${index}`]) {
      setFormErrors(prev => ({ ...prev, [`carrierCC_${index}`]: null }));
    }
  };

  const addCCField = () => setFormData(prev => ({ ...prev, carrierCCs: [...prev.carrierCCs, ''] }));
  const removeCCField = (index) => setFormData(prev => ({ ...prev, carrierCCs: prev.carrierCCs.filter((_, i) => i !== index) }));

  const addIdentifier = (shipmentIndex) => {
    setFormData(prev => {
        const newIds = prev.ids.map((shipment, sIdx) => {
            if (sIdx !== shipmentIndex) return shipment;
            return { ...shipment, identifiers: [...shipment.identifiers, { type: 'PO', value: '' }] };
        });
        return { ...prev, ids: newIds };
    });
  };

  const removeIdentifier = (shipmentIndex, identIndex) => {
    setFormData(prev => {
        const newIds = prev.ids.map((shipment, sIdx) => {
            if (sIdx !== shipmentIndex) return shipment;
            const newIdentifiers = [...shipment.identifiers];
            newIdentifiers.splice(identIndex, 1);
            return { ...shipment, identifiers: newIdentifiers };
        });
        return { ...prev, ids: newIds };
    });
  };

  const addIdField = () => {
    const defaultDate = formData.region ? calculateTargetDate(formData.region, formData.destination, formData.loadType) : '';
    setFormData(prev => ({ 
      ...prev, 
      ids: [...prev.ids, { identifiers: [{ type: 'Shipment ID', value: '' }], date: defaultDate, timeSlot: '', skidCount: '', comments: '' }]
    }));
  };

  const removeIdField = (index) => setFormData(prev => ({ ...prev, ids: prev.ids.filter((_, i) => i !== index)}));

  const handleFileUpload = (e, fieldArrayName) => {
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
        setFormErrors(prev => ({ ...prev, [fieldArrayName]: "One or more files were not PDFs and were ignored." }));
      } else {
        setFormErrors(prev => ({ ...prev, [fieldArrayName]: null }));
      }
      if (validFiles.length > 0) {
        setFormData(prev => ({ ...prev, [fieldArrayName]: [...prev[fieldArrayName], ...validFiles] }));
      }
    });
    
    e.target.value = null;
  };

  const validateForm = () => {
    let errors = {};
    if (!formData.region) errors.region = "Please select a region.";
    if (!formData.destination) errors.destination = "Please select a destination.";

    if (formData.region === 'DC to DC Transfer') {
        if (!formData.origin) errors.origin = "Origin facility is required.";
        if (!formData.carrier) errors.carrier = "Carrier Name is required in the grid.";
        if (!formData.trailer) errors.trailer = "Trailer # is required in the grid.";
        if (!formData.dcTransferData.weight) errors.dc_weight = "Weight is required.";
        if (!formData.dcTransferData.tms) errors.dc_tms = "TMS Ship ID is required.";
        if (!formData.dcTransferData.preferredDate) {
            errors.dc_preferredDate = "Preferred Date is required.";
        } else {
            const dcDateErr = checkDateError(formData.dcTransferData.preferredDate, formData.region, formData.destination, formData.loadType);
            if (dcDateErr) errors.dc_preferredDate = dcDateErr;
        }

        if (!formData.hasBol) errors.hasBol = "Please specify if you have a BOL.";
        if (formData.hasBol === 'Yes' && formData.bolFiles.length === 0) {
            errors.bolFiles = "Please upload at least one BOL PDF file.";
        }

        if (!formData.hasObtr) errors.hasObtr = "Please specify if you have an OBTR.";
        if (formData.hasObtr === 'Yes' && formData.obtrFiles.length === 0) {
            errors.obtrFiles = "Please upload the OBTR PDF template.";
        }
    } else {
        // Standard Validation
        const needsApplianceSelection = formData.destination.includes('DFC') || formData.destination.includes('MDO');
        if (needsApplianceSelection && (!formData.applianceDropOff || formData.applianceDropOff === 'N/A')) {
          errors.applianceDropOff = "Please specify if this is an appliance drop off.";
        }

        const isEastFirstMile = formData.region === 'East' && (formData.destination.includes('7340') || formData.destination.includes('7403') || formData.destination.includes('7364'));
        const isWestFirstMile = formData.region === 'West' && (formData.destination.includes('7347') || formData.destination.includes('7403') || formData.destination.includes('7364'));
        if ((isEastFirstMile || isWestFirstMile) && (!formData.applianceFirstMile || formData.applianceFirstMile === 'N/A')) {
          errors.applianceFirstMile = "Please specify if this is an Appliance First Mile drop off.";
        }

        if (!formData.loadType) errors.loadType = "Please select a load type.";
        
        const hasSkidLimit = formData.destination.includes('7275') || formData.destination.includes('7410');
        
        if (formData.loadType === 'Live Load' && hasSkidLimit && !formData.liveLoadAcknowledged && formData.applianceDropOff !== 'Yes' && formData.floorLoaded !== 'Yes') {
          errors.liveLoadAcknowledged = "You must acknowledge the skid limit for Live Loads at this facility.";
        }

        if (formData.region === 'East' && formData.destination.includes('7340')) {
          if (!formData.boltonTrailerType) {
            errors.boltonTrailerType = "Please select a Bolton load category.";
          }
        }

        const is247DropFacility = (formData.destination.includes('7275') || formData.destination.includes('7340') || formData.destination.includes('7410') || formData.destination.includes('7279') || formData.destination.includes('7347')) && 
                                  formData.loadType === 'Drop Load';

        let totalSkids = 0;

        formData.ids.forEach((idObj, index) => {
          idObj.identifiers.forEach((ident, identIdx) => {
            if (ident.type === 'Shipment ID' && !/^6100\d{6}$/.test(ident.value) && ident.value !== '99999') {
              errors[`id_${index}_ident_${identIdx}_value`] = `Shipment ID #${identIdx + 1} must be exactly 10 digits and start with '6100', or be '99999'.`;
            } else if (ident.type === 'PO' && !/^([348]\d{7}|5\d{8})$/.test(ident.value) && ident.value !== '99999') {
              errors[`id_${index}_ident_${identIdx}_value`] = `PO #${identIdx + 1} must be 8 digits (starts with 3,4,8) OR 9 digits (starts with 5), or be '99999'.`;
            } else if (!ident.value) {
              errors[`id_${index}_ident_${identIdx}_value`] = `ID/PO value is required.`;
            }
          });

          if (!idObj.date) {
            errors[`id_${index}_date`] = `Date is required for Shipment #${index + 1}.`;
          } else {
            const dateErr = checkDateError(idObj.date, formData.region, formData.destination, formData.loadType);
            if (dateErr) {
              errors[`id_${index}_date`] = dateErr;
            }
          }

          if (!is247DropFacility) {
              if (!idObj.timeSlot) {
                errors[`id_${index}_timeSlot`] = `Time slot is required for Shipment #${index + 1}.`;
              } else {
                const timeErr = checkTimeSlotError(idObj.date, idObj.timeSlot, formData.region, is247DropFacility);
                if (timeErr) {
                  errors[`id_${index}_timeSlot`] = timeErr;
                }
              }
          }
          
          if (formData.floorLoaded !== 'Yes') {
            const skidNum = parseInt(idObj.skidCount, 10);
            if (isNaN(skidNum) || skidNum <= 0 || skidNum >= 999) {
              const countLabel = (formData.applianceDropOff === 'Yes' || formData.applianceFirstMile === 'Yes') ? 'Pieces' : 'SKID';
              errors[`id_${index}_skidCount`] = `Valid ${countLabel} count required for Shipment #${index + 1}.`;
            } else {
              totalSkids += skidNum;
              if (formData.loadType === 'Live Load' && hasSkidLimit && skidNum > 15 && formData.applianceDropOff !== 'Yes') {
                errors[`id_${index}_skidCount`] = `Live loads cannot exceed 15 skids per shipment at this facility.`;
              }
            }
          }
        });

        if (formData.floorLoaded !== 'Yes') {
          const maxAllowedSkids = 15 * formData.ids.length;
          if (formData.loadType === 'Live Load' && hasSkidLimit && totalSkids > maxAllowedSkids && formData.applianceDropOff !== 'Yes') {
            errors.loadType = `If you selected more than 15 skids per shipment (total > ${maxAllowedSkids}), it will automatically be converted into a drop load. Please change to Drop Load.`;
          }
        }

        if (!formData.vendor) errors.vendor = "Vendor/Shipper name is required.";
        if (!formData.trailer) errors.trailer = "Trailer Number is required.";
        if (!formData.carrier) errors.carrier = "Carrier name is required.";
        
        if (!formData.hasBol) errors.hasBol = "Please specify if you have a BOL.";
        if (formData.hasBol === 'Yes' && formData.bolFiles.length === 0) {
          errors.bolFiles = "Please upload at least one BOL PDF file.";
        }
    }

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
    const is247DropFacility = (exportData.destination.includes('7275') || exportData.destination.includes('7340') || exportData.destination.includes('7410') || exportData.destination.includes('7279') || exportData.destination.includes('7347')) && 
                              exportData.loadType === 'Drop Load';

    const bolNames = exportData.bolFiles.map(f => f.name).join('; ');
    const obtrNames = exportData.obtrFiles?.map(f => f.name).join('; ') || 'N/A';
    
    const rows = [
      ["Field", "Value"],
      ["Appointment Needed", exportData.needsAppointment || ''],
      ["Region", exportData.region || ''],
      ["Destination", exportData.destination || ''],
    ];

    if (exportData.region === 'DC to DC Transfer') {
        rows.push(
          ["Origin", exportData.origin || ''],
          ["Carrier", exportData.carrier || ''],
          ["Trailer #", exportData.trailer || ''],
          ["Seal #", exportData.dcTransferData.seal || ''],
          ["Weight [lbs]", exportData.dcTransferData.weight || ''],
          ["Pallets", exportData.dcTransferData.pallets || ''],
          ["Cartons", exportData.dcTransferData.cartons || ''],
          ["FB #", exportData.dcTransferData.fb || ''],
          ["FB2 #", exportData.dcTransferData.fb2 || ''],
          ["BOL #", exportData.dcTransferData.bol || ''],
          ["BOL2 #", exportData.dcTransferData.bol2 || ''],
          ["TU #", exportData.dcTransferData.tu || ''],
          ["TU2 #", exportData.dcTransferData.tu2 || ''],
          ["SAP BOL #", exportData.dcTransferData.sapBol || ''],
          ["Cube Ft3", exportData.dcTransferData.cube || ''],
          ["SCAC", exportData.dcTransferData.scac || ''],
          ["TMS Ship ID", exportData.dcTransferData.tms || ''],
          ["Freezable", exportData.dcTransferData.freezable || 'No'],
          ["Load Order", exportData.dcTransferData.loadOrder || ''],
          ["Preferred Date", exportData.dcTransferData.preferredDate || ''],
          ["Comments", exportData.dcTransferData.comments || ''],
          ["Has OBTR", exportData.hasObtr || ''],
          ["OBTR File", obtrNames]
        );
    } else {
        rows.push(
          ["Appliance Drop Off", exportData.applianceDropOff || ''],
          ["Appliance First Mile", exportData.applianceFirstMile || ''],
          ["Load Type", exportData.loadType || ''],
          ["Floor Loaded", exportData.floorLoaded || 'No'],
          ["Bolton Load Category", exportData.boltonTrailerType || 'N/A'],
          ["Live Load Acknowledged", exportData.liveLoadAcknowledged ? 'Yes' : 'N/A'],
          ["Vendor/Shipper", exportData.vendor || ''],
          ["Carrier", exportData.carrier || ''],
          ["Trailer Number", exportData.trailer || '']
        );

        exportData.ids.forEach((idObj, index) => {
          const n = index + 1;
          const combinedValues = idObj.identifiers.map(i => i.value).join(', ');
          const identStrings = idObj.identifiers.map(i => `${i.type}: ${i.value}`).join(' | ');

          rows.push([`ID ${n} - Type`, idObj.identifiers[0]?.type || '']);
          rows.push([`ID ${n} - Value`, combinedValues]);
          rows.push([`ID ${n} - Identifiers Detailed`, identStrings]);
          rows.push([`ID ${n} - Date`, idObj.date || '']);
          rows.push([`ID ${n} - Time Slot`, is247DropFacility ? '24/7 Drop' : (idObj.timeSlot || '')]);
          const countLabel = (exportData.applianceDropOff === 'Yes' || exportData.applianceFirstMile === 'Yes') ? 'Pieces Count' : 'Skid Count';
          rows.push([`ID ${n} - ${countLabel}`, exportData.floorLoaded === 'Yes' ? 'Floor Loaded' : (idObj.skidCount || '')]);
          rows.push([`ID ${n} - Comments`, idObj.comments || '']);
        });
    }

    rows.push(
      ["Has BOL", exportData.hasBol || ''],
      ["BOL File", bolNames || 'N/A'],
      ["Carrier Email", exportData.carrierEmail || ''],
      ["Carrier CC", (exportData.carrierCCs || []).filter(c => c.trim()).join(', ')],
      ["System Notice (Cutoff)", exportData.systemTimeWarning !== 'None' ? exportData.systemTimeWarning : 'None']
    );

    return rows.map(e => e.map(item => `"${(item||'').toString().replace(/"/g, '""')}"`).join(",")).join("\r\n");
  };

  const handleEmailBooking = () => {
    const is247DropFacility = (formData.destination.includes('7275') || formData.destination.includes('7340') || formData.destination.includes('7410') || formData.destination.includes('7279') || formData.destination.includes('7347')) && 
                              formData.loadType === 'Drop Load';

    let firstId = '';
    let subject = '';

    if (formData.region === 'DC to DC Transfer') {
        firstId = formData.dcTransferData.tms;
        subject = `DC Transfer Request - TMS ${firstId} - ${formData.destination}`;
    } else {
        firstId = formData.ids[0]?.identifiers[0]?.value || '';
        const titleSuffix = formData.ids.length > 1 || formData.ids[0]?.identifiers.length > 1 ? ' & others' : '';
        subject = `Load Booking Request - ${firstId}${titleSuffix} - ${formData.destination}`;
    }
    
    // --- PLAIN TEXT BODY ---
    let bodyText = `Please find the load booking details below:\r\n\r\n`;
    bodyText += `Region: ${formData.region || ''}\r\n`;
    bodyText += `Destination: ${formData.destination || ''}\r\n`;

    if (formData.region === 'DC to DC Transfer') {
        bodyText += `Origin: ${formData.origin || ''}\r\n`;
        bodyText += `Carrier: ${formData.carrier || ''}\r\n`;
        bodyText += `Trailer #: ${formData.trailer || ''}\r\n`;
        bodyText += `Seal #: ${formData.dcTransferData.seal || ''}\r\n`;
        bodyText += `Weight [lbs]: ${formData.dcTransferData.weight || ''}\r\n`;
        bodyText += `Pallets: ${formData.dcTransferData.pallets || ''}\r\n`;
        bodyText += `Cartons: ${formData.dcTransferData.cartons || ''}\r\n`;
        bodyText += `FB #: ${formData.dcTransferData.fb || ''}\r\n`;
        bodyText += `FB2 #: ${formData.dcTransferData.fb2 || ''}\r\n`;
        bodyText += `BOL #: ${formData.dcTransferData.bol || ''}\r\n`;
        bodyText += `BOL2 #: ${formData.dcTransferData.bol2 || ''}\r\n`;
        bodyText += `TU #: ${formData.dcTransferData.tu || ''}\r\n`;
        bodyText += `TU2 #: ${formData.dcTransferData.tu2 || ''}\r\n`;
        bodyText += `SAP BOL #: ${formData.dcTransferData.sapBol || ''}\r\n`;
        bodyText += `Cube Ft3: ${formData.dcTransferData.cube || ''}\r\n`;
        bodyText += `SCAC: ${formData.dcTransferData.scac || ''}\r\n`;
        bodyText += `TMS Ship ID: ${formData.dcTransferData.tms || ''}\r\n`;
        bodyText += `Freezable: ${formData.dcTransferData.freezable || ''}\r\n`;
        bodyText += `Load Order: ${formData.dcTransferData.loadOrder || ''}\r\n`;
        bodyText += `Preferred Date: ${formData.dcTransferData.preferredDate || ''}\r\n`;
        if (formData.dcTransferData.comments) bodyText += `Comments: ${formData.dcTransferData.comments}\r\n`;
    } else {
        if (formData.applianceDropOff && formData.applianceDropOff !== 'N/A') bodyText += `Appliance Drop Off: ${formData.applianceDropOff}\r\n`;
        if (formData.applianceFirstMile && formData.applianceFirstMile !== 'N/A') bodyText += `Appliance First Mile: ${formData.applianceFirstMile}\r\n`;
        bodyText += `Load Type: ${formData.loadType || ''}\r\n`;
        bodyText += `Floor Loaded: ${formData.floorLoaded || 'No'}\r\n`;
        if (formData.region === 'East' && formData.destination.includes('7340')) {
            bodyText += `Bolton Category: ${formData.boltonTrailerType || ''}\r\n`;
        }
        bodyText += `Vendor/Shipper: ${formData.vendor || ''}\r\n`;
        bodyText += `Carrier: ${formData.carrier || ''}\r\n`;
        bodyText += `Trailer Number: ${formData.trailer || ''}\r\n\r\n`;

        bodyText += `--- Shipments / POs ---\r\n`;
        formData.ids.forEach((idObj, index) => {
          const identStrings = idObj.identifiers.map(i => `${i.type}: ${i.value}`).join(', ');
          const countStr = (formData.applianceDropOff === 'Yes' || formData.applianceFirstMile === 'Yes') ? 'Pieces' : 'SKIDs';
          bodyText += `\r\n[#${index + 1}] Identifiers: ${identStrings}\r\n`;
          bodyText += `Date: ${idObj.date} | Preferred Time: ${is247DropFacility ? '24/7 Drop' : idObj.timeSlot} | ${countStr}: ${formData.floorLoaded === 'Yes' ? 'Floor Loaded' : idObj.skidCount}\r\n`;
          if (idObj.comments) bodyText += `Comments: ${idObj.comments}\r\n`;
        });
        bodyText += `\r\n-----------------------\r\n`;
    }
    
    const bolNames = formData.bolFiles.map(f => f.name).join(', ');
    const obtrNames = formData.obtrFiles?.map(f => f.name).join(', ');
    
    bodyText += `Has BOL: ${formData.hasBol || ''} ${formData.bolFiles.length > 0 ? `(${bolNames})` : ''}\r\n`;
    if (formData.region === 'DC to DC Transfer') {
        bodyText += `Has OBTR: ${formData.hasObtr || ''} ${formData.obtrFiles?.length > 0 ? `(${obtrNames})` : ''}\r\n`;
    }

    const validCCs = (formData.carrierCCs || []).filter(c => c.trim()).join(', ');
    bodyText += `Carrier Email: ${formData.carrierEmail || ''}\r\n`;
    if (validCCs) bodyText += `Carrier CC: ${validCCs}\r\n`;

    // --- HTML TABLE BODY ---
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">
        <p>Please find the load booking details below:</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; border: 1px solid #b8d4f0; font-size: 13px;">
          <thead>
            <tr style="background-color: #cce0f5; text-align: left;">
              <th style="padding: 8px 12px; border: 1px solid #b8d4f0; width: 35%;">Field</th>
              <th style="padding: 8px 12px; border: 1px solid #b8d4f0; width: 65%;">Value</th>
            </tr>
          </thead>
          <tbody>
    `;

    const addRow = (label, value) => {
      htmlBody += `
        <tr style="background-color: #ffffff;">
          <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">${label}</td>
          <td style="padding: 8px 12px; border: 1px solid #b8d4f0; word-break: break-word;">${value || 'N/A'}</td>
        </tr>
      `;
    };

    addRow("Region", formData.region);
    addRow("Destination", formData.destination);

    if (formData.region === 'DC to DC Transfer') {
        addRow("Origin", formData.origin);
        addRow("Carrier", formData.carrier);
        addRow("Trailer #", formData.trailer);
        addRow("Seal #", formData.dcTransferData.seal);
        addRow("Weight [lbs]", formData.dcTransferData.weight);
        addRow("Pallets", formData.dcTransferData.pallets);
        addRow("Cartons", formData.dcTransferData.cartons);
        addRow("FB #", formData.dcTransferData.fb);
        addRow("FB2 #", formData.dcTransferData.fb2);
        addRow("BOL #", formData.dcTransferData.bol);
        addRow("BOL2 #", formData.dcTransferData.bol2);
        addRow("TU #", formData.dcTransferData.tu);
        addRow("TU2 #", formData.dcTransferData.tu2);
        addRow("SAP BOL #", formData.dcTransferData.sapBol);
        addRow("Cube Ft3", formData.dcTransferData.cube);
        addRow("SCAC", formData.dcTransferData.scac);
        addRow("TMS Ship ID", formData.dcTransferData.tms);
        addRow("Freezable", formData.dcTransferData.freezable);
        addRow("Load Order", formData.dcTransferData.loadOrder);
        addRow("Preferred Date", formData.dcTransferData.preferredDate);
        addRow("Comments", formData.dcTransferData.comments);
    } else {
        if (formData.applianceDropOff && formData.applianceDropOff !== 'N/A') addRow("Appliance Drop Off", formData.applianceDropOff);
        if (formData.applianceFirstMile && formData.applianceFirstMile !== 'N/A') addRow("Appliance First Mile", formData.applianceFirstMile);
        addRow("Load Type", formData.loadType);
        addRow("Floor Loaded", formData.floorLoaded);
        if (formData.region === 'East' && formData.destination.includes('7340')) addRow("Bolton Load Category", formData.boltonTrailerType);
        addRow("Vendor/Shipper", formData.vendor);
        addRow("Carrier", formData.carrier);
        addRow("Trailer Number", formData.trailer);

        formData.ids.forEach((idObj, i) => {
           htmlBody += `
            <tr>
              <td colspan="2" style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold; text-align: center;">--- Shipment / PO #${i + 1} ---</td>
            </tr>
           `;
           const identStrings = idObj.identifiers.map(id => `${id.type}: ${id.value}`).join(' | ');
           addRow("Identifiers Detailed", identStrings);
           addRow("Date", idObj.date);
           addRow("Time Slot", is247DropFacility ? '24/7 Drop' : idObj.timeSlot);
           const countLabel = (formData.applianceDropOff === 'Yes' || formData.applianceFirstMile === 'Yes') ? 'Pieces Count' : 'Skid Count';
           addRow(countLabel, formData.floorLoaded === 'Yes' ? 'Floor Loaded' : idObj.skidCount);
           addRow("Comments", idObj.comments);
        });
    }

    addRow("Has BOL", `${formData.hasBol} ${formData.bolFiles.length > 0 ? `(${bolNames})` : ''}`);
    if (formData.region === 'DC to DC Transfer') {
        addRow("Has OBTR", `${formData.hasObtr} ${formData.obtrFiles?.length > 0 ? `(${obtrNames})` : ''}`);
    }
    addRow("Carrier Email", formData.carrierEmail);
    if (validCCs) addRow("Carrier CC", validCCs);

    htmlBody += `
          </tbody>
        </table>
      </div>
    `;

    const csvData = getCSVContent(formData);
    const base64CSV = btoa(unescape(encodeURIComponent("\uFEFF" + csvData))); 
    const boundaryAlternative = "----=_NextPart_Alt_" + Date.now().toString(16);
    const boundaryMixed = "----=_NextPart_Mix_" + Date.now().toString(16);

    const toEmail = formData.region === 'East' ? 'TorontoAppts@homedepot.com' : 'CalgaryAppts@homedepot.com';

    const emlContent = [
      `Date: ${new Date().toUTCString()}`,
      `To: ${toEmail}`,
      ...(validCCs ? [`Cc: ${validCCs}`] : []),
      `Subject: ${subject}`,
      `X-Unsent: 1`,
      `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
      ``,
      `--${boundaryMixed}`,
      `Content-Type: multipart/alternative; boundary="${boundaryAlternative}"`,
      ``,
      `--${boundaryAlternative}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      bodyText,
      ``,
      `--${boundaryAlternative}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      htmlBody,
      ``,
      `--${boundaryAlternative}--`,
      ``,
      `--${boundaryMixed}`,
      `Content-Type: text/csv; name="booking_request_${firstId || 'export'}.csv"`,
      `Content-Disposition: attachment; filename="booking_request_${firstId || 'export'}.csv"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64CSV
    ];

    formData.bolFiles.forEach(fileObj => {
      emlContent.push(
        `--${boundaryMixed}`,
        `Content-Type: application/pdf; name="${fileObj.name}"`,
        `Content-Disposition: attachment; filename="${fileObj.name}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        fileObj.data
      );
    });

    formData.obtrFiles?.forEach(fileObj => {
      emlContent.push(
        `--${boundaryMixed}`,
        `Content-Type: application/pdf; name="${fileObj.name}"`,
        `Content-Disposition: attachment; filename="${fileObj.name}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        fileObj.data
      );
    });

    emlContent.push(`--${boundaryMixed}--`);

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

    const boltonMatch = cleanText.match(/Bolton Category:\s*(.+)$/im);
    if (boltonMatch && !extractedData["Bolton Load Category"]) {
       extractedData["Bolton Load Category"] = boltonMatch[1].trim();
    }

    const requests = [];
    let i = 1;
    
    // Check if it's a DC Transfer
    if (extractedData["Region"] === "DC to DC Transfer") {
        const req = { 
            id: fileName + Date.now().toString(), 
            sourceFile: fileName,
            originalSubject: originalSubject,
            originalMessageId: originalMessageId,
            timestamp: emailDate.toISOString(),
            displayTime: emailDate.toLocaleString(),
            status: 'Requested',
            region: extractedData["Region"],
            destination: extractedData["Destination"],
            vendor: extractedData["Origin"], // Map Origin to Vendor column for table
            carrier: extractedData["Carrier"],
            carrierEmail: extractedData["Carrier Email"],
            carrierEmailCC: extractedData["Carrier CC"],
            trailer: extractedData["Trailer #"],
            idType: 'TMS',
            idValue: extractedData["TMS Ship ID"] || extractedData["FB #"],
            appointmentDate: formatTmDate(extractedData["Preferred Date"]),
            timeSlot1: 'Drop', // DC usually drop, or n/a
            skidCount: extractedData["Weight [lbs]"] || extractedData["Pallets"],
            comments: extractedData["Comments"] || '',
            confirmedDate: formatTmDate(extractedData["Preferred Date"]) || '',
            confirmedTimeSlot: '',
            appointmentId: '',
            loadType: 'Drop Load',
            exceptionFlag: false
        };
        requests.push(req);
    } else {
        // Standard Vendor Parsing
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
            applianceFirstMile: extractedData["Appliance First Mile"],
            loadType: extractedData["Load Type"],
            floorLoaded: extractedData["Floor Loaded"] || 'No',
            boltonTrailerType: extractedData["Bolton Load Category"] || '',
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
            skidCount: extractedData[`ID ${i} - Skid Count`] || extractedData[`ID ${i} - Pieces Count`],
            comments: extractedData[`ID ${i} - Comments`],
            confirmedDate: formatTmDate(extractedData[`ID ${i} - Date`]) || '',
            confirmedTimeSlot: formatTmTime(extractedData[`ID ${i} - Time Slot`]) || '',
            appointmentId: '',
            exceptionFlag: false
          };
          
          const destStr = req.destination || '';
          const hasSkidLimit = destStr.includes('7275') || destStr.includes('7410');
          
          if (req.loadType === 'Live Load' && hasSkidLimit && parseInt(req.skidCount, 10) > 15 && req.applianceDropOff !== 'Yes' && !String(req.skidCount).toLowerCase().includes('floor')) {
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
            applianceFirstMile: extractedData["Appliance First Mile"],
            loadType: extractedData["Load Type"],
            floorLoaded: extractedData["Floor Loaded"] || 'No',
            boltonTrailerType: extractedData["Bolton Load Category"] || '',
            idType: extractedData["ID Type"],
            idValue: extractedData["ID Value"],
            hasBol: extractedData["Has BOL"],
            skidCount: extractedData["SKID Count"] || extractedData["Pieces Count"],
            vendor: extractedData["Vendor/Shipper"],
            carrier: extractedData["Carrier"],
            carrierEmail: extractedData["Carrier Email"],
            carrierEmailCC: extractedData["Carrier CC"],
            trailer: extractedData["Trailer Number"],
            comments: extractedData["Comments"] || '',
            confirmedDate: formatTmDate(extractedData["Date"]) || '',
            confirmedTimeSlot: formatTmTime(extractedData["1st Choice Time Slot"] || extractedData["Time Slot"]) || '',
            appointmentId: '',
            exceptionFlag: false
          };

          const destStr = req.destination || '';
          const hasSkidLimit = destStr.includes('7275') || destStr.includes('7410');
          
          if (req.loadType === 'Live Load' && hasSkidLimit && parseInt(req.skidCount, 10) > 15 && req.applianceDropOff !== 'Yes' && !String(req.skidCount).toLowerCase().includes('floor')) {
            req.exceptionFlag = true;
          }
          requests.push(req);
        }
    }

    return requests;
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
    const finalConfTime24 = formatTo24Hour(finalConfTime);
    const isCustom = finalConfDate !== req.appointmentDate || (finalConfTime !== req.timeSlot1);

    let bodyText = `Hello,\r\n\r\nRegarding your load booking request for ${req.destination || ''}:\r\n\r\n`;
    bodyText += `ID/PO: ${req.idValue || 'N/A'}\r\n`;
    bodyText += `Vendor: ${req.vendor || 'N/A'}\r\n`;
    bodyText += `Appointment ID: ${req.appointmentId || 'N/A'}\r\n\r\n`;

    if (isCustom) {
       bodyText += `Unfortunately, your requested preferences are not available. We have confirmed your appointment to the closest available time slot.\r\n\r\n`;
       bodyText += `Confirmed Date: ${finalConfDate}\r\n`;
       bodyText += `Confirmed Time: ${finalConfTime24}\r\n\r\n`;
    } else {
       bodyText += `Your appointment has been confirmed for the following time slot:\r\n\r\n`;
       bodyText += `Confirmed Date: ${finalConfDate}\r\n`;
       bodyText += `Confirmed Time: ${finalConfTime24}\r\n\r\n`;
    }
    bodyText += `SAP TM Comments:\r\n${getSapTmComment(req)}\r\n\r\n`;
    bodyText += `Thank you,\r\nHome Depot Appointments Team`;

    const sapTmComment = getSapTmComment(req).replace(/\n/g, '<br>');

    let htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">
        <p>Hello,</p>
        <p>Regarding your load booking request for <strong>${req.destination || ''}</strong>:</p>
        
        <table style="border-collapse: collapse; width: 100%; max-width: 800px; border: 1px solid #b8d4f0; font-size: 13px; margin-bottom: 15px;">
          <thead>
            <tr style="background-color: #cce0f5; text-align: left;">
              <th style="padding: 8px 12px; border: 1px solid #b8d4f0; width: 30%;">Field</th>
              <th style="padding: 8px 12px; border: 1px solid #b8d4f0; width: 70%;">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Status</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${isCustom ? '<span style="color: #d97706; font-weight: bold;">Confirmed to the Closest Time Available</span>' : '<span style="color: #16a34a; font-weight: bold;">Confirmed</span>'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Appointment ID</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; font-weight: bold;">${req.appointmentId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">${isCustom ? 'Confirmed' : 'Confirmed'} Date</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${finalConfDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">${isCustom ? 'Confirmed' : 'Confirmed'} Time</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${finalConfTime24}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Destination</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.destination}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Load Type</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.loadType || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Vendor</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.vendor || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Carrier</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.carrier || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Trailer Number</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.trailer || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">ID / PO</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.idValue || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Number of ${req.applianceDropOff === 'Yes' || req.applianceFirstMile === 'Yes' ? 'Pieces' : 'Skids'}</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.floorLoaded === 'Yes' ? 'Floor Loaded' : req.skidCount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #cce0f5; font-weight: bold;">Comments</td>
              <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.comments || 'N/A'}</td>
            </tr>
            <tr style="background-color: #fffde7;">
              <td style="padding: 8px 12px; border: 1px solid #fde047; color: #a16207; font-weight: bold;">SAP TM Comments (Copy)</td>
              <td style="padding: 8px 12px; border: 1px solid #fde047; font-family: monospace; font-weight: bold; font-size: 11px;">${sapTmComment}</td>
            </tr>
          </tbody>
        </table>
        
        <p>Thank you,<br>Home Depot Central Scheduling</p>
      </div>
    `;

    const boundaryAlternative = "----=_NextPart_Alt_" + Date.now().toString(16);

    const emlContent = [
      `Date: ${new Date().toUTCString()}`,
      `To: ${req.carrierEmail}`,
      ...(req.carrierEmailCC ? [`Cc: ${req.carrierEmailCC}`] : []),
      `Subject: ${subject}`,
      `X-Unsent: 1`, 
      ...(req.originalMessageId ? [
        `In-Reply-To: ${req.originalMessageId}`,
        `References: ${req.originalMessageId}`
      ] : []),
      `Content-Type: multipart/alternative; boundary="${boundaryAlternative}"`,
      ``,
      `--${boundaryAlternative}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      bodyText,
      ``,
      `--${boundaryAlternative}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      htmlBody,
      ``,
      `--${boundaryAlternative}--`
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
        ? { ...item, status: isCustom ? 'Confirmed to the Closest Time Available' : 'Scheduled' } 
        : item
    ));
  };

  const generateBulkReplyEmail = async () => {
    if (selectedPendingCount === 0) return;

    let updatedRequests = [...allRequests];

    const groupedReqs = {};
    selectedPendingReqs.forEach(req => {
      const key = req.sourceFile || req.id; 
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
       
       let htmlBody = `
         <div style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">
           <p>Hello,</p>
           <p>Regarding your load booking request(s) for <strong>${firstReq.destination}</strong>:</p>
       `;

       group.forEach((req, index) => {
         const finalConfDate = req.confirmedDate || req.appointmentDate;
         const finalConfTime = req.confirmedTimeSlot || req.timeSlot1;
         const finalConfTime24 = formatTo24Hour(finalConfTime);
         const isCustom = finalConfDate !== req.appointmentDate || (finalConfTime !== req.timeSlot1);
         if (isCustom) hasCustom = true;

         bodyText += `--- ID/PO: ${req.idValue || 'N/A'} ---\r\n`;
         bodyText += `Destination: ${req.destination || ''}\r\n`;
         bodyText += `Vendor: ${req.vendor || 'N/A'}\r\n`;
         bodyText += `Appointment ID: ${req.appointmentId || 'N/A'}\r\n`;
         
         if (isCustom) {
            bodyText += `Status: Confirmed to the Closest Time Available.\r\n`;
            bodyText += `Confirmed Date: ${finalConfDate}\r\n`;
            bodyText += `Confirmed Time: ${finalConfTime24}\r\n\r\n`;
         } else {
            bodyText += `Status: Confirmed\r\n`;
            bodyText += `Confirmed Date: ${finalConfDate}\r\n`;
            bodyText += `Confirmed Time: ${finalConfTime24}\r\n\r\n`;
         }
         
         bodyText += `SAP TM Comments:\r\n${getSapTmComment(req)}\r\n\r\n`;

         const sapTmComment = getSapTmComment(req).replace(/\n/g, '<br>');

         htmlBody += `
           <table style="border-collapse: collapse; width: 100%; max-width: 800px; border: 1px solid #b8d4f0; font-size: 13px; margin-bottom: 20px;">
             <thead>
               <tr style="background-color: #cce0f5; text-align: left;">
                 <th colspan="2" style="padding: 8px 12px; border: 1px solid #b8d4f0;">Shipment ${index + 1} - ${req.idValue || 'N/A'}</th>
               </tr>
             </thead>
             <tbody>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold; width: 30%;">Status</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; width: 70%;">${isCustom ? '<span style="color: #d97706; font-weight: bold;">Confirmed to the Closest Time Available</span>' : '<span style="color: #16a34a; font-weight: bold;">Confirmed</span>'}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">Appointment ID</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; font-weight: bold;">${req.appointmentId || 'N/A'}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">${isCustom ? 'Confirmed' : 'Confirmed'} Date</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${finalConfDate}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">${isCustom ? 'Confirmed' : 'Confirmed'} Time</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${finalConfTime24}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">Load Type</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.loadType || 'N/A'}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">Vendor</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.vendor || 'N/A'}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">Trailer Number</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.trailer || 'N/A'}</td>
               </tr>
               <tr>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0; background-color: #e6f0fa; font-weight: bold;">Number of ${req.applianceDropOff === 'Yes' || req.applianceFirstMile === 'Yes' ? 'Pieces' : 'Skids'}</td>
                 <td style="padding: 8px 12px; border: 1px solid #b8d4f0;">${req.floorLoaded === 'Yes' ? 'Floor Loaded' : req.skidCount}</td>
               </tr>
               <tr style="background-color: #fffde7;">
                 <td style="padding: 8px 12px; border: 1px solid #fde047; color: #a16207; font-weight: bold;">SAP TM Comments (Copy)</td>
                 <td style="padding: 8px 12px; border: 1px solid #fde047; font-family: monospace; font-weight: bold; font-size: 11px;">${sapTmComment}</td>
               </tr>
             </tbody>
           </table>
         `;

         updatedRequests = updatedRequests.map(item => 
           item.id === req.id 
             ? { ...item, status: isCustom ? 'Confirmed to the Closest Time Available' : 'Scheduled' } 
             : item
         );
       });

       bodyText += `Thank you,\r\nHome Depot Central Scheduling`;
       htmlBody += `<p>Thank you,<br>Home Depot Central Scheduling</p></div>`;

       const boundaryAlternative = "----=_NextPart_Alt_" + Date.now().toString(16);

       const emlContent = [
         `Date: ${new Date().toUTCString()}`,
         `To: ${carrierEmail || ''}`,
         ...(groupCCs ? [`Cc: ${groupCCs}`] : []),
         `Subject: ${subject}`,
         `X-Unsent: 1`, 
         ...(firstReq.originalMessageId ? [
           `In-Reply-To: ${firstReq.originalMessageId}`,
           `References: ${firstReq.originalMessageId}`
         ] : []),
         `Content-Type: multipart/alternative; boundary="${boundaryAlternative}"`,
         ``,
         `--${boundaryAlternative}`,
         `Content-Type: text/plain; charset="UTF-8"`,
         ``,
         bodyText,
         ``,
         `--${boundaryAlternative}`,
         `Content-Type: text/html; charset="UTF-8"`,
         ``,
         htmlBody,
         ``,
         `--${boundaryAlternative}--`
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
      case 'Confirmed to the Closest Time Available': return 'bg-orange-100 text-orange-800 border-orange-200';
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
      "Confirmed Date", "Confirmed Time", "Appt ID", "Exception", "Comments", "SAP TM Comments"
    ];

    const rows = allRequests.map(req => {
      const sapTmComment = getSapTmComment(req);

      return [
        req.id, req.sourceFile, req.timestamp, req.status, req.region, req.destination,
        req.loadType, req.vendor, req.carrier, req.carrierEmail, req.carrierEmailCC, req.trailer,
        req.idType, req.idValue, req.appointmentDate, req.skidCount, req.timeSlot1,
        req.confirmedDate, req.confirmedTimeSlot, req.appointmentId, req.exceptionFlag, req.comments, sapTmComment
      ];
    });

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

  const handleSlotFilterChange = (key, value) => {
      setSlotFilters(prev => {
          const currentValues = prev[key] || [];
          const newValues = currentValues.includes(value)
              ? currentValues.filter(v => v !== value)
              : [...currentValues, value];
          return { ...prev, [key]: newValues };
      });
  };

  const getUniqueSlotValues = (key) => {
      const allValues = slotMatrix.map(slot => String(slot[key] || '').trim()).filter(Boolean);
      return [...new Set(allValues)].sort();
  };

  const processedSlots = useMemo(() => {
      let filtered = slotMatrix.filter(slot => {
          if (slotFilters.facilityId.length > 0 && !slotFilters.facilityId.includes(String(slot['Facility ID'] || '').trim())) return false;
          if (slotFilters.date.length > 0 && !slotFilters.date.includes(String(slot.Date || slot['Start Date'] || slot.date || '').trim())) return false;
          
          if (slotFilters.status.length > 0) {
              const s = String(slot.Status || '').trim() || 'Not Booked';
              if (!slotFilters.status.includes(s)) return false;
          }

          if (slotFilters.vendorName.length > 0) {
              const vn = String(slot['Vendor Name'] || '').trim();
              if (!slotFilters.vendorName.includes(vn)) return false;
          }
          
          if (slotFilters.freightOrder.length > 0) {
              const fo = String(slot['Freight Order'] || '').trim();
              if (!slotFilters.freightOrder.includes(fo)) return false;
          }
          
          if (slotFilters.purchasingDoc.length > 0) {
              const po = String(slot['Purchasing Doc.'] || '').trim();
              if (!slotFilters.purchasingDoc.includes(po)) return false;
          }

          return true;
      });

      if (slotSortConfig.key) {
         filtered.sort((a, b) => {
            let aVal = a[slotSortConfig.key] || '';
            let bVal = b[slotSortConfig.key] || '';
            
            if (slotSortConfig.key === 'Date' || slotSortConfig.key === 'Time') {
                if (aVal < bVal) return slotSortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return slotSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (!isNaN(aVal) && !isNaN(bVal)) {
                return slotSortConfig.direction === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
            }

            return slotSortConfig.direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
         });
      }

      return filtered;
  }, [slotMatrix, slotFilters, slotSortConfig]);

  const slotHeaders = useMemo(() => {
      if (slotMatrix.length === 0) return [];
      const headers = new Set();
      slotMatrix.forEach(r => Object.keys(r).forEach(k => { if(k !== 'id') headers.add(k) }));
      const headerArr = Array.from(headers);
      if (headerArr.includes('Status')) {
          headerArr.splice(headerArr.indexOf('Status'), 1);
          headerArr.push('Status');
      }
      return headerArr;
  }, [slotMatrix]);

  let currentDestinationOptions = [];
  if (formData.region === 'East') currentDestinationOptions = EAST_DESTINATIONS;
  else if (formData.region === 'West') currentDestinationOptions = WEST_DESTINATIONS;
  else if (formData.region === 'DC to DC Transfer') currentDestinationOptions = [...EAST_DESTINATIONS, ...WEST_DESTINATIONS];

  const needsApplianceSelection = formData.destination.includes('DFC') || formData.destination.includes('MDO');

  const isEastFirstMile = formData.region === 'East' && (formData.destination.includes('7340') || formData.destination.includes('7403') || formData.destination.includes('7364'));
  const isWestFirstMile = formData.region === 'West' && (formData.destination.includes('7347') || formData.destination.includes('7403') || formData.destination.includes('7364'));
  const needsFirstMileSelection = isEastFirstMile || isWestFirstMile;

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
           {viewMode !== 'vendor' && (
             <button onClick={() => setViewMode('vendor')} className="flex items-center gap-2 bg-white text-[#f96302] hover:bg-orange-50 px-3 py-1.5 rounded-full text-xs font-bold transition-colors">
               <ArrowLeft className="w-4 h-4"/> Back to Form
             </button>
           )}
           {viewMode !== 'slots' && (
             <button onClick={() => setViewMode('slots')} className="flex items-center gap-2 bg-orange-800 bg-opacity-30 hover:bg-opacity-50 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-orange-400">
               <Calendar className="w-4 h-4"/> 7411 Appointment Slots
             </button>
           )}
           {viewMode !== 'admin' && (
             <button onClick={() => setViewMode('admin')} className="flex items-center gap-2 bg-orange-800 bg-opacity-30 hover:bg-opacity-50 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-orange-400">
               <LayoutDashboard className="w-4 h-4"/> Email Compiler
             </button>
           )}
           <button onClick={() => setShowHelpModal(true)} className="flex items-center justify-center bg-white text-[#f96302] hover:bg-orange-50 w-8 h-8 rounded-full transition-colors ml-2 shadow-sm" title="How to use this tool">
             <HelpCircle className="w-5 h-5" />
           </button>
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

           <div className="w-full mx-auto">
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
                        <th className="px-4 py-3 select-none w-10 text-center text-slate-400">#</th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('timestamp')}>
                          <div className="flex items-center gap-1">Received {getSortIcon('timestamp')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('status')}>
                          <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('loadType')}>
                          <div className="flex items-center gap-1">Load {getSortIcon('loadType')}</div>
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
                          <div className="flex items-center gap-1">Skids/Pieces {getSortIcon('skidCount')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('timeSlot1')}>
                          <div className="flex items-center gap-1">Pref Time {getSortIcon('timeSlot1')}</div>
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => requestSort('comments')}>
                          <div className="flex items-center gap-1">Comments {getSortIcon('comments')}</div>
                        </th>
                        <th className="px-4 py-3 select-none text-[#f96302]">
                          <div className="flex items-center gap-1">SAP TM Comments</div>
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
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2">
                          <select className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                            <option value="">All</option>
                            <option value="Requested">Requested</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Confirmed to the Closest Time Available">Confirmed to Closest Time</option>
                          </select>
                        </th>
                        <th className="px-2 py-2">
                          <select className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.loadType} onChange={e => setFilters({...filters, loadType: e.target.value})}>
                            <option value="">All</option>
                            <option value="Live">Live Load</option>
                            <option value="Drop">Drop Load</option>
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
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Comments..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.comments} onChange={e => setFilters({...filters, comments: e.target.value})} />
                        </th>
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2">
                          <input type="text" placeholder="Filter Appt ID..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-normal outline-none focus:border-[#f96302]" value={filters.appointmentId} onChange={e => setFilters({...filters, appointmentId: e.target.value})} />
                        </th>
                        <th className="px-2 py-2 text-center">
                           <button onClick={() => setFilters({status: '', loadType: '', vendor: '', carrier: '', idValue: '', destination: '', appointmentDate: '', skidCount: '', timeSlot1: '', comments: '', confirmedTime: '', appointmentId: ''})} className="w-full px-2 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-600 text-xs font-medium transition-colors flex justify-center items-center gap-1">
                             <X className="w-3.5 h-3.5"/> Clear
                           </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allRequests.length === 0 ? (
                        <tr>
                           <td colSpan="17" className="px-4 py-16 text-center">
                              <div className="flex flex-col items-center justify-center text-slate-400">
                                 <UploadCloud className="w-16 h-16 mb-4 text-slate-300" />
                                 <p className="text-lg font-medium text-slate-500">No requests compiled yet.</p>
                                 <p className="text-sm mt-1">Download the CSV files from your emails and select them above.</p>
                              </div>
                           </td>
                        </tr>
                      ) : processedRequests.length === 0 ? (
                        <tr>
                           <td colSpan="17" className="px-4 py-16 text-center text-slate-500 font-medium">
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
                            <td className="px-4 py-3 text-center font-bold text-slate-400 text-xs">{idx + 1}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{req.displayTime}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(req.status)}`}>
                                {req.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-xs whitespace-nowrap">
                               {req.loadType === 'Live Load' ? <span title="Live Load"><Truck className="w-4 h-4 text-blue-500 inline mr-1"/> Live</span> :
                                req.loadType === 'Drop Load' ? <span title="Drop Load"><ArrowDown className="w-4 h-4 text-purple-500 inline mr-1"/> Drop</span> :
                                <span className="text-slate-400">--</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[120px]" title={req.vendor}>{req.vendor || '--'}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[120px]" title={req.carrier}>{req.carrier || '--'}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              <div className="flex flex-col gap-1">
                                {req.idValue.split(',').map((id, idIndex) => (
                                  <span key={idIndex} className="block whitespace-nowrap">{id.trim()}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{req.destination?.split(' - ')[1] || req.destination}</td>
                            <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{req.appointmentDate}</td>
                            
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 font-medium">{req.floorLoaded === 'Yes' ? 'Floor' : req.skidCount}</span>
                                {req.exceptionFlag && (
                                  <AlertCircle className="w-4 h-4 text-red-500" title="Exception: Exceeds Skid Limit for Live Load" />
                                )}
                              </div>
                            </td>
                            
                            <td className="px-4 py-3 text-xs text-slate-600 min-w-[120px]">
                               {req.timeSlot1}
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[150px] truncate" title={req.comments}>
                               {req.comments || '--'}
                            </td>

                            <td className="px-4 py-3 min-w-[180px]">
                              <div className="relative group/copy w-full min-w-[160px] mx-auto">
                                <textarea
                                  value={getSapTmComment(req)}
                                  onChange={(e) => setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, customSapTmComment: e.target.value } : r))}
                                  className="bg-[#ffffcc] border border-yellow-300 p-2.5 rounded text-[11px] font-mono font-bold whitespace-pre-wrap text-slate-900 shadow-sm leading-tight w-full resize-y text-center focus:outline-none focus:border-[#f96302] focus:ring-1 focus:ring-[#f96302]"
                                  rows={Math.max(3, getSapTmComment(req).split('\n').length)}
                                />
                                <button 
                                  onClick={() => {
                                    const copyText = getSapTmComment(req);
                                    const textArea = document.createElement("textarea");
                                    textArea.value = copyText;
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    document.execCommand('copy');
                                    textArea.remove();
                                  }}
                                  className="absolute -top-2 -right-2 bg-slate-800 text-white p-1.5 rounded-md opacity-0 group-hover/copy:opacity-100 transition-opacity shadow-md hover:bg-slate-700 flex items-center gap-1 z-10"
                                  title="Copy to Clipboard"
                                >
                                  <FileText className="w-3 h-3" />
                                </button>
                              </div>
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
                                <div className="flex items-center justify-center gap-2">
                                  <span className="text-xs text-slate-400 italic">Processed</span>
                                  <button 
                                    onClick={() => setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Requested', confirmedDate: '', confirmedTimeSlot: '', appointmentId: '' } : r))} 
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" 
                                    title="Revert to Requested"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                </div>
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
                   <p><strong>Exception:</strong> This request exceeds skid limits for a Live Load. You may need to provide an alternate time.</p>
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
               <p className="text-sm text-slate-600">You are about to generate combined confirmation drafts for <strong>{selectedPendingCount}</strong> request(s) consolidated into <strong>{new Set(selectedPendingReqs.map(r => r.sourceFile || r.id)).size}</strong> email thread(s).</p>
               
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
                  
                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700">Region <span className="text-red-500">*</span></label>
                    <div className="flex flex-col md:flex-row gap-4">
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.region === 'East' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                        <input type="radio" name="region" value="East" className="hidden" checked={formData.region === 'East'} onChange={handleInputChange} />
                        East
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.region === 'West' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                        <input type="radio" name="region" value="West" className="hidden" checked={formData.region === 'West'} onChange={handleInputChange} />
                        West
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.region === 'DC to DC Transfer' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                        <input type="radio" name="region" value="DC to DC Transfer" className="hidden" checked={formData.region === 'DC to DC Transfer'} onChange={handleInputChange} />
                        DC to DC Transfer
                      </label>
                    </div>
                    {formErrors.region && <p className="text-red-500 text-xs mt-1">{formErrors.region}</p>}
                  </div>

                  {formData.region === 'DC to DC Transfer' && (
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-700">Origin <span className="text-red-500">*</span></label>
                      <input 
                        type="text" 
                        name="origin" 
                        value={formData.origin} 
                        onChange={handleInputChange} 
                        placeholder="e.g. 7275"
                        className={`w-full p-3 border rounded-lg outline-none transition-colors ${formErrors.origin ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                      />
                      {formErrors.origin && <p className="text-red-500 text-xs mt-1">{formErrors.origin}</p>}
                    </div>
                  )}

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

                  {formData.region !== 'DC to DC Transfer' && needsApplianceSelection && (
                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <label className="block text-sm font-bold text-slate-700">Is this an Appliance Drop off? <span className="text-red-500">*</span></label>
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

                  {formData.region !== 'DC to DC Transfer' && needsFirstMileSelection && (
                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <label className="block text-sm font-bold text-slate-700">Is this an Appliance First Mile Drop off? <span className="text-red-500">*</span></label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                          <input type="radio" name="applianceFirstMile" value="Yes" checked={formData.applianceFirstMile === 'Yes'} onChange={handleInputChange} className="accent-[#f96302]" /> Yes
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                          <input type="radio" name="applianceFirstMile" value="No" checked={formData.applianceFirstMile === 'No'} onChange={handleInputChange} className="accent-[#f96302]" /> No
                        </label>
                      </div>
                      {formErrors.applianceFirstMile && <p className="text-red-500 text-xs mt-1">{formErrors.applianceFirstMile}</p>}
                    </div>
                  )}
                </div>
              </section>

              <hr className="border-slate-100" />

              {/* SECTION 2: SHIPMENT & PO DETAILS (or DC TRANSFER DETAILS) */}
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" /> 2. {formData.region === 'DC to DC Transfer' ? 'DC to DC Transfer Details' : 'Shipment Details'}
                  </h3>
                </div>

                {formData.systemTimeWarning !== 'None' && (
                  <div className="mb-4 text-xs text-amber-700 bg-amber-50 px-3 py-3 rounded-md border border-amber-200">
                    <AlertTriangle className="inline-block w-4 h-4 mr-1 -mt-0.5" />
                    <strong>System Notice:</strong> {formData.systemTimeWarning}
                  </div>
                )}

                {formData.region === 'DC to DC Transfer' ? (
                   <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-sm relative space-y-4" onPaste={handleDcPaste}>
                     <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center gap-2 mb-2 shadow-sm">
                         <FileText className="w-4 h-4 flex-shrink-0" /> 
                         <span><strong>Quick Paste:</strong> Click anywhere inside this box and press <strong>Ctrl+V</strong> to paste the entire data table at once! It will automatically fill all fields (including Origin and Destination).</span>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Carrier <span className="text-red-500">*</span></label>
                          <input type="text" name="carrier" value={formData.carrier} onChange={handleInputChange} className={`w-full p-2.5 border rounded-lg text-sm outline-none transition-colors ${formErrors.carrier ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`} />
                          {formErrors.carrier && <p className="text-red-500 text-xs">{formErrors.carrier}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Trailer # <span className="text-red-500">*</span></label>
                          <input type="text" name="trailer" value={formData.trailer} onChange={handleInputChange} className={`w-full p-2.5 border rounded-lg text-sm outline-none transition-colors ${formErrors.trailer ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`} />
                          {formErrors.trailer && <p className="text-red-500 text-xs">{formErrors.trailer}</p>}
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Seal #</label>
                          <input type="text" value={formData.dcTransferData.seal} onChange={(e) => handleDcChange('seal', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Weight [lbs] <span className="text-red-500">*</span></label>
                          <input type="number" value={formData.dcTransferData.weight} onChange={(e) => handleDcChange('weight', e.target.value)} className={`w-full p-2.5 border rounded-lg text-sm outline-none transition-colors ${formErrors.dc_weight ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`} />
                          {formErrors.dc_weight && <p className="text-red-500 text-xs">{formErrors.dc_weight}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Pallets</label>
                          <input type="number" value={formData.dcTransferData.pallets} onChange={(e) => handleDcChange('pallets', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Cartons</label>
                          <input type="number" value={formData.dcTransferData.cartons} onChange={(e) => handleDcChange('cartons', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">FB #</label>
                          <input type="text" value={formData.dcTransferData.fb} onChange={(e) => handleDcChange('fb', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">FB2 #</label>
                          <input type="text" value={formData.dcTransferData.fb2} onChange={(e) => handleDcChange('fb2', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">BOL #</label>
                          <input type="text" value={formData.dcTransferData.bol} onChange={(e) => handleDcChange('bol', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">BOL2 #</label>
                          <input type="text" value={formData.dcTransferData.bol2} onChange={(e) => handleDcChange('bol2', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">TU #</label>
                          <input type="text" value={formData.dcTransferData.tu} onChange={(e) => handleDcChange('tu', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">TU2 #</label>
                          <input type="text" value={formData.dcTransferData.tu2} onChange={(e) => handleDcChange('tu2', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">SAP BOL #</label>
                          <input type="text" value={formData.dcTransferData.sapBol} onChange={(e) => handleDcChange('sapBol', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Cube Ft3</label>
                          <input type="text" value={formData.dcTransferData.cube} onChange={(e) => handleDcChange('cube', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">SCAC</label>
                          <input type="text" value={formData.dcTransferData.scac} onChange={(e) => handleDcChange('scac', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">TMS Ship ID <span className="text-red-500">*</span></label>
                          <input type="text" value={formData.dcTransferData.tms} onChange={(e) => handleDcChange('tms', e.target.value)} className={`w-full p-2.5 border rounded-lg text-sm outline-none transition-colors ${formErrors.dc_tms ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`} />
                          {formErrors.dc_tms && <p className="text-red-500 text-xs">{formErrors.dc_tms}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Freezable</label>
                          <select value={formData.dcTransferData.freezable} onChange={(e) => handleDcChange('freezable', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-[#f96302]">
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Load Order</label>
                          <input type="text" value={formData.dcTransferData.loadOrder} onChange={(e) => handleDcChange('loadOrder', e.target.value)} placeholder="e.g. 1-FL" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                        </div>

                        <div className="space-y-1.5">
                           <label className="block text-xs font-bold text-slate-500 uppercase">Preferred Date <span className="text-red-500">*</span></label>
                           <div className="relative">
                              <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                              <input 
                                type="date" 
                                min={formData.region ? calculateTargetDate(formData.region, formData.destination, 'Drop Load') : ''}
                                value={formData.dcTransferData.preferredDate} 
                                onChange={(e) => handleDcChange('preferredDate', e.target.value)} 
                                className={`w-full pl-9 p-2.5 border rounded-lg outline-none shadow-sm text-sm transition-colors ${formErrors.dc_preferredDate ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300 focus:border-[#f96302]'}`}
                              />
                           </div>
                           {formErrors.dc_preferredDate && <p className="text-red-500 text-xs mt-1">{formErrors.dc_preferredDate}</p>}
                        </div>
                        <div className="space-y-1.5">
                           <label className="block text-xs font-bold text-slate-500 uppercase">Comments</label>
                           <div className="relative">
                              <MessageSquare className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                              <input type="text" value={formData.dcTransferData.comments} onChange={(e) => handleDcChange('comments', e.target.value)} className="w-full pl-9 p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#f96302]" />
                           </div>
                        </div>

                     </div>
                   </div>
                ) : (
                  <>
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
                        
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <label className="block text-sm font-bold text-slate-700">Is the trailer Floor Loaded? <span className="text-red-500">*</span></label>
                          <div className="flex gap-4 mt-2">
                            <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.floorLoaded === 'Yes' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                              <input type="radio" name="floorLoaded" value="Yes" className="hidden" checked={formData.floorLoaded === 'Yes'} onChange={handleInputChange} />
                              Yes
                            </label>
                            <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.floorLoaded === 'No' ? 'border-[#f96302] bg-orange-50 text-orange-900 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                              <input type="radio" name="floorLoaded" value="No" className="hidden" checked={formData.floorLoaded === 'No'} onChange={handleInputChange} />
                              No (Palletized)
                            </label>
                          </div>
                        </div>

                        {formData.loadType === 'Live Load' && (formData.destination.includes('7275') || formData.destination.includes('7410')) && formData.applianceDropOff !== 'Yes' && formData.floorLoaded !== 'Yes' && (
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-amber-800 font-medium">Live Load Warning</p>
                              <p className="text-xs text-amber-700 mt-1 mb-2">Live loads at this facility must be 15 skids or less per shipment (Max {15 * formData.ids.length} total for this request). If you select more than this limit, it will automatically be converted into a drop load.</p>
                              <label className="flex items-center gap-2 text-sm text-amber-900 font-medium cursor-pointer">
                                <input type="checkbox" name="liveLoadAcknowledged" checked={formData.liveLoadAcknowledged} onChange={handleInputChange} className="accent-amber-600 w-4 h-4 rounded" />
                                I acknowledge
                              </label>
                              {formErrors.liveLoadAcknowledged && <p className="text-red-500 text-xs mt-1">{formErrors.liveLoadAcknowledged}</p>}
                            </div>
                          </div>
                        )}

                        {formData.region === 'East' && formData.destination.includes('7340') && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <label className="block text-sm font-bold text-slate-700">Bolton 7340 Load Category <span className="text-red-500">*</span></label>
                            <div className="flex gap-4 mt-2">
                              {['Vendor', 'Innovation Centre (IC)', 'Miscellaneous'].map(type => (
                                <label key={type} className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.boltonTrailerType === type ? 'border-[#f96302] bg-orange-50' : 'hover:bg-slate-50'}`}>
                                  <input type="radio" name="boltonTrailerType" value={type} className="hidden" checked={formData.boltonTrailerType === type} onChange={handleInputChange} />
                                  <span className={`font-bold text-center text-sm ${formData.boltonTrailerType === type ? 'text-orange-900' : 'text-slate-700'}`}>{type}</span>
                                </label>
                              ))}
                            </div>
                            {formErrors.boltonTrailerType && <p className="text-red-500 text-xs mt-1">{formErrors.boltonTrailerType}</p>}
                          </div>
                        )}

                      </div>
                    </div>

                    <div className="space-y-4">
                      {formData.ids.map((idObj, index) => {
                        const currentDateError = idObj.date ? checkDateError(idObj.date, formData.region, formData.destination, formData.loadType) : null;
                        const is247DropFacility = (formData.destination.includes('7275') || formData.destination.includes('7340') || formData.destination.includes('7410') || formData.destination.includes('7279') || formData.destination.includes('7347')) && 
                                                  formData.loadType === 'Drop Load';
                        const currentTimeError = idObj.timeSlot ? checkTimeSlotError(idObj.date, idObj.timeSlot, formData.region, is247DropFacility) : null;
                        
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
                                        onPaste={(e) => handleIdentifierPaste(e, index, identIdx)}
                                        placeholder={ident.type === 'Shipment ID' ? '6100XXXXXX' : 'PO Number...'}
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
                                    min={formData.region ? calculateTargetDate(formData.region, formData.destination, formData.loadType) : ''}
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
                                    value={is247DropFacility ? '24/7 Drop Allowed' : idObj.timeSlot} 
                                    onChange={(e) => handleIdChange(index, 'timeSlot', e.target.value)} 
                                    disabled={is247DropFacility}
                                    className={`w-full pl-9 p-2.5 border rounded-lg outline-none shadow-sm text-sm transition-colors disabled:bg-slate-100 disabled:cursor-not-allowed ${is247DropFacility ? 'border-slate-200 text-slate-600 font-bold' : (formErrors[`id_${index}_timeSlot`] || currentTimeError) ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300 focus:border-[#f96302] bg-white'}`}
                                  >
                                    {is247DropFacility ? (
                                        <option value="24/7 Drop Allowed">24/7 Drop Allowed</option>
                                    ) : (
                                        <>
                                            <option value="">-- Select Time --</option>
                                            {ALL_TIME_SLOTS.map(s => {
                                              const isAvailable = getAvailableTimeSlots(idObj.date, formData.region).includes(s);
                                              return (
                                                <option key={s} value={s} disabled={!isAvailable}>
                                                  {s} {!isAvailable ? '(Passed)' : ''}
                                                </option>
                                              );
                                            })}
                                        </>
                                    )}
                                  </select>
                                </div>
                                {is247DropFacility && (
                                    <p className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3"/> Drop Loads can be dropped anytime 24/7
                                    </p>
                                )}
                                {currentTimeError && !is247DropFacility && (
                                  <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-red-800 font-medium">{currentTimeError}</p>
                                  </div>
                                )}
                                {!currentTimeError && !is247DropFacility && formErrors[`id_${index}_timeSlot`] && <p className="text-red-500 text-xs mt-1">{formErrors[`id_${index}_timeSlot`]}</p>}
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">{(formData.applianceDropOff === 'Yes' || formData.applianceFirstMile === 'Yes') ? 'Pieces Count' : 'SKID Count'} {formData.floorLoaded !== 'Yes' && <span className="text-red-500">*</span>}</label>
                                {formData.floorLoaded === 'Yes' ? (
                                    <div className="w-full p-2.5 border border-slate-200 bg-slate-100 rounded-lg text-sm text-slate-500 font-medium cursor-not-allowed">
                                      Floor Loaded
                                    </div>
                                ) : (
                                    <input 
                                      type="number" 
                                      value={idObj.skidCount} 
                                      onChange={(e) => handleIdChange(index, 'skidCount', e.target.value)} 
                                      placeholder="e.g. 12"
                                      className={`w-full p-2.5 border rounded-lg outline-none shadow-sm text-sm transition-colors ${formErrors[`id_${index}_skidCount`] ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                                    />
                                )}
                                {formData.floorLoaded !== 'Yes' && formErrors[`id_${index}_skidCount`] && <p className="text-red-500 text-xs mt-1">{formErrors[`id_${index}_skidCount`]}</p>}
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
                  </>
                )}
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
                        <input type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'bolFiles')} />
                      </label>
                      {formErrors.bolFiles && <p className="text-red-500 text-xs mt-2">{formErrors.bolFiles}</p>}
                      
                      {formData.bolFiles.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-3">
                          {formData.bolFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-sm max-w-md shadow-sm">
                              <span className="truncate pr-3 text-slate-700 font-medium flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400" /> {file.name}
                              </span>
                              <button type="button" onClick={() => removeFile(idx, 'bolFiles')} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Remove File">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {formData.region === 'DC to DC Transfer' && (
                  <div className="mb-6 space-y-2 p-4 bg-slate-50 rounded-lg border border-slate-100 shadow-sm">
                    <label className="block text-sm font-bold text-slate-700">Do you have an OBTR for this trailer? <span className="text-red-500">*</span></label>
                    <div className="flex gap-6 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input type="radio" name="hasObtr" value="Yes" checked={formData.hasObtr === 'Yes'} onChange={handleInputChange} className="accent-[#f96302]" /> Yes
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input type="radio" name="hasObtr" value="No" checked={formData.hasObtr === 'No'} onChange={handleInputChange} className="accent-[#f96302]" /> No
                      </label>
                    </div>
                    {formErrors.hasObtr && <p className="text-red-500 text-xs mt-1">{formErrors.hasObtr}</p>}

                    {formData.hasObtr === 'Yes' && (
                      <div className="mt-2 space-y-2">
                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-sm w-max text-sm font-medium">
                          <UploadCloud className="w-4 h-4 text-[#f96302]" /> 
                          Upload OBTR PDF(s)
                          <input type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'obtrFiles')} />
                        </label>
                        {formErrors.obtrFiles && <p className="text-red-500 text-xs mt-2">{formErrors.obtrFiles}</p>}
                        
                        {formData.obtrFiles.length > 0 && (
                          <div className="flex flex-col gap-1.5 mt-3">
                            {formData.obtrFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-sm max-w-md shadow-sm">
                                <span className="truncate pr-3 text-slate-700 font-medium flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-slate-400" /> {file.name}
                                </span>
                                <button type="button" onClick={() => removeFile(idx, 'obtrFiles')} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Remove File">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {formData.region !== 'DC to DC Transfer' && (
                    <>
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
                      
                      <div className="space-y-2 md:col-span-2">
                        <label className="block text-sm font-bold text-slate-700">Trailer Number <span className="text-red-500">*</span></label>
                        <input 
                          type="text" name="trailer" value={formData.trailer} onChange={handleInputChange} placeholder="Trailer #"
                          className={`w-full md:w-1/2 p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors.trailer ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                        />
                        {formErrors.trailer && <p className="text-red-500 text-xs mt-1">{formErrors.trailer}</p>}
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Carrier Email Address <span className="text-red-500">*</span></label>
                    <input 
                      type="email" name="carrierEmail" value={formData.carrierEmail} onChange={handleInputChange} placeholder="dispatch@carrier.com"
                      className={`w-full p-3 border rounded-lg outline-none shadow-sm transition-colors ${formErrors.carrierEmail ? 'border-red-500 bg-red-50' : 'border-slate-300 focus:border-[#f96302]'}`}
                    />
                    {formErrors.carrierEmail && <p className="text-red-500 text-xs mt-1">{formErrors.carrierEmail}</p>}
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

      {/* Help / SOP Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[150] animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between text-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#f96302]"/>
                <h3 className="font-bold text-lg">Load Booking Assistant - SOP</h3>
              </div>
              <button onClick={() => setShowHelpModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded p-1 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto text-sm text-slate-700 space-y-8">
              
              {/* Module 1 */}
              <div>
                <h4 className="font-bold text-lg text-slate-800 mb-2 border-b pb-2">Module 1: Vendor Booking Form (Intake)</h4>
                <p className="mb-3"><strong>Goal:</strong> Generate standardized load booking .eml drafts.</p>
                <ul className="list-disc pl-5 space-y-1 mb-4">
                  <li><strong>Select Routing:</strong> Choose Region (East, West, DC to DC) and Destination.</li>
                  <li><strong>Input Details:</strong> Define Load Type, Floor Loaded status, and Identifiers.</li>
                  <li><strong>Attach Documents:</strong> Upload BOL and/or OBTR (must be .pdf).</li>
                  <li><strong>Submit:</strong> Click "Review & Submit" to instantly download the formatted .eml draft and CSV.</li>
                </ul>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="font-bold text-orange-800 mb-2">🔥 SMART FEATURES:</p>
                  <ul className="list-disc pl-5 space-y-2 text-orange-900">
                    <li><strong>DC-to-DC Smart Paste:</strong> If Region is "DC to DC Transfer", click inside the gray "Quick Paste" box and press Ctrl+V. Paste an entire row from Excel, and the system will automatically map headers (Origin, Destination, Carrier, Trailer, Seal, Weight, etc.) to the correct form fields.</li>
                    <li><strong>ID Auto-Split:</strong> In the Shipment/PO Identification field, paste a comma, tab, or newline-separated list of IDs. The form will automatically spawn individual rows for each ID.</li>
                    <li><strong>Intelligent Cutoffs:</strong> The "Preferred Date" calendar automatically disables invalid dates based on 2 PM/4 PM Friday cutoff rules and destination-specific weekend logic.</li>
                  </ul>
                </div>
              </div>

              {/* Module 2 */}
              <div>
                <h4 className="font-bold text-lg text-slate-800 mb-2 border-b pb-2">Module 2: Admin Email Compiler (Processing)</h4>
                <p className="mb-3"><strong>Goal:</strong> Parse incoming requests, assign appointments, and dispatch confirmations. <br/><span className="text-slate-500 italic">Access via the "Email Compiler" header button.</span></p>
                <ul className="list-disc pl-5 space-y-1 mb-4">
                  <li><strong>Import Data:</strong> Pull files directly into the UI.</li>
                  <li><strong>Reconcile:</strong> Click "Upload TM Export" to cross-reference existing systems.</li>
                  <li><strong>Process:</strong> Input the Appointment ID, Confirmed Date, and Confirmed Time for pending rows.</li>
                  <li><strong>Dispatch:</strong> Check the boxes on the left for ready rows, then click Reply Selected to batch-generate outgoing confirmation .eml files.</li>
                </ul>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="font-bold text-orange-800 mb-2">🔥 SMART FEATURES:</p>
                  <ul className="list-disc pl-5 space-y-2 text-orange-900">
                    <li><strong>Global Outlook Drag-and-Drop:</strong> Do not use a file picker. Drag .eml, .msg, or .csv files directly from Classic Outlook onto the browser window. The app parses base64 attachments and email bodies instantly.</li>
                    <li><strong>One-Click SAP Copy:</strong> Hover over the yellow "SAP TM Comments" cell and click the document icon. It instantly copies the perfectly formatted text block to your clipboard for SAP entry.</li>
                    <li><strong>Auto-Exception Flagging:</strong> Live loads exceeding 15 skids automatically trigger a red alert icon in the grid.</li>
                  </ul>
                </div>
              </div>

              {/* Module 3 */}
              <div>
                <h4 className="font-bold text-lg text-slate-800 mb-2 border-b pb-2">Module 3: 7411 Appointment Slots (Tracking)</h4>
                <p className="mb-3"><strong>Goal:</strong> Visualize and filter facility capacity. <br/><span className="text-slate-500 italic">Access via the "7411 Appointment Slots" header button.</span></p>
                <ul className="list-disc pl-5 space-y-1 mb-4">
                  <li><strong>Upload Matrix:</strong> Click "Upload File" to ingest your master capacity spreadsheet.</li>
                  <li><strong>Filter Data:</strong> Use the column headers to sort, or the top dropdowns to filter.</li>
                </ul>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="font-bold text-orange-800 mb-2">🔥 SMART FEATURES:</p>
                  <ul className="list-disc pl-5 space-y-2 text-orange-900">
                    <li><strong>Batch Dropdown Filtering:</strong> Open any dropdown (e.g., Vendor Name), type in the search bar, and click "Select All Matching". This allows rapid, complex matrix filtering without manual clicking.</li>
                  </ul>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}