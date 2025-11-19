import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Loader2, Users, MessageSquare, CheckCircle, RotateCcw } from 'lucide-react';

interface StudentViewProps {
    joinCode: string;
    onJoin: (code: string) => void;
}

type Status = 'IDLE' | 'JOINED' | 'ANSWERING' | 'SUBMITTED' | 'DISCUSSING';

export default function StudentView({ joinCode, onJoin }: StudentViewProps) {
    const [status, setStatus] = useState<Status>('IDLE');
    const [prompt, setPrompt] = useState<string>('');
    const [myResponse, setMyResponse] = useState<string>('');
    const [responseInput, setResponseInput] = useState<string>('');
    const [swappedThought, setSwappedThought] = useState<string>('');

    useEffect(() => {
        if (joinCode) {
            setStatus('JOINED');
            // TODO: real socket logic would be here
        }

        // Listen for new prompts from the teacher
        socket.on('NEW_PROMPT', (data: { content: string }) => {
            setPrompt(data.content);
            setStatus('ANSWERING');
            setMyResponse('');
            setResponseInput('');
            setSwappedThought('');
        });

        // Listen for the "Swap" event
        socket.on('RECEIVE_SWAP', (data: { content: string }) => {
            setSwappedThought(data.content);
            setStatus('DISCUSSING');
        });

        return () => {
            socket.off('NEW_PROMPT');
            socket.off('RECEIVE_SWAP');
        };
    }, [joinCode]);

    const submitResponse = () => {
        if (!responseInput.trim()) return;

        alert("Submitting thought...");

        socket.emit('SUBMIT_THOUGHT', {
            joinCode,
            content: myResponse
        });
        setMyResponse(responseInput);
        setStatus('SUBMITTED');
    };

    const handleJoinClick = () => {
        if (joinCode.length > 0) {
            onJoin(joinCode);
            setStatus('JOINED');
        }
    }

    const renderContent = () => {
        switch (status) {
            case 'IDLE':
                return (
                    <div className="p-8 bg-white rounded-xl shadow-lg max-w-sm w-full">
                        <h3 className="text-2xl font-bold mb-4 text-gray-800">Join a Course</h3>
                        <p className="text-gray-600 mb-6">Enter the 6-character room code from your teacher.</p>
                        <div className='space-y-4'>
                            <input
                                type="text"
                                placeholder="Room Code"
                                value={joinCode}
                                onChange={(e) => onJoin(e.target.value.toUpperCase())} // Call parent handler
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-center text-xl font-mono tracking-widest uppercase focus:ring-indigo-500 focus:border-indigo-500"
                                maxLength={6}
                            />
                            <button
                                onClick={handleJoinClick}
                                disabled={joinCode.length !== 6}
                                className="w-full flex items-center justify-center px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition"
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

                        <blockquote className="border-l-4 border-indigo-400 pl-4 py-2 mb-6 italic text-gray-700">
                            {prompt}
                        </blockquote>

                        <textarea
                            value={responseInput}
                            onChange={(e) => setResponseInput(e.target.value)}
                            placeholder="Write your thought here (max 500 characters)..."
                            rows={6}
                            maxLength={500}
                            className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none text-base"
                        />
                        <button
                            onClick={submitResponse}
                            disabled={responseInput.trim().length === 0}
                            className="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition mt-4 shadow-md"
                        >
                            Submit Thought
                        </button>
                    </div>
                );

            case 'SUBMITTED':
                return (
                    <div className="flex flex-col items-center p-10 bg-indigo-50 rounded-xl shadow-xl w-full max-w-md text-center border-2 border-indigo-400">
                        <CheckCircle className="w-12 h-12 text-indigo-500 mb-4" />
                        <h3 className="text-2xl font-bold text-gray-800 mb-2">Thought Submitted!</h3>
                        <p className="text-gray-600">Your response is awaiting the shuffle. Get ready to discuss!</p>
                        <div className='mt-4 p-3 bg-white border border-gray-200 rounded-lg w-full text-sm italic overflow-auto max-h-32'>
                            "{myResponse.substring(0, 100)}..."
                        </div>
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
                        <blockquote className="bg-white p-4 sm:p-6 rounded-lg border-l-8 border-yellow-500 italic text-xl shadow-inner">
                            "{swappedThought}"
                        </blockquote>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col items-center justify-start py-8">
            <h2 className="text-3xl font-light text-gray-700 mb-8">
                Course Room: <span className='font-bold text-indigo-500'>{joinCode || '...'}</span>
            </h2>
            {renderContent()}
        </div>
    );
}