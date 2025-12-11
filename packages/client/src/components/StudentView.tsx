import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Loader2, Users, MessageSquare, CheckCircle, RotateCcw, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';

interface StudentViewProps {
    joinCode: string;
    auth: any;
    onJoin: (code: string) => void;
}

type Status = 'IDLE' | 'JOINED' | 'ANSWERING' | 'SUBMITTED' | 'DISCUSSING';

export default function StudentView({ joinCode, auth, onJoin }: StudentViewProps) {
    const [status, setStatus] = useState<Status>('IDLE');
    const [inputCode, setInputCode] = useState(joinCode);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [prompt, setPrompt] = useState<string>('');
    const [promptUseId, setPromptUseId] = useState<string>('');
    const [swappedThought, setSwappedThought] = useState<string>('');
    const [responseInput, setResponseInput] = useState<string>('');
    
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        // Socket Connection Config
        if (auth) {
            socket.auth = {
                name: auth.name,
                role: auth.role,
                email: auth.email
            };
        }

        // Event Listeners
        socket.on('JOIN_SUCCESS', () => {
            setStatus('JOINED');
            setErrorMsg(null);
        });

        socket.on('ERROR', (data: { message: string }) => {
            setErrorMsg(data.message);
            if (status === 'JOINED') setStatus('IDLE');
        });

        socket.on('NEW_PROMPT', (data: { content: string, promptUseId: string }) => {
            setPrompt(data.content);
            setPromptUseId(data.promptUseId);
            setStatus('ANSWERING');
            setResponseInput('');
            setSwappedThought('');
        });

        socket.on('RECEIVE_SWAP', (data: { content: string }) => {
            setSwappedThought(data.content);
            setStatus('DISCUSSING');
        });

        // NEW: Handle Teacher Ending Session
        socket.on('SESSION_ENDED', () => {
            alert("The class session has ended.");
            setStatus('IDLE');
            setInputCode('');
            setPrompt('');
            setSwappedThought('');
            setResponseInput('');
        });

        return () => {
            socket.off('JOIN_SUCCESS');
            socket.off('ERROR');
            socket.off('NEW_PROMPT');
            socket.off('RECEIVE_SWAP');
            socket.off('SESSION_ENDED');
        };
    }, [status, auth]);

    const handleJoinClick = () => {
        if (inputCode.length > 0) {
            setErrorMsg(null);
            socket.connect();
            socket.emit('JOIN_ROOM', { joinCode: inputCode });
            onJoin(inputCode);
        }
    }

    const submitResponse = () => {
        if (!responseInput.trim()) return;
        socket.emit('SUBMIT_THOUGHT', { joinCode, content: responseInput, promptUseId });
        setStatus('SUBMITTED');
    };

    const requestNewSwap = () => {
        socket.emit('STUDENT_REQUEST_NEW_THOUGHT', { joinCode, currentThoughtContent: swappedThought });
    };

    const renderHelpModal = () => {
        if (!showHelp) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
                <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
                    <h3 className="text-xl font-bold mb-3 text-indigo-700">Student Guide</h3>
                    <ul className="list-disc pl-5 space-y-2 text-gray-700 text-sm">
                        <li>Enter the 6-letter room code provided by your teacher.</li>
                        <li>Wait for the prompt to appear on your screen.</li>
                        <li>Type your anonymous response and submit it.</li>
                        <li>Wait for the "Swap". You will receive a peer's thought to discuss.</li>
                        <li>If the thought you receive is blank or confusing, you can request a new one.</li>
                    </ul>
                    <button onClick={() => setShowHelp(false)} className="mt-5 w-full py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-lg font-bold transition">Got it!</button>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        switch (status) {
            case 'IDLE':
                return (
                    <div className="p-8 bg-white rounded-xl shadow-lg max-w-sm w-full">
                        <h3 className="text-2xl font-bold mb-4 text-gray-800">Join a Course</h3>
                        <p className="text-gray-600 mb-6">Enter the 6-character room code from your teacher.</p>

                        {errorMsg && (
                            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center text-sm">
                                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                {errorMsg}
                            </div>
                        )}

                        <div className='space-y-4'>
                            <input
                                type="text"
                                placeholder="Room Code"
                                value={inputCode}
                                onChange={(e) => {
                                    setInputCode(e.target.value.toUpperCase());
                                    setErrorMsg(null);
                                }}
                                className={`w-full px-4 py-2 border rounded-lg text-center text-xl font-mono tracking-widest uppercase focus:ring-indigo-500 focus:border-indigo-500 ${errorMsg ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                maxLength={6}
                            />
                            <button
                                onClick={handleJoinClick}
                                disabled={inputCode.length !== 6}
                                className="w-full flex items-center justify-center px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Users className='w-5 h-5 mr-2' /> Join
                            </button>
                        </div>
                    </div>
                );

            case 'JOINED':
                return (
                    <div className="flex flex-col items-center justify-center p-10 bg-white rounded-xl shadow-lg">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700">Awaiting Prompt...</h3>
                        <p className="text-gray-500">The teacher will send the prompt shortly.</p>
                    </div>
                );

            case 'ANSWERING':
                return (
                    <div className="bg-white p-6 sm:p-10 rounded-xl shadow-lg w-full max-w-2xl">
                        <div className="flex items-center text-indigo-600 mb-4">
                            <MessageSquare className="w-6 h-6 mr-3" />
                            <h3 className="text-2xl font-bold">Current Prompt</h3>
                        </div>
                        <blockquote className="border-l-4 border-indigo-400 pl-4 py-2 mb-6 italic text-gray-700 text-lg">
                            {prompt}
                        </blockquote>
                        <textarea
                            value={responseInput}
                            onChange={(e) => setResponseInput(e.target.value)}
                            placeholder="Write your thought here..."
                            rows={6}
                            maxLength={500}
                            className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none text-base"
                        />
                        <button onClick={submitResponse} disabled={responseInput.trim().length === 0} className="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition mt-4 shadow-md disabled:opacity-50">
                            Submit Thought
                        </button>
                    </div>
                );

            case 'SUBMITTED':
                return (
                    <div className="flex flex-col items-center p-10 bg-indigo-50 rounded-xl shadow-xl w-full max-w-md text-center border-2 border-indigo-400">
                        <CheckCircle className="w-12 h-12 text-indigo-500 mb-4" />
                        <h3 className="text-2xl font-bold text-gray-800 mb-2">Thought Submitted!</h3>
                        <p className="text-gray-600">Your response is awaiting the shuffle.</p>
                    </div>
                );

            case 'DISCUSSING':
                return (
                    <div className="bg-indigo-100 p-6 sm:p-10 rounded-xl shadow-2xl w-full max-w-2xl border-4 border-indigo-600">
                        <div className="flex items-center text-indigo-800 mb-4">
                            <RotateCcw className="w-8 h-8 mr-3" />
                            <h3 className="text-3xl font-extrabold">Peer Review Time!</h3>
                        </div>
                        <p className="text-lg text-gray-700 mb-6">Discuss this anonymous peer's thought:</p>
                        <blockquote className="bg-white p-4 sm:p-6 rounded-lg border-l-8 border-yellow-500 italic text-xl shadow-inner text-gray-800 mb-6">
                            "{swappedThought}"
                        </blockquote>
                        
                        <div className="flex justify-end">
                            <button 
                                onClick={requestNewSwap}
                                className="text-sm text-indigo-600 hover:text-indigo-800 underline flex items-center font-semibold"
                            >
                                <RefreshCw className="w-4 h-4 mr-1" /> Request a different thought
                            </button>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="flex flex-col items-center justify-start py-8 w-full relative">
            {renderHelpModal()}
            <div className='w-full max-w-4xl flex justify-between items-center mb-8 px-4'>
                <h2 className="text-3xl font-light text-gray-700">
                    Course Room: <span className='font-bold text-indigo-500'>{joinCode || '...'}</span>
                </h2>
                <button onClick={() => setShowHelp(true)} className='text-gray-400 hover:text-indigo-600 p-2'>
                    <HelpCircle className="w-8 h-8" />
                </button>
            </div>
            {renderContent()}
        </div>
    );
}