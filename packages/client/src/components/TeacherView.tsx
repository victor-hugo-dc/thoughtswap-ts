import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Users, Send, Shuffle, Power, Copy, CheckCircle, Play, RefreshCw, BookOpen, Save, X } from 'lucide-react';

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

export default function TeacherView({ auth }: TeacherViewProps) {
    const [isActive, setIsActive] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [promptInput, setPromptInput] = useState('');
    const [promptSent, setPromptSent] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [submissionCount, setSubmissionCount] = useState(0);
    const [swapComplete, setSwapComplete] = useState(false);

    // Prompt Bank State
    const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
    const [showBank, setShowBank] = useState(false);

    useEffect(() => {
        socket.auth = {
            name: auth.name,
            role: auth.role,
            email: auth.email
        };

        if (!socket.connected) {
            socket.connect();
        }

        socket.emit('GET_SAVED_PROMPTS');

        socket.on('CLASS_STARTED', (data: { joinCode: string }) => {
            setIsActive(true);
            setJoinCode(data.joinCode);
        });

        socket.on('PARTICIPANTS_UPDATE', (data: { participants: Participant[], submissionCount: number }) => {
            setParticipants(data.participants);
            setSubmissionCount(data.submissionCount);
        });

        socket.on('SWAP_COMPLETED', () => {
            setSwapComplete(true);
            alert("Swap successful! Students are now discussing.");
        });

        socket.on('SAVED_PROMPTS_LIST', (data: SavedPrompt[]) => {
            setSavedPrompts(data);
        });

        socket.on('ERROR', (data) => {
            alert(`Error: ${data.message}`);
        });

        return () => {
            socket.off('CLASS_STARTED');
            socket.off('PARTICIPANTS_UPDATE');
            socket.off('SWAP_COMPLETED');
            socket.off('SAVED_PROMPTS_LIST');
            socket.off('ERROR');
        };
    }, [auth]);

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
        alert("Prompt saved to bank!");
    };

    const loadPrompt = (content: string) => {
        setPromptInput(content);
        setShowBank(false);
    };

    const triggerSwap = () => {
        socket.emit('TRIGGER_SWAP', { joinCode });
    };

    const endSession = () => {
        if (confirm("Are you sure you want to end the session? All students will be disconnected.")) {
            socket.emit('END_SESSION', { joinCode });
            setIsActive(false);
            setJoinCode('');
            setParticipants([]);
            setPromptSent(false);
            setPromptInput('');
            setSwapComplete(false);
            setSubmissionCount(0);
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(joinCode);
    };

    const renderBankModal = () => {
        if (!showBank) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-700 flex items-center">
                            <BookOpen className="w-5 h-5 mr-2 text-indigo-600" /> Saved Prompts
                        </h3>
                        <button onClick={() => setShowBank(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 space-y-2">
                        {savedPrompts.length === 0 ? (
                            <p className="text-center text-gray-400 italic py-10">No saved prompts yet.</p>
                        ) : (
                            savedPrompts.map(p => (
                                <div key={p.id} className="p-3 border border-gray-200 rounded-lg hover:bg-indigo-50 cursor-pointer transition group"
                                    onClick={() => loadPrompt(p.content)}>
                                    <p className="text-gray-800 text-sm">{p.content}</p>
                                    <span className="text-xs text-indigo-600 mt-2 hidden group-hover:inline-block font-bold">Click to Load</span>
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
                <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-lg w-full border border-gray-100">
                    <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Play className="w-8 h-8 text-indigo-600 ml-1" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-800 mb-4">Start a New Class</h2>
                    <p className="text-gray-600 mb-8">Create a temporary room for your students to join.</p>
                    <button
                        onClick={startClass}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-lg shadow-lg transition transform hover:scale-105"
                    >
                        Launch Session
                    </button>
                </div>
            </div>
        );
    }

    // --- ACTIVE DASHBOARD ---
    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20 relative">
            {renderBankModal()}

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
                                    onClick={() => { setPromptSent(false); setPromptInput(''); setSubmissionCount(0); setSwapComplete(false); }}
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
                        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                            <Shuffle className="w-5 h-5 mr-2 text-green-600" />
                            Step 2: The Swap
                        </h3>
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
                        {submissionCount < 2 && !swapComplete && (
                            <p className="text-center text-sm text-gray-400 mt-3">Waiting for at least 2 submissions...</p>
                        )}
                    </div>
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