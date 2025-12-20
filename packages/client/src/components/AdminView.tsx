import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Shield, Activity, FileText, Lock, LogOut, User, MessageSquare, Zap, Users } from 'lucide-react';
import Modal from './Modal';

interface AdminData {
    sessions: any[];
    thoughts: any[];
    swaps: any[];
    logs: any[];
    stats: {
        totalConsented: number;
        totalUsers: number;
        activeUsers: number;
        activeSessions: number;
        totalThoughts: number;
        totalSwaps: number;
    };
}

export default function AdminView({ onExit }: { onExit: () => void }) {
    const [data, setData] = useState<AdminData>({
        sessions: [],
        thoughts: [],
        swaps: [],
        logs: [],
        stats: { 
            totalConsented: 0, 
            totalUsers: 0,
            activeUsers: 0, 
            activeSessions: 0,
            totalThoughts: 0,
            totalSwaps: 0
        }
    });
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'THOUGHTS' | 'SWAPS' | 'SESSIONS' | 'LOGS'>('OVERVIEW');
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: 'info' | 'error' | 'success' | 'confirm' | 'warning';
        title: string;
        message: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    useEffect(() => {
        // Socket should already be connected from App.tsx
        // Just emit admin join and set up listeners
        socket.emit('ADMIN_JOIN');

        const handleData = (payload: AdminData) => {
            setData(payload);
            setIsLoading(false);
        };

        socket.on('ADMIN_DATA_UPDATE', handleData);

        // Initial fetch
        socket.emit('ADMIN_GET_DATA');

        // Poll for updates every 3 seconds
        const interval = setInterval(() => {
            socket.emit('ADMIN_GET_DATA');
        }, 3000);

        return () => {
            socket.off('ADMIN_DATA_UPDATE', handleData);
            clearInterval(interval);
        };
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-400 font-mono">
                <Activity className="w-6 h-6 animate-spin mr-3 text-indigo-500" />
                ESTABLISHING SECURE CONNECTION...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
            <Modal
                isOpen={modal.isOpen}
                onClose={() => setModal({ ...modal, isOpen: false })}
                title={modal.title}
                message={modal.message}
                type={modal.type}
            />

            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center space-x-3">
                    <Shield className="w-6 h-6 text-indigo-500" />
                    <h1 className="text-xl font-bold tracking-tight text-white">ThoughtSwap <span className="text-slate-500 font-normal">| Administrator Dashboard</span></h1>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="hidden md:grid grid-cols-2 gap-6 text-xs font-mono text-slate-500">
                        <span className="flex items-center"><span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>SYSTEM ONLINE</span>
                        <span>USERS: {data.stats.activeUsers}</span>
                        <span>CONSENTED: {data.stats.totalConsented}/{data.stats.totalUsers}</span>
                        <span>SESSIONS: {data.stats.activeSessions}</span>
                    </div>
                    <button onClick={onExit} className="p-2 hover:bg-rose-900/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <div className="flex flex-col md:flex-row h-[calc(100vh-64px)]">
                {/* Sidebar Navigation */}
                <nav className="w-full md:w-64 bg-slate-900/50 border-r border-slate-800 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('OVERVIEW')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'OVERVIEW' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Activity className="w-4 h-4" />
                        <span className="font-medium text-sm">Dashboard</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('SESSIONS')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'SESSIONS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Users className="w-4 h-4" />
                        <span className="font-medium text-sm">Active Sessions</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('THOUGHTS')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'THOUGHTS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span className="font-medium text-sm">Thoughts ({data.stats.totalThoughts})</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('SWAPS')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'SWAPS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Zap className="w-4 h-4" />
                        <span className="font-medium text-sm">Swaps ({data.stats.totalSwaps})</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('LOGS')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'LOGS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <FileText className="w-4 h-4" />
                        <span className="font-medium text-sm">System Logs</span>
                    </button>
                </nav>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-6 bg-slate-950">

                    {activeTab === 'OVERVIEW' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-light text-white mb-6">System Overview</h2>
                            
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-slate-400 text-xs uppercase tracking-wide">Consented Users</p>
                                            <p className="text-2xl font-bold text-white mt-1">{data.stats.totalConsented}</p>
                                            <p className="text-xs text-slate-500 mt-2">of {data.stats.totalUsers} total</p>
                                        </div>
                                        <User className="w-8 h-8 text-emerald-500 opacity-30" />
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-slate-400 text-xs uppercase tracking-wide">Active Sessions</p>
                                            <p className="text-2xl font-bold text-white mt-1">{data.stats.activeSessions}</p>
                                            <p className="text-xs text-slate-500 mt-2">classrooms in progress</p>
                                        </div>
                                        <Activity className="w-8 h-8 text-blue-500 opacity-30" />
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-slate-400 text-xs uppercase tracking-wide">Total Thoughts</p>
                                            <p className="text-2xl font-bold text-white mt-1">{data.stats.totalThoughts}</p>
                                            <p className="text-xs text-slate-500 mt-2">consented entries</p>
                                        </div>
                                        <MessageSquare className="w-8 h-8 text-indigo-500 opacity-30" />
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-slate-400 text-xs uppercase tracking-wide">Total Swaps</p>
                                            <p className="text-2xl font-bold text-white mt-1">{data.stats.totalSwaps}</p>
                                            <p className="text-xs text-slate-500 mt-2">peer exchanges</p>
                                        </div>
                                        <Zap className="w-8 h-8 text-yellow-500 opacity-30" />
                                    </div>
                                </div>
                            </div>

                            {/* Quick Stats */}
                            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-white mb-4">Consent Status</h3>
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm text-slate-400">Research Participation Rate</span>
                                            <span className="text-sm font-bold text-white">{data.stats.totalUsers > 0 ? Math.round((data.stats.totalConsented / data.stats.totalUsers) * 100) : 0}%</span>
                                        </div>
                                        <div className="w-full bg-slate-800 rounded-full h-2">
                                            <div 
                                                className="bg-emerald-500 h-2 rounded-full transition-all"
                                                style={{ width: data.stats.totalUsers > 0 ? `${(data.stats.totalConsented / data.stats.totalUsers) * 100}%` : '0%' }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'SESSIONS' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-light text-white mb-6">Active Classrooms</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {data.sessions.map((session: any) => (
                                    <div key={session.id} className="bg-slate-900 border border-slate-800 rounded-lg p-5 hover:border-indigo-500/50 transition-colors">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="text-2xl font-mono text-white font-bold">{session.course?.joinCode || 'UNKNOWN'}</span>
                                            <span className="px-2 py-1 bg-emerald-900/30 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-900/50">Active</span>
                                        </div>
                                        <div className="space-y-2 text-sm text-slate-400">
                                            <div className="flex justify-between border-b border-slate-800 pb-2">
                                                <span>Course</span>
                                                <span className="text-slate-300">{session.course?.title || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-800 pb-2">
                                                <span>Session ID</span>
                                                <span className="font-mono text-slate-500 text-xs">{session.id.substring(0, 8)}...</span>
                                            </div>
                                            <div className="flex justify-between pt-2">
                                                <span>Prompts Sent</span>
                                                <span className="text-white font-bold">{session.promptCount}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {data.sessions.length === 0 && (
                                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-lg text-slate-600">
                                        No active classrooms detected.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'THOUGHTS' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-light text-white">Consented Thoughts</h2>
                                <div className="flex items-center space-x-2 px-3 py-1 bg-amber-900/20 border border-amber-900/50 rounded-full">
                                    <Lock className="w-3 h-3 text-amber-500" />
                                    <span className="text-xs text-amber-500 font-bold uppercase">Privacy Filter Active</span>
                                </div>
                            </div>

                            <div className="grid gap-4">
                                {data.thoughts.map((thought: any) => (
                                    <div key={thought.id} className="bg-slate-900 border border-slate-800 p-6 rounded-lg hover:border-indigo-500/30 transition-colors">
                                        <blockquote className="text-base text-slate-300 italic mb-4 border-l-2 border-indigo-500 pl-4">
                                            "{thought.content}"
                                        </blockquote>
                                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-500 uppercase tracking-wider">
                                            <span className="text-slate-400">Author: {thought.authorName}</span>
                                            <span>•</span>
                                            <span className={thought.consent ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                                                {thought.consent ? '✓ CONSENTED' : '✗ NOT CONSENTED'}
                                            </span>
                                            <span>•</span>
                                            <span className="text-slate-600">ID: {thought.id.substring(0, 8)}</span>
                                        </div>
                                    </div>
                                ))}
                                {data.thoughts.length === 0 && (
                                    <div className="py-12 text-center text-slate-600 border border-dashed border-slate-800 rounded-lg">
                                        No consented thoughts available.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'SWAPS' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-light text-white">Peer Swaps</h2>
                                <div className="flex items-center space-x-2 px-3 py-1 bg-amber-900/20 border border-amber-900/50 rounded-full">
                                    <Lock className="w-3 h-3 text-amber-500" />
                                    <span className="text-xs text-amber-500 font-bold uppercase">Privacy Filter Active</span>
                                </div>
                            </div>

                            <div className="grid gap-4">
                                {data.swaps.map((swap: any) => (
                                    <div key={swap.id} className="bg-slate-900 border border-slate-800 p-4 rounded-lg hover:border-indigo-500/30 transition-colors">
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                            <div>
                                                <p className="text-white font-semibold">{swap.studentName}</p>
                                                <p className="text-sm text-slate-400">Classroom: {swap.classroom}</p>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                                                <span className={swap.consent ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                                                    {swap.consent ? '✓ CONSENTED' : '✗ NOT CONSENTED'}
                                                </span>
                                                <span className="text-slate-600">{new Date(swap.createdAt).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {data.swaps.length === 0 && (
                                    <div className="py-12 text-center text-slate-600 border border-dashed border-slate-800 rounded-lg">
                                        No peer swaps recorded.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'LOGS' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-light text-white">System Telemetry</h2>
                            <div className="bg-black border border-slate-800 rounded-lg overflow-x-auto font-mono text-xs">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-900 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Time</th>
                                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Event</th>
                                            <th className="px-4 py-3 font-bold uppercase tracking-wider">User ID</th>
                                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {data.logs.map((log: any) => (
                                            <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                                                <td className="px-4 py-2 text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</td>
                                                <td className="px-4 py-2 text-indigo-400 font-bold">{log.event}</td>
                                                <td className="px-4 py-2 text-slate-600">{log.userId ? log.userId.substring(0, 8) + '...' : '-'}</td>
                                                <td className="px-4 py-2 text-slate-400 truncate max-w-xs" title={JSON.stringify(log.payload)}>
                                                    {log.payload ? JSON.stringify(log.payload).substring(0, 50) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}