import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Users, Power, Copy, Shuffle, Settings, Play, BookOpen, Eye, Trash2 } from 'lucide-react';
import Modal from './Modal';
import type { ModalType } from './Modal';
import TeacherPromptComposer from './TeacherPromptComposer';
import TeacherPromptBank from './TeacherPromptBank';
import TeacherDistributionGraph from './TeacherDistributionGraph';

interface AuthData {
    name: string | null;
    email: string | null;
    role: string | null;
}

interface TeacherViewProps {
    auth: AuthData;
}

interface Participant {
    socketId: string;
    name: string;
    hasSubmitted: boolean;
}

interface SavedPrompt {
    id: string;
    content: string;
    type: 'TEXT' | 'MC' | 'SCALE';
    options?: string[];
}

interface Thought {
    id: string;
    content: string;
    authorName: string;
}

interface DistributionItem {
    studentName: string;
    thoughtContent: string;
    originalAuthorName: string;
}

export default function TeacherView({ auth }: TeacherViewProps) {
    const [isActive, setIsActive] = useState(false);
    const [joinCode, setJoinCode] = useState('');

    // Prompt Composer State
    const [promptInput, setPromptInput] = useState('');
    const [promptType, setPromptType] = useState<'TEXT' | 'MC' | 'SCALE'>('TEXT');
    const [mcOptions, setMcOptions] = useState<string[]>(['', '']);

    const [promptSent, setPromptSent] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [submissionCount, setSubmissionCount] = useState(0);
    const [swapComplete, setSwapComplete] = useState(false);
    const [liveThoughts, setLiveThoughts] = useState<Thought[]>([]);
    const [maxSwapRequests, setMaxSwapRequests] = useState(1);
    const [distribution, setDistribution] = useState<Record<string, DistributionItem>>({});

    // Prompt Bank State
    const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
    const [showBank, setShowBank] = useState(false);

    // Previous Sessions State
    const [previousSessions, setPreviousSessions] = useState<any[]>([]);
    const [showPreviousSessions, setShowPreviousSessions] = useState(false);

    // Modal State
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: ModalType;
        title: string;
        message: string;
        children?: React.ReactNode;
        onConfirm?: () => void;
        isDestructive?: boolean;
    }>({
        isOpen: false,
        type: 'info',
        title: '',
        message: ''
    });

    useEffect(() => {
        const storedJoinCode = localStorage.getItem('thoughtswap_joinCode');
        const storedIsTeacherActive = localStorage.getItem('thoughtswap_teacher_active');

        if (storedJoinCode && storedIsTeacherActive === 'true' && !isActive) {
            if (!socket.auth) socket.auth = { name: auth.name, role: auth.role, email: auth.email };
            if (!socket.connected) socket.connect();
            socket.emit('TEACHER_REJOIN', { joinCode: storedJoinCode });
        }
    }, [auth, isActive]);

    useEffect(() => {
        if (!socket.auth) socket.auth = { name: auth.name, role: auth.role, email: auth.email };
        if (!socket.connected) socket.connect();

        socket.emit('GET_SAVED_PROMPTS');

        socket.on('CLASS_STARTED', (data) => {
            setIsActive(true);
            setJoinCode(data.joinCode);
            setMaxSwapRequests(data.maxSwapRequests || 1);
            localStorage.setItem('thoughtswap_joinCode', data.joinCode);
            localStorage.setItem('thoughtswap_teacher_active', 'true');
        });

        socket.on('PARTICIPANTS_UPDATE', (data) => {
            setParticipants(data.participants);
            setSubmissionCount(data.submissionCount);
        });

        socket.on('THOUGHTS_UPDATE', (data) => {
            setLiveThoughts(data);
            if (data.length > 0 && !promptSent) setPromptSent(true);
        });

        socket.on('DISTRIBUTION_UPDATE', (data) => setDistribution(data));

        socket.on('SWAP_COMPLETED', () => {
            setSwapComplete(true);
            showModal('success', 'Swap Successful', 'Thoughts have been distributed.');
        });

        socket.on('SAVED_PROMPTS_LIST', (data) => setSavedPrompts(data));

        socket.on('PREVIOUS_SESSIONS', (data) => setPreviousSessions(data));

        socket.on('ERROR', (data) => {
            showModal('error', 'Error', data.message);
            if (data.message.includes('ended') || data.message.includes('Invalid')) {
                localStorage.removeItem('thoughtswap_joinCode');
                localStorage.removeItem('thoughtswap_teacher_active');
                setIsActive(false);
            }
        });

        // Fetch previous sessions on mount
        socket.emit('GET_PREVIOUS_SESSIONS');

        return () => {
            socket.off('CLASS_STARTED');
            socket.off('PARTICIPANTS_UPDATE');
            socket.off('THOUGHTS_UPDATE');
            socket.off('DISTRIBUTION_UPDATE');
            socket.off('SWAP_COMPLETED');
            socket.off('SAVED_PROMPTS_LIST');
            socket.off('PREVIOUS_SESSIONS');
            socket.off('ERROR');
        };
    }, [auth]);

    const showModal = (type: ModalType, title: string, message: string, onConfirm?: () => void, children?: React.ReactNode, isDestructive?: boolean) => {
        setModal({ isOpen: true, type, title, message, onConfirm, children, isDestructive });
    };

    const getPromptData = () => ({
        content: promptInput,
        type: promptType,
        options: promptType === 'MC' ? mcOptions.filter(o => o.trim().length > 0) : undefined
    });

    const validatePrompt = () => {
        if (!promptInput.trim()) return false;
        if (promptType === 'MC' && mcOptions.filter(o => o.trim().length > 0).length < 2) return false;
        return true;
    };

    const handleSendPrompt = () => {
        if (!validatePrompt()) return showModal('error', 'Invalid Prompt', 'Please enter text and at least 2 options for MC.');
        socket.emit('TEACHER_SEND_PROMPT', { joinCode, ...getPromptData() });
        setPromptSent(true);
        setSwapComplete(false);
        setDistribution({});
    };

    const handleSaveToBank = (data?: any) => {
        const payload = data || getPromptData();
        if (!payload.content.trim()) return showModal('error', 'Invalid Prompt', 'Prompt content is required.');
        socket.emit('SAVE_PROMPT', payload);
        if (!data) showModal('success', 'Saved', 'Prompt saved to your bank!');
    };

    const handleLoadPrompt = (prompt: SavedPrompt) => {
        setPromptInput(prompt.content);
        setPromptType(prompt.type);
        setMcOptions(prompt.options || ['', '']);
        setShowBank(false);
    };

    const handleDeletePrompt = (id: string) => {
        socket.emit('DELETE_SAVED_PROMPT', { id });
    };

    // Modified reset handler to notify server
    const handleReset = () => {
        if (joinCode) {
            socket.emit('TEACHER_RESET_STATE', { joinCode });
        }
        setPromptSent(false); setPromptInput(''); setSubmissionCount(0);
        setSwapComplete(false); setLiveThoughts([]); setDistribution({});
        setPromptType('TEXT'); setMcOptions(['', '']);
    };

    const endSession = () => {
        showModal('confirm', 'End Session', 'End the session? All students will be disconnected.', () => {
            socket.emit('END_SESSION', { joinCode });
            setIsActive(false); setJoinCode(''); setParticipants([]);

            // Clean local state properly
            setPromptSent(false); setPromptInput(''); setSubmissionCount(0);
            setSwapComplete(false); setLiveThoughts([]); setDistribution({});
            setPromptType('TEXT'); setMcOptions(['', '']);

            localStorage.removeItem('thoughtswap_joinCode');
            localStorage.removeItem('thoughtswap_teacher_active');

            setTimeout(() => {
                showModal('info', 'Session Ended', '', undefined, (
                    <div className="text-center">
                        <p className="mb-4">Please complete the post-session survey:</p>
                        <a href="https://jmu.qualtrics.com/jfe/form/SV_dummy_survey_id" target="_blank" rel="noopener noreferrer" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700">Take Survey</a>
                    </div>
                ));
            }, 500);
        }, undefined, true);
    };

    const copyCode = () => {
        navigator.clipboard.writeText(joinCode);
        showModal('success', 'Copied!', 'Room code copied.');
    };

    // --- IDLE STATE ---
    if (!isActive) {
        return (
            <div className="flex flex-col min-h-[calc(100vh-100px)] p-4">
                <TeacherPromptBank
                    isOpen={showBank} onClose={() => setShowBank(false)}
                    savedPrompts={savedPrompts} onLoad={handleLoadPrompt} onDelete={handleDeletePrompt}
                    isIdle={true} onSaveNew={handleSaveToBank}
                />
                <Modal {...modal} onClose={() => setModal({ ...modal, isOpen: false })} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                    <div className="lg:col-span-2 flex items-center justify-center">
                        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-xl text-center w-full border border-gray-100">
                            <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Play className="w-8 h-8 text-indigo-600 ml-1" />
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Start a New Class</h2>
                            <p className="text-gray-600 mb-8">Create a temporary room for your students.</p>

                            {/* Staged Prompt Preview */}
                            {promptInput && (
                                <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-left relative group w-full">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded text-white ${promptType === 'MC' ? 'bg-purple-500' : promptType === 'SCALE' ? 'bg-orange-500' : 'bg-blue-500'}`}>{promptType}</span>
                                                <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Staged</p>
                                            </div>
                                            <p className="text-gray-800 font-medium truncate">{promptInput}</p>
                                            {promptType === 'MC' && <p className="text-xs text-gray-500">{mcOptions.filter(o => o).length} Options</p>}
                                        </div>
                                        <button onClick={() => { setPromptInput(''); setPromptType('TEXT'); setMcOptions(['', '']); }} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <button onClick={() => socket.emit('TEACHER_START_CLASS')} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-lg shadow-lg transition transform hover:scale-105">
                                    Launch Session
                                </button>
                                <button onClick={() => setShowBank(true)} className="w-full py-3 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition flex items-center justify-center">
                                    <BookOpen className="w-5 h-5 mr-2" /> Manage Prompt Bank
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Previous Sessions Sidebar */}
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 h-fit">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Previous Sessions</h3>
                            {previousSessions.length > 0 && (
                                <button 
                                    onClick={() => setShowPreviousSessions(!showPreviousSessions)}
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded transition"
                                >
                                    {showPreviousSessions ? 'Hide' : 'Show'} ({previousSessions.length})
                                </button>
                            )}
                        </div>

                        {previousSessions.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">No previous sessions yet</p>
                        ) : showPreviousSessions ? (
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {previousSessions.map((session: any) => (
                                    <div key={session.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate">{session.title}</p>
                                                <p className="text-xs text-gray-500">{session.promptCount} prompts • {session.swapCount} swaps</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    // --- ACTIVE DASHBOARD ---
    return (
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-20 relative px-4 sm:px-0">
            <TeacherPromptBank
                isOpen={showBank} onClose={() => setShowBank(false)}
                savedPrompts={savedPrompts} onLoad={handleLoadPrompt} onDelete={handleDeletePrompt}
            />
            <Modal {...modal} onClose={() => setModal({ ...modal, isOpen: false })} />

            {/* Header Stats */}
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-4 w-full sm:w-auto">
                    <div className="bg-green-100 p-3 rounded-lg flex-shrink-0">
                        <Users className="w-6 h-6 text-green-700" />
                    </div>
                    <div>
                        <h2 className="text-xs text-gray-500 font-bold uppercase tracking-wide">Room Code</h2>
                        <div className="flex items-center space-x-2 cursor-pointer group" onClick={copyCode}>
                            <span className="text-3xl sm:text-4xl font-mono font-bold text-gray-900">{joinCode}</span>
                            <Copy className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition" />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto sm:space-x-6">
                    <div className="flex gap-6">
                        <div className="text-right px-2 sm:px-6 sm:border-r border-gray-200">
                            <p className="text-xs text-gray-500 uppercase font-bold">Students</p>
                            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{participants.length}</p>
                        </div>
                        <div className="text-right pr-2 sm:pr-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Submitted</p>
                            <p className="text-2xl sm:text-3xl font-bold text-indigo-600">{submissionCount}</p>
                        </div>
                    </div>
                    <button onClick={endSession} className="ml-4 px-3 sm:px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition flex items-center text-sm font-bold">
                        <Power className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">End Class</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <TeacherPromptComposer
                        promptInput={promptInput} setPromptInput={setPromptInput}
                        promptType={promptType} setPromptType={setPromptType}
                        mcOptions={mcOptions} setMcOptions={setMcOptions}
                        promptSent={promptSent}
                        onSend={handleSendPrompt} onSave={() => handleSaveToBank()}
                        onOpenBank={() => setShowBank(true)} onReset={handleReset}
                    />

                    <div className={`p-4 sm:p-6 rounded-xl shadow-lg border-t-4 transition duration-300 ${submissionCount > 0 && !swapComplete ? 'bg-white border-green-500 opacity-100' : 'bg-gray-50 border-gray-300 opacity-80'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                                <Shuffle className="w-5 h-5 mr-2 text-green-600" />
                                Step 2: The Swap
                            </h3>
                            <div className="flex items-center space-x-2 text-sm bg-gray-100 p-2 rounded-lg">
                                <Settings className="w-4 h-4 text-gray-500" />
                                <span className="text-gray-600 hidden sm:inline">Max Requests:</span>
                                <input type="number" min="0" max="5" value={maxSwapRequests} onChange={(e) => {
                                    setMaxSwapRequests(parseInt(e.target.value));
                                    socket.emit('UPDATE_SESSION_SETTINGS', { joinCode, maxSwapRequests: parseInt(e.target.value) });
                                }} className="w-10 sm:w-12 border rounded px-1 text-center" />
                            </div>
                        </div>
                        <p className="text-gray-600 mb-6 text-sm sm:text-base">Once enough students have submitted, initiate the swap.</p>
                        <button onClick={() => socket.emit('TRIGGER_SWAP', { joinCode })} disabled={submissionCount < 2 || swapComplete} className={`w-full py-3 sm:py-4 text-white font-bold rounded-xl text-lg shadow-md transition flex items-center justify-center ${submissionCount >= 2 && !swapComplete ? 'bg-green-600 hover:bg-green-700 transform hover:scale-[1.02]' : 'bg-gray-300 cursor-not-allowed'}`}>
                            <Shuffle className="w-6 h-6 mr-2" /> {swapComplete ? 'Swap Completed' : `Swap Thoughts (${submissionCount})`}
                        </button>
                    </div>

                    <TeacherDistributionGraph distribution={distribution} joinCode={joinCode} />

                    {promptSent && (
                        <div className="bg-white rounded-xl shadow-lg border-t-4 border-indigo-400 p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                                    <Eye className="w-5 h-5 mr-2 text-indigo-600" /> Live Thoughts ({liveThoughts.length})
                                </h3>
                            </div>
                            <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-100 rounded-lg p-2 bg-gray-50">
                                {liveThoughts.length === 0 ? <p className="text-gray-400 text-center text-sm py-4 italic">Waiting for submissions...</p> :
                                    liveThoughts.map((t) => (
                                        <div key={t.id} className="bg-white p-3 rounded-md shadow-sm border border-gray-200 flex justify-between items-start group">
                                            <div><p className="text-gray-800 text-sm">{t.content}</p><p className="text-xs text-gray-400 mt-1">{t.authorName}</p></div>
                                            <button onClick={() => showModal('confirm', 'Delete Thought', 'Delete this thought?', () => socket.emit('TEACHER_DELETE_THOUGHT', { joinCode, thoughtId: t.id }), undefined, true)} className="text-red-300 hover:text-red-500 p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-[400px] lg:h-[600px] border border-gray-200">
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <h3 className="font-bold text-gray-700 flex items-center"><Users className="w-5 h-5 mr-2 text-gray-500" /> Class Roster</h3>
                    </div>
                    <div className="overflow-y-auto flex-1 p-4 space-y-2">
                        {participants.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-gray-400 italic"><Users className="w-8 h-8 mb-2 opacity-20" /><p>Waiting for students...</p></div> :
                            participants.map((p) => (
                                <div key={p.socketId} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                                    <div className="flex items-center"><div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mr-3">{p.name.charAt(0).toUpperCase()}</div><span className="font-medium text-gray-700 truncate max-w-[100px] sm:max-w-none">{p.name}</span></div>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Online</span>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
}