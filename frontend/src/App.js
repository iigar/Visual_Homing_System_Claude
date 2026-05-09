import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Map, FileText, Code, Info, History, Play, Square, RotateCcw, Plus, Trash2, Save, X, Plane, Download } from "lucide-react";
import SimpleMap3D from "./components/SimpleMap3D";
import { Toaster, toast } from "sonner";
import { Switch } from "@/components/ui/switch";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Glass Panel Component
const GlassPanel = ({ children, className = "" }) => (
  <div className={`backdrop-blur-xl bg-black/60 border border-white/10 rounded-xl shadow-2xl ${className}`}>
    {children}
  </div>
);

// Animated Card Component  
const AnimatedCard = ({ children, className = "", delay = 0 }) => (
  <div 
    className={`animate-slide-up bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl 
                hover:border-cyan-500/50 hover:shadow-glow-sm transition-all duration-300 ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    {children}
  </div>
);

// Navigation Tab Button
const TabButton = ({ active, icon: Icon, label, onClick, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300
                ${active 
                  ? 'bg-cyan-500 text-black shadow-glow' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
  >
    <Icon size={18} />
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// Document Viewer
const DocViewer = ({ doc }) => {
  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-zinc-500 animate-fade-in">
        <FileText size={64} className="mb-4 opacity-30" />
        <p className="text-lg">Виберіть документ зі списку</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in p-6" data-testid="doc-content">
      <div 
        className="prose prose-invert prose-cyan max-w-none
                   prose-headings:font-heading prose-headings:text-white
                   prose-h1:text-3xl prose-h1:text-cyan-400 prose-h1:border-b prose-h1:border-zinc-800 prose-h1:pb-4
                   prose-h2:text-xl prose-h2:text-white/90 prose-h2:mt-8
                   prose-p:text-zinc-400 prose-p:leading-relaxed
                   prose-code:bg-zinc-800 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-cyan-400
                   prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800
                   prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline
                   prose-strong:text-white prose-li:text-zinc-400"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </div>
  );
};

// File Tree Component
const FileTree = ({ files, onSelect, selectedPath }) => {
  const grouped = {};
  files.forEach(f => {
    const parts = f.split('/');
    const folder = parts.length > 1 ? parts[0] : 'root';
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(f);
  });

  const getIcon = (path) => {
    if (path.endsWith('.py')) return '🐍';
    if (path.endsWith('.cpp') || path.endsWith('.hpp')) return '⚙️';
    if (path.endsWith('.sh')) return '📜';
    return '📄';
  };

  return (
    <div className="space-y-4" data-testid="file-tree">
      {Object.entries(grouped).map(([folder, items], idx) => (
        <div key={folder} className="animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
          <div className="text-xs font-mono text-cyan-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Code size={14} />
            {folder}
          </div>
          <div className="space-y-1">
            {items.map(item => (
              <button
                key={item}
                onClick={() => onSelect(item)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200
                           ${selectedPath === item 
                             ? 'bg-cyan-950/50 border border-cyan-500/30 text-cyan-400' 
                             : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              >
                <span className="mr-2">{getIcon(item)}</span>
                {item.split('/').pop()}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Code Viewer Component
const CodeViewer = ({ code, path }) => {
  if (!code) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-zinc-500 animate-fade-in">
        <Code size={64} className="mb-4 opacity-30" />
        <p className="text-lg">Виберіть файл для перегляду</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" data-testid="code-viewer">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <span className="font-mono text-sm text-cyan-400">{path}</span>
      </div>
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="font-mono text-zinc-300 leading-relaxed">{code}</code>
      </pre>
    </div>
  );
};

// Route History Component
const RouteHistory = ({ routes, onSelect, onDelete, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!routes || routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500 animate-fade-in">
        <History size={64} className="mb-4 opacity-30" />
        <p className="text-lg mb-2">Немає збережених маршрутів</p>
        <p className="text-sm text-zinc-600">Маршрути з'являться тут після збереження</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in" data-testid="route-history">
      {routes.map((route, idx) => (
        <AnimatedCard key={route.id} delay={idx * 50} className="p-4 group cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1" onClick={() => onSelect(route)}>
              <h3 className="font-heading font-bold text-white group-hover:text-cyan-400 transition-colors">
                {route.name}
              </h3>
              <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                <span className="font-mono">{route.keyframes?.length || 0} keyframes</span>
                <span className="font-mono">{route.total_distance?.toFixed(1) || 0}m</span>
                <span>{new Date(route.created_at).toLocaleDateString('uk-UA')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => onSelect(route)}
                className="p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 transition-colors"
                title="Переглянути"
              >
                <Map size={18} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(route.id); }}
                className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                title="Видалити"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </AnimatedCard>
      ))}
    </div>
  );
};

// Map Panel Component
const MapPanel = ({ onSaveRoute, saveEnabled, setSaveEnabled, selectedRoute }) => {
  const [route, setRoute] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [stats, setStats] = useState({ keyframes: 0, distance: 0 });

  useEffect(() => {
    if (selectedRoute) {
      setRoute(selectedRoute);
      setStats({
        keyframes: selectedRoute.keyframes?.length || 0,
        distance: selectedRoute.total_distance || 0
      });
    }
  }, [selectedRoute]);

  const loadDemoRoute = async () => {
    try {
      const response = await axios.get(`${API}/routes/demo/generate`);
      setRoute(response.data);
      setStats({
        keyframes: response.data.keyframes?.length || 0,
        distance: response.data.total_distance || 0
      });
    } catch (e) {
      console.error("Failed to load route:", e);
      toast.error("Помилка завантаження маршруту");
    }
  };

  useEffect(() => {
    loadDemoRoute();
  }, []);

  const handleSaveRoute = async () => {
    if (!route) return;
    try {
      await onSaveRoute(route);
      toast.success("Маршрут збережено!");
    } catch (e) {
      toast.error("Помилка збереження");
    }
  };

  return (
    <div className="relative h-[calc(100vh-80px)] overflow-hidden" data-testid="map-panel">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0">
        <SimpleMap3D route={route} isSimulating={isSimulating} />
      </div>

      {/* Top Control Bar */}
      <GlassPanel className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Plane size={20} className="text-cyan-400 animate-float" />
            <span className="font-heading font-bold text-white">3D Карта</span>
          </div>
          
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-500">Keyframes:</span>
              <span className="font-mono font-bold text-white">{stats.keyframes}</span>
            </div>
            <div className="h-4 w-px bg-zinc-700" />
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-500">Дистанція:</span>
              <span className="font-mono font-bold text-white">{stats.distance.toFixed(1)}m</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4 text-sm">
            <Switch 
              checked={saveEnabled} 
              onCheckedChange={setSaveEnabled}
              className="data-[state=checked]:bg-cyan-500"
            />
            <span className="text-zinc-400 text-xs">Автозбереження</span>
          </div>
        </div>
      </GlassPanel>

      {/* Bottom Control Panel */}
      <GlassPanel className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-center gap-4 px-6 py-4">
        <button
          onClick={() => setIsSimulating(!isSimulating)}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all duration-300
                     ${isSimulating 
                       ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
                       : 'bg-cyan-500 text-black shadow-glow hover:scale-105'}`}
          data-testid="sim-btn"
        >
          {isSimulating ? <Square size={18} /> : <Play size={18} />}
          {isSimulating ? 'Стоп' : 'Симуляція'}
        </button>

        <button
          onClick={() => { setIsSimulating(false); loadDemoRoute(); }}
          className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium
                     bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-600 
                     hover:bg-zinc-700 transition-all"
          data-testid="reset-btn"
        >
          <RotateCcw size={18} />
          Скинути
        </button>

        <button
          onClick={loadDemoRoute}
          className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium
                     bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-600 
                     hover:bg-zinc-700 transition-all"
          data-testid="new-route-btn"
        >
          <Plus size={18} />
          Новий маршрут
        </button>

        {saveEnabled && (
          <button
            onClick={handleSaveRoute}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium
                       bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                       hover:bg-emerald-500/30 transition-all animate-fade-in"
            data-testid="save-route-btn"
          >
            <Save size={18} />
            Зберегти
          </button>
        )}
      </GlassPanel>
    </div>
  );
};

