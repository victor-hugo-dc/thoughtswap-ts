import type { ReactNode } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export type ModalType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children?: ReactNode;
    message?: string;
    type?: ModalType;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
}

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    message,
    type = 'info',
    onConfirm,
    confirmText = 'Confirm',
    cancelText = 'Cancel'
}: ModalProps) {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle className="w-6 h-6 text-green-500" />;
            case 'warning': return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
            case 'error': return <AlertTriangle className="w-6 h-6 text-red-500" />;
            case 'confirm': return <AlertTriangle className="w-6 h-6 text-indigo-500" />;
            default: return <Info className="w-6 h-6 text-indigo-500" />;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all scale-100">
                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <div className="flex items-center space-x-2">
                        {getIcon()}
                        <h3 className="font-bold text-lg text-gray-800">{title}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {message && <p className="text-gray-600">{message}</p>}
                    {children}
                </div>

                <div className="p-4 bg-gray-50 flex justify-end space-x-3">
                    {type === 'confirm' ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-200 rounded-lg transition"
                            >
                                {cancelText}
                            </button>
                            <button
                                onClick={() => { onConfirm?.(); onClose(); }}
                                className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition bg-indigo-600 hover:bg-indigo-700"
                            >
                                {confirmText}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className="w-full px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200 transition"
                        >
                            OK
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}