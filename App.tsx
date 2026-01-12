
import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, remove } from "firebase/database";
import { db } from "./firebaseConfig.ts";
import { Room, ScreenState, Player, WikiData, RankingEntry } from "./types.ts";
import { createRoom, joinRoom, leaveRoom, startGame, registerWin, fetchGameData, formatTime, touchRoom, fetchGlobalRankings, cleanupEmptyRooms, syncPlayerClicks } from "./services/gameService.ts";
import { Button } from "./components/Button.tsx";
import { Input } from "./components/Input.tsx";
import { Notification } from "./components/Notification.tsx";

// Componente do Título Animado com efeito Typewriter
const TypewriterTitle: React.FC = () => {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'typingBrasil' | 'pausing' | 'deleting' | 'typingBR' | 'done'>('typingBrasil');
  
  const brasilLetters = [
    { char: 'B', color: 'text-green-500' },
    { char: 'r', color: 'text-yellow-400' },
    { char: 'a', color: 'text-blue-500' },
    { char: 's', color: 'text-blue-500' },
    { char: 'i', color: 'text-yellow-400' },
    { char: 'l', color: 'text-green-500' },
  ];

  const brLetters = [
    { char: 'B', color: 'text-[#ffd700]' },
    { char: 'R', color: 'text-[#ffd700]' },
  ];

  useEffect(() => {
    let timer: number;
    if (phase === 'typingBrasil') {
      if (text.length < 6) {
        timer = window.setTimeout(() => {
          setText("Brasil".slice(0, text.length + 1));
        }, 150);
      } else {
        setPhase('pausing');
      }
    } else if (phase === 'pausing') {
      timer = window.setTimeout(() => {
        setPhase('deleting');
      }, 1500);
    } else if (phase === 'deleting') {
      if (text.length > 0) {
        timer = window.setTimeout(() => {
          setText(prev => prev.slice(0, -1));
        }, 100);
      } else {
        setPhase('typingBR');
      }
    } else if (phase === 'typingBR') {
      if (text.length < 2) {
        timer = window.setTimeout(() => {
          setText("BR".slice(0, text.length + 1));
        }, 200);
      } else {
        setPhase('done');
      }
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [text, phase]);

  const renderLetters = () => {
    if (phase === 'typingBR' || (phase === 'done' && text === "BR")) {
      return text.split('').map((char, i) => (
        <span key={i} className={brLetters[i]?.color}>{char}</span>
      ));
    }
    return text.split('').map((char, i) => (
      <span key={i} className={brasilLetters[i]?.color || 'text-white'}>{char}</span>
    ));
  };

  return (
    <h1 className="text-6xl font-black text-white mb-8 italic tracking-tighter drop-shadow-2xl flex items-center justify-center">
      WikiRace&nbsp;
      <span className="relative">
        {renderLetters()}
        {phase !== 'done' && (
          <span className="absolute -right-4 top-0 w-1 h-12 bg-[#ffd700] animate-pulse ml-1 shadow-[0_0_15px_#ffd700]"></span>
        )}
      </span>
    </h1>
  );
};

const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>(ScreenState.HOME);
  const [wikiData, setWikiData] = useState<WikiData | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [nick, setNick] = useState<string>(() => localStorage.getItem('wikiRaceNick') || '');
  const [roomCode, setRoomCode] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [clickCount, setClickCount] = useState<number>(0);
  const [currentSlug, setCurrentSlug] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [pageContent, setPageContent] = useState<string>('');
  const [pageTitleDisplay, setPageTitleDisplay] = useState<string>('');
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isActionInProgress, setIsActionInProgress] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('wikiRaceDarkMode') === 'true');
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const [formType, setFormType] = useState<'public' | 'private'>('public');
  const [formCrit, setFormCrit] = useState<'time' | 'clicks'>('time');
  const [formStop, setFormStop] = useState<boolean>(true);
  const [formMax, setFormMax] = useState<number>(5);

  const contentRef = useRef<HTMLDivElement>(null);
  const forbiddenNamespaces = ['Categoria:', 'Ficheiro:', 'Especial:', 'Ajuda:', 'Predefinição:', 'Discussão:', 'Usuário:', 'Portal:', 'Wikipédia:', 'MediaWiki:', 'Módulo:', 'Arquivo:', 'Media:', 'Template:', 'Category:'];

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => setNotification({ message, type });

  const refreshRankings = () => {
    fetchGlobalRankings().then(setRankings);
  };

  useEffect(() => { localStorage.setItem('wikiRaceDarkMode', String(darkMode)); }, [darkMode]);
  useEffect(() => { localStorage.setItem('wikiRaceNick', nick); }, [nick]);
  
  useEffect(() => {
    fetchGameData().then(data => { if (data) { setWikiData(data); setIsDataLoaded(true); } });
    refreshRankings();
    cleanupEmptyRooms();
    const cleanupInterval = setInterval(cleanupEmptyRooms, 15000);
    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    if (!roomCode) { setCurrentRoom(null); return; }
    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsub = onValue(roomRef, (snap) => {
      const data = snap.val() as Room | null;
      if (data) {
        setCurrentRoom(data);
        const players = data.players || {};
        if (Object.keys(players).length === 0) {
          remove(roomRef);
          handleBackToHome();
        }
      } else {
        if (roomCode && screen !== ScreenState.HOME && screen !== ScreenState.PUBLIC_ROOMS && screen !== ScreenState.CREATE_ROOM) {
          handleBackToHome();
          showNotification("A sala foi encerrada.", "info");
        }
      }
    });
    return () => unsub();
  }, [roomCode, screen]);

  useEffect(() => {
    if (screen === ScreenState.PUBLIC_ROOMS) {
      const roomsRef = ref(db, 'rooms');
      const unsub = onValue(roomsRef, (snap) => {
        const rooms: Room[] = [];
        snap.forEach((child) => {
          const r = child.val() as Room;
          const playersCount = Object.keys(r.players || {}).length;
          if (playersCount > 0 && r.type === 'public' && r.status === 'waiting' && playersCount < r.maxPlayers) {
            rooms.push(r);
          }
        });
        setPublicRooms(rooms);
      });
      return () => unsub();
    }
  }, [screen]);

  useEffect(() => {
    if (screen === ScreenState.GAME && roomCode && playerId && clickCount > 0) {
      const timeout = setTimeout(() => {
        syncPlayerClicks(roomCode, playerId, clickCount);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [clickCount]);

  useEffect(() => {
    if (!currentRoom) return;
    if (currentRoom.status === 'playing' && screen === ScreenState.LOBBY) {
      setScreen(ScreenState.GAME);
      if (!currentSlug) {
        const initialSlug = currentRoom.startUrl;
        setCurrentSlug(initialSlug);
        setHistory([initialSlug]);
      }
    } else if (currentRoom.status === 'finished' && screen === ScreenState.GAME) {
      setScreen(ScreenState.RESULT);
    }
  }, [currentRoom?.status, screen]);

  useEffect(() => {
    if (screen === ScreenState.GAME && currentRoom?.status === 'playing' && currentRoom.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - (currentRoom.startTime || Date.now()));
        if (Math.floor(Date.now() / 1000) % 5 === 0 && roomCode) touchRoom(roomCode);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [screen, currentRoom?.status, currentRoom?.startTime, roomCode]);

  const normalize = (str: string) => {
    if (!str) return '';
    try {
      let decoded = str;
      try { decoded = decodeURIComponent(str); } catch(e) {}
      return decoded.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, ' ').toLowerCase().trim();
    } catch {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, ' ').toLowerCase().trim();
    }
  };

  useEffect(() => {
    if (screen !== ScreenState.GAME || !currentSlug) return;
    const loadPage = async () => {
      setIsLoadingPage(true);
      setPageError(null);
      try {
        const cleanSlug = decodeURIComponent(currentSlug).split('#')[0].split('?')[0].trim();
        const response = await fetch(`https://pt.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=${encodeURIComponent(cleanSlug)}&prop=text&mobileformat=1&redirects=1`);
        const data = await response.json();
        if (data.error) {
          setPageError(`Não conseguimos carregar "${cleanSlug}".`);
          setPageTitleDisplay("Erro de Navegação");
        } else {
          setPageContent(data.parse.text['*']);
          setPageTitleDisplay(data.parse.title);
          checkWinCondition(cleanSlug, data.parse.title);
          if (contentRef.current) contentRef.current.scrollTop = 0;
        }
      } catch (err) { 
        setPageError("Falha na conexão."); 
      } finally { 
        setIsLoadingPage(false); 
      }
    };
    loadPage();
  }, [currentSlug, screen]);

  const checkWinCondition = (slug: string, displayTitle: string) => {
    if (!currentRoom || screen !== ScreenState.GAME) return;
    const me = currentRoom.players?.[playerId];
    if (!me) return;
    const targetSuffix = me.targetThemeSuffix || currentRoom.targetThemeSuffix;
    const targetTitle = me.targetThemeTitle || currentRoom.targetThemeTitle;
    
    if (normalize(slug) === normalize(targetSuffix) || normalize(displayTitle) === normalize(targetTitle)) {
      if (!me.finishedAt) {
        registerWin(roomCode, playerId, nick, elapsedTime, clickCount, currentRoom.stopOnWin);
        if (!currentRoom.stopOnWin) {
          showNotification("Você chegou ao destino!", "success");
          setScreen(ScreenState.RESULT);
        }
      }
    }
  };

  const handleBackToHome = () => {
    if (roomCode && playerId) leaveRoom(roomCode, playerId);
    setRoomCode(''); setPlayerId(''); setCurrentRoom(null);
    setElapsedTime(0); setClickCount(0); setCurrentSlug(''); setHistory([]);
    setScreen(ScreenState.HOME);
    setIsActionInProgress(false);
    refreshRankings(); // Atualiza o ranking global ao voltar
  };

  const handleGoBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      const prev = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      setCurrentSlug(prev);
      setClickCount(c => Math.max(0, c - 1));
    }
  };

  const themeClasses = darkMode ? "from-[#0f101a] via-[#1a1c2c] to-[#0f101a]" : "from-[#0077be] via-[#00a8cc] to-[#40e0d0]";

  return (
    <div className={`min-h-screen bg-gradient-to-br ${themeClasses} flex flex-col items-center justify-center p-4 transition-all duration-700 font-sans selection:bg-[#ffd700] selection:text-black`}>
      {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      
      {screen !== ScreenState.GAME && (
        <button onClick={() => setDarkMode(!darkMode)} className={`fixed top-4 right-4 p-4 rounded-full shadow-2xl z-[60] transition-all hover:scale-110 active:scale-95 ${darkMode ? 'bg-yellow-400 text-gray-950' : 'bg-gray-900 text-yellow-400'}`}>
          {darkMode ? '☀️' : '🌙'}
        </button>
      )}

      {screen === ScreenState.HOME && (
        <div className="flex flex-col items-center space-y-4 w-full max-sm:px-4 text-center animate-in fade-in zoom-in duration-500">
          <TypewriterTitle />
          {!isDataLoaded ? (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-white"></div>
              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Iniciando sistemas...</p>
            </div>
          ) : (
            <div className="w-full max-w-sm space-y-4">
              <Button onClick={() => setScreen(ScreenState.CREATE_ROOM)}>Criar Sala</Button>
              <Button onClick={() => setScreen(ScreenState.PUBLIC_ROOMS)}>Salas Públicas</Button>
              <Button onClick={() => setScreen(ScreenState.JOIN_CODE)}>Código Privado</Button>
              <div className="w-full mt-6 bg-white/10 backdrop-blur-md rounded-[2rem] p-6 border border-white/20 shadow-xl relative">
                <h3 className="text-white font-black text-xs uppercase mb-4 italic tracking-widest text-center flex items-center justify-center gap-2">🏆 Hall da Fama</h3>
                <div className="space-y-3">
                  {rankings.length === 0 ? (
                    <p className="text-white/40 text-[10px] italic">Sem recordes ainda...</p>
                  ) : rankings.slice(0, 3).map((r, i) => (
                    <div key={r.nick + i} className="flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5 group hover:bg-black/30 transition">
                      <span className="text-white font-black text-xs truncate mr-2">{i+1}. {r.nick}</span>
                      <div className="text-right">
                        <span className="text-yellow-400 font-mono text-[10px] font-black block leading-none">{r.bestTimeStr}</span>
                        <span className="text-white/40 font-black text-[7px] uppercase tracking-tighter">{r.totalWins} Vitórias</span>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => { setScreen(ScreenState.RANKING); refreshRankings(); }} className="w-full text-white/40 text-[10px] uppercase font-black mt-2 hover:text-white transition">Ver Ranking Completo</button>
                </div>
              </div>
              <div className="pt-8 pb-4 flex justify-center">
                <span className="bg-white/5 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">v1.0.01/2026</span>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === ScreenState.PUBLIC_ROOMS && (
        <div className="w-full max-w-sm flex flex-col h-full animate-in slide-in-from-right duration-500">
          <Button variant="back" onClick={() => setScreen(ScreenState.HOME)}>← Menu</Button>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar mt-4">
            {publicRooms.length === 0 ? (
              <div className="text-center py-20 bg-black/10 rounded-[2rem] border border-dashed border-white/10">
                <p className="text-white opacity-40 italic font-black uppercase text-xs">Nenhuma sala ativa no momento.</p>
              </div>
            ) : publicRooms.map(r => (
              <div key={r.code} onClick={async () => {
                const n = nick || prompt("Seu Nick:");
                if(!n) return;
                setNick(n);
                setIsActionInProgress(true);
                const res = await joinRoom(r.code, n, wikiData!);
                if(res.success) { setRoomCode(r.code); setPlayerId(res.playerId!); setScreen(ScreenState.LOBBY); }
                else showNotification(res.message || "Erro", "error");
                setIsActionInProgress(false);
              }} className={`${darkMode ? 'bg-[#1a1b26]' : 'bg-white'} p-6 rounded-[2rem] border-l-[12px] border-[#ffd700] cursor-pointer hover:scale-[1.03] active:scale-95 transition-all shadow-xl group`}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`font-black text-xl italic ${darkMode ? 'text-white' : 'text-gray-800'} truncate`}>{r.name}</span>
                  <span className="text-[10px] font-black uppercase text-gray-400">👤 {Object.keys(r.players || {}).length}/{r.maxPlayers}</span>
                </div>
                <div className="text-[9px] font-black uppercase text-[#ffd700] tracking-widest flex items-center gap-2">
                  <span className="animate-pulse">●</span> Aguardando
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === ScreenState.LOBBY && (
        <div className="w-full max-w-sm bg-black/40 backdrop-blur-xl p-8 rounded-[2.5rem] text-center border border-white/10 shadow-2xl animate-in zoom-in duration-500">
          <h2 className="text-2xl font-black text-white italic mb-6 uppercase truncate">{currentRoom?.name || "SALA"}</h2>
          <div className="bg-black/30 py-5 rounded-[1.5rem] mb-6 border border-white/5 group">
            <span className="text-[9px] text-white/40 font-black uppercase block mb-1 tracking-widest group-hover:text-[#ffd700] transition">CÓDIGO</span>
            <span className="text-4xl text-[#ffd700] font-black tracking-[0.2em]">{roomCode}</span>
          </div>
          <div className="bg-black/20 p-5 rounded-[1.5rem] mb-8 space-y-2 text-left max-h-56 overflow-y-auto custom-scrollbar border border-white/5">
            {currentRoom && (Object.values(currentRoom.players || {}) as Player[]).map(p => (
              <div key={p.id} className="flex justify-between items-center text-white py-3 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded-xl transition">
                <span className="text-sm font-black flex items-center gap-2 truncate max-w-[150px]">
                  {p.isOwner ? "👑" : "👤"} {p.nick} {p.id === playerId && <span className="text-[7px] bg-[#ffd700] text-black px-1.5 py-0.5 rounded-full font-black uppercase">Você</span>}
                </span>
                <span className="text-[8px] opacity-20 font-black italic">PRONTO</span>
              </div>
            ))}
          </div>
          {currentRoom?.ownerId === playerId ? (
            <Button onClick={() => startGame(roomCode)} className="bg-green-600 border-none text-white hover:bg-green-500 shadow-xl font-black py-4 uppercase tracking-widest">INICIAR!</Button>
          ) : (
            <p className="text-[#ffd700] animate-pulse font-black uppercase text-[10px] tracking-widest">Aguardando líder iniciar...</p>
          )}
          <Button variant="danger" onClick={handleBackToHome} className="mt-4 opacity-50 text-[10px] font-black uppercase py-2 hover:opacity-100">Sair da Sala</Button>
        </div>
      )}

      {screen === ScreenState.GAME && (
        <div className={`fixed inset-0 flex flex-col ${darkMode ? 'bg-[#0a0a0a]' : 'bg-white'} z-50 animate-in fade-in duration-500`}>
          <div className={`${darkMode ? 'bg-[#1a1b26] border-white/5' : 'bg-white border-black/5'} p-3 flex items-center justify-between border-b shadow-lg z-10 transition-colors`}>
            <div className="flex gap-2">
              <button onClick={handleGoBack} disabled={history.length <= 1} title="Voltar Passo" className={`p-2.5 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm ${darkMode ? 'bg-white/5 text-white disabled:opacity-5' : 'bg-black/5 text-gray-800 disabled:opacity-20'}`}>🔙</button>
              <button onClick={handleBackToHome} title="Sair para Home" className={`p-2.5 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm ${darkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-500'}`}>🏠</button>
            </div>
            <div className="flex-1 px-4 text-center overflow-hidden">
              <span className={`text-[8px] font-black uppercase tracking-[0.2em] block mb-0.5 ${darkMode ? 'text-white/30' : 'text-black/30'}`}>Objetivo</span>
              <h1 className="text-xs font-black italic text-[#ffd700] truncate uppercase tracking-tighter drop-shadow-sm">🎯 {currentRoom?.players?.[playerId]?.targetThemeTitle || currentRoom?.targetThemeTitle}</h1>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} title="Trocar Tema" className={`p-2.5 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm ${darkMode ? 'bg-yellow-400 text-yellow-950' : 'bg-gray-900 text-yellow-400'}`}>{darkMode ? '☀️' : '🌙'}</button>
          </div>
          <div ref={contentRef} className="flex-grow overflow-y-auto p-6 custom-scrollbar scroll-smooth relative pt-4 pb-24" onClick={(e) => {
            const a = (e.target as HTMLElement).closest('a');
            if (a) {
              const h = a.getAttribute('href');
              if (h?.startsWith('/wiki/') && !a.classList.contains('new') && !h.includes('#') && !h.includes(':')) {
                e.preventDefault();
                const slug = decodeURIComponent(h.replace('/wiki/', '')).split('?')[0];
                if (!forbiddenNamespaces.some(ns => slug.startsWith(ns))) {
                  setCurrentSlug(slug); setHistory(p => [...p, slug]); setClickCount(c => c + 1);
                } else {
                  showNotification("Links de sistema são proibidos!", "info");
                }
              } else { e.preventDefault(); }
            }
          }}>
            {isLoadingPage ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/5 backdrop-blur-sm z-20 animate-in fade-in duration-300">
                <div className="h-16 w-16 border-t-4 border-[#ffd700] rounded-full animate-spin shadow-2xl"></div>
                <p className="mt-6 font-black uppercase text-[10px] tracking-widest opacity-40">Processando Dados...</p>
              </div>
            ) : pageError ? (
              <div className="text-center mt-32 p-10 animate-in zoom-in">
                <p className="text-red-500 font-black mb-6 uppercase text-2xl tracking-tighter drop-shadow-sm">{pageError}</p>
                <Button onClick={handleGoBack} className="w-auto px-10 bg-red-500 text-white shadow-xl">VOLTAR UM PASSO</Button>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">
                <h1 className={`text-4xl font-black mb-8 border-b-8 ${darkMode ? 'border-[#ffd700]/20 text-gray-100' : 'border-[#0077be]/20 text-gray-900'} pb-4 italic tracking-tighter flex items-center gap-4`}><span className="opacity-10 text-2xl">#</span> {pageTitleDisplay}</h1>
                <div className={`prose prose-lg wiki-content leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-800'}`} dangerouslySetInnerHTML={{ __html: pageContent }} />
              </div>
            )}
          </div>
          <div className={`fixed bottom-0 left-0 right-0 p-3 z-20 border-t ${darkMode ? 'bg-[#0a0a0a] border-white/5 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]' : 'bg-white border-black/5 shadow-[0_-10px_30px_rgba(0,0,0,0.1)]'} flex justify-between items-center px-6 transition-all`}>
            <div className={`flex flex-col items-start min-w-[80px]`}>
              <span className={`text-[7px] font-black uppercase tracking-widest ${darkMode ? 'text-white/40' : 'text-black/40'}`}>{currentRoom?.winningCriterion === 'time' ? 'Tempo' : 'Cliques'}</span>
              <div className="flex items-center gap-1.5"><span className="text-base">{currentRoom?.winningCriterion === 'time' ? '⏱️' : '🖱️'}</span><span className={`text-sm font-black font-mono ${darkMode ? 'text-white' : 'text-gray-900'}`}>{currentRoom?.winningCriterion === 'time' ? formatTime(elapsedTime) : clickCount}</span></div>
            </div>
            <div className="flex-1 px-4 text-center overflow-hidden"><span className={`text-[7px] font-black uppercase tracking-widest block mb-0.5 ${darkMode ? 'text-white/40' : 'text-black/40'}`}>Localização</span><div className="flex items-center justify-center gap-1"><span className="text-xs">📄</span><span className={`text-[10px] font-black italic truncate max-w-[150px] uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{pageTitleDisplay || 'Navegando...'}</span></div></div>
            <div className="flex flex-col items-end min-w-[80px]"><span className={`text-[7px] font-black uppercase tracking-widest ${darkMode ? 'text-white/40' : 'text-black/40'}`}>Percurso</span><div className="flex items-center gap-1.5"><span className={`text-sm font-black font-mono ${darkMode ? 'text-[#ffd700]' : 'text-[#0077be]'}`}>{history.length}</span><span className="text-base">🏃</span></div></div>
          </div>
          <style>{`.mw-editsection, .reference, .navbox, .infobox, .toc, .mbox-small, .ambox, .reflist, .catlinks, .printfooter { display: none !important; } .wiki-content a { color: ${darkMode ? '#00a8cc' : '#0077be'}; font-weight: 900; text-decoration: none; border-bottom: 2px solid transparent; transition: all 0.2s; position: relative; } .wiki-content a:hover { border-bottom-color: currentColor; background: ${darkMode ? '#00a8cc11' : '#0077be11'}; border-radius: 4px; } .wiki-content img { max-width: 100%; height: auto; border-radius: 1.5rem; margin: 1.5rem 0; box-shadow: 0 10px 40px rgba(0,0,0,0.15); filter: ${darkMode ? 'brightness(0.8) contrast(1.1)' : 'none'}; transition: transform 0.3s; } .wiki-content img:hover { transform: scale(1.02); } .wiki-content p { margin-bottom: 1.5rem; } .wiki-content h2, .wiki-content h3 { font-weight: 900; margin-top: 2rem; margin-bottom: 1rem; font-style: italic; }`}</style>
        </div>
      )}

      {screen === ScreenState.CREATE_ROOM && (
        <div className="w-full max-w-sm flex flex-col items-center animate-in slide-in-from-bottom duration-500">
          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 shadow-2xl w-full">
            <Button variant="back" onClick={() => setScreen(ScreenState.HOME)}>← Voltar</Button>
            <h2 className="text-2xl font-black text-white text-center mb-8 italic uppercase tracking-tighter">Nova Corrida</h2>
            <form onSubmit={async (e) => {
              e.preventDefault(); if (isActionInProgress) return;
              const f = new FormData(e.currentTarget); setIsActionInProgress(true);
              const n = f.get('nick') as string;
              setNick(n);
              try {
                // Tema Individual (formDiff) agora é fixo em false para destino único por sala
                const { roomCode: c, playerId: p } = await createRoom(n, f.get('roomName') as string, formType, formStop, false, formCrit, formMax, wikiData!);
                setRoomCode(c); setPlayerId(p); setScreen(ScreenState.LOBBY);
              } catch (err) { showNotification("Erro ao criar sala.", "error"); }
              setIsActionInProgress(false);
            }} className="space-y-6">
              <div className="space-y-1"><label className="text-[10px] text-white/60 font-black uppercase tracking-widest block pl-2">Seu Nickname</label><Input name="nick" placeholder="Ex: WikiNinja" defaultValue={nick} required maxLength={15} className="rounded-2xl border-none bg-white/5 text-white" /></div>
              <div className="space-y-1"><label className="text-[10px] text-white/60 font-black uppercase tracking-widest block pl-2">Nome da Sala</label><Input name="roomName" placeholder="Ex: Corrida do Ouro" required maxLength={20} className="rounded-2xl border-none bg-white/5 text-white" /></div>
              <div className="space-y-3">
                <div className="flex items-center gap-2"><label className="text-[10px] text-white/60 font-black uppercase tracking-widest">A sala será pública ou privada?</label><button type="button" onClick={() => showNotification("Salas públicas aparecem na lista.", "info")} className="w-5 h-5 rounded-full bg-white/10 text-white text-[10px] flex items-center justify-center hover:bg-white/20 transition">(?)</button></div>
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setFormType('public')} className={`py-3 rounded-2xl font-black text-xs uppercase transition-all border-2 ${formType === 'public' ? 'bg-[#ffd700] text-black border-transparent shadow-lg scale-105' : 'bg-black/20 text-white border-white/5'}`}>Pública (O)</button><button type="button" onClick={() => setFormType('private')} className={`py-3 rounded-2xl font-black text-xs uppercase transition-all border-2 ${formType === 'private' ? 'bg-[#ffd700] text-black border-transparent shadow-lg scale-105' : 'bg-black/20 text-white border-white/5'}`}>Privada (O)</button></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2"><label className="text-[10px] text-white/60 font-black uppercase tracking-widest">Critério de ganho?</label><button type="button" onClick={() => showNotification("Tempo ou cliques.", "info")} className="w-5 h-5 rounded-full bg-white/10 text-white text-[10px] flex items-center justify-center hover:bg-white/20 transition">(?)</button></div>
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setFormCrit('clicks')} className={`py-3 rounded-2xl font-black text-[10px] uppercase transition-all border-2 ${formCrit === 'clicks' ? 'bg-[#ffd700] text-black border-transparent shadow-lg scale-105' : 'bg-black/20 text-white border-white/5'}`}>Cliques (O)</button><button type="button" onClick={() => setFormCrit('time')} className={`py-3 rounded-2xl font-black text-[10px] uppercase transition-all border-2 ${formCrit === 'time' ? 'bg-[#ffd700] text-black border-transparent shadow-lg scale-105' : 'bg-black/20 text-white border-white/5'}`}>Tempo (O)</button></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2"><label className="text-[10px] text-white/60 font-black uppercase tracking-widest">Alguém chegar para todos?</label><button type="button" onClick={() => showNotification("Finalizar no primeiro vencedor.", "info")} className="w-5 h-5 rounded-full bg-white/10 text-white text-[10px] flex items-center justify-center hover:bg-white/20 transition">(?)</button></div>
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setFormStop(true)} className={`py-3 rounded-2xl font-black text-xs uppercase transition-all border-2 ${formStop === true ? 'bg-[#ffd700] text-black border-transparent shadow-lg scale-105' : 'bg-black/20 text-white border-white/5'}`}>Sim (O)</button><button type="button" onClick={() => setFormStop(false)} className={`py-3 rounded-2xl font-black text-xs uppercase transition-all border-2 ${formStop === false ? 'bg-[#ffd700] text-black border-transparent shadow-lg scale-105' : 'bg-black/20 text-white border-white/5'}`}>Não (O)</button></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] text-white/60 font-black uppercase tracking-widest block pl-2">Jogadores (2-10)</label><input name="max" type="number" value={formMax} onChange={(e) => setFormMax(Math.max(2, Math.min(10, parseInt(e.target.value) || 2)))} className="w-full py-4 bg-black/20 text-white rounded-2xl border-none font-black text-center text-xl outline-none" /></div>
              <Button type="submit" disabled={isActionInProgress} className="mt-4 uppercase font-black h-16">{isActionInProgress ? "LANÇANDO..." : "CRIAR SALA"}</Button>
            </form>
          </div>
        </div>
      )}

      {screen === ScreenState.JOIN_CODE && (
        <div className="w-full max-w-sm bg-black/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl animate-in zoom-in duration-500">
          <Button variant="back" onClick={() => setScreen(ScreenState.HOME)}>← Voltar</Button>
          <h2 className="text-2xl font-black text-white text-center mb-6 italic uppercase tracking-widest">Acesso Direto</h2>
          <form onSubmit={async (e) => {
            e.preventDefault(); if (isActionInProgress) return;
            const f = new FormData(e.currentTarget); const c = (f.get('code') as string).trim(); const n = (f.get('nick') as string).trim();
            if (c.length !== 5) return showNotification("Código inválido.", "info");
            setIsActionInProgress(true);
            setNick(n);
            const res = await joinRoom(c, n, wikiData!);
            if(res.success) { setRoomCode(c); setPlayerId(res.playerId!); setScreen(ScreenState.LOBBY); }
            else showNotification(res.message || "Erro", "error");
            setIsActionInProgress(false);
          }} className="space-y-6">
            <Input name="code" placeholder="_____" required maxLength={5} className="text-center tracking-[0.5em] text-3xl font-black bg-black/30 text-[#ffd700] rounded-2xl border-white/10 py-6" />
            <Input name="nick" placeholder="Seu Nick" defaultValue={nick} required maxLength={15} className="rounded-2xl border-none bg-black/20 text-white" />
            <Button type="submit" className="uppercase font-black h-16">ENTRAR</Button>
          </form>
        </div>
      )}

      {screen === ScreenState.RANKING && (
        <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-4 border-black/5 w-full max-w-sm animate-in fade-in duration-500">
          <Button variant="back" onClick={() => setScreen(ScreenState.HOME)}>← Voltar</Button>
          <h2 className="text-3xl font-black text-center mb-8 italic uppercase text-[#0077be] tracking-tighter">Hall das Lendas</h2>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
            {rankings.map((r, i) => (
              <div key={r.nick + i} className="flex justify-between items-center p-5 bg-gray-50 rounded-[1.8rem] border-2 border-gray-100 group hover:border-[#ffd700] transition">
                <div className="flex items-center gap-4"><span className={`w-8 h-8 flex items-center justify-center rounded-full font-black text-xs ${i === 0 ? 'bg-yellow-400 text-yellow-950' : 'bg-gray-200 text-gray-400'}`}>{i+1}</span><div className="flex flex-col"><span className="font-black text-sm text-gray-800 italic truncate max-w-[120px]">{r.nick}</span><span className="text-[7px] font-black uppercase text-gray-400">{r.totalWins} Vitórias</span></div></div>
                <div className="text-right"><span className="text-[#0077be] font-mono text-sm font-black block">{r.bestTimeStr}</span><span className="text-[7px] font-black uppercase text-gray-400">{r.fewestClicks} Cliques</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === ScreenState.RESULT && (
        <div className="w-full max-w-sm bg-white p-10 rounded-[3rem] text-center border-[12px] border-[#ffd700] shadow-2xl animate-in zoom-in duration-700">
          <h2 className="text-4xl font-black text-[#0077be] mb-8 italic uppercase tracking-tighter">Resultados 🏁</h2>
          <div className="space-y-4 mb-10 text-left max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
            {(Object.values(currentRoom?.players || {}) as Player[]).sort((a,b) => {
              if (currentRoom?.winningCriterion === 'clicks') return (a.clicks || 999) - (b.clicks || 999);
              return (a.timeMs || 9e12) - (b.timeMs || 9e12);
            }).map((p, i) => (
              <div key={p.id} className={`flex justify-between items-center p-5 rounded-[1.5rem] border-2 transition-all ${i === 0 ? 'bg-yellow-400/10 border-[#ffd700] scale-[1.05]' : 'bg-gray-50 border-gray-100 opacity-70'}`}>
                <div className="max-w-[180px]"><span className={`font-black text-sm uppercase italic block truncate ${i === 0 ? 'text-yellow-600' : 'text-gray-700'}`}>{i+1}. {p.nick} {i === 0 && "🏆"}</span><div className="text-[8px] font-black opacity-40 uppercase tracking-widest">{p.clicks} CLIQUES</div></div>
                <span className="font-mono text-xl font-black text-[#0077be] shrink-0">{p.timeStr || "---"}</span>
              </div>
            ))}
          </div>
          <Button onClick={handleBackToHome} className="uppercase font-black bg-[#ffd700] text-gray-900 border-none py-4 tracking-widest">VOLTAR AO INÍCIO</Button>
        </div>
      )}
    </div>
  );
};

export default App;
