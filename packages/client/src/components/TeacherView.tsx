import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Users, Send, Shuffle, Power, Copy, CheckCircle, Play, RefreshCw, BookOpen, Save, Trash2, HelpCircle, Eye, Settings, Plus } from 'lucide-react';
import Modal from './Modal';
import type { ModalType } from './Modal';

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
}

interface Thought {
    id: string;
    content: string;
    authorName: string;
}

export default function TeacherView({ auth }: TeacherViewProps) {
    const [isActive, setIsActive] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [promptInput, setPromptInput] = useState('');
    const [promptSent, setPromptSent] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [submissionCount, setSubmissionCount] = useState(0);
    const [swapComplete, setSwapComplete] = useState(false);
    const [liveThoughts, setLiveThoughts] = useState<Thought[]>([]);
    const [maxSwapRequests, setMaxSwapRequests] = useState(1);

    // Prompt Bank State
    const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
    const [showBank, setShowBank] = useState(false);

    // Modal State
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: ModalType;
        title: string;
        message: string;
        onConfirm?: () => void;
    }>({
        isOpen: false,
        type: 'info',
        title: '',
        message: ''
    });

    // 1. Persistence Check on Mount
    useEffect(() => {
        const storedJoinCode = localStorage.getItem('thoughtswap_joinCode');
        const storedIsTeacherActive = localStorage.getItem('thoughtswap_teacher_active');

        if (storedJoinCode && storedIsTeacherActive === 'true' && !isActive && !socket.connected) {
            socket.auth = {
                name: auth.name,
                role: auth.role,
                email: auth.email
            };
            socket.connect();
            // Try to rejoin as teacher
            socket.emit('TEACHER_REJOIN', { joinCode: storedJoinCode });
        }
    }, [auth, isActive]);

    useEffect(() => {
        if (!socket.auth) {
            socket.auth = {
                name: auth.name,
                role: auth.role,
                email: auth.email
            };
        }

        if (!socket.connected) {
            socket.connect();
        }

        socket.emit('GET_SAVED_PROMPTS');

        socket.on('CLASS_STARTED', (data: { joinCode: string, maxSwapRequests: number }) => {
            setIsActive(true);
            setJoinCode(data.joinCode);
            setMaxSwapRequests(data.maxSwapRequests || 1);

            // Persist
            localStorage.setItem('thoughtswap_joinCode', data.joinCode);
            localStorage.setItem('thoughtswap_teacher_active', 'true');
        });

        socket.on('PARTICIPANTS_UPDATE', (data: { participants: Participant[], submissionCount: number }) => {
            setParticipants(data.participants);
            setSubmissionCount(data.submissionCount);
        });

        socket.on('THOUGHTS_UPDATE', (data: Thought[]) => {
            setLiveThoughts(data);
            if (data.length > 0 && !promptSent) {
                // If we are recovering state and see thoughts, assume prompt was sent
                setPromptSent(true);
            }
        });

        socket.on('SWAP_COMPLETED', () => {
            setSwapComplete(true);
            showModal('success', 'Swap Successful', 'Thoughts have been distributed to students for discussion.');
        });

        socket.on('SAVED_PROMPTS_LIST', (data: SavedPrompt[]) => {
            setSavedPrompts(data);
        });

        socket.on('ERROR', (data) => {
            showModal('error', 'Error', data.message);
            if (data.message.includes('ended') || data.message.includes('Invalid')) {
                // Clear persistence if session is gone
                localStorage.removeItem('thoughtswap_joinCode');
                localStorage.removeItem('thoughtswap_teacher_active');
                setIsActive(false);
            }
        });

        return () => {
            socket.off('CLASS_STARTED');
            socket.off('PARTICIPANTS_UPDATE');
            socket.off('THOUGHTS_UPDATE');
            socket.off('SWAP_COMPLETED');
            socket.off('SAVED_PROMPTS_LIST');
            socket.off('ERROR');
        };
    }, [auth]);

    const showModal = (type: ModalType, title: string, message: string, onConfirm?: () => void) => {
        setModal({ isOpen: true, type, title, message, onConfirm });
    };

    const startClass = () => {
        socket.emit('TEACHER_START_CLASS');
    };

    const sendPrompt = () => {
        if (!promptInput.trim()) return;
        socket.emit('TEACHER_SEND_PROMPT', { joinCode, content: promptInput });
        setPromptSent(true);
        setSwapComplete(false);
    };

    const saveToBank = () => {
        if (!promptInput.trim()) return;
        socket.emit('SAVE_PROMPT', { content: promptInput });
        showModal('success', 'Saved', 'Prompt saved to your bank!');
    };

    const deleteFromBank = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Delete this prompt?")) { // Keeping native confirm for simple list action
            socket.emit('DELETE_SAVED_PROMPT', { id });
        }
    };

    const loadPrompt = (content: string) => {
        setPromptInput(content);
        setShowBank(false);
    };

    const triggerSwap = () => {
        socket.emit('TRIGGER_SWAP', { joinCode });
    };

    const updateMaxSwaps = (val: number) => {
        setMaxSwapRequests(val);
        socket.emit('UPDATE_SESSION_SETTINGS', { joinCode, maxSwapRequests: val });
    };

    const deleteThought = (thoughtId: string) => {
        showModal('confirm', 'Delete Thought', 'Are you sure you want to delete this thought? It will be removed from the session.', () => {
            socket.emit('TEACHER_DELETE_THOUGHT', { joinCode, thoughtId });
        });
    };

    const endSession = () => {
        showModal('confirm', 'End Session', 'Are you sure you want to end the session? All students will be disconnected.', () => {
            socket.emit('END_SESSION', { joinCode });
            setIsActive(false);
            setJoinCode('');
            setParticipants([]);
            setPromptSent(false);
            setPromptInput('');
            setSwapComplete(false);
            setSubmissionCount(0);
            setLiveThoughts([]);

            // Clear persistence
            localStorage.removeItem('thoughtswap_joinCode');
            localStorage.removeItem('thoughtswap_teacher_active');
        });
    };

    const copyCode = () => {
        navigator.clipboard.writeText(joinCode);
        showModal('success', 'Copied!', 'Room code copied to clipboard.');
    };

    const renderBankModal = () => {
        if (!showBank) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-700 flex items-center">
                            <BookOpen className="w-5 h-5 mr-2 text-indigo-600" /> Prompt Bank
                        </h3>
                        <button onClick={() => setShowBank(false)} className="text-gray-400 hover:text-gray-600">
                            <Settings className="w-0 h-0" />
                            <Trash2 className="w-0 h-0" /> {/* Hidden trigger for icon load */}
                            Close
                        </button>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 space-y-2">

                        {/* CRUD Creation inside modal if inactive */}
                        {!isActive && (
                            <div className="mb-4 flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Create new prompt..."
                                    className="flex-1 border p-2 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            socket.emit('SAVE_PROMPT', { content: e.currentTarget.value });
                                            e.currentTarget.value = '';
                                        }
                                    }}
                                />
                            </div>
                        )}

                        {savedPrompts.length === 0 ? (
                            <p className="text-center text-gray-400 italic py-10">No saved prompts yet.</p>
                        ) : (
                            savedPrompts.map(p => (
                                <div key={p.id} className="p-3 border border-gray-200 rounded-lg hover:bg-indigo-50 cursor-pointer transition group flex justify-between items-center"
                                    onClick={() => loadPrompt(p.content)}>
                                    <p className="text-gray-800 text-sm flex-1">{p.content}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-indigo-600 hidden group-hover:inline-block font-bold">Load</span>
                                        <button
                                            onClick={(e) => deleteFromBank(p.id, e)}
                                            className="p-1 text-red-300 hover:text-red-500 rounded hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- IDLE STATE ---
    if (!isActive) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
                {renderBankModal()}
                <Modal
                    isOpen={modal.isOpen}
                    onClose={() => setModal({ ...modal, isOpen: false })}
                    title={modal.title}
                    message={modal.message}
                    type={modal.type}
                    onConfirm={modal.onConfirm}
                />

                <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-lg w-full border border-gray-100">
                    <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Play className="w-8 h-8 text-indigo-600 ml-1" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-800 mb-2">Start a New Class</h2>
                    <p className="text-gray-600 mb-8">Create a temporary room for your students.</p>

                    {/* Display Loaded Prompt Feedback */}
                    {promptInput && (
                        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-left relative group">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Staged Prompt</p>
                                    <p className="text-gray-800 font-medium">{promptInput}</p>
                                </div>
                                <button
                                    onClick={() => setPromptInput('')}
                                    className="text-gray-400 hover:text-red-500 transition p-1"
                                    title="Clear"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={startClass}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-lg shadow-lg transition transform hover:scale-105 mb-4"
                    >
                        Launch Session
                    </button>

                    <button
                        onClick={() => setShowBank(true)}
                        className="w-full py-3 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition flex items-center justify-center"
                    >
                        <BookOpen className="w-5 h-5 mr-2" /> Manage Prompt Bank
                    </button>
                </div>
            </div>
        );
    }

    // --- ACTIVE DASHBOARD ---
    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20 relative">
            {renderBankModal()}
            <Modal
                isOpen={modal.isOpen}
                onClose={() => setModal({ ...modal, isOpen: false })}
                title={modal.title}
                message={modal.message}
                type={modal.type}
                onConfirm={modal.onConfirm}
            />

            {/* Header Stats */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-center">
                <div className="flex items-center space-x-4 mb-4 sm:mb-0">
                    <div className="bg-green-100 p-3 rounded-lg">
                        <Users className="w-6 h-6 text-green-700" />
                    </div>
                    <div>
                        <h2 className="text-xs text-gray-500 font-bold uppercase tracking-wide">Room Code</h2>
                        <div className="flex items-center space-x-2 cursor-pointer group" onClick={copyCode}>
                            <span className="text-4xl font-mono font-bold text-gray-900">{joinCode}</span>
                            <Copy className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition" />
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-6">
                    <div className="text-right px-6 border-r border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold">Students</p>
                        <p className="text-3xl font-bold text-gray-900">{participants.length}</p>
                    </div>
                    <div className="text-right pr-4">
                        <p className="text-xs text-gray-500 uppercase font-bold">Submitted</p>
                        <p className="text-3xl font-bold text-indigo-600">{submissionCount}</p>
                    </div>
                    <button
                        onClick={endSession}
                        className="ml-4 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition flex items-center text-sm font-bold"
                    >
                        <Power className="w-4 h-4 mr-2" /> End Class
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls */}
                <div className="lg:col-span-2 space-y-6">
                    <div className={`p-6 rounded-xl shadow-lg border-t-4 transition-all ${promptSent ? 'bg-gray-50 border-gray-300' : 'bg-white border-indigo-500'
                        }`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                <Send className={`w-5 h-5 mr-2 ${promptSent ? 'text-gray-400' : 'text-indigo-500'}`} />
                                Step 1: Send Prompt
                            </h3>
                            {!promptSent && (
                                <button onClick={() => setShowBank(true)} className="text-sm text-indigo-600 font-semibold flex items-center hover:underline">
                                    <BookOpen className="w-4 h-4 mr-1" /> Open Prompt Bank
                                </button>
                            )}
                        </div>

                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={promptInput}
                                onChange={(e) => setPromptInput(e.target.value)}
                                placeholder="e.g., What is the most important theme in Hamlet?"
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition disabled:bg-gray-100"
                                disabled={promptSent}
                            />
                            {!promptSent && promptInput.trim().length > 0 && (
                                <button
                                    onClick={saveToBank}
                                    title="Save to Bank"
                                    className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg border border-gray-300"
                                >
                                    <Save className="w-5 h-5" />
                                </button>
                            )}
                            <button
                                onClick={sendPrompt}
                                disabled={promptSent || !promptInput}
                                className={`px-6 py-3 font-bold rounded-lg transition flex items-center ${promptSent
                                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                                    }`}
                            >
                                {promptSent ? 'Sent' : 'Broadcast'}
                            </button>
                        </div>
                        {promptSent && (
                            <div className="mt-4 flex justify-between items-center text-sm">
                                <p className="text-green-600 flex items-center">
                                    <CheckCircle className="w-4 h-4 mr-1" /> Prompt is live on student devices.
                                </p>
                                <button
                                    onClick={() => { setPromptSent(false); setPromptInput(''); setSubmissionCount(0); setSwapComplete(false); setLiveThoughts([]); }}
                                    className="text-indigo-600 hover:underline flex items-center"
                                >
                                    <RefreshCw className="w-3 h-3 mr-1" /> New Prompt
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={`p-6 rounded-xl shadow-lg border-t-4 transition duration-300 ${submissionCount > 0 && !swapComplete
                        ? 'bg-white border-green-500 opacity-100'
                        : 'bg-gray-50 border-gray-300 opacity-80'
                        }`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                <Shuffle className="w-5 h-5 mr-2 text-green-600" />
                                Step 2: The Swap
                            </h3>

                            {/* Max Swap Configuration */}
                            <div className="flex items-center space-x-2 text-sm bg-gray-100 p-2 rounded-lg">
                                <Settings className="w-4 h-4 text-gray-500" />
                                <span className="text-gray-600">Max Requests:</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    value={maxSwapRequests}
                                    onChange={(e) => updateMaxSwaps(parseInt(e.target.value))}
                                    className="w-12 border rounded px-1 text-center"
                                />
                            </div>
                        </div>

                        <p className="text-gray-600 mb-6">
                            Once enough students have submitted their thoughts, initiate the swap.
                        </p>
                        <button
                            onClick={triggerSwap}
                            disabled={submissionCount < 2 || swapComplete}
                            className={`w-full py-4 text-white font-bold rounded-xl text-lg shadow-md transition flex items-center justify-center
                                ${submissionCount >= 2 && !swapComplete
                                    ? 'bg-green-600 hover:bg-green-700 transform hover:scale-[1.02]'
                                    : 'bg-gray-300 cursor-not-allowed'
                                }
                            `}
                        >
                            <Shuffle className="w-6 h-6 mr-2" />
                            {swapComplete ? 'Swap Completed' : `Swap Thoughts (${submissionCount})`}
                        </button>
                    </div>

                    {/* LIVE THOUGHTS MODERATION */}
                    {promptSent && (
                        <div className="bg-white rounded-xl shadow-lg border-t-4 border-indigo-400 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                    <Eye className="w-5 h-5 mr-2 text-indigo-600" />
                                    Live Thoughts ({liveThoughts.length})
                                </h3>
                                <span className="text-xs text-gray-400">Incoming submissions</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-100 rounded-lg p-2 bg-gray-50">
                                {liveThoughts.length === 0 ? (
                                    <p className="text-gray-400 text-center text-sm py-4 italic">Waiting for submissions...</p>
                                ) : (
                                    liveThoughts.map((thought) => (
                                        <div key={thought.id} className="bg-white p-3 rounded-md shadow-sm border border-gray-200 flex justify-between items-start group">
                                            <div>
                                                <p className="text-gray-800 text-sm">{thought.content}</p>
                                                <p className="text-xs text-gray-400 mt-1">{thought.authorName}</p>
                                            </div>
                                            <button
                                                onClick={() => deleteThought(thought.id)}
                                                className="text-red-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition"
                                                title="Delete Thought"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Roster */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-[600px] border border-gray-200">
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <h3 className="font-bold text-gray-700 flex items-center">
                            <Users className="w-5 h-5 mr-2 text-gray-500" />
                            Class Roster
                        </h3>
                    </div>
                    <div className="overflow-y-auto flex-1 p-4 space-y-2">
                        {participants.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 italic">
                                <Users className="w-8 h-8 mb-2 opacity-20" />
                                <p>Waiting for students...</p>
                            </div>
                        ) : (
                            participants.map((p) => (
                                <div key={p.socketId} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mr-3">
                                            {p.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-medium text-gray-700">{p.name}</span>
                                    </div>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        Online
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}