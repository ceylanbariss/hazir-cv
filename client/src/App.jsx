import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Briefcase, Sparkles, Copy, RefreshCw, CheckCircle2, AlertCircle,
  Upload, FileCheck, ShieldCheck, User, Camera, Edit3, Download, Linkedin,
  Palette, Move, ZoomIn, Mail, Phone, MapPin, Globe, TrendingUp, Check,
  AlertTriangle, PlusCircle, BarChart3, Plus, Wand2, Square, Circle,
  Link as LinkIcon, Trash2, LayoutTemplate, AlignLeft, AlignCenter, Layout,
  ExternalLink, PenTool, Smile, Settings2, XCircle, Lightbulb, Highlighter,
  Bold, Italic, ChevronsUp, ChevronsDown, ScanLine, AlignRight, AlignJustify,
  Undo2, FileSearch, Cpu, PenLine, Loader2, MessageSquare, Send, X, Bot,
  Banknote, Star, Coffee, MousePointer2, Trophy, Search, Type, AlignCenterHorizontal,
  Users, Terminal, AlertOctagon, ThumbsUp, ThumbsDown
} from 'lucide-react';
import ReactGA from 'react-ga4';
import { tailorCv, interviewTurn, interviewReport as fetchInterviewReport, addItem as addItemApi, integrateGaps as integrateGapsApi, ocrJobPosting, warmUp } from './lib/api.js';
import { claimRequirement, unclaimRequirement, interviewFocus } from './lib/analysis.js';
import { RequirementBreakdown, VerificationPanel, PipelineTrace } from './components/AnalysisInsights.jsx';

const STAGE_PROGRESS = {
  analyze_inputs: { start: 4, done: 28 },
  match_evidence: { start: 30, done: 52 },
  tailor: { start: 54, done: 84 },
  verify: { start: 86, done: 97 },
};
const STAGE_TEXT = {
  tr: {
    analyze_inputs: '🔍 İlan ve CV analiz ediliyor...',
    match_evidence: '🧩 Gereksinimler CV\'deki kanıtlarla eşleştiriliyor...',
    tailor: '✍️ CV ilana göre yeniden yazılıyor...',
    verify: '🛡️ Yazılanlar orijinal CV\'ye karşı doğrulanıyor...',
  },
  en: {
    analyze_inputs: '🔍 Analyzing the posting and your CV...',
    match_evidence: '🧩 Matching requirements to evidence in your CV...',
    tailor: '✍️ Rewriting your CV for this job...',
    verify: '🛡️ Fact-checking the rewrite against your CV...',
  },
};

const STOP_WORDS = [
  've', 'ile', 'için', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'mu', 'mü', 'ama', 'fakat', 
  'veya', 'ya', 'hem', 'eğer', 'ise', 'yani', 'dolayı', 'ötürü', 'rağmen', 'gibi', 'kadar', 'böyle', 
  'şöyle', 'öyle', 'hiç', 'hep', 'her', 'tüm', 'bütün', 'bazı', 'birkaç', 'şey', 'çok', 'daha', 'en', 
  'kendi', 'kendine', 'olarak', 'olan', 'ilgili', 'buna', 'bunu', 'bunun', 'onu', 'onun', 'benim', 
  'bizim', 'hakkında', 'üzerine', 'tarafından', 'sayesinde', 'and', 'or', 'the', 'a', 'an', 'in', 'on', 
  'at', 'to', 'for', 'with', 'by', 'of', 'öğrencisi', 'mezunu', 'adayı', 'olarak', 'hakkında'
];

const GENERIC_BUSINESS_WORDS = [
  'proje', 'süreç', 'analiz', 'ekip', 'takım', 'yönetim', 'geliştirme', 'tasarım', 'deneyim', 
  'çalışma', 'iş', 'görev', 'sorumluluk', 'faaliyet', 'uygulama', 'kullanım', 'beceri', 'yetkinlik',
  'bilgi', 'seviye', 'kurumsal', 'departman', 'şirket', 'firma', 'müşteri', 'hizmet', 'ürün',
  'strateji', 'planlama', 'raporlama', 'iletişim', 'sunum', 'destek', 'çözüm', 'sonuç', 'hedef',
  'project', 'process', 'analysis', 'team', 'management', 'development', 'design', 'experience',
  'work', 'business', 'skill', 'knowledge', 'level', 'corporate', 'company', 'client', 'service',
  'product', 'strategy', 'planning', 'reporting', 'communication', 'presentation', 'support', 'solution'
];

const ADJECTIVES_TO_PAIR = [
  'güçlü', 'etkili', 'aktif', 'ileri', 'temel', 'yüksek', 'geniş', 'derin', 'analitik', 'stratejik',
  'yaratıcı', 'teknik', 'kurumsal', 'profesyonel', 'üst', 'başarılı', 'yoğun', 'kapsamlı',
  'strong', 'effective', 'active', 'advanced', 'basic', 'high', 'wide', 'deep', 'analytical', 'strategic',
  'creative', 'technical', 'corporate', 'professional', 'top', 'successful', 'intense', 'comprehensive'
];

const ConfettiParticle = ({ style }) => (
  <div 
    className="absolute w-2 h-2 rounded-sm animate-[confetti-fall_3s_ease-out_forwards]" 
    style={style} 
  />
);

const formatUrl = (url) => {
  if (!url) return "#";
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('http')) return cleanUrl;
  return `https://${cleanUrl}`;
};

const formatLinkedinUrl = (url) => {
  if (!url) return "#";
  let cleanUrl = url.trim();
  if (!cleanUrl.includes('.') && !cleanUrl.includes('/') && !cleanUrl.includes(':')) return `https://linkedin.com/in/${cleanUrl}`;
  if (cleanUrl.startsWith('http')) return cleanUrl;
  return `https://${cleanUrl}`;
};

