import { useState, useEffect } from 'react';
import { socket } from './socket';
import StudentView from './components/StudentView';
import TeacherView from './components/TeacherView';
import './App.css';

type UserRole = 'STUDENT' | 'TEACHER' | null;

interface AuthState {
  isLoggedIn: boolean;
  name: string | null;
  role: UserRole;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    name: null,
    role: null,
  });
  const [joinCode, setJoinCode] = useState('');

  // Get the base Canvas Auth URL from the Express server redirect endpoint
  const CANVAS_AUTH_URL = 'http://localhost:8000/accounts/canvas/login/';

  // --- OAuth Callback Handler ---
  useEffect(() => {
    // Check if the current URL is the successful redirect from the backend
    if (window.location.pathname === '/auth/success') {
      const params = new URLSearchParams(window.location.search);
      const name = params.get('name');
      const role = params.get('role') as UserRole;

      if (name && role) {
        setAuthState({
          isLoggedIn: true,
          name: name,
          role: role,
        });
      }

      // Clean up the URL state
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  // --- Student Join Logic (for authenticated students) ---
  const handleStudentJoin = () => {
    if (!joinCode.trim()) return alert('Please enter a room code.');

    // For a real app, the server would handle the auth check upon JOIN_ROOM
    socket.auth = {
      name: authState.name,
      role: authState.role,
      // In a real app, this would be a JWT/Session ID
    };
    socket.connect();

    // Emit join event with the code
    socket.emit('JOIN_ROOM', { joinCode });
  };

  if (!authState.isLoggedIn) {
    // Show the login screen
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', marginTop: '10vh' }}>
        <h1>⚡ ThoughtSwap</h1>
        <p>Please log in using your Canvas account to continue.</p>

        <a href={CANVAS_AUTH_URL} className="login-btn">
          Login with Canvas
        </a>
      </div>
    );
  }

  // If logged in, show the appropriate view
  return (
    <div className="App">
      <header className="auth-header">
        Logged in as: <strong>{authState.name}</strong> ({authState.role})
      </header>

      {authState.role === 'TEACHER' && <TeacherView />}

      {authState.role === 'STUDENT' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
          <h1>Student Dashboard</h1>
          <div className="card">
            <h3>Join a Course</h3>
            <input
              placeholder="Room Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: '10px', padding: '8px' }}
            />
            <button onClick={handleStudentJoin} style={{ width: '100%' }}>Join Room</button>
          </div>
          {/* Display StudentView only after successful join, for now it's just a button */}
          {joinCode && <StudentView joinCode={joinCode} />}
        </div>
      )}
    </div>
  );
}

export default App;