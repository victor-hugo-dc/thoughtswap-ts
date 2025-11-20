import { useState, useEffect } from 'react';
import { socket } from './socket';
import StudentView from './components/StudentView';
import TeacherView from './components/TeacherView';
import { LogOut, Users, Zap, Bug } from 'lucide-react';

type UserRole = 'STUDENT' | 'TEACHER' | null;

interface AuthState {
  isLoggedIn: boolean;
  name: string | null;
  email: string | null;
  role: UserRole;
  expiry?: number; // Timestamp for session expiry
}

// 24 Hours in milliseconds
const SESSION_DURATION = 24 * 60 * 60 * 1000;

function App() {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const saved = localStorage.getItem('thoughtswap_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Check Expiry
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem('thoughtswap_auth');
        return { isLoggedIn: false, name: null, email: null, role: null };
      }
      return parsed;
    }
    return { isLoggedIn: false, name: null, email: null, role: null };
  });

  const [joinCode, setJoinCode] = useState('');

  const CANVAS_AUTH_URL = 'http://localhost:8000/accounts/canvas/login/';

  const updateAuth = (newState: AuthState) => {
    setAuthState(newState);
    if (newState.isLoggedIn) {
      // Add expiry if not present
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
    // 1. OAuth Callback
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

    // 2. Global Socket Listener for Session Invalidation
    // This handles the case where the server restarts/DB resets and the user is no longer valid
    const handleAuthError = () => {
      alert("Your session has expired or is invalid. Please log in again.");
      updateAuth({ isLoggedIn: false, name: null, email: null, role: null });
      socket.disconnect();
    };

    socket.on('AUTH_ERROR', handleAuthError);

    return () => {
      socket.off('AUTH_ERROR', handleAuthError);
    };
  }, []);

  const handleDevLogin = () => {
    updateAuth({
      isLoggedIn: true,
      name: "Dev Teacher",
      email: "teacher@dev.com",
      role: "TEACHER",
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
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-5xl font-extrabold text-indigo-700 mb-8 flex items-center">
          <Zap className="h-10 w-10 mr-3 text-yellow-500" /> ThoughtSwap
        </h1>
        <p className="text-xl text-gray-600 mb-10">Log in with your Canvas credentials to start.</p>

        <a
          href={CANVAS_AUTH_URL}
          className="px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-indigo-700 transition duration-200 flex items-center space-x-2 mb-4"
        >
          <Users className="h-6 w-6" />
          <span>Login with Canvas</span>
        </a>

        <button
          onClick={handleDevLogin}
          className="mt-8 px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition flex items-center"
        >
          <Bug className="w-5 h-5 mr-2" /> Dev Teacher Login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <header className="flex justify-between items-center py-4 px-6 bg-white shadow-md rounded-xl mb-8">
        <div className="flex items-center space-x-3">
          <Zap className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900">ThoughtSwap</h1>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-600">
            {authState.name} ({authState.role})
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