const App = () => {
  const [originalCV, setOriginalCV] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [optimizedData, setOptimizedData] = useState(null);
  const [profileImage, setProfileImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
   
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [gameScore, setGameScore] = useState(0);
  const [gameTargets, setGameTargets] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiParticles, setConfettiParticles] = useState([]);

  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isKvkkModalOpen, setIsKvkkModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [themeColor, setThemeColor] = useState('#000000'); 
  const [cvLanguage, setCvLanguage] = useState('tr'); 
  const [activeTemplate, setActiveTemplate] = useState('modern');
  const [narrativeVoice, setNarrativeVoice] = useState('first');
  const [showIcons, setShowIcons] = useState(true); 
  const [showHighlights, setShowHighlights] = useState(false); 
  const [textAlign, setTextAlign] = useState('text-left');

  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [ignoredKeywords, setIgnoredKeywords] = useState(new Set());

  const [customHeadings, setCustomHeadings] = useState({});
  const processedWords = new Set(); 

  const [sectionsOrder, setSectionsOrder] = useState(['summary', 'experience', 'education', 'skills', 'additional']);
  const [lastDeletedSection, setLastDeletedSection] = useState(null);

  const [previewScale, setPreviewScale] = useState(1);
  const [resumeHeight, setResumeHeight] = useState(1123); // Dinamik Yükseklik Takibi

  const previewContainerRef = useRef(null);
  const mobilePreviewRef = useRef(null);

  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewMessages, setInterviewMessages] = useState([]);
  const [userInterviewInput, setUserInterviewInput] = useState('');
  const [interviewType, setInterviewType] = useState(null); 
  const [questionCount, setQuestionCount] = useState(0); 
  const [isInterviewFinished, setIsInterviewFinished] = useState(false); 
  
  const [interviewReport, setInterviewReport] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const interviewScrollRef = useRef(null);

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const subDragItem = useRef(null);
  const subDragOverItem = useRef(null);

  const [photoShape, setPhotoShape] = useState('rounded-lg');
  const [addItemSection, setAddItemSection] = useState('experience');
  const [addItemInput, setAddItemInput] = useState('');
  const [addItemTitle, setAddItemTitle] = useState('');
   
  const [isAddingItem, setIsAddingItem] = useState(false);
  // YENİ: Toplu CV Yedirme State'leri
  const [selectedGaps, setSelectedGaps] = useState([]);
  const [isIntegratingGaps, setIsIntegratingGaps] = useState(false);
  const [gapConfirmOpen, setGapConfirmOpen] = useState(false);
  const [gapNotes, setGapNotes] = useState('');
  const [gapConfirmed, setGapConfirmed] = useState(false);
  const [gapNotice, setGapNotice] = useState(null);
  const [revertedClaims, setRevertedClaims] = useState([]);
  const [interviewMax, setInterviewMax] = useState(8);
  const [interviewEndReason, setInterviewEndReason] = useState('none');
  const stageCeilingRef = useRef(4);

  const toggleGapSelection = (gap) => {
      setSelectedGaps(prev => 
          prev.includes(gap) ? prev.filter(g => g !== gap) : [...prev, gap]
      );
  };
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPos, setPhotoPos] = useState({ x: 0, y: 0 });
  // YENİ: Çerçeve konumu ve boyutu için stateler
  const [framePos, setFramePos] = useState({ x: 0, y: 0 });
  const [isDraggingFrame, setIsDraggingFrame] = useState(false);
  const [frameDragStart, setFrameDragStart] = useState({ x: 0, y: 0 });

  const [frameSize, setFrameSize] = useState(128); // 128px varsayılan boyut (lg:w-32'ye denk)
  const [isResizingFrame, setIsResizingFrame] = useState(false);
  const [resizeStart, setResizeStart] = useState({ size: 128, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  // YENİ: İş İlanı Fotoğraf Okuma (OCR) Stateleri
  const jobImageInputRef = useRef(null);
  const [isExtractingJob, setIsExtractingJob] = useState(false);
  const resumeRef = useRef(null);
  const linkedinRef = useRef(null);
  const emailRef = useRef(null);

  // --- YENİ: ÇERÇEVEYİ SÜRÜKLEME VE BOYUTLANDIRMA MANTIĞI ---
  useEffect(() => {
    // Mouse ekranda hareket ettikçe çalışır
    const handleGlobalMouseMove = (e) => {
      // Eğer sağ üstteki mavi butona basılı tutuluyorsa:
      if (isDraggingFrame) {
        setFramePos({
          x: e.clientX - frameDragStart.x,
          y: e.clientY - frameDragStart.y
        });
      } 
      // Eğer sağ alttaki boyutlandırma butonuna basılı tutuluyorsa:
      else if (isResizingFrame) {
        const deltaX = e.clientX - resizeStart.x;
        // Çerçevenin çok küçülmesini (64px) veya sayfa dışına taşmasını (350px) engelliyoruz
        setFrameSize(Math.max(64, Math.min(350, resizeStart.size + deltaX)));
      }
    };

    // Mouse'un tıklaması bırakıldığında çalışır
    const handleGlobalMouseUp = () => {
      if (isDraggingFrame) setIsDraggingFrame(false);
      if (isResizingFrame) setIsResizingFrame(false);
    };

    // Sadece sürükleme işlemi varken sistemi yorar, durduğunda dinlemeyi bırakır
    if (isDraggingFrame || isResizingFrame) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingFrame, isResizingFrame, frameDragStart, resizeStart]);

  // GOOGLE ANALYTICS BAŞLATMA
  useEffect(() => {
    ReactGA.initialize("G-QKFMGDH7GJ"); 
    ReactGA.send("pageview"); 
    warmUp(); // Free-tier API sleeps when idle; wake it while the user fills the form.
  }, []);

  // YENİ: DİNAMİK CV YÜKSEKLİĞİNİ TAKİP ETME (Taşmaları önler)
  useEffect(() => {
    if (!resumeRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setResumeHeight(Math.max(1123, entry.target.scrollHeight));
      }
    });
    observer.observe(resumeRef.current);
    return () => observer.disconnect();
  }, [optimizedData, activeTemplate, sectionsOrder]);

  useEffect(() => {
    const handleResize = () => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.offsetWidth;
        const targetWidth = 794; 
        const padding = window.innerWidth < 1024 ? 20 : 40;
        
        const newScale = containerWidth < (targetWidth + padding) 
          ? (containerWidth - padding) / targetWidth 
          : 1;
        
        setPreviewScale(Math.max(0.25, Math.min(1, newScale)));
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 
    
    const timer = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [optimizedData, toolbarVisible]);

  useEffect(() => {
    let gameInterval;
    if (isLoading && !showConfetti) {
        gameInterval = setInterval(() => {
            const id = Date.now();
            const types = ['briefcase', 'star', 'money', 'coffee'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            
            const zone = Math.floor(Math.random() * 4);
            let x, y;

            switch(zone) {
                case 0: x = Math.random() * 80 + 10; y = Math.random() * 20 + 5; break;
                case 1: x = Math.random() * 20 + 75; y = Math.random() * 60 + 20; break;
                case 2: x = Math.random() * 80 + 10; y = Math.random() * 20 + 75; break;
                case 3: x = Math.random() * 20 + 5; y = Math.random() * 60 + 20; break;
                default: x=10; y=10;
            }

            const newTarget = { id, x, y, type: randomType };
            setGameTargets(prev => [...prev, newTarget]);

            setTimeout(() => {
                setGameTargets(prev => prev.filter(t => t.id !== id));
            }, 2500);

        }, 1000);
    } else {
        setGameTargets([]);
    }
    return () => clearInterval(gameInterval);
  }, [isLoading, showConfetti]);

  const handleGameClick = (id) => {
      setGameScore(prev => prev + 100);
      setGameTargets(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
      if (showConfetti) {
          const particles = Array.from({ length: 100 }).map((_, i) => ({
              id: i,
              style: {
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * -20}%`,
                  backgroundColor: ['#1e293b', '#64748b', '#cbd5e1', '#ffffff'][Math.floor(Math.random() * 4)],
                  animationDuration: `${Math.random() * 2 + 1.5}s`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  transform: `rotate(${Math.random() * 360}deg)`
              }
          }));
          setConfettiParticles(particles);
          const timer = setTimeout(() => { setConfettiParticles([]); setShowConfetti(false); }, 3500);
          return () => clearTimeout(timer);
      }
  }, [showConfetti]);

  useEffect(() => {
    if (interviewScrollRef.current) {
        interviewScrollRef.current.scrollTop = interviewScrollRef.current.scrollHeight;
    }
  }, [interviewMessages, interviewOpen, interviewLoading, isGeneratingReport, interviewReport]);

  useEffect(() => {
    if (isInterviewFinished && !interviewReport && !isGeneratingReport && interviewMessages.length > 0) {
        generateInterviewReport();
    }
  }, [isInterviewFinished]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setToolbarVisible(false);
        return;
      }
      const text = selection.toString().trim();
      if (text) setSelectedText(text);
      const range = selection.getRangeAt(0);
      const editorElement = document.getElementById('resume-preview');
      if (editorElement && editorElement.contains(range.commonAncestorContainer)) {
         const rect = range.getBoundingClientRect();
         setToolbarVisible(true);
         setToolbarPosition({ top: rect.top - 40, left: rect.left + (rect.width / 2) - 30 });
      } else {
         setToolbarVisible(false);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const toggleBold = (e) => {
    e.preventDefault();
    document.execCommand('bold', false, null);
    if (selectedText) {
        const lowerText = selectedText.toLowerCase();
        setIgnoredKeywords(prev => {
            const newSet = new Set(prev);
            if (newSet.has(lowerText)) newSet.delete(lowerText);
            else newSet.add(lowerText);
            return newSet;
        });
    }
  };

  const applyFormat = (command) => {
    document.execCommand(command, false, null);
  };

  const translations = {
    tr: {
      summary: "Kişisel Özet",
      experience: "İş Deneyimi",
      education: "Eğitim",
      skills: "Teknik Yetenekler",
      additional: "Ek Bilgiler",
      location: "Lokasyon",
      phone: "Telefon",
      email: "E-posta",
      profil: "linkedin.com/in/profil-linki",
      analysisTitle: "ATS Uyumluluk ve Analiz Raporu",
      scoreOverall: "Genel Uyumluluk",
      scoreSkills: "Yetenek Uyumu",
      scoreExperience: "Deneyim Uyumu",
      scoreEducation: "Eğitim Uyumu",
      matchesHard: "Teknik Yetkinlikler (Hard Skills)",
      matchesSoft: "Sosyal Yetkinlikler (Soft Skills)",
      gaps: "Eksikler & Gelişim Alanları",
      added: "İlana Göre Eklenen Stratejik Kelimeler",
      quickAddBtn: "+ CV'ye Yedir",
      addItemTitle: "Eksik Bilgi / Yeni Madde Ekle",
      addItemDesc: "Eklemek istediğiniz bilgiyi basitçe yazın, yapay zeka profesyonelce CV'nize yerleştirsin.",
      addBtn: "AI ile Profesyonelleştir ve Ekle"
    },
    en: {
      summary: "Professional Summary",
      experience: "Work Experience",
      education: "Education",
      skills: "Technical Skills",
      additional: "Additional Information",
      location: "Location",
      phone: "Phone",
      email: "Email",
      profil: "linkedin.com/in/profile-link",
      analysisTitle: "ATS Analysis & Compatibility Report",
      scoreOverall: "Overall ATS Match",
      scoreSkills: "Skills Match",
      scoreExperience: "Experience Match",
      scoreEducation: "Education Match",
      matchesHard: "Hard Skills",
      matchesSoft: "Soft Skills",
      gaps: "Gaps & Recommendations",
      added: "Strategically Added Keywords",
      quickAddBtn: "+ Add to CV",
      addItemTitle: "Add Missing Info / New Item",
      addItemDesc: "Simply write what you want to add, AI will professionally place it in your CV.",
      addBtn: "Professionalize & Add with AI"
    }
  };

  const baseSectionOptions = [
    { id: 'summary', labelTr: 'Kişisel Özet', labelEn: 'Professional Summary' },
    { id: 'experience', labelTr: 'İş Deneyimi', labelEn: 'Work Experience' },
    { id: 'education', labelTr: 'Eğitim', labelEn: 'Education' },
    { id: 'skills', labelTr: 'Teknik Yetenekler', labelEn: 'Technical Skills' },
    { id: 'additional', labelTr: 'Ek Bilgiler', labelEn: 'Additional Info' },
    { id: 'contactLink', labelTr: '🔗 Sosyal Medya / Özel Link', labelEn: '🔗 Social / Custom Link' },
  ];

  // YENİ: Eklenen özel bölümleri anında listeye dahil eden dinamik liste
  const dynamicSectionOptions = [
    ...baseSectionOptions,
    ...(optimizedData ? Object.keys(optimizedData)
        .filter(key => key.startsWith('custom_'))
        .map(key => ({
            id: key,
            labelTr: `📁 Mevcut: ${customHeadings[key] || 'Özel Bölüm'}`,
            labelEn: `📁 Existing: ${customHeadings[key] || 'Custom Section'}`
        })) : []),
    { id: 'custom', labelTr: '✨ Yeni Özel Bölüm Oluştur', labelEn: '✨ Create New Custom Section' }
  ];

  const templateOptions = [
    { id: 'modern', name: 'Modern', icon: <Layout className="w-5 h-5" />, desc: 'Dengeli' },
    { id: 'classic', name: 'Klasik', icon: <AlignCenter className="w-5 h-5" />, desc: 'Ortalı & Serif' },
    { id: 'professional', name: 'Profesyonel', icon: <AlignLeft className="w-5 h-5" />, desc: 'Sol Başlıklı' },
    { id: 'elegant', name: 'Zarif', icon: <AlignCenterHorizontal className="w-5 h-5" />, desc: 'Ortalı & Çizgili' },
    { id: 'bold', name: 'Güçlü', icon: <Type className="w-5 h-5" />, desc: 'Kalın Başlıklı' },
  ];

  const shapeOptions = [
    { id: 'rounded-none', label: 'Kare', iconClass: 'rounded-none' },
    { id: 'rounded-lg', label: 'Oval Köşe', iconClass: 'rounded-md' },
    { id: 'rounded-full', label: 'Yuvarlak', iconClass: 'rounded-full' },
  ];

  const alignmentOptions = [
    { id: 'text-left', label: 'Sola Dayalı', icon: <AlignLeft className="w-4 h-4" /> },
    { id: 'text-center', label: 'Ortalı', icon: <AlignCenter className="w-4 h-4" /> },
    { id: 'text-right', label: 'Sağa Dayalı', icon: <AlignRight className="w-4 h-4" /> },
    { id: 'text-justify', label: 'İki Yana Yasla', icon: <AlignJustify className="w-4 h-4" /> },
  ];

  const colorPresets = [
    { name: 'Arctic', hex: '#D3D1CE' },
    { name: 'Slopes', hex: '#B3B7BA' },
    { name: 'Apres Ski', hex: '#6C6D74' },
    { name: 'Mountain', hex: '#262E36' },
    { name: 'Midnight', hex: '#000000' }, 
  ];

  const fmtScore = (v) => (v === null || v === undefined ? '—' : `%${v}`);

  const RUBRIC_LABELS = {
    communication: 'İletişim', motivation_and_fit: 'Motivasyon & Uyum', teamwork: 'Takım Çalışması',
    self_awareness: 'Öz Farkındalık', specificity_star: 'Somutluk (STAR)', technical_depth: 'Teknik Derinlik',
    problem_solving: 'Problem Çözme', role_fit: 'Role Uygunluk',
  };

  const toUpper = (text) => {
    return text ? text.toLocaleUpperCase(cvLanguage === 'tr' ? 'tr-TR' : 'en-US') : "";
  };

  const handleRemoveMainSection = (sectionId) => {
    const currentIndex = sectionsOrder.indexOf(sectionId);
    if (currentIndex > -1) {
        setLastDeletedSection({ id: sectionId, index: currentIndex });
        setSectionsOrder(prev => prev.filter(item => item !== sectionId));
    }
  };

  const handleUndoDelete = () => {
    if (lastDeletedSection) {
        setSectionsOrder(prev => {
            const newOrder = [...prev];
            newOrder.splice(lastDeletedSection.index, 0, lastDeletedSection.id);
            return newOrder;
        });
        setLastDeletedSection(null);
    }
  };

  useEffect(() => {
    const scripts = [
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', id: 'pdfjs' },
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', id: 'html2canvas' },
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', id: 'jspdf' }
    ];

    scripts.forEach(s => {
      if (!document.getElementById(s.id)) {
        const script = document.createElement('script');
        script.src = s.src;
        script.id = s.id;
        if (s.id === 'pdfjs') {
          script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          };
        }
        document.head.appendChild(script);
      }
    });
  }, []);

  const extractTextFromPdf = async (file) => {
    setIsPdfLoading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      try {
        const metadata = await pdf.getMetadata();
        if (metadata && metadata.info && metadata.info.Creator === 'Resumatch AI' && metadata.info.Subject) {
            const decodedText = decodeURIComponent(metadata.info.Subject);
            if (decodedText && decodedText.length > 50) {
                setOriginalCV(decodedText.trim());
                setIsPdfLoading(false);
                return; 
            }
        }
      } catch (metaErr) { console.warn("Metadata okunamadı, normal taramaya geçiliyor..."); }

      let fullText = "";
      const linkUrls = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(" ") + "\n";
        // "LinkedIn", "GitHub" gibi yazıların arkasındaki tıklanabilir adresler metinde görünmez; ayrıca topla.
        try {
          const annotations = await page.getAnnotations();
          annotations.forEach(a => {
            if (a.subtype === 'Link' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url) && !linkUrls.includes(a.url)) linkUrls.push(a.url);
          });
        } catch { /* bağlantı okunamazsa metinle devam */ }
      }
      if (linkUrls.length) fullText += "\n" + linkUrls.join("\n") + "\n";
      
      if (fullText.trim().length < 15) {
         setError("Bu PDF bir görsel olarak kaydedildiği için metinleri okunamadı. Lütfen metin tabanlı bir PDF yükleyin.");
      } else {
         setOriginalCV(fullText.trim());
      }

    } catch (err) {
      setError("PDF okunurken hata oluştu. Dosyanın şifreli olmadığından emin olun.");
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file?.type === "application/pdf") extractTextFromPdf(file);
    else setError("Lütfen bir PDF dosyası seçin.");
  };

  const clearPdfData = () => {
    setOriginalCV('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  
  // YENİ: ÇOKLU Ekran Görüntüsünden İş İlanı Okuma (OCR)
  const handleJobScreenshotUpload = async (e) => {
    // Tüm seçilen dosyaları bir diziye (array) çeviriyoruz
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    // Sadece resim dosyalarını filtreliyoruz
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError("Lütfen geçerli resim dosyaları seçin.");
      return;
    }

    setIsExtractingJob(true);
    setError(null);

    try {
      // Tüm resimleri aynı anda Base64 formatına çeviriyoruz
      const imageParts = await Promise.all(
        imageFiles.map(async (file) => {
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]); 
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          return {
            inlineData: {
              data: base64Data,
              mimeType: file.type
            }
          };
        })
      );

      const result = await ocrJobPosting(imageParts.map((p) => p.inlineData));
      const extractedText = result.text;

      if (extractedText) {
        // Okunan metni, mevcut metnin üzerine ekle
        setJobDescription(prev => prev ? prev + "\n\n" + extractedText.trim() : extractedText.trim());
      } else {
        throw new Error("Görsellerden metin okunamadı.");
      }
    } catch (err) {
      console.error("Görsel okuma hatası:", err);
      setError(err.message || "İlan görselleri okunurken bir hata oluştu. Lütfen ilanların net bir şekilde okunduğundan emin olun.");
    } finally {
      setIsExtractingJob(false);
      if (jobImageInputRef.current) jobImageInputRef.current.value = ''; // Input'u sıfırla
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfileImage(event.target.result);
        setPhotoZoom(1);
        setPhotoPos({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    } else {
      setError("Lütfen geçerli bir resim dosyası seçin.");
    }
  };

  const handlePhotoMouseDown = (e) => {
    if (!profileImage) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - photoPos.x, y: e.clientY - photoPos.y });
  };

  const handlePhotoMouseMove = (e) => {
    if (!isDragging) return;
    setPhotoPos({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handlePhotoMouseUp = () => setIsDragging(false);

  const handlePhotoWheel = (e) => {
    if (!profileImage) return;
    e.preventDefault();
    const zoomStep = 0.05;
    setPhotoZoom(prev => Math.max(0.1, Math.min(3, prev + (e.deltaY < 0 ? zoomStep : -zoomStep))));
  };

  const updateField = (field, value) => {
    if (field === 'summary') {
        const key = narrativeVoice === 'first' ? 'summary_v1' : 'summary_v3';
        setOptimizedData(prev => ({ ...prev, [key]: value }));
    } else {
        setOptimizedData(prev => ({ ...prev, [field]: value }));
    }
  };

  const updateArrayField = (section, index, field, value) => {
    setOptimizedData(prev => {
      const newArray = [...prev[section]];
      newArray[index] = { ...newArray[index], [field]: value };
      return { ...prev, [section]: newArray };
    });
  };

  const updateBulletPoint = (section, sectionIndex, bulletIndex, value) => {
    if (section.startsWith('custom_')) {
         setOptimizedData(prev => {
             const newArray = [...prev[section]];
             const targetBullets = [...newArray[sectionIndex].bullets];
             targetBullets[bulletIndex] = value;
             newArray[sectionIndex] = { ...newArray[sectionIndex], bullets: targetBullets };
             return { ...prev, [section]: newArray };
         });
         return;
    }

    const bulletsKey = narrativeVoice === 'first' ? 'bullets_v1' : 'bullets_v3';
      
    setOptimizedData(prev => {
      const newArray = [...prev[section]];
      const targetBullets = newArray[sectionIndex][bulletsKey] ? [...newArray[sectionIndex][bulletsKey]] : [...newArray[sectionIndex].bullets];
      targetBullets[bulletIndex] = value;
      newArray[sectionIndex] = { ...newArray[sectionIndex], [bulletsKey]: targetBullets };
      return { ...prev, [section]: newArray };
    });
  };

  const updateSimpleList = (section, index, value) => {
    setOptimizedData(prev => {
      const newArray = [...prev[section]];
      newArray[index] = value;
      return { ...prev, [section]: newArray };
    });
  };

 const removeSectionItem = (section, index) => {
    setOptimizedData(prev => {
      if (!prev) return prev;
      const newData = JSON.parse(JSON.stringify(prev)); 
      
      const list = newData[section] || [];
      const deletedItem = list[index]; 
      if (!deletedItem) return prev; 

      list.splice(index, 1);
      newData[section] = list;

      if (section === 'skills' && newData.analysis) {
          if (!newData.analysis.additions) newData.analysis.additions = [];
          if (!newData.analysis.gap_mapping) newData.analysis.gap_mapping = {};
          // If this skill was added by the user for a requirement, that requirement becomes a gap again.
          const originalGap = newData.analysis.gap_mapping[deletedItem];
          if (originalGap) {
              newData.analysis = unclaimRequirement(newData.analysis, originalGap);
              delete newData.analysis.gap_mapping[deletedItem];
          }
          newData.analysis.additions = newData.analysis.additions.filter(a => a !== deletedItem);
      }
      return newData;
    });
  };

const removeBulletPoint = (section, expIndex, bulletIndex) => {
    if (section.startsWith('custom_')) {
        setOptimizedData(prev => {
             const newData = JSON.parse(JSON.stringify(prev));
             if(newData[section] && newData[section][expIndex] && newData[section][expIndex].bullets){
                 newData[section][expIndex].bullets.splice(bulletIndex, 1);
             }
             return newData;
        });
        return;
    }

    setOptimizedData(prev => {
      if (!prev) return prev;
      const newData = JSON.parse(JSON.stringify(prev)); 
      
      const targetExp = newData.experience[expIndex];
      if (!targetExp) return prev;
      
      let deletedItem = null;

      if (narrativeVoice === 'first' && targetExp.bullets_v1) {
          deletedItem = targetExp.bullets_v1[bulletIndex];
      } else if (narrativeVoice === 'third' && targetExp.bullets_v3) {
          deletedItem = targetExp.bullets_v3[bulletIndex];
      } else if (targetExp.bullets) {
          deletedItem = targetExp.bullets[bulletIndex];
      }

      if (targetExp.bullets_v1) targetExp.bullets_v1.splice(bulletIndex, 1);
      if (targetExp.bullets_v3) targetExp.bullets_v3.splice(bulletIndex, 1);
      if (targetExp.bullets) targetExp.bullets.splice(bulletIndex, 1);

      newData.experience[expIndex] = targetExp;

      if (section === 'experience' && newData.analysis && deletedItem) {
          if (!newData.analysis.additions) newData.analysis.additions = [];
          if (!newData.analysis.gap_mapping) newData.analysis.gap_mapping = {};
          // Only bullets the user added for a requirement change the score; the score is
          // re-derived deterministically instead of being nudged by hand.
          const originalGap = newData.analysis.gap_mapping[deletedItem];
          if (originalGap) {
              newData.analysis = unclaimRequirement(newData.analysis, originalGap);
              delete newData.analysis.gap_mapping[deletedItem];
          }
          newData.analysis.additions = newData.analysis.additions.filter(a => a !== deletedItem);
      }

      return newData;
    });
  };
  const sanitizeData = (data) => {
      if (!data) return data;
      const clean = (str) => typeof str === 'string' ? str.replace(/\*\*/g, '') : str;

      const newData = { ...data };
      
      newData.name = clean(newData.name) || "";
      newData.title = clean(newData.title) || "";
      newData.location = clean(newData.location) || "";
      newData.phone = clean(newData.phone) || "";
      newData.email = clean(newData.email) || "";
      newData.linkedin = clean(newData.linkedin) || "";
      
      if (newData.summary_v1) newData.summary_v1 = clean(newData.summary_v1);
      if (newData.summary_v3) newData.summary_v3 = clean(newData.summary_v3);
      
      newData.experience = Array.isArray(newData.experience) ? newData.experience.map(exp => ({
          ...exp,
          role: clean(exp.role) || "",
          company: clean(exp.company) || "",
          date: clean(exp.date) || "",
          bullets_v1: Array.isArray(exp.bullets_v1) ? exp.bullets_v1.map(clean) : [],
          bullets_v3: Array.isArray(exp.bullets_v3) ? exp.bullets_v3.map(clean) : [],
          bullets: Array.isArray(exp.bullets) ? exp.bullets.map(clean) : []
      })) : [];
      
      newData.education = Array.isArray(newData.education) ? newData.education.map(edu => ({
          ...edu,
          degree: clean(edu.degree) || "",
          school: clean(edu.school) || "",
          date: clean(edu.date) || "",
          details: clean(edu.details) || ""
      })) : [];

      newData.skills = Array.isArray(newData.skills) ? newData.skills.map(clean) : [];
      newData.additional = Array.isArray(newData.additional) ? newData.additional.map(clean) : [];
      
      // Sunucu CV'den bulduğu GitHub / Behance gibi bağlantıları "links" olarak döndürür.
      if ((!Array.isArray(newData.customLinks) || !newData.customLinks.length) && Array.isArray(newData.links) && newData.links.length) {
          newData.customLinks = newData.links.map((l, i) => ({ label: l.label, url: l.url, id: `link-${Date.now()}-${i}` }));
      }
      newData.customLinks = Array.isArray(newData.customLinks) ? newData.customLinks.map(link => ({
          ...link,
          label: clean(link.label) || "Link",
          url: clean(link.url) || "#"
      })) : [];

      if (newData.analysis) {
          newData.analysis.scores = newData.analysis.scores || { overall: null, skills: null, experience: null, education: null };
          
          if (Array.isArray(newData.analysis.matches)) {
              newData.analysis.matches = { hard_skills: newData.analysis.matches, soft_skills: [] };
          } else {
              newData.analysis.matches = newData.analysis.matches || { hard_skills: [], soft_skills: [] };
          }
          
          newData.analysis.matches.hard_skills = Array.isArray(newData.analysis.matches.hard_skills) ? newData.analysis.matches.hard_skills.map(clean) : [];
          newData.analysis.matches.soft_skills = Array.isArray(newData.analysis.matches.soft_skills) ? newData.analysis.matches.soft_skills.map(clean) : [];
          newData.analysis.gaps = Array.isArray(newData.analysis.gaps) ? newData.analysis.gaps.map(clean) : [];
          newData.analysis.additions = Array.isArray(newData.analysis.additions) ? newData.analysis.additions.map(clean) : [];
      } else {
 newData.analysis = { 
              scores: { overall: null, skills: null, experience: null, education: null }, 
              matches: { hard_skills: [], soft_skills: [] }, 
              gaps: [], additions: [] 
          };
      }

      return newData;
  };

  const handleStartInterview = () => {
    if (!originalCV || !jobDescription) {
        setError("Mülakat için önce CV ve İş İlanı girmelisiniz.");
        return;
    }
    
    ReactGA.event({
      category: "Aksiyon",
      action: "Mulakat_Baslat_Butonu"
    });
    
    setInterviewOpen(true);
    setInterviewType(null); 
    setInterviewMessages([]);
    setUserInterviewInput('');
    setQuestionCount(0);
    setIsInterviewFinished(false);
    setInterviewReport(null);
    setInterviewEndReason('none');
  };

  const toHistory = (messages) =>
    messages.filter((m) => !m.isSystem).map((m) => ({ role: m.sender === 'ai' ? 'interviewer' : 'candidate', text: m.text }));

  const interviewBase = (type) => ({
    cv: originalCV,
    jobPosting: jobDescription,
    lang: cvLanguage,
    type,
    focus: interviewFocus(optimizedData?.analysis),
  });

  const startInterviewSession = async (type) => {
      setInterviewType(type);
      setInterviewLoading(true);
      setQuestionCount(1);
      setInterviewMessages([{sender: 'ai', text: cvLanguage === 'en' ? 'Starting the mock interview, please wait...' : 'Mülakat simülasyonu başlatılıyor, lütfen bekleyin...', isSystem: true}]);
      try {
          const turn = await interviewTurn({ ...interviewBase(type), history: [] });
          setInterviewMax(turn.maxQuestions);
          setQuestionCount(turn.questionNumber);
          setInterviewMessages([{ sender: 'ai', text: turn.message }]);
          if (turn.done) {
              setInterviewEndReason(turn.reason);
              setIsInterviewFinished(true);
          }
      } catch (err) {
          setInterviewMessages([{ sender: 'ai', text: err.message || "Bağlantı hatası oluştu. Lütfen tekrar deneyin." }]);
          setInterviewType(null); 
      } finally {
          setInterviewLoading(false);
      }
  };

  const handleSendInterviewMessage = async () => {
    if (!userInterviewInput.trim() || interviewLoading) return;
    const userMsg = { sender: 'user', text: userInterviewInput.trim() };
    const nextMessages = [...interviewMessages, userMsg];
    setInterviewMessages(nextMessages);
    setUserInterviewInput('');
    setInterviewLoading(true);
    try {
        const turn = await interviewTurn({ ...interviewBase(interviewType), history: toHistory(nextMessages) });
        setInterviewMessages(prev => [...prev, { sender: 'ai', text: turn.message }]);
        setQuestionCount(turn.questionNumber);
        if (turn.done) {
            setInterviewEndReason(turn.reason);
            setIsInterviewFinished(true);
        }
    } catch (err) {
        // Roll back the unanswered message so the user can resend it.
        setInterviewMessages(prev => prev.slice(0, -1));
        setUserInterviewInput(userMsg.text);
        setError(err.message || "Üzgünüm, bir bağlantı hatası oluştu.");
    } finally {
        setInterviewLoading(false);
    }
  };

  const handleInterviewKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendInterviewMessage();
      }
  };

  const generateInterviewReport = async () => {
    setIsGeneratingReport(true);
    try {
        const report = await fetchInterviewReport({
            ...interviewBase(interviewType || 'hr'),
            history: toHistory(interviewMessages),
            endReason: interviewEndReason,
        });
        setInterviewReport(report);
    } catch (err) {
        console.error("Rapor oluşturulamadı:", err);
        setError(err.message || "Mülakat raporu oluşturulamadı.");
    } finally {
        setIsGeneratingReport(false);
    }
  };

// --- YENİ EKLENEN: AKILLI & TOPLU CV'YE YEDİRME FONKSİYONU ---
  // --- YENİ EKLENEN: AKILLI & TOPLU CV'YE YEDİRME FONKSİYONU ---
  // Honest gap integration: the user must confirm they really have the selected
  // qualifications; experience bullets are only written from the user's own notes.
  const handleIntegrateBatchGaps = async () => {
    if (selectedGaps.length === 0 || !gapConfirmed) return;
    setIsIntegratingGaps(true);
    setGapNotice(null);
    ReactGA.event({ category: "Aksiyon", action: "Toplu_Eksik_Giderme_AI", label: `${selectedGaps.length}_madde` });

    try {
        const { items, skipped } = await integrateGapsApi({ gaps: selectedGaps, notes: gapNotes, lang: cvLanguage, confirmed: true });

        setOptimizedData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            if (!newData.analysis.gap_mapping) newData.analysis.gap_mapping = {};
            if (!newData.analysis.additions) newData.analysis.additions = [];

            items.forEach(item => {
                if (item.targetSection === 'skills') {
                    if (!newData.skills) newData.skills = [];
                    if (!newData.skills.includes(item.skill_content)) newData.skills.push(item.skill_content);
                    newData.analysis.gap_mapping[item.skill_content] = item.original_gap;
                    newData.analysis.additions.push(item.skill_content);
                } else if (item.targetSection === 'experience') {
                    if (newData.experience && newData.experience.length > 0) {
                        const exp = newData.experience[0];
                        exp.bullets_v1 = [...(exp.bullets_v1 || []), item.exp_content_v1];
                        exp.bullets_v3 = [...(exp.bullets_v3 || []), item.exp_content_v3];
                        exp.bullets = [...(exp.bullets || []), item.exp_content_v1];
                    } else {
                        newData.summary_v1 = `${newData.summary_v1 || ''} ${item.exp_content_v1}`.trim();
                        newData.summary_v3 = `${newData.summary_v3 || ''} ${item.exp_content_v3}`.trim();
                    }
                    newData.analysis.gap_mapping[item.exp_content_v1] = item.original_gap;
                    newData.analysis.gap_mapping[item.exp_content_v3] = item.original_gap;
                    newData.analysis.additions.push(item.exp_content_v1);
                }
                newData.analysis = claimRequirement(newData.analysis, item.original_gap);
            });
            return newData;
        });

        if (skipped.length) {
            setGapNotice(cvLanguage === 'en'
                ? `${skipped.length} experience item(s) were not added because your notes did not describe them. Add a short note about what you actually did and try again.`
                : `${skipped.length} deneyim maddesi, notlarınızda açıklanmadığı için eklenmedi. Gerçekte ne yaptığınızı kısaca yazıp tekrar deneyin.`);
        }
        setSelectedGaps(skipped);
        setGapConfirmOpen(skipped.length > 0);
        setGapConfirmed(false);
    } catch (err) {
        console.error("Akıllı yedirme hatası:", err);
        setError(err.message || "Eksikler giderilirken bir hata oluştu.");
    } finally {
        setIsIntegratingGaps(false);
    }
  };

  // Restore a flagged rewritten bullet to the user's original CV sentence.
  const handleRevertClaim = (claim) => {
    setOptimizedData(prev => {
        const newData = JSON.parse(JSON.stringify(prev));
        for (const exp of newData.experience || []) {
            const idx = (exp.bullets_v1 || []).indexOf(claim.text);
            if (idx >= 0) {
                exp.bullets_v1[idx] = claim.source;
                if (exp.bullets_v3) exp.bullets_v3[idx] = claim.source;
                if (exp.bullets) exp.bullets[idx] = claim.source;
                break;
            }
        }
        return newData;
    });
    setRevertedClaims(prev => [...prev, claim.id]);
  };

  const handleOptimize = async (lang) => {
    if (!originalCV || !jobDescription) {
      setError('Lütfen CV PDF\'inizi yükleyin ve iş ilanını girin.');
      return;
    }

    if (window.innerWidth < 1024 && mobilePreviewRef.current) {
        mobilePreviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setGameScore(0);
    setGameTargets([]); 
    setShowConfetti(false);
    setLoadingText(lang === 'tr' ? "📄 PDF Analiz Ediliyor..." : "📄 Analyzing PDF...");
    setError(null);
    setCvLanguage(lang);
    setSelectedGaps([]); // Yeni analiz başladığında seçili kutucukları sıfırla
    
    ReactGA.event({
      category: "Aksiyon",
      action: "CV_Tasarla_Butonu",
      label: lang === 'tr' ? 'Turkce' : 'Ingilizce'
    });

    stageCeilingRef.current = 4;
    setRevertedClaims([]);
    setGapNotice(null);
    setGapConfirmOpen(false);

    // Progress creeps toward the ceiling of the stage the server is currently running.
    const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
            const ceiling = stageCeilingRef.current;
            if (prev >= ceiling) return prev;
            return Math.min(ceiling, prev + Math.max(0.15, (ceiling - prev) * 0.04));
        });
    }, 120);

    const onStage = (evt) => {
        const p = STAGE_PROGRESS[evt.name];
        if (!p) return;
        if (evt.status === 'start') {
            stageCeilingRef.current = p.done - 1;
            setLoadingText(STAGE_TEXT[lang]?.[evt.name] || STAGE_TEXT.tr[evt.name]);
        } else {
            stageCeilingRef.current = p.done;
            setLoadingProgress(prev => Math.max(prev, p.done));
        }
    };

    try {
      const result = await tailorCv({ cv: originalCV, jobPosting: jobDescription, lang }, { onStage });

      clearInterval(progressInterval);
      setLoadingProgress(100);
      setLoadingText(lang === 'tr' ? "✅ Hazır!" : "✅ Ready!");
      setShowConfetti(true);

      await new Promise(resolve => setTimeout(resolve, 600));

      let parsedData = sanitizeData(result);
      if (parsedData.experience) parsedData.experience = parsedData.experience.map(i => ({...i, id: Math.random().toString(36).substr(2, 9)}));
      if (parsedData.education) parsedData.education = parsedData.education.map(i => ({...i, id: Math.random().toString(36).substr(2, 9)}));
      setOptimizedData(parsedData);
    } catch (err) {
      setError(err.message || 'Optimizasyon sırasında bir hata oluştu. Lütfen tekrar deneyin.');
      console.error(err);
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
    }
  };

 const handleAddItem = async () => {
    if (!addItemInput.trim()) return;
    setIsAddingItem(true);
    
    // Map the UI section to an API task; prompts live on the server.
    let apiSection = addItemSection;
    let input = addItemInput;
    if (addItemSection === 'summary') {
        const currentSummary = narrativeVoice === 'first' ? optimizedData.summary_v1 : optimizedData.summary_v3;
        input = `Mevcut özet: ${currentSummary}\n\nEklenecek bilgi: ${addItemInput}\n\nEklenecek bilgiyi mevcut özete akışı bozmadan yedirerek tek paragraf halinde yeniden yaz.`;
    } else if (addItemSection === 'contactLink') {
        input = `${addItemTitle}: ${addItemInput}`;
    } else if (addItemSection === 'custom') {
        apiSection = 'customNew';
    } else if (addItemSection.startsWith('custom_')) {
        const existingData = optimizedData[addItemSection];
        const isDetailed = !(existingData && existingData.length > 0 && typeof existingData[0] !== 'object');
        apiSection = isDetailed ? 'customDetailed' : 'customSimple';
        input = `${customHeadings[addItemSection] || ''}: ${addItemInput}`;
    }

    try {
      let parsed = await addItemApi({ section: apiSection, input, title: addItemSection === 'custom' ? addItemTitle : undefined, lang: cvLanguage });
      {
        parsed = sanitizeData({
            ...optimizedData, 
            ...parsed 
        });

        // YENİ VE HATASIZ YAPI:
        const uniqueId = Math.random().toString(36).substr(2, 9);
        let newlyCreatedCustomId = null;

        if (addItemSection === 'custom') {
            newlyCreatedCustomId = `custom_${uniqueId}`;
        }

        setOptimizedData(prev => {
          const newData = { ...prev };
          
          if (addItemSection === 'summary') {
              if (parsed.summary_v1) newData.summary_v1 = parsed.summary_v1;
              if (parsed.summary_v3) newData.summary_v3 = parsed.summary_v3;
          } 
          else if (addItemSection === 'experience' && parsed.entry) {
              newData.experience = [{...parsed.entry, id: uniqueId}, ...(newData.experience || [])];
          } 
          else if (addItemSection === 'education' && parsed.entry) {
              newData.education = [{...parsed.entry, id: uniqueId}, ...(newData.education || [])];
          } 
          else if ((addItemSection === 'skills' || addItemSection === 'additional') && parsed.items) {
              newData[addItemSection] = [...(newData[addItemSection] || []), ...parsed.items];
          }
          else if (addItemSection === 'contactLink' && parsed.link) { 
              newData.customLinks = [...(newData.customLinks || []), { ...parsed.link, id: uniqueId }];
          }
          else if (addItemSection === 'custom') {
              if (parsed.type === 'detailed' && parsed.entries) {
                   newData[newlyCreatedCustomId] = parsed.entries.map(e => ({...e, id: Math.random().toString(36).substr(2, 9)}));
              } else if (parsed.items) {
                   newData[newlyCreatedCustomId] = parsed.items;
              }
          }
          else if (addItemSection.startsWith('custom_')) {
              const existingData = newData[addItemSection];
              let isDetailed = true;
              if (existingData && existingData.length > 0) {
                  isDetailed = typeof existingData[0] === 'object';
              }
              
              if (isDetailed && parsed.entry) {
                  newData[addItemSection] = [{...parsed.entry, id: uniqueId}, ...(newData[addItemSection] || [])];
              } else if (!isDetailed && parsed.items) {
                  newData[addItemSection] = [...(newData[addItemSection] || []), ...parsed.items];
              }
          }

          return newData;
        });
        
        // BAŞLIKLARI VE SIRALAMAYI REACT GÜNCELLEMESİNİN DIŞINA, GÜVENLİ YERE ALDIK
        if (addItemSection === 'custom' && newlyCreatedCustomId) {
            setCustomHeadings(h => ({ ...h, [newlyCreatedCustomId]: addItemTitle.toUpperCase() })); 
            
            setSectionsOrder(o => {
                // Çift oluşmasını engelleyen kesin güvenlik (includes kontrolü)
                if (!o.includes(newlyCreatedCustomId)) {
                    return [...o, newlyCreatedCustomId];
                }
                return o;
            });
            
            // Açılır menüyü yeni bölüme sabitle
            setAddItemSection(newlyCreatedCustomId);
        }

        setAddItemInput('');
        setAddItemTitle(''); 
      }
    } catch (err) { 
        setError("Öğe eklenirken hata oluştu: " + err.message); 
    } finally { 
        setIsAddingItem(false); 
    }
  };

  const handleDownloadPdf = async () => {
    if (!resumeRef.current) return;
    setIsDownloading(true);
    try {
      const resumeElement = resumeRef.current;
      const clone = resumeElement.cloneNode(true);
      
      ReactGA.event({
        category: "Aksiyon",
        action: "PDF_Indir_Butonu",
        label: activeTemplate
      });

      clone.style.width = '794px'; 
      clone.style.minHeight = '1123px'; 
      clone.style.height = 'max-content'; // YENİ: PDF için de sınırsız uzunluk desteği
      clone.style.position = 'absolute';
      clone.style.top = '0'; 
      clone.style.left = '0';
      clone.style.zIndex = '-1000'; 
      clone.classList.add('bg-white');
      clone.style.transform = 'none'; 
      
      const padding = activeTemplate === 'professional' ? '40px' : '32px';
      clone.style.padding = padding;
      clone.style.paddingBottom = '0px'; 

      const cloneSpans = clone.querySelectorAll('span');
      cloneSpans.forEach(span => {
        if (span.innerText.trim() === 'Tarih Ekle') {
            span.style.display = 'none';
        }
      });

      document.body.appendChild(clone);

      const pageWidthPx = 794; 
      const pageHeightPx = Math.ceil(pageWidthPx * 1.414);
      
      const sections = Array.from(clone.querySelectorAll('.animate-in > div'));
      const cloneRect = clone.getBoundingClientRect();
      const cloneLinks = Array.from(clone.querySelectorAll('.pdf-link'));

      sections.forEach((section, idx) => {
          if(idx === 0 && section.classList.contains('flex')) return;

          const rect = section.getBoundingClientRect();
          const relativeTop = rect.top - cloneRect.top;
          
          const offsetOnPage = relativeTop % pageHeightPx;
          
          if (offsetOnPage > pageHeightPx * 0.95) {
               const pushMargin = pageHeightPx - offsetOnPage + 40;
               section.style.marginTop = `${pushMargin}px`;
               return; 
          }

          const height = section.offsetHeight; 
          const relativeBottom = relativeTop + height;
          
          const startPage = Math.floor(relativeTop / pageHeightPx);
          const endPage = Math.floor(relativeBottom / pageHeightPx);
          
          if (startPage !== endPage) {
              if (height < pageHeightPx * 0.25) {
                  const pushMargin = (endPage * pageHeightPx) - relativeTop + 40;
                  section.style.marginTop = `${pushMargin}px`;
                  return;
              }

              const subItems = Array.from(section.querySelectorAll('.group\\/item'));
              
              if (subItems.length > 0) {
                 const firstItem = subItems[0];
                 const firstRect = firstItem.getBoundingClientRect();
                 const firstItemTop = firstRect.top - cloneRect.top;
                 const firstItemPage = Math.floor(firstItemTop / pageHeightPx);

                 if (firstItemPage > startPage) {
                     const pushMargin = (firstItemPage * pageHeightPx) - relativeTop + 40;
                     section.style.marginTop = `${pushMargin}px`;
                     return;
                 }

                 for (let j = 0; j < subItems.length; j++) {
                    const item = subItems[j];
                    const iRect = item.getBoundingClientRect();
                    const iTop = iRect.top - cloneRect.top;
                    const iBottom = iTop + item.offsetHeight;
                    const iStartPage = Math.floor(iTop / pageHeightPx);
                    const iEndPage = Math.floor(iBottom / pageHeightPx);
                    
                    if (iStartPage !== iEndPage) {
                         const itemMargin = (iEndPage * pageHeightPx) - iTop + 40;
                         item.style.marginTop = `${itemMargin}px`;
                         break; 
                    }
                 }
              } else {
                  const marginTop = (endPage * pageHeightPx) - relativeTop + 40;
                  section.style.marginTop = `${marginTop}px`;
              }
          }
      });

      const linkLocations = cloneLinks.map(link => {
          const rect = link.getBoundingClientRect();
          const url = link.getAttribute('data-url');
          return {
              x: rect.left - cloneRect.left, 
              y: rect.top - cloneRect.top,   
              w: rect.width,
              h: rect.height,
              url: url
          };
      });

      const canvas = await window.html2canvas(clone, { 
        scale: 3, 
        useCORS: true, 
        logging: false, 
        backgroundColor: "#ffffff", 
        windowWidth: 794, 
        windowHeight: clone.scrollHeight, 
        imageTimeout: 0 
      });
      
      document.body.removeChild(clone);
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');

      const labels = translations[cvLanguage];
      const activeSummary = narrativeVoice === 'first' ? (optimizedData.summary_v1 || optimizedData.summary) : (optimizedData.summary_v3 || optimizedData.summary);
      
      const expText = optimizedData.experience?.map(e => {
          const bullets = narrativeVoice === 'first' ? (e.bullets_v1 || e.bullets) : (e.bullets_v3 || e.bullets);
          return `${e.role} @ ${e.company} (${e.date})\n${bullets?.join('\n') || ''}`;
      }).join('\n\n') || '';
      
      const eduText = optimizedData.education?.map(edu => `${edu.degree} @ ${edu.school} (${edu.date})\n${edu.details || ''}`).join('\n') || '';
      const skillsText = optimizedData.skills?.join(', ') || '';

      const fullCvText = `${optimizedData.name}\n${optimizedData.title}\n${optimizedData.location} | ${optimizedData.phone} | ${optimizedData.email}\n${optimizedData.linkedin || ''}\n\n${toUpper(labels.summary)}\n${activeSummary}\n\n${toUpper(labels.experience)}\n${expText}\n\n${toUpper(labels.education)}\n${eduText}\n\n${toUpper(labels.skills)}\n${skillsText}`;

      pdf.setProperties({
          title: `${optimizedData.name} - CV`,
          creator: 'Resumatch AI',
          subject: encodeURIComponent(fullCvText)
      });
      
      pdf.setTextColor(255, 255, 255); 
      pdf.setFontSize(1);
      const englishSafeText = fullCvText.replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ü/g, 'u').replace(/Ü/g, 'U');
      pdf.text(pdf.splitTextToSize(englishSafeText, 200), 5, 5);

      const pdfPageWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      
      const pdfScale = pdfPageWidth / pageWidthPx; 
      const imgHeight = (canvas.height * pdfPageWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      let pageIndex = 0;

      while (heightLeft > 10) {
        if (pageIndex > 0) pdf.addPage();
        
        pdf.addImage(imgData, 'PNG', 0, position, pdfPageWidth, imgHeight, undefined, 'FAST');
        
        linkLocations.forEach(link => {
            if (!link.url) return;
            const linkPdfY = link.y * pdfScale; 
            const pageTop = pageIndex * pdfPageHeight;
            const pageBottom = (pageIndex + 1) * pdfPageHeight;

            if (linkPdfY >= pageTop && linkPdfY < pageBottom) {
                const x = link.x * pdfScale;
                const y = linkPdfY - pageTop;
                const w = link.w * pdfScale;
                const h = link.h * pdfScale;
                const safeUrl = encodeURI(link.url);
                pdf.link(x, y, w, h, { url: safeUrl });
            }
        });

        heightLeft -= pdfPageHeight;
        position -= pdfPageHeight;
        pageIndex++;
      }
      pdf.save(`${optimizedData.name.replace(/\s+/g, '_')}_CV_${cvLanguage.toUpperCase()}.pdf`);
    } catch (err) {
      setError("PDF oluşturulurken hata oluştu.");
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const copyAsText = () => {
    if (!optimizedData) return;
    const labels = translations[cvLanguage];
    
    const customLinksStr = optimizedData.customLinks && optimizedData.customLinks.length > 0 
        ? optimizedData.customLinks.map(l => `${l.label}: ${l.url}`).join(' | ') 
        : '';
    const contactStr = `${optimizedData.location} | ${optimizedData.phone} | ${optimizedData.email}${customLinksStr ? ' | ' + customLinksStr : ''}`;
    
    const activeSummary = narrativeVoice === 'first' ? (optimizedData.summary_v1 || optimizedData.summary) : (optimizedData.summary_v3 || optimizedData.summary);
    const text = `${optimizedData.name}\n${optimizedData.title}\n${contactStr}\n${optimizedData.linkedin || ''}\n\n${toUpper(labels.summary)}\n${activeSummary}\n\n${toUpper(labels.experience)}\n${optimizedData.experience.map(e => {
        const bullets = narrativeVoice === 'first' ? (e.bullets_v1 || e.bullets) : (e.bullets_v3 || e.bullets);
        return `${e.role} @ ${e.company} (${e.date})\n${bullets.join('\n')}`;
    }).join('\n\n')}\n\n${toUpper(labels.education)}\n${optimizedData.education.map(edu => `${edu.degree} @ ${edu.school} (${edu.date})`).join('\n')}`;
    
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-slate-800';
    if (score >= 60) return 'text-slate-500';
    return 'text-slate-400';
  };

  const handleSort = () => {
    let _sectionsOrder = [...sectionsOrder];
    const draggedItemContent = _sectionsOrder.splice(dragItem.current, 1)[0];
    _sectionsOrder.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = dragOverItem.current;
    dragOverItem.current = null;
    setSectionsOrder(_sectionsOrder);
  };

  const onSubDragStart = (e, section, index) => {
    e.stopPropagation(); 
    subDragItem.current = { section, index };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.parentNode); 
    e.dataTransfer.setDragImage(e.target, 20, 20);
    setTimeout(() => { if(e.target) e.target.style.opacity = '0.5'; }, 0);
  };

  const onSubDragOver = (e, section, index) => {
    e.preventDefault();
    e.stopPropagation();
    if (!subDragItem.current || subDragItem.current.section !== section) return;
    if (subDragItem.current.index === index) return;
    const targetRect = e.currentTarget.getBoundingClientRect();
    const hoverMiddleY = (targetRect.bottom - targetRect.top) / 2;
    const hoverClientY = e.clientY - targetRect.top;
    if (subDragItem.current.index < index && hoverClientY < hoverMiddleY) return;
    if (subDragItem.current.index > index && hoverClientY > hoverMiddleY) return;
    setOptimizedData(prev => {
      const newData = { ...prev };
      const list = [...newData[section]];
      const [draggedItem] = list.splice(subDragItem.current.index, 1);
      list.splice(index, 0, draggedItem);
      newData[section] = list;
      return newData;
    });
    subDragItem.current.index = index;
  };

  const onSubDragEnd = (e) => {
    e.stopPropagation();
    e.target.style.opacity = '1';
    subDragItem.current = null;
    subDragOverItem.current = null;
  };

  const editableClass = "hover:bg-slate-100 transition-colors cursor-text outline-none focus:bg-slate-50 focus:ring-1 focus:ring-black rounded px-1";

  const getHeaderStyle = () => {
    if (activeTemplate === 'classic') return "flex-col items-center text-center";
    if (activeTemplate === 'professional') return "flex-row items-center justify-between border-b-2 pb-4 border-slate-800";
    if (activeTemplate === 'elegant') return "flex-col items-center text-center border-b border-gray-300 pb-6 mb-6"; 
    if (activeTemplate === 'bold') return "flex-col items-center text-center border-b-2 border-black pb-4 mb-4"; 
    return "flex-row justify-between items-start"; 
  };

  const getSectionTitleStyle = () => {
    if (activeTemplate === 'classic') return "text-center border-b border-slate-300 pb-2 mb-3 font-serif tracking-widest text-[15px]";
    if (activeTemplate === 'professional') return "w-32 flex-shrink-0 font-bold text-[15px] uppercase text-slate-800 pt-1";
    if (activeTemplate === 'elegant') return "text-center uppercase tracking-widest text-[15px] font-semibold mb-4 mt-2"; 
    if (activeTemplate === 'bold') return "uppercase font-bold text-[16px] border-b-2 border-gray-800 pb-2 mb-4 text-left"; 
    return `font-bold text-[15px] tracking-widest border-b mb-1 pb-2`; 
  };

  const getSectionContainerStyle = (isLast) => {
    const spacing = 'mb-2 pb-1';
    const noSpacing = isLast ? 'mb-0 border-0 pb-0' : spacing;

    if (activeTemplate === 'professional') return `flex gap-6 border-b border-slate-100 ${noSpacing}`;
    return isLast ? "mb-0" : 'mb-2'; 
  };

  const getActiveSummary = () => {
      if (!optimizedData) return "";
      if (narrativeVoice === 'first') return optimizedData.summary_v1 || optimizedData.summary;
      return optimizedData.summary_v3 || optimizedData.summary;
  };

  const getActiveBullets = (exp) => {
      // ÖNCELİKLİ OLARAK SEÇİLİ DİLİ (BEN/O) DÖNDÜR (Silme butonunun çalışmama sebebi burasıydı)
      if (narrativeVoice === 'first' && exp.bullets_v1 && exp.bullets_v1.length > 0) return exp.bullets_v1;
      if (narrativeVoice === 'third' && exp.bullets_v3 && exp.bullets_v3.length > 0) return exp.bullets_v3;
      return exp.bullets || [];
  };

  const highlightKeywords = (text) => {
    if (!showHighlights || !text) return text;
      
    // YENİ JSON YAPISINA GÖRE GÜNCELLENDİ
    const sourceList = [
      ...(optimizedData?.analysis?.matches?.hard_skills || []),
      ...(optimizedData?.analysis?.matches?.soft_skills || []),
      ...(optimizedData?.analysis?.additions || [])
    ].filter(Boolean);

    let keywordsToHighlight = [];
    const adjectivePairs = [];

    keywordsToHighlight.push(...sourceList);

    sourceList.forEach(phrase => {
        const words = phrase.split(/[\s,.-]+/); 
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const cleanWord = word.trim();
            const lowerWord = cleanWord.toLowerCase();

            if (ADJECTIVES_TO_PAIR.includes(lowerWord) && i + 1 < words.length) {
                const nextWord = words[i+1].trim();
                if (nextWord.length > 2 && !STOP_WORDS.includes(nextWord.toLowerCase()) && !GENERIC_BUSINESS_WORDS.includes(nextWord.toLowerCase())) {
                    adjectivePairs.push(`${cleanWord} ${nextWord}`);
                    i++; 
                    continue;
                }
            }
            if (cleanWord.length > 2 && !STOP_WORDS.includes(lowerWord) && !GENERIC_BUSINESS_WORDS.includes(lowerWord) && !ADJECTIVES_TO_PAIR.includes(lowerWord)) {
                keywordsToHighlight.push(cleanWord);
            }
        }
    });

    keywordsToHighlight = [...adjectivePairs, ...keywordsToHighlight];
    keywordsToHighlight = [...new Set(keywordsToHighlight)].sort((a, b) => b.length - a.length);

    if (keywordsToHighlight.length === 0) return text;

    const parts = [];
    if (keywordsToHighlight.length > 0) {
        const escapedKeywords = keywordsToHighlight.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        parts.push(`(${escapedKeywords.join('|')})`);
    }
    parts.push(`(\\*\\*.*?\\*\\*)`); 

    const regex = new RegExp(parts.join('|'), 'gi');

    return text.split(regex).map((part, index) => {
      if (!part) return null;

      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        const cleanPart = part.slice(2, -2);
        const lowerPart = cleanPart.toLowerCase();

        if (ignoredKeywords.has(lowerPart)) {
            return cleanPart; 
        }

        if (!processedWords.has(lowerPart)) {
             processedWords.add(lowerPart);
             return <span key={index} className="font-bold text-slate-900">{cleanPart}</span>;
        }
        return cleanPart;
      }

      if (keywordsToHighlight.some(k => k.toLowerCase() === part.toLowerCase())) {
        const lowerPart = part.toLowerCase();
        if (ignoredKeywords.has(lowerPart)) {
            return part; 
        }

        if (!processedWords.has(lowerPart)) {
             processedWords.add(lowerPart);
             return <span key={index} className="font-bold text-slate-900">{part}</span>;
        }
      }
      return part;
    });
  };

  return (
    <>
      <div className="min-h-screen lg:h-screen bg-slate-50 text-slate-900 font-sans p-2 md:p-6 lg:p-10" lang={cvLanguage}>
        
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');

          #resume-preview {
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              text-rendering: optimizeLegibility;
          }
          #resume-preview b, 
          #resume-preview strong { 
            color: #0f172a !important; 
            font-weight: 700 !important;
          }
          @keyframes confetti-fall {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
          }
          @media print {
            @page { margin: 0; }
            body { margin: 0; padding: 0; background: white; }
            #resume-preview {
              background: white !important;
              box-shadow: none !important;
              border: none !important;
              overflow: hidden !important; 
              transform: none !important;
            }
            .page-break-avoid {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            h3 {
              break-after: avoid !important;
              page-break-after: avoid !important;
            }
            ::-webkit-scrollbar { display: none; }
            .no-print { display: none !important; }
          }
        `}</style>
        
        {/* FLOATING TOOLBAR */}
        {toolbarVisible && (
          <div 
            className="fixed z-50 flex items-center bg-slate-900 text-white rounded-lg shadow-xl px-2 py-1 gap-1 animate-in fade-in zoom-in-95 duration-200 no-print"
            style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
          >
            <button 
              onMouseDown={toggleBold}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Kalınlaştır / Vurguyu Kaldır"
            >
              <Bold className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-0.5"></div>
            <button 
              onMouseDown={(e) => { e.preventDefault(); applyFormat('italic'); }}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            >
              <Italic className="w-4 h-4" />
            </button>
            
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45"></div>
          </div>
        )}

        <div className="w-full max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 min-h-screen lg:h-full lg:overflow-hidden">
          
          {/* --- SOL PANEL (GİRİŞ ALANI) --- */}
          <div className="lg:col-span-5 space-y-4 lg:space-y-6 lg:h-full lg:overflow-y-auto pr-0 lg:pr-2 pb-10 lg:pb-20 scrollbar-thin scrollbar-thumb-black scrollbar-track-transparent">
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
              {/* LOGO ALANI */}
              <div className="flex items-center gap-3 mb-6 lg:mb-8 select-none">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-12 h-12 sm:w-14 sm:h-14 mr-1 filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.2)] hover:scale-105 transition-transform duration-300 ease-in-out"
                >
                  <defs>
                    <linearGradient id="slate-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: "#6C6D74", stopOpacity: 1 }} />
                      <stop offset="50%" style={{ stopColor: "#262E36", stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: "#000000", stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                  <path
                    fill="url(#slate-gradient)"
                    d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V1.5H5.625z"
                  />
                  <path
                    fill="#FFFFFF"
                    d="M10.58 15.75l-3.48-3.48 1.06-1.06 2.42 2.42 6.23-6.23 1.06 1.06-7.29 7.29z"
                    className="drop-shadow-sm"
                  />
                  <path
                    fill="url(#slate-gradient)"
                    d="M18.375 1.5h1.875v5.25h-5.25V1.5h3.375z"
                    opacity="0.85"
                  />
                </svg>

                <div className="flex flex-col justify-center">
                  <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-600 via-slate-800 to-black tracking-tight leading-tight">
                    Hazır CV
                  </span>
                  <span className="text-[10px] sm:text-xs text-slate-500 font-bold tracking-widest uppercase ml-0.5 mt-0.5">
                    Profesyonel Kariyer Asistanı
                  </span>
                </div>
              </div>
              
              <div className="space-y-5 lg:space-y-6">
                {/* PDF Yükleme */}
                <div className="block">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">1. Mevcut CV'nizi Yükleyin</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => fileInputRef.current.click()} 
                      className={`flex-1 flex items-center justify-center gap-2 border-2 border-dashed ${originalCV ? 'border-black bg-slate-100 text-black' : 'bg-white border-slate-300 text-slate-500'} p-4 sm:p-5 rounded-xl hover:border-slate-800 hover:bg-slate-50 transition-all text-sm font-medium group`}
                      disabled={isPdfLoading}
                    >
                      {isPdfLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Okunuyor...</span></> : originalCV ? <><FileCheck className="w-4 h-4" /><span>PDF Yüklendi</span></> : <><Upload className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" /><span>PDF Seçin</span></>}
                    </button>
                    {originalCV && (
                      <button onClick={clearPdfData} className="p-4 sm:p-5 bg-white text-slate-400 border border-slate-300 rounded-xl hover:bg-slate-100 hover:text-black transition-colors" title="PDF'i Kaldır">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
                  </div>
                </div>

                {/* Profil Fotoğrafı */}
                <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">2. Profil Fotoğrafı</span>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4">
                      <div 
                        onClick={() => photoInputRef.current.click()}
                        className="w-16 h-16 rounded-full bg-white border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-black transition-colors overflow-hidden group relative shadow-sm"
                      >
                        {profileImage ? (
                          <div className="w-full h-full relative overflow-hidden pointer-events-none flex items-center justify-center bg-white">
                            <img src={profileImage} alt="Profil" className="max-w-none origin-center" style={{ imageRendering: 'high-quality', objectFit: 'contain', width: '100%', height: '100%', transform: `translate(${photoPos.x}px, ${photoPos.y}px) scale(${photoZoom})` }} />
                          </div>
                        ) : <Camera className="w-6 h-6 text-slate-400 group-hover:text-black" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex gap-2 mb-2">
                          <button onClick={() => photoInputRef.current.click()} className="text-[10px] bg-black text-white px-3 py-1.5 rounded-md font-bold hover:bg-slate-800 transition-colors border border-black shadow-sm">DOSYA SEÇ</button>
                          {profileImage && <button onClick={() => setProfileImage(null)} className="text-[10px] bg-white text-slate-700 px-3 py-1.5 rounded-md font-bold hover:bg-slate-100 hover:text-black transition-colors border border-slate-200 shadow-sm">SİL</button>}
                        </div>
                        <div className="flex gap-2">
                          {shapeOptions.map(shape => (
                             <button key={shape.id} onClick={() => setPhotoShape(shape.id)} className={`p-1.5 border rounded-md transition-all ${photoShape === shape.id ? 'bg-black border-black text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'}`} title={shape.label}>
                               <div className={`w-4 h-4 bg-current border border-current ${shape.iconClass}`}></div>
                             </button>
                          ))}
                        </div>
                      </div>
                      <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
                    </div>
                    {profileImage && (
                      <div className="px-1 flex flex-col gap-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500"><span className="flex items-center gap-1 uppercase tracking-wider"><ZoomIn className="w-3 h-3"/> YAKINLAŞTIRMA</span><span>%{Math.round(photoZoom * 100)}</span></div>
                        <input type="range" min="0.1" max="3" step="0.01" value={photoZoom} onChange={(e) => setPhotoZoom(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-black" />
                      </div>
                    )}
                  </div>
                </div>

               {/* İş İlanı */}
                <div className="block">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">3. Hedef İş İlanı</span>
                    
                    {/* YENİ: Ekran Görüntüsü Yükleme Butonu */}
                    <button
                      onClick={() => jobImageInputRef.current?.click()}
                      disabled={isExtractingJob}
                      className="flex items-center gap-1.5 text-[10px] sm:text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg font-bold transition-colors disabled:opacity-50 border border-slate-200 shadow-sm"
                      title="İlanın ekran görüntüsünü yükleyerek metni otomatik çekin"
                    >
                      {isExtractingJob ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                      {isExtractingJob ? "OKUNUYOR..." : "FOTOĞRAFTAN OKU"}
                    </button>
                   <input type="file" ref={jobImageInputRef} onChange={handleJobScreenshotUpload} accept="image/*" multiple className="hidden" /> 
                  </div>
                  
                  <textarea 
                    className="w-full h-24 lg:h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-black focus:border-transparent outline-none placeholder-slate-400 transition-all" 
                    value={jobDescription} 
                    onChange={(e) => setJobDescription(e.target.value)} 
                    placeholder="İlan metnini kopyalayıp buraya yapıştırın veya sağ üstteki buton ile ekran görüntüsünü yükleyin..." 
                  />
                </div>

                {/* Tasarım ve Özelleştirme */}
                <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-2">
                      <Settings2 className="w-4 h-4 text-black" />
                      <span className="text-sm font-bold text-slate-700">4. Tasarım ve Özelleştirme</span>
                  </div>

                  {/* Şablon */}
                  <div>
                      <span className="text-xs font-bold text-slate-500 mb-2 block flex items-center gap-1"><LayoutTemplate className="w-3 h-3"/> Şablon</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{templateOptions.map((template) => (<button key={template.id} onClick={() => setActiveTemplate(template.id)} className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg border transition-all ${activeTemplate === template.id ? 'bg-black border-black shadow-md text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{template.icon}<span className="text-[10px] font-bold mt-1.5">{template.name}</span></button>))}</div>
                  </div>

                  {/* Renk ve İkonlar */}
                  <div>
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-slate-500 flex items-center gap-1"><Palette className="w-3 h-3"/> Renk & İkonlar</span>
                          <div className="flex gap-2">
                            <button onClick={() => setShowHighlights(!showHighlights)} className={`text-[9px] font-bold px-2 py-1 rounded transition-colors border flex items-center gap-1 flex-1 sm:flex-none justify-center ${showHighlights ? 'bg-black text-white border-black' : 'bg-white text-slate-500 border-slate-200'}`}>
                               <Highlighter className="w-3 h-3" /> {showHighlights ? 'Vurgular Açık' : 'Vurgular Kapalı'}
                            </button>
                             
                            <button onClick={() => setShowIcons(!showIcons)} className={`text-[9px] font-bold px-2 py-1 rounded transition-colors border flex-1 sm:flex-none justify-center ${showIcons ? 'bg-black text-white border-black' : 'bg-white text-slate-500 border-slate-200'}`}>{showIcons ? 'İkonlar Açık' : 'İkonlar Kapalı'}</button>
                          </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap pb-2"> 
                        {colorPresets.map((color) => (<button key={color.hex} onClick={() => setThemeColor(color.hex)} className={`w-8 h-8 rounded-full transition-all border-2 flex-shrink-0 ${themeColor === color.hex ? 'border-white ring-2 ring-slate-400 scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: color.hex }} title={color.name} />))}
                        <div className="w-px h-6 bg-slate-300 mx-1 flex-shrink-0"></div> 
                        <label className={`w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer relative overflow-hidden flex-shrink-0 transition-all ${!colorPresets.some(c => c.hex === themeColor) ? 'bg-white border-white ring-2 ring-slate-400' : 'bg-white border-slate-200 hover:border-slate-300'}`} title="Özel Renk Seç">
                          <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                          <div className="w-full h-full flex items-center justify-center bg-white text-slate-400 hover:bg-slate-50 transition-colors"><Plus className="w-4 h-4" /></div>
                        </label>
                      </div>
                  </div>

                  {/* Dil ve Hizalama */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Dil */}
                      <div>
                          <span className="text-xs font-bold text-slate-500 mb-2 block flex items-center gap-1"><PenTool className="w-3 h-3"/> Anlatım Dili</span>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setNarrativeVoice('first')} className={`p-2 rounded-lg border text-[10px] font-bold transition-all ${narrativeVoice === 'first' ? 'bg-black border-black text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>1. Tekil (Yaptım)</button>
                            <button onClick={() => setNarrativeVoice('third')} className={`p-2 rounded-lg border text-[10px] font-bold transition-all ${narrativeVoice === 'third' ? 'bg-black border-black text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>3. Tekil (Yaptı)</button>
                          </div>
                      </div>
                      {/* Metin Hizalama */}
                      <div>
                          <span className="text-xs font-bold text-slate-500 mb-2 block flex items-center gap-1"><AlignJustify className="w-3 h-3"/> Metin Hizalama</span>
                          <div className="flex bg-white rounded-lg border border-slate-200 p-1 gap-1">
                            {alignmentOptions.map((option) => (
                              <button
                                key={option.id}
                                onClick={() => setTextAlign(option.id)}
                                className={`flex-1 flex items-center justify-center p-1.5 rounded transition-all ${textAlign === option.id ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                                title={option.label}
                              >
                                {option.icon}
                              </button>
                            ))}
                          </div>
                      </div>
                  </div>
                </div>

                {/* --- KVKK ONAY KUTUSU --- */}
                <div className="flex items-start gap-3 p-3 sm:p-4 bg-slate-100/50 border border-slate-200 rounded-xl mt-4 mb-2">
                  <input 
                    type="checkbox" 
                    id="terms" 
                    checked={termsAccepted} 
                    onChange={(e) => setTermsAccepted(e.target.checked)} 
                    className="mt-1 w-4 h-4 sm:w-5 sm:h-5 text-black bg-white border-slate-300 rounded focus:ring-black focus:ring-2 cursor-pointer transition-all flex-shrink-0"
                  />
                  <label htmlFor="terms" className="text-[11px] sm:text-xs text-slate-600 cursor-pointer select-none leading-relaxed">
                    <button type="button" onClick={(e) => {e.preventDefault(); setIsKvkkModalOpen(true);}} className="font-bold text-black underline hover:text-slate-700 transition-colors">KVKK Aydınlatma Metni</button>'ni ve <button type="button" onClick={(e) => {e.preventDefault(); setIsTermsModalOpen(true);}} className="font-bold text-black underline hover:text-slate-700 transition-colors">Kullanım Koşulları</button>'nı okudum, kişisel verilerimin anlık olarak yapay zeka sunucularında işlenmesini onaylıyorum.
                  </label>
                </div>

                {/* Aksiyon Butonları */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <button onClick={() => handleOptimize('tr')} disabled={isLoading || !termsAccepted} className="bg-black text-white border-2 border-black font-bold py-3 sm:py-4 rounded-xl shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base">{isLoading && cvLanguage === 'tr' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />} Türkçe CV Tasarla</button>
                  <button onClick={() => handleOptimize('en')} disabled={isLoading || !termsAccepted} className="bg-white text-slate-900 border-2 border-slate-200 font-bold py-3 sm:py-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base">{isLoading && cvLanguage === 'en' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />} İngilizce CV Tasarla</button>
                </div>
                
                {/* --- Mülakat Simülasyonu Butonu --- */}
                <button 
                  onClick={handleStartInterview} 
                  disabled={!termsAccepted}
                  className="w-full bg-black text-white border-2 border-black font-bold py-3 sm:py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  <MessageSquare className="w-5 h-5" /> Mülakat Simülasyonunu Başlat
                </button>

                {error && <p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
              </div>
              
              {/* --- YENİ ATS ANALİZ RAPORU BÖLÜMÜ --- */}
              {optimizedData && !isLoading && (
                <>
                  {optimizedData.analysis && (
                    <div className="mt-8 pt-8 border-t border-slate-100 animate-in slide-in-from-top-4 duration-700">
                      <h3 className="flex items-center gap-2 font-bold text-lg mb-4 text-slate-800"><BarChart3 className="w-5 h-5 text-black" />{translations[cvLanguage].analysisTitle}</h3>
                      
                      {/* SKOR KIRILIMLARI */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
                         <div className="flex flex-col items-center justify-center shrink-0">
                            <div className="w-24 h-24 rounded-full border-4 border-black flex items-center justify-center bg-white shadow-inner relative">
                                <span className="text-3xl font-black text-black">{fmtScore(optimizedData.analysis.scores?.overall)}</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 mt-3 uppercase tracking-widest">{translations[cvLanguage].scoreOverall}</span>
                         </div>
                         
                         <div className="flex-1 w-full space-y-4">
                            <div>
                               <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5"><span>{translations[cvLanguage].scoreSkills}</span><span>{fmtScore(optimizedData.analysis.scores?.skills)}</span></div>
                               <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{width: `${optimizedData.analysis.scores?.skills || 0}%`}}></div></div>
                            </div>
                            <div>
                               <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5"><span>{translations[cvLanguage].scoreExperience}</span><span>{fmtScore(optimizedData.analysis.scores?.experience)}</span></div>
                               <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{width: `${optimizedData.analysis.scores?.experience || 0}%`}}></div></div>
                            </div>
                            <div>
                               <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5"><span>{translations[cvLanguage].scoreEducation}</span><span>{fmtScore(optimizedData.analysis.scores?.education)}</span></div>
                               <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{width: `${optimizedData.analysis.scores?.education || 0}%`}}></div></div>
                            </div>
                         </div>
                      </div>

                      {optimizedData.analysis.low_confidence === 'few_requirements' && (
                        <p className="-mt-3 mb-6 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {cvLanguage === 'en'
                            ? 'Only a few concrete requirements were found in this posting, so the score is based on limited information. Paste the full posting (responsibilities and qualifications) for a reliable analysis.'
                            : 'Bu ilanda az sayıda net gereksinim bulundu; skor sınırlı bilgiye dayanıyor. Güvenilir bir analiz için ilanın tamamını (görev tanımı ve aranan nitelikler) yapıştırın.'}
                        </p>
                      )}

                      <div className="space-y-3 mb-6">
                        <VerificationPanel
                          verification={optimizedData.verification}
                          inputFlags={optimizedData.meta?.inputFlags || []}
                          lang={cvLanguage}
                          onRevert={handleRevertClaim}
                          revertedIds={revertedClaims}
                        />
                        <RequirementBreakdown analysis={optimizedData.analysis} lang={cvLanguage} />
                        <PipelineTrace meta={optimizedData.meta} lang={cvLanguage} />
                      </div>

                      <div className="space-y-4">
                        {/* HARD SKILLS */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                                <Cpu className="w-4 h-4 text-blue-600" /> {translations[cvLanguage].matchesHard}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {optimizedData.analysis.matches?.hard_skills?.map((m, i) => (
                                    <span key={i} className="px-2.5 py-1.5 bg-blue-100/50 text-blue-700 text-xs font-semibold border border-blue-200 rounded-lg flex items-center gap-1.5"><Check className="w-3 h-3" /> {m}</span>
                                ))}
                            </div>
                        </div>
                        
                        {/* SOFT SKILLS */}
                        {optimizedData.analysis.matches?.soft_skills?.length > 0 && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                                <Users className="w-4 h-4 text-purple-600" /> {translations[cvLanguage].matchesSoft}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {optimizedData.analysis.matches?.soft_skills?.map((m, i) => (
                                    <span key={i} className="px-2.5 py-1.5 bg-purple-100/50 text-purple-700 text-xs font-semibold border border-purple-200 rounded-lg flex items-center gap-1.5"><Check className="w-3 h-3" /> {m}</span>
                                ))}
                            </div>
                        </div>
                        )}

                        {/* YENİ: SMART & BATCH GAPS (EKSİKLER) KISMI */}
                        {optimizedData.analysis.gaps?.length > 0 && (
                          <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                              <h4 className="flex items-center gap-2 text-sm font-bold text-rose-800 mb-3"><AlertTriangle className="w-4 h-4 text-rose-600" /> {translations[cvLanguage].gaps}</h4>
                              <ul className="space-y-2">
                                  {optimizedData.analysis.gaps.map((g, i) => (
                                      <li key={i} className={`text-xs flex items-center justify-between gap-2 p-2.5 bg-white rounded-lg border shadow-sm transition-all cursor-pointer ${selectedGaps.includes(g) ? 'border-rose-500 ring-1 ring-rose-500' : 'border-rose-100 hover:border-rose-300'}`}>
                                         <label className="flex items-center gap-3 font-medium cursor-pointer w-full text-rose-700">
                                           <input 
                                              type="checkbox" 
                                              checked={selectedGaps.includes(g)} 
                                              onChange={() => toggleGapSelection(g)} 
                                              className="w-4 h-4 text-rose-600 bg-white border-rose-300 rounded focus:ring-rose-500 cursor-pointer" 
                                           />
                                           <span className="flex-1"><XCircle className="w-3.5 h-3.5 inline-block mr-1 text-rose-500" /> {g}</span>
                                         </label>
                                      </li>
                                  ))}
                              </ul>
                              
                              {/* TOPLU EKLEME: önce kullanıcı onayı (uydurma deneyim yazılmaz) */}
                              {selectedGaps.length > 0 && !gapConfirmOpen && (
                                <button 
                                  onClick={() => { setGapConfirmOpen(true); setGapNotice(null); }}
                                  className="w-full mt-4 bg-black text-white px-4 py-3 rounded-lg font-bold hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
                                >
                                  <Wand2 className="w-4 h-4" />
                                  {translations[cvLanguage].quickAddBtn} ({selectedGaps.length})
                                </button>
                              )}
                              {selectedGaps.length > 0 && gapConfirmOpen && (
                                <div className="mt-4 p-3 bg-white rounded-lg border border-rose-200 space-y-3">
                                  <p className="text-[11px] text-slate-600 leading-relaxed">
                                    {cvLanguage === 'en'
                                      ? 'We only add what is true. Tools and skills are added as skills. For experience items, briefly describe what you actually did — nothing is invented.'
                                      : 'Sadece gerçek olanı ekleriz. Araç ve yetenekler "Yetenekler" bölümüne eklenir. Deneyim maddeleri için gerçekte ne yaptığınızı kısaca yazın — hiçbir şey uydurulmaz.'}
                                  </p>
                                  <textarea
                                    value={gapNotes}
                                    onChange={(e) => setGapNotes(e.target.value)}
                                    rows={3}
                                    maxLength={3000}
                                    placeholder={cvLanguage === 'en' ? 'e.g. In my internship I collected requirements from 3 customer teams…' : 'Örn: Stajımda 3 müşteri ekibiyle görüşerek gereksinimleri dokümante ettim…'}
                                    className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-black outline-none resize-none"
                                  />
                                  <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                                    <input type="checkbox" checked={gapConfirmed} onChange={(e) => setGapConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4" />
                                    {cvLanguage === 'en' ? 'I confirm I genuinely have the selected qualifications.' : 'Seçtiğim yetkinliklere gerçekten sahip olduğumu onaylıyorum.'}
                                  </label>
                                  <div className="flex gap-2">
                                    <button onClick={() => setGapConfirmOpen(false)} className="flex-1 px-3 py-2.5 rounded-lg text-xs font-bold border border-slate-300 hover:bg-slate-50">
                                      {cvLanguage === 'en' ? 'Cancel' : 'Vazgeç'}
                                    </button>
                                    <button
                                      onClick={handleIntegrateBatchGaps}
                                      disabled={isIntegratingGaps || !gapConfirmed}
                                      className="flex-[2] bg-black text-white px-3 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isIntegratingGaps ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                      {cvLanguage === 'en' ? 'Add to CV' : "CV'ye Ekle"} ({selectedGaps.length})
                                    </button>
                                  </div>
                                </div>
                              )}
                              {gapNotice && <p className="mt-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{gapNotice}</p>}
                          </div>
                        )}

                        {/* ADDITIONS */}
                        {optimizedData.analysis.additions?.length > 0 && (
                        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-emerald-800 mb-3">
                                <Lightbulb className="w-4 h-4 text-emerald-600" /> {translations[cvLanguage].added}
                            </h4>
                            <ul className="space-y-1.5">
                                {optimizedData.analysis.additions?.map((a, i) => (
                                    <li key={i} className="text-xs text-emerald-700 flex items-start gap-2 font-medium"><PlusCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" /> {a}</li>
                                ))}
                            </ul>
                        </div>
                        )}
                      </div>
                    </div>
                  )}

                   <div className="mt-8 pt-8 border-t border-slate-100 animate-in slide-in-from-top-4 duration-700">
                     <h3 className="flex items-center gap-2 font-bold text-lg mb-2 text-slate-800"><Wand2 className="w-5 h-5 text-black" />{translations[cvLanguage].addItemTitle}</h3>
                     <p className="text-xs text-slate-500 mb-4">{translations[cvLanguage].addItemDesc}</p>
                     <div className="space-y-3">
                       <select value={addItemSection} onChange={(e) => setAddItemSection(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-black outline-none">
  {dynamicSectionOptions.map(opt => (<option key={opt.id} value={opt.id}>{cvLanguage === 'tr' ? opt.labelTr : opt.labelEn}</option>))}
</select>
                       {/* --- YENİ BAŞLIK GİRİŞİ --- */}
                       {(addItemSection === 'custom' || addItemSection === 'contactLink') && (
                          <input 
                             type="text" 
                             value={addItemTitle} 
                             onChange={(e) => setAddItemTitle(e.target.value)} 
                             placeholder={
                                addItemSection === 'contactLink' 
                                ? (cvLanguage === 'tr' ? "Bağlantı Adı (Örn: GitHub, Portfolio)" : "Link Name (e.g. GitHub, Portfolio)")
                                : (cvLanguage === 'tr' ? "Bölüm Başlığı (Örn: Projeler, Sertifikalar)" : "Section Title (e.g. Projects, Certificates)")
                             }
                             className="w-full p-3 bg-white border-2 border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-black outline-none font-bold text-black placeholder-slate-400"
                          />
                       )}
                       <textarea value={addItemInput} onChange={(e) => setAddItemInput(e.target.value)} placeholder={cvLanguage === 'tr' ? "Örn: Geçen yaz freelance olarak bir React projesi yaptım..." : "Ex: I worked on a freelance React project last summer..."} className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:ring-2 focus:ring-black outline-none resize-none placeholder-slate-400" />
                       <button onClick={handleAddItem} disabled={isAddingItem || !addItemInput.trim() || ((addItemSection === 'custom' || addItemSection === 'contactLink') && !addItemTitle.trim())} className="w-full bg-black text-white font-bold py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                         {isAddingItem ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {translations[cvLanguage].addBtn}
                       </button>
                     </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* --- SAĞ PANEL (ÖNİZLEME ALANI) --- */}
          <div ref={mobilePreviewRef} className="lg:col-span-7 flex flex-col bg-slate-100/50 lg:rounded-xl border-t lg:border border-slate-200/60 overflow-hidden min-h-[70vh] lg:h-full">
            
            {/* SABİT BAŞLIK */}
            <div className="sticky top-0 lg:relative flex-shrink-0 bg-white/95 backdrop-blur-md p-3 sm:p-4 border-b border-slate-200 shadow-sm z-[60] flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <h2 className="font-bold text-slate-600 uppercase tracking-widest text-xs">Canlı Önizleme ({cvLanguage.toUpperCase()})</h2>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                  {optimizedData && !isLoading && (
                    <>
                      <button onClick={copyAsText} className="flex-1 sm:flex-none justify-center text-xs bg-white text-slate-700 border border-slate-200 px-3 sm:px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm">{copySuccess ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />} KOPYALA</button>
                      <button onClick={handleDownloadPdf} disabled={isDownloading} className="flex-1 sm:flex-none justify-center text-xs bg-black text-white px-3 sm:px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 hover:bg-slate-800">{isDownloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PDF İNDİR</button>
                    </>
                  )}
                </div>
            </div>

            {/* SCROLL EDİLEBİLİR CV ALANI */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 pb-20 scrollbar-thin scrollbar-thumb-black scrollbar-track-transparent flex flex-col items-center" ref={previewContainerRef}>
              
              {!isLoading && !optimizedData ? (
                <div className="h-full min-h-[60vh] flex flex-col items-center justify-center space-y-4 opacity-40 select-none w-full">
                  <FileText className="w-16 h-16 lg:w-20 lg:h-20" style={{ color: themeColor }} />
                  <p className="text-[13px] lg:text-[15px] font-bold tracking-widest uppercase text-center px-8 text-slate-900">Verileri doldurun ve bir dil seçerek tasarlayın</p>
                </div>
              ) : (
                
                /* KAPSAYICI KUTU: Artık boyu dinamik olarak uzuyor! */
                <div 
                  className="relative transition-all duration-300 mx-auto bg-white shadow-2xl" 
                  style={{ 
                     width: `${794 * previewScale}px`, 
                     height: `${resumeHeight * previewScale}px`, // YENİ: Sabit 1123px yerine dinamik yükseklik
                     flexShrink: 0 
                  }}
                >
                  
                  {/* ASIL A4 KAĞIDI: Taşmalar artık kesilmiyor, kağıt uzuyor! */}
                  <div 
                    id="resume-preview" 
                    ref={resumeRef}
                    className={`absolute top-0 left-0 overflow-visible select-none origin-top-left ${activeTemplate === 'classic' || activeTemplate === 'bold' ? 'font-serif' : 'font-sans'}`} 
                    style={{ 
                       width: '794px',
                       minWidth: '794px', 
                       minHeight: '1123px',
                       height: 'max-content', // YENİ: Sınırsız içerik desteği
                       paddingTop: activeTemplate === 'professional' ? '40px' : '32px',
                       paddingRight: activeTemplate === 'professional' ? '40px' : '32px',
                       paddingLeft: activeTemplate === 'professional' ? '40px' : '32px',
                       paddingBottom: '32px', // YENİ: Alt kısımdan biraz boşluk
                       transform: `scale(${previewScale})`,
                    }} 
                  >
                    
                    {/* --- MODERN LOADING VE OYUN ALANI (LIGHT MODE) --- */}
                    {isLoading ? (
                      <div className="h-full flex flex-col items-center justify-center p-12 animate-in fade-in duration-500 bg-white absolute inset-0 z-50 relative overflow-hidden select-none">
                          
                          {/* OYUN HEDEFLERİ (TARGETS) */}
                          {gameTargets.map(target => (
                              <div 
                                  key={target.id}
                                  className="absolute cursor-pointer animate-bounce transition-transform active:scale-90 z-20"
                                  style={{ left: `${target.x}%`, top: `${target.y}%` }}
                                  onMouseDown={() => handleGameClick(target.id)}
                                  onTouchStart={() => handleGameClick(target.id)} 
                              >
                                  {target.type === 'briefcase' && <Briefcase className="w-8 h-8 text-slate-700 drop-shadow-md" />}
                                  {target.type === 'star' && <Star className="w-8 h-8 text-slate-500 fill-slate-500 drop-shadow-md" />}
                                  {target.type === 'money' && <Banknote className="w-8 h-8 text-slate-600 drop-shadow-md" />}
                                  {target.type === 'coffee' && <Coffee className="w-8 h-8 text-slate-800 drop-shadow-md" />}
                              </div>
                          ))}

                          <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center mb-8 pointer-events-none z-10">
                              <div className="absolute inset-0 bg-slate-200 rounded-full animate-ping opacity-20"></div>
                              <div className="absolute inset-2 bg-slate-100 rounded-full animate-pulse"></div>
                              
                              <div className="relative z-10 text-black">
                                  {loadingProgress < 30 && <FileSearch className="w-10 h-10 sm:w-12 sm:h-12 animate-bounce" />}
                                  {loadingProgress >= 30 && loadingProgress < 60 && <Cpu className="w-10 h-10 sm:w-12 sm:h-12 animate-spin-slow" />}
                                  {loadingProgress >= 60 && <PenLine className="w-10 h-10 sm:w-12 sm:h-12 animate-pulse" />}
                              </div>
                              
                              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                  <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                                  <circle 
                                      cx="50" cy="50" r="45" fill="none" stroke={themeColor} strokeWidth="4" 
                                      strokeDasharray="283" 
                                      strokeDashoffset={283 - (283 * loadingProgress / 100)} 
                                      strokeLinecap="round"
                                      className="transition-all duration-300 ease-out"
                                  />
                              </svg>
                          </div>

                          <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-2 animate-pulse text-center pointer-events-none z-10 px-4">{loadingText}</h3>
                          
                          <div className="w-48 sm:w-64 h-2 bg-slate-200 rounded-full overflow-hidden mt-4 pointer-events-none z-10">
                              <div 
                                  className="h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                                  style={{ width: `${loadingProgress}%`, backgroundColor: themeColor }}
                              >
                                  <div className="absolute inset-0 bg-white/30 skew-x-12 animate-[shimmer_1.5s_infinite]"></div>
                              </div>
                          </div>
                          <p className="text-xs font-bold text-slate-400 mt-2 pointer-events-none z-10">%{Math.round(loadingProgress)}</p>

                          {/* OYUN SKOR TABLOSU */}
                          <div className="mt-8 flex flex-col items-center animate-in slide-in-from-bottom-4 duration-700 pointer-events-none z-10">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                  <MousePointer2 className="w-3 h-3" /> Kariyer Avcısı
                              </p>
                              <div className="bg-white px-6 py-2 rounded-full shadow-sm border border-slate-200 flex items-center gap-2">
                                  <Trophy className="w-4 h-4 text-slate-500" />
                                  <span className="font-black text-slate-700 text-lg">{gameScore}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">Beklerken ikonları yakala!</p>
                          </div>
                      </div>
                    ) : (
                      <div className={`animate-in fade-in duration-700 ${activeTemplate !== 'classic' ? 'grid grid-cols-2 gap-x-6 gap-y-0' : ''}`}>
                          {/* --- KONFETİ EFEKTİ --- */}
                          {showConfetti && confettiParticles.map(p => <ConfettiParticle key={p.id} style={p.style} />)}
                          
                          {/* HEADER */}
                        <div className={`${activeTemplate !== 'classic' ? 'col-span-2' : ''} flex ${getHeaderStyle()} mb-3`}>
                          <div className={`${activeTemplate === 'classic' || activeTemplate === 'elegant' || activeTemplate === 'bold' ? 'text-center w-full' : 'flex-1 pr-6'}`}>
                            <h1 
                              className={`text-4xl font-bold uppercase tracking-tight mb-2 ${editableClass} ${(activeTemplate === 'classic' || activeTemplate === 'bold') ? 'text-slate-900' : ''}`} 
                              style={{ color: (activeTemplate === 'classic' || activeTemplate === 'bold') ? '#000' : themeColor }}
                              contentEditable suppressContentEditableWarning 
                              onBlur={(e) => updateField('name', e.target.innerText)}
                            >
                              {optimizedData.name || "İsim Giriniz"}
                            </h1>
                            <h2 
                              className={`text-xl font-bold text-slate-800 mb-2 ${editableClass} ${(activeTemplate === 'classic' || activeTemplate === 'bold') ? 'text-slate-600 font-medium' : ''}`} 
                              contentEditable 
                              suppressContentEditableWarning 
                              onBlur={(e) => updateField('title', e.target.innerText)}
                            >
                              {optimizedData.title}
                            </h2>
                            
                            <div className={`flex flex-wrap ${(activeTemplate === 'classic' || activeTemplate === 'elegant' || activeTemplate === 'bold') ? 'justify-center gap-2 text-[11px]' : 'items-center gap-x-2 gap-y-0.5 text-[10px]'} text-slate-500 font-medium mt-1`}>
                              <div className="flex items-center gap-1 group">
                                {showIcons && <MapPin className="w-2.5 h-2.5 opacity-60" />}
                                <span className={editableClass} contentEditable suppressContentEditableWarning onBlur={(e) => updateField('location', e.target.innerText)}>{optimizedData.location || translations[cvLanguage].location}</span>
                              </div>
                              <span className="text-slate-300">•</span>
                              <div className="flex items-center gap-1">
                                {showIcons && <Phone className="w-2.5 h-2.5 opacity-60" />}
                                <span className={editableClass} contentEditable suppressContentEditableWarning onBlur={(e) => updateField('phone', e.target.innerText)}>{optimizedData.phone || translations[cvLanguage].phone}</span>
                              </div>
                              <span className="text-slate-300">•</span>
                              <div className="flex items-center gap-1 group">
                                {showIcons && <Mail className="w-2.5 h-2.5 opacity-60" />}
                                <a 
                                  ref={emailRef} 
                                  href={`mailto:${optimizedData.email}`} 
                                  className={`pdf-link ${editableClass} hover:text-slate-600`}
                                  data-url={`mailto:${optimizedData.email}`}
                                  contentEditable suppressContentEditableWarning 
                                  onBlur={(e) => updateField('email', e.target.innerText)}
                                >
                                  {optimizedData.email || translations[cvLanguage].email}
                                </a>
                                <a 
                                   href={`mailto:${optimizedData.email}`} 
                                   className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5 text-slate-400 hover:text-slate-600"
                                   title="E-posta Gönder"
                                >
                                   <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                              <span className="text-slate-300">•</span>
                              {/* LinkedIn Bölümü */}
                              <div className="flex items-center gap-1 group relative">
                                {showIcons && (
                                  <a 
                                     href={formatLinkedinUrl(optimizedData.linkedin)} 
                                     target="_blank" 
                                     rel="noopener noreferrer" 
                                     className="cursor-pointer hover:opacity-80 transition-opacity pdf-link"
                                     data-url={formatLinkedinUrl(optimizedData.linkedin)}
                                     title="Profili Görüntüle"
                                   >
                                     <Linkedin className="w-2.5 h-2.5 opacity-80" style={{ color: themeColor }} />
                                   </a>
                                )}
                                <span 
                                  ref={linkedinRef} 
                                  className={`${editableClass} font-semibold pdf-link`} 
                                  style={{ color: themeColor, textDecoration: 'none' }} 
                                  data-url={formatLinkedinUrl(optimizedData.linkedin)}
                                  contentEditable 
                                  suppressContentEditableWarning 
                                  onBlur={(e) => updateField('linkedin', e.target.innerText)}
                                  title="Düzenlemek için tıklayın"
                                >
                                  {decodeURIComponent(optimizedData.linkedin || translations[cvLanguage].profil).replace(/^https?:\/\/(www\.)?/, '')}
                                </span>
                                
                                <a 
                                   href={formatLinkedinUrl(optimizedData.linkedin)} 
                                   target="_blank" 
                                   rel="noopener noreferrer" 
                                   className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                   title="Bağlantıyı Aç"
                                >
                                   <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>

                              {/* --- ÖZEL LINK BÖLÜMÜ (GITHUB VB.) --- */}
                              {optimizedData.customLinks?.map((linkObj, idx) => (
                                 <React.Fragment key={linkObj.id || idx}>
                                    <span className="text-slate-300">•</span>
                                    <div className="flex items-center gap-1 group/clink relative">
                                       {showIcons && (
                                          <a 
                                             href={formatUrl(linkObj.url)} 
                                             target="_blank" 
                                             rel="noopener noreferrer" 
                                             className="cursor-pointer hover:opacity-80 transition-opacity pdf-link"
                                             data-url={formatUrl(linkObj.url)}
                                             title={linkObj.label}
                                           >
                                             <LinkIcon className="w-2.5 h-2.5 opacity-80" style={{ color: themeColor }} />
                                           </a>
                                       )}
                                       <span 
                                          className={`${editableClass} font-semibold pdf-link`} 
                                          style={{ color: themeColor, textDecoration: 'none' }} 
                                          data-url={formatUrl(linkObj.url)}
                                          contentEditable 
                                          suppressContentEditableWarning 
                                          onBlur={(e) => {
                                              const text = e.target.innerText;
                                              let newLabel = linkObj.label;
                                              let newUrl = linkObj.url;
                                              if(text.includes(': ')) {
                                                  newLabel = text.split(': ')[0];
                                                  newUrl = text.split(': ')[1];
                                              } else {
                                                  newUrl = text;
                                              }
                                              setOptimizedData(prev => {
                                                  const newArr = [...(prev.customLinks || [])];
                                                  newArr[idx] = { ...newArr[idx], label: newLabel, url: newUrl };
                                                  return { ...prev, customLinks: newArr };
                                              });
                                          }}
                                          title={`${linkObj.label} - Düzenlemek için tıklayın`}
                                       >
                                          {linkObj.label}: {linkObj.url.replace(/^https?:\/\/(www\.)?/, '')}
                                       </span>
                                       
                                       <a 
                                          href={formatUrl(linkObj.url)} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="opacity-0 group-hover/clink:opacity-100 transition-opacity ml-1 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                          title="Bağlantıyı Aç"
                                       >
                                          <ExternalLink className="w-2.5 h-2.5" />
                                       </a>

                                       <button 
                                          onClick={() => {
                                              setOptimizedData(prev => {
                                                  const newArr = [...(prev.customLinks || [])];
                                                  newArr.splice(idx, 1);
                                                  return { ...prev, customLinks: newArr };
                                              });
                                          }}
                                          className="absolute -right-5 top-0 opacity-0 group-hover/clink:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                                          title="Sil"
                                       >
                                           <Trash2 className="w-3 h-3" />
                                       </button>
                                    </div>
                                 </React.Fragment>
                              ))}

                            </div>
                          </div>
                          
                         {/* Fotoğraf (YENİ SÜRÜKLENEBİLİR VE BOYUTLANDIRILABİLİR YAPI) */}
{activeTemplate !== 'classic' && activeTemplate !== 'elegant' && activeTemplate !== 'bold' && profileImage && (
  <div
    className="bg-transparent flex items-center justify-center flex-shrink-0 relative group select-none z-40"
    style={{
      width: `${frameSize}px`,
      height: `${frameSize}px`,
      transform: `translate(${framePos.x}px, ${framePos.y}px)`,
    }}
  >
    {/* 1. MAVİ TAŞIMA KULPU (Sağ Üst) */}
    <div
      className="absolute -top-3 -right-3 w-7 h-7 bg-blue-500 rounded-full cursor-grab active:cursor-grabbing shadow-lg z-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center print:hidden border-2 border-white"
      onMouseDown={(e) => {
        e.stopPropagation();
        setIsDraggingFrame(true);
        setFrameDragStart({ x: e.clientX - framePos.x, y: e.clientY - framePos.y });
      }}
      title="Tüm Çerçeveyi Taşı"
    >
      <Move className="w-3.5 h-3.5 text-white pointer-events-none" />
    </div>

    {/* 2. BOYUTLANDIRMA KULPU (Sağ Alt) */}
    <div
      className="absolute -bottom-2 -right-2 w-6 h-6 bg-white border-2 border-slate-300 rounded-full cursor-se-resize shadow-md z-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center print:hidden"
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizingFrame(true);
        setResizeStart({ size: frameSize, x: e.clientX });
      }}
      title="Çerçeveyi Büyüt / Küçült"
    >
      <ChevronsDown className="w-3.5 h-3.5 text-slate-500 -rotate-45 pointer-events-none" />
    </div>

    {/* 3. İÇERİK (Sadece Fotoğraf Varsa Render Edilir) */}
    <div
      className={`w-full h-full overflow-hidden flex items-center justify-center bg-slate-50 ${photoShape} border border-slate-200 shadow-sm cursor-move`}
      onMouseDown={(e) => { e.stopPropagation(); handlePhotoMouseDown(e); }}
      onMouseMove={handlePhotoMouseMove}
      onMouseUp={handlePhotoMouseUp}
      onMouseLeave={handlePhotoMouseUp}
      onWheel={handlePhotoWheel}
      title="İçteki fotoğrafı kaydırmak için sürükle"
    >
      <div className="w-full h-full relative flex items-center justify-center pointer-events-none">
        <img
          src={profileImage} alt="Profil"
          className="max-w-full max-h-full transition-transform duration-75"
          style={{
            imageRendering: 'high-quality',
            objectFit: 'contain',
            transform: `translate(${photoPos.x}px, ${photoPos.y}px) scale(${photoZoom})`,
          }}
        />
      </div>
    </div>
  </div>
)}
                        </div>

                        {/* Sıralanabilir Bölümler */}
                        {sectionsOrder.map((sectionId, index) => {
                          const isLast = index === sectionsOrder.length - 1;
                          let colSpan = 'col-span-2'; // YENİ: Artık hiçbir bölüm yan yana sıkışmayacak, hepsi tam genişlik
                          
                          if (sectionId.startsWith('custom_') && optimizedData[sectionId] && typeof optimizedData[sectionId][0] === 'object') {
                                colSpan = 'col-span-2';
                          }

                          return (
                            <div 
                              key={sectionId}
                              style={{ pageBreakInside: 'avoid' }}
                              className={`${colSpan} ${getSectionContainerStyle(isLast)} cursor-move relative group rounded-lg transition-all duration-300 ease-in-out border border-transparent hover:border-slate-100/50 hover:bg-slate-50/30 -mx-2 px-2 py-2 page-break-avoid`}
                              draggable
                              onDragStart={(e) => { dragItem.current = index; e.target.style.opacity = '0.5'; e.dataTransfer.effectAllowed = 'move'; }}
                              onDragEnter={(e) => { dragOverItem.current = index; if (dragItem.current !== null && dragItem.current !== index) handleSort(); }}
                              onDragEnd={(e) => { e.target.style.opacity = '1'; dragItem.current = null; dragOverItem.current = null; }}
                              onDragOver={(e) => e.preventDefault()}
                            >
                                <div className="absolute -left-5 top-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-move p-1 text-slate-300 hover:text-slate-500"><Move className="w-4 h-4" /></div>

                                {/* --- BÖLÜM BAŞLIĞI VE SİLME BUTONU --- */}
                                <div className="relative group/header flex items-center">
                                    <h3 
                                      className={`${getSectionTitleStyle()} ${editableClass} flex-grow`} 
                                      style={{ color: (activeTemplate === 'classic' || activeTemplate === 'bold') ? '#333' : themeColor, borderColor: (activeTemplate === 'classic' || activeTemplate === 'bold') ? '#333' : (activeTemplate === 'elegant' ? '#e2e8f0' : themeColor) }}
                                      contentEditable 
                                      suppressContentEditableWarning
                                      onBlur={(e) => setCustomHeadings(prev => ({ ...prev, [sectionId]: e.target.innerText }))}
                                    >
                                      {customHeadings[sectionId] || (sectionId.startsWith('custom_') ? 'YENİ BÖLÜM' : toUpper(translations[cvLanguage][sectionId]))}
                                    </h3>
                                    
                                    <button 
                                      onClick={() => handleRemoveMainSection(sectionId)}
                                      className="absolute right-0 top-0 opacity-0 group-hover/header:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded"
                                      title="Bu bölümü sil"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className={activeTemplate === 'professional' ? 'flex-1' : ''}>
                                  {sectionId === 'summary' && (
                                     <p key={`summary-${showHighlights ? 'hl' : 'no'}`} className={`text-[12px] leading-tight text-slate-700 ${editableClass} ${textAlign}`} contentEditable suppressContentEditableWarning onBlur={(e) => updateField('summary', e.target.innerText)}>
                                      {highlightKeywords(getActiveSummary())}
                                     </p>
                                  )}

                                  {/* --- İŞ DENEYİMİ VE DETAYLI CUSTOM BÖLÜMLER --- */}
                                  {(sectionId === 'experience' || (sectionId.startsWith('custom_') && optimizedData[sectionId] && typeof optimizedData[sectionId][0] === 'object')) && optimizedData[sectionId]?.map((exp, idx) => (
                                     <div key={`${exp.id || idx}-${showHighlights ? 'hl' : 'no'}`} className="mb-1.5 last:mb-0 relative group/item transition-all duration-500 ease-in-out" draggable onDragStart={(e) => onSubDragStart(e, sectionId, idx)} onDragOver={(e) => onSubDragOver(e, sectionId, idx)} onDragEnd={onSubDragEnd}>
                                       <div className="absolute -left-4 top-1 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-move p-1 text-slate-300 hover:text-black"><Move className="w-3 h-3" /></div>
                                       <button onClick={() => removeSectionItem(sectionId, idx)} className="absolute -left-9 top-1 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity" title="Bu kaydı sil"><Trash2 className="w-3 h-3" /></button>
                                       
                                       <div className="flex justify-between items-baseline mb-0.5">
                                         <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                                           <span className={editableClass} contentEditable suppressContentEditableWarning onBlur={(e) => updateArrayField(sectionId, idx, 'role', e.target.innerText)}>{highlightKeywords(exp.role)}</span>
                                           {activeTemplate !== 'professional' && <span className={`font-medium text-slate-600 ${editableClass}`} contentEditable suppressContentEditableWarning onBlur={(e) => updateArrayField(sectionId, idx, 'company', e.target.innerText)}>, {exp.company}</span>}
                                         </h4>
                                         <div className="flex items-center gap-1 ml-auto flex-shrink-0 relative group/date">
                                            <span 
                                                className={`${editableClass} text-[12px] font-bold italic whitespace-nowrap ${!exp.date ? 'text-slate-300 print:hidden' : 'text-slate-500'}`} 
                                                contentEditable 
                                                suppressContentEditableWarning 
                                                onBlur={(e) => updateArrayField(sectionId, idx, 'date', e.target.innerText)}
                                            >
                                                {exp.date || "Tarih Ekle"}
                                            </span>
                                            {exp.date && (
                                                <button 
                                                    onClick={() => updateArrayField(sectionId, idx, 'date', '')} 
                                                    className="opacity-0 group-hover/date:opacity-100 text-slate-400 hover:text-red-600 transition-opacity absolute -right-4 top-0 p-0.5"
                                                    title="Tarihi Sil"
                                                >
                                                    <Trash2 className="w-3 h-3"/>
                                                </button>
                                            )}
                                         </div>
                                       </div>
                                       {activeTemplate === 'professional' && <p className={`text-[13px] font-semibold text-slate-600 mb-1 ${editableClass}`} contentEditable suppressContentEditableWarning onBlur={(e) => updateArrayField(sectionId, idx, 'company', e.target.innerText)}>{exp.company}</p>}
                                       <ul className={`list-disc ml-4 space-y-0.5 ${textAlign}`}>
                                         <ul className={`list-disc ml-4 space-y-0.5 ${textAlign}`}>
  {getActiveBullets(exp)?.map((b, bIdx) => (
    <li key={bIdx} className="text-[12px] text-slate-700 relative group/subitem pr-6">
       
       {/* Düzenlenebilir alan artık bu span içinde. 
           Kullanıcı metni tamamen silip dışarı tıklarsa, sistem maddeyi kökten silecek. */}
       <span 
          className={`outline-none ${editableClass}`} 
          contentEditable 
          suppressContentEditableWarning 
          onBlur={(e) => {
              const newText = e.target.innerText.trim();
              if (newText === '') {
                  // EĞER METİN TAMAMEN SİLİNDİYSE: Çöp kutusuna basılmış gibi davran!
                  removeBulletPoint(sectionId, idx, bIdx); 
              } else {
                  // EĞER SADECE DEĞİŞTİRİLDİYSE: Yeni metni kaydet
                  updateBulletPoint(sectionId, idx, bIdx, newText);
              }
          }}
       >
          {highlightKeywords(b)}
       </span>
       
       {/* Çöp kutusu butonuna contentEditable={false} ekledik ki 
           yanlışlıkla yazıyla beraber buton da düzenlenebilir olmasın */}
       <button 
          contentEditable={false} 
          onClick={() => removeBulletPoint(sectionId, idx, bIdx)} 
          className="absolute right-0 top-0 opacity-0 group-hover/subitem:opacity-100 text-slate-300 hover:text-red-500 transition-opacity z-10"
       >
          <Trash2 className="w-3 h-3" />
       </button>
    </li>
  ))}
</ul>
                                       </ul>
                                     </div>
                                  ))}

                                  {sectionId === 'education' && optimizedData.education?.map((edu, idx) => (
                                     <div key={`${edu.id || idx}-${showHighlights ? 'hl' : 'no'}`} className="mb-1 last:mb-0 relative group/item transition-all duration-500 ease-in-out" draggable onDragStart={(e) => onSubDragStart(e, 'education', idx)} onDragOver={(e) => onSubDragOver(e, 'education', idx)} onDragEnd={onSubDragEnd}>
                                       <div className="absolute -left-4 top-1 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-move p-1 text-slate-300 hover:text-black"><Move className="w-3 h-3" /></div>
                                       <button onClick={() => removeSectionItem('education', idx)} className="absolute -left-9 top-1 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity" title="Bu kaydı sil"><Trash2 className="w-3 h-3" /></button>
                                       
                                       <div className="flex justify-between items-baseline">
                                         <div className={`flex-1 leading-tight text-[14px] ${editableClass}`}>
                                            <span className="font-bold text-slate-900" contentEditable suppressContentEditableWarning onBlur={(e) => updateArrayField('education', idx, 'degree', e.target.innerText)}>{edu.degree}</span>
                                            <span className="mx-1.5 text-slate-300">|</span>
                                            <span className="font-medium text-slate-600" contentEditable suppressContentEditableWarning onBlur={(e) => updateArrayField('education', idx, 'school', e.target.innerText)}>{edu.school}</span>
                                         </div>
                                         <div className="flex items-center gap-1 ml-2 flex-shrink-0 relative group/date">
                                            <span 
                                                className={`${editableClass} text-[12px] font-bold italic whitespace-nowrap ${!edu.date ? 'text-slate-300 print:hidden' : 'text-slate-500'}`} 
                                                contentEditable 
                                                suppressContentEditableWarning 
                                                onBlur={(e) => updateArrayField('education', idx, 'date', e.target.innerText)}
                                            >
                                                {edu.date || "Tarih Ekle"}
                                            </span>
                                            {edu.date && (
                                                <button 
                                                    onClick={() => updateArrayField('education', idx, 'date', '')} 
                                                    className="opacity-0 group-hover/date:opacity-100 text-slate-400 hover:text-red-600 transition-opacity absolute -right-4 top-0 p-0.5"
                                                    title="Tarihi Sil"
                                                >
                                                    <Trash2 className="w-3 h-3"/>
                                                </button>
                                            )}
                                         </div>
                                       </div>
                                       {edu.details && (
                                          <div className="relative group/desc mt-0.5 pr-6">
                                                  <p className={`text-[11px] text-slate-500 leading-snug ${editableClass} ${textAlign}`} contentEditable suppressContentEditableWarning onBlur={(e) => updateArrayField('education', idx, 'details', e.target.innerText)}>
                                                      {highlightKeywords(edu.details)}
                                                  </p>
                                                  <button 
                                                      onClick={() => updateArrayField('education', idx, 'details', '')}
                                                      className="absolute right-0 top-0 opacity-0 group-hover/desc:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                                                      title="Açıklamayı Sil"
                                                  >
                                                      <Trash2 className="w-3 h-3" />
                                                  </button>
                                          </div>
                                       )}
                                     </div>
                                  ))}

                                 
                                  {/* YENİ: YETENEKLER TASARIMI */}
{sectionId === 'skills' && optimizedData.skills?.length > 0 && (
   <div key={`skills-${showHighlights ? 'hl' : 'no'}`} className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
     {optimizedData.skills.map((s, i) => (
       <div key={i} className="text-[12px] text-slate-700 flex items-start gap-2 relative group/item cursor-move leading-snug pr-2" draggable onDragStart={(e) => onSubDragStart(e, 'skills', i)} onDragOver={(e) => onSubDragOver(e, 'skills', i)} onDragEnd={onSubDragEnd}>
         <div className="absolute -left-4 top-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 text-slate-300 hover:text-black"><Move className="w-2.5 h-2.5" /></div>
         <button onClick={() => removeSectionItem('skills', i)} className="absolute right-0 top-0 opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-opacity z-10" title="Sil"><Trash2 className="w-3 h-3" /></button>
         <span className="w-1 h-1 rounded-full shrink-0 mt-[6px]" style={{ backgroundColor: themeColor }}></span> 
         
         {/* DÜZENLEME ALANI SADECE BURADA */}
         <span 
            className={`break-words flex-1 outline-none ${editableClass}`} 
            contentEditable 
            suppressContentEditableWarning 
            onBlur={(e) => {
                const newText = e.target.innerText.trim();
                if (newText === '') {
                    removeSectionItem('skills', i); // Metin tamamen silindiyse komple maddeyi uçur ve puanı düşür
                } else {
                    updateSimpleList('skills', i, newText);
                }
            }}
         >
            {highlightKeywords(s)}
         </span>
       </div>
     ))}
   </div>
)}

                                  {/* YENİ: EK BİLGİLER TASARIMI */}
                                  {/* YENİ: EK BİLGİLER TASARIMI */}
{(sectionId === 'additional' || (sectionId.startsWith('custom_') && optimizedData[sectionId] && typeof optimizedData[sectionId][0] !== 'object')) && optimizedData[sectionId]?.length > 0 && (
   <div key={`cust-${sectionId}-${showHighlights ? 'hl' : 'no'}`} className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
     {optimizedData[sectionId].map((a, i) => (
       <div key={i} className="text-[12px] text-slate-700 relative group/item cursor-move flex items-start gap-1.5 leading-snug pr-2" draggable onDragStart={(e) => onSubDragStart(e, sectionId, i)} onDragOver={(e) => onSubDragOver(e, sectionId, i)} onDragEnd={onSubDragEnd}>
         <div className="absolute -left-4 top-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 text-slate-300 hover:text-black"><Move className="w-3 h-3" /></div>
         <button onClick={() => removeSectionItem(sectionId, i)} className="absolute right-0 top-0 opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-opacity z-10" title="Sil"><Trash2 className="w-3 h-3" /></button>
         <span className="font-bold mt-[-1px] text-slate-400">•</span> 
         
         {/* DÜZENLEME ALANI SADECE BURADA */}
         <span 
            className={`break-words flex-1 outline-none ${editableClass}`} 
            contentEditable 
            suppressContentEditableWarning 
            onBlur={(e) => {
                const newText = e.target.innerText.trim();
                if (newText === '') {
                    removeSectionItem(sectionId, i); // Metin silinirse maddeyi uçur
                } else {
                    updateSimpleList(sectionId, i, newText);
                }
            }}
         >
            {highlightKeywords(a)}
         </span>
       </div>
     ))}
   </div>
)}
                                </div>
                             </div>
                          );
                        })}

                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- UNDO NOTIFICATION (TOAST) --- */}
        {lastDeletedSection && (
          <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-full shadow-2xl flex items-center gap-3 sm:gap-4 z-[70] animate-in slide-in-from-bottom-4 duration-300 border border-slate-700 w-[90%] sm:w-auto justify-between sm:justify-center">
             <span className="text-xs sm:text-sm font-medium">Bölüm silindi</span>
             <div className="h-4 w-px bg-slate-700"></div>
             <button onClick={handleUndoDelete} className="text-xs sm:text-sm font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                <Undo2 className="w-4 h-4" /> GERİ AL
             </button>
             <button onClick={() => setLastDeletedSection(null)} className="ml-0 sm:ml-2 text-slate-500 hover:text-white transition-colors">
                <XCircle className="w-5 h-5" />
             </button>
          </div>
        )}

        {/* --- PREMIUM DARK MODE MÜLAKAT SİMÜLASYONU MODAL --- */}
        {interviewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
              <div className="w-full max-w-2xl bg-[#0a0a0a] rounded-xl sm:rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col h-[90vh] sm:h-auto sm:max-h-[85vh]">
                  
                  {/* Modal Header */}
                  <div className="p-3 sm:p-4 border-b border-[#222] flex justify-between items-center bg-[#111] shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] flex items-center justify-center border border-zinc-800 shadow-sm">
                              <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-300" />
                          </div>
                          <div>
                              <h3 className="font-bold text-white text-base sm:text-lg">
                                  {interviewType === 'hr' ? 'HR Interviewer' : (interviewType === 'tech' ? 'Tech Lead' : 'AI Interviewer')}
                              </h3>
                              <p className="text-[10px] sm:text-xs text-zinc-500 font-medium tracking-wide">
                                  {!interviewType ? 'SEÇİM BEKLENİYOR' : (interviewType === 'hr' ? 'GENEL / İK MÜLAKATI' : 'TEKNİK MÜLAKAT')}
                                  {interviewType && !isInterviewFinished && ` • Soru ${questionCount}/${interviewMax}`}
                                  {isInterviewFinished && ` • Tamamlandı`}
                              </p>
                          </div>
                      </div>
                      <button onClick={() => setInterviewOpen(false)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                          <X className="w-5 h-5" />
                      </button>
                  </div>

                  {/* --- SEÇİM VEYA SOHBET EKRANI --- */}
                  {!interviewType ? (
                      /* Seçim Ekranı */
                      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 sm:py-20 bg-[#0a0a0a]">
                          <div className="w-16 h-16 bg-[#111] rounded-full flex items-center justify-center mb-2 border border-zinc-800 shadow-sm">
                              <Bot className="w-8 h-8 text-white" />
                          </div>
                          <h3 className="text-xl sm:text-2xl font-bold text-white text-center mb-4">Mülakat Türünü Seçin</h3>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
                              <button 
                                  onClick={() => startInterviewSession('hr')} 
                                  className="flex flex-col items-center justify-center p-6 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] hover:border-zinc-500 rounded-2xl transition-all gap-3 group active:scale-95"
                              >
                                  <Users className="w-8 h-8 text-blue-400 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
                                  <div className="text-center">
                                      <div className="font-bold text-white">Genel / İK Mülakatı</div>
                                      <div className="text-[11px] text-zinc-500 mt-1 leading-tight">Kültür uyumu, iletişim ve<br/>davranışsal yetkinlikler</div>
                                  </div>
                              </button>
                              
                              <button 
                                  onClick={() => startInterviewSession('tech')} 
                                  className="flex flex-col items-center justify-center p-6 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] hover:border-zinc-500 rounded-2xl transition-all gap-3 group active:scale-95"
                              >
                                  <Terminal className="w-8 h-8 text-emerald-400 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
                                  <div className="text-center">
                                      <div className="font-bold text-white">Teknik Mülakat</div>
                                      <div className="text-[11px] text-zinc-500 mt-1 leading-tight">Takım Lideri ile teknik beceri<br/>ve problem çözme senaryoları</div>
                                  </div>
                              </button>
                          </div>
                      </div>
                  ) : (
                      /* Sohbet Ekranı */
                      <>
                          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent bg-[#0a0a0a]" ref={interviewScrollRef}>
                              {interviewMessages.map((msg, idx) => (
                                  <div key={idx} className={`flex gap-3 sm:gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                      {msg.sender === 'ai' && (
                                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#0a0a0a] flex-shrink-0 flex items-center justify-center border border-zinc-800 mt-1">
                                              <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-300" />
                                          </div>
                                      )}
                                      <div className={`max-w-[85%] sm:max-w-[80%] p-3 sm:p-4 text-[14px] sm:text-[15px] leading-relaxed shadow-sm ${
                                          msg.sender === 'user' 
                                              ? 'bg-white text-black rounded-2xl rounded-tr-sm font-medium' 
                                              : 'bg-[#111] text-zinc-200 border border-zinc-800 rounded-2xl rounded-tl-sm'
                                      }`}>
                                          {msg.isSystem ? (
                                              <span className="flex items-center gap-2 italic text-zinc-500">
                                                  <Loader2 className="w-3 h-3 animate-spin" /> {msg.text}
                                              </span>
                                          ) : (
                                              <span className={msg.text.includes("Mülakat sonlandırıldı") || msg.text.includes("kabul edilemez") ? "text-red-400 font-semibold" : ""}>
                                                  {msg.text}
                                              </span>
                                          )}
                                      </div>
                                      {msg.sender === 'user' && (
                                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-zinc-200 flex-shrink-0 flex items-center justify-center mt-1 border border-zinc-300">
                                              <User className="w-3 h-3 sm:w-4 sm:h-4 text-black" />
                                          </div>
                                      )}
                                  </div>
                              ))}
                              
                              {/* Yapay Zeka Yazıyor Animasyonu */}
                              {interviewLoading && (
                                  <div className="flex gap-3 sm:gap-4">
                                       <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#0a0a0a] flex-shrink-0 flex items-center justify-center border border-zinc-800 mt-1">
                                          <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-300" />
                                      </div>
                                      <div className="bg-[#111] p-3 sm:p-4 rounded-2xl rounded-tl-sm border border-zinc-800 flex items-center gap-1.5">
                                          <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                          <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                          <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                      </div>
                                  </div>
                              )}

                              {/* Rapor Hazırlanıyor Animasyonu */}
                              {isGeneratingReport && (
                                  <div className="flex flex-col items-center justify-center p-8 space-y-4 animate-in fade-in duration-500">
                                     <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin" />
                                     <p className="text-zinc-400 text-sm font-medium tracking-wide">Yapay Zeka Mülakat Analizini Hazırlıyor...</p>
                                  </div>
                              )}

                              {/* --- MÜLAKAT ANALİZ RAPORU KARTI --- */}
                              {interviewReport && (
                                  <div className="mt-8 mb-4 bg-[#111] border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
                                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                                      <div className="flex items-center justify-between mb-6 relative z-10 border-b border-zinc-800 pb-4">
                                          <h4 className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
                                              <Trophy className="w-5 h-5 text-yellow-500" />
                                              Mülakat Analiz Raporu
                                          </h4>
                                          <div className="text-right">
                                              <div className="text-[10px] text-zinc-500 font-bold tracking-wider mb-1">BAŞARI ORANI</div>
                                              <div className={`text-3xl font-black ${interviewReport.score >= 70 ? 'text-emerald-400' : (interviewReport.score >= 40 ? 'text-amber-400' : 'text-rose-400')}`}>
                                                  %{interviewReport.score}
                                              </div>
                                          </div>
                                      </div>

                                      <div className="space-y-4 relative z-10">
                                          {/* Rubrik: genel puan bu boyutların ortalamasından hesaplanır */}
                                          {interviewReport.rubric?.length > 0 && (
                                              <div className="bg-[#1a1a1a] rounded-xl p-4 border border-zinc-800/50 space-y-2">
                                                  {interviewReport.rubric.map((r) => (
                                                      <div key={r.dimension}>
                                                          <div className="flex justify-between text-[11px] font-bold text-zinc-300 mb-1">
                                                              <span>{RUBRIC_LABELS[r.dimension] || r.dimension}</span>
                                                              <span className="font-mono text-zinc-400">{r.score}/5</span>
                                                          </div>
                                                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                              <div className="h-full bg-white rounded-full" style={{ width: `${r.score * 20}%` }} />
                                                          </div>
                                                          {r.note && <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{r.note}</p>}
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                          {/* Güçlü Yönler */}
                                          {interviewReport.strengths && interviewReport.strengths.length > 0 && (
                                              <div className="bg-[#1a1a1a] rounded-xl p-4 border border-zinc-800/50">
                                                  <h5 className="text-emerald-400 font-bold text-sm flex items-center gap-2 mb-3">
                                                      <ThumbsUp className="w-4 h-4" /> Başarılı Olduğun Noktalar
                                                  </h5>
                                                  <ul className="space-y-2">
                                                      {interviewReport.strengths.map((s, i) => (
                                                          <li key={i} className="text-zinc-300 text-[13px] flex items-start gap-2 leading-relaxed">
                                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mt-1.5 shrink-0"></span>
                                                              {s}
                                                          </li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}

                                          {/* Gelişim Alanları */}
                                          {interviewReport.weaknesses && interviewReport.weaknesses.length > 0 && (
                                              <div className="bg-[#1a1a1a] rounded-xl p-4 border border-zinc-800/50">
                                                  <h5 className="text-rose-400 font-bold text-sm flex items-center gap-2 mb-3">
                                                      <ThumbsDown className="w-4 h-4" /> Gelişime Açık Yönler
                                                  </h5>
                                                  <ul className="space-y-2">
                                                      {interviewReport.weaknesses.map((w, i) => (
                                                          <li key={i} className="text-zinc-300 text-[13px] flex items-start gap-2 leading-relaxed">
                                                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500/50 mt-1.5 shrink-0"></span>
                                                              {w}
                                                          </li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}

                                          {/* Öneriler */}
                                          {interviewReport.suggestions && interviewReport.suggestions.length > 0 && (
                                              <div className="bg-blue-900/10 rounded-xl p-4 border border-blue-900/20">
                                                  <h5 className="text-blue-400 font-bold text-sm flex items-center gap-2 mb-3">
                                                      <Lightbulb className="w-4 h-4" /> Daha İyi Olabilirdi: Tavsiyeler
                                                  </h5>
                                                  <ul className="space-y-2">
                                                      {interviewReport.suggestions.map((s, i) => (
                                                          <li key={i} className="text-blue-100/70 text-[13px] flex items-start gap-2 leading-relaxed">
                                                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mt-1.5 shrink-0"></span>
                                                              {s}
                                                          </li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              )}

                              {/* Kapandıktan sonra uyarı ikonu (Sadece rapor yoksa göster) */}
                              {isInterviewFinished && !interviewReport && !isGeneratingReport && interviewMessages.length > 0 && interviewMessages[interviewMessages.length-1].sender === 'ai' && interviewMessages[interviewMessages.length-1].text.includes("sonlandır") && (
                                  <div className="flex justify-center mt-6 animate-in zoom-in duration-300">
                                      <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2">
                                          <AlertOctagon className="w-4 h-4" /> MÜLAKAT İPTAL EDİLDİ
                                      </div>
                                  </div>
                              )}
                          </div>

                          {/* Input Area */}
                          <div className="p-3 sm:p-4 bg-[#111] border-t border-[#222] shrink-0">
                              <div className="relative flex items-center gap-2">
                                  <input 
                                      type="text" 
                                      value={userInterviewInput}
                                      onChange={(e) => setUserInterviewInput(e.target.value)}
                                      onKeyDown={handleInterviewKeyPress}
                                      placeholder={isInterviewFinished ? "Mülakat tamamlandı. Analiz raporunuzu inceleyebilirsiniz." : "Cevabınızı buraya yazın..."}
                                      className={`w-full bg-[#0a0a0a] text-white placeholder-zinc-600 border border-[#333] rounded-xl py-3 sm:py-3.5 pl-4 pr-12 focus:ring-1 focus:ring-white focus:border-white outline-none transition-all text-[14px] sm:text-[15px] ${isInterviewFinished ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      disabled={interviewLoading || isInterviewFinished}
                                      autoFocus
                                  />
                                  <button 
                                      onClick={handleSendInterviewMessage}
                                      disabled={!userInterviewInput.trim() || interviewLoading || isInterviewFinished}
                                      className="absolute right-2 p-2 bg-white hover:bg-zinc-200 text-black rounded-lg transition-all disabled:opacity-30 disabled:bg-transparent disabled:text-zinc-600 shadow-sm"
                                  >
                                      <Send className="w-4 h-4" />
                                  </button>
                              </div>
                              <p className="text-center text-[10px] sm:text-[11px] text-zinc-600 mt-2 sm:mt-3 font-medium hidden sm:block">
                                  Resumatch AI Interviewer - Powered by Gemini
                              </p>
                          </div>
                      </>
                  )}
              </div>
          </div>
        )}

      </div>
      
      {/* KVKK MODAL */}
      {isKvkkModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-black"/> KVKK Aydınlatma Metni</h3>
              <button onClick={() => setIsKvkkModalOpen(false)} className="text-slate-400 hover:text-black transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto text-sm text-slate-600 space-y-4">
              <p><strong>Hazır CV</strong> platformunu kullandığınız için teşekkür ederiz. Gizliliğiniz ve veri güvenliğiniz bizim için en yüksek önceliktir.</p>
              <p><strong>1. Veri İşleme ve Saklama:</strong> Sisteme yüklediğiniz CV dosyalarınız (PDF) ve içindeki kişisel verileriniz (ad, iletişim bilgileri, eğitim, iş geçmişi vb.) hiçbir veri tabanında <strong>kaydedilmez, saklanmaz ve depolanmaz.</strong></p>
              <p><strong>2. Yapay Zeka (Üçüncü Taraf) Aktarımı:</strong> Verileriniz, CV optimizasyonu ve mülakat simülasyonu yapabilmek amacıyla anlık olarak yurtdışı merkezli Google Gemini API sunucularına güvenli bir şekilde aktarılır. İşlem tamamlandığı ve sonuç size gösterildiği anda tüm veriler sistemin RAM (geçici) hafızasından kalıcı olarak yok edilir.</p>
              <p><strong>3. Onay:</strong> Sistemimizi kullanarak kişisel verilerinizin bu kapsamda anlık olarak işlenmesini ve yurt dışı sunucularına aktarılmasını özgür iradenizle kabul etmiş sayılırsınız.</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsKvkkModalOpen(false)} className="bg-black text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-slate-800 transition-colors">Anladım</button>
            </div>
          </div>
        </div>
      )}

      {/* KULLANIM KOŞULLARI MODAL */}
      {isTermsModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-black"/> Kullanım Koşulları</h3>
              <button onClick={() => setIsTermsModalOpen(false)} className="text-slate-400 hover:text-black transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto text-sm text-slate-600 space-y-4">
              <p>Hazır CV platformunu kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız:</p>
              <p><strong>1. Sorumluluk Reddi:</strong> Hazır CV, yapay zeka (AI) destekli deneysel ve asistan bir araçtır. Sistem tarafından oluşturulan özgeçmişlerin, analiz skorlarının veya mülakat geri bildirimlerinin mutlak doğruluğu garanti edilemez.</p>
              <p><strong>2. İşe Alım Garantisi:</strong> Bu platformun amacı CV'nizi profesyonelleştirmektir. Üretilen dokümanlar üzerinden herhangi bir işe alım, ATS (Aday Takip Sistemi) onay garantisi veya mülakat başarısı taahhüt edilmez.</p>
              <p><strong>3. Son Kontrol Sorumluluğu:</strong> Üretilen PDF çıktılarını indirmeden ve resmi iş başvurularında kullanmadan önce okumak, varsa yapay zeka halüsinasyonlarını (yanlış bilgileri) düzeltmek tamamen sizin (kullanıcının) sorumluluğundadır.</p>
              <p><strong>4. Hizmet Kesintisi:</strong> Hizmet "olduğu gibi" sunulmaktadır. Geliştirici, API yoğunluğu veya sunucu kaynaklı yaşanabilecek kesintilerden sorumlu tutulamaz.</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsTermsModalOpen(false)} className="bg-black text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-slate-800 transition-colors">Kabul Ediyorum</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
