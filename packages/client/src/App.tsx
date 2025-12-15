import { useState, useEffect } from 'react';
import { socket } from './socket';
import StudentView from './components/StudentView';
import TeacherView from './components/TeacherView';
import Modal from './components/Modal';
import { LogOut, Users, Zap, Play, GraduationCap } from 'lucide-react';

type UserRole = 'STUDENT' | 'TEACHER' | null;

interface AuthState {
  isLoggedIn: boolean;
  name: string | null;
  email: string | null;
  role: UserRole;
  expiry?: number;
}

// 24 Hours in milliseconds
const SESSION_DURATION = 24 * 60 * 60 * 1000;

function App() {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const saved = localStorage.getItem('thoughtswap_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem('thoughtswap_auth');
        return { isLoggedIn: false, name: null, email: null, role: null };
      }
      return parsed;
    }
    return { isLoggedIn: false, name: null, email: null, role: null };
  });

  const [joinCode, setJoinCode] = useState('');
  const [authErrorModal, setAuthErrorModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

  // TODO: Change the following to the correct Canvas Auth URL
  const CANVAS_AUTH_URL = 'http://localhost:8000/accounts/canvas/login/';

  const updateAuth = (newState: AuthState) => {
    setAuthState(newState);
    if (newState.isLoggedIn) {
      const stateWithExpiry = {
        ...newState,
        expiry: newState.expiry || Date.now() + SESSION_DURATION
      };
      localStorage.setItem('thoughtswap_auth', JSON.stringify(stateWithExpiry));
    } else {
      localStorage.removeItem('thoughtswap_auth');
    }
  };

  useEffect(() => {
    if (window.location.pathname === '/auth/success') {
      const params = new URLSearchParams(window.location.search);
      const name = params.get('name');
      const role = params.get('role') as UserRole;
      const email = params.get('email');

      if (name && role && email) {
        updateAuth({
          isLoggedIn: true,
          name: decodeURIComponent(name),
          email: decodeURIComponent(email),
          role: role,
          expiry: Date.now() + SESSION_DURATION
        });
      }
      window.history.replaceState({}, document.title, "/");
    }

    const handleAuthError = () => {
      setAuthErrorModal(true);
      updateAuth({ isLoggedIn: false, name: null, email: null, role: null });
      socket.disconnect();
    };

    const handleConsentStatus = (data: { consentGiven: boolean, consentDate: string | null }) => {
      // If consent hasn't been explicitly given (we assume false means declined/not given yet), 
      // we check if they have a date. If date is null, they haven't decided.
      if (data.consentDate === null) {
        setShowConsentModal(true);
      }
    };

    socket.on('AUTH_ERROR', handleAuthError);
    socket.on('CONSENT_STATUS', handleConsentStatus);

    return () => {
      socket.off('AUTH_ERROR', handleAuthError);
      socket.off('CONSENT_STATUS', handleConsentStatus);
    };
  }, []);

  // Connect socket early to check consent if logged in
  useEffect(() => {
    if (authState.isLoggedIn && !socket.connected) {
      socket.auth = {
        name: authState.name,
        role: authState.role,
        email: authState.email
      };
      socket.connect();
    }
  }, [authState]);

  const handleConsentResponse = (gaveConsent: boolean) => {
    socket.emit('UPDATE_CONSENT', { consentGiven: gaveConsent });
    setShowConsentModal(false);
  };

  const handleDemoLogin = (role: UserRole) => {
    const randomId = Math.floor(Math.random() * 10000);
    updateAuth({
      isLoggedIn: true,
      name: role === 'TEACHER' ? `Guest Teacher ${randomId}` : `Guest Student ${randomId}`,
      email: `guest_${role?.toLowerCase()}_${randomId}@demo.com`,
      role: role,
      expiry: Date.now() + SESSION_DURATION
    });
  };

  const handleLogout = () => {
    updateAuth({ isLoggedIn: false, name: null, email: null, role: null });
    setJoinCode('');
    socket.disconnect();
  };

  const handleStudentJoin = (code: string) => {
    setJoinCode(code);
  };

  if (!authState.isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-gray-50 to-indigo-50">
        <Modal
          isOpen={authErrorModal}
          onClose={() => setAuthErrorModal(false)}
          title="Session Expired"
          message="Your session has expired or is invalid. Please log in again."
          type="error"
        />

        <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-100">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-extrabold text-indigo-700 mb-4 flex items-center justify-center">
              <Zap className="h-12 w-12 mr-3 text-yellow-500 fill-current" /> ThoughtSwap
            </h1>
            <p className="text-xl text-gray-500">Real-time anonymous peer review for classrooms.</p>
          </div>

          <div className="space-y-6">
            <a
              href={CANVAS_AUTH_URL}
              className="w-full px-8 py-5 bg-indigo-600 text-white font-bold text-lg rounded-2xl shadow-lg hover:bg-indigo-700 hover:shadow-xl transition duration-200 flex items-center justify-center space-x-3 transform hover:-translate-y-1"
            >
              <Users className="h-6 w-6" />
              <span>Login with Canvas</span>
            </a>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or try Demonstration Mode</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleDemoLogin('TEACHER')}
                className="px-6 py-4 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition flex flex-col items-center justify-center space-y-2 group"
              >
                <div className="p-2 bg-indigo-100 rounded-full group-hover:bg-indigo-200 transition">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <span>Demo Teacher</span>
              </button>
              <button
                onClick={() => handleDemoLogin('STUDENT')}
                className="px-6 py-4 bg-white border-2 border-green-100 text-green-600 font-bold rounded-xl hover:bg-green-50 transition flex flex-col items-center justify-center space-y-2 group"
              >
                <div className="p-2 bg-green-100 rounded-full group-hover:bg-green-200 transition">
                  <Play className="w-6 h-6" />
                </div>
                <span>Demo Student</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">

      {/* Consent Modal */}
      <Modal
        isOpen={showConsentModal}
        onClose={() => handleConsentResponse(false)} // Auto-decline on close/X
        title="Research Consent"
        type="confirm"
        confirmText="I Consent"
        cancelText="I Decline"
        onConfirm={() => handleConsentResponse(true)}
      >
        <div className="space-y-4 text-sm text-gray-600">
          <p>Welcome to ThoughtSwap! This application is part of a research project on classroom interaction.</p>
          <p>By clicking "I Consent", you agree to allow your anonymized usage data (prompts, thoughts, interaction logs) to be used for research purposes.</p>
          <p>You can still use the application if you decline, but your data will be excluded from research analysis.</p>
        </div>
      </Modal>

      <header className="flex justify-between items-center py-4 px-6 bg-white shadow-md rounded-xl mb-8">
        <div className="flex items-center space-x-3">
          <Zap className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900">ThoughtSwap</h1>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-600">
            {authState.name} <span className="bg-gray-100 px-2 py-1 rounded text-xs ml-1 border border-gray-200">{authState.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 text-red-500 hover:text-red-700 transition"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {authState.role === 'TEACHER' ?
        <TeacherView auth={authState} /> :
        <StudentView
          auth={authState}
          onJoin={handleStudentJoin}
          joinCode={joinCode}
        />
      }
    </div>
  );
}

export default App;