// About Section Component
const AboutSection = () => (
  <div className="max-w-4xl mx-auto py-8 animate-fade-in" data-testid="about-section">
    <AnimatedCard className="overflow-hidden">
      {/* Header with gradient */}
      <div className="relative px-8 py-10 border-b border-zinc-800 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent" />
        <div className="relative flex items-center gap-5">
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <Plane size={40} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl text-white">Visual Homing System</h1>
            <p className="text-zinc-400 mt-1">Оптична навігація для ArduPilot</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <p className="text-zinc-400 text-lg leading-relaxed">
          Система візуальної навігації для мультикоптерних дронів на базі ArduPilot.
          Працює за принципом оптичної комп'ютерної мишки — записує візуальні орієнтири
          під час польоту та використовує їх для автономного повернення на точку зльоту.
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: '📍', title: 'Без GPS залежності', desc: 'Навігація по візуальних орієнтирах, стійкість до GPS спуфінгу' },
            { icon: '🧭', title: 'Без компаса', desc: 'Орієнтація визначається візуально, немає магнітних інтерференцій' },
            { icon: '🔄', title: 'Teach & Repeat', desc: 'Запис маршруту під час польоту, повернення по записаному шляху' },
            { icon: '🌡️', title: 'Термальна камера', desc: 'Підтримка Caddx Thermal 256 для нічного бачення' },
          ].map((feature, idx) => (
            <AnimatedCard key={feature.title} delay={idx * 100} className="p-5 hover:-translate-y-1">
              <span className="text-3xl mb-3 block">{feature.icon}</span>
              <h3 className="font-heading font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-zinc-500">{feature.desc}</p>
            </AnimatedCard>
          ))}
        </div>

        {/* Specs Table */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-500 mb-4">Специфікації</h3>
          <div className="space-y-3">
            {[
              ['Комп\'ютер', 'Raspberry Pi Zero 2 W'],
              ['Камера', 'Caddx Thermal 256 / Pi Camera'],
              ['Політний контролер', 'Matek (ArduCopter 4.5.7)'],
              ['Протокол', 'MAVLink 2 (UART 115200)'],
              ['Мови', 'Python 3 / C++17'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-500">{label}</span>
                <span className="font-mono font-medium text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AnimatedCard>
  </div>
);

// Main App Component
function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docContent, setDocContent] = useState(null);
  const [firmware, setFirmware] = useState({ python: [], cpp: [], scripts: [], config: [] });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  // Load documentation list
  useEffect(() => {
    const loadDocs = async () => {
      try {
        const response = await axios.get(`${API}/docs/list`);
        setDocs(response.data);
      } catch (e) {
        console.error("Failed to load docs:", e);
      }
    };
    loadDocs();
  }, []);

  // Load firmware structure
  useEffect(() => {
    const loadFirmware = async () => {
      try {
        const response = await axios.get(`${API}/firmware/structure`);
        setFirmware(response.data);
      } catch (e) {
        console.error("Failed to load firmware structure:", e);
      }
    };
    loadFirmware();
  }, []);

  // Load saved routes
  useEffect(() => {
    if (activeTab === 'history') {
      loadSavedRoutes();
    }
  }, [activeTab]);

  const loadSavedRoutes = async () => {
    setRoutesLoading(true);
    try {
      const response = await axios.get(`${API}/routes`);
      setSavedRoutes(response.data);
    } catch (e) {
      console.error("Failed to load routes:", e);
    }
    setRoutesLoading(false);
  };

  const loadDoc = useCallback(async (filename) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/docs/${filename}`);
      setDocContent(response.data);
    } catch (e) {
      console.error("Failed to load doc:", e);
    }
    setLoading(false);
  }, []);

  const loadFile = useCallback(async (filepath) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/firmware/file/${filepath}`);
      setFileContent(response.data.content);
    } catch (e) {
      console.error("Failed to load file:", e);
    }
    setLoading(false);
  }, []);

  const handleDocSelect = (doc) => {
    setSelectedDoc(doc.name);
    loadDoc(doc.name);
  };

  const handleFileSelect = (path) => {
    setSelectedFile(path);
    loadFile(path);
  };

  const handleSaveRoute = async (route) => {
    const savedRoute = {
      ...route,
      id: `route_${Date.now()}`,
      name: `Маршрут ${new Date().toLocaleString('uk-UA')}`,
      created_at: new Date().toISOString()
    };
    await axios.post(`${API}/routes`, savedRoute);
    toast.success("Маршрут збережено!");
    loadSavedRoutes();
  };

  const handleDeleteRoute = async (routeId) => {
    try {
      await axios.delete(`${API}/routes/${routeId}`);
      toast.success("Маршрут видалено");
      loadSavedRoutes();
    } catch (e) {
      toast.error("Помилка видалення");
    }
  };

  const allFirmwareFiles = [
    ...firmware.python,
    ...firmware.cpp,
    ...firmware.scripts,
    ...firmware.config
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans" data-testid="app-container">
      <Toaster position="top-right" theme="dark" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl" data-testid="header">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Plane size={20} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-lg text-white">Visual Homing</h1>
            </div>
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-400">v1.0</span>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-2">
            <TabButton 
              active={activeTab === 'map'} 
              icon={Map} 
              label="3D Карта" 
              onClick={() => setActiveTab('map')}
              testId="tab-map"
            />
            <TabButton 
              active={activeTab === 'history'} 
              icon={History} 
              label="Історія" 
              onClick={() => setActiveTab('history')}
              testId="tab-history"
            />
            <TabButton 
              active={activeTab === 'docs'} 
              icon={FileText} 
              label="Документація" 
              onClick={() => setActiveTab('docs')}
              testId="tab-docs"
            />
            <TabButton 
              active={activeTab === 'firmware'} 
              icon={Code} 
              label="Прошивка" 
              onClick={() => setActiveTab('firmware')}
              testId="tab-firmware"
            />
            <TabButton 
              active={activeTab === 'about'} 
              icon={Info} 
              label="Про проект" 
              onClick={() => setActiveTab('about')}
              testId="tab-about"
            />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {activeTab === 'map' && (
          <MapPanel
            onSaveRoute={handleSaveRoute}
            saveEnabled={saveEnabled}
            setSaveEnabled={setSaveEnabled}
            selectedRoute={selectedRoute}
          />
        )}

        {activeTab === 'history' && (
          <div className="max-w-4xl mx-auto px-6 py-8" data-testid="history-section">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-heading font-bold text-2xl text-white">Історія маршрутів</h2>
                <p className="text-zinc-500 text-sm mt-1">Збережені записи польотів</p>
              </div>
              <button 
                onClick={loadSavedRoutes}
                className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
              >
                <RotateCcw size={18} />
              </button>
            </div>
            <RouteHistory 
              routes={savedRoutes} 
              onSelect={(route) => { setSelectedRoute(route); setActiveTab('map'); }}
              onDelete={handleDeleteRoute}
              loading={routesLoading}
            />
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6" data-testid="docs-section">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <GlassPanel className="p-4 sticky top-24">
                <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-500 mb-4 px-2">
                  Документи
                </h2>
                <div className="space-y-1">
                  {docs.map((doc, idx) => (
                    <button
                      key={doc.name}
                      onClick={() => handleDocSelect(doc)}
                      data-testid={`doc-item-${doc.name}`}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200
                                 animate-slide-up flex items-center gap-2
                                 ${selectedDoc === doc.name 
                                   ? 'bg-cyan-950/50 border border-cyan-500/30 text-cyan-400' 
                                   : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <FileText size={14} />
                      <span className="truncate">{doc.title}</span>
                    </button>
                  ))}
                </div>
              </GlassPanel>
            </aside>

            {/* Content */}
            <section className="lg:col-span-3">
              <GlassPanel className="min-h-[600px] overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <DocViewer doc={docContent} />
                )}
              </GlassPanel>
            </section>
          </div>
        )}

        {activeTab === 'firmware' && (
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6" data-testid="firmware-section">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <GlassPanel className="p-4 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto">
                <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-500 mb-4 px-2">
                  Файли прошивки
                </h2>
                <FileTree
                  files={allFirmwareFiles}
                  onSelect={handleFileSelect}
                  selectedPath={selectedFile}
                />
              </GlassPanel>
            </aside>

            {/* Content */}
            <section className="lg:col-span-3">
              <GlassPanel className="min-h-[600px] overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <CodeViewer code={fileContent} path={selectedFile} />
                )}
              </GlassPanel>
            </section>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="px-6">
            <AboutSection />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 mt-8" data-testid="footer">
        <p className="text-center text-zinc-600 text-sm">
          Visual Homing System • ArduPilot + Raspberry Pi Zero 2 W • MIT License
        </p>
      </footer>
    </div>
  );
}

export default App;
