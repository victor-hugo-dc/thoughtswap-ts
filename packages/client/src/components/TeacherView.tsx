import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Users, Send, Shuffle, Power, Copy, CheckCircle, Play, RefreshCw, BookOpen, Save, Trash2, HelpCircle, Eye, Settings, ArrowRight, List, AlignLeft, BarChart2, Plus, X } from 'lucide-react';
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
    const [mcOptions, setMcOptions] = useState<string[]>(['', '']); // Start with 2 empty options

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
            console.log("Restoring teacher session:", storedJoinCode);
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
                setPromptSent(true);
            }
        });

        socket.on('DISTRIBUTION_UPDATE', (data: Record<string, DistributionItem>) => {
            setDistribution(data);
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
                localStorage.removeItem('thoughtswap_joinCode');
                localStorage.removeItem('thoughtswap_teacher_active');
                setIsActive(false);
            }
        });

        return () => {
            socket.off('CLASS_STARTED');
            socket.off('PARTICIPANTS_UPDATE');
            socket.off('THOUGHTS_UPDATE');
            socket.off('DISTRIBUTION_UPDATE');
            socket.off('SWAP_COMPLETED');
            socket.off('SAVED_PROMPTS_LIST');
            socket.off('ERROR');
        };
    }, [auth]);

    const showModal = (type: ModalType, title: string, message: string, onConfirm?: () => void, children?: React.ReactNode, isDestructive?: boolean) => {
        setModal({ isOpen: true, type, title, message, onConfirm, children, isDestructive });
    };

    const startClass = () => {
        socket.emit('TEACHER_START_CLASS');
    };

    // --- PROMPT COMPOSER LOGIC ---

    const addMcOption = () => setMcOptions([...mcOptions, '']);
    const removeMcOption = (idx: number) => {
        const newOpts = [...mcOptions];
        newOpts.splice(idx, 1);
        setMcOptions(newOpts);
    };
    const updateMcOption = (idx: number, val: string) => {
        const newOpts = [...mcOptions];
        newOpts[idx] = val;
        setMcOptions(newOpts);
    };

    const validatePrompt = () => {
        if (!promptInput.trim()) return false;
        if (promptType === 'MC') {
            const validOpts = mcOptions.filter(o => o.trim().length > 0);
            if (validOpts.length < 2) return false;
        }
        return true;
    };

    const getPromptData = () => {
        return {
            content: promptInput,
            type: promptType,
            options: promptType === 'MC' ? mcOptions.filter(o => o.trim().length > 0) : undefined
        };
    };

    const sendPrompt = () => {
        if (!validatePrompt()) {
            showModal('error', 'Invalid Prompt', 'Please enter a prompt text. If using Multiple Choice, provide at least 2 options.');
            return;
        }
        const data = getPromptData();
        socket.emit('TEACHER_SEND_PROMPT', { joinCode, ...data });
        setPromptSent(true);
        setSwapComplete(false);
        setDistribution({});
    };

    const saveToBank = () => {
        if (!validatePrompt()) {
            showModal('error', 'Invalid Prompt', 'Please enter a prompt text. If using Multiple Choice, provide at least 2 options.');
            return;
        }
        const data = getPromptData();
        socket.emit('SAVE_PROMPT', data);
        showModal('success', 'Saved', 'Prompt saved to your bank!');
    };

    const loadPrompt = (prompt: SavedPrompt) => {
        setPromptInput(prompt.content);
        setPromptType(prompt.type);
        if (prompt.type === 'MC' && prompt.options) {
            setMcOptions(prompt.options);
        } else {
            setMcOptions(['', '']);
        }
        setShowBank(false);
    };

    // --- END COMPOSER LOGIC ---

    const deleteFromBank = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Delete this prompt?")) {
            socket.emit('DELETE_SAVED_PROMPT', { id });
        }
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
        }, undefined, true);
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
            setDistribution({});
            localStorage.removeItem('thoughtswap_joinCode');
            localStorage.removeItem('thoughtswap_teacher_active');

            setTimeout(() => {
                showModal('info', 'Session Ended', '', undefined, (
                    <div className="text-center">
                        <p className="mb-4">Please complete the post-session survey:</p>
                        <a
                            href="https://jmu.qualtrics.com/jfe/form/SV_dummy_survey_id"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700"
                        >
                            Take Survey
                        </a>
                    </div>
                ));
            }, 500);
        }, undefined, true);
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
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 space-y-2">
                        {savedPrompts.length === 0 && <p className="text-gray-400 text-center italic">Bank is empty.</p>}
                        {savedPrompts.map(p => (
                            <div key={p.id} className="p-3 border border-gray-200 rounded-lg hover:bg-indigo-50 cursor-pointer transition group flex justify-between items-center"
                                onClick={() => loadPrompt(p)}>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded text-white ${p.type === 'MC' ? 'bg-purple-500' : p.type === 'SCALE' ? 'bg-orange-500' : 'bg-blue-500'
                                            }`}>
                                            {p.type}
                                        </span>
                                        <p className="text-gray-800 text-sm font-medium truncate">{p.content}</p>
                                    </div>
                                    {p.type === 'MC' && <p className="text-xs text-gray-500 pl-1">{p.options?.length} Options</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-indigo-600 hidden group-hover:inline-block font-bold">Load</span>
                                    <button onClick={(e) => deleteFromBank(p.id, e)} className="p-1 text-red-300 hover:text-red-500 rounded hover:bg-red-50">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderComposer = () => (
        <div className={`p-6 rounded-xl shadow-lg border-t-4 transition-all ${promptSent ? 'bg-gray-50 border-gray-300' : 'bg-white border-indigo-500'}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                    <Send className={`w-5 h-5 mr-2 ${promptSent ? 'text-gray-400' : 'text-indigo-500'}`} />
                    Step 1: Create Prompt
                </h3>
                {!promptSent && (
                    <button onClick={() => setShowBank(true)} className="text-sm text-indigo-600 font-semibold flex items-center hover:underline">
                        <BookOpen className="w-4 h-4 mr-1" /> Open Bank
                    </button>
                )}
            </div>

            {/* Type Selector */}
            {!promptSent && (
                <div className="flex space-x-2 mb-4">
                    <button
                        onClick={() => setPromptType('TEXT')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center ${promptType === 'TEXT' ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        <AlignLeft className="w-4 h-4 mr-1.5" /> Open Text
                    </button>
                    <button
                        onClick={() => setPromptType('MC')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center ${promptType === 'MC' ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        <List className="w-4 h-4 mr-1.5" /> Multiple Choice
                    </button>
                    <button
                        onClick={() => setPromptType('SCALE')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center ${promptType === 'SCALE' ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        <BarChart2 className="w-4 h-4 mr-1.5" /> 1-5 Scale
                    </button>
                </div>
            )}

            <div className="space-y-3">
                <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="Enter your question here..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition disabled:bg-gray-100"
                    disabled={promptSent}
                />

                {/* Multiple Choice Options */}
                {!promptSent && promptType === 'MC' && (
                    <div className="pl-4 border-l-2 border-purple-200 space-y-2">
                        <p className="text-xs font-bold text-purple-500 uppercase">Answer Options</p>
                        {mcOptions.map((opt, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs text-gray-400 font-mono">
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => updateMcOption(idx, e.target.value)}
                                    placeholder={`Option ${idx + 1}`}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-purple-400"
                                />
                                {mcOptions.length > 2 && (
                                    <button onClick={() => removeMcOption(idx)} className="text-gray-400 hover:text-red-500">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {mcOptions.length < 6 && (
                            <button onClick={addMcOption} className="text-xs flex items-center text-purple-600 hover:underline font-medium mt-1">
                                <Plus className="w-3 h-3 mr-1" /> Add Option
                            </button>
                        )}
                    </div>
                )}

                {/* Scale Preview */}
                {!promptSent && promptType === 'SCALE' && (
                    <div className="pl-4 border-l-2 border-orange-200">
                        <p className="text-xs font-bold text-orange-500 uppercase mb-2">Student View Preview</p>
                        <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm text-gray-500">
                            <span>1 (Disagree)</span>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <div key={n} className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center bg-white">{n}</div>
                                ))}
                            </div>
                            <span>5 (Agree)</span>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    {!promptSent && (
                        <button
                            onClick={saveToBank}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-lg border border-gray-300 flex items-center"
                        >
                            <Save className="w-4 h-4 mr-2" /> Save
                        </button>
                    )}
                    <button
                        onClick={sendPrompt}
                        disabled={promptSent || !promptInput}
                        className={`flex-1 px-6 py-3 font-bold rounded-lg transition flex items-center justify-center ${promptSent
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                            }`}
                    >
                        {promptSent ? 'Sent' : 'Broadcast'}
                    </button>
                </div>
            </div>

            {promptSent && (
                <div className="mt-4 flex justify-between items-center text-sm border-t pt-3">
                    <p className="text-green-600 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-1" /> Prompt is live.
                    </p>
                    <button
                        onClick={() => {
                            setPromptSent(false);
                            setPromptInput('');
                            setSubmissionCount(0);
                            setSwapComplete(false);
                            setLiveThoughts([]);
                            setDistribution({});
                            setPromptType('TEXT');
                            setMcOptions(['', '']);
                        }}
                        className="text-indigo-600 hover:underline flex items-center"
                    >
                        <RefreshCw className="w-3 h-3 mr-1" /> New Prompt
                    </button>
                </div>
            )}
        </div>
    );

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
                    isDestructive={modal.isDestructive}
                >
                    {modal.children}
                </Modal>

                <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-lg w-full border border-gray-100">
                    <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Play className="w-8 h-8 text-indigo-600 ml-1" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-800 mb-2">Start a New Class</h2>
                    <p className="text-gray-600 mb-8">Create a temporary room for your students.</p>
                    <button onClick={startClass} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-lg shadow-lg transition transform hover:scale-105 mb-4">
                        Launch Session
                    </button>
                    <button onClick={() => setShowBank(true)} className="w-full py-3 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition flex items-center justify-center">
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
                isDestructive={modal.isDestructive}
            >
                {modal.children}
            </Modal>

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
                    <button onClick={endSession} className="ml-4 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition flex items-center text-sm font-bold">
                        <Power className="w-4 h-4 mr-2" /> End Class
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls */}
                <div className="lg:col-span-2 space-y-6">
                    {renderComposer()}

                    <div className={`p-6 rounded-xl shadow-lg border-t-4 transition duration-300 ${submissionCount > 0 && !swapComplete ? 'bg-white border-green-500 opacity-100' : 'bg-gray-50 border-gray-300 opacity-80'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                <Shuffle className="w-5 h-5 mr-2 text-green-600" />
                                Step 2: The Swap
                            </h3>

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
                        <button onClick={triggerSwap} disabled={submissionCount < 2 || swapComplete} className={`w-full py-4 text-white font-bold rounded-xl text-lg shadow-md transition flex items-center justify-center ${submissionCount >= 2 && !swapComplete ? 'bg-green-600 hover:bg-green-700 transform hover:scale-[1.02]' : 'bg-gray-300 cursor-not-allowed'}`}>
                            <Shuffle className="w-6 h-6 mr-2" />
                            {swapComplete ? 'Swap Completed' : `Swap Thoughts (${submissionCount})`}
                        </button>
                    </div>

                    {/* Distribution Graph Visualization */}
                    {Object.keys(distribution).length > 0 && (
                        <div className="bg-white rounded-xl shadow-lg border-t-4 border-purple-500 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                    <Shuffle className="w-5 h-5 mr-2 text-purple-600" />
                                    Distribution Graph
                                </h3>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 uppercase bg-gray-100 border-b">
                                        <tr>
                                            <th className="px-4 py-2">Author</th>
                                            <th className="px-4 py-2 text-center"></th>
                                            <th className="px-4 py-2">Recipient</th>
                                            <th className="px-4 py-2">Content Preview</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(distribution).map(([socketId, data]) => (
                                            <tr key={socketId} className="border-b border-gray-100 hover:bg-white transition">
                                                <td className="px-4 py-3 font-medium text-gray-700">{data.originalAuthorName}</td>
                                                <td className="px-4 py-3 text-center text-gray-400"><ArrowRight className="w-4 h-4 mx-auto" /></td>
                                                <td className="px-4 py-3 font-medium text-indigo-600">{data.studentName}</td>
                                                <td className="px-4 py-3 text-gray-500 italic truncate max-w-xs">{data.thoughtContent}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

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
                                            <button onClick={() => deleteThought(thought.id)} className="text-red-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition" title="Delete Thought">
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